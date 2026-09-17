const { createCloudRepository } = require('../payment/repository')

function createWorkerRepository(db) {
  const base = createCloudRepository(db)
  const _ = db.command
  const one = async (collection, where) => {
    const result = await db.collection(collection).where(where).limit(1).get()
    return result.data && result.data[0]
  }
  const list = async (collection, where, limit) => (await db.collection(collection).where(where).limit(limit).get()).data || []
  return Object.assign({}, base, {
    listExpiredOrders: ({ now, limit }) => list('orders', { paymentStatus: 'pending', paymentExpiresAt: _.lte(now) }, limit),
    listPendingPayments: ({ now, limit }) => list('paymentTransactions', { status: 'pending', nextRetryAt: _.or(_.exists(false), _.lte(now)) }, limit),
    async listRetryableRefunds({ now, limit }) {
      const pending = await list('refunds', { status: 'pending', nextRetryAt: _.or(_.exists(false), _.lte(now)) }, limit)
      if (pending.length >= limit) return pending
      const failed = await list('refunds', { status: 'failed', retryRequestedAt: _.exists(true), nextRetryAt: _.or(_.exists(false), _.lte(now)) }, limit - pending.length)
      return pending.concat(failed)
    },
    async recordWorkerFailure({ kind, row, errorCode, nextRetryAt }) {
      const collection = kind === 'refund.create' ? 'refunds' : 'paymentTransactions'
      const key = collection === 'refunds' ? { refundNo: row.refundNo } : { outTradeNo: row.outTradeNo || `P${row.orderNo}` }
      const doc = await one(collection, key)
      if (!doc) return
      await db.collection(collection).doc(doc._id).update({ data: { attemptCount: _.inc(1), lastErrorCode: errorCode, nextRetryAt, updatedAt: db.serverDate() } })
    }
  })
}

module.exports = { createWorkerRepository }
