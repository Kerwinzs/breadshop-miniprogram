const assert = require('assert')
const { safeSummary } = require('./tools/dev-regression/cloud-service-observed')

const summary = safeSummary({
  error: { code: 'STORE_NOT_FOUND', message: '门店不存在' },
  phone: '13800000000',
  address: { detail: '面包路 1 号' },
  _openid: 'openid-secret',
  longText: 'x'.repeat(2000)
})

assert.ok(summary.includes('STORE_NOT_FOUND'))
assert.ok(summary.includes('门店不存在'))
assert.ok(!summary.includes('13800000000'))
assert.ok(!summary.includes('面包路 1 号'))
assert.ok(!summary.includes('openid-secret'))
assert.ok(summary.length <= 1201)

const errorSummary = safeSummary(Object.assign(new Error('网络失败'), { code: 'NETWORK_ERROR', requestID: 'transport-1' }))
assert.ok(errorSummary.includes('NETWORK_ERROR'))
assert.ok(errorSummary.includes('网络失败'))
assert.ok(errorSummary.includes('transport-1'))

console.log('cloud service observed summary: PASS')
