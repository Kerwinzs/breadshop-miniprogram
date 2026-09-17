const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')

const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return { DYNAMIC_CURRENT_ENV: 'test', init() {}, database() { return {} } }
  return originalLoad.call(this, request, parent, isMain)
}
const { PAYMENT_PATH, REFUND_PATH, rawBodyOf, createHttpHandler } = require('../cloudfunctions/payment/http')
Module._load = originalLoad

test('HTTP callback adapter preserves plain and base64 body bytes', () => {
  const json = '{"id":"evt","value":"面包"}'
  assert.deepEqual(rawBodyOf({ body: json }), Buffer.from(json))
  assert.deepEqual(rawBodyOf({ body: Buffer.from(json).toString('base64'), isBase64Encoded: true }), Buffer.from(json))
})

test('HTTP callback routes verified payloads and returns WeChat acknowledgement', async () => {
  const calls = []
  const handler = createHttpHandler({ serviceFactory: () => ({
    async handlePaymentNotification(input) { calls.push(['payment', input]) },
    async handleRefundNotification(input) { calls.push(['refund', input]) }
  }), logger: { error() {} } })
  const headers = { 'Wechatpay-Signature': 'opaque' }
  const paid = await handler({ httpMethod: 'POST', path: PAYMENT_PATH, headers, body: '{"id":"pay"}' })
  const refunded = await handler({ httpMethod: 'POST', path: REFUND_PATH, headers, body: '{"id":"refund"}' })
  assert.equal(paid.statusCode, 200)
  assert.equal(refunded.statusCode, 200)
  assert.deepEqual(calls.map(([kind]) => kind), ['payment', 'refund'])
  assert.equal(calls[0][1].rawBody.toString(), '{"id":"pay"}')
})

test('HTTP callback rejects wrong method, unknown path and invalid notification without leaking details', async () => {
  const handler = createHttpHandler({ serviceFactory: () => ({ async handlePaymentNotification() { throw Object.assign(new Error('secret detail'), { code: 'INVALID_WECHATPAY_SIGNATURE' }) } }), logger: { error() {} } })
  assert.equal((await handler({ httpMethod: 'GET', path: PAYMENT_PATH })).statusCode, 405)
  assert.equal((await handler({ httpMethod: 'POST', path: '/other', body: '{}' })).statusCode, 404)
  const rejected = await handler({ httpMethod: 'POST', path: PAYMENT_PATH, body: '{}', headers: {} })
  assert.equal(rejected.statusCode, 400)
  assert.equal(rejected.body.includes('secret detail'), false)
})
