# 用户端数据库设计（CloudBase NoSQL）

## 1. 适用范围

本项目当前使用 CloudBase 传统文档型数据库，通过云函数中的 `wx-server-sdk` 和 `db.collection(...)` 访问；本文中的“表”均指文档集合，不代表已经切换到 SQL/RDB。目标环境为开发环境 `cloud1-d9gc800bmc6952073`。

既有部署记录列出的集合是：`users`、`products`、`stores`、`addresses`、`orders`、`orderStatusHistory`、`feeQuotes`；当前文档不替代对目标环境的线上核验。购物车保存在小程序本地，不创建云端购物车集合。本地方案新增 `productCategories`，但线上尚未创建；`products.category` 仍保留分类名称字符串以兼容旧数据。

金额字段统一使用“分”（整数），例如 `1680` 表示 `¥16.80`。日期字段使用 CloudBase `Date`/服务端时间；接口返回时以实际 SDK 序列化结果为准。所有带 `ownerOpenId` 的数据只能由对应微信用户访问，归属字段由云函数从微信上下文取得，不能接受客户端传入。

## 2. 实体关系

```text
users 1 ── N addresses
users 1 ── N orders
users 1 ── N feeQuotes
products 1 ── N orders.items（订单商品快照，非外键表）
stores 1 ── N orders.storeSnapshot（门店快照）
orders 1 ── N orderStatusHistory
orders.delivery 1 ── 1 feeQuotes（下单时消费报价并复制费用快照）
products.category ── productCategories.name（分类改名时事务同步）
```

订单中的商品、地址、门店和费用必须保存快照，不能依赖下单后商品或地址的变化来重算历史订单。

## 3. 部署记录列出的集合（需线上核验）

### 3.1 `users`

用途：记录完成微信登录的用户。主键为 CloudBase `_id`；业务唯一键为 `openid`。

```json
{
  "_id": "CloudBase文档ID",
  "openid": "由 cloud.getWXContext().OPENID 取得",
  "status": "active",
  "createdAt": "Date",
  "updatedAt": "Date",
  "lastLoginAt": "Date"
}
```

既有部署记录列出 `openid` 唯一索引；CloudBase 默认 `_id` 索引和微信 SDK 相关 `_openid` 索引需以目标环境线上核验。客户端不能指定或修改 `openid`。

### 3.2 `products`

用途：商品、规格、售罄和场景可用性。主键为 `_id`；业务唯一键为 `productId`（建议保持唯一）。

```json
{
  "_id": "CloudBase文档ID",
  "productId": "earl-grey",
  "name": "伯爵茶可颂",
  "desc": "黄油层层酥脆",
  "detailDesc": "商品详情",
  "category": "甜点",
  "categoryIds": ["dessert", "new-arrivals"],
  "artClass": "art-dark",
  "imageUrls": [],
  "priceFen": 1680,
  "deliveryPriceFen": 1880,
  "stockQuantity": 24,
  "soldOut": false,
  "enabled": true,
  "supportsPickup": true,
  "supportsLocalDelivery": true,
  "supportsShipping": true,
  "specs": [
    { "specId": "original", "name": "原味", "extraFeeFen": 0, "enabled": true }
  ],
  "sortOrder": 10,
  "version": 1,
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

`imageUrls` 保存目标 CloudBase 环境中 `product-images/<productId>/` 下的 `cloud://` 文件 ID，最多 5 个；不保存任意 HTTP 外链。图片更新只影响商品目录，不回写 `orders.items` 历史商品快照。

上架语义：`enabled` 是内部兼容总开关；`supportsPickup` 控制到店自取上架，`supportsLocalDelivery` 与 `supportsShipping` 分别控制同城外卖和快递邮寄可售。商家端当前将后两个字段合并为一个“外卖/邮寄上架”开关联动写入，但字段保持独立，为后续拆分配送方式保留能力。有效可售必须同时满足 `enabled !== false` 和当前场景支持字段 `!== false`。旧记录缺少支持字段时按 `true` 兼容；旧记录 `enabled=false` 时所有场景均下架。

价格规则：自取使用 `priceFen`；配送使用 `deliveryPriceFen`（缺失时由服务端回退到 `priceFen`），再加规格 `extraFeeFen`。客户端只提交商品、规格和数量，服务端重新读取商品计算订单金额。`stockQuantity` 是商品级可用库存，必须为非负整数；下单事务会扣减库存，顾客取消仍处于“已下单”的订单时会恢复库存。存量商品没有该字段时按不限制库存处理，以免字段上线时改变既有商品的可售状态；库存为 `0` 的商品不在用户端目录中展示。`soldOut` 仍是商家手动售罄开关。

