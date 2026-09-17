function createRequestId() { return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }

function ensure(page) {
  if (!page.checkoutClientRequestId) page.checkoutClientRequestId = createRequestId()
  return page.checkoutClientRequestId
}

function complete(page) { page.checkoutClientRequestId = '' }

module.exports = { createRequestId, ensure, complete }
