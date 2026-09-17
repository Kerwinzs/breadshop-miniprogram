const cloud = require('wx-server-sdk')
const { createPaymentService, PaymentError } = require('./domain')
const { createWechatPayProvider, configurationReady } = require('./provider')
const { createWechatPayHttpClient } = require('./http-client')
const { createCloudRepository } = require('./repository')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function ok(data) { return { ok: true, data } }
function fail(code, message) { return { ok: false, error: { code, message } } }
function owner() { return cloud.getWXContext().OPENID }

// CloudBase HTTP callback raw headers/body are intentionally not guessed here.
// Production must inject an adapter that preserves the exact Wechatpay-* headers
// and raw body before enabling notification actions.
function buildService(options = {}) {
  return createPaymentService({ repository: options.repository || createCloudRepository(db), provider: options.provider || createWechatPayProvider({ httpClient: createWechatPayHttpClient() }), now: options.now })
}

exports.main = async (event) => {
  const action = event && event.action
  const openid = owner()
  try {
    if (action === 'configurationStatus') return ok({ configured: configurationReady(process.env) })
    const service = buildService()
    if (action === 'createPayment') {
      if (!openid) return fail('AUTH_REQUIRED', '请先完成微信登录')
      const result = await service.createPrepay({ ownerOpenId: openid, orderNo: event.orderNo })
      const order = await service.queryPayment({ ownerOpenId: openid, orderNo: event.orderNo })
      return ok({ paymentParams: result.prepayPayload, expiredAt: order.paymentExpiresAt, paymentStatus: order.paymentStatus, duplicate: result.duplicate })
    }
    if (action === 'queryPayment') {
      if (!openid) return fail('AUTH_REQUIRED', '请先完成微信登录')
      return ok(await service.queryPayment({ ownerOpenId: openid, orderNo: event.orderNo }))
    }
    if (action === 'closeExpiredPayment') {
      if (!openid) return fail('AUTH_REQUIRED', '请先完成微信登录')
      const order = await service.queryPayment({ ownerOpenId: openid, orderNo: event.orderNo })
      return ok(await service.closeExpired({ orderNo: order.orderNo }))
    }
    if (action === 'requestRefund') return fail('PAYMENT_NOT_CONFIGURED', '退款执行入口仅供受控服务端任务调用')
    if (action === 'paymentNotification' || action === 'refundNotification') return fail('PAYMENT_NOT_CONFIGURED', 'CloudBase HTTP 原始回调适配器尚未配置')
    return fail('INVALID_INPUT', '不支持的支付操作')
  } catch (error) {
    const code = error instanceof PaymentError || error.code ? error.code : 'INTERNAL_ERROR'
    console.error('payment failed', action, code, error && error.message)
    return fail(code, code === 'INTERNAL_ERROR' ? '支付服务暂时不可用' : error.message)
  }
}

module.exports = Object.assign(exports, { buildService })
