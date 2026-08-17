const store = require('../../utils/store')
const remote = require('../../utils/address-repository')
const regions = require('../../utils/region-data')
const { validPhone } = require('../../utils/fee-service')
const regionNames = regions.map((item) => item.name)
const defaultProvinceIndex = regions.findIndex((item) => item.name === '山东省')
const defaultProvince = regions[defaultProvinceIndex]
const defaultCityIndex = defaultProvince.cities.findIndex((item) => item.name === '青岛市')
const defaultCity = defaultProvince.cities[defaultCityIndex]
const defaultDistrictIndex = defaultCity.districts.findIndex((item) => item.name === '崂山区')
const defaultDistrict = defaultCity.districts[defaultDistrictIndex]
const emptyForm = { id: '', contactName: '', phone: '', province: defaultProvince.name, city: defaultCity.name, district: defaultDistrict.name, provinceCode: defaultProvince.code, cityCode: defaultCity.code, districtCode: defaultDistrict.code, detail: '', postalCode: '', supportsLocal: true, supportsShipping: true, isDefault: false }

function namesForProvince(index) { return (regions[index] || regions[0]).cities.map((city) => city.name) }
function districtsFor(index, cityIndex) { const province = regions[index] || regions[0]; return ((province.cities[cityIndex] || province.cities[0]).districts || []).map((district) => district.name) }
function findIndexByCodeOrName(items, code, name) {
  let index = code ? items.findIndex((item) => item.code === code) : -1
  if (index < 0 && name) index = items.findIndex((item) => item.name === name)
  return index
}
function regionIndexes(form) {
  const provinceIndex = findIndexByCodeOrName(regions, form.provinceCode, form.province)
  const province = regions[provinceIndex >= 0 ? provinceIndex : 0]
  const cityIndex = findIndexByCodeOrName(province.cities, form.cityCode, form.city)
  const city = province.cities[cityIndex >= 0 ? cityIndex : 0]
  const districtIndex = findIndexByCodeOrName(city.districts, form.districtCode, form.district)
  return {
    provinceIndex: provinceIndex >= 0 ? provinceIndex : 0,
    cityIndex: cityIndex >= 0 ? cityIndex : 0,
    districtIndex: districtIndex >= 0 ? districtIndex : 0,
    known: provinceIndex >= 0 && cityIndex >= 0 && districtIndex >= 0
  }
}
function regionTextFor(form) { return [form.province, form.city, form.district].filter(Boolean).join(' ') || '请选择省、市、区县' }
function regionCodesFor(form) {
  const indexes = regionIndexes(form)
  if (!indexes.known) return null
  const province = regions[indexes.provinceIndex], city = province.cities[indexes.cityIndex], district = city.districts[indexes.districtIndex]
  return { provinceCode: province.code, cityCode: city.code, districtCode: district.code }
}

Page({
  data: { addresses: [], editing: false, form: Object.assign({}, emptyForm), regionRange: [regionNames, namesForProvince(defaultProvinceIndex), districtsFor(defaultProvinceIndex, defaultCityIndex)], regionValue: [defaultProvinceIndex, defaultCityIndex, defaultDistrictIndex], regionText: regionTextFor(emptyForm), regionKnown: true },
  onShow() { const state = store.getState(); this.setData({ addresses: state.addresses.map((item) => Object.assign({}, item, { isDefault: item.id === state.addressId })), editing: false }); remote.list().then((result) => { const addresses = result.addresses || []; store.replaceAddresses(addresses); this.setData({ addresses: addresses.map((item) => Object.assign({}, item, { isDefault: item.isDefault === true })) }) }).catch(() => {}) },
  syncRegion(form) {
    const indexes = regionIndexes(form), cities = namesForProvince(indexes.provinceIndex), districts = districtsFor(indexes.provinceIndex, indexes.cityIndex)
    this.setData({ form: Object.assign({}, form), regionRange: [regionNames, cities, districts], regionValue: [indexes.provinceIndex, indexes.cityIndex, indexes.districtIndex], regionText: regionTextFor(form), regionKnown: indexes.known })
  },
  add() { this.setData({ editing: true }); this.syncRegion(Object.assign({}, emptyForm)) },
  edit(e) { const item = store.getState().addresses.find((address) => address.id === e.currentTarget.dataset.id); if (item) { this.setData({ editing: true }); this.syncRegion(Object.assign({}, emptyForm, item)) } },
  input(e) { this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value }) },
  regionColumnChange(e) { const value = this.data.regionValue.slice(); value[e.detail.column] = e.detail.value; if (e.detail.column === 0) { value[1] = 0; value[2] = 0 } if (e.detail.column <= 1) value[2] = 0; const cities = namesForProvince(value[0]), districts = districtsFor(value[0], value[1]); this.setData({ regionRange: [regionNames, cities, districts], regionValue: value }) },
  regionChange(e) { const value = e.detail.value, province = regions[value[0]], city = province.cities[value[1]], district = city.districts[value[2]], form = Object.assign({}, this.data.form, { province: province.name, city: city.name, district: district.name, provinceCode: province.code, cityCode: city.code, districtCode: district.code }); this.setData({ form, regionValue: value, regionText: `${province.name} ${city.name} ${district.name}`, regionKnown: true }) },
  regionCancel() { this.syncRegion(this.data.form) },
  save() { const form = this.data.form, regionCodes = regionCodesFor(form); if (!this.data.regionKnown || !regionCodes) return wx.showToast({ title: '请重新选择所在地区后保存', icon: 'none' }); if (!form.contactName || !form.phone || !form.province || !form.city || !form.district || !form.detail) return wx.showToast({ title: '请完善收货地址', icon: 'none' }); if (!validPhone(form.phone)) return wx.showToast({ title: '请输入11位手机号', icon: 'none' }); const address = Object.assign({}, form, regionCodes); remote.save(address).then((result) => { const saved = result.address; store.saveAddress(Object.assign({}, saved, { id: saved.id || saved.addressId })); this.onShow(); wx.showToast({ title: '地址已保存' }) }).catch((error) => wx.showToast({ title: error.message || '地址保存失败', icon: 'none' })) },
  choose(e) { const id = e.currentTarget.dataset.id; remote.setDefault(id).then(() => { store.setSelectedAddress(id); wx.showToast({ title: '已选择收货地址', icon: 'none' }); setTimeout(() => wx.navigateBack(), 250) }).catch((error) => wx.showToast({ title: error.message || '地址选择失败', icon: 'none' })) },
  remove(e) { const id = e.currentTarget.dataset.id, state = store.getState(); if (id === state.addressId && state.addresses.length > 1) return wx.showToast({ title: '请先选择其他默认地址', icon: 'none' }); remote.remove(id).then(() => { store.removeAddress(id); this.onShow() }).catch((error) => wx.showToast({ title: error.message || '地址删除失败', icon: 'none' })) },
  cancelEdit() { this.setData({ editing: false }) }, back() { wx.navigateBack() }
})
