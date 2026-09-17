const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const ADDRESS_FIELDS = ['contactName', 'phone', 'province', 'city', 'district', 'provinceCode', 'cityCode', 'districtCode', 'detail', 'postalCode']

function ok(data) { return { ok: true, data } }
function fail(code, message) { return { ok: false, error: { code, message } } }
function openid() { return cloud.getWXContext().OPENID }
function validId(value) { return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value) }
function validPhone(phone) { return /^1\d{10}$/.test(String(phone || '')) }
function normalize(input) {
  const value = input && typeof input === 'object' ? input : {}
  const address = {}
  ADDRESS_FIELDS.forEach((key) => { address[key] = typeof value[key] === 'string' ? value[key].trim() : '' })
  address.isDefault = value.isDefault === true
  return address
}
function validate(address) {
  if (!address.contactName || !validPhone(address.phone) || !address.province || !address.city || !address.district || !address.detail) return 'ADDRESS_INCOMPLETE'
  if (!address.provinceCode || !address.cityCode || !address.districtCode) return 'ADDRESS_INCOMPLETE'
  return ''
}
function dto(doc) {
  const result = {}
  ADDRESS_FIELDS.concat(['isDefault']).forEach((key) => { result[key] = doc[key] })
  return Object.assign(result, { id: doc.addressId })
}
function transactionRequired() { return typeof db.runTransaction === 'function' }
async function touchUserLock(transaction, owner) {
  const result = await transaction.collection('users').where({ openid: owner }).limit(1).get()
  const user = result.data && result.data[0]
  if (user && user._id) await transaction.collection('users').doc(user._id).update({ data: { updatedAt: db.serverDate() } })
}
async function clearDefault(transaction, owner, exceptId) {
  const result = await transaction.collection('addresses').where({ ownerOpenId: owner, isDefault: true }).get()
  for (const item of (result.data || [])) {
    if (item.addressId !== exceptId) await transaction.collection('addresses').doc(item._id).update({ data: { isDefault: false, updatedAt: db.serverDate() } })
  }
}
async function list(owner) {
  const result = await db.collection('addresses').where({ ownerOpenId: owner }).limit(100).get()
  return { addresses: (result.data || []).map(dto) }
}
async function save(owner, event) {
  if (!transactionRequired()) return fail('INTERNAL_ERROR', '地址服务未启用事务')
  const address = normalize(event.address)
  const error = validate(address)
  if (error) return fail(error, '请完善收货地址')
  const addressId = validId(event.addressId) ? event.addressId : `address-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return db.runTransaction(async (transaction) => {
    await touchUserLock(transaction, owner)
    const collection = transaction.collection('addresses')
    const existingResult = await collection.where({ ownerOpenId: owner, addressId }).limit(1).get()
    const allResult = await collection.where({ ownerOpenId: owner }).limit(100).get()
    const existing = existingResult.data && existingResult.data[0]
    const hasAny = Boolean(allResult.data && allResult.data[0])
    const shouldBeDefault = !hasAny || address.isDefault
    const data = Object.assign({}, address, { addressId, ownerOpenId: owner, isDefault: shouldBeDefault, updatedAt: db.serverDate() })
    if (shouldBeDefault) await clearDefault(transaction, owner, addressId)
    if (existing) await collection.doc(existing._id).update({ data })
    else await collection.add({ data: Object.assign(data, { createdAt: db.serverDate() }) })
    const saved = await collection.where({ ownerOpenId: owner, addressId }).limit(1).get()
    return { address: dto(saved.data[0]) }
  })
}
async function remove(owner, addressId) {
  if (!transactionRequired()) return fail('INTERNAL_ERROR', '地址服务未启用事务')
  if (!validId(addressId)) return fail('INVALID_INPUT', '地址标识无效')
  return db.runTransaction(async (transaction) => {
    await touchUserLock(transaction, owner)
    const collection = transaction.collection('addresses')
    const result = await collection.where({ ownerOpenId: owner, addressId }).limit(1).get()
    const target = result.data && result.data[0]
    if (!target) return fail('ADDRESS_NOT_FOUND', '地址不存在')
    const all = await collection.where({ ownerOpenId: owner }).limit(100).get()
    await collection.doc(target._id).remove()
    if (target.isDefault) {
      const replacement = (all.data || []).find((item) => item.addressId !== addressId)
      if (replacement) await collection.doc(replacement._id).update({ data: { isDefault: true, updatedAt: db.serverDate() } })
    }
    return { addressId }
  })
}
async function setDefault(owner, addressId) {
  if (!transactionRequired()) return fail('INTERNAL_ERROR', '地址服务未启用事务')
  if (!validId(addressId)) return fail('INVALID_INPUT', '地址标识无效')
  return db.runTransaction(async (transaction) => {
    await touchUserLock(transaction, owner)
    const collection = transaction.collection('addresses')
    const result = await collection.where({ ownerOpenId: owner, addressId }).limit(1).get()
    const target = result.data && result.data[0]
    if (!target) return fail('ADDRESS_NOT_FOUND', '地址不存在')
    await clearDefault(transaction, owner, addressId)
    await collection.doc(target._id).update({ data: { isDefault: true, updatedAt: db.serverDate() } })
    return { address: dto(Object.assign({}, target, { isDefault: true })) }
  })
}
exports.main = async (event) => {
  const owner = openid()
  if (!owner) return fail('AUTH_REQUIRED', '请先完成微信登录')
  try {
    const action = event && event.action
    if (action === 'listAddresses') return ok(await list(owner))
    if (action === 'saveAddress') { const result = await save(owner, event); return result.ok === false ? result : ok(result) }
    if (action === 'deleteAddress') { const result = await remove(owner, event.addressId); return result.ok === false ? result : ok(result) }
    if (action === 'setDefaultAddress') { const result = await setDefault(owner, event.addressId); return result.ok === false ? result : ok(result) }
    return fail('INVALID_INPUT', '不支持的地址操作')
  } catch (error) {
    console.error('address failed', event && event.action, error && error.message)
    return fail('INTERNAL_ERROR', '地址服务暂时不可用')
  }
}

module.exports = Object.assign(exports, { normalize, validate, dto })
