const crypto = require('crypto')
const { verifyPassword, signToken, verifyToken } = require('./token')

const DEFAULT_TTL_SECONDS = 900

function ok(data) { return { ok: true, data } }
function fail(code, message) { return { ok: false, error: { code, message } } }

function config() {
  const account = String(process.env.MERCHANT_ACCOUNT || '')
  const passwordHash = String(process.env.MERCHANT_PASSWORD_HASH || '')
  const secret = String(process.env.MERCHANT_TOKEN_SECRET || '')
  const roleId = String(process.env.MERCHANT_ROLE_ID || 'merchant_operator')
  const permissions = String(process.env.MERCHANT_PERMISSIONS || 'orders.read,orders.address.read,orders.advance,orders.cancel,products.read,products.toggleSoldOut,stores.read,stores.toggleOpen,auditLogs.read')
    .split(',').map((item) => item.trim()).filter(Boolean)
  const ttlSeconds = Math.min(Math.max(Number(process.env.MERCHANT_TOKEN_TTL_SECONDS || DEFAULT_TTL_SECONDS), 60), 3600)
  return { account, passwordHash, secret, roleId, permissions, ttlSeconds }
}

function configured(value) {
  return Boolean(value.account && value.passwordHash && value.secret && Buffer.byteLength(value.secret, 'utf8') >= 32)
}

function configurationStatus() {
  const value = config()
  const requiredPaymentPermissions = ['payments.read', 'refunds.create', 'refunds.retry']
  return {
    authConfigured: configured(value),
    paymentPermissionsReady: requiredPaymentPermissions.every((permission) => value.permissions.includes(permission))
  }
}

function login(event) {
  const value = config()
  if (!configured(value)) return fail('AUTH_CONFIG_MISSING', '商家登录尚未完成服务端配置')
  const account = event && event.account
  const password = event && event.password
  if (typeof account !== 'string' || typeof password !== 'string' || !account || !password) return fail('INVALID_INPUT', '请输入账号和密码')
  const accountBytes = Buffer.from(account)
  const configuredAccountBytes = Buffer.from(value.account)
  const accountOk = accountBytes.length === configuredAccountBytes.length && crypto.timingSafeEqual(accountBytes, configuredAccountBytes)
  if (!accountOk || !verifyPassword(password, value.passwordHash)) return fail('AUTH_INVALID', '账号或密码错误')
  const now = Math.floor(Date.now() / 1000)
  const payload = { sub: value.account, roleId: value.roleId, permissions: value.permissions, iat: now, exp: now + value.ttlSeconds, jti: crypto.randomBytes(16).toString('hex') }
  return ok({ token: signToken(payload, value.secret), expiresAt: payload.exp, merchantUserId: value.account, roleId: value.roleId, permissions: value.permissions })
}

function session(event) {
  const value = config()
  if (!configured(value)) return fail('AUTH_CONFIG_MISSING', '商家登录尚未完成服务端配置')
  const payload = verifyToken(event && event.token, value.secret)
  if (!payload) return fail('AUTH_REQUIRED', '商家登录已失效，请重新登录')
  return ok({ merchantUserId: payload.sub, roleId: payload.roleId, permissions: payload.permissions, expiresAt: payload.exp })
}

exports.main = async (event) => {
  const action = event && event.action
  try {
    if (action === 'configurationStatus') return ok(configurationStatus())
    if (action === 'login') return login(event)
    if (action === 'verifySession') return session(event)
    if (action === 'logout') return ok({ loggedOut: true })
    return fail('INVALID_INPUT', '不支持的商家认证操作')
  } catch (error) {
    console.error('merchant-auth failed', action, error && error.message)
    return fail('INTERNAL_ERROR', '商家认证服务暂时不可用')
  }
}

module.exports.config = config
module.exports.login = login
module.exports.session = session
module.exports.configurationStatus = configurationStatus
