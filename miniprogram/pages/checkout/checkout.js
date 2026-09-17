const store = require('../../utils/store')
const cart = require('../../utils/cart-service')
const feeService = require('../../utils/fee-service')
const feeRemote = require('../../utils/fee-repository')
const orderRemote = require('../../utils/order-repository')
const productRepository = require('../../utils/product-repository')
const payment = require('../../utils/payment-service')
const checkoutIntent = require('../../utils/checkout-intent')
const subscribeMessage = require('../../utils/subscribe-message')
const { hasRegularDeliveryItem } = require('../../utils/shipping-required-items')
function canonicalItems(items) { return (Array.isArray(items) ? items : []).map((item) => ({ productId: item.productId, specId: item.specId, quantity: Number(item.quantity) })).sort((left, right) => `${left.productId}\u0000${left.specId}`.localeCompare(`${right.productId}\u0000${right.specId}`)) }
function sameItems(left, right) { return JSON.stringify(canonicalItems(left)) === JSON.stringify(canonicalItems(right)) }
Page({
  data: { items: [], method: 'local', address: null, subtotal: '¥0.00', insulation: '¥2.00', transport: '', transportLabel: '配送费', total: '', status: 'missingAddress', message: '', unavailableItems: [], unavailableMessage: '', hasRegularItems: false, submitting: false, feeQuote: null },
  onShow() { const method = store.getState().deliveryMethod || 'local'; productRepository.list('delivery', method).then((result) => { store.setDeliveryMethod(method, result.items || []); this.sync() }).catch(() => this.sync()) },
  sync() {
    const state = store.getState(), items = store.getCart('delivery'), address = store.getSelectedAddress(), method = state.deliveryMethod || 'local', localFee = feeService.calculateDeliveryFees({ deliveryMethod: method, address, items }), sub = cart.subtotal(items), unavailableItems = store.getUnavailableCartItems('delivery'), requestNumber = (this.quoteRequestNumber || 0) + 1
    this.quoteRequestNumber = requestNumber
    this.setData({ items: items.map((item) => Object.assign({}, item, { unitPrice: cart.money(item.unitPriceFen), lineTotal: cart.money(item.unitPriceFen * item.quantity), unavailable: unavailableItems.some((current) => current.id === item.id) })), method: state.deliveryMethod, address, subtotal: cart.money(sub), insulation: cart.money(localFee.insulationFeeFen), transport: method === 'shipping' ? '快递到付' : (localFee.transportFeeFen === null ? localFee.message : cart.money(localFee.transportFeeFen)), transportLabel: localFee.transportLabel, total: localFee.status === 'ready' ? cart.money(sub + localFee.insulationFeeFen + localFee.transportFeeFen) : localFee.message, status: address && !unavailableItems.length && items.length ? 'loading' : localFee.status, message: address ? '' : '请先选择收货地址', unavailableItems, unavailableMessage: unavailableItems.length ? '有商品已售罄或暂不支持当前配送方式，请返回购物车调整。' : '', hasRegularItems: hasRegularDeliveryItem(items), feeQuote: null })
    if (!address || unavailableItems.length || !items.length) return
    const quoteItems = items.map((item) => ({ productId: item.productId, specId: item.specId, quantity: item.quantity }))
    feeRemote.quote({ deliveryMethod: method, addressId: address.id || address.addressId, items: quoteItems }).then((quote) => {
      if (requestNumber !== this.quoteRequestNumber) return
      const latestState = store.getState(), latestItems = store.getCart('delivery'), latestAddress = store.getSelectedAddress(), latestMethod = latestState.deliveryMethod || 'local'
      const unchanged = latestMethod === method && (latestAddress && (latestAddress.id || latestAddress.addressId)) === (address.id || address.addressId) && sameItems(latestItems, quoteItems)
      if (!unchanged) return this.sync()
      this.setData({ insulation: cart.money(0), transport: method === 'shipping' ? '快递到付' : '配送费到付', transportLabel: method === 'shipping' ? '快递到付' : '配送费到付', total: cart.money(quote.totalFen), status: quote.status, message: quote.message || '', feeQuote: quote })
    }).catch((error) => {
      if (requestNumber !== this.quoteRequestNumber) return
      this.setData({ status: 'feeUnavailable', message: `${error.code ? `[${error.code}] ` : ''}${error.message || '费用暂时无法计算'}`, total: error.message || '暂无法计算' })
    })
  },
  method(e) { const method = e.currentTarget.dataset.method; productRepository.list('delivery', method).then((result) => { store.setDeliveryMethod(method, result.items || []); this.sync() }).catch(() => { store.setDeliveryMethod(method, []); this.sync() }) },
  submit() {
    if (this.data.submitting) return
    if (!this.data.items.length) return wx.showToast({ title: '购物车为空', icon: 'none' })
    if (!this.data.hasRegularItems) return wx.showToast({ title: '请至少选择一件普通商品', icon: 'none' })
    if (this.data.unavailableItems.length) return wx.showToast({ title: this.data.unavailableMessage, icon: 'none' })
    const currentItems = store.getCart('delivery').map((item) => ({ productId: item.productId, specId: item.specId, quantity: item.quantity }))
    const quotedItems = (this.data.feeQuote && this.data.feeQuote.items || []).map((item) => ({ productId: item.productId, specId: item.specId, quantity: item.quantity }))
    if (this.data.status !== 'ready' || !this.data.feeQuote || !this.data.feeQuote.quoteId || this.data.feeQuote.deliveryMethod !== this.data.method || !sameItems(currentItems, quotedItems)) {
      this.sync()
      return wx.showToast({ title: '费用已更新，请稍候再点确认下单', icon: 'none' })
    }
    wx.showModal({ title: '确认提交并支付？', content: '仅在线支付商品小计，配送费或快递运费到付。订单保留15分钟。', success: (result) => { if (!result.confirm) return; this.setData({ submitting: true }); subscribeMessage.requestOrderStatusSubscription(); orderRemote.create({ clientRequestId: checkoutIntent.ensure(this), purchaseScene: 'delivery', deliveryMethod: this.data.method, addressId: this.data.address.id || this.data.address.addressId, items: currentItems, feeQuoteId: this.data.feeQuote.quoteId }).then((response) => { const orderNo = response.order.orderNo; return payment.payAndConfirm(orderNo).then((outcome) => { if (outcome.status === 'paid') { store.setCart('delivery', []); checkoutIntent.complete(this); return wx.redirectTo({ url: `/pages/order-success/order-success?id=${orderNo}` }) } this.setData({ submitting: false }); const failed = outcome.status === 'failed', title = outcome.status === 'unavailable' ? '支付暂未开放' : outcome.status === 'canceled' ? '已取消支付' : failed ? '创建支付失败' : '支付结果待确认', content = failed ? `[${outcome.diagnostic.code}] ${outcome.diagnostic.message}` : '订单已生成，配送购物车已保留。可在订单详情中查询状态或重新支付。'; wx.showModal({ title, content, showCancel: false, success: () => wx.redirectTo({ url: `/pages/delivery-order-detail/delivery-order-detail?id=${orderNo}` }) }) }) }).catch((error) => { this.setData({ submitting: false }); const retryable = ['FEE_QUOTE_EXPIRED', 'FEE_QUOTE_USED', 'FEE_QUOTE_MISMATCH', 'FEE_QUOTE_NOT_FOUND'].includes(error.code); if (retryable) { this.sync(); wx.showToast({ title: '费用已变化，已重新计算，请再次确认', icon: 'none' }) } else wx.showModal({ title: '下单失败', content: `${error.code ? `[${error.code}] ` : ''}${error.message || '请稍后重试'}`, showCancel: false }) }) } })
  },
  addressPage() { wx.navigateTo({ url: '/pages/addresses/addresses' }) }
})
