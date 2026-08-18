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
| T-006 | 商家后台基础版 | pending | T-009 | 电脑网页、账号密码、`merchant_operator`、订单状态、售罄、门店营业和审计。 |

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
- 不在本阶段：商家端、支付、真实配送、真实邮费、库存数量、物流轨迹。
- 后端用户端收口后的唯一下一目标：设计并实现商家后台第一阶段的账号、服务端权限、订单状态推进、售罄/恢复销售、门店营业/休息和审计闭环；建议先由后端/权限线程设计数据与 API 边界，再由前端线程实现电脑网页，最后用真实订单做状态流转回归。

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
