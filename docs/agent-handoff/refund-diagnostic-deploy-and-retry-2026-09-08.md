# 退款诊断部署与受控重试结果（2026-09-08）

## 1. 完成内容

- 已将 `.deploy/cloudfunctions/payment-worker` 仅以代码更新方式部署到测试环境 `cloud1-d9gc800bmc6952073` 的既有 `payment-worker`。
- 已确认函数更新成功且状态为 `Active`，既有每分钟定时器仍启用并为 `Available`。
- 未执行主动退款重试：现有 worker 只提供批量 `action=refund`，无法严格限定到目标 1 分退款；按任务安全边界停止在调用前。
- 已只读核验目标订单、退款记录及退款事件的最新脱敏状态。

## 2. 修改文件

- 线上：仅更新 `payment-worker` 函数代码包。
- 本地：新增本交接记录。
- 未部署或修改其他函数、静态站点或小程序。

## 3. 数据库结构影响

无。未主动创建、修改、删除或清理任何数据库记录、集合、权限或索引。

## 4. API 变化

- 部署包将部分笼统的微信支付响应验签错误细分为签名头缺失、签名时间戳异常、公钥标识不匹配及签名本身无效等非敏感错误码。
- worker 的公开动作范围未改变；仍没有按 `refundNo` 或 `orderNo` 处理单笔退款的入口。

## 5. 模块影响

- 仅影响 `payment-worker` 代码。
- 入口保持 `worker.main`；未调用函数配置更新接口，未修改环境变量、超时、运行时、权限、网络或触发器。

## 6. 重要设计决策

- 部署前运行支付 provider、worker domain、worker entry 和 worker auth 测试，共 21 项全部通过。
- 使用 CloudBase MCP `updateFunctionCode`，不读取或覆盖函数配置。
- 因 `processRefunds()` 会扫描最多 20 条符合条件的退款，无法保证只作用于目标退款，所以未调用批量 `action=refund`。
- 保留既有定时器；它可能在目标记录达到 `nextRetryAt` 后按原机制自动处理，但本任务未主动触发。

## 7. 未解决问题

- 目标订单仍为 `paymentStatus: paid`、`refundStatus: pending`、`refundedAmountFen: 0`。
- 退款记录仍为 `status: pending`，最终只读快照的 `attemptCount` 为 17。
- 最新处理时间为 `2026-09-08 09:06:02`，早于本次代码更新时间；因此尚无证据证明细分诊断代码已在该退款上执行。
- 最新错误码仍为 `INVALID_WECHATPAY_SIGNATURE`，计划重试时间为 `2026-09-08 10:06:02`。
- 退款结果事件仍为 0 条。

## 8. 验证方式与结果

- 代码更新成功：CloudBase RequestId `84bacc13-57f6-4af0-89f7-1291f40b7265`。
- `payment-worker`：`Active`，代码更新时间 `2026-09-08 09:28:59`；函数列表查询 RequestId `f6188d2c-07d9-4bea-9b26-84702c707103`。
- 定时器 `payment-worker-every-minute`：`Enable: 1`、`BindStatus: on`、`AvailableStatus: Available`，每分钟调度；查询 RequestId `907e17cd-9591-42f7-a26a-b6bcb1c3cf37`。
- 退款最终快照：`pending`、1 分、`attemptCount: 17`、`lastErrorCode: INVALID_WECHATPAY_SIGNATURE`；查询 RequestId `e908909d-4beb-450d-bf18-fba7542d49ad`。
- 订单最终快照：已取消、支付为 `paid`、退款为 `pending`、已付 1 分、已退 0 分；查询 RequestId `e1a68fc7-16ef-420a-8245-548e80bc298c`。
- 退款结果事件：0 条；查询 RequestId `436f4302-dec8-4d22-91ee-721363762bf5`。

## 9. 下一步建议

- 新增经过签名鉴权、只接受稳定退款号且服务端再次校验金额和状态的单笔 worker 动作，并配套测试；获得明确部署授权后再用于本退款。
- 或等待既有定时器在下一次允许时间自动处理，再只读核验 `lastErrorCode` 是否变为细分错误码。
- 在无法严格限定目标前，不应手工调用批量 `action=refund`，避免影响其他真实退款。

## 单笔调度唤醒追加结果

### 授权范围内的最小写入

