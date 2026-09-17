# 支付秘密受控注入能力调查（2026-09-05）

## 调查范围

- 仅查询 CloudBase MCP 官方工具说明。
- 未读取 `/private/tmp/breadshop-payment-config.json`。
- 未读取任何线上函数环境变量值。
- 未调用 CloudBase CLI、网页控制台或其他替代渠道。
- 未执行任何 CloudBase 写操作。

## MCP 可见能力

### 云函数

`manageFunctions` 支持：

- `action=updateFunctionConfig`
- `functionName`
- 配置更新时的环境变量映射字段
- `timeout`
- `vpc`

其环境变量能力要求调用方直接提供键和值。官方说明只描述“合并环境变量”，未提供以下安全输入字段：

- 本地文件路径，例如 `envFilePath`、`secretFilePath`
- Secret Manager 引用，例如 `secretRef`、`secretKeyRef`、`valueFrom`
- 仅在 MCP 服务端读取的文件描述符
- 遮蔽/不记录输入，例如 `masked`、`sensitive`、`redactedInput`
- 交互式秘密输入通道

### 云托管

`manageCloudRun` 的 `EnvParams` 文档说明 SDK 新版本可对传输内容做 AES-256-CBC 加密，但调用方仍需在 MCP 工具参数中提供包含真实值的 JSON 字符串。传输加密不能阻止真实值进入 Codex 对话、工具调用参数或本地调用日志，因此不满足本项目要求；该能力也不是当前 Event 云函数的配置入口。

### 认证临时凭证

`auth.get_temp_credentials` 支持 `reveal=false` 返回脱敏信息，但它只用于 CloudBase 管理认证临时凭证，不是向业务函数注入微信支付秘密的通道。

## Secret Manager 调查

当前 CloudBase MCP 工具目录及官方 MCP 工具说明中未发现以下能力：

- 创建、读取或绑定 Secret Manager 秘密的专用工具。
- 将函数环境变量绑定到 Secret Manager 名称/版本而不传真实值。
- 让 MCP 服务端从权限为 600 的本地文件直接读取并注入、且不回显内容。

文件权限 600 只能限制操作系统层面的文件访问；如果 Codex 必须先读取文件再把内容组装进 `updateFunctionConfig` 参数，秘密仍会进入模型上下文和工具调用日志，不能视为安全注入。

## 结论

当前 CloudBase MCP **不支持符合本项目安全规则的支付秘密注入方式**。

现有可用路径最终都要求把明文值放入 MCP 工具参数。即使底层网络传输加密，也无法满足“真实值不得进入 Codex 对话或工具调用日志”的约束。因此不得使用 `manageFunctions.updateFunctionConfig` 由 Codex 注入真实微信支付配置，也不得让 Codex读取本地权限 600 文件后代填。

## 安全边界

- 可以由 Codex查询字段名、配置项是否存在、函数状态和脱敏元数据。
- 不可以由 Codex读取、转述、转换、编码或提交真实秘密。
- 不可以把 base64、哈希或加密后的秘密误当作安全替代；只要该值可用于运行时恢复或认证，仍属于秘密。
- 后续应由不经过模型上下文的受控人工/CI秘密通道完成注入，并只向 Codex返回“配置项名称已存在/缺失”的脱敏结果。

## 建议的后续方式

由项目负责人使用独立于 Codex 会话的受控配置渠道完成注入，例如具备秘密遮蔽和审计能力的 CI/CD secret store 或云平台原生秘密管理流程。完成后仅提供配置键名存在性与配置版本/时间等非敏感证据，再由 Codex执行只读健康检查；在此之前不得启用 `payment-worker` 定时触发器或进行真实支付。
