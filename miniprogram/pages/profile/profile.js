const store = require('../../utils/store')
Page({
  data: { orderHeadline: '还没有待取的面包', orderHint: '去逛逛今天的新鲜出炉吧' },
  onShow() {
    const activeStatuses = ['已下单', '制作中', '待自取', '配送中', '待发货', '运输中']
    const order = store.getOrders().find((item) => activeStatuses.includes(item.orderStatus))
    this.setData(order ? {
      orderHeadline: `${order.sceneLabel || order.scene || (order.purchaseScene === 'pickup' ? '到店自取' : '外卖/邮寄')} · ${order.orderStatus}`,
      orderHint: '查看订单进度与取货/配送信息'
    } : {
      orderHeadline: '还没有待取的面包',
      orderHint: '去逛逛今天的新鲜出炉吧'
    })
  },
  orders() { wx.switchTab({ url: '/pages/orders/orders' }) },
  addresses() { wx.navigateTo({ url: '/pages/addresses/addresses' }) },
  stores() { wx.navigateTo({ url: '/pages/stores/stores' }) }
})
