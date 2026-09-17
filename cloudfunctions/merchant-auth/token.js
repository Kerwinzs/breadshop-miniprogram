const crypto = require('crypto')

const TOKEN_HEADER = { alg: 'HS256', typ: 'JWT' }
const PASSWORD_FORMAT = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]+)\$([0-9a-f]+)$/

function base64url(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function decodeBase64url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='), 'base64')
}

function safeEqual(left, right) {
  const a = Buffer.from(left || '')
  const b = Buffer.from(right || '')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function hashPassword(password, options) {
  const opts = Object.assign({ N: 16384, r: 8, p: 1 }, options || {})
  const salt = crypto.randomBytes(16)
  const derived = crypto.scryptSync(String(password || ''), salt, 64, { N: opts.N, r: opts.r, p: opts.p, maxmem: 32 * 1024 * 1024 })
  return `scrypt$${opts.N}$${opts.r}$${opts.p}$${base64url(salt)}$${derived.toString('hex')}`
}

function verifyPassword(password, encoded) {
  const match = PASSWORD_FORMAT.exec(String(encoded || ''))
  if (!match) return false
  const N = Number(match[1]), r = Number(match[2]), p = Number(match[3])
  if (!Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p) || N < 1024 || r < 1 || p < 1 || N > 262144) return false
  try {
    const expected = Buffer.from(match[5], 'hex')
    const actual = crypto.scryptSync(String(password || ''), decodeBase64url(match[4]), expected.length, { N, r, p, maxmem: 32 * 1024 * 1024 })
    return safeEqual(actual, expected)
  } catch (error) {
    return false
  }
}

function signToken(payload, secret) {
  if (!secret) throw new Error('token secret is required')
  const encodedHeader = base64url(JSON.stringify(TOKEN_HEADER))
  const encodedPayload = base64url(JSON.stringify(payload))
  const content = `${encodedHeader}.${encodedPayload}`
  const signature = crypto.createHmac('sha256', secret).update(content).digest('base64url')
  return `${content}.${signature}`
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
    const now = Number.isFinite(nowSeconds) ? nowSeconds : Math.floor(Date.now() / 1000)
    if (!payload || typeof payload.sub !== 'string' || !Number.isInteger(payload.exp) || payload.exp <= now) return null
    return payload
  } catch (error) {
    return null
  }
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken }
