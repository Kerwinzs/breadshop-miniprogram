# 商家后台管理系统架构与实施边界

> 对外展示名称为“UDii 有笛-商家端”；CloudBase 应用和工程标识仍为 `breadshop-backend`，不随展示名称变更。

> 状态：`merchant-auth` 与 `merchant-admin` 已部署并完成受控真实函数回归；后台已作为独立 CloudBase 应用 `breadshop-backend` 部署，当前版本为 `breadshop-backend-007`。`auditLogs` 已创建为私有集合，仅用于后台审计。匿名身份初始化、`merchant-auth` 浏览器登录、会话校验、错误密码拒绝、登出和 `merchant-admin` 的令牌校验均已在真实应用域名验证。
>
> 本文只描述商家端的目标边界和实现顺序，不把规划中的函数、集合或页面写成已上线能力。用户端业务规则仍以 `prd.md`、用户端接口以 `docs/api.md`、用户端集合字段以 `docs/sql.md` 为准。

> 2026-09-07 支付配置核验：`merchant-auth`、`merchant-admin` 的布尔健康检查已部署，线上返回 `authConfigured=true`、`paymentPermissionsReady=true`、`refundQueueEnabled=true`。支付查看/退款权限及退款队列已就绪；配置后必须重新登录，使短令牌包含最新权限。真实退款资金回归仍未完成。

## 0. Web 身份与调用安全（当前部署事实）

- 后台静态网站启动时必须先使用 CloudBase Web SDK 的 Publishable Key 调用 `auth.signInAnonymously()`，并确认 `auth.getSession()` 返回真实会话；匿名身份只用于满足云函数调用的身份层，不具备商家角色、业务集合读写或管理权限。
- Publishable Key 是可公开的浏览器配置，不得与商家密码哈希、令牌签名密钥或永久管理员令牌混用。前端未完成匿名身份初始化时，必须阻止 `merchant-auth.login`/`verifySession` 请求并显示安全错误。
- 当前环境已启用匿名登录提供方，默认静态域名和 `*.webapps.tcloudbase.com` 已在 Web Auth client domains 和安全域名中登记。独立应用 `breadshop-backend` 的真实 URL 为 `https://breadshop-backend-cloud1-d9gc800bmc6952073.webapps.tcloudbase.com`，其匿名身份初始化成功并已进入登录页。
- 云函数规则是环境共享 JSON。经明确授权后，当前规则保留原 `*` 条目 `auth != null && auth.loginType != 'ANONYMOUS'` 不变，并新增 `merchant-auth`、`merchant-admin` 两个专属 `invoke: "auth != null"` 条目。具体函数名优先匹配，其他函数继续回退至 `*`；浏览器匿名身份只能抵达这两个商家函数，`merchant-admin` 仍在函数内部强制校验短时效商家令牌和每项权限。回滚时必须完整恢复变更前仅含原 `*` 条目的规则 JSON 后再核验。
- 独立 HTTP 云函数和 `WEB_SCF` 网关路由在 MCP 中有部署字段，但 HTTP 函数仍受同一函数安全规则约束；创建浏览器入口不能绕过权限策略。当前未创建 `merchant-auth-http` 或新网关路由。浏览器已在独立应用完成 `merchant-auth` 登录与会话回归。

## 1. 当前事实与阻塞

本轮只读核验 CloudBase 环境 `cloud1-d9gc800bmc6952073`：

