const crypto = require('crypto')
function safeId(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12) }
function channelState(result) { return String(result && (result.tradeState || result.status) || '').toUpperCase() }
function retryAt(now, attempts) { return new Date(now.getTime() + Math.min(60, 2 ** Math.min(attempts, 10)) * 60000) }
function safeErrorMessage(error) { return String(error && error.message || '').replace(/[\r\n]+/g, ' ').slice(0, 160) }
function createPaymentWorker({ repository, provider, now = () => new Date(), logger = console, batchSize = 20 }) {
  if (!repository || !provider) throw new Error('repository and provider are required')
  const log = (level, event, subject, extra = {}) => (logger[level] || logger.log).call(logger, Object.assign({ scope: 'payment-worker', event, subject: safeId(subject) }, extra))
  async function isolated(kind, rows, handler) {
    const result = { scanned: rows.length, succeeded: 0, failed: 0, items: [] }
    for (const row of rows) {
      const subject = row.orderNo || row.refundNo || row.outTradeNo
      try { const value = await handler(row); result.succeeded += 1; result.items.push({ subject: safeId(subject), ok: true, result: value }); log('info', `${kind}.succeeded`, subject) }
      catch (error) { const message = safeErrorMessage(error); result.failed += 1; result.items.push({ subject: safeId(subject), ok: false, code: error.code || 'WORKER_ITEM_FAILED', message }); if (repository.recordWorkerFailure) await repository.recordWorkerFailure({ kind, row, errorCode: error.code || 'WORKER_ITEM_FAILED', errorMessage: message, nextRetryAt: retryAt(now(), Number(row.attemptCount || 0) + 1), at: now() }); log('error', `${kind}.failed`, subject, { code: error.code || 'WORKER_ITEM_FAILED' }) }
    }
    return result
  }
  async function applyQuery(row, queried, source) {
    const status = channelState(queried)
    if (status === 'SUCCESS') return repository.applyPaid({ eventId: `query:${row.outTradeNo}:${queried.transactionId || 'unknown'}`, outTradeNo: row.outTradeNo, transactionId: queried.transactionId || '', amountFen: queried.amountFen, paidAt: queried.paidAt || now(), source })
    if (status === 'CLOSED') return repository.closeExpiredAndReleaseStock({ orderNo: row.orderNo, closedAt: now(), source })
    return { paymentStatus: 'pending', channelStatus: status || 'UNKNOWN' }
  }
  async function submitRefund(refund) {
    const retryable = refund && (refund.status === 'pending' || (refund.status === 'failed' && refund.retryRequestedAt))
    if (!retryable || !Number.isSafeInteger(refund.amountFen) || refund.amountFen <= 0) {
      throw Object.assign(new Error('退款请求当前不可处理'), { code: 'REFUND_NOT_PROCESSABLE' })
    }
    const result = await provider.createRefund({ outTradeNo: refund.outTradeNo || `P${refund.orderNo}`, refundNo: refund.refundNo, amountFen: refund.amountFen, totalFen: refund.totalFen || refund.amountFen, notifyKey: refund.refundNo })
    return repository.markRefundProcessing({ refundNo: refund.refundNo, orderNo: refund.orderNo, amountFen: refund.amountFen, providerRefundId: result.providerRefundId || null, updatedAt: now() })
  }
  async function applyRefundQuery(refund, queried) {
    const status = channelState(queried)
    const queriedRefundNo = queried && queried.out_refund_no
    const queriedAmount = queried && queried.amount
    if (queriedRefundNo !== refund.refundNo || !queriedAmount || queriedAmount.refund !== refund.amountFen || queriedAmount.total !== (refund.totalFen || refund.amountFen)) {
      throw Object.assign(new Error('微信退款查询结果与本地退款记录不一致'), { code: 'REFUND_QUERY_MISMATCH' })
    }
    if (status === 'SUCCESS') {
      return repository.applyRefundResult({
        eventId: `refund-query:${refund.refundNo}:SUCCESS`,
        refundNo: refund.refundNo,
        status: 'succeeded',
        failureReason: '',
        completedAt: queried.success_time || now()
      })
    }
    if (status === 'CLOSED' || status === 'ABNORMAL') {
      return repository.applyRefundResult({
        eventId: `refund-query:${refund.refundNo}:${status}`,
        refundNo: refund.refundNo,
        status: 'failed',
        failureReason: status,
        completedAt: now()
      })
    }
    if (status === 'PROCESSING') return { refundStatus: 'pending', channelStatus: status }
    throw Object.assign(new Error('微信退款状态无法识别'), { code: 'REFUND_CHANNEL_STATE_UNEXPECTED' })
  }
  return {
    async reconcilePayments() { const rows = await repository.listPendingPayments({ now: now(), limit: batchSize }); return isolated('payment.query', rows, async (row) => applyQuery(row, await provider.queryPayment({ outTradeNo: row.outTradeNo }), 'active_query')) },
    async closeExpiredPayments() {
      const rows = await repository.listExpiredOrders({ now: now(), limit: batchSize })
      return isolated('payment.expire', rows, async (row) => {
        const outTradeNo = row.outTradeNo || `P${row.orderNo}`, queried = await provider.queryPayment({ outTradeNo }), status = channelState(queried)
        if (status === 'SUCCESS') return applyQuery(Object.assign({}, row, { outTradeNo }), queried, 'expiry_query')
        if (status === 'CLOSED') return repository.closeExpiredAndReleaseStock({ orderNo: row.orderNo, closedAt: now(), source: 'expiry_query' })
        if (!['NOTPAY', 'USERPAYING'].includes(status)) throw Object.assign(new Error('渠道支付状态无法安全关单'), { code: 'PAYMENT_CHANNEL_STATE_UNEXPECTED' })
        await provider.closePayment({ outTradeNo })
        const confirmed = await provider.queryPayment({ outTradeNo }), confirmedStatus = channelState(confirmed)
        if (confirmedStatus === 'SUCCESS') return applyQuery(Object.assign({}, row, { outTradeNo }), confirmed, 'post_close_query')
        if (!['CLOSED', 'NOTPAY'].includes(confirmedStatus)) throw Object.assign(new Error('渠道关单状态尚未确认'), { code: 'PAYMENT_CLOSE_UNCONFIRMED' })
        return repository.closeExpiredAndReleaseStock({ orderNo: row.orderNo, closedAt: now(), source: 'expiry_close' })
      })
    },
    async processRefunds() { const rows = await repository.listRetryableRefunds({ now: now(), limit: batchSize }); return isolated('refund.create', rows, submitRefund) },
    async reconcileRefunds() {
      const rows = await repository.listProcessingRefunds({ now: now(), limit: batchSize })
      return isolated('refund.query', rows, async (refund) => applyRefundQuery(refund, await provider.queryRefund({ refundNo: refund.refundNo })))
    },
    async processRefund(refundNo) {
      if (!/^R[A-Za-z0-9_-]{6,64}$/.test(String(refundNo || '')) || typeof repository.getRefund !== 'function') throw Object.assign(new Error('退款标识无效'), { code: 'INVALID_REFUND_TARGET' })
      const refund = await repository.getRefund(refundNo)
      return isolated('refund.create.one', refund ? [refund] : [], submitRefund)
    },
    async runAll() {
      const refunds = await this.processRefunds()
      return { reconciliation: await this.reconcilePayments(), expiry: await this.closeExpiredPayments(), refunds, refundReconciliation: await this.reconcileRefunds() }
    }
  }
}
module.exports = { createPaymentWorker, safeId }
