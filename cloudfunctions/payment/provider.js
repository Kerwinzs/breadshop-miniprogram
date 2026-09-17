const crypto = require('crypto')
const { PaymentError } = require('./domain')

const API_ORIGIN = 'https://api.mch.weixin.qq.com'
const AUTH_TYPE = 'WECHATPAY2-SHA256-RSA2048'
const DEFAULT_CLOCK_TOLERANCE_SECONDS = 300

function requiredConfig(env = process.env) {
  return {
    mchid: env.WECHAT_PAY_MCH_ID, appid: env.WECHAT_PAY_APP_ID,
    apiV3Key: env.WECHAT_PAY_API_V3_KEY, privateKey: env.WECHAT_PAY_PRIVATE_KEY,
    serialNo: env.WECHAT_PAY_SERIAL_NO, notifyUrl: env.WECHAT_PAY_NOTIFY_URL,
    refundNotifyUrl: env.WECHAT_PAY_REFUND_NOTIFY_URL || env.WECHAT_PAY_NOTIFY_URL,
    wechatpayPublicKeyId: env.WECHAT_PAY_PUBLIC_KEY_ID,
    wechatpayPublicKey: env.WECHAT_PAY_PUBLIC_KEY
  }
}

function configured(env = process.env) {
  const c = requiredConfig(env)
  return Boolean(c.mchid && c.appid && c.apiV3Key && Buffer.byteLength(c.apiV3Key) === 32 &&
    c.privateKey && c.serialNo && c.notifyUrl && c.wechatpayPublicKeyId && c.wechatpayPublicKey)
}

function configurationReady(env = process.env) {
  if (!configured(env)) return false
  try {
    const c = requiredConfig(env)
    crypto.createPrivateKey(c.privateKey)
    crypto.createPublicKey(c.wechatpayPublicKey)
    const notifyUrl = new URL(c.notifyUrl)
    const refundNotifyUrl = new URL(c.refundNotifyUrl)
    return notifyUrl.protocol === 'https:' && refundNotifyUrl.protocol === 'https:' &&
      /^\d{8,20}$/.test(c.mchid) && /^wx[a-zA-Z0-9]+$/.test(c.appid) &&
      /^[0-9A-F]+$/i.test(c.serialNo) && c.wechatpayPublicKeyId.startsWith('PUB_KEY_ID_')
  } catch (_) {
    return false
  }
}

