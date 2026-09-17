const https = require('https')
const { PaymentError } = require('./domain')

const API_HOST = 'api.mch.weixin.qq.com'
const MAX_RESPONSE_BYTES = 1024 * 1024

function createWechatPayHttpClient({ transport = https, timeoutMs = 10000, maxResponseBytes = MAX_RESPONSE_BYTES } = {}) {
  return ({ method, url, headers, body = '' }) => new Promise((resolve, reject) => {
    let target
    try { target = new URL(url) } catch (_) { return reject(new PaymentError('WECHAT_PAY_REQUEST_INVALID', '微信支付请求地址无效')) }
    if (target.protocol !== 'https:' || target.hostname !== API_HOST) return reject(new PaymentError('WECHAT_PAY_REQUEST_INVALID', '微信支付请求地址不受信任'))
    const request = transport.request(target, { method, headers, timeout: timeoutMs }, (response) => {
      const chunks = []
      let size = 0
      response.on('data', (chunk) => {
        size += chunk.length
        if (size > maxResponseBytes) request.destroy(new PaymentError('WECHAT_PAY_BAD_RESPONSE', '微信支付响应体过大'))
        else chunks.push(chunk)
      })
      response.on('end', () => resolve({ statusCode: response.statusCode, headers: response.headers, rawBody: Buffer.concat(chunks) }))
    })
    request.on('timeout', () => request.destroy(new PaymentError('WECHAT_PAY_TIMEOUT', '微信支付请求超时')))
    request.on('error', reject)
    if (body) request.write(body)
    request.end()
  })
}

module.exports = { API_HOST, MAX_RESPONSE_BYTES, createWechatPayHttpClient }
