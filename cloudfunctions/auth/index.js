const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function ok(data) { return { ok: true, data } }
function fail(code, message) { return { ok: false, error: { code, message } } }

exports.main = async (event) => {
  if (!event || event.action !== 'login') return fail('INVALID_INPUT', '不支持的登录操作')
  const context = cloud.getWXContext()
  const openid = context && context.OPENID
  if (!openid) return fail('AUTH_REQUIRED', '无法取得微信登录身份')
  const now = db.serverDate()
  try {
    const existing = await db.collection('users').where({ openid }).limit(1).get()
    let userId
    let isNew = false
    if (existing.data && existing.data[0]) {
      userId = existing.data[0]._id
      await db.collection('users').doc(userId).update({ data: { status: 'active', updatedAt: now, lastLoginAt: now } })
    } else {
      const created = await db.collection('users').add({ data: { openid, status: 'active', createdAt: now, updatedAt: now, lastLoginAt: now } })
      userId = created._id
      isNew = true
    }
    // 不把 openid、头像、昵称或手机号返回给小程序。
    return ok({ userId, status: 'authenticated', isNew })
  } catch (error) {
    console.error('auth.login failed', error && error.message)
    return fail('INTERNAL_ERROR', '登录暂时不可用，请稍后重试')
  }
}
