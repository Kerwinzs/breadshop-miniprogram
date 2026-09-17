# 微信支付模块设计与本地实现状态

## 1. 当前阶段

支付模块代码与基础设施已部署到开发环境，支付集合、唯一索引、回调路由和服务端商户配置已建立。`payment` 的非敏感健康检查已返回 `configured=true`；2026-09-07 `order` 健康检查返回 `paymentEnabled=true`。已完成真机 1 分支付；退款请求已进入微信支付业务校验，当前因商户基本账户余额不足被拒绝，尚未完成真实退款回归，不得描述为正式支付已可用。

首期已确认规则：

- 到店自取、同城外卖、快递邮寄均全额预付真实商品小计。
- 同城配送费和快递运费继续到付，不进入在线支付金额。
- 待支付有效期为 15 分钟，超时关单并幂等释放库存。
- 只有支付成功订单允许从“已下单”进入“制作中”。
- 用户可在制作开始前取消；未支付订单关闭，已支付订单申请整单全额原路退款。
- 首期不支持部分退款。退款处理中、成功和失败必须独立记录。

## 2. 状态模型

履约状态继续使用 `orderStatus`。资金状态与履约状态正交：

```text
paymentStatus: pending -> paid
               pending -> closed

refundStatus:  none -> pending -> succeeded
                              -> failed -> pending（人工重试）
```

`orderStatus=canceled` 不代表退款成功；已退款订单仍保留 `paymentStatus=paid`，以反映原支付事实。

> 2026-09-08 真实退款回归：已确认 `payment-worker` 实际入口为 `worker.main`，并修复单笔退款失败记录错写集合、脱敏错误摘要以及微信 API 要求的 `User-Agent` 请求头。最新单笔请求已通过请求格式校验，微信返回 `WECHATPAY_API_NOT_ENOUGH`（商户基本账户余额不足）。退款仍为 `pending`、已退金额仍为 0；商户补足基本账户余额前不得重复人工提交或描述为已退款。完整证据见 `docs/agent-handoff/refund-diagnostic-deploy-and-retry-2026-09-08.md`。

## 3. 本地数据契约

`orders` 新增支付查询投影：

```text
paymentStatus, refundStatus,
payableAmountFen, paidAmountFen, refundedAmountFen,
paymentExpiresAt, paidAt, stockReleasedAt
```

支付开关启用后的新订单明确写入 `paymentRequired=true`。存量订单若既没有该字段，也没有 `pending|paid|closed` 资金状态，则按 `paymentRequired=false`、`paymentStatus=not_required` 只读兼容，不追补为待支付订单。

部署灰度期间由服务端 `PAYMENT_ENABLED` 控制新订单是否进入支付流程。只有值严格为 `true` 才创建待支付订单；缺失或其他值均安全回退为 `paymentRequired=false`、`paymentStatus=not_required`。真实商户配置、支付函数、回调、客户端版本和回归全部就绪后才能开启。

计划新增 PRIVATE 集合：

- `paymentTransactions`：以 `outTradeNo=P<orderNo>` 唯一。
- `paymentEvents`：以渠道 `eventId` 唯一，用于通知幂等。
- `refunds`：以 `refundNo=R<orderNo>` 唯一，首期一单一次整单退款。

2026-09-05 已在开发环境创建三个空集合，均为 `PRIVATE`，并分别建立 `outTradeNo`、`eventId`、`refundNo` 唯一索引；尚无业务记录。

## 4. 本地接口契约

`payment` 云函数本地实现：

- `createPayment({ orderNo })`
- `queryPayment({ orderNo })`
- `closeExpiredPayment({ orderNo })`
- `configurationStatus`：仅返回 `{ configured: boolean }`，用于验证配置结构，不返回配置名称或内容。

Provider 已实现 API v3 RSA-SHA256 商户签名、小程序调起支付签名、微信支付响应/通知验签、AES-256-GCM 解密，以及 JSAPI 下单、查单、关单和整单退款请求构造。HTTP 客户端只允许访问微信支付官方 API 主机，并固定发送 `Accept: application/json` 与无敏感信息的 `User-Agent`。开发环境已完成真机 1 分支付；缺少配置或适配器时必须返回 `PAYMENT_NOT_CONFIGURED`。

已增加受限的微信支付 HTTPS 客户端和 `http.main` 回调实现。默认仅接受 `POST /wechatpay/payment` 和 `POST /wechatpay/refund`，支持 CloudBase `body` 字符串与 `isBase64Encoded` 输入，先保留字节再交给 Provider 验签；错误响应不回显渠道报文或内部异常。2026-09-05 已通过 Event 函数 `payment-notify` 和 SCF 网关部署两条公开回调路由，无签名请求会失败关闭；网关逐字节保真仍须用有效签名夹具或真实通知验证。

本地 `payment-worker` 已实现有限批次的主动查单、超时关单和退款执行。人工/内部调用要求 `PAYMENT_WORKER_SECRET` HMAC-SHA256 签名；平台定时调用只接受 `Type=Timer` 且触发器名严格为 `payment-worker-every-minute`，部署时还必须把该函数设为不可由小程序或公网直接调用。单笔失败隔离并记录重试时间。超时任务会先查单，关单后再次确认；支付成功优先，未知状态不得本地关单或释放库存。

部署结构统一使用 `cloudfunctions/payment/` 一个自包含代码包，并生成函数名对应的独立部署目录：用户事件接口 `payment/index.main`、经 HTTP 网关转发的 Event 回调 `payment-notify/http.main`、后台任务 `payment-worker/worker.main`。三个函数已部署并为 `Active/Available`。不用 CloudBase 原生 HTTP 函数承载回调，因为该运行模型要求 9000 端口 Web 服务和额外的 CloudBase 数据库鉴权配置；Event 函数由网关传入 `headers/body/isBase64Encoded`，同时保留普通云函数的服务端数据库凭据。

商家端：

- `advanceOrder` 在 `placed -> preparing` 时要求 `paymentStatus=paid`。
- `cancelOrder` 对未支付订单关闭支付；对已支付未制作订单创建 `refunds` 请求。
- `retryRefund` 只允许重试 `refundStatus=failed` 的退款。

## 5. 安全与上线门禁

真实支付前必须完成：

1. 独立 staging/production 环境与存量订单兼容方案。
2. 通过受控服务端配置注入商户号、AppID、API v3 密钥、商户私钥、证书序列号和通知地址；任何真实值不得进入 Git、聊天、前端构建或普通日志。
3. 实现能保留原始请求体及 `Wechatpay-*` 请求头的 HTTPS 通知入口，并完成签名验证、资源解密、金额核对和事件幂等。
4. 为本地主动查单、关单和退款 worker 配置真实 HTTP 适配器、nonce 防重放存储与定时触发器，并完成线上验证。
5. 创建并核验 PRIVATE 集合及唯一索引，完成备份、告警、对账和回滚方案。
6. 在隔离环境通过支付成功、用户取消、结果未知、金额不符、重复/乱序通知、超时、迟到通知、退款失败及并发取消回归。

商家退款回归还有独立门禁：`merchant-auth` 的原权限列表必须保留并补充 `payments.read`、`refunds.create`、`refunds.retry`，`merchant-admin` 必须设置 `MERCHANT_REFUND_REQUEST_MODE=queue`。配置只能在受控服务端完成；完成后以布尔健康检查确认 `paymentPermissionsReady=true`、`refundQueueEnabled=true`，并重新登录商家端取得新短令牌。2026-09-06 线上实测这两项仍为 `false`。
