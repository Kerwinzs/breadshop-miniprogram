const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const MAX_LIST_SIZE = 100

function ok(data) { return { ok: true, data } }
function fail(code, message) { return { ok: false, error: { code, message } } }
function validId(value) { return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value) }
function requireOpenId() {
  const context = cloud.getWXContext()
  return context && context.OPENID
}
function productDto(doc) {
  return {
    id: doc.productId || doc._id,
    productId: doc.productId || doc._id,
    name: doc.name || '',
    desc: doc.desc || '',
    detailDesc: doc.detailDesc || '',
    category: doc.category || '',
    categoryIds: Array.isArray(doc.categoryIds) ? doc.categoryIds.filter(validId).slice(0, 2) : [],
    categoryNames: Array.isArray(doc.categoryNames) ? doc.categoryNames : [],
    artClass: doc.artClass || '',
    imageUrls: Array.isArray(doc.imageUrls) ? doc.imageUrls : [],
    priceFen: Number(doc.priceFen) || 0,
    deliveryPriceFen: Number(doc.deliveryPriceFen) || 0,
    stockQuantity: Number.isInteger(doc.stockQuantity) ? doc.stockQuantity : null,
    soldOut: doc.soldOut === true,
    supportsPickup: doc.supportsPickup !== false,
    supportsLocalDelivery: doc.supportsLocalDelivery !== false,
    supportsShipping: doc.supportsShipping !== false,
    specs: (Array.isArray(doc.specs) ? doc.specs : []).filter((spec) => spec && spec.enabled !== false).map((spec) => ({ specId: spec.specId || spec.id, name: spec.name || '', extraFeeFen: Number(spec.extraFeeFen) || 0, enabled: true })),
    sortOrder: Number(doc.sortOrder) || 0,
    homeRecommended: doc.homeRecommended === true,
    homeRecommendOrder: Number(doc.homeRecommendOrder) || 0,
    version: Number(doc.version) || 1
  }
}
function storeDto(doc) {
  const address = doc.address
  const addressText = typeof address === 'string' ? address : (doc.addressText || [address && address.province, address && address.city, address && address.district, address && address.detail].filter(Boolean).join(''))
  return { id: doc.storeId || doc._id, storeId: doc.storeId || doc._id, name: doc.name || '', address: addressText, addressObject: typeof address === 'object' && address ? address : null, businessHours: doc.businessHours || '', status: doc.status === 'closed' ? 'closed' : 'open', distanceText: doc.distanceText || '' }
}

