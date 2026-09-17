const CATEGORY = '拍前必读'
const REQUIRED_PRODUCTS = [
  { productId: 'shipping-required-packaging', fallbackName: '包装泡沫冰袋', catalogPrice: true, methods: ['shipping'] },
  { productId: 'shipping-required-notice', fallbackName: '拍前必读', catalogPrice: false, methods: ['shipping'] },
  { productId: 'shipping-required-sf-collect', fallbackName: '默认顺丰特快到付', catalogPrice: false, methods: ['shipping'] },
  { productId: 'local-required-packaging', fallbackName: '同城外卖打包费', catalogPrice: true, methods: ['local'] },
  { productId: 'local-required-delivery-collect', fallbackName: '同城配送费到付', catalogPrice: false, methods: ['local'] },
  { productId: 'local-required-notice', fallbackName: '外卖拍前必读', catalogPrice: false, methods: ['local'] }
]
const REQUIRED_PRODUCT_IDS = REQUIRED_PRODUCTS.map((item) => item.productId)

function isShippingRequiredItem(item) {
  return !!item && REQUIRED_PRODUCT_IDS.includes(item.productId)
}

function hasRegularDeliveryItem(items) {
  return Array.isArray(items) && items.some((item) => item && !isShippingRequiredItem(item))
}

function createShippingRequiredItems(products, method = 'shipping') {
  const catalog = Array.isArray(products) ? products : []
  const requiredForMethod = REQUIRED_PRODUCTS.filter((item) => item.methods.includes(method))
  const requiredIds = requiredForMethod.map((item) => item.productId)
  const configured = catalog.filter((item) => item && requiredIds.includes(item.id)).sort((left, right) => (Number(left.sortOrder) || 0) - (Number(right.sortOrder) || 0))
  const configuredIds = new Set(configured.map((item) => item.id))
  const ordered = configured.map((product) => requiredForMethod.find((item) => item.productId === product.id)).concat(requiredForMethod.filter((item) => !configuredIds.has(item.productId)))
  return ordered.map((required) => {
    const product = catalog.find((item) => item && item.id === required.productId)
    const standard = product && (product.specs || []).find((item) => item.id === 'standard')
    return { id: `${required.productId}:standard`, productId: required.productId, specId: 'standard', specName: (standard && standard.name) || '标准规格', name: (product && product.name) || required.fallbackName, desc: (product && (product.detailDesc || product.desc)) || '', unitPriceFen: required.catalogPrice && product ? Number(product.deliveryPriceFen) || 0 : 0, quantity: 1, category: CATEGORY, sortOrder: product ? Number(product.sortOrder) || 0 : 0, shippingRequired: true, locked: true, artClass: (product && product.artClass) || '' }
  })
}

function reconcileShippingCart(items, method, products) {
  const regular = (Array.isArray(items) ? items : []).filter((item) => !isShippingRequiredItem(item))
  if (!['local', 'shipping'].includes(method)) return regular
  return regular.concat(createShippingRequiredItems(products, method))
}

module.exports = { CATEGORY, REQUIRED_PRODUCTS, REQUIRED_PRODUCT_IDS, isShippingRequiredItem, hasRegularDeliveryItem, createShippingRequiredItems, reconcileShippingCart }
