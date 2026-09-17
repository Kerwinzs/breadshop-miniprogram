# 支付基础设施 CloudBase 执行交接（2026-09-05）

## 1. 完成内容

- CloudBase MCP 登录状态为 `READY`，目标环境固定为 `cloud1-d9gc800bmc6952073`。
- 已创建并验证三个空集合：`paymentTransactions`、`paymentEvents`、`refunds`；权限均为 `PRIVATE`，幂等字段均有唯一索引。
- 已部署并验证三个 Event 云函数：
  - `payment`：`index.main`，Nodejs18.15，`Active / Available`。
  - `payment-worker`：`worker.main`，Nodejs18.15，`Active / Available`。
  - `payment-notify`：`http.main`，Nodejs18.15，`Active / Available`。
- 已保留失败的原生 HTTP 资源 `payment-callback`，未删除或重建；其状态仍为 `CreateFailed`。
- 已创建两条公网回调路由，并完成无签名负向验证：
  - `/wechatpay/payment`
  - `/wechatpay/refund`
- `payment-worker` 明确禁止直接 invoke；`payment-notify` 允许公网回调调用。未创建定时器。

## 2. 修改文件

- 更新：`docs/agent-handoff/payment-cloudbase-infra-2026-09-05.md`。
- 部署输入来自 `.deploy/cloudfunctions/{payment,payment-worker,payment-notify}`。
- 未修改订单、商家后台、静态站点或小程序。

## 3. 数据库结构影响

| 集合 | 权限 | 唯一索引 | 当前记录数 |
| --- | --- | --- | --- |
| `paymentTransactions` | `PRIVATE` | `outTradeNo_1_unique` | 0 |
| `paymentEvents` | `PRIVATE` | `eventId_1_unique` | 0 |
| `refunds` | `PRIVATE` | `refundNo_1_unique` | 0 |

未删除、覆盖或迁移已有数据；负向测试未写入支付或订单业务记录。

## 4. API 变化

- 新增 Event 函数 `payment`。
- 新增受保护的 Event 函数 `payment-worker`。
- 新增 Event 网关适配函数 `payment-notify`。
- 新增公开回调 URL：
  - `https://cloud1-d9gc800bmc6952073-1470059974.ap-shanghai.app.tcloudbase.com/wechatpay/payment`
  - `https://cloud1-d9gc800bmc6952073-1470059974.ap-shanghai.app.tcloudbase.com/wechatpay/refund`
- 两条路由均为 `SCF` 上游、指向 `payment-notify`、`EnableAuth=false`、`EnablePathTransmission=true`。

## 5. 模块影响

- 已上线：支付集合、索引、函数、函数权限和回调网关路由。
- 未变化：`auth`、`catalog`、`address`、`fee`、`order`、`merchant-auth`、`merchant-admin`、静态站点、小程序。
- 既有静态站点根路由保持原样。

## 6. 重要设计决策

- 原生 HTTP 函数要求 `scf_bootstrap` Web 服务，不适配当前 event-style Node 回调；改用 Event 函数 `payment-notify` 配合 SCF 网关路由。
- 开启完整路径透传，使处理器能够区分支付和退款回调路径。
- 函数全局 `CUSTOM` 规则保留既有条目，并精确增加 `payment-worker.invoke=false` 与 `payment-notify.invoke=true`。
- 参数探查时 MCP 曾按默认值创建非预期 `/payment-notify` 路由；发现后只删除该精确路由，随后只读确认线上仅保留两条目标路由。未影响静态根路由。
- 未注入、读取或展示任何商户私钥、证书、API v3 密钥、令牌或完整环境变量。

## 7. 未解决问题

- `payment-callback` 失败空资源仍存在，状态为 `CreateFailed`；按本轮约束未处理。
- 未配置真实商户参数，因此尚不能做真实支付、签名成功回调或真实退款测试。
- 当前 CloudBase MCP 不提供函数 invoke 工具，未执行 `payment` 缺配置的 MCP 直调测试。
- `payment-worker` 尚无定时触发器，符合当前阶段要求。

## 8. 验证方式与结果

CloudBase MCP 证据摘要：

- 环境：`auth_status=READY`，EnvId=`cloud1-d9gc800bmc6952073`。
- 集合复核：请求 `fad7e7ae-70a8-4313-8e76-becc873ad16c`，三个集合存在且均为 0 条记录。
- 唯一索引复核：
  - paymentTransactions：`7f7f8462-4f03-4ed4-9418-9da60a67a04f`
  - paymentEvents：`df896d26-c24f-4805-a976-294d9559c6ce`
  - refunds：`31566235-7da2-4920-94fd-fe280723fbd7`
- `payment`：创建请求 `a6f6df0d-ea15-422a-a1fd-6aeda8cc54e8`；详情请求 `ae20807a-e270-485c-983a-298aa4ad11f3`。
- `payment-worker`：创建请求 `0479ec54-13e2-4276-9014-facb6873cfcf`；详情请求 `bb71c1d5-0bf0-4806-8bc8-13d5822ded64`。
- `payment-notify`：创建请求 `06fa192b-98df-4b73-825b-51cc2769f58b`；详情请求 `0a4bcf37-a422-4061-93b7-3f93e8473d5f`，确认 Event、`http.main`、Active/Available。
- 函数权限：更新请求 `3590afe3-fda3-4c42-afa0-e0fe07ed20f5`；复核请求 `f0e343bf-e881-44e8-9468-ceca1062ff7f`。
- 路由创建：
  - payment：`77b3b0c4-0e8f-4909-ba60-adde625b14ab`
  - refund：`7cd1f4e1-f0c4-40f4-b389-b6335923bb90`
- 路由只读复核：请求 `e9bd45df-3ebf-4ab6-92f1-d9a4dc806b0e`；两条均启用、匿名、完整路径透传，且既有静态根路由不变。
- 非预期默认路由 `/payment-notify` 精确删除请求：`08ffe192-7d47-455b-b81a-9e62d517cdb6`；后续路由复核确认已不存在。
- HTTPS 无签名负向测试：
  - payment：HTTP 500，响应 `code=FAIL`。
  - refund：HTTP 500，响应 `code=FAIL`。

## 9. 下一步建议

下一阶段应在安全的服务器端配置流程中注入真实微信支付商户配置，再做签名成功回调、金额不匹配、重复通知幂等、支付查询、退款和超时关单测试。启用 worker 定时器、清理 `payment-callback` 失败资源、部署订单或客户端均需单独明确授权。
