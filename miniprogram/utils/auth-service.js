const ENV_ID = 'cloud1-d9gc800bmc6952073'
const MAX_LOGIN_ATTEMPTS = 3

function appData(app) { return app.globalData }
function setStatus(app, patch) { Object.assign(appData(app), patch || {}) }
function safeMessage(error) {
  const message = error && (error.errMsg || error.message)
  return message ? String(message) : '微信登录暂不可用'
}

function attemptLogin(app) {
  const data = appData(app)
  if (data.authAttempts >= MAX_LOGIN_ATTEMPTS) {
    setStatus(app, { authStatus: 'localFallback', authMessage: '登录重试次数已达上限，本次将继续使用本地商品和门店数据浏览。', canRetryAuth: false })
    return Promise.resolve(false)
  }
  setStatus(app, { authStatus: 'loggingIn', authMessage: '正在登录微信账号，请稍候。', canRetryAuth: false, authAttempts: data.authAttempts + 1 })
  return wx.cloud.callFunction({ name: 'auth', data: { action: 'login' } }).then((response) => {
    const result = response && response.result
    if (!result || result.ok !== true || !result.data) throw new Error((result && result.error && result.error.message) || '登录响应无效')
    setStatus(app, { authStatus: 'authenticated', authMessage: '已登录云端账号；商品和门店优先使用云端数据。', authUser: result.data, canRetryAuth: false })
    return true
  }).catch((error) => {
    const attemptsLeft = Math.max(0, MAX_LOGIN_ATTEMPTS - appData(app).authAttempts)
    setStatus(app, {
      authStatus: 'localFallback',
      authMessage: `微信登录失败，当前使用本地商品和门店数据浏览${attemptsLeft ? `，还可重试 ${attemptsLeft} 次。` : '，本次不再自动重试。'}`,
      authError: safeMessage(error),
      canRetryAuth: attemptsLeft > 0
    })
    return false
  })
}

function initAndLogin(app) {
  if (!wx.cloud || typeof wx.cloud.init !== 'function' || typeof wx.cloud.callFunction !== 'function') {
    setStatus(app, { authStatus: 'localFallback', authMessage: '当前运行环境不支持云开发，继续使用本地商品和门店数据浏览。', canRetryAuth: false })
    return Promise.resolve(false)
  }
  try {
    wx.cloud.init({ env: ENV_ID, traceUser: true })
    setStatus(app, { cloudAvailable: true, authStatus: 'loggingIn' })
    return attemptLogin(app)
  } catch (error) {
    setStatus(app, { authStatus: 'localFallback', authMessage: '云开发初始化失败，继续使用本地商品和门店数据浏览。', authError: safeMessage(error), canRetryAuth: false })
    return Promise.resolve(false)
  }
}

function retryLogin() {
  const app = getApp()
  if (!app || !app.globalData.cloudAvailable) return Promise.resolve(false)
  app.globalData.cloudReadyPromise = attemptLogin(app)
  return app.globalData.cloudReadyPromise
}

function getSnapshot() {
  const app = getApp()
  const data = app && app.globalData ? app.globalData : {}
  return { status: data.authStatus || 'idle', message: data.authMessage || '登录状态未知', canRetry: data.canRetryAuth === true, attempts: data.authAttempts || 0, retryLimit: MAX_LOGIN_ATTEMPTS }
}

module.exports = { ENV_ID, MAX_LOGIN_ATTEMPTS, initAndLogin, retryLogin, getSnapshot }
