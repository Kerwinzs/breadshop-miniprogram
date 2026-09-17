const assert = require('assert')
const fs = require('fs')
const path = require('path')
const orderContract = require('../cloudfunctions/order/contract')
const feeContract = require('../cloudfunctions/fee/contract')

const root = path.join(__dirname, '..')
const orderSource = fs.readFileSync(path.join(root, 'cloudfunctions/order/index.js'), 'utf8')
const feeSource = fs.readFileSync(path.join(root, 'cloudfunctions/fee/index.js'), 'utf8')
const addressSource = fs.readFileSync(path.join(root, 'cloudfunctions/address/index.js'), 'utf8')

const items = [
  { productId: 'bread', specId: 'original', quantity: 2 },
  { productId: 'coffee', specId: 'standard', quantity: 1 }
]
assert.deepStrictEqual(orderContract.canonicalItems(items), [items[0], items[1]])
assert.strictEqual(orderContract.sameItems(items, [{ productId: 'coffee', specId: 'standard', quantity: 1 }, items[0]]), true)
assert.strictEqual(orderContract.sameItems(items, [{ productId: 'bread', specId: 'original', quantity: 3 }, items[1]]), false, 'quantity tampering must invalidate a quote')
assert.strictEqual(orderContract.sameItems(items, items.concat(items[0])), false, 'duplicate lines must be rejected')
assert.strictEqual(orderContract.paymentEnabled({ PAYMENT_ENABLED: 'true' }), true, 'payment switch must require exact true')
assert.strictEqual(orderContract.paymentEnabled({ PAYMENT_ENABLED: 'TRUE' }), false, 'payment switch must fail closed for non-exact values')
assert.strictEqual(orderContract.paymentEnabled({}), false, 'payment switch must fail closed when absent')

const now = Date.now()
const validQuote = { status: 'issued', feeSnapshotVersion: 'delivery-required-products-v4', calculatedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 1000).toISOString() }
assert.strictEqual(orderContract.quoteIsUsable(validQuote, 'delivery-required-products-v4', now), true)
assert.strictEqual(orderContract.quoteIsUsable(Object.assign({}, validQuote, { expiresAt: new Date(now - 1).toISOString() }), 'delivery-required-products-v4', now), false, 'expired quote must be rejected')
assert.strictEqual(orderContract.quoteIsUsable(Object.assign({}, validQuote, { status: 'consumed' }), 'delivery-required-products-v4', now), false, 'replayed quote must be rejected')
assert.strictEqual(orderContract.quoteIsUsable(validQuote, 'another-version', now), false, 'old quote version must be rejected')
const requiredShippingItems = orderContract.REQUIRED_SHIPPING_PRODUCT_IDS.map((productId) => ({ productId, specId: 'standard', quantity: 1 }))
assert.deepStrictEqual(orderContract.validateRequiredShippingItems(requiredShippingItems, 'shipping'), { ok: true })
assert.strictEqual(orderContract.hasRegularDeliveryItem(requiredShippingItems), false, 'required products alone must not create a delivery order')
assert.strictEqual(orderContract.hasRegularDeliveryItem(requiredShippingItems.concat(items[0])), true)
assert.strictEqual(orderContract.validateRequiredShippingItems(requiredShippingItems.slice(0, 2), 'shipping').code, 'DELIVERY_REQUIRED_ITEM_MISMATCH')
assert.strictEqual(orderContract.validateRequiredShippingItems(requiredShippingItems.concat({ productId: 'shipping-required-notice', specId: 'another', quantity: 1 }), 'shipping').code, 'DELIVERY_REQUIRED_ITEM_MISMATCH')
const requiredLocalItems = orderContract.REQUIRED_LOCAL_PRODUCT_IDS.map((productId) => ({ productId, specId: 'standard', quantity: 1 }))
assert.deepStrictEqual(orderContract.validateRequiredShippingItems(requiredLocalItems, 'local'), { ok: true })
assert.strictEqual(orderContract.validateRequiredShippingItems(requiredShippingItems, 'local').code, 'DELIVERY_REQUIRED_ITEM_MISMATCH')
assert.deepStrictEqual([...orderContract.ZERO_PRICE_SHIPPING_PRODUCT_IDS].sort(), ['shipping-required-notice', 'shipping-required-sf-collect'])
assert.deepStrictEqual(feeContract.REQUIRED_SHIPPING_PRODUCT_IDS, orderContract.REQUIRED_SHIPPING_PRODUCT_IDS, 'fee and order must share the same stable required product ids')
assert.deepStrictEqual(feeContract.REQUIRED_LOCAL_PRODUCT_IDS, orderContract.REQUIRED_LOCAL_PRODUCT_IDS, 'fee and order must share the same local required product ids')
assert.deepStrictEqual(feeContract.validateRequiredShippingItems(requiredShippingItems, 'shipping'), { ok: true })