- 写入前按稳定退款号、稳定订单号、`amountFen: 1`、`status: pending` 精确查询，结果恰好 1 条；唯一性复核 RequestId：`4d7b1bdd-752c-419f-bf78-bd1ecaf4a5fd`。
- 仅使用服务端 `$currentDate` 更新该记录的 `nextRetryAt`；未修改退款号、订单号、金额、状态、尝试次数或其他字段。
- 写入结果：`matchedCount: 1`、`modifiedCount: 1`、未 upsert；RequestId：`684b4e68-b3de-44fb-8f93-e0162d22a4ea`。
- 未调用批量 worker，未创建或修改其他退款记录。

### 定时周期后只读核验

- 已等待超过一个完整的每分钟调度周期，并进行两轮只读快照。
- 退款记录仍为 `status: pending`、`attemptCount: 17`、`lastErrorCode: INVALID_WECHATPAY_SIGNATURE`；`nextRetryAt` 已早于核验时间，但 `updatedAt` 与尝试次数均未变化。最终退款查询 RequestId：`6b03f978-669e-4d44-9891-18cf2ecb2b32`。
- 订单仍为 `paymentStatus: paid`、`refundStatus: pending`、`paidAmountFen: 1`、`refundedAmountFen: 0`；查询 RequestId：`18c4ed99-2523-4693-a91b-0d52aac80617`。
- 相关退款结果事件仍为 0 条；查询 RequestId：`ce846add-7ee6-4fb5-a51e-35e3ab3febd4`。

### 结论与阻塞

- 已确认单字段唤醒写入成功，但既有定时器未在观察窗口内领取该记录，因此没有产生新的细分错误码，也没有退款成功证据。
- 触发器管控状态为启用/Available 只能证明配置存在，不能替代真实执行证据。
- 当前 worker 没有可严格限定单笔退款的受控入口；按安全边界不得调用批量 `action=refund`。下一步应先诊断定时触发的实际执行状态，或实现并部署单笔签名 worker 动作后再重试。

## 单笔触发消息方案执行结果

### 最新代码部署

- 已确认最新部署包实现 `refundOne`，按稳定退款号精确读取并处理单笔退款；本地测试覆盖“只处理目标退款”。
- 部署前运行 worker domain、worker entry 与 payment provider 测试，共 20 项全部通过。
- 已仅更新既有 `payment-worker` 代码，CloudBase RequestId：`f03fa4f8-aa2b-4f3a-92b1-1ba531906731`。
- 部署后 `payment-worker` 为 `Active`，代码更新时间 `2026-09-08 09:49:44`；函数列表查询 RequestId：`69fc86ac-b6fd-4539-aa70-c640cbf6fd1b`。

### 触发器能力检查与停止点

- 当前 `payment-worker-every-minute` 仍为 `Enable: 1`、`BindStatus: on`、`AvailableStatus: Available`；查询 RequestId：`7195c5b6-6f8b-471d-96a6-a836abe45259`。
- 当前 CloudBase MCP 的函数触发器管理仅提供创建与删除，不提供原地更新既有触发器 Message 的专门动作；已安装实现中也未发现可安全使用的更新入口。
- 按任务约束，未删除并重建触发器，未创建替代触发器，也未尝试未经确认的通用云 API Action。
- 因触发器 Message 从未被修改，本轮无需执行恢复操作；“仍为原配置”是基于未发生变更的推断，当前只读触发器列表不返回 Message 内容，无法独立复核其正文。

### 退款执行结论

- 本轮没有触发 `refundOne`，没有调用批量 `action=refund`，没有修改退款、订单或支付事件数据。
- 无新的执行证据、状态变化或细分错误码可报告。
- 后续只有在平台提供安全的原地触发器 Message 更新能力，或另行授权一种可严格限定单笔且不暴露 worker 签名秘密的调用方式后，才能继续该 1 分退款重试。

## 临时重建触发器的单笔退款尝试

### 1. 完成内容

- 经用户逐字授权，临时删除并同名重建 `payment-worker-every-minute`，消息严格限定为 `refundOne` 和已锁定退款；本文不记录完整退款号。
- 观察调度窗口后，已无条件删除临时触发器并恢复同名常规触发器，消息为 `{"action":"all"}`。

### 2. 修改资源

