const assert = require('assert')
const { hashPassword, verifyPassword, signToken, verifyToken } = require('../cloudfunctions/merchant-auth/token')
const merchantAuth = require('../cloudfunctions/merchant-auth')

const password = ['test', Date.now(), Math.random()].join('-')
const encoded = hashPassword(password)
assert.ok(encoded.startsWith('scrypt$'))
assert.strictEqual(verifyPassword(password, encoded), true)
assert.strictEqual(verifyPassword(`${password}-wrong`, encoded), false)

const secret = ['secret', Date.now(), Math.random()].join('-')
const now = 1_700_000_000
const token = signToken({ sub: 'merchant-test', roleId: 'merchant_operator', permissions: ['orders.read'], iat: now, exp: now + 60, jti: 'test-jti' }, secret)
assert.strictEqual(verifyToken(token, secret, now + 1).sub, 'merchant-test')
assert.strictEqual(verifyToken(token, 'wrong-secret', now + 1), null)
assert.strictEqual(verifyToken(token, secret, now + 61), null)

const originalPermissions = process.env.MERCHANT_PERMISSIONS
delete process.env.MERCHANT_PERMISSIONS
assert.ok(merchantAuth.config().permissions.includes('orders.address.read'))
if (originalPermissions === undefined) delete process.env.MERCHANT_PERMISSIONS
else process.env.MERCHANT_PERMISSIONS = originalPermissions

const savedMerchantEnv = {
  MERCHANT_ACCOUNT: process.env.MERCHANT_ACCOUNT,
  MERCHANT_PASSWORD_HASH: process.env.MERCHANT_PASSWORD_HASH,
  MERCHANT_TOKEN_SECRET: process.env.MERCHANT_TOKEN_SECRET,
  MERCHANT_PERMISSIONS: process.env.MERCHANT_PERMISSIONS
}
process.env.MERCHANT_ACCOUNT = 'admin'
process.env.MERCHANT_PASSWORD_HASH = encoded
process.env.MERCHANT_TOKEN_SECRET = '0123456789abcdef0123456789abcdef'
process.env.MERCHANT_PERMISSIONS = 'orders.read,payments.read,refunds.create,refunds.retry'
assert.deepStrictEqual(merchantAuth.configurationStatus(), { authConfigured: true, paymentPermissionsReady: true })
process.env.MERCHANT_PERMISSIONS = 'orders.read'
assert.deepStrictEqual(merchantAuth.configurationStatus(), { authConfigured: true, paymentPermissionsReady: false })
for (const [key, value] of Object.entries(savedMerchantEnv)) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

console.log('merchant auth contract passed')
