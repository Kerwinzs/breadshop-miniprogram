const cloud = require('./cloud-service')
function quote(payload) { return cloud.call('fee', 'quote', payload) }
module.exports = { quote }
