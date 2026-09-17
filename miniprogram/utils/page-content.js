const DEFAULT_PAGE_CONTENT = {
  home: {
    hero: { visible: true, kicker: '08:00 — 21:00 / 今日现烤', title: '把刚出炉的香气，带回家。', copy: '伯爵茶可颂限定回归，下午三点后售罄概率较高。', pill: '新品尝鲜 · 第二件立减 ¥4' },
    notice: { visible: true, text: '活动公告：到店自取满 ¥49 赠法棍切片一份，赠品数量有限。' }
  },
  profile: {
    brand: { visible: true, imageUrl: '', kicker: '麦香小屋 · BREAD CLUB', title: '麦香朋友', subtitle: '好面包，慢慢吃。' },
    orderCard: { label: '我的订单', emptyTitle: '还没有待取的面包', emptyHint: '去逛逛今天的新鲜出炉吧' },
    tip: { visible: true, title: '今日面包小贴士', text: '面包室温密封保存，复烤 3 分钟风味更佳。' }
  }
}

function mergeContent(page, value) {
  const base = DEFAULT_PAGE_CONTENT[page] || {}
  const incoming = value && typeof value === 'object' ? value : {}
  return Object.keys(base).reduce((result, key) => ({ ...result, [key]: { ...base[key], ...(incoming[key] || {}) } }), {})
}

function get(page, value) { return mergeContent(page, value) }

module.exports = { DEFAULT_PAGE_CONTENT, mergeContent, get }
