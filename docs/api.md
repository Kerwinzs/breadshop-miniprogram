# 用户端后端接口说明

## 1. 约定

小程序通过 `wx.cloud.callFunction` 调用 CloudBase 云函数，目标环境为 `cloud1-d9gc800bmc6952073`。统一响应格式：

```json
{ "ok": true, "data": {} }
```

失败格式：

```json
{ "ok": false, "error": { "code": "ERROR_CODE", "message": "中文错误说明" } }
```

所有接口（包括 `auth.login`）都要求真实微信身份上下文。`auth.login` 是身份引导动作，但仍由云函数从 `cloud.getWXContext().OPENID` 取得身份；其他接口还要求小程序侧已完成登录状态。服务端不接受客户端传入的 `openid`、价格、订单状态或金额。页面可在云端不可用时降级浏览本地目录和本地购物车，但下单、地址、报价和订单查询必须经过云函数。商家后台独立使用受商家令牌保护的 `merchant-admin`；其中 `getDashboardSummary` 与 `listOrders` 的 `queue`/`sort` 仅供后台只读使用，具体契约见 `docs/admin.md`，不面向小程序用户端。

金额字段均为“分”整数，页面再格式化为人民币两位小数。支付接口已部署到开发环境且服务端配置健康检查通过，但 `PAYMENT_ENABLED` 仍关闭，尚未完成真实资金回归；余额、部分退款、真实配送和真实邮费仍不提供。支付与退款详细边界见 `docs/payment.md`。

## 2. 身份与登录

### `auth` / `login`

用途：从微信上下文创建或更新 `users` 记录。

请求：

```json
{ "action": "login" }
```

成功数据示例：

```json
{ "userId": "CloudBase文档ID", "status": "authenticated", "isNew": false }
```

失败：无微信身份时返回 `AUTH_REQUIRED`；未知动作返回 `INVALID_INPUT`。接口不返回 OpenID 给页面使用，也不获取头像和昵称。

## 3. 首页、商品列表和详情

首页使用目录接口加载推荐商品和门店，场景选择和购物车状态由小程序本地管理。用户必须先选择“到店自取”或“外卖/邮寄”；配送场景另有 `local` 同城外卖和 `shipping` 快递邮寄。

### `catalog` / `listHomeRecommendations`

请求：`{ "action": "listHomeRecommendations" }`。成功数据为 `{ "products": [...] }`，严格按照商家设置的 `homeRecommendOrder` 返回最多 6 件商品。已下架、库存为零或没有启用规格的商品不会返回；未设置时返回空数组。推荐项保留三种场景可用性，首页据此只提供商品实际支持的购买入口。

### `catalog` / `listProducts`

请求：

```json
{ "action": "listProducts" }
```

成功数据：`{ "products": [...] }`。商品 DTO 至少包含 `productId`、名称、描述、分类、`priceFen`、`deliveryPriceFen`、`soldOut`、三种场景可用性和 `specs`。页面按当前购买场景选择价格和可用性；客户端不能以目录价格直接创建订单。

### `catalog` / `getProduct`

请求：

```json
{ "action": "getProduct", "productId": "earl-grey" }
```

成功数据：`{ "product": {...} }`。不存在或未启用返回 `PRODUCT_NOT_FOUND`；标识无效返回 `INVALID_INPUT`。

### `catalog` / `listStores`

请求：

```json
{ "action": "listStores" }
```

成功数据：`{ "stores": [...] }`，包含 `storeId`、名称、地址、营业时间、`status` 和距离文案。首页和自取商品列表使用它选择门店。

### `catalog` / `getStore`

请求：

```json
{ "action": "getStore", "storeId": "store-yuyuan" }
```

成功数据：`{ "store": {...} }`。不存在或未启用返回 `STORE_NOT_FOUND`。创建自取订单时服务端还会再次校验门店为营业状态，否则返回 `STORE_CLOSED`。

## 4. 购物车

购物车没有云函数接口。小程序本地分别保存：

- `pickupCartItems`：到店自取购物车；
- `deliveryCartItems`：配送购物车，同城外卖和快递邮寄共用。

