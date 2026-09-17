# 面包坊项目交付与换账号接手文档

> 文档目的：给更换 Codex 账号、CloudBase 操作账号或开发人员后的接手者使用。本文记录当前仓库、CloudBase 开发环境、用户端和商家端的实现方法、已知边界、验证证据和继续工作的入口。
>
> 安全说明：本文不保存管理员明文密码、密码哈希、`MERCHANT_TOKEN_SECRET`、Publishable Key、临时令牌或完整云函数环境变量值。管理员账号标识为 `admin`；初始密码曾由项目负责人设置，但换账号后必须通过受控安全渠道交接，并建议立即轮换。

## 1. 项目定位与当前阶段

这是一个面包坊微信小程序项目，同时包含独立的电脑端商家后台。

用户端目前的目标是：浏览商品和门店，选择到店自取或外卖/邮寄场景，维护地址，使用独立购物车，微信支付下单并查看订单状态。商家端目前的目标是：单管理员登录、处理订单与整单退款请求、维护商品和门店、查看审计日志。

当前阶段可以概括为：

- 用户端 CloudBase MVP 已接入，用户端下单和订单查询闭环已完成。
- 商家后台第一阶段已经实现并部署：登录、订单工作台、首页概览、商品管理、门店管理、审计日志。
- 当前 CloudBase 环境仍是开发/测试环境，不是生产环境。
- 支付代码和开发环境基础设施已部署：待支付订单、支付/履约双状态、15分钟超时、支付门禁、回调、主动查单和整单退款均已有实现；服务端配置健康检查为 `configured=true`，但 `order` 的支付总开关仍为 `false`，尚未产生真实资金操作。
- 当前仍没有真实配送、真实邮费、物流轨迹、部分退款或正式经营报表。
- 工作树仍有未提交改动；本文不能视为一个 Git 提交或生产发布凭证。

支付第二阶段已完成 API v3 签名/验签和回调资源解密、JSAPI 下单/查单/关单/整单退款请求构造、主动查单/超时/退款 worker、存量免支付订单兼容及自动化测试。开发环境真实商户配置、worker 定时器、支付版订单/商家端部署、支付开关、商家支付/退款权限、退款队列配置和小程序 `1.0.1` 体验版均已完成；剩余为真实资金回归。

2026-09-05/06 后续部署事实：三个支付集合及唯一索引、`payment`、`payment-worker`、`payment-notify`、两条 `/wechatpay/*` 路由和 `payment-worker-every-minute` 已通过 CloudBase MCP 创建；`payment.configurationStatus` 返回 `configured=true`。`order.configurationStatus` 最初返回 `paymentEnabled=false`，用户保存开关后于 2026-09-07 复核为 `true`。完整证据见 `docs/agent-handoff/payment-cloudbase-*.md`、`payment-configuration-health-deploy-2026-09-05.md` 和 `order-payment-switch-health-2026-09-07.md`。

产品规则以 `prd.md` 为最高业务依据；项目级协作规则以 `AGENTS.md` 为准；用户端架构、状态和任务分别见 `PROJECT-ARCHITECTURE.md`、`PROJECT-STATUS.md`、`TASKS.md`；商家端以 `docs/admin.md`、`cloudfunctions/merchant-admin/` 和部署记录为准。

## 2. 仓库结构与模块职责

```text
miniprogram/                    微信小程序用户端
  pages/                        首页、商品、购物车、结算、订单、地址等页面
  utils/                        本地状态、CloudBase 调用和 repository 适配
  assets/                       小程序本地图片和 Tab 图标
cloudfunctions/
  auth/                         微信身份登录
  catalog/                      商品、门店目录读取
  address/                      用户地址 CRUD 和默认地址
  fee/                          配送报价
  order/                        创建、查询、取消订单和状态历史
  merchant-auth/                商家账号密码登录、会话校验、登出
  merchant-admin/               商家订单、商品、门店、审计接口
backend/                        React + TypeScript + Vite + Ant Design 商家网页
  src/cloudbase.ts              Web SDK 初始化和匿名身份
  src/auth.ts                   商家短时会话存储和认证调用
  src/admin-api.ts              merchant-admin 调用封装
  src/App.tsx                   路由、页面、权限显示和工作台交互
  src/styles.css                商家后台样式
tests/                          本地契约、权限和 UI 静态测试
docs/                           接口、数据库、部署、商家设计和本交付文档
prd.md                          产品规则唯一依据
AGENTS.md                       项目级 Agent 和协作者规范
```

