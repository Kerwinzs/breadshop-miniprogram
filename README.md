# 面包坊小程序

面包坊微信小程序与商家后台。当前提供商品浏览、到店自取与外卖/邮寄两套独立购物车、地址、订单和商家管理；支付代码、云函数、回调路由、私有集合和定时任务已部署到开发环境，测试环境支付总开关已开启，仍待商家退款配置、体验版和真机资金回归。

## 当前实现

- 云环境：`cloud1-d9gc800bmc6952073`（传统 NoSQL 云数据库），云函数通过 `wx-server-sdk` 与 `db.collection(...)` 访问。
- 已部署并核验为 `Active/Available`：`auth`、`catalog`、`address`、`fee`、`order`。
- 已建集合：`users`、`products`、`stores`、`addresses`、`orders`、`orderStatusHistory`、`feeQuotes`；`feeQuotes` 为 `PRIVATE`。
- 已核验唯一索引：`users(openid)`、`orders(ownerOpenId, clientRequestId)`、`feeQuotes(ownerOpenId, quoteId)`。
- 配送报价由服务端持久化并绑定用户、地址、配送方式和商品快照；配送下单只接受未过期且未使用的 `feeQuoteId`。订单创建、报价消费和状态历史写入使用 CloudBase 事务，客户端不会得到 `ownerOpenId`、`_openid` 或内部文档 ID。
- MCP 的未登录调用已返回 `AUTH_REQUIRED`；真实微信身份的正向登录、地址、三类下单和订单取消已记录在 `docs/WECHAT-POSITIVE-REGRESSION-2026-08-18.md`。报价篡改/过期/重复消费、幂等和非 `placed` 状态取消仍待负向回归。

支付模块支持待支付、15分钟超时、支付门禁、主动查单、回调验签、超时调度和整单退款；开发环境配置健康检查和支付开关均已通过，小程序 `1.0.1` 已设为体验版。尚缺真机支付/退款回归和正式环境隔离。真实配送、物流、部分退款、库存流水和正式财务对账仍未实现；配送费和快递运费继续到付。

## 目录

```text
miniprogram/          小程序页面、状态与 local/remote repository
cloudfunctions/       auth、catalog、address、fee、order 云函数
tests/                后端契约 smoke test
BACKEND-DESIGN.md     后端边界、数据模型和安全约束
PROJECT-ARCHITECTURE.md  当前运行架构和数据流
PROJECT-STATUS.md     当前进度、证据与未完成项
TASKS.md               任务登记与验收记录
docs/MCP-DEPLOYMENT-RUNBOOK.md  MCP-only 部署与回归步骤
docs/api.md               用户端后端接口说明
docs/sql.md               用户端数据库集合与字段说明
docs/PROJECT-HANDOFF.md   换账号接手、部署、安全和当前进度交付文档
docs/archive/             历史/阶段性文档归档，不作为当前真相源
```

## 本地检查

```sh
node tests/backend-contract-smoke.js
```

小程序项目根目录在 `miniprogram/`，云函数根目录由 `project.config.json` 的 `cloudfunctionRoot` 指向 `cloudfunctions/`。

## 操作约束

- `cloud1-d9gc800bmc6952073` 仅作开发/测试环境；正式上线前必须创建独立生产环境。
- 环境内现有的临时回归地址和订单不得删除。基线为 2 条地址、3 条订单；本轮正向回归新增 1 条地址和 2 条订单，当前共 3 条地址、5 条订单。删除或清理需要明确授权。
- 云端集合、权限、索引和函数部署只按 [MCP-only 部署与回归 runbook](docs/MCP-DEPLOYMENT-RUNBOOK.md) 执行，并把结果写回 `PROJECT-STATUS.md` 与 `TASKS.md`。

更多业务规则见 `prd.md`，当前后端实施边界见 `BACKEND-DESIGN.md`。
