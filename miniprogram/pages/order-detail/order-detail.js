const store = require('../../utils/store'), remote = require('../../utils/order-repository')
const { formatFen } = require('../../utils/format')
const { formatOrderStatus } = require('../../utils/order-status')
function isDev() { return typeof __wxConfig !== 'undefined' && __wxConfig.envVersion !== 'release' }
function normalize(raw) { if (!raw) return null; const snapshot = raw.storeSnapshot || raw.store; const store = snapshot && Object.assign({}, snapshot, { address: snapshot.address || snapshot.addressText }); const order = Object.assign({}, raw, { id: raw.orderNo || raw.id, orderStatus: formatOrderStatus(raw.orderStatus), total: formatFen(raw.totalFen), store, items: (raw.items || []).map((item) => Object.assign({}, item, { name: item.productName || item.name, lineTotal: formatFen(item.lineTotalFen) })) }); return order }
Page({
  data: { order: null, canCancel: false, canReorder: false, canAdvance: false, isDev: false },
  onLoad(q) { this.id = q.id },
  onShow() { const local = normalize(store.getOrder(this.id)); this.setData({ order: local, canCancel: !!local && local.orderStatus === '已下单', canReorder: !!local && local.orderStatus === '已完成', canAdvance: false, isDev: isDev() }); remote.get(this.id).then((result) => { const order = normalize(result.order); store.updateOrder(this.id, result.order); this.setData({ order, canCancel: order.orderStatus === '已下单', canReorder: order.orderStatus === '已完成' }) }).catch(() => {}) },
  cancel() { wx.showModal({ title: '取消订单', content: '确认取消该订单？取消后不涉及退款或资金操作。', success: (r) => { if (r.confirm) remote.cancel(this.id).then(() => { this.onShow(); wx.showToast({ title: '订单已取消' }) }).catch((error) => wx.showToast({ title: error.message || '取消失败', icon: 'none' })) } }) },
  reorder() { const result = store.reorder(this.id); if (!result.added) return wx.showToast({ title: result.unavailable.length ? '商品已下架，未加入购物车' : '无法再来一单', icon: 'none' }); wx.navigateTo({ url: '/pages/cart/cart' }) },
  back() { wx.navigateBack() }
})
