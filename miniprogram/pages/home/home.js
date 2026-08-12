const mock = require('../../utils/mock'), store = require('../../utils/store')
const { formatFen } = require('../../utils/format')
Page({
  data: { products: [], store: null },
  onShow() { this.setData({ products: mock.products.slice(0, 4).map((item) => Object.assign({}, item, { priceText: formatFen(item.priceFen) })), store: store.getSelectedStore() }) },
  go(e) { wx.navigateTo({ url: e.currentTarget.dataset.url }) }, toStores() { wx.navigateTo({ url: '/pages/stores/stores' }) },
  chooseScene(e) { const id = e.currentTarget.dataset.id; wx.showActionSheet({ itemList: ['到店自取', '外卖/邮寄'], success: (result) => wx.navigateTo({ url: result.tapIndex === 0 ? `/pages/product-detail/product-detail?id=${id}` : `/pages/delivery-product-detail/delivery-product-detail?id=${id}` }) }) }
})
