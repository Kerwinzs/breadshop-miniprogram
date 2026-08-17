const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const FEE_SNAPSHOT_VERSION = 'mock-cloud1-v1'
const QUOTE_TTL_SECONDS = 600
const INSULATION_FEE_FEN = 200
const LOCAL_DELIVERY_FEE_FEN = 600
const SHIPPING_POSTAGE_FEN = 1200
function ok(data) { return { ok: true, data } }
function fail(code, message) { return { ok: false, error: { code, message } } }
function openid() { return cloud.getWXContext().OPENID }
function validId(value) { return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value) }
function validQuantity(value) { return Number.isInteger(value) && value > 0 && value <= 99 }
function validPhone(phone) { return /^1\d{10}$/.test(String(phone || '')) }
function isoAfter(seconds) { return new Date(Date.now() + seconds * 1000).toISOString() }
function isoNow() { return new Date().toISOString() }
function addressComplete(address) { return address && address.contactName && validPhone(address.phone) && address.province && address.city && address.district && address.detail && address.provinceCode && address.cityCode && address.districtCode }
async function getAddress(owner, addressId) {
  if (!validId(addressId)) return null
  const result = await db.collection('addresses').where({ ownerOpenId: owner, addressId }).limit(1).get()
  return result.data && result.data[0] ? result.data[0] : null
}
async function productSnapshot(item, method) {
  if (!item || !validId(item.productId) || !validId(item.specId) || !validQuantity(item.quantity)) return { error: 'INVALID_INPUT' }
  const result = await db.collection('products').where({ productId: item.productId, enabled: true }).limit(1).get()
  const product = result.data && result.data[0]
  if (!product) return { error: 'PRODUCT_NOT_FOUND' }
  if (product.soldOut) return { error: 'PRODUCT_SOLD_OUT' }
  if (method === 'local' && product.supportsLocalDelivery === false) return { error: 'PRODUCT_UNAVAILABLE_FOR_SCENE' }
  if (method === 'shipping' && product.supportsShipping === false) return { error: 'PRODUCT_UNAVAILABLE_FOR_SCENE' }
  const spec = (product.specs || []).find((entry) => (entry.specId || entry.id) === item.specId && entry.enabled !== false)
  if (!spec) return { error: 'SPEC_NOT_FOUND' }
  const unitPriceFen = Number(product.deliveryPriceFen || product.priceFen) + Number(spec.extraFeeFen || 0)
  return { product, spec, snapshot: { productId: product.productId, productName: product.name, specId: spec.specId || spec.id, specName: spec.name, unitPriceFen, quantity: item.quantity, lineTotalFen: unitPriceFen * item.quantity, artClass: product.artClass || '' } }
}
async function quote(owner, event) {
  const method = event.deliveryMethod
  if (!['local', 'shipping'].includes(method)) return fail('DELIVERY_METHOD_UNSUPPORTED', '配送方式不支持')
  const address = await getAddress(owner, event.addressId)
  if (!address) return fail('ADDRESS_NOT_FOUND', '请选择收货地址')
  if (!addressComplete(address)) return fail('ADDRESS_INCOMPLETE', '收货地址信息不完整')
  const snapshots = []
  for (const item of Array.isArray(event.items) ? event.items : []) {
    const result = await productSnapshot(item, method)
    if (result.error) return fail(result.error, '商品当前不可按此配送方式下单')
    snapshots.push(result.snapshot)
  }
  if (!snapshots.length) return fail('INVALID_INPUT', '购物车为空')
  const subtotalFen = snapshots.reduce((sum, item) => sum + item.lineTotalFen, 0)
  const transportFeeFen = method === 'local' ? LOCAL_DELIVERY_FEE_FEN : SHIPPING_POSTAGE_FEN
  const calculatedAt = isoNow()
  return { status: 'ready', deliveryMethod: method, insulationFeeFen: INSULATION_FEE_FEN, deliveryFeeFen: method === 'local' ? transportFeeFen : 0, postageFen: method === 'shipping' ? transportFeeFen : 0, transportFeeFen, subtotalFen, totalFen: subtotalFen + INSULATION_FEE_FEN + transportFeeFen, message: '', source: 'mock', feeSnapshotVersion: FEE_SNAPSHOT_VERSION, calculatedAt, quotedAt: calculatedAt, expiresAt: isoAfter(QUOTE_TTL_SECONDS), items: snapshots }
}
exports.main = async (event) => {
  const owner = openid()
  if (!owner) return fail('AUTH_REQUIRED', '请先完成微信登录')
  if (!event || event.action !== 'quote') return fail('INVALID_INPUT', '不支持的费用操作')
  try { const result = await quote(owner, event); return result.ok === false ? result : ok(result) } catch (error) { console.error('fee.quote failed', error && error.message); return fail('FEE_UNAVAILABLE', '费用暂时无法计算') }
}
module.exports = Object.assign(exports, { quote, FEE_SNAPSHOT_VERSION, QUOTE_TTL_SECONDS })
