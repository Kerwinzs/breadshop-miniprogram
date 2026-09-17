# 用户端订单云函数契约

用户端支持 `createOrder`、`listOrders`、`getOrder` 和 `cancelOrder`。订单履约状态与支付状态分离：新订单仍以 `orderStatus=placed` 表示尚未开始制作，同时以 `paymentStatus=pending` 表示待支付，支付期限为 15 分钟。运输费用到付，`payableAmountFen` 只等于真实商品小计。

创建、取消订单以及对应的 `orderStatusHistory` 写入必须在同一 CloudBase 事务中完成；`orders` 需要配置 `(ownerOpenId, clientRequestId)` 唯一索引，`feeQuotes` 需要配置 `(ownerOpenId, quoteId)` 唯一索引。取消未支付订单时关闭支付并只释放一次库存；取消已支付且尚未制作的订单时写入稳定 `refundNo=R<orderNo>` 的整单退款请求，支付事实保持 `paid`，退款状态单独变为 `pending`。

`prepareReorder` 和 `advanceMockOrder` 不属于当前用户端 CloudBase API。再来一单继续由小程序本地购物车根据已完成订单快照处理；开发演示状态推进继续留在本地 `miniprogram/utils/store.js`，不得扩展为真实商家状态推进云函数。

配送下单只接受服务端生成的 `feeQuoteId`。报价记录存储在 PRIVATE 的 `feeQuotes` 集合中，绑定用户、地址、配送方式、商品/规格/数量快照、金额、费用版本和过期时间；客户端回传的金额字段不参与信任决策。
