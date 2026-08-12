function formatFen(fen) {
  if (fen === null || fen === undefined || fen === '') return '暂无法计算'
  const value = Number(fen)
  if (!Number.isFinite(value)) return '暂无法计算'
  return `¥${(value / 100).toFixed(2)}`
}

module.exports = { formatFen }