- 临时修改并最终恢复 `payment-worker-every-minute`。
- 未修改函数代码、环境变量、权限、网络、订单、退款或支付事件数据。

### 3. 数据库结构影响

无。没有数据库结构变更，也没有主动数据库写入。

### 4. API 变化

无。未新增公开 API，未调用批量退款动作。

### 5. 模块影响

- 操作范围仅为测试环境的 `payment-worker` 定时触发器。
- 临时消息仅允许 worker 读取并尝试处理已唯一锁定的 1 分退款。

### 6. 重要设计决策

- 操作前只读确认：唯一触发器绑定 `payment-worker`，名称为 `payment-worker-every-minute`，类型为 Timer，cron 为七段 `0 * * * * * *`；RequestId：`155fe219-a2e5-47ec-a81d-0560df8abbca`。
- 使用 SCF `CreateTrigger.CustomArgument` 传递临时单笔消息，不在可见输出或本文记录完整退款号。
- 恢复优先于继续等待；观察到无执行证据后立即恢复，避免临时任务继续重复触发。

### 7. 未解决问题

- 临时触发器创建成功且初始状态为 Available，但观察窗口内目标退款的 `attemptCount`、`status`、`updatedAt` 均未变化，未取得实际执行证据。
- 因没有执行证据，无法获得新的细分错误码；当前仍为此前的 `INVALID_WECHATPAY_SIGNATURE`。
- 未查询完整日志，避免暴露敏感请求或响应内容。

### 8. 验证方式与结果

- 临时单笔触发器创建成功；RequestId：`cd407955-e380-42ae-ab78-a3ff20faa753`。
- 调度窗口内两次目标快照均无变化；查询 RequestId：`f5f4dfaa-f1fe-45f6-ba03-1e41c221f1e5`、`7472d0aa-4333-4bb4-aa74-ad3c76d1f625`。
- 常规触发器恢复成功；创建 RequestId：`f2376b22-7ad8-412d-bde1-4a1a3a8bcc03`。
- 恢复后只读核验：唯一同名 Timer，cron 为 `0 * * * * * *`，消息为 `{"action":"all"}`，`Enable: 1`、`BindStatus: on`、`AvailableStatus: Available`；RequestId：`ce743fab-4c70-4502-a2d2-5468a15462f0`。
- `payment-worker` 最终为 `Active`；函数列表 RequestId：`28d5c291-aa93-4f55-962f-c2ae722492a2`。
- 最终退款：`pending`、1 分、`attemptCount: 17`、`lastErrorCode: INVALID_WECHATPAY_SIGNATURE`；RequestId：`cacc1db7-7641-4a0d-a6c1-e6e8dc392f15`。
- 最终订单：已取消、支付 `paid`、退款 `pending`、已付 1 分、已退 0 分；RequestId：`3b006893-df3b-4a48-a1a9-58cca57a40cb`。
- 最终退款结果事件：0 条；RequestId：`b24fe6e8-ae20-499e-816b-17f834909252`。

### 9. 下一步建议

- 当前阻塞已从“无法单笔定位”转为“Timer 配置可用但观察窗口无实际执行证据”。下一步应只读核验定时触发运行链路，或设计无需临时改动共享触发器、且仍受服务端签名鉴权保护的单笔运维入口。
- 在取得实际单笔执行证据前，不应宣称退款已重试或已提交微信。

## 管理面单笔 Timer 调用结果

### 1. 完成内容

- 已只读确认函数调用权限边界和 MCP 管理面调用能力。
- 已通过 MCP 管理面严格调用一次 `payment-worker`，事件为受信任 Timer 形态，消息仅含 `refundOne` 与此前唯一锁定的目标退款；本文不记录完整退款号。
- 调用没有进入退款处理，返回 `INVALID_INPUT`，随后已完成目标数据只读核验。

### 2. 修改文件

- 仅追加本交接记录。
- 未修改代码、函数配置、权限、触发器或其他云资源。

### 3. 数据库结构影响

无。管理面调用未进入退款 worker，最终只读数据证明目标退款、订单和事件均未变化。

### 4. API 变化

无。没有调用 `refund` 或 `all`，也没有新增接口。

### 5. 模块影响

- 仅尝试调用 `payment-worker` 的严格单笔动作。
- 未影响其他退款或订单。

### 6. 重要设计决策