购物车项只应保存 `productId`、`specId`、数量以及用于展示的本地快照。增减、删除、全选、清空和场景切换均在本地完成；进入结算时，云端报价/下单函数会重新读取商品和规格。下单成功只清空已提交的对应场景购物车，另一场景不受影响。

## 5. 地址管理

所有地址动作都调用 `address` 云函数，并自动按当前微信身份过滤。

### `address` / `listAddresses`

```json
{ "action": "listAddresses" }
```

成功数据：`{ "addresses": [...] }`，每项包含 `id`（即业务 `addressId`）、联系人、手机号、省市区、编码、详细地址、邮编和 `isDefault`。

### `address` / `saveAddress`

新增时省略或传空 `addressId`；编辑时传已有地址 ID。地址字段放在 `address` 对象中：

```json
{
  "action": "saveAddress",
  "addressId": "address-001",
  "address": {
    "contactName": "张女士", "phone": "13800000000",
    "province": "山东省", "city": "青岛市", "district": "崂山区",
    "provinceCode": "370000", "cityCode": "370200", "districtCode": "370212",
    "detail": "开发测试路9号", "postalCode": "266100", "isDefault": true
  }
}
```

成功数据：`{ "address": {...} }`。首条地址自动成为默认；同一用户最多一条默认地址。字段不完整或手机号格式不合法返回 `ADDRESS_INCOMPLETE`。

### `address` / `setDefaultAddress`

```json
{ "action": "setDefaultAddress", "addressId": "address-001" }
```

成功返回 `{ "ok": true, "data": { "address": {...} } }`；地址不属于当前用户或不存在返回 `ADDRESS_NOT_FOUND`。

### `address` / `deleteAddress`

```json
{ "action": "deleteAddress", "addressId": "address-001" }
```

成功返回 `{ "addressId": "address-001" }`。删除默认地址时服务端会在同一用户的其他地址中选择替代默认地址；不存在返回 `ADDRESS_NOT_FOUND`。订单中的地址快照不会被删除影响。

## 6. 费用报价

### `fee` / `quote`

配送结算前调用，报价由服务端重新读取地址、商品和规格，并写入 `feeQuotes`。该集合的 PRIVATE 权限属于既有部署记录，当前文档不替代线上权限核验。

请求：

```json
{
  "action": "quote",
  "deliveryMethod": "local",
  "addressId": "address-001",
  "items": [{ "productId": "earl-grey", "specId": "original", "quantity": 1 }]
}
```

成功数据：

```json
{
  "status": "ready", "quoteId": "quote-...", "deliveryMethod": "local",
  "insulationFeeFen": 0, "deliveryFeeFen": 0, "postageFen": 0,
  "transportFeeFen": 0, "subtotalFen": 2080, "totalFen": 2080,
  "source": "mock", "feeSnapshotVersion": "delivery-required-products-v4",
  "calculatedAt": "Date", "quotedAt": "Date", "expiresAt": "Date", "items": []
}
```

`local` 与 `shipping` 均不预收固定包装费或运输费：`insulationFeeFen=0`、`deliveryFeeFen=0`、`postageFen=0`、`transportFeeFen=0`，`totalFen=subtotalFen`。两种方式的 `items` 都必须包含本方式三个“拍前必读”真实商品（`standard` 规格、各 1 件），并且至少包含一件非必拍普通商品；只有固定必拍商品时 `createOrder` 返回 `DELIVERY_REGULAR_ITEM_REQUIRED`。local 使用 `local-required-packaging`、`local-required-delivery-collect`、`local-required-notice`，shipping 使用 `shipping-required-packaging`、`shipping-required-sf-collect`、`shipping-required-notice`。打包商品按目录配送价计入小计，到付说明和拍前必读商品服务端强制零价；pickup 或错误配送方式不得携带这些特殊商品。两种方式均要求完整有效且支持对应配送方式的收货地址；地址不支持当前方式时返回 `ADDRESS_UNAVAILABLE_FOR_METHOD`。必拍项缺失、数量/规格错误或混入另一方式时返回 `DELIVERY_REQUIRED_ITEM_MISMATCH` 或 `DELIVERY_REQUIRED_ITEM_NOT_ALLOWED`，分类异常返回 `SHIPPING_REQUIRED_ITEM_INVALID`。客户端不能直接修改报价金额。

