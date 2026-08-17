const store = require('../../utils/store')
const orderRemote = require('../../utils/order-repository')
const { formatFen } = require('../../utils/format')
function cartTotalFen(value) { const number = Number(String(value || '').replace(/[¥,]/g, '')); return Number.isFinite(number) ? Math.round(number * 100) : null }
function view(order) { return Object.assign({}, order, { id: order.orderNo || order.id, scene: order.sceneLabel || (order.purchaseScene === 'pickup' ? '到店自取' : order.deliveryMethod === 'shipping' ? '快递邮寄' : '同城外卖'), itemsText: (order.items || []).map((item) => `${item.productName || item.name}${item.specName ? '·' + item.specName : ''} × ${item.quantity}`).join('、'), total: formatFen(order.totalFen !== undefined ? order.totalFen : cartTotalFen(order.total)), pickupInfo: order.storeSnapshot ? `${order.storeSnapshot.name}自取` : order.addressSnapshot ? order.addressSnapshot.fullAddress : '配送订单' }) }
Page({
  data: { orders: [], filter: 'all' },
  onShow() { this.refresh() },
  refresh() { const local = store.getOrders(); this.setData({ orders: (this.data.filter === 'all' ? local : local.filter((order) => order.purchaseScene === this.data.filter)).map(view) }); orderRemote.list().then((result) => { const orders = result.orders || []; store.replaceOrders(orders); this.setData({ orders: (this.data.filter === 'all' ? orders : orders.filter((order) => order.purchaseScene === this.data.filter)).map(view) }) }).catch(() => {}) },
  filter(e) { this.setData({ filter: e.currentTarget.dataset.filter }); this.refresh() },
  detail(e) { const id = e.currentTarget.dataset.id; const order = store.getOrder(id) || this.data.orders.find((item) => item.id === id); wx.navigateTo({ url: (order && order.purchaseScene === 'delivery' ? '/pages/delivery-order-detail/delivery-order-detail?id=' : '/pages/order-detail/order-detail?id=') + id }) }
})
