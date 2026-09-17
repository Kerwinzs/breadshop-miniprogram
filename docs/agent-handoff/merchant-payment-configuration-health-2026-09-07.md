# 商家支付配置只读健康核验（2026-09-07）

- 目标环境：`cloud1-d9gc800bmc6952073`。
- `merchant-auth.configurationStatus`：
  - `authConfigured: true`
  - `paymentPermissionsReady: true`
- `merchant-admin.configurationStatus`：
  - `refundQueueEnabled: true`
- 两次线上调用均成功，`InvokeResult: 0`。
- `merchant-auth` Function RequestId：`1ea07336-4678-43a1-9aa8-0b2dd525c91b`。
- `merchant-admin` Function RequestId：`0a3685e0-ab74-46e0-9fbb-2a5721d3120a`。
- 安全边界：未查询或输出环境变量、权限列表、密钥、令牌或日志；未执行任何写入、订单、支付或退款调用。
