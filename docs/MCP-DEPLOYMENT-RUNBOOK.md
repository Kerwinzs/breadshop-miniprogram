# MCP-only CloudBase 部署与回归 Runbook

本 runbook 仅适用于开发/测试环境 `cloud1-d9gc800bmc6952073`。环境为 CloudBase 传统 NoSQL，不使用 SQL/RDB 工具。支付基础设施已部署；真实支付开关只能在明确资金风险授权后开启。真实配送和真实邮费仍不部署。

## 部署前

1. 确认当前工作区与 Git 版本：记录 `git status --short` 和用于部署的提交；未提交改动必须在部署记录中明确说明。
2. 运行 `node tests/backend-contract-smoke.js`。失败时停止部署。
3. 确认目标 EnvId 精确为 `cloud1-d9gc800bmc6952073`，并保留当前临时数据。不得把“重新初始化”“清空集合”作为常规部署步骤。
4. 不删除或覆盖已存在的临时回归记录。基线为 2 条地址、3 条订单；本轮正向回归后当前为 3 条地址、5 条订单，任何清理需要明确授权和单独记录。

## MCP 部署路径

按 MCP 的 CloudBase 集合/索引/权限/云函数能力操作，所有操作都固定指向该 EnvId：

1. 核验集合存在：`users`、`products`、`stores`、`addresses`、`orders`、`orderStatusHistory`、`feeQuotes`。
2. 核验 `feeQuotes` 权限为 `PRIVATE`；不要为临时排障放宽该权限。
3. 核验唯一索引：`users(openid)`、`orders(ownerOpenId, clientRequestId)`、`feeQuotes(ownerOpenId, quoteId)`。索引缺失时仅创建缺失项，不能先删除集合或历史索引。
4. 从以下目录部署函数：

```text
cloudfunctions/auth
cloudfunctions/catalog
cloudfunctions/address
cloudfunctions/fee
cloudfunctions/order
```

5. 每个函数部署完成后，用 MCP 获取函数详情，确认状态均为 `Active/Available`，并保存 MCP 返回的版本标识、部署时间或等价元数据。
6. 部署后再次核验 `feeQuotes` PRIVATE 和上述索引，防止函数部署流程遗漏数据库配置。

### 支付部署与核验

- 支付函数：`payment(index.main)`、`payment-notify(http.main)`、`payment-worker(worker.main)`。
- 支付集合：`paymentTransactions(outTradeNo)`、`paymentEvents(eventId)`、`refunds(refundNo)`，均为 `PRIVATE` 且括号内字段为唯一索引。
- 回调路径：`/wechatpay/payment`、`/wechatpay/refund`，均指向 `payment-notify` 并启用完整路径透传。
- worker 触发器：`payment-worker-every-minute`，七段 cron `0 * * * * * *`，消息 `{"action":"all"}`。
- 真实配置不得经聊天、Git、日志或返回完整环境变量的 MCP 查询传递。`payment.configurationStatus` 只允许返回 `configured` 布尔值。
- `order.configurationStatus` 只允许返回 `paymentEnabled` 布尔值。人工设置 `PAYMENT_ENABLED=true` 后必须通过该动作复核，再进入真机支付。
- `merchant-auth.configurationStatus` 只允许返回 `authConfigured`、`paymentPermissionsReady`；`merchant-admin.configurationStatus` 只允许返回 `refundQueueEnabled`。退款真机回归前，三项必须全部为 `true`。权限变更后必须让商家端退出并重新登录，不能继续使用旧令牌。
- 代码更新优先使用 `updateFunctionCode`，不得用函数配置更新误覆盖既有环境变量。

## MCP 回归

可用 MCP 做无身份上下文的负向鉴权回归：对需要身份的 `auth`、`address`、`fee`、`order` 调用，预期返回结构化 `AUTH_REQUIRED`（根据函数动作选择适当的无登录调用）。这证明函数没有把缺失身份当作用户，也不接受客户端伪造 OPENID。

MCP 未登录上下文不能验证微信用户的正向路径。以下项目必须在微信开发者工具使用实际小程序身份执行并记录证据：

- 登录成功及 `auth` 响应；
- 地址新增、编辑、默认切换、删除；
- 自取、同城外卖和快递邮寄的报价与下单；
- 订单列表、详情、取消；
- 报价过期、报价重复使用或篡改时的错误反馈；
- 开发者工具控制台无新增错误，网络调用命中目标 EnvId 和已部署函数版本。

MCP 的 `AUTH_REQUIRED` 负向结果和微信开发者工具正向回归均已有记录；当前尚缺报价篡改/过期/重复消费、相同 `clientRequestId` 幂等和非 `placed` 状态取消在真实微信身份下的独立负向证据，不使用模拟数据替代。正向记录见 `docs/WECHAT-POSITIVE-REGRESSION-2026-08-18.md`。

## 部署记录与回滚边界

每次操作在 `TASKS.md` 或 `PROJECT-STATUS.md` 追加：日期、EnvId、本地 Git 提交/dirty 状态、函数名、MCP 返回的版本/状态、集合权限、索引核验、回归结果、保留临时数据数量和未完成证据。

代码回退通过 Git 的可追溯版本完成；云端回退只能部署已记录且已验证的历史函数版本。不得通过删除 `orders`、`addresses`、`feeQuotes` 或其他集合来实现回滚。需要任何数据清理、生产发布或权限放宽时，先取得明确授权。

## 2026-08-19 商家后台发布记录

- 环境：`cloud1-d9gc800bmc6952073`；已授权发布商家后台首页、订单工作台和新订单提醒。
- `merchant-admin`：仅更新本地代码，保留既有运行时和服务端环境变量；部署后为 `Active/Available`。无商家令牌调用 `getDashboardSummary` 返回 `AUTH_REQUIRED`，未调用任何订单、商品、门店或审计写操作。
- 静态应用：`breadshop-backend` 发布为 `breadshop-backend-008`，构建状态 `SUCCESS`，访问域名为 `https://breadshop-backend-cloud1-d9gc800bmc6952073.webapps.tcloudbase.com`。
- 静态托管已确认首页和错误页均为 `index.html`，支持 React BrowserRouter 的子路径刷新。

## 2026-09-05/06 支付发布记录

- 当前商家静态版本为 `breadshop-backend-025`，状态 `SUCCESS`。
- 支付三个函数、三个私有集合、三个唯一索引和两条回调路由已部署。
- `payment` 配置健康检查为 `configured=true`；`order` 支付开关于 2026-09-07 复核为 `paymentEnabled=true`。
- 商家健康检查于 2026-09-07 返回 `authConfigured=true`、`paymentPermissionsReady=true`、`refundQueueEnabled=true`；配置后仍需重新登录商家端并完成真实退款回归。
- `payment-worker-every-minute` 创建回执成功；由于日志查询不能安全投影字段，最近一次 Timer 实际执行尚未通过 MCP 脱敏日志证明。
- 小程序开发版 `1.0.1` 已由用户上传，备注“支付测试”；不代表已设体验版、提交审核或正式发布。
- 后续真机步骤统一按 `docs/WECHAT-PAYMENT-REGRESSION-2026-09-06.md` 执行。
