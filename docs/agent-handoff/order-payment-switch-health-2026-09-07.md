# order 支付开关只读核验（2026-09-07）

- 目标环境：`cloud1-d9gc800bmc6952073`。
- 线上只读调用：`order` / `configurationStatus`。
- 核验结果：`paymentEnabled: true`。
- 调用结果：成功，`InvokeResult: 0`。
- Function RequestId：`91dd9120-29d1-4495-b833-20df6c2d7312`。
- 安全边界：未查询函数详情、环境变量或日志；未执行写入、订单创建、支付或退款调用。
