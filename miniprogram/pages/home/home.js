const store = require('../../utils/store'), productRepository = require('../../utils/product-repository'), storeRepository = require('../../utils/store-repository')
const { formatFen } = require('../../utils/format')
Page({
  data: { products: [], store: null },
  onShow() { Promise.all([productRepository.list(), storeRepository.list()]).then((results) => { const products = results[0].items || []; this.setData({ products: products.slice(0, 4).map((item) => Object.assign({}, item, { priceText: formatFen(item.priceFen) })), store: store.getSelectedStore() }) }).catch(() => { this.setData({ store: store.getSelectedStore() }) }) },
  go(e) { wx.navigateTo({ url: e.currentTarget.dataset.url }) }, toStores() { wx.navigateTo({ url: '/pages/stores/stores' }) },
  chooseScene(e) { const id = e.currentTarget.dataset.id; wx.showActionSheet({ itemList: ['到店自取', '外卖/邮寄'], success: (result) => wx.navigateTo({ url: result.tapIndex === 0 ? `/pages/product-detail/product-detail?id=${id}` : `/pages/delivery-product-detail/delivery-product-detail?id=${id}` }) }) }
})
