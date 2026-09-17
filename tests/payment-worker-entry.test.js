const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

test('worker timer entry is narrowly bound and manual calls remain signed', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'cloudfunctions', 'payment', 'worker.js'), 'utf8')
  assert.match(source, /event\.Type === 'Timer'/)
  assert.match(source, /event\.TriggerName === 'payment-worker-every-minute'/)
  assert.match(source, /verifyWorkerRequest/)
  assert.match(source, /JSON\.parse\(event\.Message\)/)
  assert.match(source, /payload\.action === 'refundOne'/)
  assert.match(source, /worker\.processRefund\(payload\.refundNo\)/)
})
