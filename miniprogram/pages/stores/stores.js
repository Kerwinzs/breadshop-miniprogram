const storeRepository = require('../../utils/store-repository')
const store = require('../../utils/store')
Page({
  data: { stores: [], selectedId: '' },
  onShow() { storeRepository.list().then((result) => this.setData({ stores: result.items || [], selectedId: store.getState().storeId })).catch(() => this.setData({ stores: [], selectedId: store.getState().storeId })) },
  back() { wx.navigateBack() },
  choose(e) { const selected = store.setSelectedStore(e.currentTarget.dataset.id); if (!selected) return wx.showToast({ title: '门店信息无效', icon: 'none' }); wx.showToast({ title: `已选择${selected.name}`, icon: 'none' }); setTimeout(() => wx.navigateBack(), 250) }
})
