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
  if (typeof db.runTransaction !== 'function') return fail('INTERNAL_ERROR', '用户服务未启用事务')
  try {
    const result = await db.runTransaction(async (transaction) => {
      const collection = transaction.collection('users')
      const existing = await collection.where({ openid }).limit(1).get()
      const now = db.serverDate()
      if (existing.data && existing.data[0]) {
        const user = existing.data[0]
        await collection.doc(user._id).update({ data: { status: 'active', updatedAt: now, lastLoginAt: now } })
        return { userId: user._id, status: 'authenticated', isNew: false }
      }
      const created = await collection.add({ data: { openid, status: 'active', createdAt: now, updatedAt: now, lastLoginAt: now } })
      return { userId: created._id, status: 'authenticated', isNew: true }
    })
    return ok(result)
  } catch (error) {
    console.error('auth.login failed', error && error.message)
    return fail('INTERNAL_ERROR', '登录暂时不可用，请稍后重试')
  }
}