原型与历史快照仍保留在仓库中，但不是当前商家端运行代码。`docs/archive/` 中的文件只用于历史参考，不作为当前事实源。

## 3. 用户端已经实现的功能

### 3.1 场景和购物车

- 购买场景为 `pickup`（到店自取）或 `delivery`（外卖/邮寄）。
- 配送场景还需要 `local`（同城外卖）或 `shipping`（快递邮寄）。
- 自取购物车和配送购物车独立保存，分别是本地状态中的 `pickupCartItems` 和 `deliveryCartItems`；购物车没有云端集合。
- 下单只清空本次提交的场景购物车，不影响另一场景。
- 进入自取流程不会把旧的未区分场景购物车自动迁移进自取购物车；这部分曾有 bug，已在 `miniprogram/utils/store.js` 修正并有 `tests/store-cart-scope.test.js`。

### 3.2 费用和订单

配送订单金额由服务端按“商品总额 + 保温包装费 + 配送费/邮费”重新计算，金额统一使用分。开发环境 Mock 费用为保温包装 200 分、同城配送 600 分、快递邮费 1200 分，不是真实经营报价。

订单状态流：

```text
自取：placed → preparing → ready_for_pickup → completed
同城外卖：placed → preparing → delivering → completed
快递邮寄：placed → preparing → awaiting_shipment → in_transit → completed
```

用户只能在制作开始前取消订单；完成订单支持“再来一单”，由小程序把仍可售商品加入原场景的本地购物车。开发环境支付总开关已开启；现有历史免支付订单取消不产生退款，开关启用后的已支付订单取消会进入整单退款流程。

### 3.3 用户端安全边界

`auth`、`catalog`、`address`、`fee`、`order` 云函数从微信上下文取得 `OPENID`，客户端不能传入其他用户的归属。订单创建时服务端重新读取商品、规格、门店、地址和报价；客户端传入的价格、金额、状态、归属和快照不可信。

配送报价写入 `feeQuotes`，绑定用户、地址、配送方式和商品快照，订单事务中检查过期、篡改、版本和重复消费后一次性消费。订单和首条状态历史在事务内写入，用户端 DTO 不暴露 `ownerOpenId`、`_openid`、内部文档 ID 或操作者 ID。

## 4. CloudBase 环境和线上资源

### 4.1 环境

- EnvId：`cloud1-d9gc800bmc6952073`
- 类型：CloudBase 传统文档型 NoSQL，云函数通过 `wx-server-sdk` 的 `db.collection(...)` 访问。
- 用途：开发/测试。正式上线应新建独立生产环境，不能把当前回归数据直接当生产数据。
- CloudBase 操作约束：部署、集合、索引、权限和函数状态使用 CloudBase MCP；遵循 `docs/MCP-DEPLOYMENT-RUNBOOK.md`。

### 4.2 用户端云函数

部署记录和项目状态记录显示 `auth`、`catalog`、`address`、`fee`、`order` 为 `Active/Available`。无身份的 MCP 调用会返回 `AUTH_REQUIRED`。真实微信正向登录、地址操作、三种下单、订单列表/详情和取消记录在 `docs/WECHAT-POSITIVE-REGRESSION-2026-08-18.md`；负向验收由项目负责人使用真实微信人工确认，未在文档中补写不存在的 trace 或错误码。

### 4.3 商家端线上资源

- 云函数：`merchant-auth`、`merchant-admin`。
- 审计集合：`auditLogs`，私有集合；写操作没有审计集合时会被拒绝。
- 用户端集合：`users`、`products`、`stores`、`addresses`、`orders`、`orderStatusHistory`、`feeQuotes`。
- 商家端没有 `merchantUsers`、`roles`、`permissions`、`merchantSessions` 集合；单管理员模式通过云函数环境变量认证。
- 商家静态应用名称：`breadshop-backend`。
- 当前静态版本为 `breadshop-backend-025`，状态为 `SUCCESS`；`breadshop-backend-008`、`023` 是较早阶段记录。
- 当前访问地址：<https://breadshop-backend-cloud1-d9gc800bmc6952073.webapps.tcloudbase.com>

