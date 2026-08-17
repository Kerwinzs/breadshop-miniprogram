const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const ADDRESS_FIELDS = ['contactName', 'phone', 'province', 'city', 'district', 'provinceCode', 'cityCode', 'districtCode', 'detail', 'postalCode']

function ok(data) { return { ok: true, data } }
function fail(code, message) { return { ok: false, error: { code, message } } }
function openid() { return cloud.getWXContext().OPENID }
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
  const result = Object.assign({}, doc)
  delete result.ownerOpenId
  delete result._openid
  return Object.assign(result, { id: doc.addressId || doc._id })
}
async function clearDefault(owner, exceptId) {
  const result = await db.collection('addresses').where({ ownerOpenId: owner, isDefault: true }).get()
  await Promise.all((result.data || []).filter((item) => item.addressId !== exceptId).map((item) => db.collection('addresses').doc(item._id).update({ data: { isDefault: false, updatedAt: db.serverDate() } })))
}
async function list(owner) {
  const result = await db.collection('addresses').where({ ownerOpenId: owner }).limit(100).get()
  return { addresses: (result.data || []).map(dto) }
}
async function save(owner, event) {
  const address = normalize(event.address)
  const error = validate(address)
  if (error) return fail(error, '请完善收货地址')
  const addressId = typeof event.addressId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(event.addressId) ? event.addressId : `address-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const existing = await db.collection('addresses').where({ ownerOpenId: owner, addressId }).limit(1).get()
  const anyAddress = await db.collection('addresses').where({ ownerOpenId: owner }).limit(1).get()
  if (!anyAddress.data || !anyAddress.data[0]) address.isDefault = true
  const now = db.serverDate()
  const data = Object.assign(address, { addressId, ownerOpenId: owner, updatedAt: now })
  if (address.isDefault) await clearDefault(owner, addressId)
  if (existing.data && existing.data[0]) await db.collection('addresses').doc(existing.data[0]._id).update({ data })
  else await db.collection('addresses').add({ data: Object.assign(data, { createdAt: now }) })
  const saved = await db.collection('addresses').where({ ownerOpenId: owner, addressId }).limit(1).get()
  return { address: dto(saved.data[0]) }
}
async function remove(owner, addressId) {
  const result = await db.collection('addresses').where({ ownerOpenId: owner, addressId }).limit(1).get()
  if (!result.data || !result.data[0]) return fail('ADDRESS_NOT_FOUND', '地址不存在')
  await db.collection('addresses').doc(result.data[0]._id).remove()
  return { addressId }
}
async function setDefault(owner, addressId) {
  const result = await db.collection('addresses').where({ ownerOpenId: owner, addressId }).limit(1).get()
  if (!result.data || !result.data[0]) return fail('ADDRESS_NOT_FOUND', '地址不存在')
  await clearDefault(owner, addressId)
  await db.collection('addresses').doc(result.data[0]._id).update({ data: { isDefault: true, updatedAt: db.serverDate() } })
  return { address: dto(Object.assign({}, result.data[0], { isDefault: true })) }
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
