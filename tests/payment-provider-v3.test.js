const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const {
  createAuthorization, createMiniProgramPayPayload, verifyWechatpaySignature,
  decryptResource, createWechatPayProvider, requestSignatureMessage, configurationReady
} = require('../cloudfunctions/payment/provider')

const NOW = new Date('2026-09-03T00:00:00Z')
const TIMESTAMP = String(Math.floor(NOW.getTime() / 1000))
const merchantKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const wechatKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const merchantPrivateKey = merchantKeys.privateKey.export({ type: 'pkcs8', format: 'pem' })
const merchantPublicKey = merchantKeys.publicKey.export({ type: 'spki', format: 'pem' })
const wechatPrivateKey = wechatKeys.privateKey.export({ type: 'pkcs8', format: 'pem' })
const wechatPublicKey = wechatKeys.publicKey.export({ type: 'spki', format: 'pem' })
const env = {
  WECHAT_PAY_MCH_ID: '1900000001', WECHAT_PAY_APP_ID: 'wx1234567890abcdef',
  WECHAT_PAY_API_V3_KEY: '0123456789abcdef0123456789abcdef',
  WECHAT_PAY_PRIVATE_KEY: merchantPrivateKey, WECHAT_PAY_SERIAL_NO: '0123456789ABCDEF',
  WECHAT_PAY_NOTIFY_URL: 'https://example.test/payment-notify',
  WECHAT_PAY_REFUND_NOTIFY_URL: 'https://example.test/refund-notify',
  WECHAT_PAY_PUBLIC_KEY_ID: 'PUB_KEY_ID_011', WECHAT_PAY_PUBLIC_KEY: wechatPublicKey
}

test('configuration health check validates structure without exposing values', () => {
  assert.equal(configurationReady(env), true)
  assert.equal(configurationReady({ ...env, WECHAT_PAY_API_V3_KEY: 'short' }), false)
  assert.equal(configurationReady({ ...env, WECHAT_PAY_PRIVATE_KEY: 'not-a-private-key' }), false)
  assert.equal(configurationReady({ ...env, WECHAT_PAY_PUBLIC_KEY_ID: 'wrong-id' }), false)
})

