const store = require('./utils/store')

App({
  globalData: { mock: true },
  onLaunch() {
    const existing = wx.getStorageSync(store.STORAGE_KEY)
    if (!existing) {
      wx.setStorageSync(store.STORAGE_KEY, store.createInitialState())
    } else {
      // 只补齐缺失字段，保留已有购物车、订单和用户选择。
      store.ensureStateShape(existing)
    }
  }
})
