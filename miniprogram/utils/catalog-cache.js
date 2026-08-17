const products = {}
const stores = {}

function putProducts(items) { (items || []).forEach((item) => { if (item && item.id) products[item.id] = item }) }
function putStores(items) { (items || []).forEach((item) => { if (item && item.id) stores[item.id] = item }) }
function getProduct(id) { return products[id] || null }
function getStore(id) { return stores[id] || null }

module.exports = { putProducts, putStores, getProduct, getStore }
