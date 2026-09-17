const assert = require('assert')
const Module = require('module')
const orderContract = require('../cloudfunctions/order/contract')
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return { DYNAMIC_CURRENT_ENV: 'test', init() {}, database: () => ({ serverDate: () => 'server-date' }) }
  return originalLoad.call(this, request, parent, isMain)
}
const merchant = require('../cloudfunctions/merchant-admin/index')
Module._load = originalLoad
const paymentView = require('../miniprogram/utils/payment-status')

const legacy = { orderNo: 'B-LEGACY', orderStatus: 'placed', totalFen: 1800, subtotalFen: 1800, items: [] }
const legacyDto = orderContract.publicOrder(legacy, [])
assert.strictEqual(legacyDto.paymentRequired, false)
assert.strictEqual(legacyDto.paymentStatus, 'not_required')
assert.strictEqual(paymentView.view(legacyDto).paymentLabel, '历史免支付')
assert.strictEqual(paymentView.view(legacyDto).canPay, false)

const merchantProjection = merchant.paymentProjection(legacy)
assert.strictEqual(merchantProjection.paymentRequired, false)
assert.strictEqual(merchantProjection.paymentStatus, 'not_required')
assert.strictEqual(merchantProjection.paidAmountFen, 0)
assert.strictEqual(merchantProjection.refundedAmountFen, 0)

const paid = { ...legacy, paymentRequired: true, paymentStatus: 'paid', paidAmountFen: 1800 }
assert.strictEqual(merchant.paymentProjection(paid).paymentStatus, 'paid')
assert.strictEqual(merchant.paymentProjection(paid).paidAmountFen, 1800)

assert.strictEqual(orderContract.paymentEnabled({ PAYMENT_ENABLED: 'true' }), true)
assert.strictEqual(orderContract.paymentEnabled({ PAYMENT_ENABLED: 'TRUE' }), false)
assert.strictEqual(orderContract.paymentEnabled({}), false, 'payment rollout must fail closed until server flag is enabled')

console.log('payment legacy compatibility passed')
