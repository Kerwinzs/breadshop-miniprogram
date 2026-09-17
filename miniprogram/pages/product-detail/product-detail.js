const productRepository = require('../../utils/product-repository'), cart = require('../../utils/cart-service'), store = require('../../utils/store')
const { formatFen } = require('../../utils/format')
Page({
  data: { product: {}, price: '¥0.00', deliveryPrice: '¥0.00', specs: [], selectedSpec: null, selectedSpecName: '', imageIndex: 0, quantity: 1, cartCount: 0 },
  onLoad(query) { this.productId = query.id; productRepository.get(query.id, 'pickup').then((product) => { if (!product) throw new Error('商品不存在'); this.setData({ product, specs: product.specs || [], price: formatFen(product.priceFen), deliveryPrice: formatFen(product.deliveryPriceFen) }) }).catch(() => wx.showToast({ title: '商品当前未在自取场景上架', icon: 'none' })) },
  onShow() { this.setData({ cartCount: cart.count(store.getCart('pickup')) }) },
  changeImage(e) { this.setData({ imageIndex: e.detail.current }) },
  previewImage(e) { const urls = this.data.product.imageUrls || []; if (!urls.length) return; const current = urls[e.currentTarget.dataset.index] || urls[this.data.imageIndex] || urls[0]; wx.previewImage({ current, urls }) },
  selectSpec(e) { const selectedSpec = this.data.specs[e.currentTarget.dataset.index]; this.setData({ selectedSpec, selectedSpecName: selectedSpec.name, price: formatFen(this.data.product.priceFen + selectedSpec.extraFeeFen) }) },
  increase() { this.setData({ quantity: this.data.quantity + 1 }) }, decrease() { this.setData({ quantity: Math.max(1, this.data.quantity - 1) }) },
  add() { const product = this.data.product, spec = this.data.selectedSpec; if (!product) return wx.showToast({ title: '商品尚未加载', icon: 'none' }); if (product.soldOut) return wx.showToast({ title: '该商品已售罄', icon: 'none' }); if (product.supportsPickup === false) return wx.showToast({ title: '该商品暂不支持到店自取', icon: 'none' }); if (!spec) return wx.showToast({ title: '请先选择规格', icon: 'none' }); const item = { id: `${product.id}:${spec.id}`, productId: product.id, specId: spec.id, name: product.name, specName: spec.name, unitPriceFen: product.priceFen + spec.extraFeeFen, artClass: product.artClass }; cart.addItem('pickup', item, this.data.quantity); this.setData({ cartCount: cart.count(store.getCart('pickup')) }); wx.showToast({ title: '已加入自取购物车' }) },
  cart() { wx.navigateTo({ url: '/pages/cart/cart' }) }
})
