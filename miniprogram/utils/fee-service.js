const DELIVERY_FEE_MOCK = { insulationFeeFen: 0, localDeliveryFeeFen: 0, shippingPostageFen: 0 }
function validPhone(phone) { return /^1\d{10}$/.test(String(phone || '').trim()) }
function validAddress(address) { return address && address.contactName && validPhone(address.phone) && address.province && address.city && address.district && address.detail }
function calculateDeliveryFees(input) {
  const method = input && input.deliveryMethod === 'shipping' ? 'shipping' : 'local'
  const address = input && input.address
  const shipping = method === 'shipping', label = shipping ? '快递到付' : '配送费到付', insulationFeeFen = 0
  if (!address) return { status: 'missingAddress', message: '待填写地址后计算', insulationFeeFen, deliveryFeeFen: null, postageFen: shipping ? 0 : null, transportFeeFen: shipping ? 0 : null, transportLabel: label, deliveryMethod: method }
  if (!validAddress(address)) return { status: 'incompleteAddress', message: '请完善收货地址', insulationFeeFen, deliveryFeeFen: null, postageFen: shipping ? 0 : null, transportFeeFen: shipping ? 0 : null, transportLabel: label, deliveryMethod: method }
  if (method === 'local' && address.supportsLocal === false) return { status: 'outOfRange', message: '当前地址超出同城配送范围', insulationFeeFen: 0, deliveryFeeFen: 0, postageFen: 0, transportFeeFen: 0, transportLabel: label, deliveryMethod: method }
  if (shipping && address.supportsShipping === false) return { status: 'unsupportedMethod', message: '当前地址不支持快递邮寄，请修改地址或选择同城外卖。', insulationFeeFen, deliveryFeeFen: null, postageFen: 0, transportFeeFen: 0, transportLabel: label, deliveryMethod: method }
  return { status: 'ready', message: shipping ? '快递到付' : '配送费到付', insulationFeeFen: 0, deliveryFeeFen: 0, postageFen: 0, transportFeeFen: 0, transportLabel: label, deliveryMethod: method }
}
module.exports = { DELIVERY_FEE_MOCK, calculateDeliveryFees, validPhone, validAddress }
