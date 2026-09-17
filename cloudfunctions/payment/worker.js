const cloud = require('wx-server-sdk')
const { verifyWorkerRequest } = require('./worker-auth')
const { createPaymentWorker } = require('./worker-domain')
const { createWorkerRepository } = require('./worker-repository')
const { createWechatPayProvider } = require('./provider')
const { createWechatPayHttpClient } = require('./http-client')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
exports.main = async (event = {}) => {
  const timer = event.Type === 'Timer' && event.TriggerName === 'payment-worker-every-minute'
  let payload = event.payload || {}
  if (timer) {
    try { payload = event.Message ? JSON.parse(event.Message) : { action: 'all' } } catch (_) { throw Object.assign(new Error('定时任务参数无效'), { code: 'WORKER_ACTION_UNSUPPORTED' }) }
  } else {
    verifyWorkerRequest({ secret: process.env.PAYMENT_WORKER_SECRET, timestamp: event.timestamp, nonce: event.nonce, signature: event.signature, payload })
  }
  const worker = createPaymentWorker({ repository: createWorkerRepository(cloud.database()), provider: createWechatPayProvider({ httpClient: createWechatPayHttpClient() }) })
  if (payload.action === 'reconcile') return worker.reconcilePayments()
  if (payload.action === 'expire') return worker.closeExpiredPayments()
  if (payload.action === 'refund') return worker.processRefunds()
  if (payload.action === 'reconcileRefunds') return worker.reconcileRefunds()
  if (payload.action === 'refundOne') return worker.processRefund(payload.refundNo)
  if (payload.action === 'all') return worker.runAll()
  throw Object.assign(new Error('不支持的支付任务'), { code: 'WORKER_ACTION_UNSUPPORTED' })
}
