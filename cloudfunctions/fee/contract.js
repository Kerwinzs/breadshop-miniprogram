function validId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)
}

function validQuantity(value) {
  return Number.isInteger(value) && value > 0 && value <= 99
}

const REQUIRED_SHIPPING_PRODUCT_IDS = Object.freeze([
  'shipping-required-packaging',
  'shipping-required-sf-collect',
  'shipping-required-notice'
])
const ZERO_PRICE_SHIPPING_PRODUCT_IDS = new Set(['shipping-required-sf-collect', 'shipping-required-notice'])
const REQUIRED_LOCAL_PRODUCT_IDS = Object.freeze([
  'local-required-packaging',
  'local-required-delivery-collect',
  'local-required-notice'
])
const ZERO_PRICE_LOCAL_PRODUCT_IDS = new Set(['local-required-delivery-collect', 'local-required-notice'])
const ALL_REQUIRED_PRODUCT_IDS = Object.freeze([...REQUIRED_SHIPPING_PRODUCT_IDS, ...REQUIRED_LOCAL_PRODUCT_IDS])
const ZERO_PRICE_REQUIRED_PRODUCT_IDS = new Set([...ZERO_PRICE_SHIPPING_PRODUCT_IDS, ...ZERO_PRICE_LOCAL_PRODUCT_IDS])

function validateRequiredShippingItems(items, method) {
  const input = Array.isArray(items) ? items : []
  const requiredLines = input.filter((item) => item && ALL_REQUIRED_PRODUCT_IDS.includes(item.productId))
  const expected = method === 'shipping' ? REQUIRED_SHIPPING_PRODUCT_IDS : method === 'local' ? REQUIRED_LOCAL_PRODUCT_IDS : []
  if (!expected.length) return requiredLines.length ? { ok: false, code: 'DELIVERY_REQUIRED_ITEM_NOT_ALLOWED' } : { ok: true }
  if (requiredLines.some((item) => !expected.includes(item.productId))) return { ok: false, code: 'DELIVERY_REQUIRED_ITEM_MISMATCH' }
  for (const productId of expected) {
    const matches = requiredLines.filter((item) => item.productId === productId)
    if (matches.length !== 1 || matches[0].specId !== 'standard' || matches[0].quantity !== 1) return { ok: false, code: 'DELIVERY_REQUIRED_ITEM_MISMATCH' }
  }
  return { ok: true }
}

function canonicalItems(items) {
  if (!Array.isArray(items) || !items.length) return null
  const result = items.map((item) => ({ productId: item && item.productId, specId: item && item.specId, quantity: item && item.quantity }))
  if (result.some((item) => !validId(item.productId) || !validId(item.specId) || !validQuantity(item.quantity))) return null
  result.sort((left, right) => `${left.productId}\u0000${left.specId}`.localeCompare(`${right.productId}\u0000${right.specId}`))
  for (let index = 1; index < result.length; index += 1) {
    if (result[index - 1].productId === result[index].productId && result[index - 1].specId === result[index].specId) return null
  }
  return result
}

function publicAddressSnapshot(address) {
  return {
    addressId: address.addressId || address.id || '',
    contactName: address.contactName || '',
    phone: address.phone || '',
    province: address.province || '',
    city: address.city || '',
    district: address.district || '',
    detail: address.detail || '',
    postalCode: address.postalCode || '',
    fullAddress: address.fullAddress || `${address.province || ''}${address.city || ''}${address.district || ''}${address.detail || ''}`
  }
}

module.exports = { REQUIRED_SHIPPING_PRODUCT_IDS, REQUIRED_LOCAL_PRODUCT_IDS, ALL_REQUIRED_PRODUCT_IDS, ZERO_PRICE_SHIPPING_PRODUCT_IDS, ZERO_PRICE_LOCAL_PRODUCT_IDS, ZERO_PRICE_REQUIRED_PRODUCT_IDS, validateRequiredShippingItems, canonicalItems, publicAddressSnapshot }
