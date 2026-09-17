const test = require('node:test')
const assert = require('node:assert/strict')
const { createPaymentWorker } = require('../cloudfunctions/payment/worker-domain')

function fixture() {
  const state = {
    expired: [], pending: [], refunds: [], processingRefunds: [], releases: new Map(), paid: new Set(), processing: new Set(), failures: [], appliedRefunds: [],
    query: new Map(), refundQuery: new Map(), querySequence: new Map(), closeFailures: new Set(), refundFailures: new Set(), closeCalls: [], refundCalls: []
  }
  const repository = {
    async listExpiredOrders({ limit }) { return state.expired.slice(0, limit) },
    async listPendingPayments({ limit }) { return state.pending.slice(0, limit) },
    async listRetryableRefunds({ limit }) { return state.refunds.slice(0, limit) },
    async listProcessingRefunds({ limit }) { return state.processingRefunds.slice(0, limit) },
    async getRefund(refundNo) { return state.refunds.find((item) => item.refundNo === refundNo) || null },
    async applyPaid(value) { state.paid.add(value.outTradeNo); return { paymentStatus: 'paid', duplicate: state.paid.size === 1 ? false : true } },
    async closeExpiredAndReleaseStock({ orderNo }) {
      if (state.paid.has(`P${orderNo}`)) return { paymentStatus: 'paid', duplicate: true }
      state.releases.set(orderNo, (state.releases.get(orderNo) || 0) + (state.releases.has(orderNo) ? 0 : 1))
      return { paymentStatus: 'closed', duplicate: state.releases.has(orderNo) && state.releases.get(orderNo) > 1 }
    },
    async markRefundProcessing({ refundNo }) { state.processing.add(refundNo); return { refundNo, status: 'processing' } },
    async applyRefundResult(value) { state.appliedRefunds.push(value); return { refundStatus: value.status } },
    async recordWorkerFailure(value) { state.failures.push(value) }
  }
  const provider = {
    async queryPayment({ outTradeNo }) {
      const sequence = state.querySequence.get(outTradeNo)
      const value = sequence && sequence.length ? sequence.shift() : state.query.get(outTradeNo)
      if (value instanceof Error) throw value
      return value || { tradeState: 'NOTPAY' }
    },
    async closePayment({ outTradeNo }) { state.closeCalls.push(outTradeNo); if (state.closeFailures.has(outTradeNo)) throw Object.assign(new Error('close failed'), { code: 'CHANNEL_CLOSE_FAILED' }) },
    async createRefund({ refundNo }) { state.refundCalls.push(refundNo); if (state.refundFailures.has(refundNo)) throw Object.assign(new Error('refund failed'), { code: 'CHANNEL_REFUND_FAILED' }); return { providerRefundId: `wx-${refundNo}` } }
    ,async queryRefund({ refundNo }) { return state.refundQuery.get(refundNo) || { out_refund_no: refundNo, status: 'PROCESSING', amount: { refund: 1, total: 1 } } }
  }
  const logs = []
  const logger = { info(value) { logs.push(value) }, error(value) { logs.push(value) } }
  return { state, repository, provider, logs, worker: createPaymentWorker({ repository, provider, logger, batchSize: 2, now: () => new Date('2026-09-03T01:00:00Z') }) }
}

test('expired scan respects batch limit and closes NOTPAY orders', async () => {
  const f = fixture()
  f.state.expired.push({ orderNo: 'B1' }, { orderNo: 'B2' }, { orderNo: 'B3' })
  const result = await f.worker.closeExpiredPayments()
  assert.deepEqual({ scanned: result.scanned, succeeded: result.succeeded }, { scanned: 2, succeeded: 2 })
  assert.deepEqual(f.state.closeCalls, ['PB1', 'PB2'])
  assert.equal(f.state.releases.get('B1'), 1)
})