function fail(code, message) { throw new PaymentError(code, message) }
function channelFailure(data) {
  const channelCode = String(data && data.code || '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 48)
  const message = String(data && data.message || '微信支付接口请求失败').replace(/[\r\n]+/g, ' ').slice(0, 160)
  fail(channelCode ? `WECHATPAY_API_${channelCode}` : 'WECHAT_PAY_API_ERROR', message)
}
function randomNonce() { return crypto.randomBytes(16).toString('hex') }
function unixSeconds(now = new Date()) { return String(Math.floor(now.getTime() / 1000)) }
function rsaSign(message, privateKey) {
  return crypto.sign('RSA-SHA256', Buffer.from(message), privateKey).toString('base64')
}
function rsaVerify(message, signature, publicKey) {
  try {
    return crypto.verify('RSA-SHA256', Buffer.from(message), publicKey, Buffer.from(signature, 'base64'))
  } catch (_) { return false }
}

function requestSignatureMessage(method, canonicalUrl, timestamp, nonceStr, body = '') {
  return `${String(method).toUpperCase()}\n${canonicalUrl}\n${timestamp}\n${nonceStr}\n${body}\n`
}

function createAuthorization({ method, canonicalUrl, body = '', mchid, serialNo, privateKey, timestamp = unixSeconds(), nonceStr = randomNonce() }) {
  if (!method || !canonicalUrl || !mchid || !serialNo || !privateKey) fail('PAYMENT_NOT_CONFIGURED', '微信支付签名配置不完整')
  const signature = rsaSign(requestSignatureMessage(method, canonicalUrl, timestamp, nonceStr, body), privateKey)
  return `${AUTH_TYPE} mchid="${mchid}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${serialNo}"`
}

function createMiniProgramPayPayload({ appid, prepayId, privateKey, timestamp = unixSeconds(), nonceStr = randomNonce() }) {
  if (!appid || !prepayId || !privateKey) fail('PAYMENT_NOT_CONFIGURED', '小程序支付签名配置不完整')
  const packageValue = `prepay_id=${prepayId}`
  const message = `${appid}\n${timestamp}\n${nonceStr}\n${packageValue}\n`
  return { timeStamp: timestamp, nonceStr, package: packageValue, signType: 'RSA', paySign: rsaSign(message, privateKey) }
}

function getHeader(headers, name) {
  const key = Object.keys(headers || {}).find((candidate) => candidate.toLowerCase() === name.toLowerCase())
  const value = key ? headers[key] : undefined
  return Array.isArray(value) ? value[0] : value
}

function verifyWechatpaySignature({ rawBody, headers, publicKey, publicKeyId, now = new Date(), toleranceSeconds = DEFAULT_CLOCK_TOLERANCE_SECONDS }) {
  if (typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody)) fail('INVALID_WECHATPAY_SIGNATURE', '缺少微信支付原始报文')
  const timestamp = getHeader(headers, 'Wechatpay-Timestamp')
  const nonceStr = getHeader(headers, 'Wechatpay-Nonce')
  const signature = getHeader(headers, 'Wechatpay-Signature')
  const serial = getHeader(headers, 'Wechatpay-Serial')
  if (!timestamp || !nonceStr || !signature || !serial) fail('WECHATPAY_SIGNATURE_HEADERS_MISSING', '微信支付签名头不完整')
  if (!/^\d{10,}$/.test(String(timestamp)) || Math.abs(now.getTime() / 1000 - Number(timestamp)) > toleranceSeconds) {
    fail('WECHATPAY_SIGNATURE_TIMESTAMP_INVALID', '微信支付签名时间戳无效')
  }
  if (!publicKey || serial !== publicKeyId) fail('WECHATPAY_PUBLIC_KEY_ID_MISMATCH', '微信支付公钥标识不匹配')
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody
  if (!rsaVerify(`${timestamp}\n${nonceStr}\n${body}\n`, signature, publicKey)) fail('INVALID_WECHATPAY_SIGNATURE', '微信支付签名无效')
  return true
}

function decryptResource(resource, apiV3Key) {
  if (!resource || resource.algorithm !== 'AEAD_AES_256_GCM') fail('INVALID_WECHATPAY_RESOURCE', '不支持的微信支付资源加密算法')
  if (typeof apiV3Key !== 'string' || Buffer.byteLength(apiV3Key) !== 32) fail('PAYMENT_NOT_CONFIGURED', 'API v3 密钥配置无效')
  try {
    const encrypted = Buffer.from(resource.ciphertext, 'base64')
    if (encrypted.length <= 16) throw new Error('invalid ciphertext')
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(resource.nonce))
    decipher.setAuthTag(encrypted.subarray(-16))
    decipher.setAAD(Buffer.from(resource.associated_data || ''))
    return JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]).toString('utf8'))
  } catch (_) { fail('INVALID_WECHATPAY_RESOURCE', '微信支付资源解密失败') }
}

function normalizeCallbackInput(input) {
  if (!input || (typeof input.rawBody !== 'string' && !Buffer.isBuffer(input.rawBody)) || !input.headers) {
    fail('INVALID_WECHATPAY_CALLBACK', '回调必须包含原始 body 和签名 headers')
  }
  return input
}

function assertPositiveFen(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) fail('INVALID_PAYMENT_REQUEST', `${label}必须为正整数分`)
}