`docs/admin.md` 中仍有早期段落把商家端写成“尚未部署”或把 `auditLogs` 写成“尚未创建”；这些是历史阶段文字。接手时以本交付文档、`docs/MCP-DEPLOYMENT-RUNBOOK.md` 的 2026-08-19 记录、当前代码和实际 MCP 查询为准，不要据此重复创建集合或重复部署。

## 5. 商家端实现方法

### 5.1 Web 技术和 CloudBase 匿名身份

后台是 `backend/` 下的 React + TypeScript + Vite + Ant Design 单页应用，使用 React Router。浏览器启动时通过 `@cloudbase/js-sdk` 初始化：

1. 从公开构建变量读取 `VITE_CLOUDBASE_ENV_ID` 和 `VITE_CLOUDBASE_ACCESS_KEY`。
2. `ensureAnonymousSession()` 调用 `auth.getSession()`；没有会话时调用 `auth.signInAnonymously()`。
3. 匿名身份只满足 CloudBase 函数调用的身份层，不等于商家账号，也不具备订单、商品、门店或审计权限。
4. 匿名身份初始化失败时，前端阻止商家登录请求并显示配置/连接错误。

Publishable Key（代码变量名为 `VITE_CLOUDBASE_ACCESS_KEY`）是可以公开出现在浏览器构建包里的配置，不应与密码哈希、签名密钥或永久令牌混用。真实值不写入仓库；仓库只有 `backend/config.example` 模板。

CloudBase 函数级规则允许匿名身份到达 `merchant-auth` 和 `merchant-admin`，但两个函数内部仍分别校验商家认证和权限。原有通配 `*` 规则保持不变；不要为了方便把用户端函数改为匿名可调用。

### 5.2 单管理员账号、密码和令牌

当前采用单管理员环境变量模式，不创建账号表：

- 管理员账号标识：`admin`。
- 密码：用户曾设置过初始密码；明文、哈希均不写入本文。换账号或换运维人员后，应通过受控终端重新生成并注入新密码哈希。
- 密码算法：Node.js `crypto.scryptSync`，编码格式为 `scrypt$N$r$p$base64urlSalt$hexDerivedKey`。哈希只存在云函数服务端配置。
- 令牌：认证函数生成自定义 HMAC-SHA256 签名的三段式短时令牌，payload 包含账号、角色、权限、签发时间、过期时间和随机 `jti`。
- 签名密钥：环境变量 `MERCHANT_TOKEN_SECRET`，至少 32 字节随机值，只存在云函数服务端环境配置。
- 默认令牌有效期：900 秒，服务端限制在 60 至 3600 秒。
- 认证环境变量名：`MERCHANT_ACCOUNT`、`MERCHANT_PASSWORD_HASH`、`MERCHANT_TOKEN_SECRET`、`MERCHANT_ROLE_ID`、`MERCHANT_PERMISSIONS`、`MERCHANT_TOKEN_TTL_SECONDS`。

安全注入流程：在受控终端生成随机密码哈希和签名密钥，使用 CloudBase MCP/受控部署流程写入 `merchant-auth` 的服务端环境变量；不要通过聊天、前端 `.env`、Git、日志或交付文档传递真实值。接手后建议立即改密码、重新生成签名密钥并让旧令牌全部失效。

前端只在 `sessionStorage` 保存短期会话令牌、过期时间、账号标识、角色和权限数组。页面刷新会调用 `verifySession`；令牌过期或签名无效时清除本地会话并回到登录页。当前 `logout` 会调用认证函数并清理浏览器凭证，但没有 `merchantSessions`/黑名单，因此不支持服务端即时撤销已经签发的令牌；短时效是主要控制手段。

### 5.3 权限模型

当前角色为 `merchant_operator`。权限放入服务端签发的令牌，并由 `merchant-admin` 每个动作重新校验；前端隐藏按钮只是界面体验，不能作为安全边界。