test('repeated expiry execution relies on idempotent repository stock release', async () => {
  const f = fixture()
  f.state.expired.push({ orderNo: 'B1' })
  await f.worker.closeExpiredPayments()
  await f.worker.closeExpiredPayments()
  assert.equal(f.state.releases.get('B1'), 1)
})

test('one item failure is isolated and schedules retry without leaking identifier', async () => {
  const f = fixture()
  f.state.expired.push({ orderNo: 'SECRET-ORDER-1' }, { orderNo: 'B2' })
  f.state.closeFailures.add('PSECRET-ORDER-1')
  const result = await f.worker.closeExpiredPayments()
  assert.equal(result.failed, 1)
  assert.equal(result.succeeded, 1)
  assert.equal(f.state.failures.length, 1)
  assert.ok(f.state.failures[0].nextRetryAt > new Date('2026-09-03T01:00:00Z'))
  assert.equal(JSON.stringify(f.logs).includes('SECRET-ORDER-1'), false)
})

test('pending and explicitly retried failed refunds are submitted and marked processing', async () => {
  const f = fixture()
  f.state.refunds.push({ refundNo: 'RB1', orderNo: 'B1', amountFen: 100, status: 'pending' }, { refundNo: 'RB2', orderNo: 'B2', amountFen: 200, status: 'failed', retryRequestedAt: new Date() })
  const result = await f.worker.processRefunds()
  assert.equal(result.succeeded, 2)
  assert.deepEqual([...f.state.processing], ['RB1', 'RB2'])
  assert.deepEqual(f.state.refundCalls, ['RB1', 'RB2'])
})

test('refund failure remains retryable and does not block later refund', async () => {
  const f = fixture()
  f.state.refunds.push({ refundNo: 'RB1', orderNo: 'B1', amountFen: 100, status: 'pending' }, { refundNo: 'RB2', orderNo: 'B2', amountFen: 200, status: 'pending' })
  f.state.refundFailures.add('RB1')
  const result = await f.worker.processRefunds()
  assert.deepEqual({ succeeded: result.succeeded, failed: result.failed }, { succeeded: 1, failed: 1 })
  assert.deepEqual([...f.state.processing], ['RB2'])
  assert.equal(f.state.failures[0].errorCode, 'CHANNEL_REFUND_FAILED')
})

test('refund reconciliation applies successful channel result', async () => {
  const f = fixture()
  f.state.processingRefunds.push({ refundNo: 'RB100001', orderNo: 'B100001', amountFen: 100, totalFen: 100 })
  f.state.refundQuery.set('RB100001', { out_refund_no: 'RB100001', status: 'SUCCESS', success_time: '2026-09-12T01:00:00+08:00', amount: { refund: 100, total: 100 } })
  const result = await f.worker.reconcileRefunds()
  assert.equal(result.succeeded, 1)
  assert.equal(f.state.appliedRefunds[0].status, 'succeeded')
})

test('refund reconciliation rejects mismatched amount without changing financial state', async () => {
  const f = fixture()
  f.state.processingRefunds.push({ refundNo: 'RB100001', orderNo: 'B100001', amountFen: 100, totalFen: 100 })
  f.state.refundQuery.set('RB100001', { out_refund_no: 'RB100001', status: 'SUCCESS', amount: { refund: 1, total: 100 } })
  const result = await f.worker.reconcileRefunds()
  assert.equal(result.failed, 1)
  assert.equal(f.state.appliedRefunds.length, 0)
  assert.equal(f.state.failures[0].errorCode, 'REFUND_QUERY_MISMATCH')
})

test('single refund action processes only the exact pending refund', async () => {
  const f = fixture()
  f.state.refunds.push({ refundNo: 'RB100001', orderNo: 'B100001', amountFen: 1, status: 'pending' }, { refundNo: 'RB200002', orderNo: 'B200002', amountFen: 2, status: 'pending' })
  const result = await f.worker.processRefund('RB100001')
  assert.deepEqual({ scanned: result.scanned, succeeded: result.succeeded, failed: result.failed }, { scanned: 1, succeeded: 1, failed: 0 })
  assert.deepEqual(f.state.refundCalls, ['RB100001'])
  await assert.rejects(() => f.worker.processRefund('bad'), (error) => error.code === 'INVALID_REFUND_TARGET')
})

