const assert = require('assert')

const storage = {}
global.wx = {
  getStorageSync(key) { return storage[key] },
  setStorageSync(key, value) { storage[key] = value }
}

const store = require('../miniprogram/utils/store')

storage[store.STORAGE_KEY] = {
  // This is the pre-scene field that previously caused an automatic pickup
  // item after entering the pickup flow.
  cartItems: [{ id: 'earl-grey:original', productId: 'earl-grey', specId: 'original', quantity: 1, unitPriceFen: 1680 }],
  deliveryCartItems: [{ id: 'fig:sliced', productId: 'fig', specId: 'sliced', quantity: 2, unitPriceFen: 3000 }]
}

assert.deepStrictEqual(store.getCart('pickup'), [], 'legacy unscoped cart must not enter pickup cart')
assert.strictEqual(store.getCart('delivery')[0].productId, 'fig', 'delivery cart remains independent')
assert.strictEqual(store.getCart('delivery')[0].quantity, 2, 'delivery quantity is preserved')

store.setCart('pickup', [{ id: 'milk:standard', productId: 'milk', specId: 'standard', quantity: 1, unitPriceFen: 1980 }])
assert.strictEqual(store.getCart('pickup')[0].productId, 'milk', 'explicit pickup add is retained')
assert.strictEqual(store.getCart('delivery')[0].productId, 'fig', 'pickup writes do not affect delivery cart')

store.patchState({ purchaseScene: 'delivery' })
assert.strictEqual(store.getCart('pickup')[0].productId, 'milk', 'scene switching preserves pickup cart')
assert.strictEqual(store.getCart('delivery')[0].productId, 'fig', 'scene switching preserves delivery cart')

console.log('store cart scope: PASS')
