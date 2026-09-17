const productRepository = require('../../utils/product-repository')
const store = require('../../utils/store')
const cart = require('../../utils/cart-service')
const { formatFen } = require('../../utils/format')
function quickItem(product) { const spec = product.specs[0]; return { id: `${product.id}:${spec.id}`, productId: product.id, specId: spec.id, name: product.name, specName: spec.name, unitPriceFen: product.priceFen + spec.extraFeeFen, artClass: product.artClass } }
Page({
  data: { products: [], categories: ['全部', '吐司', '欧包', '甜点', '饮品'], activeCategory: '全部', cartCount: 0, cartSubtotal: '¥0.00', store: null },
  onShow() { productRepository.list('pickup').then((result) => { this.catalogProducts = result.items || []; this.setData({ categories: ['全部', ...(result.categories || [])] }); this.sync() }).catch(() => this.sync()) },
  sync() { const items = store.getCart('pickup'), products = this.catalogProducts || [], source = this.data.activeCategory === '全部' ? products : products.filter((item) => (item.categoryNames || [item.category]).includes(this.data.activeCategory)); this.setData({ products: source.map((product) => { const item = quickItem(product), current = items.find((entry) => entry.id === item.id), unavailable = product.soldOut || product.supportsPickup === false; return Object.assign({}, product, { priceText: formatFen(product.priceFen), quantity: current ? current.quantity : 0, unavailable }) }), cartCount: cart.count(items), cartSubtotal: formatFen(cart.subtotal(items)), store: store.getSelectedStore() }) },
  selectCategory(e) { this.setData({ activeCategory: e.currentTarget.dataset.category }, () => this.sync()) },
  change(e, delta) { const product = (this.catalogProducts || []).find((item) => item.id === e.currentTarget.dataset.id); if (!product || product.soldOut || product.supportsPickup === false) return wx.showToast({ title: product && product.soldOut ? '该商品已售罄' : '该商品暂不支持到店自取', icon: 'none' }); const item = quickItem(product), existing = store.getCart('pickup').find((entry) => entry.id === item.id); cart.setQuantity('pickup', item, Math.max(0, (existing ? existing.quantity : 0) + delta)); this.sync() },
  increase(e) { this.change(e, 1) }, decrease(e) { this.change(e, -1) }, stop() {},
  goDetail(e) { wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${e.currentTarget.dataset.id}` }) }, toDelivery() { wx.navigateTo({ url: '/pages/delivery-products/delivery-products' }) }, toStores() { wx.navigateTo({ url: '/pages/stores/stores' }) }, toCart() { wx.navigateTo({ url: '/pages/cart/cart' }) }
})
