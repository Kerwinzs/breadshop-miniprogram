const store = require('../../utils/store')
const cart = require('../../utils/cart-service')
const feeService = require('../../utils/fee-service')
const feeRemote = require('../../utils/fee-repository')
const orderRemote = require('../../utils/order-repository')
function requestId() { return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
Page({
  data: { items: [], method: 'local', address: null, subtotal: '¥0.00', insulation: '¥2.00', transport: '', transportLabel: '配送费', total: '', status: 'missingAddress', message: '', unavailableItems: [], unavailableMessage: '', submitting: false, feeQuote: null },
  onShow() { this.sync() },
  sync() {
    const state = store.getState(), items = store.getCart('delivery'), address = store.getSelectedAddress(), localFee = feeService.calculateDeliveryFees({ deliveryMethod: state.deliveryMethod, address, items }), sub = cart.subtotal(items), unavailableItems = store.getUnavailableCartItems('delivery')
    this.setData({ items: items.map((item) => Object.assign({}, item, { unitPrice: cart.money(item.unitPriceFen), lineTotal: cart.money(item.unitPriceFen * item.quantity), unavailable: unavailableItems.some((current) => current.id === item.id) })), method: state.deliveryMethod, address, subtotal: cart.money(sub), insulation: cart.money(localFee.insulationFeeFen), transport: localFee.transportFeeFen === null ? localFee.message : cart.money(localFee.transportFeeFen), transportLabel: localFee.transportLabel, total: localFee.status === 'ready' ? cart.money(sub + localFee.insulationFeeFen + localFee.transportFeeFen) : localFee.message, status: address && !unavailableItems.length && items.length ? 'loading' : localFee.status, message: address ? '' : '请先选择收货地址', unavailableItems, unavailableMessage: unavailableItems.length ? '有商品已售罄或暂不支持当前配送方式，请返回购物车调整。' : '', feeQuote: null })
    if (!address || unavailableItems.length || !items.length) return
    feeRemote.quote({ deliveryMethod: state.deliveryMethod, addressId: address.id || address.addressId, items: items.map((item) => ({ productId: item.productId, specId: item.specId, quantity: item.quantity })) }).then((quote) => this.setData({ insulation: cart.money(quote.insulationFeeFen), transport: cart.money(quote.transportFeeFen), transportLabel: state.deliveryMethod === 'shipping' ? '邮费' : '配送费', total: cart.money(quote.totalFen), status: quote.status, message: quote.message || '', feeQuote: quote })).catch((error) => this.setData({ status: 'feeUnavailable', message: error.message || '费用暂时无法计算', total: error.message || '暂无法计算' }))
  },
  method(e) { store.patchState({ deliveryMethod: e.currentTarget.dataset.method }); this.sync() },
  submit() {
    if (this.data.submitting) return
    if (!this.data.items.length) return wx.showToast({ title: '购物车为空', icon: 'none' })
    if (this.data.unavailableItems.length) return wx.showToast({ title: this.data.unavailableMessage, icon: 'none' })
    if (this.data.status !== 'ready' || !this.data.feeQuote) return wx.showToast({ title: this.data.message || '费用报价已失效，请重新计算', icon: 'none' })
    wx.showModal({ title: '确认提交订单？', content: '本次仅生成订单，不涉及支付。', success: (result) => { if (!result.confirm) return; this.setData({ submitting: true }); const state = store.getState(); orderRemote.create({ clientRequestId: requestId(), purchaseScene: 'delivery', deliveryMethod: this.data.method, addressId: this.data.address.id || this.data.address.addressId, items: this.data.items.map((item) => ({ productId: item.productId, specId: item.specId, quantity: item.quantity })), feeQuote: this.data.feeQuote }).then((response) => { store.setCart('delivery', []); wx.redirectTo({ url: `/pages/order-success/order-success?id=${response.order.orderNo}` }) }).catch((error) => { this.setData({ submitting: false }); wx.showToast({ title: error.message || '下单失败，请重试', icon: 'none' }) }) } })
  },
  addressPage() { wx.navigateTo({ url: '/pages/addresses/addresses' }) }
})
