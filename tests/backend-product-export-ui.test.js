const assert = require('assert')
const fs = require('fs')
const path = require('path')

const app = fs.readFileSync(path.join(__dirname, '../backend/src/App.tsx'), 'utf8')

assert.ok(app.includes('function downloadProductCsv(products: any[])'), '商品页应提供 CSV 导出函数')
assert.ok(app.includes('导出当前筛选'), '商品页应提供导出当前筛选按钮')
assert.match(app, /adminApi\.listProducts\(\{ \.\.\.filters, page, pageSize: 100 \}\)/, '导出应沿用当前筛选并分页读取')
assert.match(app, /while \(all\.length < total\)/, '导出应读取全部匹配商品而非当前页')
for (const heading of ['库存数量', '到店自取上架', '同城外卖上架', '快递邮寄上架', '规格明细', '展示排序']) assert.ok(app.includes(heading), `导出缺少字段：${heading}`)
assert.ok(app.includes("required ? '固定充足'"), '配送必拍商品库存应以固定充足导出')
assert.ok(app.includes('一键上架当前筛选'), '商品页应提供当前筛选批量上架')
assert.ok(app.includes('一键下架当前筛选'), '商品页应提供当前筛选批量下架')
assert.match(app, /匹配 \$\{result\.matchedCount\} 件，已更新 \$\{result\.updatedCount\} 件/, '批量结果应反馈匹配和更新数量')

console.log('backend product export UI contract passed')
