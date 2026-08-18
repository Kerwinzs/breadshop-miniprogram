const assert = require('assert')
const fs = require('fs')
const path = require('path')

const source = fs.readFileSync(path.join(__dirname, 'tools/dev-regression/dev-regression.js'), 'utf8')
assert.ok(source.includes("'canceled'"), 'a real canceled order must be eligible for the non-placed cancel regression')
assert.ok(source.includes("errorCode(error) === 'ORDER_CANNOT_CANCEL'"), 'the regression must require the server to reject non-placed cancellation')
assert.ok(!source.includes('advanceMockOrder'), 'the regression must not fabricate an order state')

console.log('dev regression non-placed: PASS')
