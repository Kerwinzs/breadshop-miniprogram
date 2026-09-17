const cloud = require('wx-server-sdk')
const { verifyWorkerRequest } = require('./auth')
const { createPaymentWorker } = require('./domain')
const { createWorkerRepository } = require('./repository')
const { createWechatPayProvider } = require('../payment/provider')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event = {}) => {
  const payload = event.payload || {}
  verifyWorkerRequest({ secret: process.env.PAYMENT_WORKER_SECRET, timestamp: event.timestamp, nonce: event.nonce, signature: event.signature, payload })
  const worker = createPaymentWorker({ repository: createWorkerRepository(cloud.database()), provider: createWechatPayProvider() })
  if (payload.action === 'reconcile') return worker.reconcilePayments()
  if (payload.action === 'expire') return worker.closeExpiredPayments()
  if (payload.action === 'refund') return worker.processRefunds()
  if (payload.action === 'all') return worker.runAll()
  throw Object.assign(new Error('不支持的支付任务'), { code: 'WORKER_ACTION_UNSUPPORTED' })
}