| 权限 | 作用 |
| --- | --- |
| `orders.read` | 订单列表、详情、首页统计 |
| `orders.address.read` | 查看配送订单联系人、电话和完整地址 |
| `orders.advance` | 按场景推进到唯一下一状态 |
| `orders.cancel` | 撤销未完成订单并填写原因 |
| `products.read` / `products.write` / `products.delete` | 商品读取、新增/编辑、删除 |
| `products.toggleSoldOut` | 商品售罄或恢复销售 |
| `stores.read` / `stores.create` / `stores.write` / `stores.delete` | 门店读取、新增/编辑、删除 |
| `stores.toggleOpen` | 门店营业/休息切换 |
| `auditLogs.read` | 审计日志读取 |

如果权限环境变量发生变化，管理员必须退出并重新登录取得新令牌。订单地址是受保护信息，即使有订单读取权限，没有 `orders.address.read` 也只能看到不含地址的订单 DTO。

### 5.4 merchant-admin 功能

当前 `merchant-admin` 的动作如下：

```text
订单：getDashboardSummary, listOrders, getOrder, advanceOrder, cancelOrder
商品：listProducts, listProductCategories, getProduct, createProduct,
      saveProduct, deleteProduct, toggleSoldOut
门店：listStores, getStore, createStore, saveStore, deleteStore,
      toggleStoreOpen
审计：listAuditLogs
```

所有动作都要求短令牌和对应权限。商家函数从数据库读取管理 DTO，不让浏览器直接访问集合。

#### 订单首页和工作台

- `/` 是商家首页，调用 `getDashboardSummary`。
- 首页显示待处理、制作中、履约中、已完成、已取消数量；最早五笔待处理订单；今日订单数、今日订单金额、今日完成数、今日取消数和近 7 天趋势。
- “订单金额”是订单中 `totalFen` 的下单金额汇总，不是支付渠道实收流水；即使支付开启，也不能直接把它解释成收入或正式对账结果。
- `/orders` 默认进入 `pending`（`placed`）队列；待处理按最早下单时间升序，其余队列按最新优先。
- 队列：待处理 `placed`；制作中 `preparing`；履约中包含 `ready_for_pickup`、`delivering`、`awaiting_shipment`、`in_transit`；另有已完成和已取消。
- 订单行突出显示下单时间/等待时长、场景、配送方式、商品数量、订单金额和唯一下一步操作。状态推进不能任意跳转。
- 详情显示商品快照、规格、金额拆分、门店或配送收件信息、关键时间和状态历史。地址只在令牌带 `orders.address.read` 时由服务端返回。
- 商家撤销允许未完成订单，必须填写 1-200 字原因；会在事务中更新订单、恢复有限库存、追加订单状态历史和审计日志。当前不退款。

#### 新订单提醒

首页和订单页停留时每 30 秒只读查询 `placed` 订单。首次成功查询只建立基线，后续只有“此前没有见过且仍为 `placed`”的订单才产生未读红点/提醒。已有订单状态变化、离开页面后的后台轮询不会制造新订单提醒。点击提醒进入订单工作台待处理队列；不使用浏览器推送，不写订单或审计数据。

#### 商品和门店

商品支持分类下拉（分类由现有 `products.category` 字符串提取，不是独立 `categories` 集合）、新增、编辑、删除、价格/库存/规格维护、售罄切换和版本冲突保护。商品删除不改历史订单快照。

门店支持新增、编辑、删除、营业/休息切换。门店资料字段有白名单；门店状态只允许 `open`/`closed`。门店和商品的写入均产生审计记录。

#### 审计日志

`orderStatusHistory` 是订单状态事实；`auditLogs` 是“哪个商家账号在什么时候执行了什么管理操作”的记录。审计页支持按操作、对象、操作者、关键词和中国时区日期范围筛选，并查看变更前后字段。日志只追加，不提供前端删除或覆盖；手机号和完整地址不得写入日志。

## 6. 数据集合、字段和权限边界

### 6.1 用户端集合

