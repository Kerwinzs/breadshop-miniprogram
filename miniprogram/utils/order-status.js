const STATUS_LABELS = {
  placed: '已下单',
  preparing: '制作中',
  ready_for_pickup: '待自取',
  delivering: '配送中',
  awaiting_shipment: '待发货',
  in_transit: '运输中',
  completed: '已完成',
  canceled: '已取消',
  cancelled: '已取消'
}

function formatOrderStatus(status) {
  return STATUS_LABELS[status] || status || '状态未知'
}

module.exports = { STATUS_LABELS, formatOrderStatus }
