const DELIVERY_FEE_MOCK = { insulationFeeFen: 200, localDeliveryFeeFen: 600, shippingPostageFen: 1200 }
function validPhone(phone) { return /^1\d{10}$/.test(String(phone || '').trim()) }
function validAddress(address) { return address && address.contactName && validPhone(address.phone) && address.province && address.city && address.district && address.detail }
function calculateDeliveryFees(input) {
  const method = input && input.deliveryMethod === 'shipping' ? 'shipping' : 'local'
  const address = input && input.address
  const label = method === 'shipping' ? '邮费' : '配送费'
  if (!address) return { status: 'missingAddress', message: '待填写地址后计算', insulationFeeFen: DELIVERY_FEE_MOCK.insulationFeeFen, deliveryFeeFen: null, postageFen: null, transportFeeFen: null, transportLabel: label, deliveryMethod: method }
  if (!validAddress(address)) return { status: 'incompleteAddress', message: '请完善收货地址', insulationFeeFen: DELIVERY_FEE_MOCK.insulationFeeFen, deliveryFeeFen: null, postageFen: null, transportFeeFen: null, transportLabel: label, deliveryMethod: method }
  if (method === 'local' && address.supportsLocal === false) return { status: 'outOfRange', message: '当前地址超出同城配送范围', insulationFeeFen: DELIVERY_FEE_MOCK.insulationFeeFen, deliveryFeeFen: null, postageFen: null, transportFeeFen: null, transportLabel: label, deliveryMethod: method }
  if (method === 'shipping' && address.supportsShipping === false) return { status: 'unsupportedMethod', message: '当前地址不支持快递邮寄，请修改地址或选择同城外卖。', insulationFeeFen: DELIVERY_FEE_MOCK.insulationFeeFen, deliveryFeeFen: null, postageFen: null, transportFeeFen: null, transportLabel: label, deliveryMethod: method }
  const transport = method === 'shipping' ? DELIVERY_FEE_MOCK.shippingPostageFen : DELIVERY_FEE_MOCK.localDeliveryFeeFen
  return { status: 'ready', message: '', insulationFeeFen: DELIVERY_FEE_MOCK.insulationFeeFen, deliveryFeeFen: method === 'local' ? transport : null, postageFen: method === 'shipping' ? transport : null, transportFeeFen: transport, transportLabel: label, deliveryMethod: method }
}
module.exports = { DELIVERY_FEE_MOCK, calculateDeliveryFees, validPhone, validAddress }