const publicDto = orderContract.publicOrder({
  orderNo: 'B123', ownerOpenId: 'owner-a', _openid: 'owner-a', purchaseScene: 'delivery', deliveryMethod: 'local', orderStatus: 'placed',
  addressSnapshot: { _id: 'address-doc', ownerOpenId: 'owner-a', addressId: 'address-1', contactName: '顾客', phone: '13800000000', province: '山东省', city: '青岛市', district: '崂山区', detail: '面包路 1 号' },
  items: [{ productId: 'bread', productName: '面包', specId: 'original', specName: '原味', unitPriceFen: 100, quantity: 1, lineTotalFen: 100 }], subtotalFen: 100, insulationFeeFen: 200, deliveryFeeFen: 600, postageFen: 0, totalFen: 900,
  createdAt: 'now', updatedAt: 'now', feeQuoteSnapshot: { quoteId: 'quote-1', source: 'mock', feeSnapshotVersion: 'mock-cloud1-v1' }
}, [{ fromStatus: null, toStatus: 'placed', operatorId: 'owner-a', operatorType: 'customer', reason: '', createdAt: 'now' }])
const dtoJson = JSON.stringify(publicDto)
assert.strictEqual(dtoJson.includes('ownerOpenId'), false, 'order DTO must not expose ownerOpenId')
assert.strictEqual(dtoJson.includes('_openid'), false, 'order DTO must not expose _openid')
assert.strictEqual(dtoJson.includes('operatorId'), false, 'history DTO must not expose operatorId')
assert.strictEqual(dtoJson.includes('address-doc'), false, 'order DTO must not expose internal document ids')
const shippingDto = orderContract.publicOrder({ orderNo: 'S1', purchaseScene: 'delivery', deliveryMethod: 'shipping', orderStatus: 'placed', items: [{ productId: 'shipping-required-packaging', productName: '包装泡沫冰袋', specId: 'standard', specName: '标准规格', unitPriceFen: 300, quantity: 1, lineTotalFen: 300 }, { productId: 'shipping-required-sf-collect', productName: '默认顺丰特快到付', specId: 'standard', specName: '标准规格', unitPriceFen: 0, quantity: 1, lineTotalFen: 0 }], subtotalFen: 300, insulationFeeFen: 0, deliveryFeeFen: 0, postageFen: 0, totalFen: 300 })
assert.strictEqual(shippingDto.items[0].productId, 'shipping-required-packaging')
assert.strictEqual(shippingDto.totalFen, shippingDto.subtotalFen, 'shipping order total includes required products but excludes prepaid fees')
assert.strictEqual(Object.prototype.hasOwnProperty.call(shippingDto, 'shippingIncludedItems'), false, 'shipping required products belong to normal order items')

assert.ok(orderSource.includes('db.runTransaction'), 'order writes must use a transaction')
assert.ok(orderSource.includes("transaction.collection('orderStatusHistory').add"), 'order history must be written inside the transaction')
assert.ok(orderSource.includes('clientRequestId'), 'order creation must retain clientRequestId idempotency')
assert.ok(orderSource.includes("quote.status === 'consumed'"), 'a quote must be one-time use')
assert.ok(orderSource.includes('FEE_QUOTE_MISMATCH'), 'server must reject quote tampering')
assert.ok(orderSource.includes("scene === 'delivery' ? (event.feeQuoteId || (event.feeQuote && event.feeQuote.quoteId)) : ''"), 'pickup orders must not dereference a missing fee quote')
assert.ok(feeSource.includes("db.collection('feeQuotes').add"), 'fee quote must be persisted server-side')
assert.ok(feeSource.includes("method === 'local' ? INSULATION_FEE_FEN : 0"), 'shipping quote must not charge insulation')
assert.ok(feeSource.includes("method === 'local' ? LOCAL_DELIVERY_FEE_FEN : 0"), 'shipping quote must not charge transport upfront')
assert.ok(orderSource.includes('validateRequiredShippingItems(inputItems'), 'order service must validate required shipping products')
assert.ok(orderSource.includes("fail('DELIVERY_REGULAR_ITEM_REQUIRED'"), 'order service must reject delivery orders without regular merchandise')
assert.ok(orderSource.includes("action === 'configurationStatus'"), 'order service must expose a non-sensitive payment switch health check')
assert.ok(orderSource.includes("ZERO_PRICE_REQUIRED_PRODUCT_IDS.has(product.productId) ? 0"), 'order service must force delivery notice and collect-on-delivery products to zero')
assert.ok(feeSource.includes('validateRequiredShippingItems(inputItems'), 'fee service must validate required shipping products')
assert.ok(addressSource.includes('await touchUserLock(transaction, owner)'), 'default address writes must serialize on the user lock')
assert.ok(addressSource.includes('db.runTransaction'), 'default address writes must use a transaction')

console.log('backend contract smoke: PASS')