- 权限只读结果明确显示 `payment-worker` 的 invoke 规则为 false，因此小程序客户端和公网不能直接调用；权限查询 RequestId：`28420cee-b29e-4720-93c6-354da3096b2c`。
- MCP `manageFunctions.invokeFunction` 为管理面调用能力，已用于一次受控事件调用。
- 调用后不重试，避免在入口异常时产生重复或扩大影响。

### 7. 未解决问题

- 管理面调用返回 `INVALID_INPUT / 不支持的支付操作`，没有进入 `refundOne`。
- 已核验事实：部署包中的 `worker.main` 对不支持动作使用“支付任务”文案，而本次线上返回“支付操作”文案。
- 原因推断：线上 `payment-worker` 当前实际 handler 很可能仍指向支付事件入口 `index.main`，而不是预期的 `worker.main`；这也能解释 Timer 已启用但退款长期未被领取。由于本任务禁止读取函数详情和修改配置，本轮未进一步查询或修正 handler。

### 8. 验证方式与结果

- 管理面调用完成，函数层 `InvokeResult: 0`，业务返回 `ok: false`、错误码 `INVALID_INPUT`；Function RequestId：`3ad4cb06-d48d-42e8-b675-3cc4904e010b`。
- 最终退款仍为 `pending`、1 分、`attemptCount: 17`、`lastErrorCode: INVALID_WECHATPAY_SIGNATURE`；RequestId：`e3f85cb7-5edd-4183-84d5-baf76fc55811`。
- 最终订单仍为已取消、支付 `paid`、退款 `pending`、已付 1 分、已退 0 分；RequestId：`a8c17f18-677b-4787-a0da-a1a3a3bef976`。
- 退款结果事件仍为 0 条；RequestId：`a212dd94-b5f1-44b7-83d8-6abf44f6022f`。

### 9. 下一步建议

- 在单独授权任务中只读确认 `payment-worker` 当前 handler；若确认为 `index.main`，应仅将 handler 修正为 `worker.main`，保留全部环境变量、触发器、权限、运行时、超时和网络配置。
- 修正后再次执行同一严格 Timer 形态的单笔管理面调用，随后只读核验细分退款错误码或成功状态。

## 控制台修正 Handler 后的单笔退款重试

### 1. 完成内容

- 用户在腾讯云控制台保存 Handler 后，先通过 MCP 管理面执行一次无业务写入的无效动作探针。
- 探针明确进入 `/var/user/worker.js`，返回 worker 入口专用的“不支持的支付任务”，确认 `worker.main` 已生效。
- 随后严格执行一次 Timer 形态的 `refundOne`，仅指向此前唯一锁定的 1 分退款；本文不记录完整退款号。
- 单笔调用没有被微信退款接口受理，精确错误为 `WECHATPAY_SIGNATURE_HEADERS_MISSING`。

### 2. 修改文件

- 仅追加本交接记录。
- 未修改业务代码、函数配置、触发器、权限或环境变量。

### 3. 数据库结构影响

无。未创建或修改集合、字段、权限和索引。

目标退款的运行状态由既有 worker 失败记录逻辑更新：`attemptCount` 从 17 增至 18，`lastErrorCode` 更新为 `WECHATPAY_SIGNATURE_HEADERS_MISSING`，状态保持 `pending`。

### 4. API 变化

无。没有调用批量 `refund` 或 `all`，没有新增公开 API。

### 5. 模块影响

- 仅对唯一锁定的 1 分退款执行了一次单笔 worker 尝试。
- 订单、其他退款和支付事件没有被修改。

### 6. 重要设计决策

- 先用无写入探针确认 Handler，避免在入口不确定时发起退款。
- 单笔调用固定使用 `Type=Timer`、`TriggerName=payment-worker-every-minute`，Message 仅含 `refundOne` 和目标退款标识。
- 返回同步失败而非 `processing`，因此没有等待异步通知窗口，也没有再次调用。

### 7. 未解决问题

- 当前阻塞已精确定位为微信支付响应缺少验签所需的 `Wechatpay-*` 响应头，错误码 `WECHATPAY_SIGNATURE_HEADERS_MISSING`。
- 退款仍未被微信接口受理；不能宣称已退款或退款处理中。
- 需要检查 HTTP 客户端/代理是否保留微信支付响应头，以及 provider 是否从实际响应对象读取正确的 headers；排查时仍不得输出密钥、签名或完整响应。