function validateCallbackIdentity(resource, expected, kind) {
  if (resource.appid !== expected.appid || resource.mchid !== expected.mchid) fail('INVALID_WECHATPAY_CALLBACK', '回调商户身份不匹配')
  if (kind === 'payment') {
    if (!resource.out_trade_no || !resource.transaction_id || resource.trade_state !== 'SUCCESS') fail('INVALID_WECHATPAY_CALLBACK', '支付回调订单或状态无效')
    if (resource.amount?.currency !== 'CNY' || !Number.isSafeInteger(resource.amount?.total) || resource.amount.total <= 0) fail('PAYMENT_AMOUNT_MISMATCH', '支付回调金额或币种不一致')
    if (expected.outTradeNo && resource.out_trade_no !== expected.outTradeNo) fail('INVALID_WECHATPAY_CALLBACK', '支付回调订单不一致')
    if (Number.isSafeInteger(expected.amountFen) && (resource.amount.total !== expected.amountFen ||
      (resource.amount.payer_total != null && resource.amount.payer_total !== expected.amountFen))) fail('PAYMENT_AMOUNT_MISMATCH', '支付回调金额不一致')
  } else {
    if (!resource.out_refund_no || !resource.refund_status) fail('INVALID_WECHATPAY_CALLBACK', '退款回调退款单无效')
    if (resource.amount?.currency !== 'CNY' || !Number.isSafeInteger(resource.amount?.refund) ||
      !Number.isSafeInteger(resource.amount?.total) || resource.amount.refund <= 0 || resource.amount.total <= 0) fail('PAYMENT_AMOUNT_MISMATCH', '退款回调金额或币种不一致')
    if (expected.refundNo && resource.out_refund_no !== expected.refundNo) fail('INVALID_WECHATPAY_CALLBACK', '退款回调退款单不一致')
    if (Number.isSafeInteger(expected.amountFen) && resource.amount.refund !== expected.amountFen) fail('PAYMENT_AMOUNT_MISMATCH', '退款回调金额不一致')
    if (Number.isSafeInteger(expected.totalFen) && resource.amount.total !== expected.totalFen) fail('PAYMENT_AMOUNT_MISMATCH', '退款回调订单金额不一致')
  }
}

