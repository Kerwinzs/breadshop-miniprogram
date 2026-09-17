const assert = require('assert')
const fs = require('fs')
const path = require('path')
const required = require('../miniprogram/utils/shipping-required-items')

const catalog = [
  { id: 'shipping-required-packaging', name: '商家自定义冰袋', desc: '商家描述', deliveryPriceFen: 350, sortOrder: 2, specs: [{ id: 'standard', name: '标准包装' }], artClass: 'art-blue' },
  { id: 'shipping-required-notice', name: '商家必读', deliveryPriceFen: 999, sortOrder: 1, specs: [{ id: 'standard', name: '请阅读' }] },
  { id: 'local-required-packaging', name: '商家自定义外卖打包', deliveryPriceFen: 250, sortOrder: 2, specs: [{ id: 'standard', name: '标准打包' }] },
  { id: 'local-required-notice', name: '外卖须知', deliveryPriceFen: 999, sortOrder: 1, specs: [{ id: 'standard', name: '请阅读' }] }
]
const regular = { id: 'bread:standard', productId: 'bread', specId: 'standard', name: '面包', unitPriceFen: 1200, quantity: 2 }
const shipping = required.reconcileShippingCart([regular], 'shipping', catalog)
assert.strictEqual(shipping.length, 4)
assert.deepStrictEqual(shipping.slice(1).map((item) => item.productId), ['shipping-required-notice', 'shipping-required-packaging', 'shipping-required-sf-collect'])
assert.deepStrictEqual(shipping.slice(1).map((item) => item.quantity), [1, 1, 1])
assert.strictEqual(shipping[1].name, '商家必读')
assert.strictEqual(shipping[2].name, '商家自定义冰袋')
assert.strictEqual(shipping[2].specName, '标准包装')
assert.strictEqual(shipping[2].unitPriceFen, 350)
assert.strictEqual(shipping[1].unitPriceFen, 0)
assert.strictEqual(shipping[3].unitPriceFen, 0)
const local = required.reconcileShippingCart(shipping, 'local', catalog)
assert.deepStrictEqual(local.slice(1).map((item) => item.productId), ['local-required-notice', 'local-required-packaging', 'local-required-delivery-collect'])
assert.strictEqual(local[2].unitPriceFen, 250)
assert.strictEqual(local[1].unitPriceFen, 0)
assert.strictEqual(local[3].unitPriceFen, 0)
assert.strictEqual(required.isShippingRequiredItem({ productId: 'bread', name: '包装泡沫冰袋' }), false)
assert.strictEqual(required.hasRegularDeliveryItem(shipping), true)
assert.strictEqual(required.hasRegularDeliveryItem(shipping.slice(1)), false, 'only required products must not count as merchandise')

const deliveryProductsWxml = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/delivery-products/delivery-products.wxml'), 'utf8')
const deliveryProductsJs = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/delivery-products/delivery-products.js'), 'utf8')
assert.ok(!deliveryProductsWxml.includes('保温包装费 ¥2.00'), '同城商品页不得展示旧的固定保温包装费')
assert.ok(deliveryProductsJs.includes("fee.status === 'ready' ? '配送费到付'"), '同城商品页地址可配送时应显示配送费到付')
console.log('shipping required items: PASS')
