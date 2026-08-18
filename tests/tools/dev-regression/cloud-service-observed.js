function waitForLogin() {
  let app
  try { app = getApp() } catch (error) { app = null }
  const data = app && app.globalData
  if (!data || !data.cloudAvailable || typeof wx.cloud.callFunction !== 'function') return Promise.reject(new Error('云开发未就绪'))
  const ready = data.cloudReadyPromise || Promise.resolve(data.authStatus === 'authenticated')
  return ready.then((ok) => { if (!ok || data.authStatus !== 'authenticated') throw new Error('微信登录未完成'); return true })
}

function traceId() { return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
function businessRequestId(payload) {
  if (!payload || typeof payload !== 'object') return ''
  return payload.clientRequestId || payload.feeQuoteId || payload.orderNo || payload.quoteId || ''
}
function redact(value, key) {
  if (/openid|owner|phone|contact|address|detail|province|city|district|postal/i.test(String(key || ''))) return '[REDACTED]'
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => redact(item, ''))
  if (value && typeof value === 'object') {
    const result = {}
    Object.keys(value).slice(0, 30).forEach((name) => { result[name] = redact(value[name], name) })
    return result
  }
  if (typeof value === 'string' && value.length > 300) return `${value.slice(0, 300)}…`
  return value
}
function safeSummary(value) {
  try {
    const source = value instanceof Error ? { name: value.name, message: value.message, code: value.code, errMsg: value.errMsg, requestID: value.requestID || value.requestId } : value
    const text = JSON.stringify(redact(source, '')) || ''
    return text.length > 1200 ? `${text.slice(0, 1200)}…` : text
  } catch (error) { return '[UNSERIALIZABLE]' }
}
function makeTrace(name, action, payload, startedAt) {
  return { requestId: traceId(), businessRequestId: businessRequestId(payload), functionName: name, action, startedAt }
}
function finishTrace(trace, patch) { return Object.assign(trace, patch, { finishedAt: new Date().toISOString() }) }

// This helper is intentionally kept outside miniprogram/ and is only used by
// the developer regression page when it is loaded in a non-production tool.
function callObserved(name, action, payload) {
  const startedAt = new Date().toISOString()
  const trace = makeTrace(name, action, payload, startedAt)
  return waitForLogin().then(() => wx.cloud.callFunction({ name, data: Object.assign({ action }, payload || {}) })).then((response) => {
    const result = response && response.result
    if (!result || result.ok !== true) {
      const error = new Error((result && result.error && result.error.message) || '云端服务暂时不可用')
      error.code = result && result.error && result.error.code
      error.trace = finishTrace(trace, { result: 'error', errorCode: error.code || 'UNKNOWN_ERROR', message: error.message, rawSummary: safeSummary(result || response), transportRequestId: response && (response.requestID || response.requestId) || '' })
      throw error
    }
    return { data: result.data, trace: finishTrace(trace, { result: 'success', errorCode: '', message: '', rawSummary: safeSummary(result), transportRequestId: response && (response.requestID || response.requestId) || '' }) }
  }).catch((error) => {
    if (error && error.trace) throw error
    const normalized = error instanceof Error ? error : new Error((error && (error.errMsg || error.message)) || '云端服务暂时不可用')
    normalized.code = normalized.code || (error && error.code) || 'UNKNOWN_ERROR'
    normalized.trace = finishTrace(trace, { result: 'error', errorCode: normalized.code, message: normalized.message, rawSummary: safeSummary(error), transportRequestId: '' })
    throw normalized
  })
}

module.exports = { waitForLogin, callObserved, safeSummary }
