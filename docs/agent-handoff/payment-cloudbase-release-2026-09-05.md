# 支付版 CloudBase 发布交接（2026-09-05）

## 1. 完成内容

- 目标环境已确认：`cloud1-d9gc800bmc6952073`，CloudBase MCP 为 `READY`。
- 删除且仅删除了 `Status=CreateFailed`、`CodeSize=0` 的失败空函数 `payment-callback`，删除后只读确认已不存在。
- 仅更新 `order` 和 `merchant-admin` 的函数代码；未调用配置更新接口。
- 发布商家后台新版本 `breadshop-backend-025`，BuildId=`2602219768`，状态 `SUCCESS`。
- 核验支付函数、支付集合、函数权限和 worker 触发器状态。
- 未创建 worker 定时器：MCP 当前创建 timer 的参数不支持“创建但禁用”，按照授权边界暂不创建。

## 2. 修改文件

- 新增：`docs/agent-handoff/payment-cloudbase-release-2026-09-05.md`。
- 本轮未修改业务源码；部署使用工作树已有的：
  - `cloudfunctions/order`
  - `cloudfunctions/merchant-admin`
  - `backend/dist`

## 3. 数据库结构影响

- `paymentTransactions`、`paymentEvents`、`refunds` 均存在，当前均为 0 条记录。
- 三个集合权限均为 `PRIVATE`。
- 唯一索引保持存在：
  - `paymentTransactions.outTradeNo_1_unique`
  - `paymentEvents.eventId_1_unique`
  - `refunds.refundNo_1_unique`
- 本轮未创建集合、修改权限或索引，也未写入业务数据。

## 4. API 变化

- `order`：代码已更新，函数仍为 Event / Nodejs16.13 / Active。
- `merchant-admin`：代码已更新，函数仍为 Event / Nodejs16.13 / Active。
- `payment`、`payment-worker`、`payment-notify`：仍为 Event / Nodejs18.15 / Active。
- `payment-callback`：失败空资源已删除。
- 现有支付回调路由保持不变。

## 5. 模块影响

- 已部署：订单云函数代码、商家后台云函数代码、商家后台静态应用新版本。
- 已清理：仅 `payment-callback` 失败空函数。
- 未部署：小程序及其他云函数。
- 未启用：支付 worker 定时任务。

## 6. 重要设计决策

- 使用 `manageFunctions.updateFunctionCode` 更新两个已有函数，未使用 `updateFunctionConfig`，从而不提交、不读取、不覆盖服务端环境变量。
- 函数安全规则只读复核，未重写；原有规则及支付函数的精确规则保持存在。
- 静态应用使用现有 serviceName 新增递增版本 `breadshop-backend-025`，没有覆盖或删除历史版本。
- timer 工具只提供创建即生效的触发器，未发现禁用字段；因此没有创建后再尝试停用。
- 未读取或输出任何环境变量值、支付秘密、密码、证书或令牌。

## 7. 未解决问题

- `payment-worker-every-minute` 尚未创建。待真实商户配置完成且允许启用后，可直接创建每分钟 timer；当前不能预创建为禁用。
- 未注入任何真实微信支付配置。
- 未执行真实支付、退款或 worker 调度验证。

## 8. 验证方式与结果

CloudBase MCP 证据：

- 环境状态：`auth_status=READY`，EnvId=`cloud1-d9gc800bmc6952073`。
- 发布前函数列表请求：`bd2e72b5-2e9b-4149-8087-57d4b38c6bfd`。
- 失败函数删除请求：`5ae5a352-6118-4078-9aa8-079740e04472`。
- `order` 代码更新请求：`f3c3b131-8dc6-46e2-8b95-28b4708be7bd`。
- `merchant-admin` 代码更新请求：`18be9ddf-b181-4611-ad2d-3c7cf9be3aae`。
- 发布后函数列表请求：`e080f626-81d0-4683-a46c-e3d3d5007311`；确认两个更新函数 Active，`payment-callback` 已不存在。
- 函数权限复核：
  - order：`d58883a8-c81c-44d7-a6d4-cfacd5c6c792`
  - merchant-admin：`8b8e6fbf-a9c2-45e3-9974-e11a23240322`