- MCP 登录和环境绑定状态为 `READY`，环境状态为 `NORMAL`，区域为 `ap-shanghai`。
- 环境为传统 CloudBase NoSQL；PostgreSQL 和 MySQL 均未开通。后台应继续使用 NoSQL 集合和云函数，不引入 SQL/RDB 适配层。
- 当前集合包含 `users`、`products`、`stores`、`addresses`、`orders`、`orderStatusHistory`、`feeQuotes` 和 `auditLogs`；商家端仅新增了 `auditLogs`，未创建商家账号、角色、权限或会话集合。已有受控后台写操作会产生审计记录。
- `feeQuotes` 权限已只读核验为 `PRIVATE`。其余集合的商家专用权限、商家身份和角色权限尚未配置。
- `auth`、`catalog`、`address`、`fee`、`order` 五个用户端函数、`merchant-auth` 与 `merchant-admin` 均为 `Active/Available`；本阶段未修改用户端函数代码或调用权限。
- `backend/` React+TypeScript+Vite+Ant Design 工程已构建并作为独立 CloudBase 应用 `breadshop-backend` 部署；当前应用版本 `breadshop-backend-007` 状态为 `SUCCESS`。生产构建通过被忽略的本地 `.env.production` 注入公开的 `VITE_CLOUDBASE_ENV_ID` 与 Publishable Key，不含商家密码、密码哈希、签名密钥或永久令牌。`merchant-auth` 的真实账号登录和会话验证已完成；`merchant-admin` 已验证缺失/伪造令牌返回 `AUTH_REQUIRED`，管理员令牌可读取订单、商品、门店和审计日志。已有受控后台写操作均可在 `auditLogs` 中追溯。

因此，线上后台登录已经完成受控验收。平台规则允许匿名 CloudBase 身份到达两个商家函数，但该身份不是商家账号，不能用页面隐藏菜单替代服务端鉴权；`merchant-admin` 会继续校验令牌和动作权限。首个商家账号必须通过受控的初始化流程创建，不能在公开登录页自助注册。配置模板仅存放在 `backend/config.example` 和 `cloudfunctions/merchant-auth/config.example`，真实值不得提交。

## 2. 技术边界

### 2.0 后台交互与视觉基线

- 商家后台使用“经营概览、订单工作台、商品与分类、门店管理、操作记录”作为一级信息架构，页面标题同时说明当前任务，主要操作固定放在页头。
- 视觉遵循 `v1/brand-spec.md` 的天蓝、奶油白、浅草莓粉和珊瑚粉色板，使用 Ant Design 主题 Token 与共享 CSS 实现；不引入新的重型 UI 依赖。
- 订单表格在窄屏可水平滚动，详情抽屉在手机宽度占满视口；侧边导航在窄屏转为顶部水平导航。商品图片、规格编辑和筛选表单随宽度自适应，不改变原有字段、验证和权限边界。

### 2.1 Web 前端

目标目录为 `backend/`，技术栈为 React + TypeScript + Vite + Ant Design；已接入真实商家云函数，提供登录页、路由守卫、订单、商品、门店和审计日志页面。

- 使用 `@cloudbase/js-sdk` 初始化目标环境并调用受保护的商家云函数。
- 浏览器不得直接读取或写入 NoSQL 集合；商品、门店、订单、状态历史和审计写入全部经过云函数。
- `localStorage/sessionStorage` 只保存短期会话凭证和非敏感 UI 状态，不保存密码、完整手机号、完整地址或可伪造的权限结果。
- `RequireAuth` 在渲染后台路由前调用会话校验；未验证成功只能停留在 `/login`。
- `RequirePermission` 只负责界面可见性，最终权限必须由云函数再次校验。

### 2.2 商家身份验证

第一阶段采用独立商家账号密码，不复用微信 `openid`：

1. 浏览器向 `merchant-auth.login` 提交账号和密码。
2. 云函数读取 `merchantUsers`，使用服务端保存的加盐密码哈希验证；数据库中不得保存明文密码。
3. 登录成功后返回短时效会话令牌和最小身份信息（`merchantUserId`、`roleId`、过期时间）。令牌签名密钥只放云函数环境密钥，不进入前端包。
4. 所有商家 API 在服务端验证令牌、账号状态、角色和动作权限；过期、签名无效、账号禁用统一拒绝。
5. 首阶段可采用短时效令牌；会话撤销、刷新令牌和多设备管理需在确定 `merchantSessions` 集合后再实现，不能伪造“已支持退出所有设备”。

建议动作：`login`、`verifySession`、`logout`。`logout` 至少清理浏览器凭证；若要求服务端立即撤销，必须增加服务端会话存储或令牌黑名单设计。

### 2.3 权限模型

第一阶段保留一个服务端角色 `merchant_operator`，但权限以独立 permission ID 校验，后续可拆分 `admin`、`staff`：

