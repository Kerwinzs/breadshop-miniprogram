const mock = require('./mock')
const cache = require('./catalog-cache')
const { normalizeProduct, normalizeStore } = require('./catalog-normalizer')

function listProducts() {
  const items = mock.products.map(normalizeProduct).filter(Boolean)
  cache.putProducts(items)
  return items
}
function getProduct(id) { return listProducts().find((item) => item.id === id) || null }
function listStores() {
  const items = mock.stores.map(normalizeStore).filter(Boolean)
  cache.putStores(items)
  return items
}
function getStore(id) { return listStores().find((item) => item.id === id) || null }

module.exports = { listProducts, getProduct, listStores, getStore }
