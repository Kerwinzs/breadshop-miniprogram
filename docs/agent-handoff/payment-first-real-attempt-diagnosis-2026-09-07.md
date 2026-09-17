# 首次真实支付尝试只读诊断（2026-09-07）

## 1. 完成内容

- 在 CloudBase 测试环境 `cloud1-d9gc800bmc6952073` 对指定订单进行精确、只读、字段白名单诊断。
- 订单存在且处于待支付状态；关联支付交易为 0 条，关联支付事件为 0 条。
- 未查询日志，因为现有 MCP 云函数日志接口无法保证排除完整正文、请求响应及其他敏感内容。

## 2. 修改文件

- 新增 `docs/agent-handoff/payment-first-real-attempt-diagnosis-2026-09-07.md`。
- 未修改业务代码或云端资源。

## 3. 数据库结构影响

无。所有数据库操作均为精确只读查询，未创建、更新或删除记录、集合、权限或索引。

## 4. API 变化

无。未调用支付创建、查单、关单、退款或其他业务 API。

## 5. 模块影响

无线上变更。诊断范围仅覆盖 `orders`、`paymentTransactions`、`paymentEvents` 的非敏感字段。

## 6. 重要设计决策

- `orders` 仅投影支付状态、金额和时间等允许字段，排除用户身份、地址、电话和商品详情。
- `paymentTransactions` 仅查询允许字段；因结果为空，没有任何 `outTradeNo`、`prepayId` 或支付参数被返回。
- `paymentEvents` 分别按订单号和稳定关联交易号精确查询，仅投影类型/处理状态字段；两次均为 0 条。
- 不查询无法安全投影的云函数日志。

## 7. 未解决问题

- 无安全日志摘要，因此无法确定微信预支付失败的具体渠道错误码。
- 当前数据无法进一步区分配置/签名、商户与 AppID 绑定、通知地址、网络请求或微信支付侧拒绝中的具体一项。
- 订单金额为 1 分；仅凭现有记录不能判定该金额是故障原因。

## 8. 验证方式与结果

- 订单查询：命中 1 条；`paymentRequired: true`、`paymentStatus: pending`、`refundStatus: none`、`payableAmountFen: 1`、`paidAmountFen: 0`。
- 创建时间：北京时间 `2026-09-07 20:01:34`；支付截止时间：北京时间 `2026-09-07 20:16:33`，符合约 15 分钟有效期。
- 订单查询 RequestId：`a35a232c-c3c9-46be-b46f-3d66f52ac555`。
- `paymentTransactions`：与该订单关联记录 0 条；RequestId：`d050ce64-7017-4cc7-b13d-ebea28db81e6`。因此交易状态、错误码、交易号尾号和 `prepayId` 存在性均无可用记录。
- `paymentEvents`：按订单号查询 0 条，RequestId：`5f44f29e-9e5d-4096-a850-6e403fe3a78b`；按稳定关联交易号查询仍为 0 条，RequestId：`e27e3722-3c98-48a9-bfb9-6b5c69b94cc7`。
- 本地调用链核对：`payment` 云函数先调用微信预支付，成功后才保存 `paymentTransactions`；小程序在非“支付未开放”错误发生后会查询订单，若订单仍为 `pending`，界面显示“支付结果待确认”。

## 9. 下一步建议

- 最可能故障点：`payment.createPayment` 已进入或准备进入预支付阶段，但在 `provider.createPrepay` 成功返回之前失败，因此没有保存支付交易，也没有取得可供 `wx.requestPayment` 使用的参数，微信收银台不会弹出。
- 优先增加不含秘密的失败诊断：服务端仅记录/返回标准化 `lastErrorCode` 与阶段标识（例如 `prepay_request_failed`），客户端不要把预支付创建失败统一转成“支付结果待确认”，而应展示可追踪错误码。
- 在完成上述脱敏诊断后，用新的 1 分测试订单重试；只在已生成交易记录且 `prepayId` 存在布尔值为真时，继续验证 `wx.requestPayment`。
