const crypto = require('crypto')

const PAYMENT_TTL_SECONDS = 15 * 60

class PaymentError extends Error {
  constructor(code, message) { super(message); this.code = code }
}

function assertOrderPayable(order, ownerOpenId, currentTime = new Date()) {
  if (!order || (ownerOpenId && order.ownerOpenId !== ownerOpenId)) throw new PaymentError('ORDER_NOT_FOUND', '订单不存在')
  if (order.paymentRequired !== true) throw new PaymentError('ORDER_CANNOT_PAY', '该历史订单无需支付')
  if (order.orderStatus !== 'placed') throw new PaymentError('ORDER_CANNOT_PAY', '当前订单不可支付')
  if (order.paymentStatus !== 'pending') throw new PaymentError('ORDER_CANNOT_PAY', '当前订单不可支付')
  if (new Date(order.paymentExpiresAt).getTime() <= currentTime.getTime()) throw new PaymentError('PAYMENT_EXPIRED', '订单支付时间已过期')
}

function ids(orderNo) {
  return { outTradeNo: `P${orderNo}`, refundNo: `R${orderNo}` }
}

function createPaymentService({ repository, provider, now = () => new Date() }) {
  if (!repository || !provider) throw new Error('repository and provider are required')

  return {
    async createPrepay({ ownerOpenId, orderNo }) {
      const order = await repository.getOrder(orderNo)
      if (order && order.ownerOpenId === ownerOpenId && order.paymentStatus === 'paid') return { outTradeNo: ids(order.orderNo).outTradeNo, prepayPayload: null, duplicate: true }
      assertOrderPayable(order, ownerOpenId, now())
      const { outTradeNo } = ids(order.orderNo)
      const existing = await repository.getPayment(outTradeNo)
      if (existing && existing.prepayPayload && existing.status === 'pending') return { outTradeNo, prepayPayload: existing.prepayPayload, duplicate: true }
      const request = { outTradeNo, description: `面包坊订单 ${order.orderNo}`, amountFen: order.payableAmountFen, payerOpenId: ownerOpenId, notifyKey: outTradeNo }
      // Provider I/O deliberately happens outside repository transactions.
      const prepayPayload = await provider.createPrepay(request)
      await repository.savePayment({ outTradeNo, orderNo: order.orderNo, ownerOpenId, amountFen: order.payableAmountFen, status: 'pending', prepayPayload, createdAt: now(), updatedAt: now() })
      return { outTradeNo, prepayPayload, duplicate: false }
    },

    async handlePaymentNotification(notification) {
      const verified = await provider.verifyPaymentNotification(notification)
      if (!verified || !verified.eventId || !verified.outTradeNo) throw new PaymentError('INVALID_PAYMENT_NOTIFICATION', '支付通知无效')
      const payment = await repository.getPayment(verified.outTradeNo)
      if (!payment) throw new PaymentError('PAYMENT_NOT_FOUND', '支付记录不存在')
      if (verified.amountFen !== payment.amountFen) {
        await repository.recordPaymentEvent({ eventId: verified.eventId, eventType: 'payment.success', outTradeNo: verified.outTradeNo, status: 'rejected_amount_mismatch', receivedAt: now() })
        throw new PaymentError('PAYMENT_AMOUNT_MISMATCH', '支付金额不一致')
      }
      return repository.applyPaid({ eventId: verified.eventId, outTradeNo: verified.outTradeNo, transactionId: verified.transactionId, amountFen: verified.amountFen, paidAt: verified.paidAt || now() })
    },

    async queryPayment({ ownerOpenId, orderNo }) {
      const order = await repository.getOrder(orderNo)
      if (!order || order.ownerOpenId !== ownerOpenId) throw new PaymentError('ORDER_NOT_FOUND', '订单不存在')
      const payment = await repository.getPayment(ids(orderNo).outTradeNo)
      return {
        orderNo,
        order: { orderNo, orderStatus: order.orderStatus, paymentStatus: order.paymentStatus, refundStatus: order.refundStatus || 'none', payableAmountFen: order.payableAmountFen, paidAmountFen: order.paidAmountFen || 0, refundedAmountFen: order.refundedAmountFen || 0, paymentExpiresAt: order.paymentExpiresAt, paidAt: order.paidAt || null },
        payment: payment ? { outTradeNo: payment.outTradeNo, status: payment.status, amountFen: payment.amountFen, paidAt: payment.paidAt || null, closedAt: payment.closedAt || null } : null,
        paymentStatus: order.paymentStatus,
        refundStatus: order.refundStatus || 'none',
        payableAmountFen: order.payableAmountFen,
        paidAmountFen: order.paidAmountFen || 0,
        refundedAmountFen: order.refundedAmountFen || 0,
        paymentExpiresAt: order.paymentExpiresAt
      }
    },

    async closeExpired({ orderNo }) {
      const order = await repository.getOrder(orderNo)
      if (!order) throw new PaymentError('ORDER_NOT_FOUND', '订单不存在')
      if (order.paymentStatus !== 'pending') return { orderNo, paymentStatus: order.paymentStatus, duplicate: true }
      if (new Date(order.paymentExpiresAt).getTime() > now().getTime()) throw new PaymentError('PAYMENT_NOT_EXPIRED', '订单尚未超过支付时限')
      // Closing the channel order is idempotent by the stable outTradeNo.
      await provider.closePayment({ outTradeNo: ids(orderNo).outTradeNo })
      return repository.closeExpiredAndReleaseStock({ orderNo, closedAt: now() })
    },

    async requestRefund({ orderNo }) {
      const order = await repository.getOrder(orderNo)
      if (!order) throw new PaymentError('ORDER_NOT_FOUND', '订单不存在')
      if (order.orderStatus !== 'canceled' || order.paymentStatus !== 'paid' || order.refundStatus !== 'pending') throw new PaymentError('REFUND_NOT_ALLOWED', '当前订单不可退款')
      const { outTradeNo, refundNo } = ids(orderNo)
      const existing = await repository.getRefund(refundNo)
      if (existing && ['processing', 'succeeded'].includes(existing.status)) return { refundNo, status: existing.status, duplicate: true }
      const amountFen = order.paidAmountFen || order.payableAmountFen
      // Provider I/O is not enclosed in a database transaction.
      const result = await provider.createRefund({ outTradeNo, refundNo, amountFen, totalFen: order.payableAmountFen, notifyKey: refundNo })
      await repository.markRefundProcessing({ refundNo, orderNo, amountFen, providerRefundId: result.providerRefundId || null, updatedAt: now() })
      return { refundNo, status: 'processing', duplicate: false }
    },

    async handleRefundNotification(notification) {
      const verified = await provider.verifyRefundNotification(notification)
      if (!verified || !verified.eventId || !verified.refundNo) throw new PaymentError('INVALID_REFUND_NOTIFICATION', '退款通知无效')
      const refund = await repository.getRefund(verified.refundNo)
      if (!refund) throw new PaymentError('REFUND_NOT_FOUND', '退款记录不存在')
      const expectedOutTradeNo = ids(refund.orderNo).outTradeNo
      if (verified.amountFen !== refund.amountFen || (verified.outTradeNo && verified.outTradeNo !== expectedOutTradeNo) ||
        (Number.isSafeInteger(verified.totalFen) && Number.isSafeInteger(refund.totalFen) && verified.totalFen !== refund.totalFen)) {
        await repository.recordPaymentEvent({ eventId: verified.eventId, eventType: 'refund.result', refundNo: verified.refundNo, status: 'rejected_amount_mismatch', receivedAt: now() })
        throw new PaymentError('PAYMENT_AMOUNT_MISMATCH', '退款金额或订单不一致')
      }
      return repository.applyRefundResult({ eventId: verified.eventId, refundNo: verified.refundNo, status: verified.status, failureReason: verified.failureReason || '', completedAt: verified.completedAt || now() })
    }
  }
}

function stableEventDigest(value) { return crypto.createHash('sha256').update(String(value)).digest('hex') }

module.exports = { PAYMENT_TTL_SECONDS, PaymentError, createPaymentService, ids, stableEventDigest }
