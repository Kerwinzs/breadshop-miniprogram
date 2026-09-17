const crypto = require('crypto')

function decodeBase64url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='), 'base64')
}

function safeEqual(left, right) {
  const a = Buffer.from(left || '')
  const b = Buffer.from(right || '')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function verifyToken(token, secret, nowSeconds) {
  if (!secret || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const content = `${parts[0]}.${parts[1]}`
  const expected = crypto.createHmac('sha256', secret).update(content).digest('base64url')
  if (!safeEqual(parts[2], expected)) return null
  try {
    const payload = JSON.parse(decodeBase64url(parts[1]).toString('utf8'))
    const now = nowSeconds || Math.floor(Date.now() / 1000)
    if (!payload || typeof payload.sub !== 'string' || !Array.isArray(payload.permissions) || !Number.isInteger(payload.exp) || payload.exp <= now) return null
    return payload
  } catch {
    return null
  }
}

module.exports = { verifyToken }
