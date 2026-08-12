const mock = require('../../utils/mock')
const store = require('../../utils/store')
const cart = require('../../utils/cart-service')
const { formatFen } = require('../../utils/format')
function quickItem(product) { const spec = product.specs[0]; return { id: `${product.id}:${spec.id}`, productId: product.id, specId: spec.id, name: product.name, specName: spec.name, unitPriceFen: product.priceFen + spec.extraFeeFen, artClass: product.artClass } }
Page({
  data: { products: [], categories: ['全部', '吐司', '欧包', '甜点', '饮品'], activeCategory: '全部', cartCount: 0, cartSubtotal: '¥0.00', store: null },
  onShow() { this.sync() },
  sync() { const items = store.getCart('pickup'), source = this.data.activeCategory === '全部' ? mock.products : mock.products.filter((item) => item.category === this.data.activeCategory); this.setData({ products: source.map((product) => { const item = quickItem(product), current = items.find((entry) => entry.id === item.id); return Object.assign({}, product, { priceText: formatFen(product.priceFen), quantity: current ? current.quantity : 0 }) }), cartCount: cart.count(items), cartSubtotal: formatFen(cart.subtotal(items)), store: store.getSelectedStore() }) },
  selectCategory(e) { this.setData({ activeCategory: e.currentTarget.dataset.category }, () => this.sync()) },
  change(e, delta) { const product = mock.products.find((item) => item.id === e.currentTarget.dataset.id); if (!product || product.soldOut) return; const item = quickItem(product), existing = store.getCart('pickup').find((entry) => entry.id === item.id); cart.setQuantity('pickup', item, Math.max(0, (existing ? existing.quantity : 0) + delta)); this.sync() },
  increase(e) { this.change(e, 1) }, decrease(e) { this.change(e, -1) }, stop() {},
  goDetail(e) { wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${e.currentTarget.dataset.id}` }) }, toDelivery() { wx.navigateTo({ url: '/pages/delivery-products/delivery-products' }) }, toStores() { wx.navigateTo({ url: '/pages/stores/stores' }) }, toCart() { wx.navigateTo({ url: '/pages/cart/cart' }) }
})