## 7. 下单

### `order` / `configurationStatus`

请求：`{ "action": "configurationStatus" }`。仅返回 `{ "paymentEnabled": true|false }`，用于在不读取完整函数环境变量的情况下核验支付灰度开关；不返回任何配置值或密钥。

### `order` / `createOrder`

#### 到店自取

```json
{
  "action": "createOrder",
  "clientRequestId": "req-unique-001",
  "purchaseScene": "pickup",
  "storeId": "store-yuyuan",
  "items": [{ "productId": "earl-grey", "specId": "original", "quantity": 1 }]
}
```

#### 配送

```json
{
  "action": "createOrder",
  "clientRequestId": "req-unique-002",
  "purchaseScene": "delivery",
  "deliveryMethod": "local",
  "addressId": "address-001",
  "feeQuoteId": "quote-...",
  "items": [{ "productId": "earl-grey", "specId": "original", "quantity": 1 }]
}
```

服务端重新读取商品/规格、门店或地址，校验场景可用性并计算金额。配送订单还必须匹配同一用户、地址、配送方式、商品快照、地址快照、报价版本和有效期；成功后在事务中消费报价、写订单和首条 `orderStatusHistory`。

成功数据：`{ "order": {...}, "duplicate": false }`；相同用户和 `clientRequestId` 已成功下单时返回原订单并标记 `duplicate: true`，不会产生第二条订单。履约状态固定为 `placed`，资金状态为 `pending`，支付期限为创建后 15 分钟。只有服务端确认支付成功后才允许进入制作。

支付灰度开关 `PAYMENT_ENABLED` 未严格设为 `true` 时，新订单临时按 `paymentRequired=false`、`paymentStatus=not_required` 创建，以保护尚未升级的客户端；支付全链路验收后才开启。该开关仅为部署保护，不改变已确认的最终产品规则。

常见失败：`FEE_QUOTE_REQUIRED`、`FEE_QUOTE_NOT_FOUND`、`FEE_QUOTE_EXPIRED`、`FEE_QUOTE_USED`、`FEE_QUOTE_MISMATCH`、`STORE_NOT_FOUND`、`STORE_CLOSED`、`ADDRESS_NOT_FOUND`、`PRODUCT_SOLD_OUT`、`SPEC_NOT_FOUND`、`INVALID_INPUT`。

## 8. 支付（开发环境已部署，总开关未启用）

### `payment` / `configurationStatus`

请求：`{ "action": "configurationStatus" }`。仅返回 `{ "configured": true|false }`，用于验证服务端支付配置的存在性和结构，不返回环境变量名称、商户信息、密钥、证书或其他敏感内容。

### 商家支付配置健康检查

- `merchant-auth / configurationStatus` 仅返回 `authConfigured` 和 `paymentPermissionsReady`，后者要求 `payments.read`、`refunds.create`、`refunds.retry` 全部存在。
- `merchant-admin / configurationStatus` 仅返回 `refundQueueEnabled`，严格检查退款请求模式是否为 `queue`。
- 两个动作均不得返回账号、密码哈希、令牌密钥、完整权限列表或环境变量内容。

### `payment` / `createPayment`

请求：`{ "action": "createPayment", "orderNo": "B..." }`。服务端验证订单归属、待支付状态和 15 分钟期限后创建或复用稳定的 `outTradeNo=P<orderNo>`。配置完整时返回小程序支付参数；缺配置返回 `PAYMENT_NOT_CONFIGURED`。

### `payment` / `queryPayment`

请求：`{ "action": "queryPayment", "orderNo": "B..." }`。返回订单的 `paymentStatus`、`refundStatus`、应付/实付/退款金额及支付期限。客户端 `wx.requestPayment` 成功回调不是到账事实，必须继续查询服务端状态。

### `payment` / `closeExpiredPayment`

只关闭超过 15 分钟且仍为 `pending` 的所属订单，并幂等释放库存。本地 worker 会在释放库存前主动查单，并在渠道关单后复查；支付成功优先，未知状态进入重试，不直接释放库存。真实 HTTP 适配器和定时触发器尚未配置。

支付/退款通知必须通过保留原始报文和签名请求头的受控 HTTP 入口处理；当前云函数 action 明确拒绝直接模拟通知。

