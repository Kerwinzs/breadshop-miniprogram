const test = require('node:test')
const assert = require('node:assert/strict')
const { signWorkerRequest, verifyWorkerRequest } = require('../cloudfunctions/payment/worker-auth')

test('worker fails closed when server secret is absent', () => {
  assert.throws(() => verifyWorkerRequest({ payload: {} }), (error) => error.code === 'WORKER_AUTH_NOT_CONFIGURED')
})

test('worker accepts a fresh HMAC signature and rejects tampering or stale calls', () => {
  const secret = 'test-only-secret'
  const timestamp = 100000
  const nonce = 'once'
  const payload = { action: 'all' }
  const signature = signWorkerRequest({ secret, timestamp, nonce, payload })
  assert.equal(verifyWorkerRequest({ secret, timestamp, nonce, payload, signature, now: () => timestamp }), true)
  assert.throws(() => verifyWorkerRequest({ secret, timestamp, nonce, payload: { action: 'refund' }, signature, now: () => timestamp }), (error) => error.code === 'WORKER_UNAUTHORIZED')
  assert.throws(() => verifyWorkerRequest({ secret, timestamp, nonce, payload, signature, now: () => timestamp + 400000 }), (error) => error.code === 'WORKER_UNAUTHORIZED')
})
