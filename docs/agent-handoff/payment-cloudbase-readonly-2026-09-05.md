# 支付模块 CloudBase 接入前只读核验交接（2026-09-05）

## 1. 完成内容

已通过 CloudBase MCP 对目标环境 `cloud1-d9gc800bmc6952073` 完成支付接入前只读核验，范围包括登录与环境、云函数、NoSQL 集合、权限、索引、商家静态应用、HTTP 网关以及函数触发器能力。本轮未执行部署、创建、更新、删除或真实数据写入。

## 2. 修改文件

- 新增本交接文档：`docs/agent-handoff/payment-cloudbase-readonly-2026-09-05.md`。
- 线上代码和资源：无修改。

## 3. 数据库结构影响

无变更。

MCP 列出 9 个现有集合：`addresses`、`auditLogs`、`feeQuotes`、`orderStatusHistory`、`orders`、`productCategories`、`products`、`stores`、`users`。

支付计划集合核验结果：

- `paymentTransactions`：不存在。
- `paymentEvents`：不存在。
- `refunds`：不存在。

现有集合权限：

- `orders`、`auditLogs`、`addresses`、`feeQuotes`、`orderStatusHistory`、`productCategories`：`PRIVATE`。
- `products`、`stores`：`ADMINWRITE`。
- `users`：`ADMINONLY`。

重点业务索引：

- `orders`：`orderNo` 唯一；`ownerOpenId + clientRequestId` 唯一；`ownerOpenId + createdAt(desc)`。
- `auditLogs`：`createdAt(desc)`；`targetType + targetId + createdAt(desc)`。
- `feeQuotes`：`ownerOpenId + quoteId` 唯一。
- `orderStatusHistory`：`orderNo + createdAt`。
- `addresses`：`ownerOpenId + addressId` 唯一；`ownerOpenId + isDefault`。
- `productCategories`：`categoryId` 唯一。
- `users`：`openid` 唯一。
- `products`、`stores`：本次 MCP 返回中除系统索引外未见业务索引。

支付集合不存在，因此其权限和索引均不存在。

## 4. API 变化

无变化。

MCP 验证当前授权状态为 `READY`，当前环境与目标 EnvId 一致；环境状态为 `NORMAL`，地域为上海，运行后端为 NoSQL，数据库状态为运行中。

现有云函数共 7 个，均为 `Active`：

- `auth`
- `catalog`
- `address`
- `fee`
- `order`
- `merchant-auth`
- `merchant-admin`

未发现 `payment` 或 `payment-worker`。现有函数列表显示运行时均为 `Nodejs16.13`、类型为 `Event`、部署模式为 `code`。对 `order` 的详情抽查显示 `Active/Available`、处理器为 `index.main`、公网访问能力开启、触发器为空、环境变量列表为空。

其他函数的环境变量名称未继续读取：MCP 函数详情接口可能同时返回配置值，为避免读取或传播秘密，本次将其记录为未知。

## 5. 模块影响

无线上模块变化。

当前支付接入仍缺少：支付主函数、支付补偿 worker、三个支付数据集合、支付回调 HTTP 路由以及定时触发器。

商家静态应用 MCP 核验结果：

- 服务名：`breadshop-backend`。
- 当前版本：`breadshop-backend-023`。
- 状态：`SUCCESS`。
- 最近构建时间：`2026-09-03 15:55:41`。

以上是只读核验当时的线上版本事实；本轮未部署静态应用。

## 6. 重要设计决策

MCP 网关查询显示当前路由均指向静态存储，没有 `SCF` 或 `WEB_SCF` 支付回调路由；环境存在启用的默认 `HTTPSERVICE` 域名。

MCP 官方文档检索确认：CloudBase 支持原生 HTTP 云函数，网关支持 `WEB_SCF` 上游，HTTP 云函数能够处理 HTTP 请求并读取请求头。因此独立 HTTP 云函数或 HTTP 云托管服务可以作为微信支付回调的候选承载方式。

微信支付验签所需的原始请求体和 `Wechatpay-*` 请求头必须在业务实现中保留。但本次 MCP 文档结果没有给出“网关保证逐字节保留原始 body”的明确结论，所以原始 body 是否完全保真记录为未知。后续实现应在任何 JSON 解析前保存原始 Buffer，并通过签名夹具及真实回调验证。

MCP 工具与官方文档确认 CloudBase 云函数支持定时触发器，并提供 `listFunctionTriggers`/`createFunctionTrigger` 能力。因此 `payment-worker` 可规划为 Event 云函数加定时触发器；当前没有该函数或对应触发器。具体可用 cron 表达式、最小调度间隔和套餐限制本次未核验，记录为未知。

## 7. 未解决问题

- 支付回调原始 body 经 CloudBase 网关后的逐字节保真：未知，需专项验证。
- 支付回调最终域名和路径：未配置。
- `payment-worker` 的调度频率、重试、死信和扫描范围：未确定。
- 支付集合字段、权限和唯一索引：尚未创建。
- 支付商户配置的安全注入状态：本次未读取，未知。
- 当前套餐对支付回调和定时任务的具体配额：本次未核验，未知。

## 8. 验证方式与结果

全部证据来自 CloudBase MCP 只读调用：

- `auth status`：授权 `READY`，当前 EnvId 为 `cloud1-d9gc800bmc6952073`。
- 环境详情：状态 `NORMAL`、NoSQL、上海地域、数据库运行中。
- 函数列表：7 个目标函数均为 `Active`，无 `payment`/`payment-worker`。
- `order` 函数详情和触发器查询：`Active/Available`，当前无触发器。
- 集合列表：共 9 个；三个支付集合分别返回 `exists=false`。
- 权限查询：现有 9 个集合权限结果如第 3 节。
- 索引查询：现有集合的重点业务索引结果如第 3 节。
- 静态应用查询：`breadshop-backend-023`、`SUCCESS`。
- 网关路由查询：只有静态存储路由，没有支付函数路由；默认 HTTP 服务域名存在且启用。
- CloudBase 官方文档 MCP 检索：确认 HTTP 云函数、HTTP 网关和定时触发器能力；没有确认原始 body 的逐字节保真。

本轮没有调用任何 CloudBase 写工具。

## 9. 下一步建议

在获得云端写入授权后，建议按以下顺序实施：先确认支付数据模型和幂等键；创建私有支付集合及唯一索引；实现独立 HTTP `payment` 函数并完成原始请求体验签测试；创建回调网关路由；实现 Event 型 `payment-worker` 并配置定时触发器；最后进行重复通知、查单补偿、超时关单、整单退款和真实沙箱支付回归。