公开回调入口为 `POST /wechatpay/payment` 与 `POST /wechatpay/refund`，由 HTTP 网关转发至 Event 函数 `payment-notify` 的 `http.main`。只有完成 `Wechatpay-*` 验签、AES-GCM 解密、商户身份与金额核对后才返回成功确认。两条路由已在开发环境部署；真实商户配置和有效签名正向验证尚未完成。

内部 `payment-worker` 支持 `reconcile`、`expire`、`refund`、`all`，仅供服务端调度并要求 HMAC 签名，不属于用户端公开 API。存量无资金字段订单投影为 `paymentRequired=false`、`paymentStatus=not_required`，不允许发起支付，但仍可按历史流程履约。

## 9. 订单列表和详情

### `order` / `listOrders`

```json
{ "action": "listOrders" }
```

成功数据：`{ "orders": [...] }`，只返回当前微信用户的订单，按创建时间倒序。当前页面已实现按 `purchaseScene` 筛选；`deliveryMethod` 和 `orderStatus` 筛选属于 PRD/后续页面能力，当前未实现。

### `order` / `getOrder`

```json
{ "action": "getOrder", "orderNo": "B202608180001ABC" }
```

成功数据：`{ "order": {..., "statusHistory": [...] } }`。订单 DTO 不暴露 `ownerOpenId`、内部 `_id` 或操作人 ID；不存在或不属于当前用户返回 `ORDER_NOT_FOUND`。

商家后台打印不新增接口：详情打印使用 `merchant-admin/getOrder`；按筛选导出使用 `merchant-admin/listOrders` 的分页结果。配送敏感信息仅来自服务端在 `orders.address.read` 权限下返回的 `addressSnapshot`，前端不得另查地址集合；打印时权限不足或姓名、电话、完整地址缺失即禁止，导出时无权查看的敏感列留空。

商家后台 `merchant-admin/listOrders` 额外接受可选的 `orderStartDate`、`orderEndDate`（`YYYY-MM-DD`），并可与 `queue`、`orderStatus`、`purchaseScene`、`deliveryMethod`、`keyword` 组合使用。服务端按 Asia/Shanghai 自然日校验和筛选 `createdAt`：开始日期从当天 00:00 起包含，结束日期到次日 00:00 前；格式无效或开始日期晚于结束日期返回 `INVALID_INPUT`。分页与导出复用相同参数，不新增 action。

状态流：自取 `placed → preparing → ready_for_pickup → completed`；同城 `placed → preparing → delivering → completed`；快递 `placed → preparing → awaiting_shipment → in_transit → completed`。当前用户端没有真实状态推进接口。

## 10. 取消订单与商家商品接口补充

## 商家端商品分类与描述

`merchant-admin` 的 `listProductCategories` 返回 `{ categories: [{ categoryId, name, sortOrder, enabled, version }] }`。`createProductCategory` 接受 `{ categoryId, category: { name, sortOrder, enabled } }`；`saveProductCategory` 接受 `{ categoryId, version, category }`，支持改名、排序和启停；`deleteProductCategory` 接受 `{ categoryId }`。读取复用 `products.read`，新增/修改复用 `products.write`，删除复用 `products.delete`。

分类名称和 `categoryId` 不可重复；改名在事务内同步所有匹配的 `products.category`，匹配到 100 条时返回 `CATEGORY_TOO_MANY_PRODUCTS` 并整体拒绝。被商品引用时删除返回 `CATEGORY_IN_USE`。其他常见错误：`CATEGORY_EXISTS`、`CATEGORY_NAME_EXISTS`、`CATEGORY_NOT_FOUND`、`CATEGORY_UNAVAILABLE`、`VERSION_CONFLICT`。

`createProduct` / `saveProduct` 接受 `products.categoryIds`，必须选择 1–2 个不重复且已启用的分类 ID；服务端同时维护 `category` 首分类名称以兼容旧客户端。返回 DTO 增加 `categoryIds` 和 `categoryNames`，商品在任一所属分类筛选中均可见。`desc` 最多 80 字，`detailDesc` 最多 500 字。

