const assert = require('assert')
const fs = require('fs')
const Module = require('module')
const { listingValues, listingFields } = require('../backend/src/product-listing.cjs')

const legacyOff = { enabled: false, supportsPickup: true, supportsLocalDelivery: true, supportsShipping: true }
assert.deepStrictEqual(listingValues(legacyOff), { pickupListed: false, deliveryListed: false })
assert.deepStrictEqual(listingFields(legacyOff, true, false), { enabled: true, supportsPickup: true, supportsLocalDelivery: false, supportsShipping: false })
assert.deepStrictEqual(listingFields(legacyOff, false, true), { enabled: true, supportsPickup: false, supportsLocalDelivery: true, supportsShipping: true })
assert.deepStrictEqual(listingFields({ enabled: true, supportsPickup: true, supportsLocalDelivery: true, supportsShipping: false }, true, true), { enabled: true, supportsPickup: true, supportsLocalDelivery: true, supportsShipping: false })
assert.deepStrictEqual(listingFields(null, true, false), { enabled: true, supportsPickup: true, supportsLocalDelivery: false, supportsShipping: false })

const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return { DYNAMIC_CURRENT_ENV: 'test', init() {}, database: () => ({ serverDate: () => 'server-date' }) }
  return originalLoad.call(this, request, parent, isMain)
}
const merchant = require('../cloudfunctions/merchant-admin')
Module._load = originalLoad
assert.deepStrictEqual(merchant.bulkListingFields(true), { enabled: true, supportsPickup: true, supportsLocalDelivery: true, supportsShipping: true })
assert.deepStrictEqual(merchant.bulkListingFields(false), { enabled: false, supportsPickup: false, supportsLocalDelivery: false, supportsShipping: false })
assert.strictEqual(merchant.validProductBulkFilters({ listed: true, keyword: '甜点', categoryId: 'dessert' }), true)
assert.strictEqual(merchant.validProductBulkFilters({ listed: true, categoryId: 'bad id' }), false)
assert.strictEqual(merchant.validProductBulkFilters({ listed: 'true' }), false)
assert.strictEqual(merchant.ACTION_PERMISSIONS.bulkSetProductListing, 'products.write')
assert.strictEqual(merchant.ACTION_PERMISSIONS.bulkSetProductSoldOut, 'products.toggleSoldOut')
assert.strictEqual(merchant.validProductBulkSoldOutFilters({ soldOut: true, keyword: '甜点', categoryId: 'dessert' }), true)
assert.strictEqual(merchant.validProductBulkSoldOutFilters({ soldOut: 'true' }), false)
assert.strictEqual(merchant.REQUIRED_DELIVERY_PRODUCT_IDS.has('shipping-required-packaging'), true)
assert.strictEqual(merchant.REQUIRED_DELIVERY_PRODUCT_IDS.has('local-required-notice'), true)
const adminSource = fs.readFileSync(require.resolve('../backend/src/App.tsx'), 'utf8')
assert.match(adminSource, /一键上架当前筛选/)
assert.match(adminSource, /一键下架当前筛选/)
assert.match(adminSource, /配送必拍商品会按业务规则跳过/)
assert.match(adminSource, /adminApi\.bulkSetProductListing\(\{ keyword: filters\.keyword, categoryId: filters\.categoryId \}, listed\)/)
assert.match(adminSource, /一键售罄当前筛选/)
assert.match(adminSource, /adminApi\.bulkSetProductSoldOut/)
console.log('merchant product listing mapping tests passed')