| 集合 | 主要用途 | 关键边界 |
| --- | --- | --- |
| `users` | 微信用户记录 | `openid` 由云函数取得；有 `openid` 唯一索引记录 |
| `products` | 商品、规格、价格、售罄、库存 | 商家经 `merchant-admin` 管理；用户端目录只读 |
| `stores` | 门店资料、营业状态 | 下单时服务端再次检查 `enabled` 和 `status` |
| `addresses` | 用户收货地址 | 只能由所属微信用户访问；商家不做地址 CRUD |
| `orders` | 订单主记录、商品/地址/门店/费用快照 | `ownerOpenId` 只能由用户端云函数写入；商家只按 DTO 读取/更新状态 |
| `orderStatusHistory` | 订单状态追加记录 | 用户下单/取消和商家推进分别记录；商家不能删除历史 |
| `feeQuotes` | 配送报价短期凭证 | `PRIVATE`；按用户、地址、商品和配送方式绑定并一次性消费 |
| `auditLogs` | 商家管理审计 | `PRIVATE`；仅 `merchant-admin` 服务端读写，不对浏览器开放 |

### 6.2 重要字段

- 商品：`productId`、`name`、`category`、`priceFen`、`deliveryPriceFen`、`stockQuantity`、`soldOut`、`enabled`、`specs`、`version`。
- 门店：`storeId`、`name`、`addressText`、`businessHours`、`status`、`enabled`。
- 订单：`orderNo`、`ownerOpenId`、`clientRequestId`、`purchaseScene`、`deliveryMethod`、`orderStatus`、`items`、费用分项、`storeSnapshot`/`addressSnapshot`、时间字段。
- 状态历史：`orderNo`、`fromStatus`、`toStatus`、`source`、`operatorType`、`operatorId`、`reason`、`createdAt`。
- 审计：`actorId`、`actorRole`、`action`、`targetType`、`targetId`、`before`、`after`、`reason`、`requestId`、`createdAt`。

### 6.3 索引和访问原则

既有部署记录列出 `users(openid)`、`feeQuotes(ownerOpenId, quoteId)`、`orders(ownerOpenId, clientRequestId)` 唯一索引，以及订单/审计查询相关索引。接手前应使用 MCP 对目标环境重新核验，不要因为文档中的示例而删除或重建索引。

浏览器不直接访问集合；用户身份由微信 `OPENID` 约束；商家身份由短令牌和服务端权限约束；`feeQuotes`、`auditLogs` 等私有集合不可为了排障临时改成公开。

## 7. API 状态

### 7.1 用户端已部署 API

```text
auth.login
catalog.listProducts / getProduct / listStores / getStore
address.listAddresses / saveAddress / deleteAddress / setDefaultAddress
fee.quote
order.createOrder / listOrders / getOrder / cancelOrder
```

完整请求、响应和错误码见 `docs/api.md`。用户端没有远程购物车接口、支付接口、退款接口、商家状态推进接口或 `prepareReorder` 云函数。

### 7.2 商家端已部署 API

认证：`merchant-auth.login`、`verifySession`、`logout`。

管理：`merchant-admin` 的订单、商品、门店和审计动作见第 5.4 节。订单列表参数包括 `page`、`pageSize`、`keyword`、`purchaseScene`、`deliveryMethod`、`orderStatus`、`queue`、`sort`；`getDashboardSummary` 是只读汇总。

错误边界包括：`AUTH_REQUIRED`、`AUTH_INVALID`、`AUTH_CONFIG_MISSING`、`PERMISSION_DENIED`、`INVALID_INPUT`、`ORDER_NOT_FOUND`、`ORDER_STATUS_INVALID`、`ORDER_CANNOT_CANCEL`、`PRODUCT_NOT_FOUND`、`PRODUCT_EXISTS`、`VERSION_CONFLICT`、`STORE_NOT_FOUND`、`STORE_EXISTS`、`AUDIT_LOG_UNAVAILABLE`、`INTERNAL_ERROR`。具体动作以当前云函数代码为准。

## 8. 部署、版本和回滚

### 8.1 本地检查

在部署或交接前，至少执行：

```sh
node tests/merchant-auth-contract.test.js
node tests/merchant-admin-token.test.js
node tests/backend-dashboard-ui.test.js
node tests/backend-contract-smoke.js
node --check cloudfunctions/merchant-auth/index.js
node --check cloudfunctions/merchant-admin/index.js
npm --prefix backend run build
git diff --check
```

