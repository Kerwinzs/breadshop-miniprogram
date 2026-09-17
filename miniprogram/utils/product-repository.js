const local = require('./catalog-local')
const remote = require('./catalog-remote')
const cache = require('./catalog-cache')
const { normalizeProduct } = require('./catalog-normalizer')

let lastRead = { source: 'local', degraded: false, error: null }
const SHIPPING_REQUIRED_IDS = ['shipping-required-packaging', 'shipping-required-notice', 'shipping-required-sf-collect', 'local-required-packaging', 'local-required-delivery-collect', 'local-required-notice']
function categoryNamesOf(item) { return Array.isArray(item.categoryNames) && item.categoryNames.length ? item.categoryNames : [item.category].filter(Boolean) }
function categoriesOf(items) { return [...new Set(items.flatMap(categoryNamesOf))] }
function withShippingRequiredFallback(items, scene, method) {
  if (scene !== 'delivery' || !['local', 'shipping'].includes(method)) return items
  const result = items.slice(), existing = new Set(result.map((item) => item.id))
  local.listProducts().filter((item) => SHIPPING_REQUIRED_IDS.includes(item.id) && (method === 'shipping' ? item.supportsShipping !== false : item.supportsLocalDelivery !== false)).forEach((item) => { if (!existing.has(item.id)) result.push(item) })
  return result
}
function localResult(items, error) { lastRead = { source: 'local', degraded: !!error, error: error || null }; return { items, categories: categoriesOf(items), source: 'local', degraded: !!error, error: error || null } }
function remoteResult(items, categories) { cache.putProducts(items); lastRead = { source: 'remote', degraded: false, error: null }; return { items, categories: Array.isArray(categories) ? categories.filter((name) => items.some((item) => categoryNamesOf(item).includes(name))) : categoriesOf(items), source: 'remote', degraded: false, error: null } }
function availableFor(item, scene, method) { return item.enabled !== false && (scene === 'pickup' ? item.supportsPickup !== false : (method === 'shipping' ? item.supportsShipping !== false : item.supportsLocalDelivery !== false)) }
function list(scene, method) {
  return remote.listProducts(scene, method).then((data) => { const items = withShippingRequiredFallback((data.products || data.items || []).map(normalizeProduct).filter((item) => item && availableFor(item, scene, method)), scene, method); return remoteResult(items, data.categories) }).catch((error) => localResult(local.listProducts().filter((item) => availableFor(item, scene, method)), error))
}
function listHomeRecommendations() {
  return remote.listHomeRecommendations().then((data) => remoteResult((data.products || []).map(normalizeProduct).filter(Boolean), [])).catch((error) => localResult(local.listProducts().slice(0, 4), error))
}
function get(productId, scene, method) {
  return remote.getProduct(productId, scene, method).then((data) => {
    const item = normalizeProduct(data.product || data.item || data)
    if (!item || !availableFor(item, scene, method)) throw new Error('云端商品不存在')
    cache.putProducts([item]); lastRead = { source: 'remote', degraded: false, error: null }; return item
  }).catch((error) => { const item = local.getProduct(productId); lastRead = { source: 'local', degraded: true, error }; return item && availableFor(item, scene, method) ? item : null })
}
function getCached(productId) { return cache.getProduct(productId) || local.getProduct(productId) }
function getLastRead() { return lastRead }

module.exports = { list, listHomeRecommendations, get, getCached, getLastRead }
