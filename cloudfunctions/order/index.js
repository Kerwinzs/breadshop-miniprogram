const cloud = require('wx-server-sdk')
const { ALL_REQUIRED_PRODUCT_IDS, ZERO_PRICE_REQUIRED_PRODUCT_IDS, hasRegularDeliveryItem, validateRequiredShippingItems, canonicalItems, sameItems, quoteIsUsable, publicAddressSnapshot, publicOrder, validId, validQuantity, paymentEnabled } = require('./contract')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const FEE_SNAPSHOT_VERSION = 'delivery-required-products-v4'
const QUOTE_TTL_SECONDS = 600
const INSULATION_FEE_FEN = 0
const LOCAL_DELIVERY_FEE_FEN = 0
const PAYMENT_TTL_SECONDS = 15 * 60
const FLOWS = { pickup: ['placed', 'preparing', 'ready_for_pickup', 'completed'], local: ['placed', 'preparing', 'delivering', 'completed'], shipping: ['placed', 'preparing', 'awaiting_shipment', 'in_transit', 'completed'] }

function ok(data) { return { ok: true, data } }
function fail(code, message) { return { ok: false, error: { code, message } } }
function owner() { return cloud.getWXContext().OPENID }
function validPhone(phone) { return /^1\d{10}$/.test(String(phone || '')) }
function addressComplete(address) { return address && address.contactName && validPhone(address.phone) && address.province && address.city && address.district && address.detail && address.provinceCode && address.cityCode && address.districtCode }
function nowIso() { return new Date().toISOString() }
function orderNo() { const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14); return `B${stamp}${Math.random().toString(36).slice(2, 7).toUpperCase()}` }
function history(orderNoValue, fromStatus, toStatus, source) { return { orderNo: orderNoValue, fromStatus: fromStatus || null, toStatus, source, operatorType: source, operatorId: null, reason: '', createdAt: db.serverDate() } }
function exactAddress(address) { return publicAddressSnapshot(Object.assign({}, address, { addressId: address.addressId })) }
function sameSnapshot(left, right) { return JSON.stringify(left || null) === JSON.stringify(right || null) }
function transactionRequired() { return typeof db.runTransaction === 'function' }
async function atStage(stage, operation) {
  try { return await operation() } catch (error) {
    error.orderStage = error.orderStage || stage
    throw error
  }
}
function storeSnapshot(store) {
  const address = store && store.address
  return {
    storeId: (store && store.storeId) || '',
    name: (store && store.name) || '',
    addressText: typeof address === 'string' ? address : ((store && store.addressText) || [address && address.province, address && address.city, address && address.district, address && address.detail].filter(Boolean).join('')),
    businessHours: (store && store.businessHours) || ''
  }
}

async function findAddress(openid, addressId, scope) {
  const collection = (scope || db).collection('addresses')
  const result = await collection.where({ ownerOpenId: openid, addressId }).limit(1).get()
  return result.data && result.data[0]
}

async function findStore(storeId, scope) {
  const collection = (scope || db).collection('stores')
  const result = await collection.where({ storeId, enabled: true }).limit(1).get()
  return result.data && result.data[0]
}