依赖已由 `backend/package-lock.json` 锁定；不要把真实 `.env.production`、密码或密钥加入 Git。`npm audit` 曾报告 moderate 级依赖风险，不能用自动 `audit fix` 代替审慎升级。

### 8.2 CloudBase 部署边界

部署前记录 `git status --short`、目标 EnvId、函数/应用版本和回归结果。只部署对应目录，不清空集合，不迁移历史订单，不用删除数据实现回滚。云端回滚只能重新部署已有记录且验证过的历史函数/静态版本。

用户端和商家端均遵循 `docs/MCP-DEPLOYMENT-RUNBOOK.md` 的 MCP-only 规则。接手者应先只读核验环境、函数、集合、权限、索引和静态应用状态，再决定是否部署；本文不授予新的云端写入授权。

### 8.3 当前访问与版本记录

当前记录的后台访问地址是：<https://breadshop-backend-cloud1-d9gc800bmc6952073.webapps.tcloudbase.com>。2026-09-05 MCP 发布记录显示静态应用为 `breadshop-backend-025`；支付函数 `payment`、`payment-worker`、`payment-notify` 均已存在并为 `Active`。历史 runbook 中的 008、023 和 `docs/admin.md` 中更早版本仅作为阶段记录。

## 9. 测试和真实验收

### 9.1 本地验证

商家认证测试覆盖 scrypt 哈希验证、错误密码、HMAC 令牌签名/过期/篡改和默认权限；商家管理测试覆盖状态流、队列、日期筛选、权限映射、字段白名单、DTO 脱敏和版本校验；首页测试覆盖 30 秒轮询、首次基线和新订单红点。

### 9.2 真实线上验收记录

- 商家静态应用匿名身份初始化、正确登录、错误密码拒绝、刷新后的会话校验和登出已做过真实域名回归。
- `merchant-admin` 缺失/伪造令牌返回 `AUTH_REQUIRED`；管理员令牌读取订单、商品、门店和审计日志已有记录。
- 订单、商品、门店真实写入是否在换账号后再次验收，要使用真实账号和明确授权；不能用本地 Mock 代替。
- 用户端真实微信正向回归见 `docs/WECHAT-POSITIVE-REGRESSION-2026-08-18.md`；用户确认的负向回归不补写不存在的网络证据。

## 10. 已知限制、风险和下一步

支付模块当前边界见 `docs/payment.md`。开发环境代码、基础设施、`order.PAYMENT_ENABLED=true`、商家支付/退款权限、退款队列模式和 `1.0.1` 体验版均已核验或由用户确认；仍缺隔离环境真实支付/退款回归，当前环境不能视为生产环境。

1. 当前环境是开发/测试环境，不能直接承诺生产稳定性。
2. 单管理员认证没有 `merchantSessions` 或黑名单，服务端不能即时撤销已签发令牌；换账号时必须轮换密码和签名密钥。
3. 商家撤销已部署支付版逻辑：已支付且未制作订单创建整单退款请求，由 worker 执行；尚未进行真实资金退款回归。撤销、退款请求、退款成功/失败分别记录，退款失败不能伪装成功。
4. 首页本地新版本增加实付、退款和净实收投影，但在完成渠道对账前仍不是正式财务报表。
5. 商品库存数量目前是有限支持：商品字段和取消恢复路径存在，但没有完整库存流水、并发库存报表或盘点工具。
6. 分类仍是 `products.category` 字符串，不是独立分类集合；没有分类 CRUD。
7. 没有真实配送、邮费、物流和推送通知；支付/退款已具备开发环境实现，但尚未完成真实资金回归。新订单提醒是后台停留页面的 30 秒轮询和页面红点。
8. `docs/admin.md` 有阶段性旧文字，不能单独作为当前线上状态依据；继续开发时应同步更新它或在变更说明中注明事实来源。
9. 下一阶段按 `docs/WECHAT-PAYMENT-REGRESSION-2026-09-06.md` 人工开启测试开关、设置体验版并完成小额回归；通过后再新建独立生产 EnvId、配置密钥托管、备份/回滚和对账。不要直接把 `cloud1` 当生产。

