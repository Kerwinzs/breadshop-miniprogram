const { createCloudRepository } = require('./repository')
function createWorkerRepository(db) {
  const base = createCloudRepository(db), _ = db.command
  const one = async (collection, where) => (await db.collection(collection).where(where).limit(1).get()).data?.[0]
  const list = async (collection, where, limit) => (await db.collection(collection).where(where).limit(limit).get()).data || []
  return Object.assign({}, base, {
    getRefund: (refundNo) => one('refunds', { refundNo }),
    listExpiredOrders: ({ now, limit }) => list('orders', { paymentStatus: 'pending', paymentExpiresAt: _.lte(now) }, limit),
    listPendingPayments: ({ now, limit }) => list('paymentTransactions', { status: 'pending', nextRetryAt: _.or(_.exists(false), _.lte(now)) }, limit),
    listProcessingRefunds: ({ now, limit }) => list('refunds', { status: 'processing', nextRetryAt: _.or(_.exists(false), _.lte(now)) }, limit),
    async listRetryableRefunds({ now, limit }) { const pending = await list('refunds', { status: 'pending', nextRetryAt: _.or(_.exists(false), _.lte(now)) }, limit); if (pending.length >= limit) return pending; return pending.concat(await list('refunds', { status: 'failed', retryRequestedAt: _.exists(true), nextRetryAt: _.or(_.exists(false), _.lte(now)) }, limit - pending.length)) },
    async recordWorkerFailure({ kind, row, errorCode, errorMessage, nextRetryAt }) { const collection = String(kind || '').startsWith('refund.create') ? 'refunds' : 'paymentTransactions', key = collection === 'refunds' ? { refundNo: row.refundNo } : { outTradeNo: row.outTradeNo || `P${row.orderNo}` }, doc = await one(collection, key); if (doc) await db.collection(collection).doc(doc._id).update({ data: { attemptCount: _.inc(1), lastErrorCode: errorCode, lastErrorMessage: String(errorMessage || '').slice(0, 160), nextRetryAt, updatedAt: db.serverDate() } }) }
  })
}
module.exports = { createWorkerRepository }
