# 微信支付真机回归清单（2026-09-06）

## 当前门禁

- 环境固定为 `cloud1-d9gc800bmc6952073`，仅用于开发测试。
- `payment` 配置健康检查已返回 `configured=true`。
- `payment-worker-every-minute` 已创建，cron 为 `0 * * * * * *`，消息为 `{"action":"all"}`。
- 小程序 `1.0.1` 已上传，备注“支付测试”；2026-09-07 用户确认已设置体验版并取得二维码。
- `order.PAYMENT_ENABLED` 已由用户保存，2026-09-07 只读健康检查返回 `paymentEnabled=true`。
- 2026-09-07 商家端健康检查返回 `authConfigured=true`、`paymentPermissionsReady=true`、`refundQueueEnabled=true`；配置后需重新登录商家端，真实退款回归尚未执行。
- 任何真实付款都必须由用户本人确认；不得删除测试产生的订单、支付、事件或退款记录。

## 开启步骤

1. CloudBase 控制台进入 `order → 函数配置 → 编辑 → 环境变量`。
2. 使用可视化输入新增 `PAYMENT_ENABLED`，值严格为 `true`；保留其他变量并保存。
   保存后由 MCP 调用 `order.configurationStatus`，只在返回 `paymentEnabled=true` 时继续。
3. CloudBase 控制台进入 `merchant-auth → 函数配置 → 编辑 → 环境变量`，保留 `MERCHANT_PERMISSIONS` 现有权限，在原列表中补充 `payments.read`、`refunds.create`、`refunds.retry`，不得覆盖或删除原权限。
4. CloudBase 控制台进入 `merchant-admin → 函数配置 → 编辑 → 环境变量`，新增 `MERCHANT_REFUND_REQUEST_MODE`，值严格为 `queue`，保留其他变量并保存。
5. 保存后由 MCP 只读调用两个商家健康检查；仅在 `authConfigured`、`paymentPermissionsReady`、`refundQueueEnabled` 均为 `true` 时继续。商家后台退出并重新登录，旧令牌不会自动获得新权限。
6. 微信公众平台将开发版 `1.0.1` 设置为体验版，确认体验成员包含付款测试账号。
7. 只使用低价、可正常售卖商品创建一笔测试订单；提交前记录页面展示金额。

## 正向支付验收

- 提交订单后生成 `paymentRequired=true`、`paymentStatus=pending`，购物车暂不清空。
- 微信支付收银台显示的商户和金额与确认订单页一致；用户本人确认付款。
- 付款完成后客户端继续查单，服务端确认 `paymentStatus=paid` 后才清空对应场景购物车。
- 订单详情独立展示支付状态；商家端允许从“已下单”推进到“制作中”。
- 微信通知重复到达时不得重复记账，支付事件按 `eventId` 幂等。

## 失败与恢复验收

- 用户取消收银台：订单保留为待支付，购物车保留，可从订单详情再次支付。
- 客户端结果未知：不得显示已支付，重新查单后以服务端事实为准。
- 15分钟未支付：worker 主动查单、关闭支付单，订单变为 closed/canceled，并且库存只释放一次。
- 无效签名、金额不一致或错误商户身份的通知必须拒绝，订单不得标记为已支付。

## 整单退款验收

- 新建一笔已支付且尚未制作的低金额订单。
- 用户取消后订单履约状态与退款状态分离，先进入 `refundStatus=pending`。
- worker 发起整单原路退款，最终显示 `succeeded`；`paymentStatus` 继续保留 `paid` 事实。
- 退款失败必须显示 `failed` 并允许商家重试，不得伪装退款成功。

## 证据记录

只记录订单号、测试场景、页面金额、状态时间线、非敏感错误码和结果。不得记录商户私钥、API v3 密钥、公钥全文、签名、完整通知报文、临时支付参数或完整环境变量。

回归完成前不得提交正式审核、正式发布或把开发环境描述为生产可用。

## 2026-09-07 首次真实支付尝试

- 真机体验版成功生成 `0.01` 元到店自取订单，但提交后及订单详情“立即支付”均未拉起微信收银台，页面显示“支付结果待确认”。用户未发生扣款。
- CloudBase MCP 只读核验确认订单仍为 `paymentStatus=pending`、`paidAmountFen=0`；对应 `paymentTransactions` 和 `paymentEvents` 均无记录。因此失败发生在微信预支付成功并保存支付流水之前，不是支付成功通知或客户端收银台回调问题。
- 客户端已修正错误分层：创建预支付失败时不再查询并伪装为“结果待确认”，而是显示“创建支付失败”以及长度受限的脱敏错误码和错误信息；不展示请求参数、签名、密钥、`prepay_id` 或完整响应。
- 本地验证：支付客户端专项测试 `5/5` 通过；仓库 Node 测试 `53/53` 通过；相关小程序 JavaScript 语法检查通过。
- 微信小程序开发版 `1.0.2` 已于 2026-09-07 通过微信开发者工具 CLI 上传成功，描述为“支付预下单错误诊断”，上传包 `146010` bytes，AppID 核验为项目配置的 `wx65e43f28166f1457`。尚需在腾讯云第三方平台将 `1.0.2` 设为体验版，真实微信侧错误原因仍待下一次真机尝试确认。
- `1.0.2` 真机复测已得到微信支付侧错误 `WECHAT_PAY_API_ERROR`，错误信息为“appid和mch_id不匹配，请检查后再试”。项目实际小程序 AppID 为 `wx65e43f28166f1457`；下一步需在微信支付商户平台核对当前商户号是否已关联该 AppID，并安全核对服务端 `WECHAT_PAY_APP_ID` 是否指向同一 AppID。完成关联及配置核验前不继续重复发起真实支付。
