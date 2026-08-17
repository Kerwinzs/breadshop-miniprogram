const cloud = require('./cloud-service')
function list() { return cloud.call('address', 'listAddresses') }
function save(address) { const payload = { addressId: address.id || address.addressId || '', address: Object.assign({}, address) }; delete payload.address.id; delete payload.address.addressId; return cloud.call('address', 'saveAddress', payload) }
function remove(addressId) { return cloud.call('address', 'deleteAddress', { addressId }) }
function setDefault(addressId) { return cloud.call('address', 'setDefaultAddress', { addressId }) }
module.exports = { list, save, remove, setDefault }