| 权限 | 范围 |
| --- | --- |
| `orders.read` | 查看订单列表和订单详情的非敏感字段 |
| `orders.address.read` | 查看配送订单地址快照中的联系人、电话和完整地址 |
| `orders.advance` | 按场景合法流转推进订单状态 |
| `orders.cancel` | 主动撤销未完成订单，必须填写原因 |
| `products.read` | 查看商品和规格 |
| `products.write` | 新增或修改商品展示、价格、库存、规格、启用状态 |
| `products.delete` | 删除商品目录记录，不修改历史订单快照 |
| `products.toggleSoldOut` | 切换商品售罄/恢复销售 |
| `stores.read` | 查看门店 |
| `stores.create` | 新增门店目录记录 |
| `stores.write` | 编辑门店名称、地址展示、营业时间、启用状态和距离文案 |
| `stores.delete` | 删除门店目录记录，不修改历史订单门店快照 |
| `stores.toggleOpen` | 切换门店营业/休息 |
| `auditLogs.read` | 查看审计记录 |
| `payments.read` | 查看订单支付状态及应付、实付和退款金额 |
| `refunds.create` | 对已支付且尚未制作的订单申请整单退款 |
| `refunds.retry` | 重试退款失败的整单退款请求 |
| `merchantUsers.manage` | 后续管理商家账号和角色，首阶段默认不开放 |

角色、权限、账号状态和权限变更必须由服务端读取。`merchantUsers`、`roles`、`permissions`、`auditLogs` 尚未创建，不能把它们当作当前线上资源。

## 3. 数据管理范围

### 3.1 商品与分类

- `products` 可管理：`name`、`desc`、`detailDesc`、`category`、`imageUrls`、`priceFen`、`deliveryPriceFen`、`stockQuantity`、`specs`、`supportsPickup`、`supportsLocalDelivery`、`supportsShipping`、`enabled`、`sortOrder` 和 `soldOut`。新增商品必须有至少一个规格和非负库存；删除只移除目录记录，历史订单快照保持不变。
- 商品表单不再直接暴露单一 `enabled` 开关，而是显示“到店自取上架”和“外卖/邮寄上架”。自取开关写入 `supportsPickup`；配送开关发生变化时联动写入 `supportsLocalDelivery` 与 `supportsShipping`，未改变时保留存量记录中两种配送能力的差异。`enabled` 保留为内部兼容总开关，由任一分支上架自动置为 `true`，两个分支均下架时置为 `false`。读取旧数据时 `enabled=false` 优先表示两端均下架；缺少三个支持字段仍按历史默认 `true` 兼容。
- 发布兼容窗口内，`catalog` 对未传购买场景的旧版小程序维持全局 `enabled` 目录行为；新版小程序显式传场景后才应用分支上架过滤。不得在新版小程序完成审核和覆盖前把场景参数收紧为必填。
- 商品图片沿用 `products.imageUrls`，每个商品最多 5 张；数组第一张是自取与配送商品卡片、详情页的封面，商家端可用上移/下移调整数组及展示顺序。商家端原图仅接受 JPEG/PNG/WebP、单图不超过 10MB、宽高均为 600–6000px、宽高比 0.6–1.8；上传前保持比例缩放到最长边不超过 1600px，转换为不超过 1MB 的 JPEG，不强制裁切。服务端重新校验 JPEG 魔数、实际尺寸、比例和体积后才写入 `product-images/<productId>/`；商品保存只接受目标环境返回的 `cloud://` 文件 ID，不接受任意远程 URL。从表单移除/替换图片只更新 `imageUrls`，不立即删除存储对象，避免商品保存失败时无法回滚；孤儿文件需后续受控清理。
- 本地方案新增独立 `productCategories` 集合和分类管理接口，支持新增、改名、排序、启用/停用和未引用分类删除。`products.category` 仍保存分类名称字符串以兼容现有用户端；改名在同一事务中同步商品，达到 100 条查询上限时明确拒绝，不允许部分改名。停用分类对已有商品仍可见，但不可分配给新商品或改分类的商品。本地代码尚未创建线上集合或部署。
- 商品编辑提供 `desc`（商城卡片简述，最多 80 字）和 `detailDesc`（详情介绍，最多 500 字）。用户端详情在 `detailDesc` 为空时回退使用 `desc`。
- 商品页提供独立的“设置今日推荐”入口，可一次选择 0～6 件商品并上下调整顺序。保存时由 `merchant-admin.saveHomeRecommendations` 在同一事务内更新商品的 `homeRecommended` 与 `homeRecommendOrder`，并追加一条推荐列表审计记录；不修改商品价格、场景上架能力或历史订单快照。首页通过 `catalog.listHomeRecommendations` 读取，已下架、无库存或无启用规格的商品自动隐藏。
- 商品编辑表单同步预览“到店自取”和“外卖/邮寄”的商品卡片及详情关键信息，直接复用当前表单中的 `imageUrls`、`desc`、`detailDesc`、`priceFen`/`deliveryPriceFen`（表单以元编辑）和 `specs`，不产生额外数据库字段。预览用于编辑检查，不代表商品已经保存或发布。
- 商品价格和规格变更只影响后续报价和订单；历史订单的 `items` 快照、金额和费用不得回写。
- 商品编辑表单可直接新增、改名、设置规格加价、启用/停用、上下排序和确认删除规格。每个商品至少保留一个且至少启用一个规格，`specId` 在商品内唯一，加价为非负整数分；停用规格不再供新的顾客选择。如需暂停整个商品，应下架商品或设为售罄，不应停用全部规格。

