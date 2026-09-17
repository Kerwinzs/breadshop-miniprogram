const crypto = require('crypto')

class WorkerAuthError extends Error { constructor(code, message) { super(message); this.code = code } }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
function signWorkerRequest({ secret, timestamp, nonce, payload }) {
  if (!secret) throw new WorkerAuthError('WORKER_AUTH_NOT_CONFIGURED', '支付任务鉴权未配置')
  return crypto.createHmac('sha256', secret).update(`${timestamp}\n${nonce}\n${canonical(payload || {})}`).digest('hex')
}
function verifyWorkerRequest({ secret, timestamp, nonce, signature, payload, now = Date.now, toleranceMs = 5 * 60 * 1000 }) {
  if (!secret) throw new WorkerAuthError('WORKER_AUTH_NOT_CONFIGURED', '支付任务鉴权未配置')
  if (!timestamp || !nonce || !signature) throw new WorkerAuthError('WORKER_UNAUTHORIZED', '支付任务调用未授权')
  const time = Number(timestamp)
  if (!Number.isFinite(time) || Math.abs(now() - time) > toleranceMs) throw new WorkerAuthError('WORKER_UNAUTHORIZED', '支付任务签名已过期')
  const expected = signWorkerRequest({ secret, timestamp, nonce, payload })
  const left = Buffer.from(String(signature), 'hex'), right = Buffer.from(expected, 'hex')
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw new WorkerAuthError('WORKER_UNAUTHORIZED', '支付任务签名无效')
  return true
}
module.exports = { WorkerAuthError, signWorkerRequest, verifyWorkerRequest }
