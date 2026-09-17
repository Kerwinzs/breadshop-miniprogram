const assert = require('assert')
const fs = require('fs')
const path = require('path')
const Module = require('module')

const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return { DYNAMIC_CURRENT_ENV: 'test', init() {}, database: () => ({ serverDate: () => 'server-date' }) }
  return originalLoad.call(this, request, parent, isMain)
}
const merchant = require('../cloudfunctions/merchant-admin/index')
Module._load = originalLoad

assert.deepStrictEqual(merchant.PAYMENT_STATUSES, ['pending', 'paid', 'closed'])
assert.deepStrictEqual(merchant.REFUND_STATUSES, ['none', 'pending', 'succeeded', 'failed'])
assert.strictEqual(merchant.ACTION_PERMISSIONS.retryRefund, 'refunds.retry')
assert.deepStrictEqual(merchant.paymentProjection({ totalFen: 1800 }), { paymentRequired: false, paymentStatus: 'not_required', refundStatus: 'none', payableAmountFen: 0, paidAmountFen: 0, refundedAmountFen: 0, paidAt: null, refundRequestedAt: null, refundedAt: null })
assert.deepStrictEqual(merchant.paymentProjection({ totalFen: 1800, paymentStatus: 'paid', refundStatus: 'pending', payableAmountFen: 1800, paidAmountFen: 1800, refundedAmountFen: 0 }).paymentStatus, 'paid')
assert.strictEqual(merchant.dtoOrder({ orderNo: 'B1', orderStatus: 'placed', totalFen: 1800 }, false, false).paymentStatus, undefined, 'payment fields require payments.read projection')
assert.strictEqual(merchant.dtoOrder({ orderNo: 'B1', orderStatus: 'placed', paymentRequired: true, paymentStatus: 'pending', totalFen: 1800 }, false, true).paymentStatus, 'pending')

const source = fs.readFileSync(path.join(__dirname, '..', 'cloudfunctions', 'merchant-admin', 'index.js'), 'utf8')
assert.ok(source.includes("return fail('ORDER_NOT_PAID'"), 'merchant must reject production before payment')
assert.ok(source.includes("process.env.MERCHANT_REFUND_REQUEST_MODE !== 'queue'"), 'refund enqueue needs explicit configuration')
assert.ok(source.includes("action === 'configurationStatus'"), 'merchant payment configuration needs a non-sensitive health check')
assert.ok(source.includes("refundQueueEnabled: process.env.MERCHANT_REFUND_REQUEST_MODE === 'queue'"), 'refund queue health check must fail closed')
assert.ok(source.includes("refundStatus: 'pending'"), 'paid cancellation must enqueue, not claim refund success')
assert.ok(source.includes("paymentStatus: 'closed'"), 'unpaid cancellation must close payment')
assert.ok(source.includes("!actor.permissions.includes('refunds.create')"), 'paid cancellation needs refunds.create')
assert.ok(source.includes("const refundNo = `R${order.orderNo}`"), 'merchant must use the payment-domain refund number contract')
assert.ok(source.includes("find('refunds', 'refundNo', refundNo"), 'refund retry must query the shared refund number')
assert.ok(source.includes("if (!order.stockReleasedAt) await restoreStock"), 'cancel must not restore stock twice')
assert.ok(source.includes("stockReleasedAt: db.serverDate()"), 'stock release marker must be persisted in the cancellation transaction')
assert.ok(!source.includes('payerOpenId'), 'merchant refund boundary must not retain payer identifiers')

console.log('merchant payment contract passed')
