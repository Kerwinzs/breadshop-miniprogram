const store = require('../../utils/store')
const { formatFen } = require('../../utils/format')
function isDev() { return typeof __wxConfig !== 'undefined' && __wxConfig.envVersion !== 'release' }
Page({
  data: { order: null, canCancel: false, canReorder: false, canAdvance: false, isDev: false },
  onLoad(q) { this.id = q.id },
  onShow() { const raw = store.getOrder(this.id); const order = raw && Object.assign({}, raw, { total: formatFen(raw.totalFen), items: (raw.items || []).map((item) => Object.assign({}, item, { lineTotal: formatFen(item.lineTotalFen) })) }); this.setData({ order, canCancel: !!order && order.orderStatus === '已下单', canReorder: !!order && order.orderStatus === '已完成', canAdvance: !!order && ['已下单', '制作中', '待自取'].includes(order.orderStatus), isDev: isDev() }) },
  cancel() { wx.showModal({ title: '取消订单', content: '确认取消该订单？取消后不涉及退款或资金操作。', success: (r) => { if (r.confirm) { store.cancelOrder(this.id); this.onShow(); wx.showToast({ title: '订单已取消' }) } } }) },
  advance() { const next = store.advanceMockOrder(this.id); if (!next) return wx.showToast({ title: '当前订单不能继续推进', icon: 'none' }); this.onShow(); wx.showToast({ title: `已更新为${next.orderStatus}` }) },
  reorder() { const result = store.reorder(this.id); if (!result.added) return wx.showToast({ title: result.unavailable.length ? '商品已下架，未加入购物车' : '无法再来一单', icon: 'none' }); if (result.unavailable.length) wx.showToast({ title: `已加入可售商品，${result.unavailable.length} 件未加入`, icon: 'none' }); wx.navigateTo({ url: '/pages/cart/cart' }) }, back() { wx.navigateBack() }
})