async function itemSnapshot(item, scene, method, scope) {
  if (!item || !validId(item.productId) || !validId(item.specId) || !validQuantity(item.quantity)) return { error: 'INVALID_INPUT' }
  const collection = (scope || db).collection('products')
  const result = await collection.where({ productId: item.productId, enabled: true }).limit(1).get(), product = result.data && result.data[0]
  if (!product) return { error: 'PRODUCT_NOT_FOUND' }
  if (product.soldOut) return { error: 'PRODUCT_SOLD_OUT' }
  if (Number.isInteger(product.stockQuantity) && product.stockQuantity < item.quantity) return { error: 'PRODUCT_STOCK_INSUFFICIENT' }
  if (scene === 'pickup' && product.supportsPickup === false) return { error: 'PRODUCT_UNAVAILABLE_FOR_SCENE' }
  if (scene === 'delivery' && method === 'local' && product.supportsLocalDelivery === false) return { error: 'PRODUCT_UNAVAILABLE_FOR_SCENE' }
  if (scene === 'delivery' && method === 'shipping' && product.supportsShipping === false) return { error: 'PRODUCT_UNAVAILABLE_FOR_SCENE' }
  if (ALL_REQUIRED_PRODUCT_IDS.includes(product.productId) && product.category !== '拍前必读') return { error: 'DELIVERY_REQUIRED_ITEM_INVALID' }
  const spec = (product.specs || []).find((entry) => (entry.specId || entry.id) === item.specId && entry.enabled !== false)
  if (!spec) return { error: 'SPEC_NOT_FOUND' }
  const base = scene === 'pickup' ? product.priceFen : (product.deliveryPriceFen || product.priceFen), configuredPriceFen = Number(base || 0) + Number(spec.extraFeeFen || 0)
  const unitPriceFen = scene === 'delivery' && ZERO_PRICE_REQUIRED_PRODUCT_IDS.has(product.productId) ? 0 : configuredPriceFen
  return { snapshot: { productId: product.productId, productName: product.name, specId: spec.specId || spec.id, specName: spec.name, unitPriceFen, quantity: item.quantity, lineTotalFen: unitPriceFen * item.quantity, artClass: product.artClass || '' } }
}

async function buildItems(items, scene, method, scope) {
  const inputItems = canonicalItems(items)
  if (!inputItems) return { error: 'INVALID_INPUT' }
  const requiredItems = validateRequiredShippingItems(inputItems, scene === 'delivery' ? method : 'pickup')
  if (!requiredItems.ok) return { error: requiredItems.code }
  const result = []
  for (const item of inputItems) { const snapshot = await itemSnapshot(item, scene, method, scope); if (snapshot.error) return snapshot; result.push(snapshot.snapshot) }
  return result.length ? { items: result, inputItems } : { error: 'INVALID_INPUT' }
}

async function reserveStock(items, scope) {
  const quantities = (items || []).reduce((result, item) => {
    result[item.productId] = (result[item.productId] || 0) + item.quantity
    return result
  }, {})
  for (const [productId, quantity] of Object.entries(quantities)) {
    const result = await scope.collection('products').where({ productId, enabled: true }).limit(1).get()
    const product = result.data && result.data[0]
    if (!product || product.soldOut) return { error: 'PRODUCT_NOT_FOUND' }
    if (!Number.isInteger(product.stockQuantity)) continue
    if (product.stockQuantity < quantity) return { error: 'PRODUCT_STOCK_INSUFFICIENT' }
    await scope.collection('products').doc(product._id).update({ data: { stockQuantity: product.stockQuantity - quantity, updatedAt: db.serverDate() } })
  }
  return {}
}

async function restoreStock(items, scope) {
  const quantities = (items || []).reduce((result, item) => {
    result[item.productId] = (result[item.productId] || 0) + Number(item.quantity || 0)
    return result
  }, {})
  for (const [productId, quantity] of Object.entries(quantities)) {
    const result = await scope.collection('products').where({ productId }).limit(1).get()
    const product = result.data && result.data[0]
    if (!product || !Number.isInteger(product.stockQuantity)) continue
    await scope.collection('products').doc(product._id).update({ data: { stockQuantity: product.stockQuantity + quantity, updatedAt: db.serverDate() } })
  }
}

function publicDuplicate(order) { return { order: publicOrder(order), duplicate: true } }

