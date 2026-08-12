const store = require('../../utils/store'), cart = require('../../utils/cart-service')
const { formatFen } = require('../../utils/format')
Page({
  data: { items: [], count: 0, subtotal: '¥0.00', empty: true, store: null, storeMessage: '', unavailableItems: [], unavailableMessage: '' },
  onShow() { this.sync() },
  sync() { const items = store.getCart('pickup'), selected = store.getSelectedStore(), unavailableItems = store.getUnavailableCartItems('pickup'); this.setData({ items: items.map((item) => Object.assign({}, item, { unitPrice: formatFen(item.unitPriceFen), unavailable: unavailableItems.some((current) => current.id === item.id) })), count: cart.count(items), subtotal: formatFen(cart.subtotal(items)), empty: !items.length, store: selected, storeMessage: !selected ? '请选择自取门店' : selected.status !== 'open' ? `当前门店已关闭，营业时间 ${selected.businessHours}` : '', unavailableItems, unavailableMessage: unavailableItems.length ? '有商品已售罄或暂不支持到店自取，请返回商品页调整。' : '' }) },
  change(e) { const item = this.data.items.find((current) => current.id === e.currentTarget.dataset.id); if (!item) return wx.showToast({ title: '商品状态已更新，请重试', icon: 'none' }); cart.setQuantity('pickup', item, Math.max(0, item.quantity + Number(e.currentTarget.dataset.delta))); this.sync() },
  clear() { if (this.data.empty) return; wx.showModal({ title: '清空自取购物车？', content: '只会清空自取商品，外卖/邮寄购物车不受影响。', success: (result) => { if (result.confirm) { store.setCart('pickup', []); this.sync() } } }) },
  checkout() { if (this.data.empty) return wx.showToast({ title: '购物车为空', icon: 'none' }); if (this.data.unavailableItems.length) return wx.showToast({ title: this.data.unavailableMessage, icon: 'none' }); if (!this.data.store) return wx.showToast({ title: '请选择自取门店', icon: 'none' }); if (this.data.store.status !== 'open') return wx.showToast({ title: `门店已关闭，营业时间 ${this.data.store.businessHours}`, icon: 'none' }); wx.navigateTo({ url: '/pages/pickup-checkout/pickup-checkout' }) },
  toProducts() { wx.navigateTo({ url: '/pages/products/products' }) }, toStores() { wx.navigateTo({ url: '/pages/stores/stores' }) }
})
