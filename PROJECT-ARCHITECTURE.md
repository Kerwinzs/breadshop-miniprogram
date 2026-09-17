# 当前项目架构

## 运行边界

```text
微信小程序 miniprogram/
  ├─ 本地状态：购物车、非云端降级数据
  ├─ repository：local/remote adapter
  └─ wx.cloud.callFunction
          │
          ▼
CloudBase EnvId cloud1-d9gc800bmc6952073
  ├─ auth / catalog / address / fee / order
  └─ 传统 NoSQL 云数据库（db.collection）
       users, products, stores, addresses, orders,
       orderStatusHistory, feeQuotes
```

环境是传统文档型 NoSQL 数据库，不使用 CloudBase SQL/RDB。`project.config.json` 指向 `cloudfunctions/`，小程序端环境 ID 在 `miniprogram/utils/auth-service.js`。

## 用户端数据流

1. `auth` 从微信上下文取得 OPENID，建立或更新 `users`；客户端不能传入或伪造归属身份。
2. `catalog` 提供商品和门店读取。登录或网络不可用时，repository 可以回退到本地浏览数据；本地购物车不依赖云端登录。
3. `address` 只处理当前 OPENID 的地址；默认地址更新在事务中串行化。
4. `fee` 重新读取地址、商品和规格，写入 PRIVATE `feeQuotes`。报价绑定 `ownerOpenId`、地址、配送方式、商品快照、费用版本和过期时间。
5. `order` 在事务内校验用户、商品、门店/地址与 `feeQuoteId`，消费报价、创建订单和状态历史。配送订单不信任客户端金额；订单以 `(ownerOpenId, clientRequestId)` 去重。
6. 对小程序返回的订单 DTO 删除 `ownerOpenId`、`_openid`、操作者 ID 和内部文档 ID。

## 数据完整性与索引

| 集合 | 当前边界 | 已核验约束 |
| --- | --- | --- |
| `users` | 微信用户记录 | `openid` 唯一索引 |
| `addresses` | 归属用户的收货地址 | 事务维护默认地址 |
| `feeQuotes` | 服务端报价、一次性消费 | PRIVATE；`(ownerOpenId, quoteId)` 唯一索引 |
| `orders` | 订单和费用快照 | `(ownerOpenId, clientRequestId)` 唯一索引 |
| `orderStatusHistory` | 订单状态追加记录 | 与订单写入处于同一事务 |
| `products` / `stores` | 目录数据 | 云函数重新校验，不以客户端值为准 |

## 已部署与未覆盖的范围

`auth`、`catalog`、`address`、`fee`、`order` 已通过 MCP 部署并核验 `Active/Available`。部署版本包含 T-008 的事务、报价绑定/消费和安全 DTO 收口；MCP 未登录调用返回 `AUTH_REQUIRED`。

尚未完成实际微信身份的正向开发者工具回归。也未实现商家端、支付、退款、真实配送、真实邮费、库存数量或物流轨迹。开发环境固定费率仅用于联调，不是实际经营费用。

## 运维规则

- 环境只用于开发/测试；生产必须新建独立 EnvId。
- 临时回归数据保留：当前记录为 2 条地址和 3 条订单。没有明确授权不得删除、覆盖或迁移。
- 云端改动仅依照 `docs/MCP-DEPLOYMENT-RUNBOOK.md` 执行；每次部署把 MCP 函数版本/状态、索引/权限和回归证据写入 `PROJECT-STATUS.md` 与 `TASKS.md`。
