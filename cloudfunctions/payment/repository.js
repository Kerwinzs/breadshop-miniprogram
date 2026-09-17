function createCloudRepository(db) {
  const serverDate = () => db.serverDate()
  async function one(scope, collection, where) {
    const result = await scope.collection(collection).where(where).limit(1).get()
    return result.data && result.data[0]
  }
  async function restoreStockOnce(order, transaction, at) {
    if (order.stockReleasedAt) return false
    const quantities = (order.items || []).reduce((all, item) => { all[item.productId] = (all[item.productId] || 0) + Number(item.quantity || 0); return all }, {})
    for (const [productId, quantity] of Object.entries(quantities)) {
      const product = await one(transaction, 'products', { productId })
      if (product && Number.isInteger(product.stockQuantity)) await transaction.collection('products').doc(product._id).update({ data: { stockQuantity: product.stockQuantity + quantity, updatedAt: at } })
    }
    return true
  }
  return {
    getOrder: (orderNo) => one(db, 'orders', { orderNo }),
    getPayment: (outTradeNo) => one(db, 'paymentTransactions', { outTradeNo }),
    getRefund: (refundNo) => one(db, 'refunds', { refundNo }),
    async savePayment(record) {
      return db.runTransaction(async (transaction) => {
        const existing = await one(transaction, 'paymentTransactions', { outTradeNo: record.outTradeNo })
        if (existing) return existing
        const data = Object.assign({}, record, { createdAt: serverDate(), updatedAt: serverDate() })
        const added = await transaction.collection('paymentTransactions').add({ data })
        return Object.assign({ _id: added._id }, data)
      })
    },
    async recordPaymentEvent(event) {
      return db.runTransaction(async (transaction) => {
        const existing = await one(transaction, 'paymentEvents', { eventId: event.eventId })
        if (existing) return { duplicate: true }
        await transaction.collection('paymentEvents').add({ data: Object.assign({}, event, { createdAt: serverDate() }) })
        return { duplicate: false }
      })
    },
    async applyPaid(payload) {
      return db.runTransaction(async (transaction) => {
        const priorEvent = await one(transaction, 'paymentEvents', { eventId: payload.eventId })
        if (priorEvent) return { duplicate: true, paymentStatus: priorEvent.status === 'applied' ? 'paid' : 'pending' }
        const payment = await one(transaction, 'paymentTransactions', { outTradeNo: payload.outTradeNo })
        const order = payment && await one(transaction, 'orders', { orderNo: payment.orderNo })
        if (!payment || !order) throw Object.assign(new Error('支付记录不存在'), { code: 'PAYMENT_NOT_FOUND' })
        if (payment.amountFen !== payload.amountFen || order.payableAmountFen !== payload.amountFen) throw Object.assign(new Error('支付金额不一致'), { code: 'PAYMENT_AMOUNT_MISMATCH' })
        await transaction.collection('paymentEvents').add({ data: { eventId: payload.eventId, eventType: 'payment.success', outTradeNo: payload.outTradeNo, status: 'applied', createdAt: serverDate() } })
        if (order.paymentStatus !== 'paid') {
          await transaction.collection('paymentTransactions').doc(payment._id).update({ data: { status: 'paid', transactionId: payload.transactionId, paidAt: payload.paidAt, updatedAt: serverDate() } })
          await transaction.collection('orders').doc(order._id).update({ data: { paymentStatus: 'paid', paidAmountFen: payload.amountFen, paidAt: payload.paidAt, updatedAt: serverDate() } })
        }
        return { duplicate: order.paymentStatus === 'paid', paymentStatus: 'paid' }
      })
    },
    async closeExpiredAndReleaseStock({ orderNo, closedAt }) {
      return db.runTransaction(async (transaction) => {
        const order = await one(transaction, 'orders', { orderNo })
        if (!order) throw Object.assign(new Error('订单不存在'), { code: 'ORDER_NOT_FOUND' })
        if (order.paymentStatus !== 'pending') return { orderNo, paymentStatus: order.paymentStatus, duplicate: true }
        const released = await restoreStockOnce(order, transaction, closedAt)
        const update = { paymentStatus: 'closed', orderStatus: 'canceled', canceledAt: closedAt, updatedAt: serverDate() }
        if (released) update.stockReleasedAt = closedAt
        await transaction.collection('orders').doc(order._id).update({ data: update })
        const payment = await one(transaction, 'paymentTransactions', { outTradeNo: `P${orderNo}` })
        if (payment) await transaction.collection('paymentTransactions').doc(payment._id).update({ data: { status: 'closed', closedAt, updatedAt: serverDate() } })
        return { orderNo, paymentStatus: 'closed', orderStatus: 'canceled', duplicate: false }
      })
    },
    async markRefundProcessing(record) {
      return db.runTransaction(async (transaction) => {
        const refund = await one(transaction, 'refunds', { refundNo: record.refundNo })
        if (!refund) throw Object.assign(new Error('退款记录不存在'), { code: 'REFUND_NOT_FOUND' })
        await transaction.collection('refunds').doc(refund._id).update({ data: { status: 'processing', providerRefundId: record.providerRefundId, updatedAt: serverDate() } })
        return { refundNo: record.refundNo, status: 'processing' }
      })
    },
    async applyRefundResult(payload) {
      return db.runTransaction(async (transaction) => {
        const prior = await one(transaction, 'paymentEvents', { eventId: payload.eventId })
        if (prior) return { duplicate: true, refundStatus: prior.resultStatus }
        const refund = await one(transaction, 'refunds', { refundNo: payload.refundNo })
        if (!refund) throw Object.assign(new Error('退款记录不存在'), { code: 'REFUND_NOT_FOUND' })
        const order = await one(transaction, 'orders', { orderNo: refund.orderNo })
        const succeeded = payload.status === 'succeeded'
        const refundStatus = succeeded ? 'succeeded' : 'failed'
        await transaction.collection('paymentEvents').add({ data: { eventId: payload.eventId, eventType: 'refund.result', refundNo: payload.refundNo, resultStatus: refundStatus, status: 'applied', createdAt: serverDate() } })
        await transaction.collection('refunds').doc(refund._id).update({ data: { status: refundStatus, failureReason: succeeded ? '' : payload.failureReason, completedAt: payload.completedAt, updatedAt: serverDate() } })
        await transaction.collection('orders').doc(order._id).update({ data: { refundStatus, refundedAmountFen: succeeded ? refund.amountFen : Number(order.refundedAmountFen || 0), updatedAt: serverDate() } })
        return { duplicate: false, refundStatus }
      })
    }
  }
}

module.exports = { createCloudRepository }