### 8. 验证方式与结果

- Handler 无写入探针 Function RequestId：`4fe9bc83-ead7-441e-817d-860b09740e04`；堆栈指向 `/var/user/worker.js`。
- 唯一一次 `refundOne` Function RequestId：`3accbe4a-85c4-4a9e-b5ce-cdc95bab3be3`；扫描 1 条、成功 0、失败 1，错误码 `WECHATPAY_SIGNATURE_HEADERS_MISSING`。
- 退款只读核验：`pending`、金额 1 分、`attemptCount: 18`、最新错误如上；RequestId：`93b415bf-6d3e-4fbf-adab-cfebc4168b03`。
- 订单只读核验：已取消、支付 `paid`、退款 `pending`、已付 1 分、已退 0 分；RequestId：`5e20e147-3416-4934-84d2-e5402d7f0a03`。
- 退款结果事件仍为 0 条；RequestId：`7d0ec3aa-19de-424f-b6f0-619d9589f535`。
- `payment-worker` 为 `Active`；函数列表 RequestId：`270de35d-e5bb-4ff3-9a13-98603a5d1042`。
- 唯一常规定时器保持名称 `payment-worker-every-minute`、timer、cron `0 * * * * * *`、Message `{"action":"all"}`、启用且 Available；RequestId：`5a8063dc-0fbc-4b97-b35c-ddeb9e8afbe1`。

### 9. 下一步建议

- 在本地只读审查微信支付请求适配层的响应头读取路径，确认所用 HTTP 实现返回的 headers 形态；先补充不含秘密的单元测试，再决定是否需要代码修正。
- 未修复并验证响应头读取前，不应继续人工重试该退款，避免无意义增加尝试次数。

## Handler 字段级修正安全性核验

### 1. 完成内容

- 已核对当前安装的 CloudBase MCP 对函数详情查询及函数配置更新的实际实现。
- 因无法在不读取环境变量的前提下只读取得 Handler，也无法通过该 MCP 将 Handler 作为独立字段更新，已按任务安全边界立即停止。
- 本轮没有再次调用退款 worker。

### 2. 修改文件

- 仅追加本交接记录。
- 未修改业务代码或任何云端资源。

### 3. 数据库结构影响

无。没有集合、字段、权限或索引变更。

### 4. API 变化

无。没有调用退款 API，也没有新增或调整公开接口。

### 5. 模块影响

- 云函数配置无变化。
- 退款、订单与支付事件数据无变化。

### 6. 重要设计决策

- `queryFunctions(getFunctionDetail)` 会直接返回完整函数详情，没有 Handler 字段投影能力；其结果包含环境变量，不能在本任务中安全调用。
- 当前 MCP 的 `manageFunctions(updateFunctionConfig)` 会先读取完整函数详情并合并环境变量，而且实现只向 SDK 传递名称、环境变量、超时和 VPC，未传递其输入模型中声明的 `handler`。
- 因此该动作既违反“不得读取环境变量”的边界，也不能完成仅修改 Handler 的目标；未以 CLI、控制台或通用云 API 绕过 MCP 约束。

### 7. 未解决问题

- 线上 `payment-worker` 的实际 Handler 仍未取得字段级只读证据；此前业务返回文案仅构成其可能仍为 `index.main` 的强推断，不作为已验证事实。
- Handler 尚未修正，单笔 1 分退款尚未再次触发。

### 8. 验证方式与结果

- 本地只读检查已安装 CloudBase MCP 实现：函数详情动作原样封装 `getFunctionDetail` 的完整结果；配置更新动作内部读取 `Environment.Variables`，且未转发 `handler`。
- 因在发起任何线上读取前已确认接口无法满足安全边界，本节没有新的 CloudBase RequestId；此前已验证的函数、触发器及退款状态证据保持不变。

### 9. 下一步建议

- 需要 CloudBase MCP 提供只返回 Handler 的字段级查询，以及真正支持 Handler 单字段更新且不读取/重写其他配置的动作；具备这两项能力后再继续。
- 另一可选路径是由用户在腾讯云控制台手动将 Handler 改为 `worker.main`，随后本任务只通过安全的状态/触发器接口验证并执行一次严格限定的 `refundOne`。在获得新的明确证据前不得继续退款重试。