## 11. 换账号接手清单

### 开发和仓库

- [ ] 获取仓库当前工作树和未提交改动的备份，不先清理或重置。
- [ ] 阅读 `AGENTS.md`、`prd.md`、`PROJECT-STATUS.md`、`PROJECT-ARCHITECTURE.md`、`TASKS.md`、`BACKEND-DESIGN.md`、`docs/admin.md`、`docs/api.md`、`docs/sql.md` 和本文件。
- [ ] 安装依赖并运行第 8.1 节测试，记录 Node/npm 版本和构建结果。
- [ ] 确认 `backend/.env.production` 等真实配置文件未进入 Git；不要把 Publishable Key 以外的秘密放入前端。

### CloudBase 和账号

- [ ] 使用新的 CloudBase 操作账号确认其有目标环境的只读查询权限，必要的部署/环境变量写入权限另行授权。
- [ ] 只读核验 EnvId `cloud1-d9gc800bmc6952073`、函数状态、`auditLogs` 私有权限、用户端集合、索引和静态应用版本。
- [ ] 通过安全渠道交接或重新设置管理员账号 `admin` 的密码；不要从聊天记录复制明文密码。
- [ ] 在受控终端重新生成 scrypt 密码哈希和至少 32 字节随机 `MERCHANT_TOKEN_SECRET`，注入 `merchant-auth` 服务端配置；不要写入仓库、文档、浏览器或聊天。
- [ ] 核对 `MERCHANT_ROLE_ID=merchant_operator` 和完整权限列表；权限变更后退出所有浏览器会话并重新登录。
- [ ] 确认 Web 安全域名、匿名登录提供方、Publishable Key 和 `breadshop-backend` 静态站点配置。Publishable Key 可重新生成/轮换，但不能把它当作商家密钥。
- [ ] 真实登录后先做只读验收，再单独授权订单推进、商品编辑、门店编辑和撤销订单；每项写入检查 `auditLogs`。

### 安全交接注意

- 不要把任何秘密粘贴到新线程、Issue、Git 提交、截图或文档。
- 如果怀疑旧账号、密码或签名密钥暴露，立即轮换密码和 `MERCHANT_TOKEN_SECRET`，并重新发布认证函数；旧令牌依靠密钥轮换失效。
- 不要删除已有订单、地址、报价或审计日志来“清理环境”。清理必须有明确授权、条件、数量、操作者和时间记录。

## 12. 相关聊天/线程 ID

以下 ID 是当前主线程和历史执行/交接线程的来源索引。它们用于回看上下文，不代表这些线程当前仍在运行；没有可靠标题信息时不编造标题：

| 类型 | 线程 ID | 说明 |
| --- | --- | --- |
| 当前主线程 | `01a00f7f-23c3-7240-9058-fe14241b2193` | 本项目主控和最终协调线程 |
| 历史执行/交接 | `01a01366-cb02-7163-a802-82affa48cce3` | 历史用户端后端盘点来源 |
| 历史执行/交接 | `01a01372-89a8-7fb2-a80f-eded93b09859` | 历史接口/数据库文档整理来源 |
| 历史执行/交接 | `01a0138c-8a20-7860-ae06-3c2cc88c0ef5` | 场景购物车范围修复来源 |
| 历史执行/交接 | `01a01398-a6c7-7561-9518-eaa962dbf9d3` | Agent/文档规范合并来源 |
| 历史执行/交接 | `01a013a1-9425-7351-a7cc-7a1f1ef9f6f2` | 文档目录归档整理来源 |
| 历史执行/交接 | `01a014a1-5bd8-7672-867a-faede171dac4` | 接口和数据库文档审查/修正来源 |
| 历史执行/交接 | `01a014b1-f8af-7d00-9b34-12d103e6807c` | 商家后台设计、认证和部署来源 |

## 13. 接手后的第一步

先做只读检查和本地测试，确认仓库代码、线上函数版本和静态站点版本没有偏差；再通过安全渠道轮换管理员密码和签名密钥。完成密钥轮换后，登录后台检查首页、待处理订单、商品、门店和审计页；任何写操作都应单独记录授权和回归证据。