test('single refund failure returns and records a bounded safe error message', async () => {
  const f = fixture()
  f.state.refunds.push({ refundNo: 'RB100001', orderNo: 'B100001', amountFen: 1, status: 'pending' })
  f.provider.createRefund = async () => { throw Object.assign(new Error('invalid parameter\n'.repeat(30)), { code: 'WECHATPAY_API_INVALID_REQUEST' }) }
  const result = await f.worker.processRefund('RB100001')
  assert.equal(result.failed, 1)
  assert.equal(result.items[0].code, 'WECHATPAY_API_INVALID_REQUEST')
  assert.ok(result.items[0].message.length <= 160)
  assert.equal(result.items[0].message.includes('\n'), false)
  assert.equal(f.state.failures[0].kind, 'refund.create.one')
  assert.equal(f.state.failures[0].errorMessage, result.items[0].message)
})

test('active reconciliation applies SUCCESS and leaves NOTPAY pending', async () => {
  const f = fixture()
  f.state.pending.push({ orderNo: 'B1', outTradeNo: 'PB1' }, { orderNo: 'B2', outTradeNo: 'PB2' })
  f.state.query.set('PB1', { tradeState: 'SUCCESS', transactionId: 'wx1', amountFen: 100 })
  const result = await f.worker.reconcilePayments()
  assert.equal(result.succeeded, 2)
  assert.equal(f.state.paid.has('PB1'), true)
  assert.equal(f.state.paid.has('PB2'), false)
})

test('late SUCCESS discovered during expiry wins over close and stock release', async () => {
  const f = fixture()
  f.state.expired.push({ orderNo: 'B1', outTradeNo: 'PB1' })
  f.state.query.set('PB1', { tradeState: 'SUCCESS', transactionId: 'wx-late', amountFen: 100 })
  await f.worker.closeExpiredPayments()
  assert.equal(f.state.paid.has('PB1'), true)
  assert.equal(f.state.closeCalls.length, 0)
  assert.equal(f.state.releases.has('B1'), false)
})

test('SUCCESS racing with channel close wins after post-close confirmation', async () => {
  const f = fixture()
  f.state.expired.push({ orderNo: 'B1', outTradeNo: 'PB1' })
  f.state.querySequence.set('PB1', [{ tradeState: 'NOTPAY' }, { tradeState: 'SUCCESS', transactionId: 'wx-race', amountFen: 100 }])
  await f.worker.closeExpiredPayments()
  assert.deepEqual(f.state.closeCalls, ['PB1'])
  assert.equal(f.state.paid.has('PB1'), true)
  assert.equal(f.state.releases.has('B1'), false)
})

test('channel CLOSED is applied locally without redundant close call', async () => {
  const f = fixture()
  f.state.expired.push({ orderNo: 'B1', outTradeNo: 'PB1' })
  f.state.query.set('PB1', { tradeState: 'CLOSED' })
  await f.worker.closeExpiredPayments()
  assert.equal(f.state.closeCalls.length, 0)
  assert.equal(f.state.releases.get('B1'), 1)
})

test('unexpected channel state never releases stock and is scheduled for retry', async () => {
  const f = fixture()
  f.state.expired.push({ orderNo: 'B1', outTradeNo: 'PB1' })
  f.state.query.set('PB1', { tradeState: 'PAYERROR' })
  const result = await f.worker.closeExpiredPayments()
  assert.equal(result.failed, 1)
  assert.equal(f.state.releases.has('B1'), false)
  assert.equal(f.state.failures[0].errorCode, 'PAYMENT_CHANNEL_STATE_UNEXPECTED')
})