function createWechatPayProvider({ env = process.env, httpClient, now = () => new Date(), nonceFactory = randomNonce, clockToleranceSeconds = DEFAULT_CLOCK_TOLERANCE_SECONDS } = {}) {
  const c = requiredConfig(env)
  function requireConfig() {
    if (!configured(env)) fail('PAYMENT_NOT_CONFIGURED', '微信支付尚未完整配置')
    if (typeof httpClient !== 'function') fail('PAYMENT_NOT_CONFIGURED', '微信支付 HTTP 适配器尚未配置')
  }
  async function apiRequest(method, path, payload) {
    requireConfig()
    const rawBody = payload == null ? '' : JSON.stringify(payload)
    const timestamp = unixSeconds(now())
    const nonceStr = nonceFactory()
    const headers = {
      Accept: 'application/json',
      'User-Agent': 'breadshop-cloudbase-payment/1.0',
      Authorization: createAuthorization({ method, canonicalUrl: path, body: rawBody, mchid: c.mchid, serialNo: c.serialNo, privateKey: c.privateKey, timestamp, nonceStr })
    }
    if (payload != null) headers['Content-Type'] = 'application/json'
    const response = await httpClient({ method, url: `${API_ORIGIN}${path}`, path, headers, body: rawBody })
    if (!response || typeof response.statusCode !== 'number' ||
      (typeof response.rawBody !== 'string' && !Buffer.isBuffer(response.rawBody))) fail('WECHAT_PAY_BAD_RESPONSE', '微信支付 HTTP 响应格式无效')
    let data = null
    if (response.rawBody.length) {
      try { data = JSON.parse(response.rawBody.toString()) } catch (_) { fail('WECHAT_PAY_BAD_RESPONSE', '微信支付响应不是有效 JSON') }
    }
    // A non-2xx response is never used to mutate financial state. Some channel
    // error responses are unsigned, so surface only a bounded diagnostic code
    // and message. Successful responses remain strictly signature verified.
    if (response.statusCode < 200 || response.statusCode >= 300) channelFailure(data)
    verifyWechatpaySignature({ rawBody: response.rawBody, headers: response.headers, publicKey: c.wechatpayPublicKey, publicKeyId: c.wechatpayPublicKeyId, now: now(), toleranceSeconds: clockToleranceSeconds })
    return data
  }
  function verifyAndDecryptCallback(input) {
    requireConfig()
    const callback = normalizeCallbackInput(input)
    verifyWechatpaySignature({ rawBody: callback.rawBody, headers: callback.headers, publicKey: c.wechatpayPublicKey, publicKeyId: c.wechatpayPublicKeyId, now: now(), toleranceSeconds: clockToleranceSeconds })
    let envelope
    try { envelope = JSON.parse(callback.rawBody.toString()) } catch (_) { fail('INVALID_WECHATPAY_CALLBACK', '微信支付回调不是有效 JSON') }
    if (!envelope.id || !envelope.resource) fail('INVALID_WECHATPAY_CALLBACK', '微信支付回调结构无效')
    return { envelope, resource: decryptResource(envelope.resource, c.apiV3Key) }
  }
  return {
    async createPrepay(request) {
      requireConfig()
      assertPositiveFen(request.amountFen, '支付金额')
      const data = await apiRequest('POST', '/v3/pay/transactions/jsapi', {
        appid: c.appid, mchid: c.mchid, description: request.description,
        out_trade_no: request.outTradeNo, notify_url: c.notifyUrl,
        amount: { total: request.amountFen, currency: 'CNY' }, payer: { openid: request.payerOpenId }
      })
      if (!data?.prepay_id) fail('WECHAT_PAY_BAD_RESPONSE', '微信支付响应缺少 prepay_id')
      return createMiniProgramPayPayload({ appid: c.appid, prepayId: data.prepay_id, privateKey: c.privateKey, timestamp: unixSeconds(now()), nonceStr: nonceFactory() })
    },
    async queryPayment({ outTradeNo }) {
      return apiRequest('GET', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(c.mchid)}`)
    },
    async closePayment({ outTradeNo }) {
      await apiRequest('POST', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}/close`, { mchid: c.mchid })
      return { closed: true }
    },
    async createRefund(request) {
      requireConfig()
      assertPositiveFen(request.amountFen, '退款金额'); assertPositiveFen(request.totalFen, '订单金额')
      if (request.amountFen !== request.totalFen) fail('INVALID_PAYMENT_REQUEST', '首期仅支持整单全额退款')
      const data = await apiRequest('POST', '/v3/refund/domestic/refunds', {
        out_trade_no: request.outTradeNo, out_refund_no: request.refundNo,
        reason: request.reason || '订单取消', notify_url: c.refundNotifyUrl,
        amount: { refund: request.amountFen, total: request.totalFen, currency: 'CNY' }
      })
      return { providerRefundId: data?.refund_id || null, status: data?.status || null }
    },
    async queryRefund({ refundNo }) {
      if (!refundNo) fail('INVALID_PAYMENT_REQUEST', '退款单号不能为空')
      return apiRequest('GET', `/v3/refund/domestic/refunds/${encodeURIComponent(refundNo)}`)
    },
    async verifyPaymentNotification(input) {
      const { envelope, resource } = verifyAndDecryptCallback(input)
      validateCallbackIdentity(resource, { appid: c.appid, mchid: c.mchid, ...(input.expected || {}) }, 'payment')
      return { eventId: envelope.id, outTradeNo: resource.out_trade_no, transactionId: resource.transaction_id, amountFen: resource.amount.total, paidAt: resource.success_time }
    },
    async verifyRefundNotification(input) {
      const { envelope, resource } = verifyAndDecryptCallback(input)
      validateCallbackIdentity(resource, { appid: c.appid, mchid: c.mchid, ...(input.expected || {}) }, 'refund')
      const statuses = { SUCCESS: 'succeeded', CLOSED: 'failed', ABNORMAL: 'failed' }
      if (!statuses[resource.refund_status]) fail('INVALID_WECHATPAY_CALLBACK', '退款回调状态无效')
      return { eventId: envelope.id, refundNo: resource.out_refund_no, outTradeNo: resource.out_trade_no || null, amountFen: resource.amount.refund, totalFen: resource.amount.total, status: statuses[resource.refund_status], failureReason: statuses[resource.refund_status] === 'failed' ? resource.refund_status : '', completedAt: resource.success_time || null }
    }
  }
}

module.exports = {
  API_ORIGIN, AUTH_TYPE, DEFAULT_CLOCK_TOLERANCE_SECONDS, configured, configurationReady, requiredConfig,
  requestSignatureMessage, createAuthorization, createMiniProgramPayPayload,
  verifyWechatpaySignature, decryptResource, normalizeCallbackInput, createWechatPayProvider
}
