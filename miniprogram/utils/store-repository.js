const local = require('./catalog-local')
const remote = require('./catalog-remote')
const cache = require('./catalog-cache')
const { normalizeStore } = require('./catalog-normalizer')

let lastRead = { source: 'local', degraded: false, error: null }
function localResult(items, error) { lastRead = { source: 'local', degraded: !!error, error: error || null }; return { items, source: 'local', degraded: !!error, error: error || null } }
function remoteResult(items) { if (!items.length) throw new Error('云端门店目录为空'); cache.putStores(items); lastRead = { source: 'remote', degraded: false, error: null }; return { items, source: 'remote', degraded: false, error: null } }
function list() {
  return remote.listStores().then((data) => remoteResult((data.stores || data.items || []).map(normalizeStore).filter(Boolean))).catch((error) => localResult(local.listStores(), error))
}
function get(storeId) {
  return remote.getStore(storeId).then((data) => {
    const item = normalizeStore(data.store || data.item || data)
    if (!item) throw new Error('云端门店不存在')
    cache.putStores([item]); lastRead = { source: 'remote', degraded: false, error: null }; return item
  }).catch((error) => { const item = local.getStore(storeId); lastRead = { source: 'local', degraded: true, error }; return item })
}
function getCached(storeId) { return cache.getStore(storeId) || local.getStore(storeId) }
function getLastRead() { return lastRead }

module.exports = { list, get, getCached, getLastRead }
