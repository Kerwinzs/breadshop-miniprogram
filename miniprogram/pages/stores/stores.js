const mock = require('../../utils/mock')
const store = require('../../utils/store')
Page({
  data: { stores: [], selectedId: '' },
  onShow() { this.setData({ stores: mock.stores, selectedId: store.getState().storeId }) },
  back() { wx.navigateBack() },
  choose(e) { const selected = store.setSelectedStore(e.currentTarget.dataset.id); if (!selected) return wx.showToast({ title: '门店信息无效', icon: 'none' }); wx.showToast({ title: `已选择${selected.name}`, icon: 'none' }); setTimeout(() => wx.navigateBack(), 250) }
})
