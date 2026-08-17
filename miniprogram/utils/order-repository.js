const cloud = require('./cloud-service')
function create(payload) { return cloud.call('order', 'createOrder', payload) }
function list() { return cloud.call('order', 'listOrders') }
function get(orderNo) { return cloud.call('order', 'getOrder', { orderNo }) }
function cancel(orderNo) { return cloud.call('order', 'cancelOrder', { orderNo }) }
module.exports = { create, list, get, cancel }
