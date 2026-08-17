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
    artClass: doc.artClass || '',
    imageUrls: Array.isArray(doc.imageUrls) ? doc.imageUrls : [],
    priceFen: Number(doc.priceFen) || 0,
    deliveryPriceFen: Number(doc.deliveryPriceFen) || 0,
    soldOut: doc.soldOut === true,
    supportsPickup: doc.supportsPickup !== false,
    supportsLocalDelivery: doc.supportsLocalDelivery !== false,
    supportsShipping: doc.supportsShipping !== false,
    specs: (Array.isArray(doc.specs) ? doc.specs : []).map((spec) => ({ specId: spec.specId || spec.id, name: spec.name || '', extraFeeFen: Number(spec.extraFeeFen) || 0, enabled: spec.enabled !== false })),
    sortOrder: Number(doc.sortOrder) || 0,
    version: Number(doc.version) || 1
  }
}
function storeDto(doc) {
  const address = doc.address
  const addressText = typeof address === 'string' ? address : (doc.addressText || [address && address.province, address && address.city, address && address.district, address && address.detail].filter(Boolean).join(''))
  return { id: doc.storeId || doc._id, storeId: doc.storeId || doc._id, name: doc.name || '', address: addressText, addressObject: typeof address === 'object' && address ? address : null, businessHours: doc.businessHours || '', status: doc.status === 'closed' ? 'closed' : 'open', distanceText: doc.distanceText || '' }
}

async function listProducts() {
  const result = await db.collection('products').where({ enabled: true }).orderBy('sortOrder', 'asc').limit(MAX_LIST_SIZE).get()
  return { products: (result.data || []).map(productDto) }
}
async function getProduct(productId) {
  if (!validId(productId)) return fail('INVALID_INPUT', '商品标识无效')
  const result = await db.collection('products').where({ productId, enabled: true }).limit(1).get()
  if (!result.data || !result.data[0]) return fail('PRODUCT_NOT_FOUND', '商品不存在')
  return { product: productDto(result.data[0]) }
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

exports.main = async (event) => {
  if (!requireOpenId()) return fail('AUTH_REQUIRED', '请先完成微信登录')
  const action = event && event.action
  try {
    if (action === 'listProducts') return ok(await listProducts())
    if (action === 'getProduct') { const result = await getProduct(event.productId); return result.ok === false ? result : ok(result) }
    if (action === 'listStores') return ok(await listStores())
    if (action === 'getStore') { const result = await getStore(event.storeId); return result.ok === false ? result : ok(result) }
    return fail('INVALID_INPUT', '不支持的目录操作')
  } catch (error) {
    console.error('catalog failed', action, error && error.message)
    return fail('CATALOG_UNAVAILABLE', '云端目录暂时不可用')
  }
}
