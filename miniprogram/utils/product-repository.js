const local = require('./catalog-local')
const remote = require('./catalog-remote')
const cache = require('./catalog-cache')
const { normalizeProduct } = require('./catalog-normalizer')

let lastRead = { source: 'local', degraded: false, error: null }
function localResult(items, error) { lastRead = { source: 'local', degraded: !!error, error: error || null }; return { items, source: 'local', degraded: !!error, error: error || null } }
function remoteResult(items) { if (!items.length) throw new Error('云端商品目录为空'); cache.putProducts(items); lastRead = { source: 'remote', degraded: false, error: null }; return { items, source: 'remote', degraded: false, error: null } }
function list() {
  return remote.listProducts().then((data) => remoteResult((data.products || data.items || []).map(normalizeProduct).filter(Boolean))).catch((error) => localResult(local.listProducts(), error))
}
function get(productId) {
  return remote.getProduct(productId).then((data) => {
    const item = normalizeProduct(data.product || data.item || data)
    if (!item) throw new Error('云端商品不存在')
    cache.putProducts([item]); lastRead = { source: 'remote', degraded: false, error: null }; return item
  }).catch((error) => { const item = local.getProduct(productId); lastRead = { source: 'local', degraded: true, error }; return item })
}
function getCached(productId) { return cache.getProduct(productId) || local.getProduct(productId) }
function getLastRead() { return lastRead }

module.exports = { list, get, getCached, getLastRead }
