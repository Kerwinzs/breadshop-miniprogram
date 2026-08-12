const store = require('../../utils/store')
const { formatFen } = require('../../utils/format')
function cartTotalFen(value) { const number = Number(String(value || '').replace(/[¥,]/g, '')); return Number.isFinite(number) ? Math.round(number * 100) : null }
Page({
  data: { orders: [], filter: 'all' },
  onShow() { this.refresh() },
  refresh() { const orders = store.getOrders().map((order) => Object.assign({}, order, { scene: order.sceneLabel || order.scene || (order.purchaseScene === 'pickup' ? '到店自取' : '配送订单'), itemsText: (order.items || []).map((item) => `${item.name}${item.specName ? '·' + item.specName : ''} × ${item.quantity}`).join('、'), total: formatFen(order.totalFen !== undefined ? order.totalFen : cartTotalFen(order.total)), pickupInfo: order.store ? `${order.store.name}自取` : '到店自取' })); this.setData({ orders: this.data.filter === 'all' ? orders : orders.filter((order) => order.purchaseScene === this.data.filter) }) },
  filter(e) { this.setData({ filter: e.currentTarget.dataset.filter }); this.refresh() },
  detail(e) { const order = store.getOrder(e.currentTarget.dataset.id); wx.navigateTo({ url: (order && order.purchaseScene === 'delivery' ? '/pages/delivery-order-detail/delivery-order-detail?id=' : '/pages/order-detail/order-detail?id=') + e.currentTarget.dataset.id }) }
})
