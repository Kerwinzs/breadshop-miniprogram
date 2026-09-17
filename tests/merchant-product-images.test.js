const assert = require('assert')
const Module = require('module')
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return { DYNAMIC_CURRENT_ENV: 'test', init() {}, database: () => ({ serverDate: () => 'server-date' }) }
  return originalLoad.call(this, request, parent, isMain)
}
const merchant = require('../cloudfunctions/merchant-admin')
Module._load = originalLoad

function jpeg(width, height) {
  const value = Buffer.alloc(23)
  value.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08], 0)
  value.writeUInt16BE(height, 7); value.writeUInt16BE(width, 9)
  return value
}

assert.deepStrictEqual(merchant.jpegSize(jpeg(1280, 1600)), { width: 1280, height: 1600 })
assert.strictEqual(merchant.jpegSize(Buffer.from('not-jpeg')), null)

const valid = 'cloud://cloud1-d9gc800bmc6952073.bucket/product-images/bread/a.jpg'
assert.deepStrictEqual(merchant.patch({ imageUrls: [valid] }, ['imageUrls'], 'product'), { imageUrls: [valid] })
assert.strictEqual(merchant.patch({ imageUrls: Array(6).fill(valid) }, ['imageUrls'], 'product'), null)
assert.strictEqual(merchant.patch({ imageUrls: ['https://example.com/a.jpg'] }, ['imageUrls'], 'product'), null)
assert.strictEqual(merchant.patch({ imageUrls: ['cloud://another-env.bucket/product-images/bread/a.jpg'] }, ['imageUrls'], 'product'), null)
const adminSource = require('fs').readFileSync(require.resolve('../backend/src/App.tsx'), 'utf8')
assert.match(adminSource, /第 1 张图片是商品封面/)
assert.match(adminSource, /可用上移、下移调整图片展示顺序/)
assert.match(adminSource, /顾客端展示预览/)
assert.match(adminSource, /到店自取/)
assert.match(adminSource, /外卖\/邮寄/)
assert.match(adminSource, /values\.detailDesc \|\| values\.desc/)
assert.match(adminSource, /到店自取上架/)
assert.match(adminSource, /外卖\/邮寄上架/)
assert.doesNotMatch(adminSource, /name="enabled" label="上架"/)
assert.match(adminSource, /listingFields\(editing\.isNew \? null : editing, values\.pickupListed === true, values\.deliveryListed === true\)/)
console.log('merchant product image contract tests passed')