## 最新 worker 代码部署与单笔退款重试

### 1. 完成内容

- 已将最新 `.deploy/cloudfunctions/payment-worker` 仅以代码更新方式部署至 `cloud1-d9gc800bmc6952073` 的既有 `payment-worker`，入口参数保持 `worker.main`。
- 部署后使用无业务写入探针确认实际执行 `/var/user/worker.js`。
- 通过 MCP 管理面严格调用一次 Timer 事件的 `refundOne`，仅指向此前唯一锁定的 1 分退款；未调用 `refund/all`。
- 调用返回真实业务错误 `WECHATPAY_API_INVALID_REQUEST`，未进入 `processing`。

### 2. 修改文件

- 仅追加本交接记录。
- 云端仅更新 `payment-worker` 函数代码；未改环境变量、网络、权限或触发器。

### 3. 数据库结构影响

无结构变更。目标退款失败记录被 worker 更新，最终 `status: pending`、`attemptCount: 21`；订单仍为退款待处理。

### 4. API 变化

无。没有调用批量退款动作，没有新增公开接口。

### 5. 模块影响

- 影响范围限定为 `payment-worker` 代码版本及唯一锁定退款的重试记录。
- 未修改其他订单、退款或支付事件。

### 6. 重要设计决策

- 代码部署使用 `updateFunctionCode`，避免配置更新接口读取或重写环境变量。
- 先做无写入入口探针，再做唯一一次单笔退款调用。
- 退款调用返回同步失败，未等待异步通知，也未再次人工重试；常规定时器保持原配置。

### 7. 未解决问题

- 本次微信退款请求被判定为 `WECHATPAY_API_INVALID_REQUEST`；最终记录在随后常规定时器运行后显示最新错误 `WECHATPAY_SIGNATURE_HEADERS_MISSING`，退款仍未受理。
- 需要在不暴露秘密的前提下核对微信退款请求参数与响应头保留链路；当前不能宣称退款成功或处理中。

### 8. 验证方式与结果

- 代码部署成功 RequestId：`7a5073e1-eae4-4a4d-8536-aa826b2da996`。
- Handler 探针 Function RequestId：`42cde7b7-004b-49b0-9891-0f0c167a6543`；日志指向 `/var/user/worker.js`，返回“不支持的支付任务”。
- 唯一一次 `refundOne` Function RequestId：`03719548-c9a6-409e-b13f-508bf0b43455`；错误码 `WECHATPAY_API_INVALID_REQUEST`。
- 退款只读核验 RequestId：`67326264-e820-4674-b3fc-165d22925539`；1 分、`pending`、尝试 21 次、最新错误 `WECHATPAY_SIGNATURE_HEADERS_MISSING`。
- 订单只读核验 RequestId：`9413000e-2b79-471c-89f1-8e5a2b9635b2`；已取消、支付 `paid`、退款 `pending`、已付 1 分、已退 0 分。
- 退款结果事件只读核验 RequestId：`29212487-6232-4243-9bc8-f4ba99a57c66`；0 条。
- 函数状态只读核验 RequestId：`c7c04442-e759-46c0-8714-a5d3e2a2f8e1`；`payment-worker` 为 `Active`。
- 定时器只读核验 RequestId：`1f96151b-bc19-4d3a-b5ea-9a8593d572ec`；`payment-worker-every-minute`、timer、cron `0 * * * * * *`、Message `{"action":"all"}`、启用且 Available。

### 9. 下一步建议

- 暂停人工退款重试，先修正并测试微信退款请求参数/验签响应头链路，再进行下一次受控尝试。
- 若需要进一步定位 `WECHATPAY_API_INVALID_REQUEST`，仅记录脱敏 HTTP 状态和错误码，不采集完整报文、签名或环境变量。

## 退款错误字段只读核验

### 1. 完成内容

- 在目标环境仅查询此前唯一锁定的 1 分退款及其关联订单。
- 未调用 worker、未重试退款、未修改任何云端资源。
- 重点查询 `lastErrorMessage`；该字段当前未返回，未读取或输出任何完整错误报文。

### 2. 修改文件

- 仅追加本交接记录。

### 3. 数据库结构影响

无。只读查询；没有集合、字段、索引或权限变更。

### 4. API 变化

无。

### 5. 模块影响

