const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const FEE_SNAPSHOT_VERSION = 'mock-cloud1-v1'
const QUOTE_TTL_SECONDS = 600
const INSULATION_FEE_FEN = 200
const LOCAL_DELIVERY_FEE_FEN = 600
const SHIPPING_POSTAGE_FEN = 1200
const FLOWS = { pickup: ['placed', 'preparing', 'ready_for_pickup', 'completed'], local: ['placed', 'preparing', 'delivering', 'completed'], shipping: ['placed', 'preparing', 'awaiting_shipment', 'in_transit', 'completed'] }
function ok(data) { return { ok: true, data } }
function fail(code, message) { return { ok: false, error: { code, message } } }
function owner() { return cloud.getWXContext().OPENID }
function validId(value) { return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value) }
function validQuantity(value) { return Number.isInteger(value) && value > 0 && value <= 99 }
function validPhone(phone) { return /^1\d{10}$/.test(String(phone || '')) }
function addressComplete(address) { return address && address.contactName && validPhone(address.phone) && address.province && address.city && address.district && address.detail && address.provinceCode && address.cityCode && address.districtCode }
function nowIso() { return new Date().toISOString() }
function orderNo() { const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14); return `B${stamp}${Math.random().toString(36).slice(2, 7).toUpperCase()}` }
function quoteExpired(quote) { return !quote || quote.status !== 'ready' || quote.feeSnapshotVersion !== FEE_SNAPSHOT_VERSION || !quote.calculatedAt || !quote.expiresAt || Date.parse(quote.expiresAt) <= Date.now() || Date.parse(quote.expiresAt) - Date.parse(quote.calculatedAt) > QUOTE_TTL_SECONDS * 1000 }
async function findAddress(openid, addressId) { const result = await db.collection('addresses').where({ ownerOpenId: openid, addressId }).limit(1).get(); return result.data && result.data[0] }
async function findStore(storeId) { const result = await db.collection('stores').where({ storeId, enabled: true }).limit(1).get(); return result.data && result.data[0] }
async function itemSnapshot(item, scene, method) {
  if (!item || !validId(item.productId) || !validId(item.specId) || !validQuantity(item.quantity)) return { error: 'INVALID_INPUT' }
  const result = await db.collection('products').where({ productId: item.productId, enabled: true }).limit(1).get(), product = result.data && result.data[0]
  if (!product) return { error: 'PRODUCT_NOT_FOUND' }
  if (product.soldOut) return { error: 'PRODUCT_SOLD_OUT' }
  if (scene === 'pickup' && product.supportsPickup === false) return { error: 'PRODUCT_UNAVAILABLE_FOR_SCENE' }
  if (scene === 'delivery' && method === 'local' && product.supportsLocalDelivery === false) return { error: 'PRODUCT_UNAVAILABLE_FOR_SCENE' }
  if (scene === 'delivery' && method === 'shipping' && product.supportsShipping === false) return { error: 'PRODUCT_UNAVAILABLE_FOR_SCENE' }
  const spec = (product.specs || []).find((entry) => (entry.specId || entry.id) === item.specId && entry.enabled !== false)
  if (!spec) return { error: 'SPEC_NOT_FOUND' }
  const base = scene === 'pickup' ? product.priceFen : (product.deliveryPriceFen || product.priceFen), unitPriceFen = Number(base || 0) + Number(spec.extraFeeFen || 0)
  return { snapshot: { productId: product.productId, productName: product.name, specId: spec.specId || spec.id, specName: spec.name, unitPriceFen, quantity: item.quantity, lineTotalFen: unitPriceFen * item.quantity, artClass: product.artClass || '' } }
}
async function buildItems(items, scene, method) {
  const result = []
  for (const item of Array.isArray(items) ? items : []) { const snapshot = await itemSnapshot(item, scene, method); if (snapshot.error) return snapshot; result.push(snapshot.snapshot) }
  return result.length ? { items: result } : { error: 'INVALID_INPUT' }
}
function history(orderNoValue, fromStatus, toStatus, operatorType, operatorId) { return { orderNo: orderNoValue, fromStatus: fromStatus || null, toStatus, operatorType, operatorId: operatorId || null, reason: '', createdAt: db.serverDate() } }
async function addHistory(record) { await db.collection('orderStatusHistory').add({ data: record }) }
async function create(openid, event) {
  if (!validId(event.clientRequestId)) return fail('INVALID_INPUT', '缺少有效的下单请求标识')
  const duplicate = await db.collection('orders').where({ ownerOpenId: openid, clientRequestId: event.clientRequestId }).limit(1).get()
  if (duplicate.data && duplicate.data[0]) return { order: duplicate.data[0], duplicate: true }
  const scene = event.purchaseScene
  if (!['pickup', 'delivery'].includes(scene)) return fail('INVALID_INPUT', '购买场景无效')
  const method = scene === 'delivery' ? event.deliveryMethod : null
  if (scene === 'delivery' && !['local', 'shipping'].includes(method)) return fail('DELIVERY_METHOD_UNSUPPORTED', '配送方式不支持')
  const itemResult = await buildItems(event.items, scene, method)
  if (itemResult.error) return fail(itemResult.error, '商品当前不可下单')
  const items = itemResult.items, subtotalFen = items.reduce((sum, item) => sum + item.lineTotalFen, 0)
  let storeSnapshot = null, addressSnapshot = null, insulationFeeFen = 0, deliveryFeeFen = 0, postageFen = 0, feeQuoteSnapshot = { status: 'ready', source: 'none', feeSnapshotVersion: null, calculatedAt: null, expiresAt: null }
  if (scene === 'pickup') {
    const store = await findStore(event.storeId)
    if (!store) return fail('STORE_NOT_FOUND', '自取门店不存在')
    if (store.status !== 'open') return fail('STORE_CLOSED', '当前门店暂未营业')
    storeSnapshot = { storeId: store.storeId, name: store.name, addressText: typeof store.address === 'string' ? store.address : [store.address && store.address.province, store.address && store.address.city, store.address && store.address.district, store.address && store.address.detail].filter(Boolean).join(''), businessHours: store.businessHours || '' }
  } else {
    const address = await findAddress(openid, event.addressId)
    if (!address) return fail('ADDRESS_NOT_FOUND', '请选择收货地址')
    if (!addressComplete(address)) return fail('ADDRESS_INCOMPLETE', '收货地址信息不完整')
    if (quoteExpired(event.feeQuote)) return fail('FEE_QUOTE_EXPIRED', '费用报价已过期，请重新计算')
    const quote = event.feeQuote
    const expectedTransport = method === 'local' ? LOCAL_DELIVERY_FEE_FEN : SHIPPING_POSTAGE_FEN
    if (quote.deliveryMethod !== method || quote.subtotalFen !== subtotalFen || quote.insulationFeeFen !== INSULATION_FEE_FEN || quote.transportFeeFen !== expectedTransport || quote.totalFen !== subtotalFen + INSULATION_FEE_FEN + expectedTransport) return fail('FEE_QUOTE_MISMATCH', '费用已变化，请重新计算')
    addressSnapshot = Object.assign({}, address, { fullAddress: `${address.province}${address.city}${address.district}${address.detail}` }); delete addressSnapshot._id; delete addressSnapshot.ownerOpenId
    insulationFeeFen = INSULATION_FEE_FEN; deliveryFeeFen = method === 'local' ? expectedTransport : 0; postageFen = method === 'shipping' ? expectedTransport : 0
    feeQuoteSnapshot = { status: 'ready', source: 'mock', feeSnapshotVersion: FEE_SNAPSHOT_VERSION, calculatedAt: quote.calculatedAt, expiresAt: quote.expiresAt, quotedAt: quote.quotedAt || quote.calculatedAt }
  }
  const status = 'placed', number = orderNo(), createdAt = db.serverDate(), order = { orderNo: number, ownerOpenId: openid, clientRequestId: event.clientRequestId, purchaseScene: scene, deliveryMethod: method, orderStatus: status, storeSnapshot, addressSnapshot, items, subtotalFen, insulationFeeFen, deliveryFeeFen, postageFen, totalFen: subtotalFen + insulationFeeFen + deliveryFeeFen + postageFen, feeQuoteSnapshot, createdAt, updatedAt: createdAt, canceledAt: null, completedAt: null }
  const added = await db.collection('orders').add({ data: order })
  const saved = Object.assign({}, order, { _id: added._id })
  await addHistory(history(number, null, status, 'customer', openid))
  return { order: saved, duplicate: false }
}
async function list(openid, event) { const result = await db.collection('orders').where({ ownerOpenId: openid }).orderBy('createdAt', 'desc').limit(100).get(); return { orders: (result.data || []).map((item) => { const value = Object.assign({}, item); delete value.ownerOpenId; return value }) } }
async function get(openid, orderNoValue) { const result = await db.collection('orders').where({ ownerOpenId: openid, orderNo: orderNoValue }).limit(1).get(); if (!result.data || !result.data[0]) return fail('ORDER_NOT_FOUND', '订单不存在'); const historyResult = await db.collection('orderStatusHistory').where({ orderNo: orderNoValue }).orderBy('createdAt', 'asc').limit(50).get(); const order = Object.assign({}, result.data[0], { statusHistory: historyResult.data || [] }); delete order.ownerOpenId; return { order } }
async function cancel(openid, orderNoValue) { const result = await db.collection('orders').where({ ownerOpenId: openid, orderNo: orderNoValue }).limit(1).get(); const order = result.data && result.data[0]; if (!order) return fail('ORDER_NOT_FOUND', '订单不存在'); if (order.orderStatus !== 'placed') return fail('ORDER_CANNOT_CANCEL', '当前订单状态不可取消'); await db.collection('orders').doc(order._id).update({ data: { orderStatus: 'canceled', canceledAt: db.serverDate(), updatedAt: db.serverDate() } }); await addHistory(history(order.orderNo, 'placed', 'canceled', 'customer', openid)); return { orderNo: order.orderNo, orderStatus: 'canceled' } }
exports.main = async (event) => {
  const openid = owner()
  if (!openid) return fail('AUTH_REQUIRED', '请先完成微信登录')
  try {
    const action = event && event.action
    if (action === 'createOrder') { const result = await create(openid, event); return result.ok === false ? result : ok(result) }
    if (action === 'listOrders') return ok(await list(openid, event))
    if (action === 'getOrder') { const result = await get(openid, event.orderNo); return result.ok === false ? result : ok(result) }
    if (action === 'cancelOrder') { const result = await cancel(openid, event.orderNo); return result.ok === false ? result : ok(result) }
    return fail('INVALID_INPUT', '不支持的订单操作')
  } catch (error) { console.error('order failed', event && event.action, error && error.message); return fail('INTERNAL_ERROR', '订单服务暂时不可用') }
}