`bulkSetProductListing` 需要 `products.write`，接受 `{ keyword?, category?, listed }`，筛选口径与 `listProducts` 一致。普通商品在同一事务中同时更新 `enabled`、`supportsPickup`、`supportsLocalDelivery`、`supportsShipping`；`listed=true` 表示两端全部上架，`false` 表示两端全部下架。固定配送必拍商品不改变 local-only/shipping-only 语义并计入 `skippedRequiredCount`。成功返回 `{ listed, matchedCount, updatedCount, skippedRequiredCount }`；超过单次安全处理上限返回 `TOO_MANY_PRODUCTS`，不允许部分更新。
`bulkSetProductSoldOut` 需要 `products.toggleSoldOut`，接受 `{ keyword?, categoryId?, soldOut }`，沿用当前商品关键词和分类筛选；普通商品在同一事务中批量更新 `soldOut` 并递增版本，固定配送必拍商品跳过。成功返回 `{ soldOut, matchedCount, updatedCount, skippedRequiredCount }`，同时写入 `products.bulkSoldOut.write` 审计记录；超过安全上限时整体拒绝，不允许部分更新。

新版小程序调用 `catalog/listProducts` 和 `catalog/getProduct` 时携带 `purchaseScene: pickup|delivery`，配送场景同时携带 `deliveryMethod: local|shipping`。目录只返回 `enabled !== false` 且当前场景支持字段未关闭的商品，并同时返回当次商品对应的已启用分类名称数组 `categories`；分类集合缺失或不可读时从当次商品安全派生。为兼容小程序审核发布窗口，旧客户端不传 `purchaseScene` 时继续按既有行为返回全部全局启用商品；传 `delivery` 但暂缺 `deliveryMethod` 时返回至少支持一种配送方式的商品。非法场景、或自取场景夹带配送方式返回 `INVALID_INPUT`；详情在指定场景下架返回 `PRODUCT_NOT_FOUND`。待新版小程序覆盖率满足升级要求后，才能另行评估收紧参数，当前不得直接改为必填。该方案尚未部署。

`specs` 必须至少包含一项且至少有一项 `enabled !== false`；每项包含商品内唯一的 `specId`、非空 `name`、非负整数分 `extraFeeFen` 和布尔值 `enabled`。商家端会传入 `version` 做乐观并发校验；规格修改只影响后续报价，不改动历史订单快照。`catalog` 只向用户端下发已启用规格；无已启用规格的异常存量商品不进入列表，详情请求返回 `PRODUCT_NOT_FOUND`。

## 商家端商品图片

### `merchant-admin` / `uploadProductImage`

需要 `products.write`。请求包含 `productId` 和商家端等比压缩后的 `image: { dataUrl, width, height }`。`dataUrl` 必须是 JPEG，最大 1MB；实际宽高均为 600–1600px，宽高比为 0.6–1.8。服务端不信任声明尺寸，会解析 JPEG 内容重新校验，然后写入 `product-images/<productId>/`。

成功返回 `{ "fileID": "cloud://..." }`。常见失败：`INVALID_IMAGE`、`INVALID_IMAGE_FORMAT`、`INVALID_IMAGE_DIMENSIONS`、`IMAGE_TOO_LARGE`、`IMAGE_UPLOAD_FAILED`。`createProduct` / `saveProduct` 的 `imageUrls` 最多 5 个，且只接受目标环境的 `cloud://.../product-images/` 文件 ID。该接口只实现在本地代码中，尚未部署。

### `merchant-admin` / 页面内容配置

`getPageConfiguration`（`products.read`）读取 `home` 或 `profile` 页面配置；`savePageConfiguration`（`products.write`）按 `version` 乐观并发保存标注区域文案和 CloudBase 图片文件 ID；`uploadPageContentImage`（`products.write`）接收 JPEG 图片并写入 `page-content/{pageId}/{timestamp}-{sha}.jpg`。服务端校验压缩后 ≤1MB、宽高 600–1600px、宽高比 0.6–1.8。用户端通过 `catalog/getPageConfiguration` 读取，集合缺失或无记录时回退默认内容。

### `order` / `cancelOrder`

```json
{ "action": "cancelOrder", "orderNo": "B202608180001ABC" }
```

