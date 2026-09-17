const cloud = require('wx-server-sdk')
const https = require('https')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const TEMPLATE_ID = 'EW6MUqeJSj81vkRSNJgxBLAk-wAwEBt3b4CXg0GNM9M'
const TARGET_STATUSES = new Set(['ready_for_pickup', 'delivering', 'in_transit'])

function text(value, fallback = '-') { return String(value || fallback).slice(0, 20) }
let tokenCache = { value: '', expiresAt: 0, loading: null }
function requestJson(url, body) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method: 'POST', headers: { 'content-type': 'application/json' } }, (response) => {
      let raw = ''; response.setEncoding('utf8'); response.on('data', (chunk) => { raw += chunk }); response.on('end', () => { try { resolve(JSON.parse(raw)) } catch (error) { reject(error) } })
    })
    request.on('error', reject); request.end(body ? JSON.stringify(body) : undefined)
  })
}
async function accessToken() {
  const now = Date.now(); if (tokenCache.value && tokenCache.expiresAt > now + 300000) return tokenCache.value
  if (tokenCache.loading) return tokenCache.loading
  const appid = String(process.env.WECHAT_MINIPROGRAM_APPID || ''), secret = String(process.env.WECHAT_MINIPROGRAM_APPSECRET || '')
  if (!appid || !secret) throw new Error('微信小程序服务端凭证未配置')
  tokenCache.loading = requestJson(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`)
    .then((result) => { if (!result.access_token) throw new Error(`微信 access_token 获取失败: ${result.errcode || 'unknown'}`); tokenCache = { value: result.access_token, expiresAt: now + Number(result.expires_in || 7200) * 1000, loading: null }; return tokenCache.value })
    .finally(() => { tokenCache.loading = null })
  return tokenCache.loading
}

exports.main = async (event) => {
  if (!event || !TARGET_STATUSES.has(event.orderStatus) || !event.openid) return { ok: true, skipped: true }
  const order = event.order || {}
  const statusLabel = { ready_for_pickup: '待自取', delivering: '配送中', in_transit: '运输中' }[event.orderStatus]
  const names = Array.isArray(order.items) ? order.items.map((item) => item.productName || item.name).filter(Boolean) : []
  const token = await accessToken()
  const result = await requestJson(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(token)}`, {
    touser: event.openid, template_id: TEMPLATE_ID,
    page: `/pages/${order.purchaseScene === 'pickup' ? 'order-detail' : 'delivery-order-detail'}/order-detail?id=${encodeURIComponent(order.orderNo || event.orderNo || '')}`,
    data: {
      thing6: { value: text(names.join('、') || '订单商品') },
      character_string22: { value: text(order.orderNo || event.orderNo) },
      phrase16: { value: statusLabel },
      thing23: { value: text(order.storeSnapshot && order.storeSnapshot.name || (order.deliveryMethod === 'local' ? '同城外卖' : '快递邮寄')) },
      thing20: { value: text(statusLabel === '待自取' ? '请到店取货' : '请留意配送进度') }
    }
  })
  if (result.errcode) throw new Error(`微信订阅消息发送失败: ${result.errcode} ${result.errmsg || ''}`.trim())
  return { ok: true, msgid: result && result.msgid }
}
