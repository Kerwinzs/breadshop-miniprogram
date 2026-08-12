const stores = [
  { id: 'store-yuyuan', name: '愚园路店', address: '天山路 79 号', businessHours: '08:00—21:00', status: 'open', distanceText: '680m' },
  { id: 'store-jingan', name: '静安店', address: '常德路 220 号', businessHours: '09:00—20:00', status: 'closed', distanceText: '2.4km' }
]

const products = [
  { id: 'earl-grey', name: '伯爵茶可颂', desc: '黄油层层酥脆', detailDesc: '佛手柑的清香留在奶油里，27 层黄油面团烤出薄脆、轻盈的声响。', priceFen: 1680, deliveryPriceFen: 1880, category: '甜点', artClass: 'art-dark', specs: [{ id: 'original', name: '原味', extraFeeFen: 0 }, { id: 'almond', name: '加杏仁片', extraFeeFen: 200 }] },
  { id: 'fig', name: '无花果酸面包', desc: '天然酵种慢发酵', detailDesc: '果干与天然酵种慢慢醒发，切开是柔软而丰盈的麦香。', priceFen: 2800, deliveryPriceFen: 3000, category: '欧包', artClass: 'art-milk', specs: [{ id: 'sliced', name: '经典切片', extraFeeFen: 0 }, { id: 'whole', name: '整只装', extraFeeFen: 300 }] },
  { id: 'milk', name: '醇香牛乳吐司', desc: '云朵般柔软', detailDesc: '轻柔的牛乳香气和蓬松组织，适合带回家慢慢分享。', priceFen: 1980, deliveryPriceFen: 2180, category: '吐司', artClass: 'art-red', specs: [{ id: 'standard', name: '标准规格', extraFeeFen: 0 }] },
  { id: 'coffee', name: '冷萃燕麦拿铁', desc: '清甜不腻', detailDesc: '顺滑燕麦奶遇上低温慢萃咖啡，清爽又有层次。', priceFen: 1400, deliveryPriceFen: 1600, category: '饮品', artClass: 'art-blue', specs: [{ id: 'standard', name: '标准规格', extraFeeFen: 0 }] }
]

module.exports = { products, stores }
