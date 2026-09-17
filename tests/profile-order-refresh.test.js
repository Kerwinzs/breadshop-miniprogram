const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

test('profile refreshes cloud orders and recognizes internal pickup status', () => {
  const source = fs.readFileSync('miniprogram/pages/profile/profile.js', 'utf8')
  assert.match(source, /require\('\.\.\/\.\.\/utils\/order-repository'\)/)
  assert.match(source, /orderRemote\.list\(\)/)
  assert.match(source, /formatOrderStatus\(item && item\.orderStatus\)/)
  assert.match(source, /store\.replaceOrders\(result\.orders \|\| \[\]\)/)
})