### 3.2 门店

- `stores` 可新增、编辑、删除：名称、地址展示、营业时间、`enabled`、`status` 和距离文案。新增时由商家指定不可重复的 `storeId`；删除需前端二次确认，只删除当前门店目录记录，既有 `orders.storeSnapshot` 保持不变。
- `status` 只能在 `open`/`closed` 之间切换；下单函数仍须再次校验门店状态。
- 门店状态、商品售罄和商品编辑都必须产生审计记录。

### 3.3 地址与隐私

- `addresses` 是顾客自有地址集合，不属于商家地址 CRUD 范围；后台不能修改、删除或设默认地址。
- 订单详情只在拥有 `orders.address.read` 时显示配送地址，默认列表脱敏。后台不直接查询 `addresses` 集合。
- 商家不得修改订单中的 `addressSnapshot`；如需纠错，应另行设计客服流程，不覆盖历史快照。
- 所有订单详情提供浏览器原生打印入口，打印商品名称、规格、数量、单价、小计和费用合计。配送订单同时打印 `addressSnapshot` 中的收件人姓名、电话和完整地址，缺少 `orders.address.read`、地址快照或任一必要收件字段时禁止打印；自取订单打印 `storeSnapshot` 中的门店名称、地址和营业时间。订单工作台可按当前筛选分页拉取全部结果并导出带 UTF-8 BOM 的 CSV；无地址权限时配送敏感列留空并明确提示。打印和导出均不另查 `addresses`。

### 3.4 订单与状态推进

后台首页通过只读 `getDashboardSummary` 展示当前待处理、制作中、履约中数量，最早五笔待处理订单，以及按中国时区计算的今日订单数、订单金额、完成数、取消数、待处理数和近 7 天订单数/订单金额趋势。订单金额只表示订单金额，不是实收或流水入账；当前未接入支付。首页不写入订单、订单历史或审计日志。

订单工作台默认打开待处理（`placed`）队列。队列为待处理、制作中、履约中（`ready_for_pickup`/`delivering`/`awaiting_shipment`/`in_transit`）、已完成、已取消；待处理按 `createdAt` 升序，其余按降序。列表显示等待时长、场景/配送方式、商品数、订单金额和唯一的下一步状态动作；关键词、场景和配送方式收纳于更多筛选。选择到店自取时，配送方式筛选禁用并清空。新订单提醒进入待处理队列。

后台可读 `orders`，按创建时间、场景、配送方式和状态分页筛选；订单列表和详情均显示顾客下单时间。详情展示订单快照中的商品名称、规格、单价、数量、小计、费用拆分、门店信息或配送收件信息、关键时间和状态历史；订单金额、归属、商品/地址/门店快照均为只读。配送收件人、电话和完整地址仅在服务端确认具有 `orders.address.read` 时返回，页面不得自行补查 `addresses`。

