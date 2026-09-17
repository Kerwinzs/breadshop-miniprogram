const test = require('node:test')
const assert = require('node:assert/strict')
const { createPaymentService, PaymentError } = require('../cloudfunctions/payment/domain')
const { createWechatPayProvider } = require('../cloudfunctions/payment/provider')

function fixture(overrides = {}) {
  const order = Object.assign({ orderNo: 'B100', ownerOpenId: 'user-1', orderStatus: 'placed', paymentRequired: true, paymentStatus: 'pending', refundStatus: 'none', payableAmountFen: 3200, paidAmountFen: 0, refundedAmountFen: 0, paymentExpiresAt: new Date('2026-09-03T00:15:00Z'), stockReleasedAt: null }, overrides)
  const state = { order, payments: new Map(), refunds: new Map(), events: new Map(), stockReleaseCount: 0 }
  const repository = {
    async getOrder(no) { return no === state.order.orderNo ? state.order : null },
    async getPayment(no) { return state.payments.get(no) || null },
    async savePayment(record) { if (!state.payments.has(record.outTradeNo)) state.payments.set(record.outTradeNo, record); return state.payments.get(record.outTradeNo) },
    async recordPaymentEvent(event) { if (state.events.has(event.eventId)) return { duplicate: true }; state.events.set(event.eventId, event); return { duplicate: false } },
    async applyPaid(payload) {
      if (state.events.has(payload.eventId)) return { duplicate: true, paymentStatus: 'paid' }
      state.events.set(payload.eventId, payload); state.order.paymentStatus = 'paid'; state.order.paidAmountFen = payload.amountFen
      return { duplicate: false, paymentStatus: 'paid' }
    },
    async closeExpiredAndReleaseStock({ closedAt }) {
      if (state.order.paymentStatus !== 'pending') return { paymentStatus: state.order.paymentStatus, duplicate: true }
      if (!state.order.stockReleasedAt) { state.order.stockReleasedAt = closedAt; state.stockReleaseCount += 1 }
      state.order.paymentStatus = 'closed'; state.order.orderStatus = 'canceled'
      return { paymentStatus: 'closed', duplicate: false }
    },
    async getRefund(no) { return state.refunds.get(no) || null },
    async markRefundProcessing(record) { const refund = state.refunds.get(record.refundNo); refund.status = 'processing'; return refund },
    async applyRefundResult(payload) {
      if (state.events.has(payload.eventId)) return { duplicate: true, refundStatus: state.order.refundStatus }
      state.events.set(payload.eventId, payload); state.order.refundStatus = payload.status === 'succeeded' ? 'succeeded' : 'failed'
      if (payload.status === 'succeeded') state.order.refundedAmountFen = state.refunds.get(payload.refundNo).amountFen
      return { duplicate: false, refundStatus: state.order.refundStatus }
    }
  }
  const provider = {
    closeCalls: 0,
    async createPrepay({ outTradeNo }) { return { timeStamp: '1', nonceStr: 'n', package: `prepay_id=${outTradeNo}`, signType: 'RSA', paySign: 'fake' } },
    async verifyPaymentNotification(value) { return value },
    async closePayment() { this.closeCalls += 1 },
    async createRefund() { return { providerRefundId: 'wx-refund' } },
    async verifyRefundNotification(value) { return value }
  }
  const service = createPaymentService({ repository, provider, now: () => new Date('2026-09-03T00:20:00Z') })
  return { state, repository, provider, service }
}

test('missing WeChat Pay configuration fails closed', async () => {
  const provider = createWechatPayProvider({ env: {} })
  await assert.rejects(() => provider.createPrepay({}), (error) => error.code === 'PAYMENT_NOT_CONFIGURED')
})

test('duplicate payment notification changes financial fact only once', async () => {
  const f = fixture({ paymentExpiresAt: new Date('2026-09-03T00:30:00Z') })
  await f.service.createPrepay({ ownerOpenId: 'user-1', orderNo: 'B100' })
  const notification = { eventId: 'evt-pay-1', outTradeNo: 'PB100', transactionId: 'wx-1', amountFen: 3200 }
  assert.deepEqual(await f.service.handlePaymentNotification(notification), { duplicate: false, paymentStatus: 'paid' })
  assert.deepEqual(await f.service.handlePaymentNotification(notification), { duplicate: true, paymentStatus: 'paid' })
  assert.equal(f.state.events.size, 1)
  assert.equal(f.state.order.paidAmountFen, 3200)
})

test('amount mismatch is rejected and never marks order paid', async () => {
  const f = fixture({ paymentExpiresAt: new Date('2026-09-03T00:30:00Z') })
  await f.service.createPrepay({ ownerOpenId: 'user-1', orderNo: 'B100' })
  await assert.rejects(() => f.service.handlePaymentNotification({ eventId: 'evt-bad', outTradeNo: 'PB100', amountFen: 1 }), (error) => error instanceof PaymentError && error.code === 'PAYMENT_AMOUNT_MISMATCH')
  assert.equal(f.state.order.paymentStatus, 'pending')
  assert.equal(f.state.events.get('evt-bad').status, 'rejected_amount_mismatch')
})

test('expired payment closes order and releases stock exactly once', async () => {
  const f = fixture()
  await f.service.closeExpired({ orderNo: 'B100' })
  await f.service.closeExpired({ orderNo: 'B100' })
  assert.equal(f.state.order.paymentStatus, 'closed')
  assert.equal(f.state.order.orderStatus, 'canceled')
  assert.equal(f.state.stockReleaseCount, 1)
  assert.equal(f.provider.closeCalls, 1)
})

test('failed refund is an independent fact and payment remains paid', async () => {
  const f = fixture({ orderStatus: 'canceled', paymentStatus: 'paid', refundStatus: 'pending', paidAmountFen: 3200 })
  f.state.refunds.set('RB100', { refundNo: 'RB100', orderNo: 'B100', amountFen: 3200, status: 'pending' })
  await f.service.requestRefund({ orderNo: 'B100' })
  const result = await f.service.handleRefundNotification({ eventId: 'evt-refund-fail', refundNo: 'RB100', outTradeNo: 'PB100', amountFen: 3200, totalFen: 3200, status: 'failed', failureReason: 'channel rejected' })
  assert.equal(result.refundStatus, 'failed')
  assert.equal(f.state.order.paymentStatus, 'paid')
  assert.equal(f.state.order.refundedAmountFen, 0)
})

test('refund callback amount mismatch never changes refund fact', async () => {
  const f = fixture({ orderStatus: 'canceled', paymentStatus: 'paid', refundStatus: 'pending', paidAmountFen: 3200 })
  f.state.refunds.set('RB100', { refundNo: 'RB100', orderNo: 'B100', amountFen: 3200, totalFen: 3200, status: 'processing' })
  await assert.rejects(() => f.service.handleRefundNotification({ eventId: 'evt-refund-bad', refundNo: 'RB100', outTradeNo: 'PB100', amountFen: 1, totalFen: 3200, status: 'succeeded' }), (error) => error.code === 'PAYMENT_AMOUNT_MISMATCH')
  assert.equal(f.state.order.refundStatus, 'pending')
  assert.equal(f.state.events.get('evt-refund-bad').status, 'rejected_amount_mismatch')
})
