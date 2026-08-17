const { products, stores } = require('./mock')
const feeService = require('./fee-service')
const catalogCache = require('./catalog-cache')
const catalogLocal = require('./catalog-local')
const STORAGE_KEY = 'breadshopState'
const PICKUP_FLOW = ['已下单', '制作中', '待自取', '已完成']

function createInitialState() { return { purchaseScene: 'pickup', deliveryMethod: 'local', storeId: '', addressId: '', addresses: [], pickupCartItems: [], deliveryCartItems: [], orders: [] } }
function priceToFen(value) { const number = Number(String(value || '').replace(/[¥,]/g, '')); return Number.isFinite(number) ? Math.round(number * 100) : null }
function getProduct(productId) { return catalogCache.getProduct(productId) || products.find((entry) => entry.id === productId) || null }
function normalizeCartItem(item) {
  if (!item || typeof item !== 'object') return null
  const productId = item.productId || String(item.id || '').split(/[:-]/)[0]
  const product = getProduct(productId)
  const spec = (product && product.specs || []).find((entry) => entry.id === item.specId || entry.name === item.specName || entry.name === item.spec) || null
  const specId = item.specId || (spec && spec.id) || 'standard'
  const specName = item.specName || item.spec || (spec && spec.name) || '标准规格'
  const baseFen = item.unitPriceFen !== undefined ? Number(item.unitPriceFen) : (priceToFen(item.price) || (product && product.priceFen))
  if (!productId || !Number.isFinite(baseFen) || baseFen < 0) return null
  const quantity = Math.floor(Number(item.quantity) || 0)
  if (quantity <= 0) return null
  return { id: item.id || `${productId}:${specId}`, productId, specId, name: item.name || (product && product.name) || '未知商品', specName, unitPriceFen: baseFen, quantity, artClass: item.artClass || (product && product.artClass) || '' }
}
function mergeCartItems(existingItems, incomingItems) {
  const result = []
  ;(existingItems || []).concat(incomingItems || []).forEach((raw) => {
    const item = normalizeCartItem(raw); if (!item) return
    const found = result.find((entry) => entry.id === item.id)
    if (found) found.quantity += item.quantity
    else result.push(Object.assign({}, item))
  })
  return result
}
function ensureStateShape(existing) {
  const state = existing && typeof existing === 'object' ? Object.assign({}, existing) : {}
  const initial = createInitialState()
  if (!Array.isArray(state.pickupCartItems)) state.pickupCartItems = Array.isArray(state.cartItems) ? state.cartItems : []
  if (!Array.isArray(state.deliveryCartItems)) state.deliveryCartItems = []
  state.pickupCartItems = mergeCartItems([], state.pickupCartItems)
  state.deliveryCartItems = mergeCartItems([], state.deliveryCartItems)
  if (!Array.isArray(state.orders)) state.orders = []
  if (!Array.isArray(state.addresses)) state.addresses = []
  state.addresses = state.addresses.map((address, index) => { const detail = address.detail || ''; return Object.assign({}, address, { id: address.id || address.addressId || `address-migrated-${index + 1}`, contactName: address.contactName || address.name || '', phone: address.phone || address.mobile || '', province: address.province || '山东省', city: address.city || '青岛市', district: address.district || '崂山区', detail: detail.replace(/^山东省/, '').trim(), supportsLocal: address.supportsLocal !== false, supportsShipping: address.supportsShipping !== false }) })
  if (!state.addresses.some((address) => address.id === state.addressId)) { const fallback = state.addresses.find((address) => address.isDefault) || state.addresses[0]; state.addressId = fallback ? fallback.id : '' }
  Object.keys(initial).forEach((key) => { if (state[key] === undefined || state[key] === null) state[key] = initial[key] })
  wx.setStorageSync(STORAGE_KEY, state); return state
}
function getState() { return ensureStateShape(wx.getStorageSync(STORAGE_KEY)) }
function saveState(state) { const next = ensureStateShape(state); wx.setStorageSync(STORAGE_KEY, next); return next }
function patchState(partial) { return saveState(Object.assign({}, getState(), partial || {})) }
function getCart(scene) { const state = getState(); return scene === 'delivery' ? state.deliveryCartItems : state.pickupCartItems }
function isCartItemAvailable(item, scene, deliveryMethod) {
  const product = getProduct(item.productId)
  if (!product || product.soldOut) return false
  if (scene === 'pickup') return product.supportsPickup !== undefined ? product.supportsPickup !== false : product.supportsLocal !== false
  return deliveryMethod === 'shipping' ? product.supportsShipping !== false : (product.supportsLocalDelivery !== undefined ? product.supportsLocalDelivery !== false : product.supportsLocal !== false)
}
function getUnavailableCartItems(scene) {
  const state = getState(), method = state.deliveryMethod || 'local'
  return getCart(scene).filter((item) => !isCartItemAvailable(item, scene, method))
}
function setCart(scene, items) { return patchState({ [scene === 'delivery' ? 'deliveryCartItems' : 'pickupCartItems']: mergeCartItems([], items) }) }
function getStore(storeId) { return catalogCache.getStore(storeId) || catalogLocal.getStore(storeId) || stores.find((item) => item.id === storeId) || null }
function getSelectedStore() { return getStore(getState().storeId) }
function setSelectedStore(storeId) { if (!getStore(storeId)) return null; patchState({ storeId }); return getStore(storeId) }
function getSelectedAddress() { const state = getState(); return state.addresses.find((address) => address.id === state.addressId) || null }
function setSelectedAddress(addressId) { const state = getState(); if (!state.addresses.some((address) => address.id === addressId)) return null; patchState({ addressId }); return state.addresses.find((address) => address.id === addressId) }
function saveAddress(address) { const state = getState(); const next = Object.assign({}, address, { id: address.id || `address-${Date.now()}` }); const addresses = state.addresses.filter((item) => item.id !== next.id).concat(next); patchState({ addresses, addressId: next.isDefault || !state.addressId ? next.id : state.addressId }); return next }
function removeAddress(addressId) { const state = getState(); const remaining = state.addresses.filter((item) => item.id !== addressId); let addressIdNext = state.addressId; if (state.addressId === addressId) addressIdNext = remaining[0] ? remaining[0].id : ''; patchState({ addresses: remaining, addressId: addressIdNext }); return remaining }
function replaceAddresses(addresses) { const normalized = Array.isArray(addresses) ? addresses : []; const selected = normalized.find((item) => item.isDefault) || normalized[0] || null; patchState({ addresses: normalized, addressId: selected ? (selected.id || selected.addressId) : '' }); return normalized }
function getOrders() { return getState().orders }
function replaceOrders(orders) { const state = getState(); saveState(Object.assign({}, state, { orders: Array.isArray(orders) ? orders : [] })); return getOrders() }
function getOrder(orderId) { return getOrders().find((order) => order.id === orderId || order.orderNo === orderId) || null }
function updateOrder(orderId, partial) { const state = getState(); const orders = state.orders.map((order) => order.id === orderId || order.orderNo === orderId ? Object.assign({}, order, partial || {}) : order); saveState(Object.assign({}, state, { orders })); return orders.find((order) => order.id === orderId || order.orderNo === orderId) || null }
function createOrder(payload) { const state = getState(); const order = Object.assign({ id: `MOCK-${Date.now()}`, orderStatus: '已下单', createdAt: new Date().toISOString() }, payload || {}); saveState(Object.assign({}, state, { orders: [order].concat(state.orders) })); return order }
function createPickupOrder() {
  const state = getState(), selected = getSelectedStore(), items = mergeCartItems([], state.pickupCartItems)
  if (!items.length) throw new Error('购物车为空')
  if (getUnavailableCartItems('pickup').length) throw new Error('有商品已售罄或暂不支持到店自取，请返回购物车调整')
  if (!selected) throw new Error('请选择自取门店')
  if (selected.status !== 'open') throw new Error(`门店已关闭，营业时间 ${selected.businessHours}`)
  const snapshotItems = items.map((item) => ({ productId: item.productId, name: item.name, specId: item.specId, specName: item.specName, unitPriceFen: item.unitPriceFen, quantity: item.quantity, lineTotalFen: item.unitPriceFen * item.quantity, artClass: item.artClass }))
  const subtotalFen = snapshotItems.reduce((sum, item) => sum + item.lineTotalFen, 0)
  const order = { id: `MOCK-${Date.now()}`, purchaseScene: 'pickup', scene: '到店自取', sceneLabel: '到店自取', deliveryMethod: null, orderStatus: '已下单', store: { id: selected.id, name: selected.name, address: selected.address, businessHours: selected.businessHours }, items: snapshotItems, subtotalFen, totalFen: subtotalFen, createdAt: new Date().toISOString() }
  saveState(Object.assign({}, state, { pickupCartItems: [], orders: [order].concat(state.orders) })); return order
}
function cancelOrder(orderId) { const order = getOrder(orderId); if (!order || order.orderStatus !== '已下单') return null; return updateOrder(orderId, { orderStatus: '已取消' }) }
function advanceMockOrder(orderId) { const order = getOrder(orderId); if (!order || order.purchaseScene !== 'pickup') return null; const index = PICKUP_FLOW.indexOf(order.orderStatus); if (index < 0 || index >= PICKUP_FLOW.length - 1) return null; return updateOrder(orderId, { orderStatus: PICKUP_FLOW[index + 1] }) }
function advanceDeliveryOrder(orderId) { const order = getOrder(orderId); if (!order || order.purchaseScene !== 'delivery') return null; const flow = order.deliveryMethod === 'shipping' ? ['已下单', '制作中', '待发货', '运输中', '已完成'] : ['已下单', '制作中', '配送中', '已完成']; const index = flow.indexOf(order.orderStatus); if (index < 0 || index >= flow.length - 1) return null; return updateOrder(orderId, { orderStatus: flow[index + 1] }) }
function createDeliveryOrder() {
  const state = getState(), address = getSelectedAddress(), items = mergeCartItems([], state.deliveryCartItems), method = state.deliveryMethod || 'local', fee = feeService.calculateDeliveryFees({ deliveryMethod: method, address, items })
  if (!items.length) throw new Error('购物车为空'); if (getUnavailableCartItems('delivery').length) throw new Error('有商品已售罄或暂不支持当前配送方式，请返回购物车调整'); if (fee.status !== 'ready') throw new Error(fee.message || '配送费用暂无法计算')
  const snapshotItems = items.map((item) => ({ productId: item.productId, name: item.name, specId: item.specId, specName: item.specName, unitPriceFen: item.unitPriceFen, quantity: item.quantity, lineTotalFen: item.unitPriceFen * item.quantity, artClass: item.artClass }))
  const subtotalFen = snapshotItems.reduce((sum, item) => sum + item.lineTotalFen, 0), totalFen = subtotalFen + fee.insulationFeeFen + fee.transportFeeFen
  const order = { id: `MOCK-${Date.now()}`, purchaseScene: 'delivery', scene: method === 'shipping' ? '快递邮寄' : '同城外卖', sceneLabel: method === 'shipping' ? '快递邮寄' : '同城外卖', deliveryMethod: method, orderStatus: '已下单', address: Object.assign({}, address, { fullAddress: `${address.province}${address.city}${address.district}${address.detail}` }), items: snapshotItems, subtotalFen, insulationFeeFen: fee.insulationFeeFen, deliveryFeeFen: fee.deliveryFeeFen, postageFen: fee.postageFen, totalFen, createdAt: new Date().toISOString() }
  saveState(Object.assign({}, state, { deliveryCartItems: [], orders: [order].concat(state.orders) })); return order
}
function reorder(orderId) { const order = getOrder(orderId); if (!order || order.orderStatus !== '已完成') return { added: 0, unavailable: [] }; const available = [], unavailable = []; (order.items || []).forEach((item) => { const product = getProduct(item.productId); const method = order.purchaseScene === 'delivery' ? order.deliveryMethod : null; const pickupUnavailable = !product || product.supportsPickup === false; const localUnavailable = !product || product.supportsLocalDelivery === false; const shippingUnavailable = !product || product.supportsShipping === false; if (!product || product.soldOut || (method === null && pickupUnavailable) || (method === 'local' && localUnavailable) || (method === 'shipping' && shippingUnavailable)) unavailable.push(item.name); else available.push(item) }); setCart(order.purchaseScene === 'delivery' ? 'delivery' : 'pickup', mergeCartItems(getCart(order.purchaseScene === 'delivery' ? 'delivery' : 'pickup'), available)); if (order.purchaseScene === 'delivery') patchState({ deliveryMethod: order.deliveryMethod }); return { added: available.length, unavailable }
}
module.exports = { STORAGE_KEY, createInitialState, ensureStateShape, getState, saveState, patchState, getCart, isCartItemAvailable, getUnavailableCartItems, setCart, getOrders, replaceOrders, getOrder, createOrder, updateOrder, getStore, getSelectedStore, setSelectedStore, getSelectedAddress, setSelectedAddress, saveAddress, removeAddress, replaceAddresses, normalizeCartItem, mergeCartItems, createPickupOrder, createDeliveryOrder, cancelOrder, advanceMockOrder, advanceDeliveryOrder, reorder }
