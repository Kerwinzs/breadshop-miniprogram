function listingValues(product) {
  const globallyEnabled = product && product.enabled !== false
  return {
    pickupListed: globallyEnabled && product.supportsPickup !== false,
    deliveryListed: globallyEnabled && (product.supportsLocalDelivery !== false || product.supportsShipping !== false)
  }
}

function listingFields(product, pickupListed, deliveryListed) {
  const existing = product || {}
  const wasGloballyEnabled = existing.enabled !== false
  const initial = listingValues(existing)
  const preservePickup = wasGloballyEnabled && pickupListed === initial.pickupListed
  const preserveDelivery = wasGloballyEnabled && deliveryListed === initial.deliveryListed
  return {
    enabled: pickupListed || deliveryListed,
    supportsPickup: preservePickup ? existing.supportsPickup !== false : pickupListed,
    supportsLocalDelivery: preserveDelivery ? existing.supportsLocalDelivery !== false : deliveryListed,
    supportsShipping: preserveDelivery ? existing.supportsShipping !== false : deliveryListed
  }
}

module.exports = { listingValues, listingFields }
