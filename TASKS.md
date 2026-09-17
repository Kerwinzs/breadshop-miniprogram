# 项目任务总表

> 本表记录已验收任务和下一阶段边界。云端事实以 MCP 部署/核验记录为准，代码版本以 Git 提交为准。

| 编号 | 任务 | 状态 | 依赖 | 验收摘要 |
| --- | --- | --- | --- | --- |
| T-001 | 开通微信云开发环境 | completed | 无 | 已确认 `cloud1-d9gc800bmc6952073` 为绑定小程序的传统 NoSQL 环境。 |
| T-002 | 云开发基础初始化与商品读取 | completed | T-001 | `users`、`products`、`stores`，以及 `auth`、`catalog` 已部署；MCP 未登录调用返回 `AUTH_REQUIRED`。 |
| T-003/T-003A | 数据库类型核验与环境确定 | completed | T-001 | 确认仅使用 CloudBase 传统文档型数据库和 `db.collection(...)`，不实施 SQL/RDB 适配。 |
| T-004 | 审查整合云开发基础改动 | completed | T-002、T-003A | 已整合提交 `f8c0c60`。 |
| T-005 | 用户端地址与订单云端化 | completed | T-004 | 地址、报价、三种场景下单、订单查询/取消及状态历史已部署；已提交 `76f0fcf`、`ba883f0`。 |
| T-008 | 事务、报价绑定与 DTO 安全收口 | completed | T-005 | 部署版本已核验包含事务写入、`feeQuotes` 一次性消费、报价绑定和安全 DTO；契约 smoke test 覆盖关键约束。 |
| T-009 | 微信开发者工具正向身份回归 | completed | T-008 | 正向流程、普通到店自取下单和五项负向验收均由用户真实微信人工确认完成；证据来源为用户人工确认，未补写错误码或 trace。 |
| T-006 | 商家后台基础版 | completed | T-009 | 管理员登录、订单工作台、状态推进、撤销、商品、门店、审计日志和新订单轮询提醒已部署。 |
| T-010 | 微信支付开发环境接入 | in_progress | T-006 | 支付函数、回调路由、私有集合、唯一索引、真实服务端配置、订单支付开关、商家支付/退款权限和 worker 定时器均已通过健康核验；小程序 `1.0.1` 已设为体验版。剩余：完成小额支付、回调、超时和整单退款真机回归。 |

## 已核验云端资源

- EnvId：`cloud1-d9gc800bmc6952073`，传统 NoSQL。
- 云函数：`auth`、`catalog`、`address`、`fee`、`order` 为 `Active/Available`。
- 集合：`users`、`products`、`stores`、`addresses`、`orders`、`orderStatusHistory`、`feeQuotes`；`feeQuotes` 为 `PRIVATE`。
- 唯一索引：`users(openid)`、`orders(ownerOpenId, clientRequestId)`、`feeQuotes(ownerOpenId, quoteId)`。
- 临时数据：基线 2 条地址、3 条订单；本轮正向回归新增 1 条地址和 2 条订单，当前共 3 条地址、5 条订单，未经明确授权不得删除。

## 当前验证

- 已通过：MCP 未登录调用返回 `AUTH_REQUIRED`；静态契约检查可运行 `node tests/backend-contract-smoke.js`。
- 已通过：发布前差异审查确认开发者回归工具不进入 `miniprogram/` 用户包，`app.json`、个人中心和订单详情无回归/调试入口；工具引用位于 `tests/tools/dev-regression/`。
- 已记录：以微信开发者工具实际身份完成登录、地址操作、自取/同城外卖/快递邮寄下单、订单列表/详情和自取取消；详见 `docs/WECHAT-POSITIVE-REGRESSION-2026-08-18.md`。
- 已完成：报价篡改、报价过期、报价重复消费、相同 `clientRequestId` 幂等和非 `placed` 状态取消五项真实微信身份负向验收；证据来源为用户人工确认，未补写错误码、trace 或截图细节。
- 已完成：普通到店自取下单 `INTERNAL_ERROR` 修复由用户真实微信人工确认；未补写错误码、trace 或截图细节。
- 2026-08-18 部署核验：EnvId `cloud1-d9gc800bmc6952073`；`auth` 09:34:22、`address` 09:38:28、`fee` 09:38:36、`order` 09:38:43 均为 `Active/Available`；`feeQuotes` 为 `PRIVATE`，唯一索引核验通过。
- 不在当前支付首期：真实配送、真实邮费、物流轨迹、部分退款、余额支付和完整库存流水。
- `order.PAYMENT_ENABLED=true`、商家支付/退款权限和退款队列模式均已于 2026-09-07 通过 MCP 只读复核；小程序 `1.0.1` 已由用户确认设为体验版并取得二维码。商家端需退出并重新登录；剩余门禁是由用户本人执行受控小额资金回归。

## 部署记录格式

每次 MCP-only 部署或核验追加以下信息到本文件或 `PROJECT-STATUS.md`：

```text
日期：
EnvId：
本地 Git 提交 / 工作区版本：
函数与 MCP 状态/版本标识：
集合权限与索引核验：
回归结果：
保留的临时数据：
未完成证据：
```

完整路径和回归步骤见 `docs/MCP-DEPLOYMENT-RUNBOOK.md`。