`specs` 的数组顺序即用户端展示顺序。每个商品至少一项且至少一项启用，`specId` 在商品内唯一，`name` 非空，`extraFeeFen` 为非负整数，`enabled` 表示是否供新的购买选择。用户端目录不下发停用规格，并隐藏无启用规格的异常商品。删除或修改规格不回写 `orders.items` 中的历史快照。

建议索引：`productId` 唯一；`enabled + sortOrder` 用于目录排序。商品集合及具体索引属于既有部署记录，当前仍需以目标环境线上核验。

### 3.3 `stores`

用途：自取门店和营业状态。主键为 `_id`；业务唯一键为 `storeId`。

```json
{
  "_id": "CloudBase文档ID",
  "storeId": "store-yuyuan",
  "name": "愚园路店",
  "addressText": "天山路 79 号",
  "businessHours": "08:00—21:00",
  "status": "open",
  "enabled": true,
  "distanceText": "680m",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

下单时只能选择 `enabled=true` 且 `status=open` 的门店，并把名称、地址和营业时间复制到 `orders.storeSnapshot`。建议 `storeId` 唯一、`enabled + status` 建查询索引。

### 3.4 `addresses`

用途：当前微信用户的配送地址。主键为 `_id`；业务键为用户范围内唯一的 `addressId`。

```json
{
  "_id": "CloudBase文档ID",
  "addressId": "address-001",
  "ownerOpenId": "由云函数取得",
  "contactName": "张女士",
  "phone": "13800000000",
  "province": "山东省",
  "city": "青岛市",
  "district": "崂山区",
  "provinceCode": "370000",
  "cityCode": "370200",
  "districtCode": "370212",
  "detail": "开发测试路9号",
  "postalCode": "266100",
  "isDefault": true,
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

归属规则：所有查询、保存、设默认和删除都必须同时匹配当前微信用户的 `ownerOpenId` 与 `addressId`。保存和设默认使用事务清理同一用户的其他默认地址；删除默认地址时，服务端可将另一条地址设为默认。建议索引：`ownerOpenId + addressId`，以及 `ownerOpenId + isDefault`。

### 3.5 `feeQuotes`

用途：配送报价短期凭证和服务端费用快照。既有部署记录将该集合权限设为 `PRIVATE`；普通客户端不得直接读写，当前权限仍需以目标环境线上核验。只有 `fee`、`order` 云函数通过服务端访问。

```json
{
  "_id": "CloudBase文档ID",
  "quoteId": "quote-001",
  "ownerOpenId": "由云函数取得",
  "addressId": "address-001",
  "deliveryMethod": "local",
  "inputItems": [
    { "productId": "earl-grey", "specId": "original", "quantity": 1 }
  ],
  "items": [
    { "productId": "earl-grey", "specId": "original", "unitPriceFen": 1880, "quantity": 1, "lineTotalFen": 1880 }
  ],
  "addressSnapshot": { "addressId": "address-001", "fullAddress": "山东省青岛市崂山区开发测试路9号" },
  "status": "issued",
  "source": "mock",
  "feeSnapshotVersion": "shipping-required-products-v3",
  "insulationFeeFen": 200,
  "deliveryFeeFen": 600,
  "postageFen": 0,
  "transportFeeFen": 600,
  "subtotalFen": 1880,
  "totalFen": 2680,
  "calculatedAt": "Date",
  "quotedAt": "Date",
  "expiresAt": "Date",
  "consumedAt": null,
  "consumedByOrderRequestId": null,
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

`deliveryMethod` 只能为 `local`（同城外卖）或 `shipping`（快递邮寄）。两种配送方式均不预收固定包装费或运输费，四个费用字段为 `0`，订单合计等于包含本方式三个必拍商品在内的商品小计。local 由零价商品“同城配送费到付”说明运输费用，shipping 由“默认顺丰特快到付”说明。报价必须满足状态 `issued`、版本匹配且未过期；成功下单后在订单事务中变为 `consumed`。既有部署记录列出 `ownerOpenId + quoteId` 唯一索引，当前仍需线上核验。

### 3.6 `orders`

用途：订单主记录、商品/地址/门店/费用快照。主键为 `_id`；业务唯一键为 `orderNo`，幂等键为用户范围内的 `ownerOpenId + clientRequestId`。

```json
{
  "_id": "CloudBase文档ID",
  "orderNo": "B202608180001ABC",
  "ownerOpenId": "由云函数取得",
  "clientRequestId": "req-20260818-001",
  "purchaseScene": "delivery",
  "deliveryMethod": "local",
  "orderStatus": "placed",
  "paymentStatus": "pending",
  "refundStatus": "none",
  "payableAmountFen": 1880,
  "paidAmountFen": 0,
  "refundedAmountFen": 0,
  "paymentExpiresAt": "Date",
  "paidAt": null,
  "stockReleasedAt": null,
  "storeSnapshot": null,
  "addressSnapshot": {
    "addressId": "address-001",
    "contactName": "张女士",
    "phone": "13800000000",
    "province": "山东省",
    "city": "青岛市",
    "district": "崂山区",
    "provinceCode": "370000",
    "cityCode": "370200",
    "districtCode": "370212",
    "detail": "开发测试路9号",
    "postalCode": "266100",
    "isDefault": true,
    "fullAddress": "山东省青岛市崂山区开发测试路9号"
  },
  "items": [
    {
      "productId": "earl-grey",
      "productName": "伯爵茶可颂",
      "specId": "original",
      "specName": "原味",
      "unitPriceFen": 1880,
      "quantity": 1,
      "lineTotalFen": 1880,
      "artClass": "art-dark"
    }
  ],
  "subtotalFen": 1880,
  "insulationFeeFen": 200,
  "deliveryFeeFen": 600,
  "postageFen": 0,
  "totalFen": 2680,
  "feeQuoteSnapshot": {
    "quoteId": "quote-001",
    "status": "ready",
    "source": "mock",
    "feeSnapshotVersion": "shipping-required-products-v3",
    "calculatedAt": "Date",
    "quotedAt": "Date",
    "expiresAt": "Date"
  },
  "createdAt": "Date",
  "updatedAt": "Date",
  "canceledAt": null,
  "completedAt": null
}
```

`purchaseScene` 为 `pickup` 或 `delivery`；配送订单必须有 `deliveryMethod`，自取订单为 `null`。自取订单只保存 `storeSnapshot`，配送订单只保存 `addressSnapshot`。local 与 shipping 订单分别携带本方式三个“拍前必读”真实商品快照，稳定标识为 `local-required-*` 或 `shipping-required-*`，均以 `standard` 规格各 1 件进入 `items`，参与商品小计、订单明细、库存预占和取消回补。每组打包商品使用目录配置价格，到付说明和拍前必读商品由服务端强制零价；pickup 或错误配送方式不允许携带这些商品。新规则下固定费用字段为 0，订单金额由服务端重算：`totalFen = subtotalFen + insulationFeeFen + deliveryFeeFen + postageFen`；历史订单中的非零费用快照保持不变。客户端提交的金额、状态、归属和快照均不可信。

既有部署记录列出 `orderNo` 唯一、`ownerOpenId + clientRequestId` 唯一及 `ownerOpenId + createdAt(desc)` 订单列表索引；实际索引仍需在线上目标环境核验。订单创建、报价消费和首条状态历史在同一事务内完成。

### 3.7 `orderStatusHistory`

用途：订单状态变化的追加记录。主键为 `_id`；按 `orderNo` 关联订单。

```json
{
  "_id": "CloudBase文档ID",
  "orderNo": "B202608180001ABC",
  "fromStatus": null,
  "toStatus": "placed",
  "source": "customer",
  "operatorType": "customer",
  "operatorId": null,
  "reason": "",
  "createdAt": "Date"
}
```

数据库值与页面文案：`placed` 已下单、`preparing` 制作中、`ready_for_pickup` 待自取、`delivering` 配送中、`awaiting_shipment` 待发货、`in_transit` 运输中、`completed` 已完成、`canceled` 已取消。当前用户端只创建已下单历史并执行已下单取消；商家状态推进接口尚未部署。建议索引：`orderNo + createdAt(asc)`，是否存在需线上核验。数据库记录使用 `createdAt`；订单详情 API DTO 将其映射为 `changedAt`，不要混淆存储字段与接口字段。

### 3.8 支付与退款集合（本地契约，线上未创建）

- `paymentTransactions`：支付单事实，稳定 `outTradeNo=P<orderNo>`；建议唯一索引 `outTradeNo`。
- `paymentEvents`：经过验签和金额核对后的通知处理记录；建议唯一索引 `eventId`。
- `refunds`：整单退款事实，稳定 `refundNo=R<orderNo>`；建议唯一索引 `refundNo`。

三个集合必须为 PRIVATE，仅允许受控服务端访问。本轮未创建集合、权限或索引。`orders.paymentStatus/refundStatus` 是查询投影，支付单和退款单才是资金事实源。

新订单必须写入 `paymentRequired=true`。存量订单缺少 `paymentRequired` 且没有显式资金状态时，代码只读映射为 `paymentRequired=false`、`paymentStatus=not_required`；本轮不迁移或覆盖真实订单。worker 重试契约预留 `attemptCount`、`lastErrorCode`、`nextRetryAt`，退款人工重试使用 `retryRequestedAt`，线上字段和索引仍须在部署前核验。

## 4. 设计补充实体（当前未创建）

### 4.1 `productCategories`

用途：商品分类的自由管理、排序和启停。本地代码已实现，线上集合尚未创建：

```json
{
  "_id": "CloudBase文档ID",
  "categoryId": "bread",
  "name": "欧包",
  "sortOrder": 20,
  "enabled": true,
  "version": 1,
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

`categoryId` 是不可修改的稳定标识，建议唯一索引；分类名称由服务端校验唯一，集合权限必须为 `PRIVATE`。`products.category` 继续保存分类名称；改名在同一事务中同步匹配商品，匹配数达到 100 条时拒绝，避免单次查询上限导致部分更新。被商品引用的分类不能删除。

### 4.2 云端购物车（当前未实现）

当前 `pickupCartItems` 与 `deliveryCartItems` 保存在小程序本地，且两者必须独立。若未来需要多端同步，可设计 `carts` 集合，主键为 `_id`，唯一键为 `ownerOpenId + purchaseScene`，商品项仍只保存 `productId/specId/quantity`，价格必须在结算时重新读取。当前不创建、不写入，也不以云端购物车替代现有本地状态。

### 4.3 商家端实体（当前未实现，下一阶段）

`merchantUsers`、`roles`、`permissions`、`auditLogs` 尚未创建，不能在用户端接口或当前验收中使用。商家账号、状态推进、售罄和门店营业操作必须另行设计服务端权限。

## 5. 文档示例数据（仅示例，不执行写入）

以下 JSON 只用于接口/数据库文档测试。它们不是当前 CloudBase 中的真实记录，也不得直接导入开发环境。

```json
{
  "users": [{ "openid": "OPENID_EXAMPLE", "status": "active" }],
  "productCategories": [{ "categoryId": "dessert", "name": "甜点", "sortOrder": 10, "enabled": true }],
  "products": [{
    "productId": "earl-grey", "name": "伯爵茶可颂", "category": "甜点",
    "priceFen": 1680, "deliveryPriceFen": 1880, "soldOut": false,
    "specs": [{ "specId": "original", "name": "原味", "extraFeeFen": 0, "enabled": true }]
  }],
  "stores": [{ "storeId": "store-yuyuan", "name": "愚园路店", "status": "open", "enabled": true }],
  "addresses": [{
    "addressId": "address-example", "ownerOpenId": "OPENID_EXAMPLE",
    "contactName": "测试用户", "phone": "13800000000", "province": "山东省",
    "city": "青岛市", "district": "崂山区", "provinceCode": "370000",
    "cityCode": "370200", "districtCode": "370212", "detail": "示例路1号",
    "postalCode": "266100", "isDefault": true
  }],
  "feeQuotes": [{
    "quoteId": "quote-example", "ownerOpenId": "OPENID_EXAMPLE", "addressId": "address-example",
    "deliveryMethod": "local", "status": "issued", "subtotalFen": 1880,
    "insulationFeeFen": 200, "deliveryFeeFen": 600, "postageFen": 0, "totalFen": 2680
  }],
  "orders": [{
    "orderNo": "B202608180001ABC", "ownerOpenId": "OPENID_EXAMPLE",
    "clientRequestId": "req-example", "purchaseScene": "delivery", "deliveryMethod": "local",
    "orderStatus": "placed", "subtotalFen": 1880, "insulationFeeFen": 200,
    "deliveryFeeFen": 600, "postageFen": 0, "totalFen": 2680,
    "items": [{ "productId": "earl-grey", "specId": "original", "quantity": 1, "unitPriceFen": 1880, "lineTotalFen": 1880 }]
  }],
  "orderStatusHistory": [{ "orderNo": "B202608180001ABC", "fromStatus": null, "toStatus": "placed", "source": "customer" }]
}
```

## 6. 当前未决项

- `productCategories` 和云端购物车尚未在线创建；用户端在分类集合缺失或不可读时从 `products.category` 安全派生分类。
- 报价仍是开发联调 Mock，不代表真实配送费或邮费。
- 商家后台、库存数量、支付、退款、真实物流和状态推进接口不在当前用户端范围。
- T-009 的报价篡改、过期、重复消费、相同 `clientRequestId` 幂等和非 `placed` 取消五项负向回归，以及普通 pickup `INTERNAL_ERROR` 修复，已由用户使用真实微信身份人工确认完成；本文不补写未提供的 trace、错误码或截图，也不得用示例数据替代真实证据。
- 云端 `carts`、`prepareReorder` 和 `advanceMockOrder` 当前均未实现；`productCategories` 仅完成本地代码和文档，尚未部署。
