# 支付云函数（本地基础，未部署）

当前仅建立可测试的资金状态、幂等和微信支付 API v3 适配边界，不包含真实商户配置，也未确认 CloudBase HTTP 回调的原始报文映射，因此不能直接部署收款。

状态契约：`paymentStatus` 仅为 `pending | paid | closed`；`refundStatus` 仅为 `none | pending | succeeded | failed`。稳定业务键为 `outTradeNo=P<orderNo>`、`refundNo=R<orderNo>`；渠道事件以 `eventId` 唯一去重。

集合与建议唯一索引：

- `paymentTransactions.outTradeNo` 唯一；同时保存 `orderNo`、应付金额和渠道交易号。
- `paymentEvents.eventId` 唯一；只保存验签解密后处理结果，原始敏感报文不得长期记录。
- `refunds.refundNo` 唯一；同时保存 `orderNo`、整单退款金额和独立退款状态。

用户动作是 `createPayment({ orderNo })` 和 `queryPayment({ orderNo })`。缺少商户号、AppID、API v3 密钥、商户私钥、证书序列号、通知地址或 HTTP 适配器时必须返回 `PAYMENT_NOT_CONFIGURED`。支付/退款通知必须由能保留原始请求体及 `Wechatpay-*` 头的 HTTP 入口完成验签后接入；当前云函数 action 明确拒绝通知，避免伪装成已实现回调。

渠道 I/O 始终在数据库事务之外执行；支付成功、关单释放库存和退款结果落库分别由短数据库事务保证幂等。小程序 `requestPayment` 的成功回调不能作为支付成功事实，客户端需再调用查单，最终事实来自验签通知或主动渠道查单。