首页和订单工作台停留期间每 30 秒只读轮询 `placed` 订单。首次成功读取仅建立各自页面会话基线；后续仅当出现此前未见的订单号且该订单仍为 `placed` 时计入未读提醒。首页在待处理工作台入口显示红点和清晰提示，订单页显示新订单提醒；点击任一提醒均进入默认的待处理队列。旧订单、已有订单的状态变化、离开页面后的后台轮询都不得触发“新订单”提示；不使用浏览器推送，也不因提醒写入订单或审计数据。

合法状态流转：

```text
自取：placed → preparing → ready_for_pickup → completed
同城外卖：placed → preparing → delivering → completed
快递邮寄：placed → preparing → awaiting_shipment → in_transit → completed

商家端将两组配送必拍内容作为 `products` 目录中的真实商品管理，与普通商品一起显示在商品列表中，不设独立顶部专区。固定分类名称均为“拍前必读”，默认规格均为 `standard`。快递组稳定标识为 `shipping-required-packaging`、`shipping-required-sf-collect`、`shipping-required-notice`；同城组稳定标识为 `local-required-packaging`、`local-required-delivery-collect`、`local-required-notice`。自动逻辑只绑定稳定 `productId`，因此商家可以维护名称、图片、卡片简述、详情说明和展示排序，但不能修改分类、商品标识、standard 规格、数量 1 或各自 shipping-only/local-only 的必选语义。两组打包商品的配送价格可编辑，另外四个到付说明/拍前必读商品价格固定为 0。商品自动加购和订单端校验由客户端/服务端对应模块实现，商家 UI 不自行模拟这些结果。

商品列表按分类的 `sortOrder`、商品的 `sortOrder` 从小到大展示；相同排序值时最近一次保存的记录优先，再以稳定标识兜底。两组配送必拍商品的目录展示与自动加入购物车顺序均遵循这一结果，不再使用固定 `productId` 顺序。

商品与分类页支持“导出当前筛选”：沿用当前商品关键词和分类条件，自动分页读取全部匹配记录而不是仅导出当前表格页。CSV 包含商品标识、名称、分类、自取价、配送价、库存、销售状态、到店自取/同城外卖/快递邮寄三种上架状态、规格、排序、今日推荐和最近更新时间；配送必拍商品库存显示为“固定充足”。导出仅使用现有 `listProducts` 只读接口，不新增数据库字段。

商品与分类页支持“一键上架当前筛选”和“一键下架当前筛选”。批量操作沿用已提交的商品关键词与分类条件，对匹配的普通商品同时设置 `enabled`、`supportsPickup`、`supportsLocalDelivery`、`supportsShipping`：上架时全部为 `true`，下架时全部为 `false`。固定配送必拍商品保持其 local-only/shipping-only 语义并被跳过，结果明确反馈匹配、更新和跳过数量。服务端要求 `products.write`，在事务内更新商品版本并写入 `products.bulkListing.write` 审计记录；为避免部分更新，达到单次安全上限时要求缩小筛选范围。
```

- 顾客仍只能从 `placed` 取消。商家可撤销任何未完成、未取消订单，但必须填写 1 至 200 字的取消原因；不涉及退款或金额修改。前端只提供服务端计算出的唯一“下一状态”按钮，不允许手动任意选择目标状态。
- 状态推进必须在服务端校验当前状态、购买场景和配送方式，并以事务追加 `orderStatusHistory`。
- 商家撤销也必须在事务中更新订单、恢复有限库存、追加 `orderStatusHistory` 与 `auditLogs`；已完成或已取消订单一律拒绝撤销。
- 当前版本未接入支付，商家撤销不会产生退款。后期接入支付后，若订单已经支付，商家撤销必须触发原支付渠道的原路退款；订单撤销、退款请求、退款成功和退款失败是彼此独立的事实，必须分别记录撤销原因、时间和对应流水号。退款失败时不得伪装为撤销和退款均成功，也不得把订单标记为“已退款”，需要保留可重试或人工处理的状态。
- 商家端不得复用用户端本地 `advanceMockOrder`/`advanceDeliveryOrder`，也不得新增面向用户的 Mock action。
- `orderNo`、`ownerOpenId`、`clientRequestId`、费用字段、快照、创建/取消/完成时间均只能由服务端写入或由既有用户端流程产生。

### 3.5 审计

