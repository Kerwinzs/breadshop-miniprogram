function waitForLogin() {
  let app
  try { app = getApp() } catch (error) { app = null }
  const data = app && app.globalData
  if (!data || !data.cloudAvailable || typeof wx.cloud.callFunction !== 'function') return Promise.reject(new Error('云开发未就绪'))
  const ready = data.cloudReadyPromise || Promise.resolve(data.authStatus === 'authenticated')
  return ready.then((ok) => {
    if (!ok || data.authStatus !== 'authenticated') throw new Error('微信登录未完成')
    return true
  })
}

function call(action, payload) {
  return waitForLogin().then(() => wx.cloud.callFunction({ name: 'catalog', data: Object.assign({ action }, payload || {}) })).then((response) => {
    const result = response && response.result
    if (!result || result.ok !== true) throw new Error((result && result.error && result.error.message) || '云端目录读取失败')
    return result.data
  })
}

function listProducts() { return call('listProducts') }
function getProduct(productId) { return call('getProduct', { productId }) }
function listStores() { return call('listStores') }
function getStore(storeId) { return call('getStore', { storeId }) }

module.exports = { listProducts, getProduct, listStores, getStore }
