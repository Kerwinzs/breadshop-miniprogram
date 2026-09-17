const cloud = require('wx-server-sdk')
const { createPaymentService, PaymentError } = require('./domain')
const { createWechatPayProvider } = require('./provider')
const { createWechatPayHttpClient } = require('./http-client')
const { createCloudRepository } = require('./repository')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const PAYMENT_PATH = '/wechatpay/payment'
const REFUND_PATH = '/wechatpay/refund'

function response(statusCode, code, message) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ code, message }), isBase64Encoded: false }
}

function rawBodyOf(event) {
  if (!event || typeof event.body !== 'string') throw new PaymentError('INVALID_WECHATPAY_CALLBACK', '缺少微信支付原始报文')
  try { return event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body, 'utf8') } catch (_) {
    throw new PaymentError('INVALID_WECHATPAY_CALLBACK', '微信支付报文编码无效')
  }
}

function createHttpHandler({ serviceFactory, logger = console } = {}) {
  const factory = serviceFactory || (() => createPaymentService({
    repository: createCloudRepository(cloud.database()),
    provider: createWechatPayProvider({ httpClient: createWechatPayHttpClient() })
  }))
  return async (event = {}) => {
    if (String(event.httpMethod || '').toUpperCase() !== 'POST') return response(405, 'METHOD_NOT_ALLOWED', '仅支持 POST')
    const path = String(event.path || '').replace(/\/$/, '')
    if (path !== PAYMENT_PATH && path !== REFUND_PATH) return response(404, 'NOT_FOUND', '回调路径不存在')
    try {
      const service = factory()
      const input = { rawBody: rawBodyOf(event), headers: event.headers || {} }
      if (path === PAYMENT_PATH) await service.handlePaymentNotification(input)
      else await service.handleRefundNotification(input)
      return response(200, 'SUCCESS', '成功')
    } catch (error) {
      const code = error && error.code || 'INTERNAL_ERROR'
      logger.error({ scope: 'payment-callback', event: 'rejected', code })
      const clientError = code.startsWith('INVALID_') || code === 'PAYMENT_AMOUNT_MISMATCH' || code.endsWith('_NOT_FOUND')
      return response(clientError ? 400 : 500, 'FAIL', clientError ? '回调验证失败' : '服务暂时不可用')
    }
  }
}

exports.main = createHttpHandler()
module.exports = Object.assign(exports, { PAYMENT_PATH, REFUND_PATH, rawBodyOf, createHttpHandler })