async function create(openid, event) {
  if (!validId(event.clientRequestId)) return fail('INVALID_INPUT', '缺少有效的下单请求标识')
  if (!transactionRequired()) return fail('INTERNAL_ERROR', '订单服务未启用事务')
  const scene = event.purchaseScene
  if (!['pickup', 'delivery'].includes(scene)) return fail('INVALID_INPUT', '购买场景无效')
  const method = scene === 'delivery' ? event.deliveryMethod : null
  if (scene === 'delivery' && !['local', 'shipping'].includes(method)) return fail('DELIVERY_METHOD_UNSUPPORTED', '配送方式不支持')
  if (scene === 'delivery' && !hasRegularDeliveryItem(event.items)) return fail('DELIVERY_REGULAR_ITEM_REQUIRED', '请至少选择一件普通商品后再下单')
  const itemResult = await atStage('PRODUCT_READ', () => buildItems(event.items, scene, method))
  if (itemResult.error) return fail(itemResult.error, '商品当前不可下单')
  const items = itemResult.items, subtotalFen = items.reduce((sum, item) => sum + item.lineTotalFen, 0)
  if (scene === 'delivery' && !validId(event.feeQuoteId || (event.feeQuote && event.feeQuote.quoteId))) return fail('FEE_QUOTE_REQUIRED', '请先重新计算费用')
  // Pickup orders do not have a fee quote. Never dereference feeQuote for
  // that scene, otherwise a valid pickup request becomes an internal error.
  const feeQuoteId = scene === 'delivery' ? (event.feeQuoteId || (event.feeQuote && event.feeQuote.quoteId)) : ''
  // CloudBase transactions are reserved for the order write set. Read the
  // public store before opening the transaction to avoid transaction read
  // failures on the catalog collection.
  let pickupStoreSnapshot = null
  if (scene === 'pickup') {
    const pickupStore = await atStage('STORE_READ', () => findStore(event.storeId))
    if (!pickupStore) return fail('STORE_NOT_FOUND', '自取门店不存在')
    if (pickupStore.status !== 'open') return fail('STORE_CLOSED', '当前门店暂未营业')
    pickupStoreSnapshot = storeSnapshot(pickupStore)
  }
  const result = await atStage('TRANSACTION', () => db.runTransaction(async (transaction) => {
    const orderCollection = transaction.collection('orders')
    const duplicateResult = await atStage('DUPLICATE_READ', () => orderCollection.where({ ownerOpenId: openid, clientRequestId: event.clientRequestId }).limit(1).get())
    const duplicate = duplicateResult.data && duplicateResult.data[0]
    if (duplicate) {
      const duplicateHistory = await transaction.collection('orderStatusHistory').where({ orderNo: duplicate.orderNo }).limit(1).get()
      if (!duplicateHistory.data || !duplicateHistory.data[0]) await transaction.collection('orderStatusHistory').add({ data: history(duplicate.orderNo, null, duplicate.orderStatus, 'customer') })
      return publicDuplicate(duplicate)
    }
    const stock = await reserveStock(itemResult.inputItems, transaction)
    if (stock.error) return fail(stock.error, '商品库存不足，请返回购物车调整')
    let storeSnapshot = null, addressSnapshot = null, insulationFeeFen = 0, deliveryFeeFen = 0, postageFen = 0, feeQuoteSnapshot = { status: 'ready', source: 'none', feeSnapshotVersion: null, calculatedAt: null, expiresAt: null }
    if (scene === 'pickup') {
      storeSnapshot = pickupStoreSnapshot
    } else {
      const address = await findAddress(openid, event.addressId, transaction)
      if (!address) return fail('ADDRESS_NOT_FOUND', '请选择收货地址')
      if (!addressComplete(address)) return fail('ADDRESS_INCOMPLETE', '收货地址信息不完整')
      if (method === 'shipping' && address.supportsShipping === false) return fail('ADDRESS_UNAVAILABLE_FOR_METHOD', '当前地址不支持快递邮寄')
      if (method === 'local' && address.supportsLocal === false) return fail('ADDRESS_UNAVAILABLE_FOR_METHOD', '当前地址超出同城配送范围')
      const quoteResult = await transaction.collection('feeQuotes').where({ ownerOpenId: openid, quoteId: feeQuoteId }).limit(1).get()
      const quote = quoteResult.data && quoteResult.data[0]
      if (!quote) return fail('FEE_QUOTE_NOT_FOUND', '费用报价不存在，请重新计算')
      if (quote.status === 'consumed') return fail('FEE_QUOTE_USED', '费用报价已使用，请重新计算')
      if (!quoteIsUsable(quote, FEE_SNAPSHOT_VERSION)) return fail('FEE_QUOTE_EXPIRED', '费用报价已过期，请重新计算')
      const expectedInsulation = method === 'local' ? INSULATION_FEE_FEN : 0
      const expectedTransport = method === 'local' ? LOCAL_DELIVERY_FEE_FEN : 0
      if (quote.addressId !== event.addressId || quote.deliveryMethod !== method || !sameItems(quote.inputItems, itemResult.inputItems) || !sameSnapshot(quote.addressSnapshot, exactAddress(address)) || quote.subtotalFen !== subtotalFen || quote.insulationFeeFen !== expectedInsulation || quote.deliveryFeeFen !== (method === 'local' ? expectedTransport : 0) || quote.postageFen !== 0 || quote.transportFeeFen !== expectedTransport || quote.totalFen !== subtotalFen + expectedInsulation + expectedTransport) return fail('FEE_QUOTE_MISMATCH', '费用已变化，请重新计算')
      addressSnapshot = Object.assign({}, address, { fullAddress: `${address.province}${address.city}${address.district}${address.detail}` })
      delete addressSnapshot._id
      delete addressSnapshot.ownerOpenId
      delete addressSnapshot._openid
      insulationFeeFen = expectedInsulation
      deliveryFeeFen = method === 'local' ? expectedTransport : 0
      postageFen = 0
      feeQuoteSnapshot = { quoteId: quote.quoteId, status: 'ready', source: quote.source, feeSnapshotVersion: quote.feeSnapshotVersion, calculatedAt: quote.calculatedAt, expiresAt: quote.expiresAt, quotedAt: quote.quotedAt || quote.calculatedAt }
      await transaction.collection('feeQuotes').doc(quote._id).update({ data: { status: 'consumed', consumedAt: db.serverDate(), consumedByOrderRequestId: event.clientRequestId, updatedAt: db.serverDate() } })
    }
    const status = 'placed', number = orderNo(), createdAt = db.serverDate()
    const paymentRequired = paymentEnabled(process.env)
    const paymentExpiresAt = paymentRequired ? new Date(Date.now() + PAYMENT_TTL_SECONDS * 1000) : null
    // Transport is collect-on-delivery. Only the real merchandise subtotal is prepaid.
    const order = { orderNo: number, ownerOpenId: openid, clientRequestId: event.clientRequestId, purchaseScene: scene, deliveryMethod: method, orderStatus: status, paymentRequired, paymentStatus: paymentRequired ? 'pending' : 'not_required', payableAmountFen: paymentRequired ? subtotalFen : 0, paidAmountFen: 0, refundedAmountFen: 0, paymentExpiresAt, paidAt: null, refundStatus: 'none', stockReleasedAt: null, storeSnapshot, addressSnapshot, items, subtotalFen, insulationFeeFen, deliveryFeeFen, postageFen, totalFen: subtotalFen + insulationFeeFen + deliveryFeeFen + postageFen, feeQuoteSnapshot, createdAt, updatedAt: createdAt, canceledAt: null, completedAt: null }
    let added
    try { added = await orderCollection.add({ data: order }) } catch (error) { error.orderStage = 'ORDER_WRITE'; throw error }
    try { await transaction.collection('orderStatusHistory').add({ data: history(number, null, status, 'customer') }) } catch (error) { error.orderStage = 'HISTORY_WRITE'; throw error }
    return { order: Object.assign({}, order, { _id: added._id }), duplicate: false }
  }))
  if (result && result.ok === false) return result
  if (result && result.duplicate) return result
  return { order: publicOrder(result.order), duplicate: false }
}