无运行模块变更，仅核验 `refunds` 与 `orders` 两条记录。

### 6. 重要设计决策

- 使用字段投影，仅请求退款状态、尝试次数、错误码、重试时间及订单支付/退款金额字段。
- 不请求环境变量、密钥、签名、完整日志、微信完整响应或个人信息。
- `lastErrorMessage` 不在当前记录中写入或返回，因此不臆测其具体内容；仅报告安全错误码摘要。

### 7. 未解决问题

- 退款记录仍为 `pending`，错误码为 `WECHATPAY_API_INVALID_REQUEST`；没有可用的 `lastErrorMessage` 字段值可进一步摘要。
- 关联订单仍未退款，需后续在不暴露敏感数据的前提下检查请求参数校验链路。

### 8. 验证方式与结果

- 退款只读查询 RequestId：`89265ef6-e8e1-434a-a4e6-35b9295ca57e`；状态 `pending`、尝试 26 次、错误码 `WECHATPAY_API_INVALID_REQUEST`、`lastErrorMessage` 未返回。
- 订单只读查询 RequestId：`8b9fbdad-d813-4782-a35c-87bb2efcbc6e`；支付 `paid`、退款 `pending`、已付 1 分、已退 0 分。
- 退款标识及订单号仅在 MCP 请求内使用，本文和回报均已脱敏。

### 9. 下一步建议

- 暂停人工重试，先修复并测试 `WECHATPAY_API_INVALID_REQUEST` 的参数校验/响应处理；如需增加错误消息字段，应只保存脱敏摘要，不记录完整微信响应。

## 修复失败记录后的 worker 部署与退款诊断

### 1. 完成内容

- 核对 `.deploy/cloudfunctions/payment-worker` 已包含两项本地修复：`refund.create*` 失败写入 `refunds`，并保存最多 160 字、去换行的安全错误消息。
- 相关本地支付/worker 测试 25 项全部通过。
- 仅更新既有 `payment-worker` 代码，保持 Handler=`worker.main` 及其他配置不变。
- 部署后用无业务写入探针确认进入 worker，再严格调用一次目标退款的 `refundOne`。

### 2. 修改文件

- 仅追加本交接记录。
- 云端仅更新 `payment-worker` 代码；未改环境变量、权限、网络或触发器。

### 3. 数据库结构影响

无结构变更。目标退款失败记录按修复后的逻辑更新了错误码和安全消息；未修改其他数据。

### 4. API 变化

无。未调用批量 `refund/all`，未新增公开接口。

### 5. 模块影响

- 影响限定为 `payment-worker` 代码版本及唯一锁定 1 分退款的重试记录。
- 订单仍保持原支付与退款状态；没有新增退款结果事件。

### 6. 重要设计决策

- 使用 `updateFunctionCode` 部署，避免读取或重写环境变量及其他函数配置。
- 先执行无写入入口探针，确认 Handler 正确后再做唯一一次退款调用。
- 仅记录脱敏错误码与安全消息，不记录密钥、签名、完整微信响应或个人信息。

### 7. 未解决问题

- 本次单笔退款返回 `WECHATPAY_API_INVALID_REQUEST`，安全消息为“Http头缺少Accept或User-Agent”。
- 退款仍为 `pending`，未进入 `processing` 或 `succeeded`；需修正微信退款请求头后再考虑重试。

### 8. 验证方式与结果

- 本地测试：25/25 通过。
- 代码部署 RequestId：`bcbc93c2-02e6-48ee-b007-1ade77a88d14`。
- Handler 探针 Function RequestId：`83d75391-9c96-4a3a-a41f-9e4075bb2e51`；日志指向 `/var/user/worker.js`，返回“不支持的支付任务”。
- 唯一一次 `refundOne` Function RequestId：`8c3db477-38eb-4c2d-8c6c-bb9d18cf565d`；错误码 `WECHATPAY_API_INVALID_REQUEST`，安全消息“Http头缺少Accept或User-Agent”。
- 退款只读查询 RequestId：`a16b433e-f768-466d-8858-e53cd9330a2d`；`status: pending`、`attemptCount: 27`、错误码与消息如上。
- 订单只读查询 RequestId：`042027ad-4ae4-48b7-ba23-acd4238447ea`；`paymentStatus: paid`、`refundStatus: pending`、已付 1 分、已退 0 分。
- 退款事件只读查询 RequestId：`06343b83-aa89-42a8-a0ea-cf19cfbb2606`；0 条。
- 函数状态只读查询 RequestId：`46ddbe47-e447-46c0-8714-a5d3e2a2f8e1`；`payment-worker` 为 `Active`。
- 定时器只读查询 RequestId：`39bdbf09-c4e2-447f-b077-af381cd3f778`；`payment-worker-every-minute`、timer、cron `0 * * * * * *`、Message `{"action":"all"}`、启用且 Available。