商家所有写操作追加 `auditLogs`：订单状态推进，商品新增、编辑、删除、售罄切换，门店资料编辑和营业状态切换都会记录 `actorId`、`actorRole`、`action`、`targetType`、`targetId`、变更前后允许审计的字段、原因、请求 ID 和服务端时间。日志只追加、不提供前端删除或覆盖；手机号和完整地址不得写入日志。后台审计页以中文显示操作和对象，支持查看每条记录的变更前后内容，用于事后确认“谁在何时改了什么”，不是顾客订单历史。

`orderStatusHistory` 记录订单状态事实；`auditLogs` 记录谁在后台执行了什么管理动作，两者不能混为一张表。

本阶段线上部署唯一必需的新集合是 `auditLogs`，其最小文档为：

```json
{
  "actorId": "服务端令牌中的商家账号",
  "actorRole": "merchant_operator",
  "action": "orders.advance | orders.cancel | products.create | products.write | products.delete | products.toggleSoldOut | stores.create | stores.write | stores.delete | stores.toggleOpen",
  "targetType": "order | product | store",
  "targetId": "业务标识",
  "before": { "仅允许审计的变更前字段": "值" },
  "after": { "仅允许审计的变更后字段": "值" },
  "reason": "可选且最长 200 字符",
  "requestId": "可选请求标识，最长 80 字符",
  "createdAt": "CloudBase 服务端时间"
}
```

建议在创建时核验 `createdAt(desc)` 和 `targetType + targetId + createdAt(desc)` 索引。集合权限应保持私有，仅允许 `merchant-admin` 服务端读写；浏览器不得直接访问。`merchantUsers`、`roles`、`permissions`、`merchantSessions` 不是当前单管理员、服务端环境变量认证方案的部署前置条件，因此本阶段不创建。

## 4. 后端接口边界

建议使用两个新的云函数域，名称和部署前需主 Agent 确认：

### `merchant-auth`（已部署；商家管理函数本地实现未部署）

- `login({ account, password })`
- `verifySession({ token })`
- `logout({ token })`

返回统一 `{ ok, data }` / `{ ok: false, error }`；密码只在 TLS 请求中提交，云函数只比较哈希，不回传哈希。

本地实现使用 `cloudfunctions/merchant-auth/config.example` 中的变量名：`MERCHANT_ACCOUNT`、`MERCHANT_PASSWORD_HASH`、`MERCHANT_TOKEN_SECRET`、`MERCHANT_ROLE_ID`、`MERCHANT_PERMISSIONS`、`MERCHANT_TOKEN_TTL_SECONDS`。真实值只能注入云函数服务端环境配置；不得放入 `backend/config.example`、前端 `VITE_*` 变量、静态资源、浏览器存储或 Git。签名密钥至少 32 字节，令牌有效期由服务端限制在 60 至 3600 秒。

### `merchant-admin`（已部署；首页与订单工作台扩展已于 2026-08-19 发布）

- 商品：`listProducts`、`getProduct`、`createProduct`、`saveProduct`、`bulkSetProductListing`、`saveHomeRecommendations`、`uploadProductImage`、`deleteProduct`、`toggleSoldOut`；分类：`listProductCategories`、`createProductCategory`、`saveProductCategory`、`deleteProductCategory`
- 页面内容：`getPageConfiguration`（products.read）、`savePageConfiguration`（products.write）、`uploadPageContentImage`（products.write）。配置仅覆盖首页/个人页标注区域，图片由服务端校验后写入 `page-content/{pageId}/`，不再使用本机草稿。
- 门店：`listStores`、`getStore`、`createStore`、`saveStore`、`deleteStore`、`toggleStoreOpen`
- 订单：`getDashboardSummary`、`listOrders`、`getOrder`、`advanceOrder`、`cancelOrder`
- 审计：`listAuditLogs`