- worker 触发器复核请求：`a70c25e6-d836-4e91-bc33-2ca4599d987a`，结果为空。
- 发布前静态版本：`breadshop-backend-024`，BuildId=`2602205727`。
- 新版本部署：`breadshop-backend-025`，BuildId=`2602219768`。
- 新版本状态复核请求：`0e2daba2-8d0d-4dc1-a70b-a8309f008dee`，结果 `SUCCESS`。
- 线上入口：`https://breadshop-backend-cloud1-d9gc800bmc6952073.webapps.tcloudbase.com`。
- 线上 `index.html` 为 409 bytes，SHA-256=`463a32d570e85da1681ea81ce059526d46ee95b7c8d5c839132f6b890fbcba97`，与本地 `backend/dist/index.html` 完全一致；引用资源为 `assets/index-Imb3Kms0.js` 和 `assets/index-B4pGUIko.css`。

## 9. 下一步建议

完成受控商户配置注入和缺配置检查后，再单独创建并启用 `payment-worker-every-minute`：CloudBase 七段 cron 应为每分钟表达式，Message 为 `{"action":"all"}`。启用前应再次复核 worker 权限、支付参数完整性和负向测试；小程序上传仍需独立授权与验收。

---

# Payment Worker 定时触发器追加记录（2026-09-05）

## 1. 完成内容

- 创建前已确认 `payment-worker` 没有任何触发器，目标名称不存在。
- 已通过 CloudBase MCP 为 `payment-worker` 创建 `payment-worker-every-minute`。
- 创建参数为 timer、CloudBase 七段每分钟 cron `0 * * * * * *`，消息为 `{"action":"all"}`。

## 2. 修改文件

- 仅追加本交接文件。

## 3. 数据库结构影响

无。

## 4. API 变化

无。

## 5. 模块影响

仅新增 `payment-worker` 的目标定时触发器；未修改函数代码、函数配置、权限、数据库、路由或其他触发器。

## 6. 重要设计决策

- 创建前严格检查目标名称不存在，避免重复创建。
- 未在创建后再次调用 `listFunctionTriggers`：该 MCP 查询会在触发器响应中夹带完整函数环境配置，不符合“不得读取或输出环境变量值”的安全边界。
- 未记录、复述或使用查询响应中的任何环境变量内容。

## 7. 未解决问题

- MCP 创建回执确认操作成功，但启用状态未通过安全的只读接口二次核验。当前 `listFunctionTriggers` 不支持仅返回触发器字段的投影。

## 8. 验证方式与结果

- 创建前触发器列表请求：`0cf1f707-6082-4bc3-84fe-ba244c40ac0e`，触发器列表为空。
- 创建请求：`996ee1fb-47f9-4913-97b3-f3fb53eeb3fa`，CloudBase MCP 返回创建成功。
- 目标函数：`payment-worker`。
- 名称：`payment-worker-every-minute`。
- 类型：`timer`。
- cron：`0 * * * * * *`。
- 消息：`{"action":"all"}`。
- 启用状态：受只读工具响应泄密风险限制，未二次读取确认。

## 9. 下一步建议

CloudBase MCP 应增加触发器查询字段投影或默认隐藏函数环境变量值。具备安全查询能力后，再只读复核触发器启用状态；不要为复核而读取完整函数详情。

## 追加发布记录：订单支付灰度保护（2026-09-05）

- 目标环境再次显式绑定为 `cloud1-d9gc800bmc6952073`。
- 使用 `manageFunctions.updateFunctionCode` 仅更新 `order` 函数代码，未调用 `updateFunctionConfig`，未读取、提交或覆盖任何环境变量。
- 代码更新请求：`a5a35566-4c4e-4608-8040-3b0f058b450c`。
- 发布后只读函数列表请求：`bf4032dc-8592-4566-a080-7d1f0b17dfcb`。
- 线上结果：`order` 为 Event / Nodejs16.13 / `Active`，`ModTime=2026-09-05 21:51:32`。
- 验证边界：`listFunctions` 不返回 `AvailableStatus`；`getFunctionDetail` 会同时返回环境变量内容。为遵守不得读取环境变量值的约束，本次未调用详情接口，因此只确认 `Active`，不将 `Available` 标记为已复核。
- 未修改其他函数、权限、触发器、静态站点、集合、索引或业务数据。
