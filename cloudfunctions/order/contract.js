const INTERNAL_KEYS = new Set(['_id', '_openid', 'ownerOpenId', 'operatorId'])
const REQUIRED_SHIPPING_PRODUCT_IDS = Object.freeze([
  'shipping-required-packaging',
  'shipping-required-sf-collect',
  'shipping-required-notice'
])
const ZERO_PRICE_SHIPPING_PRODUCT_IDS = new Set(['shipping-required-sf-collect', 'shipping-required-notice'])
const REQUIRED_LOCAL_PRODUCT_IDS = Object.freeze(['local-required-packaging', 'local-required-delivery-collect', 'local-required-notice'])
const ZERO_PRICE_LOCAL_PRODUCT_IDS = new Set(['local-required-delivery-collect', 'local-required-notice'])
const ALL_REQUIRED_PRODUCT_IDS = Object.freeze([...REQUIRED_SHIPPING_PRODUCT_IDS, ...REQUIRED_LOCAL_PRODUCT_IDS])
const ZERO_PRICE_REQUIRED_PRODUCT_IDS = new Set([...ZERO_PRICE_SHIPPING_PRODUCT_IDS, ...ZERO_PRICE_LOCAL_PRODUCT_IDS])

function hasRegularDeliveryItem(items) {
  return Array.isArray(items) && items.some((item) => item && !ALL_REQUIRED_PRODUCT_IDS.includes(item.productId))
}

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

function validId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)
}

function validQuantity(value) {
  return Number.isInteger(value) && value > 0 && value <= 99
}

function paymentEnabled(env = process.env) {
  return env && env.PAYMENT_ENABLED === 'true'
}

function canonicalItems(items) {
  if (!Array.isArray(items) || !items.length) return null
  const result = items.map((item) => ({
    productId: item && item.productId,
    specId: item && item.specId,
    quantity: item && item.quantity
  }))
  if (result.some((item) => !validId(item.productId) || !validId(item.specId) || !validQuantity(item.quantity))) return null
  result.sort((left, right) => `${left.productId}\u0000${left.specId}`.localeCompare(`${right.productId}\u0000${right.specId}`))
  for (let index = 1; index < result.length; index += 1) {
    if (result[index - 1].productId === result[index].productId && result[index - 1].specId === result[index].specId) return null
  }
  return result
}

function sameItems(left, right) {
  return JSON.stringify(canonicalItems(left)) === JSON.stringify(canonicalItems(right))
}

function toMillis(value) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : NaN
}

function quoteIsUsable(quote, version, now) {
  const calculatedAt = toMillis(quote && quote.calculatedAt)
  const expiresAt = toMillis(quote && quote.expiresAt)
  return Boolean(
    quote &&
    quote.status === 'issued' &&
    quote.feeSnapshotVersion === version &&
    Number.isFinite(calculatedAt) &&
    Number.isFinite(expiresAt) &&
    expiresAt > (now || Date.now()) &&
    expiresAt > calculatedAt
  )
}

function publicHistory(record) {
  return {
    fromStatus: record.fromStatus || null,
    toStatus: record.toStatus,
    source: record.source || record.operatorType || 'system',
    reason: record.reason || '',
    changedAt: record.changedAt || record.createdAt || null
  }
}

function publicAddressSnapshot(address) {
  if (!address) return null
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

function publicStoreSnapshot(store) {
  if (!store) return null
  return {
    storeId: store.storeId || '',
    name: store.name || '',
    addressText: store.addressText || '',
    businessHours: store.businessHours || ''
  }
}

function publicOrder(order, statusHistory) {
  const paymentRequired = order.paymentRequired === true || ['pending', 'paid', 'closed'].includes(order.paymentStatus)
  const result = {
    orderNo: order.orderNo,
    purchaseScene: order.purchaseScene,
    deliveryMethod: order.deliveryMethod || null,
    orderStatus: order.orderStatus,
    paymentRequired,
    paymentStatus: paymentRequired ? (order.paymentStatus || 'pending') : 'not_required',
    payableAmountFen: Number.isInteger(order.payableAmountFen) ? order.payableAmountFen : order.subtotalFen,
    paidAmountFen: Number(order.paidAmountFen || 0),
    refundedAmountFen: Number(order.refundedAmountFen || 0),
    paymentExpiresAt: order.paymentExpiresAt || null,
    paidAt: order.paidAt || null,
    refundStatus: order.refundStatus || 'none',
    storeSnapshot: publicStoreSnapshot(order.storeSnapshot),
    addressSnapshot: publicAddressSnapshot(order.addressSnapshot),
    items: (order.items || []).map((item) => ({
      productId: item.productId,
      productName: item.productName,
      specId: item.specId,
      specName: item.specName,
      unitPriceFen: item.unitPriceFen,
      quantity: item.quantity,
      lineTotalFen: item.lineTotalFen,
      artClass: item.artClass || ''
    })),
    subtotalFen: order.subtotalFen,
    insulationFeeFen: order.insulationFeeFen,
    deliveryFeeFen: order.deliveryFeeFen,
    postageFen: order.postageFen,
    totalFen: order.totalFen,
    feeQuoteSnapshot: order.feeQuoteSnapshot ? {
      status: order.feeQuoteSnapshot.status,
      source: order.feeQuoteSnapshot.source,
      feeSnapshotVersion: order.feeQuoteSnapshot.feeSnapshotVersion,
      quotedAt: order.feeQuoteSnapshot.quotedAt || null,
      expiresAt: order.feeQuoteSnapshot.expiresAt || null
    } : null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    canceledAt: order.canceledAt || null,
    stockReleasedAt: order.stockReleasedAt || null,
    completedAt: order.completedAt || null
  }
  if (Array.isArray(statusHistory)) result.statusHistory = statusHistory.map(publicHistory)
  return result
}

module.exports = { INTERNAL_KEYS, REQUIRED_SHIPPING_PRODUCT_IDS, REQUIRED_LOCAL_PRODUCT_IDS, ALL_REQUIRED_PRODUCT_IDS, ZERO_PRICE_SHIPPING_PRODUCT_IDS, ZERO_PRICE_LOCAL_PRODUCT_IDS, ZERO_PRICE_REQUIRED_PRODUCT_IDS, hasRegularDeliveryItem, validateRequiredShippingItems, validId, validQuantity, paymentEnabled, canonicalItems, sameItems, toMillis, quoteIsUsable, publicHistory, publicAddressSnapshot, publicOrder }
