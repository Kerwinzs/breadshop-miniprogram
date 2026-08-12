const store = require('./store')
const { formatFen } = require('./format')

function toFen(price) {
  if (typeof price === 'number') return Math.round(price)
  const value = Number(String(price || '').replace(/[¥,]/g, ''))
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}
function count(items) { return (items || []).reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0) }
function subtotal(items) { return (items || []).reduce((sum, item) => sum + (Number(item.unitPriceFen) || 0) * (Number(item.quantity) || 0), 0) }
function setQuantity(scene, product, quantity) {
  const items = store.getCart(scene).slice()
  const index = items.findIndex((item) => item.id === product.id)
  if (quantity <= 0) {
    if (index >= 0) items.splice(index, 1)
  } else if (index >= 0) items[index] = Object.assign({}, items[index], product, { quantity })
  else items.push(Object.assign({}, product, { quantity }))
  return store.setCart(scene, items)
}
function addItem(scene, item, quantity) {
  const existing = store.getCart(scene).find((current) => current.id === item.id)
  return setQuantity(scene, item, (existing ? existing.quantity : 0) + (quantity || 1))
}
module.exports = { toFen, money: formatFen, count, subtotal, setQuantity, addItem }
