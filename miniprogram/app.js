const store = require('./utils/store')
const auth = require('./utils/auth-service')

App({
  globalData: {
    mock: true,
    cloudEnvId: auth.ENV_ID,
    cloudAvailable: false,
    authStatus: 'idle',
    authMessage: '正在准备登录',
    authUser: null,
    authAttempts: 0,
    authRetryLimit: auth.MAX_LOGIN_ATTEMPTS,
    cloudReadyPromise: null
  },
  onLaunch() {
    const existing = wx.getStorageSync(store.STORAGE_KEY)
    if (!existing) {
      wx.setStorageSync(store.STORAGE_KEY, store.createInitialState())
    } else {
      // 只补齐缺失字段，保留已有购物车、订单和用户选择。
      store.ensureStateShape(existing)
    }
    // 登录是非阻断的：商品、门店和本地购物车不依赖登录成功。
    this.globalData.cloudReadyPromise = auth.initAndLogin(this)
  }
})