### 9. 下一步建议

- 先在本地修复并测试微信退款请求头（至少补齐 `Accept`、`User-Agent`），再部署并进行新的单笔验证。
- 在修复完成前不要继续人工重试；后续仍须遵守单笔、脱敏和只读核验边界。

## 补齐请求头后的最终单笔退款诊断

### 1. 完成内容

- 已确认 `.deploy/cloudfunctions/payment-worker/provider.js` 包含固定 `User-Agent: breadshop-cloudbase-payment/1.0`，并保留 `Accept: application/json`。
- 相关本地支付/worker 测试 25 项全部通过。
- 仅更新既有 `payment-worker` 代码，随后以无写入探针确认 Handler=`worker.main`。
- 严格调用一次目标 1 分退款的 `refundOne`，未调用批量 `refund/all`。

### 2. 修改文件

- 仅追加本交接记录。
- 云端仅更新 `payment-worker` 代码；未读取或改写环境变量、权限、网络和触发器。

### 3. 数据库结构影响

无结构变更。目标退款失败记录更新为安全错误码和消息，未修改其他真实数据。

### 4. API 变化

无。没有新增公开接口，也没有执行批量退款。

### 5. 模块影响

- 影响限定为 `payment-worker` 新代码版本和唯一锁定退款的失败重试记录。
- 订单仍保持原支付/退款状态，退款结果事件未新增。

### 6. 重要设计决策

- 代码部署使用 `updateFunctionCode`，保持 `worker.main` 和全部既有配置。
- 先执行无写入入口探针，再执行唯一一次单笔退款。
- 错误消息仅保留最多 160 字的安全摘要，不记录密钥、签名、完整响应或个人信息。

### 7. 未解决问题

- 微信退款接口返回 `WECHATPAY_API_NOT_ENOUGH`，安全消息为“基本账户余额不足，请充值后重新发起”。
- 退款未进入 `processing` 或 `succeeded`，当前无法称为退款成功；需商户基本账户补足余额后再重试。

### 8. 验证方式与结果

- 本地测试：25/25 通过。
- 代码部署 RequestId：`73a90acd-cfd0-47f9-a7a0-00c6ffb6299c`。
- Handler 探针 Function RequestId：`ee06c551-c7bc-4db7-bf26-7701cc3bcfcc`；日志指向 `/var/user/worker.js`。
- 唯一一次 `refundOne` Function RequestId：`e16c9382-85e7-4173-9a53-9785cd9b48d4`；错误码 `WECHATPAY_API_NOT_ENOUGH`，消息“基本账户余额不足，请充值后重新发起”。
- 退款只读查询 RequestId：`3da5ef2a-73a5-44d8-b285-df6242e43327`；`status: pending`、`attemptCount: 28`、错误码与消息如上。
- 订单只读查询 RequestId：`91df525e-b111-4370-ba45-6bfdfbc60e21`；`paymentStatus: paid`、`refundStatus: pending`、已付 1 分、已退 0 分。
- 退款事件只读查询 RequestId：`ee154356-133e-4f6c-a192-ae0beb0b33ae`；0 条。
- 函数状态只读查询 RequestId：`32212e91-08d4-46f8-b194-ca0999848b4f`；`payment-worker` 为 `Active`。
- 定时器只读查询 RequestId：`d3129efe-b333-44e4-ac2e-392d12d5987b`；名称 `payment-worker-every-minute`、cron `0 * * * * * *`、Message `{"action":"all"}`、启用且 Available。

### 9. 下一步建议

- 商户补足微信支付基本账户余额后，再发起下一次严格限定的单笔退款重试。
- 重试前继续使用相同的脱敏日志和只读核验边界；只有 `refundStatus=succeeded` 且 `refundedAmountFen=1` 才能确认成功。
