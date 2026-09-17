# 面包坊小程序后端设计（第一版）

> 状态：用户端第一版云端闭环和商家后台已有历史部署；支付模块于 2026-09-03 进入本地开发，尚未部署。  
> 云环境：只使用 CloudBase 传统文档型“云数据库”；目标 EnvId：`cloud1-d9gc800bmc6952073`。  
> 范围：微信登录、商品与门店、云端地址、云端订单、费用报价、商家后台，以及支付/整单退款本地基础；暂不启用真实资金、真实配送或真实邮费。支付细节见 `docs/payment.md`。

## 1. 已确认的实现边界

- 数据库只使用 CloudBase 传统文档型“云数据库”，云函数通过 `wx-server-sdk` 的 `db.collection(...)` 访问。
- 用户需要微信登录，但不获取头像和昵称。
- 联系电话由用户在地址中手动填写。
- 不迁移当前本地测试地址、购物车和订单。
- 商品和门店第一版由开发人员在云开发控制台维护。
- 商品图片第一版继续使用小程序本地资源，暂不创建云存储文件。
- 第一版云函数使用 JavaScript。
- 当前 `cloud1` 仅用于开发和测试；正式上线前创建独立生产环境，测试订单不进入生产环境。
- 购物车继续保存在本地；下单成功后才清空对应场景购物车。
- 云端保存用户、地址、订单、订单商品快照、费用快照和状态历史。
- 订单商品直接嵌入订单，不单独建立订单明细集合。
- 商品第一版只使用“是否售罄”，不实现库存数量、扣减和库存流水。
- 开发环境可以保留受限的 Mock 状态推进；生产环境不能显示或开放该入口。
- 费用模块已实现统一报价窗口和服务端报价绑定；当前报价仍是开发联调 Mock，真实配送费、邮费和服务商以后再决定。
- 最终必须有店员可操作的商家后台；第一版使用电脑浏览器网页。
- 商家后台第一版至少处理登录、订单查看、订单状态推进、商品售罄/恢复销售和门店营业/休息。
- 暂不做销售报表、库存数量、财务、配送员和复杂营销。
- 第一版暂不拆分管理员和店员，先使用一个商家操作角色；保留 `roleId` 和权限集合，后续再拆分。
- 商家后台第一版使用账号密码登录；密码只能保存服务端哈希，不能保存明文。

## 2. 数据库集合

用户端基础阶段已创建以下集合：

```text
users
products
stores
addresses
orders
orderStatusHistory
feeQuotes
```

购物车仍保存在小程序本地；当前不创建支付、库存、物流轨迹、商家账号或商家履约集合。

商家后台仍需预留以下集合，尚未创建：

```text
merchantUsers
roles
permissions
orderStatusHistory
auditLogs
```

### 2.1 `users`

用途：记录已经通过微信登录进入系统的用户。

```js
{
  _id: '云数据库文档 ID',
  openid: '由云函数登录上下文取得，不接受客户端传入',
  status: 'active',
  createdAt: Date,
  updatedAt: Date,
  lastLoginAt: Date
}
```

规则：

- 不保存头像和昵称。
- `openid` 只由云函数从微信上下文获取，客户端不能指定其他用户身份。
- 每个微信用户只保留一条用户记录。

### 2.2 商家后台身份与权限（预留）

商家后台不能复用普通用户的权限。建议预留以下边界：

`merchantUsers`

