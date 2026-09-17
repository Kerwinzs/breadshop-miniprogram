const PAYMENT_LABELS = { pending: '待支付', paid: '已支付', closed: '支付已关闭', not_required: '历史免支付', failed: '支付失败' }
const REFUND_LABELS = { pending: '退款处理中', succeeded: '退款成功', failed: '退款失败' }

function view(order) {
  const raw = order || {}
  const paymentRequired = raw.paymentRequired === true || ['pending', 'paid', 'closed'].includes(raw.paymentStatus)
  const paymentStatus = paymentRequired ? String(raw.paymentStatus || 'pending').toLowerCase() : 'not_required'
  const refundStatus = String(raw.refundStatus || 'none').toLowerCase()
  const status = refundStatus !== 'none' ? refundStatus : paymentStatus
  const label = refundStatus !== 'none' ? (REFUND_LABELS[refundStatus] || '退款状态未知') : (PAYMENT_LABELS[paymentStatus] || '支付状态未知')
  const expiredAt = raw.paymentExpiredAt || raw.expiredAt || ''
  const expired = paymentStatus === 'closed' || (!!expiredAt && new Date(expiredAt).getTime() <= Date.now())
  return { paymentRequired, paymentStatus, refundStatus, paymentLabel: label, paymentExpiredAt: expiredAt, canPay: paymentRequired && paymentStatus === 'pending' && !expired, paymentExpired: paymentRequired && expired, paymentState: status }
}

module.exports = { PAYMENT_LABELS, REFUND_LABELS, view }
