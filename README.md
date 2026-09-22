# 面包坊小程序 · 商家后台

一个已经完成核心功能、正在真实运维中的面包坊微信小程序与商家后台项目。

项目覆盖从原型设计、微信小程序实现、云端业务服务、微信支付，到商家订单履约和运营管理的完整链路。仓库既保留设计阶段的可交互原型，也包含可在微信开发者工具中运行的小程序代码、CloudBase 云函数和 React 商家后台。

## 项目状态

- **产品状态**：核心业务功能已完成，并已进入真实运维。
- **用户端**：商品浏览、分类筛选、到店自取、同城外卖、快递邮寄、地址和门店管理、场景购物车、配送报价、微信支付、订单查询、取消、退款结果查询和订阅消息通知。
- **商家端**：管理员登录、经营概览、订单工作台、订单状态推进、订单撤销、商品与分类、商品图片、门店、页面内容、售罄/上架批量操作、审计日志和新订单提醒。
- **云端**：CloudBase 云函数、云数据库、支付回调、退款处理、超时关单、退款重试和定时任务。
- **仓库可见性**：GitHub 私有仓库，默认分支为 `main`。

## 设计到实现的工作流

本项目采用“先设计、再转换、最后接入云端”的工作方式：

1. 在 [`v1/`](v1/) 中维护小程序的原型设计稿和页面方案。
2. 使用 Open Design 将设计方案整理为可交互的 HTML 原型。
3. 使用 [`html-to-wechat-miniprogram`](html-to-wechat-miniprogram/) Skill，将 HTML 原型转换为微信开发者工具可运行的小程序页面代码。
4. 使用 [`wechat-tabbar-icons`](wechat-tabbar-icons/) Skill，为微信小程序适配原生 TabBar 所需的底部按钮图标。
5. 接入 `miniprogram/`、`cloudfunctions/` 和 `backend/`，完成真实数据、支付和商家运营闭环。

## 目录结构

```text
v1/                         小程序原型设计稿与设计阶段资产
html-to-wechat-miniprogram/ HTML 原型转微信小程序的 Skill
wechat-tabbar-icons/        微信小程序 TabBar 图标适配 Skill
miniprogram/                微信小程序页面、组件、状态和客户端服务
cloudfunctions/             CloudBase 云函数与支付/退款/通知服务
backend/                    React + TypeScript + Vite + Ant Design 商家后台
tests/                      业务、支付、商家后台和小程序契约测试
docs/                       API、数据库、部署、回归和交接文档
prd.md                      产品规则与业务边界
PROJECT-ARCHITECTURE.md     系统架构和跨模块数据流
PROJECT-STATUS.md           当前状态、线上证据和未完成事项
TASKS.md                    任务登记和验收记录
```

## 系统架构

```text
微信小程序 ─────┐
                ├─ CloudBase 云函数 ── CloudBase 云数据库
商家后台 ───────┘          │
                           ├─ 微信支付/退款
                           ├─ 订单状态与库存
                           └─ 订阅消息通知
```

用户端和商家端共用服务端订单事实，但权限和操作边界分离。支付状态、履约状态和退款状态分别记录，避免把“已取消”误当成“已退款”。

## 本地运行

### 微信小程序

使用微信开发者工具打开仓库中的 `miniprogram/`，或按项目配置文件打开仓库根目录：

```text
project.config.json
```

### 商家后台

```sh
cd backend
npm install
npm run dev
```

生产构建：

```sh
npm run build
```

### 自动化测试

在仓库根目录运行：

```sh
node --test tests/*.test.js
```

测试覆盖订单状态、购物车隔离、支付签名、回调验签、退款重试、订阅通知、商家权限、商品管理和页面内容配置等关键路径。

## 云端与部署

当前 CloudBase 环境为：

```text
cloud1-d9gc800bmc6952073
```

云端操作必须先只读核验，再通过 CloudBase MCP 执行明确授权的写操作。部署、回滚、定时任务和线上回归请遵循 [`docs/MCP-DEPLOYMENT-RUNBOOK.md`](docs/MCP-DEPLOYMENT-RUNBOOK.md)。

接口、集合和字段说明分别见：

- [`docs/api.md`](docs/api.md)
- [`docs/sql.md`](docs/sql.md)
- [`docs/admin.md`](docs/admin.md)
- [`docs/PROJECT-HANDOFF.md`](docs/PROJECT-HANDOFF.md)

## 安全边界

支付商户号、API v3 密钥、商户私钥、证书、AppSecret、管理员密码哈希、Token 密钥和临时令牌只允许保存在受控服务端配置中，不能进入小程序、前端、Git、文档、聊天或普通日志。

仓库已忽略 `.env`、证书、私钥和本机密钥目录。提交代码前仍应进行敏感信息检查；真实订单、地址、报价、商品、门店和审计数据不得通过 Git 清理或迁移。

## 业务边界

- 到店自取与配送使用相互独立的购物车。
- 配送支持同城外卖和快递邮寄，运输费用按当前业务规则到付。
- 订单履约状态与支付/退款状态分离。
- 支持整单原路退款、退款失败重试和退款结果对账；首期不支持部分退款。
- CloudBase 测试环境和正式生产环境必须隔离，正式发布前不得把测试数据当作生产数据。

## 贡献与变更规范

修改页面、费用、订单状态、数据库字段、API、权限或微信平台行为时，请同时更新对应文档，并在提交说明中写清楚影响范围。不要提交密钥、完整环境变量、真实支付报文或真实用户数据。

项目的当前事实以代码、CloudBase 线上核验结果和项目文档为准；历史阶段性材料统一放在 [`docs/archive/`](docs/archive/) 中。
