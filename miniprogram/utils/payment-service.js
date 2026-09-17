const cloud = require('./cloud-service')

function unavailableError() {
  const error = new Error('支付暂未开放')
  error.code = 'PAYMENT_NOT_AVAILABLE'
  return error
}

function normalizeStatus(value) {
  const status = String(value || '').toLowerCase()
  if (['paid', 'success', 'succeeded'].includes(status)) return 'paid'
  if (['refunding', 'refund_pending', 'refund_processing'].includes(status)) return 'refunding'
  if (['refunded', 'refund_success'].includes(status)) return 'refunded'
  if (['failed', 'pay_failed'].includes(status)) return 'failed'
  if (['closed', 'expired'].includes(status)) return 'expired'
  return 'pending'
}

function getStatus(data) {
  const source = data || {}
  return normalizeStatus(source.paymentStatus || (source.payment && source.payment.status) || (source.order && source.order.paymentStatus))
}

function getRefundStatus(data) {
  const source = data || {}
  return String(source.refundStatus || (source.payment && source.payment.refundStatus) || (source.order && source.order.refundStatus) || 'none').toLowerCase()
}

function create(orderNo) {
  if (!orderNo) return Promise.reject(unavailableError())
  return cloud.call('payment', 'createPayment', { orderNo }).then((data) => {
    const params = data && (data.paymentParams || data.requestPaymentParams)
    if (!params || !params.timeStamp || !params.nonceStr || !params.package || !params.paySign) throw unavailableError()
    return Object.assign({}, data, { paymentParams: params })
  }).catch((error) => {
    if (error && ['FUNCTION_NOT_FOUND', 'PAYMENT_NOT_CONFIGURED', 'PAYMENT_NOT_AVAILABLE'].includes(error.code)) throw unavailableError()
    throw error
  })
}

function query(orderNo) {
  if (!orderNo) return Promise.reject(unavailableError())
  return cloud.call('payment', 'queryPayment', { orderNo }).catch((error) => {
    if (error && ['FUNCTION_NOT_FOUND', 'PAYMENT_NOT_CONFIGURED', 'PAYMENT_NOT_AVAILABLE'].includes(error.code)) throw unavailableError()
    throw error
  })
}

function request(params) {
  return new Promise((resolve, reject) => wx.requestPayment(Object.assign({}, params, { success: resolve, fail: reject })))
}

function diagnostic(error) {
  const code = String(error && error.code || 'PAYMENT_CREATE_FAILED').replace(/[^A-Z0-9_]/gi, '').slice(0, 64) || 'PAYMENT_CREATE_FAILED'
  const message = String(error && error.message || '微信预支付下单失败').replace(/[\r\n]+/g, ' ').slice(0, 120)
  return { code, message }
}

function payAndConfirm(orderNo) {
  return create(orderNo).then((created) => request(created.paymentParams).then(() => query(orderNo)).then((result) => ({ status: getStatus(result), result })).catch((error) => {
    const message = String(error && error.errMsg || error && error.message || '')
    if (/cancel/i.test(message)) return { status: 'canceled', error }
    return query(orderNo).then((result) => ({ status: getStatus(result), result, recoveredFromError: true })).catch(() => ({ status: 'unknown', error }))
  })).catch((error) => {
    if (error && error.code === 'PAYMENT_NOT_AVAILABLE') return { status: 'unavailable', error }
    return { status: 'failed', stage: 'create_payment', error, diagnostic: diagnostic(error) }
  })
}

module.exports = { create, query, request, payAndConfirm, getStatus, getRefundStatus, normalizeStatus, diagnostic }