async function list(openid) {
  const result = await db.collection('orders').where({ ownerOpenId: openid }).orderBy('createdAt', 'desc').limit(100).get()
  return { orders: (result.data || []).map((item) => publicOrder(item)) }
}

async function get(openid, orderNoValue) {
  if (!validId(orderNoValue)) return fail('INVALID_INPUT', '订单号无效')
  const result = await db.collection('orders').where({ ownerOpenId: openid, orderNo: orderNoValue }).limit(1).get()
  if (!result.data || !result.data[0]) return fail('ORDER_NOT_FOUND', '订单不存在')
  const historyResult = await db.collection('orderStatusHistory').where({ orderNo: orderNoValue }).orderBy('createdAt', 'asc').limit(50).get()
  return { order: publicOrder(result.data[0], historyResult.data || []) }
}

async function cancel(openid, orderNoValue) {
  if (!transactionRequired()) return fail('INTERNAL_ERROR', '订单服务未启用事务')
  if (!validId(orderNoValue)) return fail('INVALID_INPUT', '订单号无效')
  const result = await db.runTransaction(async (transaction) => {
    const orderCollection = transaction.collection('orders')
    const query = await orderCollection.where({ ownerOpenId: openid, orderNo: orderNoValue }).limit(1).get()
    const order = query.data && query.data[0]
    if (!order) return fail('ORDER_NOT_FOUND', '订单不存在')
    if (order.orderStatus !== 'placed') return fail('ORDER_CANNOT_CANCEL', '当前订单状态不可取消')
    const existingHistory = await transaction.collection('orderStatusHistory').where({ orderNo: order.orderNo }).limit(1).get()
    if (!existingHistory.data || !existingHistory.data[0]) await transaction.collection('orderStatusHistory').add({ data: history(order.orderNo, null, 'placed', 'customer') })
    if (!order.stockReleasedAt) await restoreStock(order.items, transaction)
    const paymentRequired = order.paymentRequired === true || ['pending', 'paid', 'closed'].includes(order.paymentStatus)
    const paid = paymentRequired && order.paymentStatus === 'paid'
    const paymentStatus = paymentRequired ? (paid ? 'paid' : 'closed') : 'not_required'
    const refundStatus = paid ? (order.refundStatus === 'succeeded' ? 'succeeded' : 'pending') : 'none'
    const update = { orderStatus: 'canceled', refundStatus, canceledAt: db.serverDate(), updatedAt: db.serverDate(), ...(paymentRequired ? { paymentRequired: true, paymentStatus } : { paymentRequired: false }) }
    if (!order.stockReleasedAt) update.stockReleasedAt = db.serverDate()
    await orderCollection.doc(order._id).update({ data: update })
    if (paid && order.refundStatus !== 'succeeded') {
      const refundNo = `R${order.orderNo}`
      const existingRefund = await transaction.collection('refunds').where({ refundNo }).limit(1).get()
      if (!existingRefund.data || !existingRefund.data[0]) await transaction.collection('refunds').add({ data: { refundNo, orderNo: order.orderNo, ownerOpenId: openid, amountFen: order.paidAmountFen || order.payableAmountFen, status: 'pending', createdAt: db.serverDate(), updatedAt: db.serverDate() } })
    }
    await transaction.collection('orderStatusHistory').add({ data: history(order.orderNo, 'placed', 'canceled', 'customer') })
    return { orderNo: order.orderNo, orderStatus: 'canceled', paymentStatus, refundStatus }
  })
  return result
}

exports.main = async (event) => {
  const action = event && event.action
  if (action === 'configurationStatus') return ok({ paymentEnabled: paymentEnabled(process.env) })
  const openid = owner()
  if (!openid) return fail('AUTH_REQUIRED', '请先完成微信登录')
  try {
    if (action === 'createOrder') { const result = await create(openid, event); return result.ok === false ? result : ok(result) }
    if (action === 'listOrders') return ok(await list(openid))
    if (action === 'getOrder') { const result = await get(openid, event.orderNo); return result.ok === false ? result : ok(result) }
    if (action === 'cancelOrder') { const result = await cancel(openid, event.orderNo); return result.ok === false ? result : ok(result) }
    return fail('INVALID_INPUT', '不支持的订单操作')
  } catch (error) {
    const stage = error && error.orderStage ? error.orderStage : 'UNEXPECTED'
    console.error('order failed', event && event.action, stage, error && error.message)
    return fail('INTERNAL_ERROR', `订单服务暂时不可用（${stage}）`)
  }
}

module.exports = Object.assign(exports, { FLOWS, canonicalItems, sameItems, quoteIsUsable, publicOrder, QUOTE_TTL_SECONDS, PAYMENT_TTL_SECONDS })
