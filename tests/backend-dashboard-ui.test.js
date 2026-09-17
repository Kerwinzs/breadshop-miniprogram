const assert = require('assert')
const fs = require('fs')
const path = require('path')

const source = fs.readFileSync(path.join(__dirname, '..', 'backend', 'src', 'App.tsx'), 'utf8')
const dashboard = source.slice(source.indexOf('function DashboardPage()'), source.indexOf('function OrdersPage()'))

assert.ok(dashboard.includes("adminApi.listOrders({ orderStatus: 'placed', page: 1, pageSize: 100 })"), 'dashboard must poll placed orders')
assert.ok(dashboard.includes('window.setInterval(checkNewOrders, 30000)'), 'dashboard polling interval must be 30 seconds')
assert.ok(dashboard.includes('knownPlaced.current === null'), 'first dashboard poll must establish a baseline')
assert.ok(dashboard.includes('<Badge dot={unreadOrderNos.length > 0}>'), 'dashboard must show a new-order red dot')
assert.ok(dashboard.includes("navigate('/orders')"), 'dashboard new-order action must open the orders workbench')

console.log('backend dashboard UI contract passed')