本地接口统一支持 `page`/`pageSize`（默认 1/20，最大 100）；订单支持 `keyword`、`purchaseScene`、`deliveryMethod`、`orderStatus`、`orderStartDate`、`orderEndDate`、只读 `queue`（`pending`/`preparing`/`fulfilling`/`completed`/`canceled`）和只读 `sort`（`createdAtAsc`/`createdAtDesc`）。订单日期参数格式为 `YYYY-MM-DD`，服务端按中国时区（UTC+8）匹配 `createdAt`：开始日期包含当天 00:00，结束日期包含当天全天并以次日 00:00 为排除上界；开始日期不得晚于结束日期。列表、分页和“导出当前筛选”使用同一组筛选参数。`queue=pending` 默认按创建时间升序，其他队列默认降序；响应带全队列数量 `queueCounts`。`getDashboardSummary` 不接受写入参数，只返回汇总 DTO。商品支持 `keyword`/`category`，审计支持 `auditAction`、`actorId`、`targetType`、`keyword`、`auditStartDate` 和 `auditEndDate`。审计日期参数格式为 `YYYY-MM-DD`，按中国时区（UTC+8）匹配 `createdAt`；开始日期从当天零点起包含，结束日期包含当天全天。`auditAction` 不与云函数路由字段 `action=listAuditLogs` 复用。商品和门店编辑只接受现有字段白名单，商品价格由前端元转换为分后再提交，服务端再次校验整数金额；商品编辑支持版本冲突拒绝。列表读取仅返回管理 DTO，订单地址需要 `orders.address.read`，审计仅返回脱敏审计 DTO。

每个动作都必须在入口完成会话验证和 permission 校验。`saveProduct`、`toggleSoldOut`、`toggleStoreOpen`、`advanceOrder`、`cancelOrder` 必须在服务端事务/原子更新与审计写入边界内完成；任何客户端传入的角色、操作者、金额、归属和状态前值均不可信。

本地实现对每次写操作先检查 `auditLogs` 集合。该集合尚未创建时返回 `AUDIT_LOG_UNAVAILABLE` 并拒绝写入，避免发生无法审计的订单、商品或门店变更。`advanceOrder` 仅允许按购买场景和配送方式推进到唯一下一状态；`cancelOrder` 只允许撤销未结束订单且必须有原因。两者都在同一事务中更新 `orders`、追加 `orderStatusHistory` 和 `auditLogs`，取消时恢复有限库存。

单管理员令牌包含 `orders.read`、`orders.address.read`、`orders.advance`、`orders.cancel`、`products.read`、`products.write`、`products.delete`、`products.toggleSoldOut`、`stores.read`、`stores.create`、`stores.write`、`stores.delete`、`stores.toggleOpen`、`auditLogs.read`。其中 `orders.address.read` 用于在配送订单详情中显示收件人、电话和完整地址。权限修改后必须重新登录取得新令牌；前端页面隐藏或禁用按钮不能替代该服务端校验。

当前仍不提供：商家直接编辑顾客地址、支付/退款、库存流水、真实配送、真实邮费、订单金额修改、用户端 `prepareReorder`、用户端 `advanceMockOrder` 和商家报表。支付接入后的退款流程属于后续阶段，当前仅记录业务约束，不代表已有实现。

## 5. Ant Design 路由与最小闭环

建议路由：

| 路由 | 页面 | 首阶段权限 |
| --- | --- | --- |
| `/login` | 商家登录 | 无；仅登录接口 |
| `/` | 首页、待处理优先和近 7 天只读趋势 | `orders.read` |
| `/orders` | 订单列表、筛选、分页 | `orders.read` |
| `/orders/:orderNo` | 订单详情、合法状态推进 | `orders.read`；推进需 `orders.advance` |
| `/products` | 商品列表、售罄切换 | `products.read`；修改需对应写权限 |
| `/stores` | 门店列表、营业切换 | `stores.read`；切换需 `stores.toggleOpen` |
| `/audit-logs` | 审计查询 | `auditLogs.read` |

最小可用闭环：登录验证 → 订单列表 → 订单详情 → 合法推进一次状态 → `orderStatusHistory` 和 `auditLogs` 可查询；商品售罄切换与门店营业切换作为同一阶段的第二个闭环。无有效会话或权限时，路由守卫和服务端均拒绝访问。

## 6. 实施顺序与前置条件

