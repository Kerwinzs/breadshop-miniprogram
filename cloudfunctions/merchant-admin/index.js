const cloud = require('wx-server-sdk')
const { verifyToken } = require('./token')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const MAX_PAGE_SIZE = 100
const FLOWS = { pickup: ['placed', 'preparing', 'ready_for_pickup', 'completed'], local: ['placed', 'preparing', 'delivering', 'completed'], shipping: ['placed', 'preparing', 'awaiting_shipment', 'in_transit', 'completed'] }
const ORDER_QUEUES = { pending: ['placed'], preparing: ['preparing'], fulfilling: ['ready_for_pickup', 'delivering', 'awaiting_shipment', 'in_transit'], completed: ['completed'], canceled: ['canceled'] }
const REQUIRED_DELIVERY_PRODUCT_IDS = new Set(['shipping-required-packaging', 'shipping-required-sf-collect', 'shipping-required-notice', 'local-required-packaging', 'local-required-delivery-collect', 'local-required-notice'])
const ACTION_PERMISSIONS = {
  listOrders: 'orders.read', getDashboardSummary: 'orders.read', getOrder: 'orders.read', advanceOrder: 'orders.advance', cancelOrder: 'orders.cancel',
  listProducts: 'products.read', listProductCategories: 'products.read', getProduct: 'products.read', createProduct: 'products.write', saveProduct: 'products.write', bulkSetProductListing: 'products.write', bulkSetProductSoldOut: 'products.toggleSoldOut', saveHomeRecommendations: 'products.write', uploadProductImage: 'products.write', uploadPageContentImage: 'products.write', getPageConfiguration: 'products.read', savePageConfiguration: 'products.write', deleteProduct: 'products.delete', toggleSoldOut: 'products.toggleSoldOut', createProductCategory: 'products.write', saveProductCategory: 'products.write', deleteProductCategory: 'products.delete',
  listStores: 'stores.read', getStore: 'stores.read', createStore: 'stores.create', saveStore: 'stores.write', deleteStore: 'stores.delete', toggleStoreOpen: 'stores.toggleOpen',
  listAuditLogs: 'auditLogs.read', retryRefund: 'refunds.retry'
}
const PAYMENT_STATUSES = ['pending', 'paid', 'closed']
const REFUND_STATUSES = ['none', 'pending', 'succeeded', 'failed']
const PRODUCT_FIELDS = ['name', 'desc', 'detailDesc', 'category', 'categoryIds', 'artClass', 'imageUrls', 'priceFen', 'deliveryPriceFen', 'stockQuantity', 'specs', 'supportsPickup', 'supportsLocalDelivery', 'supportsShipping', 'enabled', 'sortOrder']
const CATEGORY_FIELDS = ['name', 'sortOrder', 'enabled']
const STORE_FIELDS = ['name', 'addressText', 'businessHours', 'enabled', 'distanceText']
const IMAGE_MAX_BYTES = 1024 * 1024
const IMAGE_MAX_COUNT = 5
const PAGE_IDS = new Set(['home', 'profile'])
const PAGE_CONTENT_LIMITS = { heroKicker: 80, heroTitle: 120, heroCopy: 240, heroPill: 120, noticeText: 240, brandKicker: 80, brandTitle: 120, brandSubtitle: 160, tipTitle: 120, tipText: 240 }
const PAGE_CONTENT_KEYS = Object.keys(PAGE_CONTENT_LIMITS)
function ok(data) { return { ok: true, data } }
function fail(code, message) { return { ok: false, error: { code, message } } }
function validId(value) { return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value) }
function pageOf(event) { const pageValue = event && event.page === undefined ? 1 : Number(event && event.page), sizeValue = event && event.pageSize === undefined ? 20 : Number(event && event.pageSize); return Number.isInteger(pageValue) && pageValue > 0 && Number.isInteger(sizeValue) && sizeValue > 0 && sizeValue <= MAX_PAGE_SIZE ? { page: pageValue, pageSize: sizeValue } : null }
function keyword(value) { return typeof value === 'string' && value.length <= 64 ? value.trim() : null }
function merchant(event, permission) {
  const secret = String(process.env.MERCHANT_TOKEN_SECRET || '')
  if (Buffer.byteLength(secret, 'utf8') < 32) return fail('AUTH_CONFIG_MISSING', '商家服务尚未完成服务端配置')
  const actor = verifyToken(event && event.token, secret)
  if (!actor) return fail('AUTH_REQUIRED', '商家登录已失效，请重新登录')
  if (!actor.permissions.includes(permission)) return fail('PERMISSION_DENIED', '当前账号没有此操作权限')
  return actor
}
function dtoProduct(doc, categories = []) { const byId = new Map(categories.map((item) => [item.categoryId || item._id, item.name])); const categoryIds = Array.isArray(doc.categoryIds) ? doc.categoryIds.filter(validId).slice(0, 2) : []; const categoryNames = categoryIds.map((id) => byId.get(id)).filter(Boolean); if (!categoryNames.length && doc.category) categoryNames.push(doc.category); return { productId: doc.productId || doc._id, name: doc.name || '', desc: doc.desc || '', detailDesc: doc.detailDesc || '', category: categoryNames[0] || doc.category || '', categoryIds, categoryNames, artClass: doc.artClass || '', imageUrls: Array.isArray(doc.imageUrls) ? doc.imageUrls : [], priceFen: Number(doc.priceFen) || 0, deliveryPriceFen: Number(doc.deliveryPriceFen) || 0, stockQuantity: Number.isInteger(doc.stockQuantity) ? doc.stockQuantity : null, soldOut: doc.soldOut === true, enabled: doc.enabled !== false, supportsPickup: doc.supportsPickup !== false, supportsLocalDelivery: doc.supportsLocalDelivery !== false, supportsShipping: doc.supportsShipping !== false, homeRecommended: doc.homeRecommended === true, homeRecommendOrder: Number(doc.homeRecommendOrder) || 0, specs: Array.isArray(doc.specs) ? doc.specs : [], sortOrder: Number(doc.sortOrder) || 0, version: Number(doc.version) || 1, updatedAt: doc.updatedAt } }
function dtoCategory(doc) { return { categoryId: doc.categoryId || doc._id, name: doc.name || '', sortOrder: Number(doc.sortOrder) || 0, enabled: doc.enabled !== false, version: Number(doc.version) || 1, updatedAt: doc.updatedAt } }
function dtoStore(doc) { return { storeId: doc.storeId || doc._id, name: doc.name || '', addressText: doc.addressText || (typeof doc.address === 'string' ? doc.address : ''), businessHours: doc.businessHours || '', status: doc.status === 'closed' ? 'closed' : 'open', enabled: doc.enabled !== false, distanceText: doc.distanceText || '', updatedAt: doc.updatedAt } }
function dtoOrderItem(item) { return { productId: item && item.productId || '', productName: item && item.productName || '', specId: item && item.specId || '', specName: item && item.specName || '', unitPriceFen: Number(item && item.unitPriceFen) || 0, quantity: Number(item && item.quantity) || 0, lineTotalFen: Number(item && item.lineTotalFen) || 0 } }
function dtoStoreSnapshot(store) { return store ? { storeId: store.storeId || '', name: store.name || '', addressText: store.addressText || '', businessHours: store.businessHours || '' } : null }
function dtoAddressSnapshot(address) { return address ? { contactName: address.contactName || '', phone: address.phone || '', province: address.province || '', city: address.city || '', district: address.district || '', detail: address.detail || '', postalCode: address.postalCode || '', fullAddress: address.fullAddress || `${address.province || ''}${address.city || ''}${address.district || ''}${address.detail || ''}` } : null }
function paymentRequired(doc) { return doc.paymentRequired === true || PAYMENT_STATUSES.includes(doc.paymentStatus) }
function paymentState(doc) { return paymentRequired(doc) ? (PAYMENT_STATUSES.includes(doc.paymentStatus) ? doc.paymentStatus : 'pending') : 'not_required' }
function refundState(doc) { return REFUND_STATUSES.includes(doc.refundStatus) ? doc.refundStatus : 'none' }
function paymentProjection(doc) { const required = paymentRequired(doc); return { paymentRequired: required, paymentStatus: paymentState(doc), refundStatus: refundState(doc), payableAmountFen: required && Number.isInteger(doc.payableAmountFen) ? doc.payableAmountFen : 0, paidAmountFen: required && Number.isInteger(doc.paidAmountFen) ? doc.paidAmountFen : 0, refundedAmountFen: required && Number.isInteger(doc.refundedAmountFen) ? doc.refundedAmountFen : 0, paidAt: required ? (doc.paidAt || null) : null, refundRequestedAt: required ? (doc.refundRequestedAt || null) : null, refundedAt: required ? (doc.refundedAt || null) : null } }
function dtoOrder(doc, addressAllowed, paymentAllowed = false) { const result = { orderNo: doc.orderNo, purchaseScene: doc.purchaseScene, deliveryMethod: doc.deliveryMethod || null, orderStatus: doc.orderStatus, storeSnapshot: dtoStoreSnapshot(doc.storeSnapshot), items: Array.isArray(doc.items) ? doc.items.map(dtoOrderItem) : [], subtotalFen: Number(doc.subtotalFen) || 0, insulationFeeFen: Number(doc.insulationFeeFen) || 0, deliveryFeeFen: Number(doc.deliveryFeeFen) || 0, postageFen: Number(doc.postageFen) || 0, totalFen: Number(doc.totalFen) || 0, createdAt: doc.createdAt, updatedAt: doc.updatedAt, completedAt: doc.completedAt || null, canceledAt: doc.canceledAt || null }; if (addressAllowed && doc.addressSnapshot) result.addressSnapshot = dtoAddressSnapshot(doc.addressSnapshot); if (paymentAllowed) Object.assign(result, paymentProjection(doc)); return result }
function dtoHistory(doc) { return { fromStatus: doc.fromStatus || null, toStatus: doc.toStatus, source: doc.source || '', operatorType: doc.operatorType || '', reason: doc.reason || '', changedAt: doc.createdAt } }
function dtoAudit(doc) { return { id: doc._id, actorId: doc.actorId || '', actorRole: doc.actorRole || '', action: doc.action || '', targetType: doc.targetType || '', targetId: doc.targetId || '', before: doc.before || {}, after: doc.after || {}, reason: doc.reason || '', requestId: doc.requestId || '', createdAt: doc.createdAt } }
function nextStatus(order) { const flow = order.purchaseScene === 'pickup' ? FLOWS.pickup : FLOWS[order.deliveryMethod]; const index = flow ? flow.indexOf(order.orderStatus) : -1; return index >= 0 && index < flow.length - 1 ? flow[index + 1] : null }
function isAuditUnavailable(error) { return /auditLogs|collection.*not.*exist|collection.*not.*found/i.test(String(error && error.message)) }
function isRefundServiceUnavailable(error) { return /refunds|refund.*service/i.test(String(error && error.message)) && /not.*exist|not.*found|unavailable|timeout|failed/i.test(String(error && error.message)) }
async function find(collection, field, value, scope) { const result = await (scope || db).collection(collection).where({ [field]: value }).limit(1).get(); return result.data && result.data[0] }
async function auditAvailable() { try { await db.collection('auditLogs').limit(1).get(); return null } catch (error) { if (isAuditUnavailable(error)) return fail('AUDIT_LOG_UNAVAILABLE', '审计日志集合尚未创建，管理写操作已拒绝'); throw error } }
function audit(actor, action, type, id, before, after, event) { return { actorId: actor.sub, actorRole: actor.roleId || '', action, targetType: type, targetId: id, before, after, reason: typeof event.reason === 'string' ? event.reason.slice(0, 200) : '', requestId: typeof event.requestId === 'string' ? event.requestId.slice(0, 80) : '', createdAt: db.serverDate() } }
function patch(input, fields, kind) {
  if (!input || typeof input !== 'object') return null
  const result = {}; for (const field of fields) if (Object.prototype.hasOwnProperty.call(input, field)) result[field] = input[field]
  if (!Object.keys(result).length) return null
  if (kind === 'product') {
    for (const field of ['priceFen', 'deliveryPriceFen', 'stockQuantity', 'sortOrder']) if (field in result && (!Number.isInteger(result[field]) || result[field] < 0)) return null
    for (const field of ['enabled', 'supportsPickup', 'supportsLocalDelivery', 'supportsShipping']) if (field in result && typeof result[field] !== 'boolean') return null
    if ('imageUrls' in result && (!Array.isArray(result.imageUrls) || result.imageUrls.length > IMAGE_MAX_COUNT || result.imageUrls.some((item) => typeof item !== 'string' || item.length > 500 || !/^cloud:\/\/cloud1-d9gc800bmc6952073\.[^/]+\/product-images\//.test(item)))) return null
    if ('desc' in result && (typeof result.desc !== 'string' || result.desc.trim().length > 80)) return null
    if ('categoryIds' in result && (!Array.isArray(result.categoryIds) || result.categoryIds.length < 1 || result.categoryIds.length > 2 || result.categoryIds.some((id) => !validId(id)) || new Set(result.categoryIds).size !== result.categoryIds.length)) return null
    if ('specs' in result) {
      if (!Array.isArray(result.specs) || !result.specs.length || result.specs.some((item) => !item || typeof item !== 'object' || !validId(item.specId || item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length > 80 || !Number.isInteger(item.extraFeeFen) || item.extraFeeFen < 0 || (item.enabled !== undefined && typeof item.enabled !== 'boolean'))) return null
      const specIds = result.specs.map((item) => item.specId || item.id)
      if (new Set(specIds).size !== specIds.length) return null
      if (!result.specs.some((item) => item.enabled !== false)) return null
      result.specs = result.specs.map((item) => ({ specId: item.specId || item.id, name: item.name.trim(), extraFeeFen: item.extraFeeFen, enabled: item.enabled !== false }))
    }
  }
  if (kind === 'category') {
    if ('name' in result && (typeof result.name !== 'string' || !result.name.trim() || result.name.trim().length > 40)) return null
    if ('sortOrder' in result && (!Number.isInteger(result.sortOrder) || result.sortOrder < 0)) return null
    if ('enabled' in result && typeof result.enabled !== 'boolean') return null
    if ('name' in result) result.name = result.name.trim()
  }
  for (const field of ['name', 'desc', 'detailDesc', 'category', 'artClass', 'addressText', 'businessHours', 'distanceText']) if (field in result && (typeof result[field] !== 'string' || result[field].length > 500)) return null
  return result
}
function matches(doc, input, fields) { const term = keyword(input.keyword); return !term || fields.some((field) => String(doc[field] || '').toLowerCase().includes(term.toLowerCase())) }
function validProductBulkFilters(event) { return typeof event.listed === 'boolean' && (event.categoryId === undefined || validId(event.categoryId)) && (event.keyword === undefined || (typeof event.keyword === 'string' && event.keyword.length <= 64)) }
function validProductBulkSoldOutFilters(event) { return typeof event.soldOut === 'boolean' && (event.categoryId === undefined || validId(event.categoryId)) && (event.keyword === undefined || (typeof event.keyword === 'string' && event.keyword.length <= 64)) }
function bulkListingFields(listed) { return { enabled: listed, supportsPickup: listed, supportsLocalDelivery: listed, supportsShipping: listed } }
function auditDate(value, endOfDay) {
  if (value === undefined || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}T00:00:00.000+08:00`)
  if (Number.isNaN(date.getTime()) || date.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }) !== value) return undefined
  if (endOfDay) date.setTime(date.getTime() + 24 * 60 * 60 * 1000)
  return date
}
function paginate(items, paging) { const total = items.length, start = (paging.page - 1) * paging.pageSize; return { items: items.slice(start, start + paging.pageSize), page: paging.page, pageSize: paging.pageSize, total } }
function queueOfStatus(status) { return Object.keys(ORDER_QUEUES).find((queue) => ORDER_QUEUES[queue].includes(status)) || null }
function orderTime(value) { const time = value instanceof Date ? value.getTime() : new Date(value).getTime(); return Number.isFinite(time) ? time : 0 }
function shanghaiDay(value) { const time = orderTime(value); if (!time) return ''; return new Date(time).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }) }
function recentDays(days, now) { const result = []; const stamp = new Date(now); for (let offset = days - 1; offset >= 0; offset -= 1) { const date = new Date(stamp.getTime() - offset * 86400000); result.push(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(date)) } return result }
function orderQueueCounts(orders) { return Object.keys(ORDER_QUEUES).reduce((result, queue) => ({ ...result, [queue]: orders.filter((order) => queueOfStatus(order.orderStatus) === queue).length }), {}) }
function validOrderFilters(event) { return !(event.purchaseScene && !['pickup', 'delivery'].includes(event.purchaseScene)) && !(event.deliveryMethod && !['local', 'shipping'].includes(event.deliveryMethod)) && !(event.queue && !Object.prototype.hasOwnProperty.call(ORDER_QUEUES, event.queue)) && !(event.sort && !['createdAtAsc', 'createdAtDesc'].includes(event.sort)) }
async function readOrders() { const orders = []; for (let offset = 0; offset < 10000; offset += MAX_PAGE_SIZE) { const result = await db.collection('orders').orderBy('createdAt', 'desc').skip(offset).limit(MAX_PAGE_SIZE).get(); const batch = result.data || []; orders.push(...batch); if (batch.length < MAX_PAGE_SIZE) break } return orders }
async function listOrders(event, actor) {
  const paging = pageOf(event); if (!paging || !validOrderFilters(event)) return fail('INVALID_INPUT', '订单筛选、队列或分页参数无效')
  if (event.queue && event.orderStatus && !ORDER_QUEUES[event.queue].includes(event.orderStatus)) return fail('INVALID_INPUT', '订单状态不属于所选队列')
  const startAt = auditDate(event.orderStartDate, false); const endAt = auditDate(event.orderEndDate, true)
  if (startAt === undefined || endAt === undefined || (startAt && endAt && startAt >= endAt)) return fail('INVALID_INPUT', '下单日期范围无效')
  const all = await readOrders(); const queue = event.queue || null
  const filtered = all.filter((doc) => { const createdAt = new Date(orderTime(doc.createdAt)); return (!startAt || createdAt >= startAt) && (!endAt || createdAt < endAt) && (!event.purchaseScene || doc.purchaseScene === event.purchaseScene) && (!event.deliveryMethod || doc.deliveryMethod === event.deliveryMethod) && (!event.orderStatus || doc.orderStatus === event.orderStatus) && (!queue || queueOfStatus(doc.orderStatus) === queue) && matches(doc, event, ['orderNo']) })
  const ascending = event.sort === 'createdAtAsc' || (!event.sort && queue === 'pending')
  filtered.sort((left, right) => ascending ? orderTime(left.createdAt) - orderTime(right.createdAt) : orderTime(right.createdAt) - orderTime(left.createdAt))
  const page = paginate(filtered, paging); return { orders: page.items.map((doc) => dtoOrder(doc, actor.permissions.includes('orders.address.read'), actor.permissions.includes('payments.read'))), page: page.page, pageSize: page.pageSize, total: page.total, queueCounts: orderQueueCounts(all) }
}
async function getDashboardSummary(event, actor) {
  const orders = await readOrders(); const now = Date.now(); const today = shanghaiDay(now); const trendDays = recentDays(7, now)
  const todayOrders = orders.filter((order) => shanghaiDay(order.createdAt) === today)
  const pending = orders.filter((order) => queueOfStatus(order.orderStatus) === 'pending').sort((left, right) => orderTime(left.createdAt) - orderTime(right.createdAt)).slice(0, 5)
  const trend = trendDays.map((day) => { const daily = orders.filter((order) => shanghaiDay(order.createdAt) === day); return { date: day, orderCount: daily.length, orderAmountFen: daily.reduce((sum, order) => sum + (Number(order.totalFen) || 0), 0) } })
  const queueCounts = orderQueueCounts(orders)
  const todaySummary = { orderCount: todayOrders.length, orderAmountFen: todayOrders.reduce((sum, order) => sum + (Number(order.totalFen) || 0), 0), completedCount: orders.filter((order) => shanghaiDay(order.completedAt) === today).length, canceledCount: orders.filter((order) => shanghaiDay(order.canceledAt) === today).length, pendingCount: queueCounts.pending }
  if (actor.permissions.includes('payments.read')) {
    const paidAmountFen = orders.filter((order) => paymentRequired(order) && paymentState(order) === 'paid' && shanghaiDay(order.paidAt) === today).reduce((sum, order) => sum + paymentProjection(order).paidAmountFen, 0)
    const refundedAmountFen = orders.filter((order) => refundState(order) === 'succeeded' && shanghaiDay(order.refundedAt) === today).reduce((sum, order) => sum + paymentProjection(order).refundedAmountFen, 0)
    Object.assign(todaySummary, { paidAmountFen, refundedAmountFen, netReceivedAmountFen: paidAmountFen - refundedAmountFen })
  }
  return { queueCounts, pendingOrders: pending.map((order) => dtoOrder(order, false, actor.permissions.includes('payments.read'))), today: todaySummary, financialNotice: actor.permissions.includes('payments.read') ? '按订单支付快照汇总，仅供经营参考，不是渠道对账单或财务报表。' : '当前账号无资金数据查看权限；订单金额不是实收。', trend }
}
async function getOrder(event, actor) { if (!validId(event.orderNo)) return fail('INVALID_INPUT', '订单号无效'); const order = await find('orders', 'orderNo', event.orderNo); if (!order) return fail('ORDER_NOT_FOUND', '订单不存在'); const history = await db.collection('orderStatusHistory').where({ orderNo: order.orderNo }).orderBy('createdAt', 'asc').limit(100).get(); return { order: dtoOrder(order, actor.permissions.includes('orders.address.read'), actor.permissions.includes('payments.read')), history: (history.data || []).map(dtoHistory), nextStatus: nextStatus(order) } }
async function advanceOrder(event, actor) {
  if (!validId(event.orderNo) || typeof event.toStatus !== 'string') return fail('INVALID_INPUT', '订单状态参数无效')
  const unavailable = await auditAvailable(); if (unavailable) return unavailable
  const result = await db.runTransaction(async (tx) => {
    const order = await find('orders', 'orderNo', event.orderNo, tx); if (!order) return fail('ORDER_NOT_FOUND', '订单不存在')
    const expected = nextStatus(order); if (event.toStatus !== expected) return fail('ORDER_STATUS_INVALID', '订单状态不能这样推进')
    if (order.orderStatus === 'placed' && paymentRequired(order) && paymentState(order) !== 'paid') return fail('ORDER_NOT_PAID', '订单尚未支付，不能进入制作')
    const before = { orderStatus: order.orderStatus }, after = { orderStatus: expected }
    await tx.collection('orders').doc(order._id).update({ data: { ...after, updatedAt: db.serverDate(), ...(expected === 'completed' ? { completedAt: db.serverDate() } : {}) } })
    await tx.collection('orderStatusHistory').add({ data: { orderNo: order.orderNo, fromStatus: order.orderStatus, toStatus: expected, source: 'merchant', operatorType: 'merchant', operatorId: actor.sub, reason: typeof event.reason === 'string' ? event.reason.slice(0, 200) : '', createdAt: db.serverDate() } })
    await tx.collection('auditLogs').add({ data: { ...audit(actor, 'orders.advance', 'order', order.orderNo, before, after, event), ...(paymentRequired(order) ? {} : { legacyPaymentExempt: true }) } })
    return { orderNo: order.orderNo, orderStatus: expected, ownerOpenId: order.ownerOpenId, order }
  })
  if (result && result.ok === false) return result
  if (result && ['ready_for_pickup', 'delivering', 'in_transit'].includes(result.orderStatus) && result.ownerOpenId) {
    try { await cloud.callFunction({ name: 'subscribe-notify', data: { openid: result.ownerOpenId, orderNo: result.orderNo, orderStatus: result.orderStatus, order: result.order } }) } catch (error) { console.warn('订阅消息发送失败', error && error.message) }
  }
  return { orderNo: result.orderNo, orderStatus: result.orderStatus }
}
async function restoreStock(items, scope) {
  const quantities = (Array.isArray(items) ? items : []).reduce((result, item) => { if (item && validId(item.productId) && Number.isInteger(item.quantity) && item.quantity > 0) result[item.productId] = (result[item.productId] || 0) + item.quantity; return result }, {})
  for (const [productId, quantity] of Object.entries(quantities)) {
    const product = await find('products', 'productId', productId, scope)
    if (!product || !Number.isInteger(product.stockQuantity)) continue
    await scope.collection('products').doc(product._id).update({ data: { stockQuantity: product.stockQuantity + quantity, updatedAt: db.serverDate() } })
  }
}
async function cancelOrder(event, actor) {
  if (!validId(event.orderNo) || typeof event.reason !== 'string' || !event.reason.trim() || event.reason.trim().length > 200) return fail('INVALID_INPUT', '请填写不超过 200 字的取消原因')
  const unavailable = await auditAvailable(); if (unavailable) return unavailable
  return db.runTransaction(async (tx) => {
    const order = await find('orders', 'orderNo', event.orderNo, tx)
    if (!order) return fail('ORDER_NOT_FOUND', '订单不存在')
    if (order.orderStatus !== 'placed') return fail('ORDER_CANNOT_CANCEL', '只有尚未制作的订单可以撤销')
    const currentPayment = paymentState(order), currentRefund = refundState(order)
    if (currentPayment === 'closed') return fail('ORDER_PAYMENT_CLOSED', '订单支付已关闭')
    if (currentPayment === 'paid' && currentRefund !== 'none') return fail('REFUND_ALREADY_REQUESTED', '该订单已有退款请求，不能重复发起')
    if (currentPayment === 'paid' && !actor.permissions.includes('refunds.create')) return fail('PERMISSION_DENIED', '当前账号没有发起退款的权限')
    if (currentPayment === 'paid' && process.env.MERCHANT_REFUND_REQUEST_MODE !== 'queue') return fail('PAYMENT_SERVICE_CONFIG_MISSING', '退款请求服务尚未完成配置，订单未撤销')
    if (currentPayment === 'paid' && paymentProjection(order).paidAmountFen <= 0) return fail('PAYMENT_STATE_INVALID', '订单实付金额无效，无法安全发起退款')
    const before = { orderStatus: order.orderStatus, paymentStatus: currentPayment, refundStatus: currentRefund }
    const after = { orderStatus: 'canceled', canceledAt: db.serverDate(), ...(!order.stockReleasedAt ? { stockReleasedAt: db.serverDate() } : {}), ...(currentPayment === 'paid' ? { refundStatus: 'pending', refundRequestedAt: db.serverDate() } : currentPayment === 'pending' ? { paymentStatus: 'closed' } : { paymentRequired: false }) }
    if (currentPayment === 'paid') {
      const refundNo = `R${order.orderNo}`
      const duplicate = await find('refunds', 'refundNo', refundNo, tx)
      if (duplicate) return fail('REFUND_ALREADY_REQUESTED', '该订单已有退款请求，不能重复发起')
      await tx.collection('refunds').add({ data: { refundNo, orderNo: order.orderNo, amountFen: paymentProjection(order).paidAmountFen, status: 'pending', reason: event.reason.trim(), requestedBy: actor.sub, attemptCount: 1, createdAt: db.serverDate(), updatedAt: db.serverDate() } })
    }
    if (!order.stockReleasedAt) await restoreStock(order.items, tx)
    await tx.collection('orders').doc(order._id).update({ data: { ...after, updatedAt: db.serverDate() } })
    await tx.collection('orderStatusHistory').add({ data: { orderNo: order.orderNo, fromStatus: order.orderStatus, toStatus: 'canceled', source: 'merchant', operatorType: 'merchant', operatorId: actor.sub, reason: event.reason.trim(), createdAt: db.serverDate() } })
    await tx.collection('auditLogs').add({ data: audit(actor, currentPayment === 'paid' ? 'refunds.create' : 'orders.cancel', 'order', order.orderNo, before, { orderStatus: 'canceled', paymentStatus: after.paymentStatus || currentPayment, refundStatus: after.refundStatus || currentRefund }, { ...event, reason: event.reason.trim() }) })
    return { orderNo: order.orderNo, orderStatus: 'canceled', paymentStatus: after.paymentStatus || currentPayment, refundStatus: after.refundStatus || currentRefund }
  })
}
async function retryRefund(event, actor) {
  if (!validId(event.orderNo) || typeof event.reason !== 'string' || !event.reason.trim() || event.reason.trim().length > 200) return fail('INVALID_INPUT', '请填写不超过 200 字的重试原因')
  if (process.env.MERCHANT_REFUND_REQUEST_MODE !== 'queue') return fail('PAYMENT_SERVICE_CONFIG_MISSING', '退款请求服务尚未完成配置')
  const unavailable = await auditAvailable(); if (unavailable) return unavailable
  return db.runTransaction(async (tx) => {
    const order = await find('orders', 'orderNo', event.orderNo, tx)
    if (!order) return fail('ORDER_NOT_FOUND', '订单不存在')
    if (paymentState(order) !== 'paid' || refundState(order) !== 'failed') return fail('REFUND_RETRY_INVALID', '仅退款失败的已支付订单可以重试')
    const refundNo = `R${order.orderNo}`, refund = await find('refunds', 'refundNo', refundNo, tx)
    if (!refund) return fail('PAYMENT_SERVICE_UNAVAILABLE', '退款请求记录不存在，无法安全重试')
    if (refund.status !== 'failed') return fail('REFUND_RETRY_INVALID', '退款请求当前状态不允许重试')
    await tx.collection('refunds').doc(refund._id).update({ data: { status: 'pending', attemptCount: (Number(refund.attemptCount) || 1) + 1, lastRetryReason: event.reason.trim(), updatedAt: db.serverDate() } })
    await tx.collection('orders').doc(order._id).update({ data: { refundStatus: 'pending', refundRequestedAt: db.serverDate(), updatedAt: db.serverDate() } })
    await tx.collection('auditLogs').add({ data: audit(actor, 'refunds.retry', 'order', order.orderNo, { paymentStatus: 'paid', refundStatus: 'failed' }, { paymentStatus: 'paid', refundStatus: 'pending' }, event) })
    return { orderNo: order.orderNo, paymentStatus: 'paid', refundStatus: 'pending' }
  })
}
async function readCategories(scope) { const result = await (scope || db).collection('productCategories').orderBy('sortOrder', 'asc').limit(MAX_PAGE_SIZE).get(); return result.data || [] }
function productHasCategory(doc, categoryId, categories) { if (!categoryId) return true; if (Array.isArray(doc.categoryIds) && doc.categoryIds.includes(categoryId)) return true; const legacy = categories.find((item) => (item.categoryId || item._id) === categoryId); return Boolean(legacy && doc.category === legacy.name) }
async function listProducts(event) { const paging = pageOf(event); if (!paging || (event.categoryId !== undefined && typeof event.categoryId !== 'string')) return fail('INVALID_INPUT', '筛选或分页参数无效'); const [result, categories] = await Promise.all([db.collection('products').orderBy('sortOrder', 'asc').limit(MAX_PAGE_SIZE).get(), readCategories()]); const list = (result.data || []).filter((doc) => productHasCategory(doc, event.categoryId, categories) && matches(doc, event, ['name', 'desc', 'category'])).map((doc) => dtoProduct(doc, categories)); const page = paginate(list, paging); return { products: page.items, page: page.page, pageSize: page.pageSize, total: page.total } }
async function bulkSetProductListing(event, actor) {
  if (!validProductBulkFilters(event)) return fail('INVALID_INPUT', '批量上下架参数无效')
  const unavailable = await auditAvailable(); if (unavailable) return unavailable
  const [result, categories] = await Promise.all([db.collection('products').orderBy('sortOrder', 'asc').limit(MAX_PAGE_SIZE).get(), readCategories()])
  const matched = (result.data || []).filter((doc) => productHasCategory(doc, event.categoryId, categories) && matches(doc, event, ['name', 'desc', 'category']))
  if ((result.data || []).length >= MAX_PAGE_SIZE) return fail('TOO_MANY_PRODUCTS', '商品数量超过单次安全批量操作上限，请缩小筛选范围后重试')
  const editable = matched.filter((doc) => !REQUIRED_DELIVERY_PRODUCT_IDS.has(doc.productId || doc._id))
  return db.runTransaction(async (tx) => {
    for (const item of editable) await tx.collection('products').doc(item._id).update({ data: { ...bulkListingFields(event.listed), version: (Number(item.version) || 1) + 1, updatedAt: db.serverDate() } })
    await tx.collection('auditLogs').add({ data: audit(actor, 'products.bulkListing.write', 'productFilter', 'current-filter', { keyword: keyword(event.keyword) || '', categoryId: typeof event.categoryId === 'string' ? event.categoryId : '', matchedCount: matched.length }, { listed: event.listed, updatedCount: editable.length, skippedRequiredCount: matched.length - editable.length }, event) })
    return { listed: event.listed, matchedCount: matched.length, updatedCount: editable.length, skippedRequiredCount: matched.length - editable.length }
  })
}
async function bulkSetProductSoldOut(event, actor) {
  if (!validProductBulkSoldOutFilters(event)) return fail('INVALID_INPUT', '批量售罄参数无效')
  const unavailable = await auditAvailable(); if (unavailable) return unavailable
  const [result, categories] = await Promise.all([db.collection('products').orderBy('sortOrder', 'asc').limit(MAX_PAGE_SIZE).get(), readCategories()])
  const matched = (result.data || []).filter((doc) => productHasCategory(doc, event.categoryId, categories) && matches(doc, event, ['name', 'desc', 'category']))
  if ((result.data || []).length >= MAX_PAGE_SIZE) return fail('TOO_MANY_PRODUCTS', '商品数量超过单次安全批量操作上限，请缩小筛选范围后重试')
  const editable = matched.filter((doc) => !REQUIRED_DELIVERY_PRODUCT_IDS.has(doc.productId || doc._id))
  return db.runTransaction(async (tx) => {
    for (const item of editable) await tx.collection('products').doc(item._id).update({ data: { soldOut: event.soldOut, version: (Number(item.version) || 1) + 1, updatedAt: db.serverDate() } })
    await tx.collection('auditLogs').add({ data: audit(actor, 'products.bulkSoldOut.write', 'productFilter', 'current-filter', { keyword: keyword(event.keyword) || '', categoryId: typeof event.categoryId === 'string' ? event.categoryId : '', matchedCount: matched.length }, { soldOut: event.soldOut, updatedCount: editable.length, skippedRequiredCount: matched.length - editable.length }, event) })
    return { soldOut: event.soldOut, matchedCount: matched.length, updatedCount: editable.length, skippedRequiredCount: matched.length - editable.length }
  })
}
async function listProductCategories() { const result = await db.collection('productCategories').orderBy('sortOrder', 'asc').limit(MAX_PAGE_SIZE).get(); return { categories: (result.data || []).map(dtoCategory).sort((left, right) => left.sortOrder - right.sortOrder || new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime() || left.categoryId.localeCompare(right.categoryId)) } }
async function findCategoryByName(name, scope) { const result = await (scope || db).collection('productCategories').where({ name }).limit(1).get(); return result.data && result.data[0] }
async function createProductCategory(event, actor) {
  if (!validId(event.categoryId)) return fail('INVALID_INPUT', '分类标识无效')
  const category = patch(event.category, CATEGORY_FIELDS, 'category'); if (!category || !category.name) return fail('INVALID_INPUT', '请填写分类名称')
  const unavailable = await auditAvailable(); if (unavailable) return unavailable
  return db.runTransaction(async (tx) => {
    if (await find('productCategories', 'categoryId', event.categoryId, tx)) return fail('CATEGORY_EXISTS', '分类标识已存在')
    if (await findCategoryByName(category.name, tx)) return fail('CATEGORY_NAME_EXISTS', '分类名称已存在')
    const created = { categoryId: event.categoryId, sortOrder: 0, enabled: true, ...category, version: 1, createdAt: db.serverDate(), updatedAt: db.serverDate() }
    await tx.collection('productCategories').add({ data: created }); await tx.collection('auditLogs').add({ data: audit(actor, 'productCategories.create', 'productCategory', event.categoryId, {}, created, event) })
    return { categoryId: event.categoryId, version: 1 }
  })
}
async function saveProductCategory(event, actor) {
  if (!validId(event.categoryId) || (event.version !== undefined && (!Number.isInteger(event.version) || event.version < 1))) return fail('INVALID_INPUT', '分类参数无效')
  const changes = patch(event.category, CATEGORY_FIELDS, 'category'); if (!changes) return fail('INVALID_INPUT', '分类字段无效或为空')
  const unavailable = await auditAvailable(); if (unavailable) return unavailable
  return db.runTransaction(async (tx) => {
    const value = await find('productCategories', 'categoryId', event.categoryId, tx); if (!value) return fail('CATEGORY_NOT_FOUND', '分类不存在')
    if (event.version !== undefined && event.version !== (Number(value.version) || 1)) return fail('VERSION_CONFLICT', '分类已被其他操作更新，请刷新后重试')
    if (changes.name && changes.name !== value.name) { const duplicate = await findCategoryByName(changes.name, tx); if (duplicate && duplicate.categoryId !== value.categoryId) return fail('CATEGORY_NAME_EXISTS', '分类名称已存在') }
    const version = (Number(value.version) || 1) + 1
    await tx.collection('productCategories').doc(value._id).update({ data: { ...changes, version, updatedAt: db.serverDate() } })
    await tx.collection('auditLogs').add({ data: audit(actor, 'productCategories.write', 'productCategory', value.categoryId, dtoCategory(value), { ...changes, version }, event) })
    return { categoryId: value.categoryId, version, affectedProducts: 0 }
  })
}
async function deleteProductCategory(event, actor) {
  if (!validId(event.categoryId)) return fail('INVALID_INPUT', '分类标识无效')
  const unavailable = await auditAvailable(); if (unavailable) return unavailable
  return db.runTransaction(async (tx) => {
    const value = await find('productCategories', 'categoryId', event.categoryId, tx); if (!value) return fail('CATEGORY_NOT_FOUND', '分类不存在')
    const [byId, legacy] = await Promise.all([tx.collection('products').where({ categoryIds: value.categoryId }).limit(1).get(), tx.collection('products').where({ category: value.name }).limit(1).get()]); if ((byId.data && byId.data.length) || (legacy.data && legacy.data.length)) return fail('CATEGORY_IN_USE', '该分类仍有商品使用，不能删除')
    await tx.collection('productCategories').doc(value._id).remove(); await tx.collection('auditLogs').add({ data: audit(actor, 'productCategories.delete', 'productCategory', value.categoryId, dtoCategory(value), {}, event) })
    return { categoryId: value.categoryId, deleted: true }
  })
}
async function getProduct(event) { if (!validId(event.productId)) return fail('INVALID_INPUT', '商品标识无效'); const value = await find('products', 'productId', event.productId); return value ? { product: dtoProduct(value) } : fail('PRODUCT_NOT_FOUND', '商品不存在') }
function jpegSize(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null
  let offset = 2
  while (offset + 9 < buffer.length) { if (buffer[offset] !== 0xff) return null; const marker = buffer[offset + 1]; const length = buffer.readUInt16BE(offset + 2); if (length < 2 || offset + 2 + length > buffer.length) return null; if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }; offset += 2 + length }
  return null
}
async function uploadProductImage(event) {
  if (!validId(event.productId) || !event.image || typeof event.image.dataUrl !== 'string' || !Number.isInteger(event.image.width) || !Number.isInteger(event.image.height)) return fail('INVALID_IMAGE', '图片参数无效')
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(event.image.dataUrl)
  if (!match) return fail('INVALID_IMAGE_FORMAT', '服务端仅接收处理后的 JPEG 图片')
  const content = Buffer.from(match[1], 'base64'); if (!content.length || content.length > IMAGE_MAX_BYTES) return fail('IMAGE_TOO_LARGE', '压缩后图片不能超过 1MB')
  const actual = jpegSize(content); if (!actual || actual.width !== event.image.width || actual.height !== event.image.height) return fail('INVALID_IMAGE', '图片内容与尺寸不匹配')
  const ratio = actual.width / actual.height
  if (actual.width < 600 || actual.height < 600 || actual.width > 1600 || actual.height > 1600 || ratio < 0.6 || ratio > 1.8) return fail('INVALID_IMAGE_DIMENSIONS', '图片宽高均需在 600–1600px，宽高比需在 3:5 至 9:5 之间')
  const digest = require('crypto').createHash('sha256').update(content).digest('hex').slice(0, 20)
  const result = await cloud.uploadFile({ cloudPath: `product-images/${event.productId}/${Date.now()}-${digest}.jpg`, fileContent: content })
  if (!result || typeof result.fileID !== 'string') return fail('IMAGE_UPLOAD_FAILED', '图片存储失败')
  return { fileID: result.fileID }
}
function normalizePageContent(pageId, input) {
  if (!PAGE_IDS.has(pageId) || !input || typeof input !== 'object') return null
  if (input.hero || input.notice || input.brand || input.tip) {
    const allowed = pageId === 'home' ? { hero: ['visible', 'kicker', 'title', 'copy', 'pill'], notice: ['visible', 'text'] } : { brand: ['visible', 'imageUrl', 'kicker', 'title', 'subtitle'], tip: ['visible', 'title', 'text'] }
    const nested = {}
    for (const section of Object.keys(allowed)) {
      if (!input[section] || typeof input[section] !== 'object') continue
      nested[section] = {}
      for (const key of allowed[section]) if (Object.prototype.hasOwnProperty.call(input[section], key)) {
        const value = input[section][key]
        if (key === 'visible') { if (typeof value !== 'boolean') return null; nested[section][key] = value; continue }
        if (typeof value !== 'string' || value.length > (key === 'imageUrl' ? 500 : 240)) return null
        if (key === 'imageUrl' && value && !new RegExp(`^cloud://cloud1-d9gc800bmc6952073\\.[^/]+/page-content/${pageId}/`).test(value)) return null
        nested[section][key] = value.trim()
      }
    }
    return nested
  }
  const result = {}
  for (const key of PAGE_CONTENT_KEYS) if (Object.prototype.hasOwnProperty.call(input, key)) {
    if (typeof input[key] !== 'string' || input[key].trim().length > PAGE_CONTENT_LIMITS[key]) return null
    result[key] = input[key].trim()
  }
  for (const key of ['heroVisible', 'noticeVisible', 'brandVisible', 'tipVisible']) if (Object.prototype.hasOwnProperty.call(input, key)) {
    if (typeof input[key] !== 'boolean') return null
    result[key] = input[key]
  }
  if (Object.prototype.hasOwnProperty.call(input, 'brandImageUrl')) {
    if (typeof input.brandImageUrl !== 'string' || input.brandImageUrl.length > 500 || (input.brandImageUrl && !new RegExp(`^cloud://cloud1-d9gc800bmc6952073\\.[^/]+/page-content/${pageId}/`).test(input.brandImageUrl))) return null
    result.brandImageUrl = input.brandImageUrl
  }
  return result
}
async function getPageConfiguration(event) {
  if (!PAGE_IDS.has(event.pageId)) return fail('INVALID_INPUT', '页面标识无效')
  const result = await db.collection('pageConfigurations').where({ pageId: event.pageId }).limit(1).get()
  const doc = result.data && result.data[0]
  return { pageId: event.pageId, config: doc && doc.config ? doc.config : {}, version: doc ? Number(doc.version) || 1 : 0 }
}
async function savePageConfiguration(event, actor) {
  if (!PAGE_IDS.has(event.pageId) || (event.version !== undefined && (!Number.isInteger(event.version) || event.version < 0))) return fail('INVALID_INPUT', '页面配置参数无效')
  const changes = normalizePageContent(event.pageId, event.config)
  if (!changes) return fail('INVALID_INPUT', '页面配置字段无效')
  const unavailable = await auditAvailable(); if (unavailable) return unavailable
  return db.runTransaction(async (tx) => {
    const result = await tx.collection('pageConfigurations').where({ pageId: event.pageId }).limit(1).get()
    const value = result.data && result.data[0]
    if (event.version !== undefined && value && event.version !== (Number(value.version) || 1)) return fail('VERSION_CONFLICT', '页面配置已被其他操作更新，请刷新后重试')
    const version = (Number(value && value.version) || 0) + 1
    const next = { pageId: event.pageId, config: changes, version, updatedAt: db.serverDate() }
    if (value) await tx.collection('pageConfigurations').doc(value._id).update({ data: next })
    else await tx.collection('pageConfigurations').add({ data: { ...next, createdAt: db.serverDate() } })
    await tx.collection('auditLogs').add({ data: audit(actor, 'pageConfigurations.write', 'pageConfiguration', event.pageId, value ? value.config || {} : {}, changes, event) })
    return { pageId: event.pageId, version }
  })
}
async function uploadPageContentImage(event) {
  if (!PAGE_IDS.has(event.pageId) || !event.image || typeof event.image.dataUrl !== 'string' || !Number.isInteger(event.image.width) || !Number.isInteger(event.image.height)) return fail('INVALID_IMAGE', '图片参数无效')
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(event.image.dataUrl)
  if (!match) return fail('INVALID_IMAGE_FORMAT', '服务端仅接收处理后的 JPEG 图片')
  const content = Buffer.from(match[1], 'base64'); if (!content.length || content.length > IMAGE_MAX_BYTES) return fail('IMAGE_TOO_LARGE', '压缩后图片不能超过 1MB')
  const actual = jpegSize(content); if (!actual || actual.width !== event.image.width || actual.height !== event.image.height) return fail('INVALID_IMAGE', '图片内容与尺寸不匹配')
  const ratio = actual.width / actual.height
  if (actual.width < 600 || actual.height < 600 || actual.width > 1600 || actual.height > 1600 || ratio < 0.6 || ratio > 1.8) return fail('INVALID_IMAGE_DIMENSIONS', '图片宽高均需在 600–1600px，宽高比需在 3:5 至 9:5 之间')
  const digest = require('crypto').createHash('sha256').update(content).digest('hex').slice(0, 20)
  const result = await cloud.uploadFile({ cloudPath: `page-content/${event.pageId}/${Date.now()}-${digest}.jpg`, fileContent: content })
  if (!result || typeof result.fileID !== 'string') return fail('IMAGE_UPLOAD_FAILED', '图片存储失败')
  return { fileID: result.fileID }
}
async function createProduct(event, actor) {
  if (!validId(event.productId)) return fail('INVALID_INPUT', '商品标识无效')
  const product = patch(event.product, PRODUCT_FIELDS, 'product')
  if (!product || !Array.isArray(product.categoryIds) || product.categoryIds.length < 1 || typeof product.name !== 'string' || !product.name.trim() || typeof product.desc !== 'string' || !product.desc.trim() || !Number.isInteger(product.priceFen) || !Number.isInteger(product.deliveryPriceFen) || !Number.isInteger(product.stockQuantity) || !Array.isArray(product.specs) || !product.specs.length) return fail('INVALID_INPUT', '请填写商品名称、分类、价格、库存和至少一个规格')
  const unavailable = await auditAvailable(); if (unavailable) return unavailable
  return db.runTransaction(async (tx) => {
    const existing = await find('products', 'productId', event.productId, tx)
    if (existing) return fail('PRODUCT_EXISTS', '商品标识已存在')
    const categories = await readCategories(tx); const selected = categories.filter((item) => product.categoryIds.includes(item.categoryId || item._id));
    if (selected.length !== product.categoryIds.length || selected.some((item) => item.enabled === false)) return fail('CATEGORY_UNAVAILABLE', '请选择已启用的商品分类')
    const created = { productId: event.productId, desc: '', detailDesc: '', category: selected[0].name, categoryIds: product.categoryIds, artClass: '', imageUrls: [], enabled: true, soldOut: false, supportsPickup: true, supportsLocalDelivery: true, supportsShipping: true, sortOrder: 0, ...product, version: 1, createdAt: db.serverDate(), updatedAt: db.serverDate() }
    await tx.collection('products').add({ data: created })
    await tx.collection('auditLogs').add({ data: audit(actor, 'products.create', 'product', event.productId, {}, created, event) })
    return { productId: event.productId, version: 1 }
  })
}
async function saveProduct(event, actor) { if (!validId(event.productId) || (event.version !== undefined && (!Number.isInteger(event.version) || event.version < 1))) return fail('INVALID_INPUT', '商品参数无效');
const changes = patch(event.product, PRODUCT_FIELDS, 'product');
if (!changes) return fail('INVALID_INPUT', '商品字段无效或为空');
const unavailable = await auditAvailable();
if (unavailable) return unavailable;
return db.runTransaction(async (tx) => { const value = await find('products', 'productId', event.productId, tx);
if (!value) return fail('PRODUCT_NOT_FOUND', '商品不存在');
if (event.version !== undefined && event.version !== (Number(value.version) || 1)) return fail('VERSION_CONFLICT', '商品已被其他操作更新，请刷新后重试');
if (changes.categoryIds) { const categories = await readCategories(tx); const selected = categories.filter((item) => changes.categoryIds.includes(item.categoryId || item._id)); if (selected.length !== changes.categoryIds.length || selected.some((item) => item.enabled === false)) return fail('CATEGORY_UNAVAILABLE', '请选择已启用的商品分类'); changes.category = selected[0].name }
const version = (Number(value.version) || 1) + 1;
await tx.collection('products').doc(value._id).update({ data: { ...changes, version, updatedAt: db.serverDate() } });
await tx.collection('auditLogs').add({ data: audit(actor, 'products.write', 'product', value.productId, patch(value, PRODUCT_FIELDS, 'product') || {}, changes, event) });
return { productId: value.productId, version } }) }
async function saveHomeRecommendations(event, actor) {
  const productIds = event && event.productIds
  if (!Array.isArray(productIds) || productIds.length > 6 || productIds.some((id) => !validId(id)) || new Set(productIds).size !== productIds.length) return fail('INVALID_INPUT', '今日推荐需选择 0 至 6 个不重复商品')
  const unavailable = await auditAvailable(); if (unavailable) return unavailable
  return db.runTransaction(async (tx) => {
    const result = await tx.collection('products').limit(MAX_PAGE_SIZE).get()
    const products = result.data || [], byId = new Map(products.map((item) => [item.productId || item._id, item]))
    if (productIds.some((id) => !byId.has(id))) return fail('PRODUCT_NOT_FOUND', '推荐列表包含不存在的商品')
    const before = products.filter((item) => item.homeRecommended === true).sort((a, b) => (Number(a.homeRecommendOrder) || 0) - (Number(b.homeRecommendOrder) || 0)).map((item) => item.productId || item._id)
    for (const item of products) {
      const id = item.productId || item._id, order = productIds.indexOf(id), recommended = order >= 0
      if (item.homeRecommended === recommended && (Number(item.homeRecommendOrder) || 0) === (recommended ? order + 1 : 0)) continue
      await tx.collection('products').doc(item._id).update({ data: { homeRecommended: recommended, homeRecommendOrder: recommended ? order + 1 : 0, version: (Number(item.version) || 1) + 1, updatedAt: db.serverDate() } })
    }
    await tx.collection('auditLogs').add({ data: audit(actor, 'products.homeRecommendations.write', 'homeRecommendations', 'home', { productIds: before }, { productIds }, event) })
    return { productIds }
  })
}
async function deleteProduct(event, actor) { if (!validId(event.productId)) return fail('INVALID_INPUT', '商品标识无效'); const unavailable = await auditAvailable(); if (unavailable) return unavailable; return db.runTransaction(async (tx) => { const value = await find('products', 'productId', event.productId, tx); if (!value) return fail('PRODUCT_NOT_FOUND', '商品不存在'); await tx.collection('products').doc(value._id).remove(); await tx.collection('auditLogs').add({ data: audit(actor, 'products.delete', 'product', value.productId, patch(value, PRODUCT_FIELDS, 'product') || {}, {}, event) }); return { productId: value.productId, deleted: true } }) }
async function toggleSoldOut(event, actor) { if (!validId(event.productId) || typeof event.soldOut !== 'boolean') return fail('INVALID_INPUT', '商品参数无效'); const unavailable = await auditAvailable(); if (unavailable) return unavailable; return db.runTransaction(async (tx) => { const value = await find('products', 'productId', event.productId, tx); if (!value) return fail('PRODUCT_NOT_FOUND', '商品不存在'); await tx.collection('products').doc(value._id).update({ data: { soldOut: event.soldOut, version: (Number(value.version) || 1) + 1, updatedAt: db.serverDate() } }); await tx.collection('auditLogs').add({ data: audit(actor, 'products.toggleSoldOut', 'product', value.productId, { soldOut: value.soldOut === true }, { soldOut: event.soldOut }, event) }); return { productId: value.productId, soldOut: event.soldOut } }) }
async function listStores(event) { const paging = pageOf(event); if (!paging) return fail('INVALID_INPUT', '分页参数无效'); const result = await db.collection('stores').limit(MAX_PAGE_SIZE).get(); const list = (result.data || []).filter((doc) => matches(doc, event, ['name', 'addressText', 'businessHours'])).map(dtoStore); const page = paginate(list, paging); return { stores: page.items, page: page.page, pageSize: page.pageSize, total: page.total } }
async function getStore(event) { if (!validId(event.storeId)) return fail('INVALID_INPUT', '门店标识无效'); const value = await find('stores', 'storeId', event.storeId); return value ? { store: dtoStore(value) } : fail('STORE_NOT_FOUND', '门店不存在') }
async function createStore(event, actor) {
  if (!validId(event.storeId)) return fail('INVALID_INPUT', '门店标识无效')
  const store = patch(event.store, STORE_FIELDS, 'store')
  if (!store || typeof store.name !== 'string' || !store.name.trim()) return fail('INVALID_INPUT', '请填写门店名称')
  const unavailable = await auditAvailable(); if (unavailable) return unavailable
  return db.runTransaction(async (tx) => {
    const existing = await find('stores', 'storeId', event.storeId, tx)
    if (existing) return fail('STORE_EXISTS', '门店标识已存在')
    const created = { storeId: event.storeId, addressText: '', businessHours: '', enabled: true, status: 'open', distanceText: '', ...store, createdAt: db.serverDate(), updatedAt: db.serverDate() }
    await tx.collection('stores').add({ data: created })
    await tx.collection('auditLogs').add({ data: audit(actor, 'stores.create', 'store', event.storeId, {}, created, event) })
    return { storeId: event.storeId }
  })
}
async function saveStore(event, actor) { if (!validId(event.storeId)) return fail('INVALID_INPUT', '门店标识无效'); const changes = patch(event.store, STORE_FIELDS, 'store'); if (!changes) return fail('INVALID_INPUT', '门店字段无效或为空'); const unavailable = await auditAvailable(); if (unavailable) return unavailable; return db.runTransaction(async (tx) => { const value = await find('stores', 'storeId', event.storeId, tx); if (!value) return fail('STORE_NOT_FOUND', '门店不存在'); await tx.collection('stores').doc(value._id).update({ data: { ...changes, updatedAt: db.serverDate() } }); await tx.collection('auditLogs').add({ data: audit(actor, 'stores.write', 'store', value.storeId, patch(value, STORE_FIELDS, 'store') || {}, changes, event) }); return { storeId: value.storeId } }) }
async function deleteStore(event, actor) { if (!validId(event.storeId)) return fail('INVALID_INPUT', '门店标识无效'); const unavailable = await auditAvailable(); if (unavailable) return unavailable; return db.runTransaction(async (tx) => { const value = await find('stores', 'storeId', event.storeId, tx); if (!value) return fail('STORE_NOT_FOUND', '门店不存在'); await tx.collection('stores').doc(value._id).remove(); await tx.collection('auditLogs').add({ data: audit(actor, 'stores.delete', 'store', value.storeId, patch(value, STORE_FIELDS, 'store') || {}, {}, event) }); return { storeId: value.storeId, deleted: true } }) }
async function toggleStoreOpen(event, actor) { if (!validId(event.storeId) || typeof event.open !== 'boolean') return fail('INVALID_INPUT', '门店参数无效'); const unavailable = await auditAvailable(); if (unavailable) return unavailable; return db.runTransaction(async (tx) => { const value = await find('stores', 'storeId', event.storeId, tx); if (!value) return fail('STORE_NOT_FOUND', '门店不存在'); const status = event.open ? 'open' : 'closed'; await tx.collection('stores').doc(value._id).update({ data: { status, updatedAt: db.serverDate() } }); await tx.collection('auditLogs').add({ data: audit(actor, 'stores.toggleOpen', 'store', value.storeId, { status: value.status }, { status }, event) }); return { storeId: value.storeId, status } }) }
async function listAuditLogs(event) { const paging = pageOf(event); if (!paging) return fail('INVALID_INPUT', '分页参数无效'); if (event.auditAction !== undefined && typeof event.auditAction !== 'string') return fail('INVALID_INPUT', '审计操作筛选无效'); const startAt = auditDate(event.auditStartDate, false); const endAt = auditDate(event.auditEndDate, true); if (startAt === undefined || endAt === undefined || (startAt && endAt && startAt >= endAt)) return fail('INVALID_INPUT', '审计日期范围无效'); const result = await db.collection('auditLogs').orderBy('createdAt', 'desc').limit(MAX_PAGE_SIZE).get(); const list = (result.data || []).filter((doc) => { const createdAt = doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt); return (!startAt || createdAt >= startAt) && (!endAt || createdAt < endAt) && (!event.auditAction || doc.action === event.auditAction) && (!event.actorId || doc.actorId === event.actorId) && (!event.targetType || doc.targetType === event.targetType) && matches(doc, event, ['targetId', 'action', 'actorId']) }).map(dtoAudit); const page = paginate(list, paging); return { auditLogs: page.items, page: page.page, pageSize: page.pageSize, total: page.total } }
const HANDLERS = { listOrders, getDashboardSummary, getOrder, advanceOrder, cancelOrder, retryRefund, listProducts, listProductCategories, createProductCategory, saveProductCategory, deleteProductCategory, getProduct, createProduct, saveProduct, bulkSetProductListing, bulkSetProductSoldOut, saveHomeRecommendations, uploadProductImage, uploadPageContentImage, getPageConfiguration, savePageConfiguration, deleteProduct, toggleSoldOut, listStores, getStore, createStore, saveStore, deleteStore, toggleStoreOpen, listAuditLogs }
exports.main = async (event) => { const action = event && event.action; if (action === 'configurationStatus') return ok({ refundQueueEnabled: process.env.MERCHANT_REFUND_REQUEST_MODE === 'queue' }); const permission = ACTION_PERMISSIONS[action]; if (!permission || !HANDLERS[action]) return fail('INVALID_INPUT', '不支持的商家管理操作'); const actor = merchant(event, permission); if (actor.ok === false) return actor; try { const result = await HANDLERS[action](event || {}, actor); return result && result.ok === false ? result : ok(result) } catch (error) { console.error('merchant-admin failed', action, error && error.message); if (isAuditUnavailable(error)) return fail('AUDIT_LOG_UNAVAILABLE', '审计日志集合尚未创建或不可访问'); if (isRefundServiceUnavailable(error)) return fail('PAYMENT_SERVICE_UNAVAILABLE', '退款请求服务暂时不可用，订单未变更'); return fail('INTERNAL_ERROR', '商家管理服务暂时不可用') } }
module.exports = Object.assign(exports, { FLOWS, ORDER_QUEUES, REQUIRED_DELIVERY_PRODUCT_IDS, ACTION_PERMISSIONS, PAYMENT_STATUSES, REFUND_STATUSES, paymentState, refundState, paymentProjection, nextStatus, queueOfStatus, orderQueueCounts, validOrderFilters, validProductBulkFilters, validProductBulkSoldOutFilters, bulkListingFields, patch, pageOf, auditDate, jpegSize, dtoOrder, dtoProduct, dtoCategory, dtoStore, dtoAudit, verifyToken })
