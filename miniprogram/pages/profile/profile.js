const store = require('../../utils/store')
const auth = require('../../utils/auth-service')
const { formatOrderStatus } = require('../../utils/order-status')
const pageContent = require('../../utils/page-content')
const catalogRemote = require('../../utils/catalog-remote')
const orderRemote = require('../../utils/order-repository')

const ACTIVE_ORDER_STATUSES = new Set(['已下单', '制作中', '待自取', '配送中', '待发货', '运输中'])

function getActiveOrder() {
  return store.getOrders().find((item) => ACTIVE_ORDER_STATUSES.has(formatOrderStatus(item && item.orderStatus)))
}

Page({
  data: { orderHeadline: '还没有待取的面包', orderHint: '去逛逛今天的新鲜出炉吧', authStatusLabel: '准备中', authMessage: '正在准备登录', canRetryAuth: false, content: pageContent.get('profile') },
  onShow() {
    this.refreshOrderCard()
    const content = this.data.content
    this.setData({ content }, this.authView())
    orderRemote.list().then((result) => {
      store.replaceOrders(result.orders || [])
      this.refreshOrderCard()
    }).catch(() => {})
    catalogRemote.getPageConfiguration('profile').then((remote) => {
      const nextContent = pageContent.get('profile', remote && remote.config)
      const currentOrder = getActiveOrder()
      this.setData({ content: nextContent, ...(currentOrder ? {} : { orderHeadline: nextContent.orderCard.emptyTitle, orderHint: nextContent.orderCard.emptyHint }) })
    }).catch(() => {})
  },
  refreshOrderCard() {
    const order = getActiveOrder()
    const orderCard = (this.data.content && this.data.content.orderCard) || {}
    this.setData(order ? {
      orderHeadline: `${order.sceneLabel || order.scene || (order.purchaseScene === 'pickup' ? '到店自取' : '外卖/邮寄')} · ${formatOrderStatus(order.orderStatus)}`,
      orderHint: '查看订单进度与取货/配送信息'
    } : {
      orderHeadline: orderCard.emptyTitle || '还没有待取的面包',
      orderHint: orderCard.emptyHint || '去逛逛今天的新鲜出炉吧'
    })
  },
  authView() { const snapshot = auth.getSnapshot(); return { authStatusLabel: snapshot.status === 'authenticated' ? '已登录' : snapshot.status === 'loggingIn' ? '登录中' : '本地浏览', authMessage: snapshot.message, canRetryAuth: snapshot.canRetry } },
  retryAuth() { if (!this.data.canRetryAuth) return; this.setData({ authStatusLabel: '登录中', authMessage: '正在重试微信登录，请稍候。', canRetryAuth: false }); auth.retryLogin().then(() => this.setData(this.authView())) },
  orders() { wx.switchTab({ url: '/pages/orders/orders' }) },
  addresses() { wx.navigateTo({ url: '/pages/addresses/addresses' }) },
  stores() { wx.navigateTo({ url: '/pages/stores/stores' }) }
})
