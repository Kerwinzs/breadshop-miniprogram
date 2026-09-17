# 商家支付配置健康检查部署记录（2026-09-06）

## 1. 完成内容

- 目标 CloudBase 环境：`cloud1-d9gc800bmc6952073`。
- 已仅通过 CloudBase MCP `updateFunctionCode` 部署 `merchant-auth` 与 `merchant-admin` 当前工作区代码。
- 部署后已调用两个函数的只读 `configurationStatus` 动作。
- 线上布尔结果：`authConfigured: true`、`paymentPermissionsReady: false`、`refundQueueEnabled: false`。

## 2. 修改文件

- 线上仅更新 `cloudfunctions/merchant-auth` 与 `cloudfunctions/merchant-admin` 的函数代码包。
- 本地新增 `docs/agent-handoff/merchant-payment-configuration-health-2026-09-06.md`。
- 未修改静态站点、小程序或其他云函数。

## 3. 数据库结构影响

无。未读取或写入数据库，未修改集合、权限、索引或真实数据。

## 4. API 变化

- 发布 `merchant-auth` 的 `configurationStatus`，只返回 `authConfigured` 与 `paymentPermissionsReady` 布尔值。
- 发布 `merchant-admin` 的 `configurationStatus`，只返回 `refundQueueEnabled` 布尔值。
- 未查询、输出或写入任何环境变量值、权限明细、密钥或令牌。

## 5. 模块影响

- 仅 `merchant-auth` 与 `merchant-admin`。
- 未修改函数环境变量、触发器、权限、网络配置或其他云资源。

## 6. 重要设计决策

- 仅采用代码更新，未调用 `updateFunctionConfig`，保留线上既有函数配置。
- 健康检查仅暴露非敏感布尔结论，不暴露配置来源或具体内容。
- 未通过业务操作验证权限，避免产生审计、订单、退款或支付写入。

## 7. 未解决问题

- `paymentPermissionsReady: false`：当前商家身份配置尚未具备健康检查要求的全部支付权限。
- `refundQueueEnabled: false`：当前退款队列模式尚未开启。
- 本任务无权修改配置或权限，因此保持线上现状。

## 8. 验证方式与结果

- MCP 登录状态为 `READY`，绑定环境为 `cloud1-d9gc800bmc6952073`。
- 部署前：`merchant-auth`、`merchant-admin` 均存在且为 `Active`；查询 RequestId：`cf9dba4b-bf30-4b1f-b71a-d91bd4017168`。
- `merchant-auth` 代码更新成功；RequestId：`2f068f86-362c-439e-804c-8cdfcd573ee3`。
- `merchant-admin` 代码更新成功；RequestId：`a3bb39e3-38ed-486a-a78e-3b779d7745d7`。
- `merchant-auth` 线上调用成功，`InvokeResult: 0`；结果为 `authConfigured: true`、`paymentPermissionsReady: false`；Function RequestId：`27f68d04-f9d1-472c-b308-bd98cd8f3284`。
- `merchant-admin` 线上调用成功，`InvokeResult: 0`；结果为 `refundQueueEnabled: false`；Function RequestId：`e004ac6d-9d2d-4b90-b8fe-c34b336c582c`。
- 部署后：两个函数均为 `Active`；`merchant-auth` 更新时间 `2026-09-06 12:43:27`，`merchant-admin` 更新时间 `2026-09-06 12:44:06`；查询 RequestId：`b0aabdaa-24c2-40e7-bd59-e4171d5b8433`。

## 9. 下一步建议

- 在独立授权任务中补齐商家支付权限，并启用约定的退款队列模式；操作前应明确配置变更范围和回滚方式。
- 配置完成后重新调用这两个只读健康检查，目标应为三个布尔字段全部为 `true`，再开展支付版商家操作回归。
