const assert = require('assert')
const crypto = require('crypto')
const Module = require('module')
const { verifyToken } = require('../cloudfunctions/merchant-admin/token')

const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return { DYNAMIC_CURRENT_ENV: 'test', init() {}, database: () => ({ serverDate: () => 'server-date' }) }
  return originalLoad.call(this, request, parent, isMain)
}
const { FLOWS, ORDER_QUEUES, ACTION_PERMISSIONS, nextStatus, queueOfStatus, orderQueueCounts, validOrderFilters, pageOf, auditDate, patch, dtoOrder, dtoProduct } = require('../cloudfunctions/merchant-admin/index')
Module._load = originalLoad

function token(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const content = `${header}.${body}`
  return `${content}.${crypto.createHmac('sha256', secret).update(content).digest('base64url')}`
}

const secret = 'merchant-admin-contract-secret-at-least-32-bytes'
const now = 1_700_000_000
const value = token({ sub: 'operator', roleId: 'merchant_operator', permissions: ['orders.read'], exp: now + 60 }, secret)
assert.strictEqual(verifyToken(value, secret, now).sub, 'operator')
assert.strictEqual(verifyToken(value, `${secret}-wrong`, now), null)
assert.strictEqual(verifyToken(value, secret, now + 61), null)
assert.strictEqual(verifyToken('not-a-token', secret, now), null)
assert.deepStrictEqual(FLOWS.shipping, ['placed', 'preparing', 'awaiting_shipment', 'in_transit', 'completed'])
assert.deepStrictEqual(ORDER_QUEUES.fulfilling, ['ready_for_pickup', 'delivering', 'awaiting_shipment', 'in_transit'])
assert.strictEqual(ACTION_PERMISSIONS.getDashboardSummary, 'orders.read')
assert.strictEqual(queueOfStatus('placed'), 'pending')
assert.strictEqual(queueOfStatus('delivering'), 'fulfilling')
assert.deepStrictEqual(orderQueueCounts([{ orderStatus: 'placed' }, { orderStatus: 'preparing' }, { orderStatus: 'delivering' }, { orderStatus: 'completed' }]), { pending: 1, preparing: 1, fulfilling: 1, completed: 1, canceled: 0 })
assert.strictEqual(validOrderFilters({ queue: 'pending', sort: 'createdAtAsc' }), true)
assert.strictEqual(validOrderFilters({ queue: 'unknown' }), false)
assert.strictEqual(nextStatus({ purchaseScene: 'pickup', orderStatus: 'placed' }), 'preparing')
assert.strictEqual(nextStatus({ purchaseScene: 'delivery', deliveryMethod: 'local', orderStatus: 'delivering' }), 'completed')
assert.strictEqual(nextStatus({ purchaseScene: 'delivery', deliveryMethod: 'shipping', orderStatus: 'completed' }), null)
assert.deepStrictEqual(pageOf({ page: 2, pageSize: 50 }), { page: 2, pageSize: 50 })
assert.strictEqual(pageOf({ page: 0, pageSize: 20 }), null)
assert.strictEqual(auditDate('2026-08-19', false).toISOString(), '2026-08-18T16:00:00.000Z')
assert.strictEqual(auditDate('2026-08-19', true).toISOString(), '2026-08-19T16:00:00.000Z')
assert.strictEqual(auditDate('2026-02-30', false), undefined)
assert.strictEqual(auditDate('2026/08/19', false), undefined)
assert.strictEqual(auditDate(undefined, false), null)
assert.strictEqual(auditDate('2026-08-24', false).toISOString(), '2026-08-23T16:00:00.000Z')
assert.strictEqual(auditDate('2026-08-24', true).toISOString(), '2026-08-24T16:00:00.000Z')
assert.strictEqual(ACTION_PERMISSIONS.createStore, 'stores.create')
assert.strictEqual(ACTION_PERMISSIONS.deleteStore, 'stores.delete')
assert.strictEqual(ACTION_PERMISSIONS.cancelOrder, 'orders.cancel')
assert.deepStrictEqual(patch({ priceFen: 1250, enabled: false, ownerOpenId: 'nope' }, ['priceFen', 'enabled'], 'product'), { priceFen: 1250, enabled: false })
assert.deepStrictEqual(patch({ name: '新门店', status: 'closed' }, ['name', 'addressText'], 'store'), { name: '新门店' })
assert.strictEqual(patch({ priceFen: -1 }, ['priceFen'], 'product'), null)
assert.strictEqual(dtoOrder({ orderNo: 'B1', orderStatus: 'placed', purchaseScene: 'delivery', addressSnapshot: { phone: 'hidden' } }, false).addressSnapshot, undefined)
assert.deepStrictEqual(dtoOrder({ orderNo: 'B1', orderStatus: 'placed', purchaseScene: 'delivery', items: [{ productId: 'p1', productName: '面包', specId: 's1', specName: '原味', unitPriceFen: 1200, quantity: 2, lineTotalFen: 2400 }], addressSnapshot: { contactName: '顾客', phone: '13800000000', province: '上海市', city: '上海市', district: '浦东新区', detail: '测试路 1 号' } }, true).items[0], { productId: 'p1', productName: '面包', specId: 's1', specName: '原味', unitPriceFen: 1200, quantity: 2, lineTotalFen: 2400 })
assert.strictEqual(Object.prototype.hasOwnProperty.call(dtoOrder({ orderNo: 'S1', orderStatus: 'placed', purchaseScene: 'delivery', deliveryMethod: 'shipping' }, true), 'shippingIncludedItems'), false)
assert.strictEqual(dtoOrder({ orderNo: 'B1', orderStatus: 'placed', purchaseScene: 'delivery', addressSnapshot: { contactName: '顾客', phone: '13800000000' } }, true).addressSnapshot.phone, '13800000000')
assert.strictEqual(dtoProduct({ productId: 'p1', priceFen: 1680, soldOut: true }).priceFen, 1680)
console.log('merchant admin token contract passed')
