function waitForLogin() {
  let app
  try { app = getApp() } catch (error) { app = null }
  const data = app && app.globalData
  if (!data || !data.cloudAvailable || typeof wx.cloud.callFunction !== 'function') return Promise.reject(new Error('云开发未就绪'))
  const ready = data.cloudReadyPromise || Promise.resolve(data.authStatus === 'authenticated')
  return ready.then((ok) => { if (!ok || data.authStatus !== 'authenticated') throw new Error('微信登录未完成'); return true })
}
function call(name, action, payload) {
  return waitForLogin().then(() => wx.cloud.callFunction({ name, data: Object.assign({ action }, payload || {}) })).then((response) => {
    const result = response && response.result
    if (!result || result.ok !== true) { const error = new Error((result && result.error && result.error.message) || '云端服务暂时不可用'); error.code = result && result.error && result.error.code; throw error }
    return result.data
  })
}
module.exports = { waitForLogin, call }
