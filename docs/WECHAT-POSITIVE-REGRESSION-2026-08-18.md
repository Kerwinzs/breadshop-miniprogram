# 微信开发者工具正向回归记录

日期：2026-08-18（Asia/Shanghai）  
项目：`bakery-miniprogram`  
AppID：`wx65e43f28166f1457`  
CloudBase EnvId：`cloud1-d9gc800bmc6952073`  
工具：微信开发者工具 Nightly `2.02.2608062`  
页面运行时：模拟器 `iPhone 12/13 (Pro)`

## 已验证

### 登录

个人页显示“云端登录 / 已登录 / 已登录云端账号；商品和门店优先使用云端数据”。当前用户的云端 OpenID 由 MCP 管理端查询记录为 `ocCR63RzRfWPglnaRXvNvVJQ6Kd8`；该值只用于回归关联，不写入用户界面。

### 地址

原有两条临时地址仍保留。新增测试地址使用联系人“回归临时”、手机号 `13800000009`、邮编 `266100`，CloudBase 地址 ID 为 `address-1787022564136-zpr2iw`。

- 新增：地址列表出现第三条记录。
- 编辑：详细地址从“开发测试路9号”改为 `dev-test-99`，列表同步显示。
- 默认切换：列表显示该记录“默认”，原有记录不再是默认。
- 删除：未执行；该记录仍保留，等待按 Computer Use 删除确认策略获得最终确认后再清理。

### 到店自取

确认订单页显示门店“愚园路店”、商品小计/合计 `¥16.80`，并明确“不收取保温包装费、配送费或邮费”。真实身份下订单已写入 CloudBase：

`B20260817111300LTRWP`，创建时 `purchaseScene=pickup`、`orderStatus=placed`、`storeId=store-yuyuan`、`subtotalFen=1680`、`totalFen=1680`。

订单详情显示商品、门店、金额和“取消订单”；确认取消后详情显示“已取消”，取消按钮消失，CloudBase 当前状态为 `canceled`。该记录现在保留为回归订单，不删除。

### 同城外卖

配送商品页/购物车/确认订单页均显示当前测试地址和费用：商品 `¥18.80`、保温包装费 `¥2.00`、配送费 `¥6.00`、合计 `¥26.80`。确认下单成功页返回：

`B20260818035954DIVZZ`，`purchaseScene=delivery`，`deliveryMethod=local`，`orderStatus=placed`，`subtotalFen=1880`，`insulationFeeFen=200`，`deliveryFeeFen=600`，`totalFen=2680`。

MCP 查询的对应费用报价 `quote-1787025542126-05b9dtcc` 状态为 `consumed`，并记录了消费请求 ID。

### 快递邮寄

配送方式切换后，商品页、购物车和确认订单页显示商品 `¥30.00`、保温包装费 `¥2.00`、邮费 `¥12.00`、合计 `¥44.00`。确认下单成功页返回：

`B20260818035509Y7IDH`，`purchaseScene=delivery`，`deliveryMethod=shipping`，`orderStatus=placed`，`subtotalFen=3000`，`insulationFeeFen=200`，`postageFen=1200`，`totalFen=4400`。

MCP 查询的对应费用报价 `quote-1787025262198-9rvup2do` 状态为 `consumed`，并记录了消费请求 ID。

### 订单列表与详情

订单 Tab 的真实身份列表显示到店自取、同城外卖和快递邮寄订单，并显示各自状态、订单号和合计金额。自取订单详情已验证状态和取消；配送订单成功页已验证订单号和“已下单”状态。

### 开发者工具状态

回归过程中调试器显示 `Errors: 0`、`Problems: 0`。存在基础库灰度/预加载/性能提示，不是业务错误。所有正向请求均由小程序 `wx.cloud.callFunction` 发往上面的 EnvId；订单和报价的落库结果由 CloudBase MCP 只读查询复核。

## 负向验收补充

- 用户已人工确认完成“非 `placed` 状态取消”负向验收；本记录不补写未提供的具体 UI 操作细节。
- 用户已人工确认完成以下五项真实微信身份负向验收：报价篡改、报价过期、报价重复消费、相同 `clientRequestId` 幂等、非 `placed` 状态取消。本记录不补写用户未提供的错误码、trace 或截图细节。
- 用户已人工确认普通到店自取下单 `INTERNAL_ERROR` 已解决。本记录不补写用户未提供的错误码、trace 或截图细节。
- 新建测试地址暂未删除，避免未获最终删除确认前产生不可恢复的数据操作。
