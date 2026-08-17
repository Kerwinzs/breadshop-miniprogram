function toProductId(raw) { return raw && (raw.productId || raw.id || raw._id) }

function normalizeProduct(raw) {
  if (!raw || typeof raw !== 'object') return null
  const productId = toProductId(raw)
  if (!productId) return null
  const supportsLocal = raw.supportsLocalDelivery !== undefined ? raw.supportsLocalDelivery !== false : raw.supportsLocal !== false
  const specs = Array.isArray(raw.specs) ? raw.specs.map((spec) => ({
    id: spec.id || spec.specId,
    specId: spec.specId || spec.id,
    name: spec.name || '',
    extraFeeFen: Number(spec.extraFeeFen) || 0,
    enabled: spec.enabled !== false
  })).filter((spec) => spec.id) : []
  return Object.assign({}, raw, {
    id: productId,
    productId,
    soldOut: raw.soldOut === true,
    enabled: raw.enabled !== false,
    supportsPickup: raw.supportsPickup !== undefined ? raw.supportsPickup !== false : supportsLocal,
    supportsLocalDelivery: supportsLocal,
    supportsShipping: raw.supportsShipping !== false,
    // 兼容当前页面和旧本地购物车逻辑；新代码应使用语义更明确的字段。
    supportsLocal,
    specs
  })
}

function addressText(raw) {
  if (!raw) return ''
  if (typeof raw.address === 'string') return raw.address
  if (raw.addressText) return raw.addressText
  const address = raw.address || {}
  return [address.province, address.city, address.district, address.detail].filter(Boolean).join('')
}

function normalizeStore(raw) {
  if (!raw || typeof raw !== 'object') return null
  const storeId = raw.storeId || raw.id || raw._id
  if (!storeId) return null
  return Object.assign({}, raw, {
    id: storeId,
    storeId,
    address: addressText(raw),
    status: raw.status === 'closed' ? 'closed' : 'open',
    enabled: raw.enabled !== false,
    distanceText: raw.distanceText || ''
  })
}

module.exports = { normalizeProduct, normalizeStore }
