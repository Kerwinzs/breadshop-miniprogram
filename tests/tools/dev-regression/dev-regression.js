const cloud = require('./cloud-service-observed')
const addressRemote = require('../../../miniprogram/utils/address-repository')
const catalogRemote = require('../../../miniprogram/utils/catalog-remote')
const orderRemote = require('../../../miniprogram/utils/order-repository')

const EXPIRY_KEY = 'breadshopRegressionExpiry'
const TRACE_KEY = 'breadshopRegressionTraces'
const EXPIRY_SECONDS = 600
// Any state other than placed must be rejected by cancelOrder. Canceled is a
// real user-side state already available in this environment, so it provides
// a valid negative case without fabricating merchant workflow states.
const NON_PLACED = ['canceled', 'preparing', 'delivering', 'awaiting_shipment', 'in_transit', 'completed']

function nowId(prefix) { return `reg-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }
function itemFor(product, quantity) {
  const spec = (product.specs || []).find((entry) => entry.enabled !== false)
  return spec ? { productId: product.productId || product.id, specId: spec.specId || spec.id, quantity: quantity || 1 } : null
}
function errorCode(error) { return error && error.code ? error.code : 'UNKNOWN_ERROR' }
function errorMessage(error) { return (error && error.message) || '未返回可识别的错误' }

Page({
  data: {
    isDev: false,
    loading: false,
    ready: false,
    contextMessage: '正在读取真实微信账号下的地址、商品和订单…',
    addressLabel: '',
    productLabel: '',
    tests: [
      { key: 'tamper', title: '报价篡改', status: 'idle', message: '修改商品数量后提交，应该被拒绝' },
      { key: 'replay', title: '报价重复使用', status: 'idle', message: '同一报价第二次提交，应该被拒绝' },
      { key: 'idempotency', title: '相同请求幂等', status: 'idle', message: '重复提交同一请求，只应生成一笔订单' },
      { key: 'nonPlaced', title: '非“已下单”取消', status: 'idle', message: '对真实已取消或履约中订单发起取消，应该被拒绝' },
      { key: 'expiry', title: '报价过期', status: 'idle', message: '报价有效期 10 分钟，到期后需手动检查' }
    ],
    expiryRemaining: '',
    runningExpiry: false,
    expiryReady: false,
    traces: [],
    traceText: ''
  },

  onLoad() {
    const isDev = typeof __wxConfig !== 'undefined' && __wxConfig.envVersion !== 'release'
    const traces = isDev ? (wx.getStorageSync(TRACE_KEY) || []) : []
    this.setData({ isDev, traces, traceText: traces.map((item) => JSON.stringify(item)).join('\n') })
    if (!isDev) return
    this.loadContext()
  },

  onShow() {
    if (!this.data.isDev) return
    this.resumeExpiry()
  },

  onHide() { this.clearExpiryTimer() },
  onUnload() { this.clearExpiryTimer() },

  loadContext() {
    this.setData({ contextMessage: '正在读取真实微信账号下的地址、商品和订单…' })
    Promise.all([addressRemote.list(), catalogRemote.listProducts('pickup'), catalogRemote.listStores(), orderRemote.list()]).then((results) => {
      const addresses = results[0].addresses || []
      const products = results[1].products || []
      const stores = results[2].stores || []
      const orders = results[3].orders || []
      const address = addresses.find((item) => item.isDefault) || addresses[0]
      const product = products.find((item) => !item.soldOut && item.supportsLocalDelivery !== false && item.supportsPickup !== false && (item.specs || []).some((spec) => spec.enabled !== false))
      const store = stores.find((item) => item.status !== 'closed')
      this.regressionContext = { address, product, store, orders }
      const ready = !!(address && product && store)
      this.setData({ ready, addressLabel: address ? `${address.contactName || ''} ${address.city || ''}${address.district || ''}${address.detail || ''}` : '没有可用地址', productLabel: product ? `${product.name} · ${(product.specs || [])[0].name || ''}` : '没有可用商品', contextMessage: ready ? '已使用真实微信身份读取测试数据。点击按钮后会产生少量回归报价/订单。' : '缺少可用地址、商品或营业门店，请先补齐基础数据。' })
      this.resumeExpiry()
    }).catch((error) => this.setData({ ready: false, contextMessage: `读取失败：${errorMessage(error)}` }))
  },

  setTest(key, status, message) {
    const tests = this.data.tests.map((item) => item.key === key ? Object.assign({}, item, { status, message }) : item)
    this.setData({ tests })
  },

  async observedCall(functionName, action, payload) {
    try {
      const response = await cloud.callObserved(functionName, action, payload)
      this.recordTrace(response.trace)
      return response.data
    } catch (error) {
      this.recordTrace(error.trace)
      throw error
    }
  },

  recordTrace(trace) {
    if (!trace) return
    const traces = [trace].concat(this.data.traces || []).slice(0, 60)
    wx.setStorageSync(TRACE_KEY, traces)
    this.setData({ traces, traceText: traces.map((item) => JSON.stringify(item)).join('\n') })
  },

  copyTraces() {
    if (!this.data.traceText) return wx.showToast({ title: '暂无回归调用记录', icon: 'none' })
    wx.setClipboardData({ data: this.data.traceText, success: () => wx.showToast({ title: '已复制回归记录' }) })
  },

  async runAll() {
    if (!this.data.ready || this.data.loading) return
    const confirmed = await new Promise((resolve) => wx.showModal({ title: '开始真实回归？', content: '会创建少量测试订单并消耗报价，不会删除已有地址或订单。是否继续？', confirmText: '开始测试', success: (result) => resolve(result.confirm) }))
    if (!confirmed) return
    this.setData({ loading: true })
    try { await this.runTamper(); await this.runReplay(); await this.runIdempotency(); await this.runNonPlaced(); await this.startExpiry() } finally { this.setData({ loading: false }) }
  },

  async runTamper() {
    const ctx = this.regressionContext, item = itemFor(ctx.product, 1), tampered = itemFor(ctx.product, 2)
    this.setTest('tamper', 'running', '正在生成报价并提交篡改数量…')
    try {
      const quote = await this.observedCall('fee', 'quote', { deliveryMethod: 'local', addressId: ctx.address.id || ctx.address.addressId, items: [item] })
      await this.observedCall('order', 'createOrder', { clientRequestId: nowId('tamper'), purchaseScene: 'delivery', deliveryMethod: 'local', addressId: ctx.address.id || ctx.address.addressId, items: [tampered], feeQuoteId: quote.quoteId })
      this.setTest('tamper', 'fail', '服务端意外接受了篡改请求，请停止回归并保留日志。')
    } catch (error) { this.setTest('tamper', errorCode(error) === 'FEE_QUOTE_MISMATCH' ? 'pass' : 'fail', `${errorCode(error)}：${errorMessage(error)}`) }
  },

  async runReplay() {
    const ctx = this.regressionContext, item = itemFor(ctx.product, 1), addressId = ctx.address.id || ctx.address.addressId
    this.setTest('replay', 'running', '正在提交同一报价两次…')
    try {
      const quote = await this.observedCall('fee', 'quote', { deliveryMethod: 'local', addressId, items: [item] })
      const first = await this.observedCall('order', 'createOrder', { clientRequestId: nowId('replay-first'), purchaseScene: 'delivery', deliveryMethod: 'local', addressId, items: [item], feeQuoteId: quote.quoteId })
      try { await this.observedCall('order', 'createOrder', { clientRequestId: nowId('replay-second'), purchaseScene: 'delivery', deliveryMethod: 'local', addressId, items: [item], feeQuoteId: quote.quoteId }); this.setTest('replay', 'fail', `报价重复使用被接受；首笔订单 ${first.order.orderNo || '已创建'}`) } catch (error) { this.setTest('replay', errorCode(error) === 'FEE_QUOTE_USED' ? 'pass' : 'fail', `${errorCode(error)}：${errorMessage(error)}；首笔订单已保留`) }
    } catch (error) { this.setTest('replay', 'fail', `${errorCode(error)}：首笔订单未完成，未能验证重复使用`) }
  },

  async runIdempotency() {
    const ctx = this.regressionContext, item = itemFor(ctx.product, 1), clientRequestId = nowId('idempotent')
    this.setTest('idempotency', 'running', '正在连续提交两次相同请求…')
    try {
      const payload = { clientRequestId, purchaseScene: 'pickup', storeId: ctx.store.storeId || ctx.store.id, items: [item] }
      const first = await this.observedCall('order', 'createOrder', payload), second = await this.observedCall('order', 'createOrder', payload)
      const same = first.order && second.order && first.order.orderNo === second.order.orderNo
      this.setTest('idempotency', same && second.duplicate === true ? 'pass' : 'fail', same ? `两次返回同一订单 ${first.order.orderNo}；第二次 duplicate=true` : `两次请求返回结果不一致；第一次 clientRequestId=${clientRequestId}`)
    } catch (error) { this.setTest('idempotency', 'fail', `${errorCode(error)}：${errorMessage(error)}；本次调用记录已保存，可复制查看 requestId 与原始摘要`) }
  },

  async runNonPlaced() {
    this.setTest('nonPlaced', 'running', '正在查找真实的非“已下单”订单…')
    try {
      const result = await this.observedCall('order', 'listOrders'), order = (result.orders || []).find((item) => NON_PLACED.includes(item.orderStatus))
      if (!order) return this.setTest('nonPlaced', 'blocked', '当前没有已取消、已完成或履约中的真实订单；项目暂无商家状态推进接口，不能伪造状态。')
      try { await this.observedCall('order', 'cancelOrder', { orderNo: order.orderNo }); this.setTest('nonPlaced', 'fail', '服务端意外允许取消非“已下单”订单，请保留日志。') } catch (error) { this.setTest('nonPlaced', errorCode(error) === 'ORDER_CANNOT_CANCEL' ? 'pass' : 'fail', `${errorCode(error)}：${errorMessage(error)}；订单 ${order.orderNo}`) }
    } catch (error) { this.setTest('nonPlaced', 'fail', `${errorCode(error)}：${errorMessage(error)}`) }
  },

  async startExpiry() {
    const ctx = this.regressionContext, item = itemFor(ctx.product, 1), addressId = ctx.address.id || ctx.address.addressId
    this.setTest('expiry', 'running', `正在生成报价；需等待 ${EXPIRY_SECONDS / 60} 分钟后手动检查。`)
    try {
      const quote = await this.observedCall('fee', 'quote', { deliveryMethod: 'local', addressId, items: [item] })
      const record = { quoteId: quote.quoteId, addressId, item, deadline: Date.now() + EXPIRY_SECONDS * 1000 }
      wx.setStorageSync(EXPIRY_KEY, record)
      this.resumeExpiry()
    } catch (error) { this.setTest('expiry', 'fail', `${errorCode(error)}：${errorMessage(error)}`) }
  },

  resumeExpiry() {
    const record = wx.getStorageSync(EXPIRY_KEY)
    if (!record || !record.quoteId || !record.deadline || !this.data.isDev) return
    this.expiryRecord = record
    this.clearExpiryTimer()
    const tick = () => {
      const remaining = Math.max(0, record.deadline - Date.now())
      if (remaining > 0) { this.setData({ runningExpiry: true, expiryReady: false, expiryRemaining: `${Math.ceil(remaining / 1000)} 秒后可检查` }); this.expiryTimer = setTimeout(tick, 1000); return }
      this.setData({ runningExpiry: false, expiryReady: true, expiryRemaining: '报价已到期，点击“检查报价过期”执行请求' }); this.setTest('expiry', 'idle', '报价已到期；只有点击检查按钮才会发送真实下单请求。')
    }
    tick()
  },

  async checkExpiryNow() {
    const record = this.expiryRecord || wx.getStorageSync(EXPIRY_KEY)
    if (!record || !record.quoteId || Date.now() < record.deadline) return wx.showToast({ title: '报价尚未到期', icon: 'none' })
    this.setData({ expiryReady: false, expiryRemaining: '正在检查…' })
    try {
      await this.observedCall('order', 'createOrder', { clientRequestId: nowId('expired'), purchaseScene: 'delivery', deliveryMethod: 'local', addressId: record.addressId, items: [record.item], feeQuoteId: record.quoteId })
      this.setTest('expiry', 'fail', '过期报价被接受，请保留日志。')
    } catch (error) { this.setTest('expiry', errorCode(error) === 'FEE_QUOTE_EXPIRED' ? 'pass' : 'fail', `${errorCode(error)}：${errorMessage(error)}`) }
    wx.removeStorageSync(EXPIRY_KEY); this.expiryRecord = null; this.setData({ runningExpiry: false, expiryReady: false, expiryRemaining: '' })
  },

  clearExpiryTimer() { if (this.expiryTimer) clearTimeout(this.expiryTimer); this.expiryTimer = null },
  refresh() { if (!this.data.loading) this.loadContext() }
})