async function listCategories(products) {
  try {
    const names = new Set((products || []).map((item) => item.category).filter(Boolean))
    const result = await db.collection('productCategories').where({ enabled: true }).orderBy('sortOrder', 'asc').limit(MAX_LIST_SIZE).get()
    return (result.data || []).filter((item) => names.has(item.name) || products.some((product) => Array.isArray(product.categoryIds) && product.categoryIds.includes(item.categoryId || item._id))).sort(compareCategoryOrder).map((item) => item.name).filter(Boolean)
  } catch (error) {
    console.warn('productCategories unavailable, deriving from products', error && error.message)
    return [...new Set((products || []).map((item) => item.category).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'zh-CN'))
  }
}
function availableFor(doc, scene, method) {
  if (doc.enabled === false) return false
  if (scene === 'pickup') return doc.supportsPickup !== false
  if (scene === 'delivery' && method === 'local') return doc.supportsLocalDelivery !== false
  if (scene === 'delivery' && method === 'shipping') return doc.supportsShipping !== false
  if (scene === 'delivery') return doc.supportsLocalDelivery !== false || doc.supportsShipping !== false
  return true
}
function validScene(scene, method) {
  if (scene === undefined) return method === undefined
  if (scene === 'pickup') return method === undefined
  return scene === 'delivery' && (method === undefined || method === 'local' || method === 'shipping')
}
function updatedAtMillis(value) {
  const raw = value && typeof value === 'object' && '$date' in value ? value.$date : value
  const millis = raw instanceof Date ? raw.getTime() : new Date(raw || 0).getTime()
  return Number.isFinite(millis) ? millis : 0
}
function compareProductOrder(left, right) {
  const order = (Number(left.sortOrder) || 0) - (Number(right.sortOrder) || 0)
  if (order) return order
  const updated = updatedAtMillis(right.updatedAt) - updatedAtMillis(left.updatedAt)
  if (updated) return updated
  return String(left.productId || left._id || '').localeCompare(String(right.productId || right._id || ''))
}
function compareCategoryOrder(left, right) {
  const order = (Number(left.sortOrder) || 0) - (Number(right.sortOrder) || 0)
  if (order) return order
  const updated = updatedAtMillis(right.updatedAt) - updatedAtMillis(left.updatedAt)
  if (updated) return updated
  return String(left.categoryId || left._id || '').localeCompare(String(right.categoryId || right._id || ''))
}
async function listProducts(scene, method) {
  const result = await db.collection('products').where({ enabled: true }).orderBy('sortOrder', 'asc').limit(MAX_LIST_SIZE).get()
  const categoryResult = await db.collection('productCategories').where({ enabled: true }).limit(MAX_LIST_SIZE).get().catch(() => ({ data: [] })); const byId = new Map((categoryResult.data || []).map((item) => [item.categoryId || item._id, item.name]));
  const products = (result.data || []).filter((doc) => availableFor(doc, scene, method) && (!Number.isInteger(doc.stockQuantity) || doc.stockQuantity > 0)).sort(compareProductOrder).map((doc) => productDto({ ...doc, categoryNames: (Array.isArray(doc.categoryIds) ? doc.categoryIds.map((id) => byId.get(id)).filter(Boolean) : []) })).filter((product) => product.specs.length > 0)
  return { products, categories: await listCategories(products) }
}
async function listHomeRecommendations() {
  const result = await db.collection('products').where({ enabled: true }).limit(MAX_LIST_SIZE).get()
  const products = (result.data || []).filter((doc) => doc.homeRecommended === true && availableFor(doc) && (doc.supportsPickup !== false || doc.supportsLocalDelivery !== false || doc.supportsShipping !== false) && (!Number.isInteger(doc.stockQuantity) || doc.stockQuantity > 0)).sort((left, right) => (Number(left.homeRecommendOrder) || 0) - (Number(right.homeRecommendOrder) || 0)).slice(0, 6).map(productDto).filter((product) => product.specs.length > 0)
  return { products }
}
async function getProduct(productId, scene, method) {
  if (!validId(productId)) return fail('INVALID_INPUT', '商品标识无效')
  const result = await db.collection('products').where({ productId, enabled: true }).limit(1).get()
  if (!result.data || !result.data[0] || !availableFor(result.data[0], scene, method) || (Number.isInteger(result.data[0].stockQuantity) && result.data[0].stockQuantity <= 0)) return fail('PRODUCT_NOT_FOUND', '商品不存在')
  const product = productDto(result.data[0])
  if (!product.specs.length) return fail('PRODUCT_NOT_FOUND', '商品暂无可选规格')
  return { product }
}
async function listStores() {
  const result = await db.collection('stores').where({ enabled: true }).limit(MAX_LIST_SIZE).get()
  return { stores: (result.data || []).map(storeDto) }
}
async function getStore(storeId) {
  if (!validId(storeId)) return fail('INVALID_INPUT', '门店标识无效')
  const result = await db.collection('stores').where({ storeId, enabled: true }).limit(1).get()
  if (!result.data || !result.data[0]) return fail('STORE_NOT_FOUND', '门店不存在')
  return { store: storeDto(result.data[0]) }
}
async function getPageConfiguration(pageId) {
  if (!['home', 'profile'].includes(pageId)) return fail('INVALID_INPUT', '页面标识无效')
  try {
    const result = await db.collection('pageConfigurations').where({ pageId }).limit(1).get()
    const doc = result && result.data && result.data[0]
    return { pageId, config: (doc && doc.config) || {}, version: (doc && doc.version) || 0 }
  } catch (error) { return { pageId, config: {}, version: 0 } }
}

exports.main = async (event) => {
  if (!requireOpenId()) return fail('AUTH_REQUIRED', '请先完成微信登录')
  const action = event && event.action
  try {
    if (action === 'listProducts') { if (!validScene(event.purchaseScene, event.deliveryMethod)) return fail('INVALID_INPUT', '购买场景无效'); return ok(await listProducts(event.purchaseScene, event.deliveryMethod)) }
    if (action === 'listHomeRecommendations') return ok(await listHomeRecommendations())
    if (action === 'getProduct') { if (!validScene(event.purchaseScene, event.deliveryMethod)) return fail('INVALID_INPUT', '购买场景无效'); const result = await getProduct(event.productId, event.purchaseScene, event.deliveryMethod); return result.ok === false ? result : ok(result) }
    if (action === 'listStores') return ok(await listStores())
    if (action === 'getStore') { const result = await getStore(event.storeId); return result.ok === false ? result : ok(result) }
    if (action === 'getPageConfiguration') { const result = await getPageConfiguration(event.pageId); return result.ok === false ? result : ok(result) }
    return fail('INVALID_INPUT', '不支持的目录操作')
  } catch (error) {
    console.error('catalog failed', action, error && error.message)
    return fail('CATALOG_UNAVAILABLE', '云端目录暂时不可用')
  }
}

exports.productDto = productDto
exports.availableFor = availableFor
exports.validScene = validScene
exports.compareProductOrder = compareProductOrder
exports.compareCategoryOrder = compareCategoryOrder
