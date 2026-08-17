const store = require('../../utils/store')
const auth = require('../../utils/auth-service')
const { formatOrderStatus } = require('../../utils/order-status')
Page({
  data: { orderHeadline: '还没有待取的面包', orderHint: '去逛逛今天的新鲜出炉吧', authStatusLabel: '准备中', authMessage: '正在准备登录', canRetryAuth: false },
  onShow() {
    const activeStatuses = ['已下单', '制作中', '待自取', '配送中', '待发货', '运输中']
    const order = store.getOrders().find((item) => activeStatuses.includes(item.orderStatus))
    this.setData(Object.assign(order ? {
      orderHeadline: `${order.sceneLabel || order.scene || (order.purchaseScene === 'pickup' ? '到店自取' : '外卖/邮寄')} · ${formatOrderStatus(order.orderStatus)}`,
      orderHint: '查看订单进度与取货/配送信息'
    } : {
      orderHeadline: '还没有待取的面包',
      orderHint: '去逛逛今天的新鲜出炉吧'
    }, this.authView()))
  },
  authView() { const snapshot = auth.getSnapshot(); return { authStatusLabel: snapshot.status === 'authenticated' ? '已登录' : snapshot.status === 'loggingIn' ? '登录中' : '本地浏览', authMessage: snapshot.message, canRetryAuth: snapshot.canRetry } },
  retryAuth() { if (!this.data.canRetryAuth) return; this.setData({ authStatusLabel: '登录中', authMessage: '正在重试微信登录，请稍候。', canRetryAuth: false }); auth.retryLogin().then(() => this.setData(this.authView())) },
  orders() { wx.switchTab({ url: '/pages/orders/orders' }) },
  addresses() { wx.navigateTo({ url: '/pages/addresses/addresses' }) },
  stores() { wx.navigateTo({ url: '/pages/stores/stores' }) }
})
