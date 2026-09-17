const assert = require('node:assert/strict')
const test = require('node:test')

const intent = require('../miniprogram/utils/checkout-intent')
const status = require('../miniprogram/utils/payment-status')

test('checkout intent reuses one clientRequestId until paid completion', () => {
  const page = {}
  const first = intent.ensure(page)
  assert.equal(intent.ensure(page), first)
  intent.complete(page)
  assert.notEqual(intent.ensure(page), first)
})

test('payment view keeps fulfillment and payment states independent', () => {
  assert.deepEqual(status.view({ paymentStatus: 'paid', refundStatus: 'pending' }).paymentLabel, '退款处理中')
  assert.equal(status.view({ paymentStatus: 'paid', refundStatus: 'succeeded' }).paymentLabel, '退款成功')
  assert.equal(status.view({ paymentStatus: 'paid', refundStatus: 'failed' }).paymentLabel, '退款失败')
  assert.equal(status.view({ paymentStatus: 'pending', expiredAt: '2000-01-01T00:00:00.000Z' }).canPay, false)
  assert.equal(status.view({ paymentStatus: 'pending', expiredAt: '2999-01-01T00:00:00.000Z' }).canPay, true)
})

test('payment service never treats requestPayment callback as paid without query', async () => {
  const cloudPath = require.resolve('../miniprogram/utils/cloud-service')
  const paymentPath = require.resolve('../miniprogram/utils/payment-service')
  let calls = []
  require.cache[cloudPath] = { exports: { call(name, action) { calls.push(action); if (action === 'createPayment') return Promise.resolve({ paymentParams: { timeStamp: '1', nonceStr: 'n', package: 'prepay_id=x', signType: 'RSA', paySign: 's' } }); return Promise.resolve({ paymentStatus: 'pending' }) } } }
  delete require.cache[paymentPath]
  global.wx = { requestPayment(options) { options.success({}) } }
  const payment = require(paymentPath)
  const result = await payment.payAndConfirm('ORDER-1')
  assert.equal(result.status, 'pending')
  assert.deepEqual(calls, ['createPayment', 'queryPayment'])
  delete global.wx
  delete require.cache[paymentPath]
  delete require.cache[cloudPath]
})

test('missing payment configuration is explicit and cannot mock success', async () => {
  const cloudPath = require.resolve('../miniprogram/utils/cloud-service')
  const paymentPath = require.resolve('../miniprogram/utils/payment-service')
  require.cache[cloudPath] = { exports: { call() { const error = new Error('not configured'); error.code = 'PAYMENT_NOT_CONFIGURED'; return Promise.reject(error) } } }
  delete require.cache[paymentPath]
  const payment = require(paymentPath)
  const result = await payment.payAndConfirm('ORDER-2')
  assert.equal(result.status, 'unavailable')
  assert.equal(result.error.message, '支付暂未开放')
  delete require.cache[paymentPath]
  delete require.cache[cloudPath]
})

test('prepay creation failure is reported without querying payment status', async () => {
  const cloudPath = require.resolve('../miniprogram/utils/cloud-service')
  const paymentPath = require.resolve('../miniprogram/utils/payment-service')
  const calls = []
  require.cache[cloudPath] = { exports: { call(name, action) { calls.push(action); const error = new Error('微信支付下单失败\n请检查配置'); error.code = 'WECHAT-PAY/API'; return Promise.reject(error) } } }
  delete require.cache[paymentPath]
  const payment = require(paymentPath)
  const result = await payment.payAndConfirm('ORDER-3')
  assert.equal(result.status, 'failed')
  assert.equal(result.stage, 'create_payment')
  assert.deepEqual(result.diagnostic, { code: 'WECHATPAYAPI', message: '微信支付下单失败 请检查配置' })
  assert.deepEqual(calls, ['createPayment'])
  delete require.cache[paymentPath]
  delete require.cache[cloudPath]
})