制作开始前可取消。未支付订单写入 `orderStatus=canceled`、`paymentStatus=closed` 并幂等释放库存；已支付订单写入 `orderStatus=canceled`、`refundStatus=pending` 并创建稳定的整单退款请求 `refundNo=R<orderNo>`。退款成功或失败由独立通知更新，并由 `payment-worker` 定时主动查询 `processing` 退款作为补偿；查询结果必须校验退款单号和金额后，才能同步更新退款记录与订单。取消接口不得直接宣称退款成功。

## 11. 再来一单

当前没有 `prepareReorder` 或其他云函数接口。订单详情页只有已完成订单显示“再来一单”，由小程序读取订单商品快照和本地目录，检查商品是否仍启用、未售罄且支持原场景，再把可用商品加入对应的本地购物车；配送订单沿用原 `deliveryMethod`。不可用商品只提示，不修改云端订单。若未来需要云端校验，必须另行设计接口和权限，不能把本地逻辑描述成已部署 API。

## 12. 页面流程到接口映射

| 页面/流程 | 主要接口 | 关键规则 |
| --- | --- | --- |
| 首页 | `auth.login`、`catalog.listProducts`、`catalog.listStores` | 场景选择和入口状态在本地；未选场景不能混用购物车 |
| 自取商品列表 | `catalog.listProducts`、`catalog.getStore` | 只展示支持自取且未售罄商品 |
| 配送商品列表 | `catalog.listProducts`、地址读取、`fee.quote`（结算前） | `local`/`shipping` 切换保留配送购物车，重新报价 |
| 商品详情 | `catalog.getProduct` | 规格必选；加购只写对应本地购物车 |
| 购物车 | 无云函数（本地） | 自取与配送购物车独立；费用以结算报价为准 |
| 地址页 | `address.listAddresses`、`saveAddress`、`setDefaultAddress`、`deleteAddress` | 归属由微信身份确定 |
| 确认订单 | `fee.quote`、`order.createOrder`、`payment.createPayment`、`payment.queryPayment` | 配送必须携带有效 `feeQuoteId`；金额由服务端重算；只有服务端确认已支付才清购物车 |
| 支付结果 | `payment.queryPayment` | 客户端回调不作为到账事实；待确认、失败或取消时保留购物车 |
| 订单 Tab | `order.listOrders` | 只读当前用户订单 |
| 订单详情 | `order.getOrder`、`order.cancelOrder`（可取消时） | 仅 `placed` 可取消，完成订单可本地再来一单 |
| 个人中心/门店 | `catalog.listStores`、`catalog.getStore` | 门店营业状态由服务端下单时再次校验 |

## 13. 错误码与边界

常用错误码包括：`AUTH_REQUIRED`、`INVALID_INPUT`、`PRODUCT_NOT_FOUND`、`PRODUCT_SOLD_OUT`、`SPEC_NOT_FOUND`、`PRODUCT_UNAVAILABLE_FOR_SCENE`、`STORE_NOT_FOUND`、`STORE_CLOSED`、`ADDRESS_NOT_FOUND`、`ADDRESS_INCOMPLETE`、`DELIVERY_METHOD_UNSUPPORTED`、`FEE_UNAVAILABLE`、`FEE_QUOTE_REQUIRED`、`FEE_QUOTE_NOT_FOUND`、`FEE_QUOTE_EXPIRED`、`FEE_QUOTE_USED`、`FEE_QUOTE_MISMATCH`、`ORDER_NOT_FOUND`、`ORDER_CANNOT_CANCEL`、`CATALOG_UNAVAILABLE`、`INTERNAL_ERROR`。

统一边界：缺少真实微信身份上下文返回 `AUTH_REQUIRED`；未知或非法 action/参数返回 `INVALID_INPUT`；目录读取异常返回 `CATALOG_UNAVAILABLE`；地址、登录和订单等未细分的服务端异常返回 `INTERNAL_ERROR`。具体业务错误优先使用对应领域错误码。

当前本地支付基础不支持：真实商户调用、支付/退款通知 HTTP 入口、主动查单、超时定时扫描、退款 worker、部分退款、余额、真实配送/邮费和远程购物车同步。任何线上启用都需要同步权限、索引、密钥托管和部署记录。