```js
{
  _id: '云数据库文档 ID',
  loginType: 'password',
  accountRef: '与登录方式对应的账号标识',
  displayName: '店员显示名',
  roleId: 'merchant_operator',
  status: 'active',
  lastLoginAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

`roles`

```js
{
  roleId: 'merchant_operator', // 后续可拆分为 admin | staff
  name: '商家操作员',
  permissionIds: ['orders.read', 'orders.advance'],
  enabled: true
}
```

`permissions`

第一版建议至少预留：

```text
orders.read
orders.advance
products.read
products.toggleSoldOut
stores.read
stores.toggleOpen
auditLogs.read
merchantUsers.manage
```

第一版不拆分管理员和店员；以后如果需要拆分，只需增加角色记录、分配权限并调整后台菜单和服务端校验，不需要重做订单、商品和门店数据模型。权限必须由服务端校验，不能只依赖网页隐藏按钮。

### 2.3 `products`

用途：保存可售商品及规格。页面展示字段可以在现有 Mock 基础上逐步扩展。

```js
{
  _id: '云数据库文档 ID',
  productId: 'earl-grey',
  name: '伯爵茶可颂',
  desc: '黄油层层酥脆',
  detailDesc: '商品详情',
  category: '甜点',
  artClass: 'art-dark',
  imageUrls: [],
  priceFen: 1680,
  deliveryPriceFen: 1880,
  soldOut: false,
  enabled: true,
  supportsPickup: true,
  supportsLocalDelivery: true,
  supportsShipping: true,
  specs: [
    {
      specId: 'original',
      name: '原味',
      extraFeeFen: 0,
      enabled: true
    }
  ],
  sortOrder: 10,
  version: 1,
  createdAt: Date,
  updatedAt: Date
}
```

说明：

- 当前代码中的 `supportsLocal` 同时承担自取和同城配送含义，云端模型将其拆成 `supportsPickup` 和 `supportsLocalDelivery`，避免歧义。
- 页面适配层负责把云端字段转换成当前页面可使用的字段；不要让页面直接依赖数据库文档格式。
- 商品价格和规格加价由云端决定，创建订单时重新读取并计算。

### 2.4 `stores`

用途：保存门店和自取能力。当前虽然只有一家店，仍保留稳定的 `storeId`。

```js
{
  _id: '云数据库文档 ID',
  storeId: 'store-yuyuan',
  name: '愚园路店',
  address: {
    province: '山东省',
    city: '青岛市',
    district: '崂山区',
    detail: '详细地址'
  },
  businessHours: '08:00—21:00',
  status: 'open',
  enabled: true,
  createdAt: Date,
  updatedAt: Date
}
```

第一版 `status` 只使用：

```text
open
closed
```

### 2.5 `addresses`

用途：保存当前登录用户的收货地址。

```js
{
  _id: '云数据库文档 ID',
  addressId: '稳定业务 ID',
  ownerOpenId: '由云函数写入',
  contactName: '张女士',
  phone: '13800000000',
  province: '山东省',
  city: '青岛市',
  district: '崂山区',
  provinceCode: '370000',
  cityCode: '370200',
  districtCode: '370212',
  detail: '详细地址',
  postalCode: '',
  isDefault: true,
  createdAt: Date,
  updatedAt: Date
}
```

规则：

- 用户只能读取和修改自己的地址。
- 默认地址切换要保证同一个用户最多只有一个默认地址。
- `supportsLocal` 和 `supportsShipping` 不作为用户可编辑字段。
- 地址是否支持当前配送方式，由费用报价窗口根据地址和配送规则计算。

### 2.6 `orders`

用途：保存完整订单、商品快照、地址或门店快照、费用快照和状态变化。

```js
{
  _id: '云数据库文档 ID',
  orderNo: '服务端生成的订单号',
  ownerOpenId: '由云函数写入',
  clientRequestId: '客户端本次下单的唯一请求 ID',

  purchaseScene: 'pickup', // pickup | delivery
  deliveryMethod: null,    // null | local | shipping
  orderStatus: 'placed',

  storeSnapshot: {
    storeId: 'store-yuyuan',
    name: '愚园路店',
    addressText: '完整门店地址',
    businessHours: '08:00—21:00'
  },

  addressSnapshot: null,

  items: [
    {
      productId: 'earl-grey',
      productName: '伯爵茶可颂',
      specId: 'original',
      specName: '原味',
      unitPriceFen: 1680,
      quantity: 2,
      lineTotalFen: 3360,
      artClass: 'art-dark'
    }
  ],

  subtotalFen: 3360,
  insulationFeeFen: 0,
  deliveryFeeFen: 0,
  postageFen: 0,
  totalFen: 3360,

  feeQuoteSnapshot: {
    status: 'ready',
    source: 'mock',
    message: '',
    quotedAt: Date,
    expiresAt: null
  },

  statusHistory: [
    {
      from: null,
      to: 'placed',
      source: 'customer',
      operatorId: null,
      changedAt: Date
    }
  ],

  createdAt: Date,
  updatedAt: Date,
  canceledAt: null,
  completedAt: null
}
```

规则：

- `clientRequestId` 用于防止用户连续点击产生重复订单。
- 客户端只提交 `productId`、`specId`、`quantity`、购买场景、门店或地址 ID，不提交可信价格。
- 云函数重新读取商品、规格、门店和地址，校验可用性并计算金额。
- `items`、`storeSnapshot`、`addressSnapshot` 和费用字段创建后作为订单快照保存。
- 自取订单的 `addressSnapshot` 为 `null`；配送订单的 `storeSnapshot` 可以为 `null`。
- 未知配送费或邮费不能以零元订单提交；只有费用状态为 `ready` 才允许创建配送订单。

### 2.7 订单状态和审计记录（预留）

`orderStatusHistory` 用于记录每次订单状态变化：

```js
{
  _id: '云数据库文档 ID',
  orderNo: '订单号',
  fromStatus: 'placed',
  toStatus: 'preparing',
  operatorType: 'merchant', // customer | merchant | system
  operatorId: '操作者 ID',
  reason: '',
  createdAt: Date
}
```

`auditLogs` 用于记录商品售罄、门店营业状态、权限和其他商家操作：

```js
{
  _id: '云数据库文档 ID',
  actorId: '操作者 ID',
  actorRole: 'admin',
  action: 'products.toggleSoldOut',
  targetType: 'product',
  targetId: 'earl-grey',
  before: {},
  after: {},
  createdAt: Date
}
```

在商家后台启用后，这两个集合应作为追加记录保存，不能由客户端直接修改或删除。

## 3. 订单状态

数据库使用稳定英文状态，页面再转换为中文：

| 数据库存储值 | 页面文案 |
| --- | --- |
| `placed` | 已下单 |
| `preparing` | 制作中 |
| `ready_for_pickup` | 待自取 |
| `delivering` | 配送中 |
| `awaiting_shipment` | 待发货 |
| `in_transit` | 运输中 |
| `completed` | 已完成 |
| `canceled` | 已取消 |

合法流转：

```text
自取：placed → preparing → ready_for_pickup → completed
同城：placed → preparing → delivering → completed
快递：placed → preparing → awaiting_shipment → in_transit → completed
```

只有 `placed` 可以由用户取消为 `canceled`。任何状态修改都必须由云函数校验，客户端不能直接写订单状态。

## 4. 费用报价窗口

统一请求：

```js
{
  deliveryMethod: 'local',
  addressId: 'address-001',
  items: [
    { productId: 'earl-grey', specId: 'original', quantity: 2 }
  ]
}
```

统一响应：

```js
{
  status: 'ready',
  deliveryMethod: 'local',
  insulationFeeFen: 200,
  deliveryFeeFen: 600,
  postageFen: null,
  transportFeeFen: 600,
  subtotalFen: 3360,
  totalFen: 4160,
  message: '',
  source: 'mock',
  quoteId: null,
  expiresAt: null
}
```

支持的状态：

```text
ready
missingAddress
incompleteAddress
outOfRange
unsupportedMethod
feeUnavailable
```

当前仍使用 Mock 费用，但由云函数返回并持久化到 PRIVATE `feeQuotes`；每条报价包含服务端生成的 `quoteId` 和 `expiresAt`，订单只接受同一用户、地址、配送方式和商品快照匹配且未消费的报价。以后接入真实服务时保留相同响应结构并替换报价来源。

## 5. 云函数边界

第一版建议按业务领域组织云函数，不为每一个按钮创建单独云函数。

### `auth`

- `login`：从微信上下文取得用户身份，创建或更新 `users`，返回安全的用户标识和登录状态。

### `catalog`

- `listProducts`
- `getProduct`
- `listStores`
- `getStore`

### `address`

- `listAddresses`
- `saveAddress`
- `deleteAddress`
- `setDefaultAddress`

### `fee`

- `quote`：校验地址、商品和配送方式，返回统一费用报价。

### `order`

- `createOrder`
- `listOrders`
- `getOrder`
- `cancelOrder`
- `prepareReorder`：检查原订单商品目前是否仍可购买，返回可以重新加入本地购物车的商品。
- `advanceMockOrder`：仅开发环境开放，生产环境必须拒绝。

商家后台未来使用独立的受权限保护的状态推进接口；不能复用面向客户的 Mock 接口。

## 6. 统一响应格式

成功：

```js
{
  ok: true,
  data: {}
}
```

失败：

```js
{
  ok: false,
  error: {
    code: 'ADDRESS_OUT_OF_RANGE',
    message: '当前地址超出同城配送范围'
  }
}
```

第一版至少定义以下错误码：

```text
AUTH_REQUIRED
INVALID_INPUT
PRODUCT_NOT_FOUND
PRODUCT_SOLD_OUT
SPEC_NOT_FOUND
PRODUCT_UNAVAILABLE_FOR_SCENE
STORE_NOT_FOUND
STORE_CLOSED
ADDRESS_NOT_FOUND
ADDRESS_INCOMPLETE
ADDRESS_OUT_OF_RANGE
DELIVERY_METHOD_UNSUPPORTED
FEE_UNAVAILABLE
ORDER_NOT_FOUND
ORDER_ALREADY_EXISTS
ORDER_CANNOT_CANCEL
ORDER_STATUS_TRANSITION_INVALID
INTERNAL_ERROR
```

## 7. 安全边界

- 小程序不直接写入 `products`、`stores` 或 `orders`。
- 地址和订单操作统一通过云函数完成。
- 云函数从微信上下文取得用户身份，不相信客户端提交的 `openid`。
- 云函数不相信客户端提交的价格、合计、订单状态或地址所有者。
- 创建订单、报价消费和订单状态历史写入使用数据库事务，并用 `clientRequestId` 防止重复订单；`orders(ownerOpenId, clientRequestId)` 与 `feeQuotes(ownerOpenId, quoteId)` 已配置唯一索引。
- 日志中不要记录完整手机号、完整地址或其他敏感数据。
- 开发专用状态推进必须同时检查云环境和调用权限，不能只靠页面隐藏按钮。

## 8. 实施顺序

第一轮基础闭环已完成并部署到 `cloud1-d9gc800bmc6952073`：

1. 初始化小程序云环境配置并保留本地 Mock 降级。
2. 创建并配置 `users`、`products`、`stores`、`addresses`、`orders`、`orderStatusHistory`、`feeQuotes`。
3. 完成 `auth`、`catalog`、`address`、`fee`、`order` 云函数。
4. 建立 local/remote repository adapter。
5. 完成地址、报价、订单查询、下单、取消和状态历史。
6. 回归自取、同城外卖和快递邮寄三条流程。

第一轮历史版本明确不做（支付现已进入新的本地开发阶段）：

- 支付、退款和资金操作；
- 真实配送和真实邮费；
- 商家后台；
- 数量库存；
- 云端购物车；
- 头像、昵称和微信手机号授权；
- 旧本地 Mock 数据迁移。

## 9. 当前证据与未完成项

- 已通过 MCP 核验目标 EnvId 为传统 NoSQL，函数 `auth`、`catalog`、`address`、`fee`、`order` 均为 `Active/Available`。
- 已核验 `feeQuotes` 为 `PRIVATE`；`users(openid)`、`orders(ownerOpenId, clientRequestId)`、`feeQuotes(ownerOpenId, quoteId)` 唯一索引已创建。
- MCP 未登录调用已返回 `AUTH_REQUIRED`；这不是正向登录证明。正向身份回归记录见 `docs/WECHAT-POSITIVE-REGRESSION-2026-08-18.md`。
- 已部署版本包含本地 T-008 的事务、报价绑定/消费和安全 DTO 改动；报价篡改/过期/重复消费、幂等和非 `placed` 状态取消仍需独立回归。
- 当前开发环境基线为 2 条地址、3 条订单；本轮正向回归新增 1 条地址和 2 条配送订单，现保留 3 条地址、5 条订单，未经明确授权不得删除。

## 10. 商家后台下一阶段

- 商家后台目标为电脑浏览器正式页面，使用账号密码和 `merchant_operator`，由服务端校验权限并记录审计；当前未创建商家页面、账号或函数。
- 商家状态推进不得复用用户端 Mock 逻辑；需要单独实现订单状态、售罄和门店营业操作。
- 准备让真实顾客使用前，再决定商品图片是否迁移到云存储。
