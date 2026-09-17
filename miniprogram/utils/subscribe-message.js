// 模板 ID 由微信公众平台提供；未配置时不打断下单流程。
const TAKEOUT_TEMPLATE_ID = 'EW6MUqeJSj81vkRSNJgxBLAk-wAwEBt3b4CXg0GNM9M'
function requestOrderStatusSubscription() {
  if (!TAKEOUT_TEMPLATE_ID || typeof wx.requestSubscribeMessage !== 'function') return Promise.resolve({})
  return new Promise((resolve) => wx.requestSubscribeMessage({ tmplIds: [TAKEOUT_TEMPLATE_ID], success: resolve, fail: () => resolve({}) }))
}
module.exports = { TAKEOUT_TEMPLATE_ID, requestOrderStatusSubscription }
