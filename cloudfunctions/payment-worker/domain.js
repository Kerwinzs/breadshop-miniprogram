const crypto = require('crypto')

function safeId(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12) }
function channelState(result) { return String(result && (result.tradeState || result.status) || '').toUpperCase() }
function retryAt(now, attempts) { return new Date(now.getTime() + Math.min(60, 2 ** Math.min(attempts, 10)) * 60 * 1000) }

function createPaymentWorker({ repository, provider, now = () => new Date(), logger = console, batchSize = 20 }) {
  if (!repository || !provider) throw new Error('repository and provider are required')
  const log = (level, event, subject, extra = {}) => {
    const record = Object.assign({ scope: 'payment-worker', event, subject: safeId(subject) }, extra)
    const fn = logger[level] || logger.log
    fn.call(logger, record)
  }
  async function isolated(kind, rows, handler) {
    const result = { scanned: rows.length, succeeded: 0, failed: 0, items: [] }
    for (const row of rows) {
      const subject = row.orderNo || row.refundNo || row.outTradeNo
      try {
        const value = await handler(row)
        result.succeeded += 1
        result.items.push({ subject: safeId(subject), ok: true, result: value })
        log('info', `${kind}.succeeded`, subject)
      } catch (error) {
        result.failed += 1
        result.items.push({ subject: safeId(subject), ok: false, code: error.code || 'WORKER_ITEM_FAILED' })
        if (repository.recordWorkerFailure) await repository.recordWorkerFailure({ kind, row, errorCode: error.code || 'WORKER_ITEM_FAILED', nextRetryAt: retryAt(now(), Number(row.attemptCount || 0) + 1), at: now() })
        log('error', `${kind}.failed`, subject, { code: error.code || 'WORKER_ITEM_FAILED' })
      }
    }
    return result
  }
  async function applyQuery(row, queried, source) {
    const status = channelState(queried)
    if (status === 'SUCCESS') {
      return repository.applyPaid({ eventId: `query:${row.outTradeNo}:${queried.transactionId || 'unknown'}`, outTradeNo: row.outTradeNo, transactionId: queried.transactionId || '', amountFen: queried.amountFen, paidAt: queried.paidAt || now(), source })
    }
    if (status === 'CLOSED') return repository.closeExpiredAndReleaseStock({ orderNo: row.orderNo, closedAt: now(), source })
    return { paymentStatus: 'pending', channelStatus: status || 'UNKNOWN' }
  }
  return {
    async reconcilePayments() {
      const rows = await repository.listPendingPayments({ now: now(), limit: batchSize })
      return isolated('payment.query', rows, async (row) => applyQuery(row, await provider.queryPayment({ outTradeNo: row.outTradeNo }), 'active_query'))
    },
    async closeExpiredPayments() {
      const rows = await repository.listExpiredOrders({ now: now(), limit: batchSize })
      return isolated('payment.expire', rows, async (row) => {
        const outTradeNo = row.outTradeNo || `P${row.orderNo}`
        const queried = await provider.queryPayment({ outTradeNo })
        const status = channelState(queried)
        if (status === 'SUCCESS') return applyQuery(Object.assign({}, row, { outTradeNo }), queried, 'expiry_query')
        if (status === 'CLOSED') return repository.closeExpiredAndReleaseStock({ orderNo: row.orderNo, closedAt: now(), source: 'expiry_query' })
        if (status === 'NOTPAY' || status === 'USERPAYING') {
          await provider.closePayment({ outTradeNo })
          const confirmed = await provider.queryPayment({ outTradeNo })
          if (channelState(confirmed) === 'SUCCESS') return applyQuery(Object.assign({}, row, { outTradeNo }), confirmed, 'post_close_query')
          if (!['CLOSED', 'NOTPAY'].includes(channelState(confirmed))) {
            const error = new Error('渠道关单状态尚未确认')
            error.code = 'PAYMENT_CLOSE_UNCONFIRMED'
            throw error
          }
          return repository.closeExpiredAndReleaseStock({ orderNo: row.orderNo, closedAt: now(), source: 'expiry_close' })
        }
        const error = new Error('渠道支付状态无法安全关单')
        error.code = 'PAYMENT_CHANNEL_STATE_UNEXPECTED'
        throw error
      })
    },
    async processRefunds() {
      const rows = await repository.listRetryableRefunds({ now: now(), limit: batchSize })
      return isolated('refund.create', rows, async (refund) => {
        const result = await provider.createRefund({ outTradeNo: refund.outTradeNo || `P${refund.orderNo}`, refundNo: refund.refundNo, amountFen: refund.amountFen, totalFen: refund.totalFen || refund.amountFen, notifyKey: refund.refundNo })
        return repository.markRefundProcessing({ refundNo: refund.refundNo, orderNo: refund.orderNo, amountFen: refund.amountFen, providerRefundId: result.providerRefundId || null, updatedAt: now() })
      })
    },
    async runAll() {
      return { reconciliation: await this.reconcilePayments(), expiry: await this.closeExpiredPayments(), refunds: await this.processRefunds() }
    }
  }
}

module.exports = { createPaymentWorker, safeId }