function signedHeaders(rawBody, overrides = {}) {
  const timestamp = overrides.timestamp || TIMESTAMP
  const nonce = overrides.nonce || 'wechat-nonce'
  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${timestamp}\n${nonce}\n${rawBody}\n`), wechatPrivateKey).toString('base64')
  return { 'Wechatpay-Timestamp': timestamp, 'Wechatpay-Nonce': nonce, 'Wechatpay-Serial': env.WECHAT_PAY_PUBLIC_KEY_ID, 'Wechatpay-Signature': signature }
}

function encryptedResource(value) {
  const nonce = '123456789012'
  const aad = 'transaction'
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(env.WECHAT_PAY_API_V3_KEY), Buffer.from(nonce))
  cipher.setAAD(Buffer.from(aad))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]).toString('base64')
  return { algorithm: 'AEAD_AES_256_GCM', ciphertext, nonce, associated_data: aad }
}

function response(statusCode, value) {
  const rawBody = value == null ? '' : JSON.stringify(value)
  return { statusCode, rawBody, headers: signedHeaders(rawBody) }
}

test('merchant Authorization signs the canonical API v3 message', () => {
  const body = '{"hello":"world"}'
  const authorization = createAuthorization({ method: 'POST', canonicalUrl: '/v3/test?a=1', body, mchid: env.WECHAT_PAY_MCH_ID, serialNo: env.WECHAT_PAY_SERIAL_NO, privateKey: merchantPrivateKey, timestamp: TIMESTAMP, nonceStr: 'merchant-nonce' })
  const signature = authorization.match(/signature="([^"]+)"/)[1]
  assert.equal(crypto.verify('RSA-SHA256', Buffer.from(requestSignatureMessage('POST', '/v3/test?a=1', TIMESTAMP, 'merchant-nonce', body)), merchantPublicKey, Buffer.from(signature, 'base64')), true)
  assert.match(authorization, /^WECHATPAY2-SHA256-RSA2048 /)
})

test('mini program payload signs appid timestamp nonce and package', () => {
  const payload = createMiniProgramPayPayload({ appid: env.WECHAT_PAY_APP_ID, prepayId: 'prepay-1', privateKey: merchantPrivateKey, timestamp: TIMESTAMP, nonceStr: 'mini-nonce' })
  const message = `${env.WECHAT_PAY_APP_ID}\n${TIMESTAMP}\nmini-nonce\nprepay_id=prepay-1\n`
  assert.equal(crypto.verify('RSA-SHA256', Buffer.from(message), merchantPublicKey, Buffer.from(payload.paySign, 'base64')), true)
  assert.equal(payload.signType, 'RSA')
})

test('Wechatpay response signature rejects body tampering and stale timestamps', () => {
  const rawBody = '{"ok":true}'
  assert.equal(verifyWechatpaySignature({ rawBody, headers: signedHeaders(rawBody), publicKey: wechatPublicKey, publicKeyId: env.WECHAT_PAY_PUBLIC_KEY_ID, now: NOW }), true)
  assert.throws(() => verifyWechatpaySignature({ rawBody: '{"ok":false}', headers: signedHeaders(rawBody), publicKey: wechatPublicKey, publicKeyId: env.WECHAT_PAY_PUBLIC_KEY_ID, now: NOW }), /签名无效/)
  assert.throws(() => verifyWechatpaySignature({ rawBody, headers: signedHeaders(rawBody, { timestamp: '1' }), publicKey: wechatPublicKey, publicKeyId: env.WECHAT_PAY_PUBLIC_KEY_ID, now: NOW }), (error) => error.code === 'WECHATPAY_SIGNATURE_TIMESTAMP_INVALID')
  assert.throws(() => verifyWechatpaySignature({ rawBody, headers: {}, publicKey: wechatPublicKey, publicKeyId: env.WECHAT_PAY_PUBLIC_KEY_ID, now: NOW }), (error) => error.code === 'WECHATPAY_SIGNATURE_HEADERS_MISSING')
  assert.throws(() => verifyWechatpaySignature({ rawBody, headers: signedHeaders(rawBody), publicKey: wechatPublicKey, publicKeyId: 'PUB_KEY_ID_OTHER', now: NOW }), (error) => error.code === 'WECHATPAY_PUBLIC_KEY_ID_MISMATCH')
})

test('AES-256-GCM resource decryption authenticates ciphertext and AAD', () => {
  const resource = encryptedResource({ out_trade_no: 'PB100' })
  assert.deepEqual(decryptResource(resource, env.WECHAT_PAY_API_V3_KEY), { out_trade_no: 'PB100' })
  assert.throws(() => decryptResource({ ...resource, associated_data: 'tampered' }, env.WECHAT_PAY_API_V3_KEY), /解密失败/)
})

test('JSAPI create, query, close and full refund construct exact requests', async () => {
  const requests = []
  const queue = [
    response(200, { prepay_id: 'prepay-1' }),
    response(200, { trade_state: 'SUCCESS' }),
    response(204, null),
    response(200, { refund_id: 'refund-1', status: 'PROCESSING' })
  ]
  const provider = createWechatPayProvider({ env, now: () => NOW, nonceFactory: () => 'fixed-nonce', httpClient: async (request) => { requests.push(request); return queue.shift() } })
  const pay = await provider.createPrepay({ outTradeNo: 'PB100', description: '面包', amountFen: 3200, payerOpenId: 'openid-1' })
  await provider.queryPayment({ outTradeNo: 'PB100' })
  await provider.closePayment({ outTradeNo: 'PB100' })
  const refund = await provider.createRefund({ outTradeNo: 'PB100', refundNo: 'RB100', amountFen: 3200, totalFen: 3200 })
  assert.equal(pay.package, 'prepay_id=prepay-1')
  assert.equal(refund.providerRefundId, 'refund-1')
  assert.deepEqual(requests.map((item) => [item.method, item.path]), [
    ['POST', '/v3/pay/transactions/jsapi'],
    ['GET', '/v3/pay/transactions/out-trade-no/PB100?mchid=1900000001'],
    ['POST', '/v3/pay/transactions/out-trade-no/PB100/close'],
    ['POST', '/v3/refund/domestic/refunds']
  ])
  assert.deepEqual(JSON.parse(requests[0].body).amount, { total: 3200, currency: 'CNY' })
  assert.deepEqual(JSON.parse(requests[3].body).amount, { refund: 3200, total: 3200, currency: 'CNY' })
  assert.equal(requests[3].headers.Accept, 'application/json')
  assert.equal(requests[3].headers['User-Agent'], 'breadshop-cloudbase-payment/1.0')
  assert.match(requests[0].headers.Authorization, /^WECHATPAY2-SHA256-RSA2048 /)
})

test('raw payment callback is verified, decrypted and bound to expected facts', async () => {
  const provider = createWechatPayProvider({ env, now: () => NOW, httpClient: async () => response(200, {}) })
  const resource = {
    appid: env.WECHAT_PAY_APP_ID, mchid: env.WECHAT_PAY_MCH_ID,
    out_trade_no: 'PB100', transaction_id: 'wx-1', trade_state: 'SUCCESS',
    amount: { total: 3200, payer_total: 3200, currency: 'CNY' }, success_time: '2026-09-03T08:00:00+08:00'
  }
  const rawBody = JSON.stringify({ id: 'event-1', resource: encryptedResource(resource) })
  const result = await provider.verifyPaymentNotification({ rawBody, headers: signedHeaders(rawBody), expected: { outTradeNo: 'PB100', amountFen: 3200 } })
  assert.equal(result.transactionId, 'wx-1')
  await assert.rejects(() => provider.verifyPaymentNotification({ rawBody, headers: signedHeaders(rawBody), expected: { outTradeNo: 'PB100', amountFen: 1 } }), (error) => error.code === 'PAYMENT_AMOUNT_MISMATCH')
})

test('provider fails closed without public-key verification config or HTTP adapter', async () => {
  const incomplete = { ...env }; delete incomplete.WECHAT_PAY_PUBLIC_KEY
  await assert.rejects(() => createWechatPayProvider({ env: incomplete, httpClient: async () => response(200, {}) }).queryPayment({ outTradeNo: 'PB100' }), (error) => error.code === 'PAYMENT_NOT_CONFIGURED')
  await assert.rejects(() => createWechatPayProvider({ env }).queryPayment({ outTradeNo: 'PB100' }), (error) => error.code === 'PAYMENT_NOT_CONFIGURED')
})

test('unsigned channel error is diagnostic-only while success still requires signature', async () => {
  const errorProvider = createWechatPayProvider({ env, now: () => NOW, httpClient: async () => ({ statusCode: 400, rawBody: JSON.stringify({ code: 'PARAM_ERROR', message: '退款参数错误\n请检查' }), headers: {} }) })
  await assert.rejects(() => errorProvider.createRefund({ outTradeNo: 'PB100', refundNo: 'RB100', amountFen: 1, totalFen: 1 }), (error) => error.code === 'WECHATPAY_API_PARAM_ERROR' && error.message === '退款参数错误 请检查')
  const unsignedSuccessProvider = createWechatPayProvider({ env, now: () => NOW, httpClient: async () => ({ statusCode: 200, rawBody: JSON.stringify({ refund_id: 'refund-1' }), headers: {} }) })
  await assert.rejects(() => unsignedSuccessProvider.createRefund({ outTradeNo: 'PB100', refundNo: 'RB100', amountFen: 1, totalFen: 1 }), (error) => error.code === 'WECHATPAY_SIGNATURE_HEADERS_MISSING')
})