1. 保持已部署的服务端账号、密码哈希、令牌有效期和密钥托管配置，不将敏感值提交到仓库。
2. 创建并核验唯一必需的 `auditLogs` 集合、索引及私有权限；本轮不执行创建。
3. `merchant-auth` 已完成真实账号登录、失效和权限负向回归。
4. `merchant-admin` 已在本地实现订单查询/状态推进、商品售罄/编辑和门店营业切换；每项写入都配套审计，待审计集合和函数调用权限明确后部署。
5. `backend/` 已接入受保护路由、错误态、订单/商品/门店/审计页面和真实函数调用层；静态站点仍不得部署。
6. 解除函数级浏览器登录权限阻塞后，使用真实订单做状态流转回归，确认用户端订单详情、历史记录和商家审计一致；禁止使用本地 Mock 推进替代。

当前限制：匿名 Web 身份仅可调用 `merchant-auth` 与 `merchant-admin`，不能调用用户端函数；后者仍必须通过商家令牌和权限校验。`auditLogs` 已创建并核验为 `PRIVATE`，包含 `createdAt(desc)` 与 `targetType + targetId + createdAt(desc)` 索引；商家函数和独立应用已部署。用户端 `auth`、`order`、`address` 未在本轮浏览器直接发起调用，不应把规则读取替代为该三项的真实匿名调用回归。

### 6.1 支付模块开发环境状态（已部署，未真实资金回归）

- 订单履约状态与 `paymentStatus`、`refundStatus` 分离；只有已支付订单可从“已下单”进入制作。
- 未支付订单撤销关闭支付并释放库存；已支付且尚未制作的订单撤销会创建 `refundNo=R<orderNo>` 的整单退款请求，不会直接标记退款成功。
- 后台在拥有 `payments.read` 时显示应付、实付、退款金额；首页资金摘要仅为运营参考，不是财务报表或渠道对账结果。
- 退款执行 worker、支付通知入口、服务端商户配置、集合和索引均已部署到开发环境；`payment` 健康检查为 `configured=true`，但 `order` 总开关仍为 `paymentEnabled=false`。真实支付和退款回归完成前不得描述为正式可用。

## 7. 可部署前检查清单（本地）

- [ ] 生成随机管理员账号、scrypt 密码哈希和至少 32 字节随机签名密钥；仅通过受控的 CloudBase 云函数环境配置注入。
- [ ] 确认目标 EnvId 为 `cloud1-d9gc800bmc6952073`（当前仅开发/测试环境），不要把账号或密钥写进代码。
- [x] 仅部署 `cloudfunctions/merchant-auth/`，函数名称、运行时和环境变量映射已核验。
- [x] 为 Web 静态站点配置实际访问 origin 的 CloudBase 安全域名/CORS，并确认 `merchant-auth` 的专属匿名已认证调用权限；原 `*` 默认规则保持不变。
- [x] 安装 `backend/package.json` 依赖并运行 `npm --prefix backend run build`。
- [x] 使用真实受控账号验证正确登录、错误密码、会话校验和登出后的本地会话清理；未在本轮验证缺失配置、过期或篡改令牌。
- [x] 已创建并核验最小 `auditLogs` 集合、私有权限和两个索引；未创建 `merchantUsers`、`roles`、`permissions` 或 `merchantSessions`。
- [x] 已部署 `merchant-admin` 与后台静态站点，并完成真实认证、令牌负向和管理员只读列表回归。
- [x] 已验证独立应用真实 URL 的配置注入、匿名身份初始化、登录页渲染、正确登录、错误密码、会话校验和登出；未执行任何管理写操作。
- [x] `merchant-auth` 已具备经规则核验的浏览器匿名已认证调用权限；订单推进、售罄和门店营业等真实写入回归仍需要单独授权。

本地可用静态检查：`node tests/merchant-auth-contract.test.js`、`node tests/merchant-admin-token.test.js`、`node --check cloudfunctions/merchant-auth/index.js`、`node --check cloudfunctions/merchant-admin/index.js`、`npm --prefix backend run build` 和 `git diff --check`。
> 2026-09-09 批量上下架功能已部署：`merchant-admin` 为 `Active`；商家后台静态版本 `breadshop-backend-026`，BuildId=`2602264336`，状态 `SUCCESS`。当前筛选批量操作同时控制普通商品的到店与外卖/邮寄上架，固定配送必拍商品按规则跳过。
