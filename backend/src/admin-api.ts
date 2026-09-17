import { callFunction } from './cloudbase'
import { readSession } from './auth'

export type Product = { productId: string; name: string; category: string; categoryIds: string[]; categoryNames: string[]; priceFen: number; deliveryPriceFen: number; stockQuantity: number | null; soldOut: boolean; enabled: boolean; version: number; [key: string]: unknown }
export type ProductCategory = { categoryId: string; name: string; sortOrder: number; enabled: boolean; version: number }
export type Store = { storeId: string; name: string; addressText: string; businessHours: string; status: 'open' | 'closed'; enabled: boolean }
export type Order = { orderNo: string; purchaseScene: string; deliveryMethod: string | null; orderStatus: string; paymentRequired?: boolean; paymentStatus?: 'pending' | 'paid' | 'closed' | 'not_required'; refundStatus?: 'none' | 'pending' | 'succeeded' | 'failed'; totalFen: number; payableAmountFen?: number; paidAmountFen?: number; refundedAmountFen?: number; createdAt?: string; [key: string]: unknown }
export type History = { fromStatus: string | null; toStatus: string; source: string; createdAt?: string }

export const adminApi = {
  listOrders: (params: Record<string, unknown> = {}) => callFunction<{ orders: Order[] }>('merchant-admin', withSession({ action: 'listOrders', ...params })),
  getDashboardSummary: () => callFunction<Record<string, unknown>>('merchant-admin', withSession({ action: 'getDashboardSummary' })),
  getOrder: (orderNo: string) => callFunction<{ order: Order; history: History[]; nextStatus: string | null }>('merchant-admin', withSession({ action: 'getOrder', orderNo })),
  advanceOrder: (orderNo: string, toStatus: string) => callFunction<{ orderNo: string; orderStatus: string }>('merchant-admin', withSession({ action: 'advanceOrder', orderNo, toStatus })),
  cancelOrder: (orderNo: string, reason: string) => callFunction<{ orderNo: string; orderStatus: string; paymentStatus: string; refundStatus: string }>('merchant-admin', withSession({ action: 'cancelOrder', orderNo, reason })),
  retryRefund: (orderNo: string, reason: string) => callFunction<{ orderNo: string; paymentStatus: string; refundStatus: string }>('merchant-admin', withSession({ action: 'retryRefund', orderNo, reason })),
  listProducts: (params: Record<string, unknown> = {}) => callFunction<{ products: Product[]; total: number; page: number; pageSize: number }>('merchant-admin', withSession({ action: 'listProducts', ...params })),
  listProductCategories: () => callFunction<{ categories: ProductCategory[] }>('merchant-admin', withSession({ action: 'listProductCategories' })),
  createProductCategory: (categoryId: string, category: Record<string, unknown>) => callFunction<{ categoryId: string; version: number }>('merchant-admin', withSession({ action: 'createProductCategory', categoryId, category })),
  saveProductCategory: (categoryId: string, version: number, category: Record<string, unknown>) => callFunction<{ categoryId: string; version: number; affectedProducts: number }>('merchant-admin', withSession({ action: 'saveProductCategory', categoryId, version, category })),
  deleteProductCategory: (categoryId: string) => callFunction<{ categoryId: string; deleted: true }>('merchant-admin', withSession({ action: 'deleteProductCategory', categoryId })),
  getProduct: (productId: string) => callFunction<{ product: Product }>('merchant-admin', withSession({ action: 'getProduct', productId })),
  createProduct: (productId: string, product: Record<string, unknown>) => callFunction<{ productId: string; version: number }>('merchant-admin', withSession({ action: 'createProduct', productId, product })),
  saveProduct: (productId: string, version: number, product: Record<string, unknown>) => callFunction<{ productId: string; version: number }>('merchant-admin', withSession({ action: 'saveProduct', productId, version, product })),
  bulkSetProductListing: (filters: { keyword?: string; categoryId?: string }, listed: boolean) => callFunction<{ listed: boolean; matchedCount: number; updatedCount: number; skippedRequiredCount: number }>('merchant-admin', withSession({ action: 'bulkSetProductListing', ...filters, listed })),
  bulkSetProductSoldOut: (filters: { keyword?: string; categoryId?: string }, soldOut: boolean) => callFunction<{ soldOut: boolean; matchedCount: number; updatedCount: number; skippedRequiredCount: number }>('merchant-admin', withSession({ action: 'bulkSetProductSoldOut', ...filters, soldOut })),
  saveHomeRecommendations: (productIds: string[]) => callFunction<{ productIds: string[] }>('merchant-admin', withSession({ action: 'saveHomeRecommendations', productIds })),
  uploadProductImage: (productId: string, image: { dataUrl: string; width: number; height: number }) => callFunction<{ fileID: string }>('merchant-admin', withSession({ action: 'uploadProductImage', productId, image })),
  getPageConfiguration: (pageId: 'home' | 'profile') => callFunction<{ pageId: string; config: Record<string, unknown>; version: number }>('merchant-admin', withSession({ action: 'getPageConfiguration', pageId })),
  savePageConfiguration: (pageId: 'home' | 'profile', version: number, config: Record<string, unknown>) => callFunction<{ pageId: string; version: number }>('merchant-admin', withSession({ action: 'savePageConfiguration', pageId, version, config })),
  uploadPageContentImage: (pageId: 'home' | 'profile', image: { dataUrl: string; width: number; height: number }) => callFunction<{ fileID: string }>('merchant-admin', withSession({ action: 'uploadPageContentImage', pageId, image })),
  deleteProduct: (productId: string) => callFunction<{ productId: string; deleted: true }>('merchant-admin', withSession({ action: 'deleteProduct', productId })),
  toggleSoldOut: (productId: string, soldOut: boolean) => callFunction<{ productId: string; soldOut: boolean }>('merchant-admin', withSession({ action: 'toggleSoldOut', productId, soldOut })),
  listStores: (params: Record<string, unknown> = {}) => callFunction<{ stores: Store[]; total: number; page: number; pageSize: number }>('merchant-admin', withSession({ action: 'listStores', ...params })),
  getStore: (storeId: string) => callFunction<{ store: Store }>('merchant-admin', withSession({ action: 'getStore', storeId })),
  createStore: (storeId: string, store: Record<string, unknown>) => callFunction<{ storeId: string }>('merchant-admin', withSession({ action: 'createStore', storeId, store })),
  saveStore: (storeId: string, store: Record<string, unknown>) => callFunction<{ storeId: string }>('merchant-admin', withSession({ action: 'saveStore', storeId, store })),
  deleteStore: (storeId: string) => callFunction<{ storeId: string; deleted: true }>('merchant-admin', withSession({ action: 'deleteStore', storeId })),
  toggleStoreOpen: (storeId: string, open: boolean) => callFunction<{ storeId: string; status: Store['status'] }>('merchant-admin', withSession({ action: 'toggleStoreOpen', storeId, open })),
  listAuditLogs: (params: Record<string, unknown> = {}) => callFunction<{ auditLogs: Array<Record<string, unknown>>; total: number; page: number; pageSize: number }>('merchant-admin', withSession({ action: 'listAuditLogs', ...params }))
}

function withSession(data: Record<string, unknown>) {
  const session = readSession()
  return { ...data, token: session?.token || '' }
}
