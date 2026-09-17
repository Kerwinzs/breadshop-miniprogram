import { useEffect, useMemo, useRef, useState, createContext, useContext } from 'react'
import { Alert, App as AntApp, AutoComplete, Badge, Button, Card, Collapse, ConfigProvider, DatePicker, Descriptions, Drawer, Empty, Form, Input, InputNumber, Layout, Menu, Modal, Result, Select, Space, Spin, Statistic, Switch, Table, Tabs, Tag, Typography } from 'antd'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { login, logout, readSession, verifySession } from './auth'
import type { MerchantSession } from './auth'
import { ensureAnonymousSession, resolveCloudFileURLs } from './cloudbase'
import { adminApi } from './admin-api'
import { prepareProductImage, PRODUCT_IMAGE_RULES } from './product-images'
import { listingFields, listingValues } from './product-listing.cjs'
import './styles.css'

type AuthContextValue = { session: MerchantSession | null; ready: boolean; signIn: (account: string, password: string) => Promise<void>; signOut: () => Promise<void> }
const AuthContext = createContext<AuthContextValue | null>(null)
function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('AuthContext missing'); return value }
function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<MerchantSession | null>(() => readSession()); const [ready, setReady] = useState(false); const [identityError, setIdentityError] = useState('')
  useEffect(() => { let active = true; const current = readSession(); ensureAnonymousSession().then(() => current ? verifySession(current).then((next) => active && setSession(next)).catch(() => { sessionStorage.removeItem('breadshop.merchant.session'); active && setSession(null) }) : undefined).catch((error) => active && setIdentityError(error instanceof Error ? error.message : '无法建立 CloudBase 匿名身份')).finally(() => active && setReady(true)); return () => { active = false } }, [])
  const value = useMemo<AuthContextValue>(() => ({
    session,
    ready,
    signIn: async (account: string, password: string) => { setSession(await login(account, password)) },
    signOut: async () => { await logout(session); setSession(null) }
  }), [session, ready])
  if (!ready) return <div className="page-center">
<Spin tip="正在建立安全身份" />
</div>
  if (identityError) return <div className="page-center">
<Alert type="error" showIcon message="后台安全身份初始化失败" description={`${identityError}。未建立匿名身份前不会发送商家登录请求。`} />
</div>
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
function LoginPage() { const { session, signIn } = useAuth(); const navigate = useNavigate(); const [error, setError] = useState(''); if (session) return <Navigate to="/" replace />; return <div className="login-shell">
<Card className="login-card" bordered={false}>
<Typography.Title level={2}>UDii 有笛-商家端</Typography.Title>
<Typography.Paragraph type="secondary">请使用受控的商家账号登录</Typography.Paragraph>{error && <Alert type="error" showIcon message={error} className="form-alert" />}<Form layout="vertical" onFinish={async (values: { account: string; password: string }) => { setError(''); try { await signIn(values.account, values.password); navigate('/', { replace: true }) } catch (reason) { setError(reason instanceof Error ? reason.message : '登录失败') } }}>
<Form.Item label="账号" name="account" rules={[{ required: true, message: '请输入账号' }]}>
<Input autoComplete="username" />
</Form.Item>
<Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
<Input.Password autoComplete="current-password" />
</Form.Item>
<Button type="primary" htmlType="submit" block>登录</Button>
</Form>
</Card>
</div> }
function Guard({ permission, children }: { permission?: string; children: React.ReactNode }) { const { session } = useAuth(); if (!session) return <Navigate to="/login" replace />; if (permission && !session.permissions.includes(permission)) return <Result status="403" title="无权访问" subTitle="当前账号没有此管理权限" />; return <>{children}</> }
function ProtectedLayout() { const { session, signOut } = useAuth(); const navigate = useNavigate(); const location = useLocation(); if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />; const selected = location.pathname === '/' ? 'home' : location.pathname.startsWith('/orders') ? 'orders' : location.pathname.startsWith('/products') ? 'products' : location.pathname.startsWith('/stores') ? 'stores' : location.pathname.startsWith('/page-content') ? 'page-content' : 'audit'; return <Layout className="app-layout">
<Layout.Header className="app-header">
<div className="brand" aria-label="UDii 有笛-商家端"><span className="brand-mark">U</span><span><b>UDii 有笛</b><small>商家端</small></span></div>
<span className="account"><span className="account-dot" />{session.merchantUserId}<Button type="link" onClick={() => signOut().then(() => navigate('/login', { replace: true }))}>退出登录</Button></span>
</Layout.Header>
<Layout>
<Layout.Sider width={224} theme="light" className="app-sider">
<div className="nav-caption">工作区</div><Menu mode="inline" selectedKeys={[selected]} items={[{ key: 'home', label: '经营概览', onClick: () => navigate('/') }, { key: 'orders', label: '订单工作台', onClick: () => navigate('/orders') }, { key: 'products', label: '商品与分类', onClick: () => navigate('/products') }, { key: 'stores', label: '门店管理', onClick: () => navigate('/stores') }, { key: 'page-content', label: '页面内容', onClick: () => navigate('/page-content') }, { key: 'audit', label: '操作记录', onClick: () => navigate('/audit-logs') }]} />
<div className="sider-help"><b>安全提示</b><span>所有管理操作都会留下审计记录</span></div>
</Layout.Sider>
<Layout.Content className="app-content">
<Outlet />
</Layout.Content>
</Layout>
</Layout> }
function PageIntro({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) { return <div className="page-heading"><div><Typography.Title level={2}>{title}</Typography.Title><Typography.Paragraph>{description}</Typography.Paragraph></div>{actions && <div className="page-actions">{actions}</div>}</div> }
function ErrorBox({ error }: { error: any }) { return <Alert type="error" showIcon message={error instanceof Error ? error.message : '请求失败'} /> }
const sceneLabel: Record<string, string> = { pickup: '到店自取', delivery: '外卖/邮寄' }
const methodLabel: Record<string, string> = { local: '同城外卖', shipping: '快递邮寄' }
const statusLabel: Record<string, string> = { placed: '已下单', preparing: '制作中', ready_for_pickup: '待自取', delivering: '配送中', awaiting_shipment: '待发货', in_transit: '运输中', completed: '已完成', canceled: '已取消' }
const paymentStatusLabel: Record<string, string> = { pending: '待支付', paid: '已支付', closed: '支付已关闭', not_required: '历史免支付' }
const refundStatusLabel: Record<string, string> = { none: '无退款', pending: '退款处理中', succeeded: '退款成功', failed: '退款失败' }
function paymentStatusOf(order: any) { return order?.paymentStatus || (order?.paymentRequired === true ? 'pending' : 'not_required') }
function refundStatusOf(order: any) { return order?.refundStatus || 'none' }
function canAdvanceOrder(order: any) { return order?.orderStatus !== 'placed' || paymentStatusOf(order) === 'paid' || paymentStatusOf(order) === 'not_required' }
const SHIPPING_REQUIRED_CATEGORY = '拍前必读'
const SHIPPING_REQUIRED_PRODUCTS = [
  { productId: 'shipping-required-packaging', name: '包装泡沫冰袋', priceLocked: false, methods: ['shipping'], defaultDesc: '快递保温包装，泡沫箱与冰袋组合。' },
  { productId: 'shipping-required-sf-collect', name: '默认顺丰特快到付', priceLocked: true, methods: ['shipping'], defaultDesc: '默认使用顺丰特快，运费由收件人到付。' },
  { productId: 'shipping-required-notice', name: '拍前必读', priceLocked: true, methods: ['shipping'], defaultDesc: '请在下单前阅读快递邮寄说明。' },
  { productId: 'local-required-packaging', name: '同城外卖打包费', priceLocked: false, methods: ['local'], defaultDesc: '同城外卖的打包费用，由商家维护。' },
  { productId: 'local-required-delivery-collect', name: '同城配送费到付', priceLocked: true, methods: ['local'], defaultDesc: '同城配送费用由收件人到付。' },
  { productId: 'local-required-notice', name: '外卖拍前必读', priceLocked: true, methods: ['local'], defaultDesc: '请在下单前阅读同城配送说明。' }
]
function shippingRequiredConfig(productId: unknown) { return SHIPPING_REQUIRED_PRODUCTS.find((item) => item.productId === productId) }
function labelOf(map: Record<string, string>, value: string | null | undefined) { return value ? (map[value] || value) : '-' }
function formatTime(value: unknown) { const date = value ? new Date(String(value)) : null; return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false }) : '-' }
function fen(value: unknown) { return `¥${(Number(value) / 100).toFixed(2)}` }
function hasLegacyLocalFees(order: any) { return order?.deliveryMethod === 'local' && (Number(order.insulationFeeFen) > 0 || Number(order.deliveryFeeFen) > 0) }
function printableOrder(order: any, permissions: string[]) {
  if (order?.purchaseScene === 'pickup') return { ready: true, reason: '' }
  if (!permissions.includes('orders.address.read')) return { ready: false, reason: '当前账号缺少配送地址查看权限，不能打印收件信息' }
  const address = order.addressSnapshot
  if (!address) return { ready: false, reason: '订单没有可用的收件地址快照，不能打印' }
  if (!String(address.contactName || '').trim() || !String(address.phone || '').trim() || !String(address.fullAddress || '').trim()) return { ready: false, reason: '收件人姓名、电话或完整地址缺失，不能打印不完整订单' }
  return { ready: true, reason: '' }
}
function OrderPrintSheet({ order }: { order: any }) {
  return <section className="order-print-sheet" aria-hidden="true">
<h1>{order.purchaseScene === 'pickup' ? '自取订单' : '配送订单'}</h1>
<div className="print-meta"><span>订单号：{order.orderNo}</span><span>场景：{labelOf(sceneLabel, order.purchaseScene)}</span>{order.deliveryMethod && <span>配送方式：{labelOf(methodLabel, order.deliveryMethod)}</span>}<span>下单时间：{formatTime(order.createdAt)}</span></div>
{order.purchaseScene === 'delivery' ? <><h2>收件人信息</h2><dl className="print-recipient"><dt>姓名</dt><dd>{order.addressSnapshot.contactName}</dd><dt>电话</dt><dd>{order.addressSnapshot.phone}</dd><dt>地址</dt><dd>{order.addressSnapshot.fullAddress}</dd></dl></> : <><h2>自取门店</h2><dl className="print-recipient"><dt>门店</dt><dd>{order.storeSnapshot?.name || '-'}</dd><dt>地址</dt><dd>{order.storeSnapshot?.addressText || '-'}</dd><dt>营业时间</dt><dd>{order.storeSnapshot?.businessHours || '-'}</dd></dl></>}
<h2>商品单</h2>
<table><thead><tr><th>商品</th><th>规格</th><th>数量</th><th>单价</th><th>小计</th></tr></thead><tbody>{order.items.map((item: any, index: number) => <tr key={`${item.productId}-${item.specId}-${index}`}><td>{item.productName}</td><td>{item.specName || '-'}</td><td>{item.quantity}</td><td>{fen(item.unitPriceFen)}</td><td>{fen(item.lineTotalFen)}</td></tr>)}</tbody></table>
{order.deliveryMethod === 'shipping' && <p>快递费用：默认顺丰特快到付</p>}
{order.deliveryMethod === 'local' && !hasLegacyLocalFees(order) && <p>同城配送费：到付；打包费用已作为商品计入商品小计。</p>}
<dl className="print-totals"><dt>商品小计</dt><dd>{fen(order.subtotalFen)}</dd>{hasLegacyLocalFees(order) && <><dt>保温包装费</dt><dd>{fen(order.insulationFeeFen)}</dd><dt>配送费</dt><dd>{fen(order.deliveryFeeFen)}</dd></>}<dt className="print-grand-total">订单合计</dt><dd className="print-grand-total">{fen(order.totalFen)}</dd></dl>
</section>
}
function csvCell(value: unknown) { const text = String(value ?? ''); const safe = /^\s*[=+\-@]/.test(text) ? `'${text}` : text; return `"${safe.replace(/"/g, '""')}"` }
function downloadOrderCsv(orders: any[]) {
  const header = ['订单号', '场景', '配送方式', '状态', '下单时间', '商品明细', '商品数量', '商品小计', '保温包装费', '配送费', '邮费', '订单合计', '收件人', '电话', '完整地址', '自取门店', '门店地址']
  const rows = orders.map((order) => { const items = (order.items || []).map((item: any) => `${item.productName}（${item.specName || '默认规格'}）×${item.quantity}`).join('\n'); const quantity = (order.items || []).reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0); return [order.orderNo, labelOf(sceneLabel, order.purchaseScene), labelOf(methodLabel, order.deliveryMethod), labelOf(statusLabel, order.orderStatus), formatTime(order.createdAt), items, quantity, fen(order.subtotalFen), order.purchaseScene === 'delivery' ? fen(order.insulationFeeFen) : '', order.deliveryMethod === 'local' ? fen(order.deliveryFeeFen) : '', order.deliveryMethod === 'shipping' ? fen(order.postageFen) : '', fen(order.totalFen), order.addressSnapshot?.contactName || '', order.addressSnapshot?.phone || '', order.addressSnapshot?.fullAddress || '', order.storeSnapshot?.name || '', order.storeSnapshot?.addressText || ''].map(csvCell).join(',') })
  const blob = new Blob([`\ufeff${[header.map(csvCell).join(','), ...rows].join('\r\n')}`], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `订单导出-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url)
}
function downloadProductCsv(products: any[]) {
  const header = ['商品标识', '商品名称', '分类', '自取价', '配送价', '库存数量', '销售状态', '到店自取上架', '同城外卖上架', '快递邮寄上架', '规格明细', '展示排序', '今日推荐', '最近更新']
  const rows = products.map((product) => {
    const required = shippingRequiredConfig(product.productId)
    const specs = (product.specs || []).map((spec: any) => `${spec.name || spec.specId || '默认规格'}${spec.enabled === false ? '（停用）' : ''}${Number(spec.extraFeeFen) ? ` +${fen(spec.extraFeeFen)}` : ''}`).join('\n')
    const listed = (supported: boolean) => product.enabled !== false && supported ? '已上架' : '已下架'
    return [product.productId, product.name, product.category, fen(product.priceFen), fen(product.deliveryPriceFen), required ? '固定充足' : (product.stockQuantity ?? '未设置'), product.soldOut || product.stockQuantity === 0 ? '不可售' : '可售', listed(product.supportsPickup !== false), listed(product.supportsLocalDelivery !== false), listed(product.supportsShipping !== false), specs, product.sortOrder, product.homeRecommended === true ? `是（顺序 ${product.homeRecommendOrder || 0}）` : '否', formatTime(product.updatedAt)].map(csvCell).join(',')
  })
  const blob = new Blob([`\ufeff${[header.map(csvCell).join(','), ...rows].join('\r\n')}`], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `商品导出-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url)
}
function ProductImageEditor({ getProductId, value = [], onChange, onError }: { getProductId: () => string; value?: string[]; onChange?: (value: string[]) => void; onError: (error: unknown) => void }) {
  const [uploading, setUploading] = useState(false); const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})
  useEffect(() => { let active = true; resolveCloudFileURLs(value.filter((url) => url.startsWith('cloud://'))).then((urls) => active && setPreviewUrls(urls)).catch(onError); return () => { active = false } }, [value.join('|')])
  const upload = async (file?: File, replaceIndex?: number) => {
    if (!file) return
    const productId = getProductId()
    if (!productId) return onError(new Error('请先填写商品标识再上传图片'))
    if (replaceIndex === undefined && value.length >= PRODUCT_IMAGE_RULES.maxCount) return onError(new Error('每个商品最多 5 张图片'))
    setUploading(true)
    try { const prepared = await prepareProductImage(file); const result = await adminApi.uploadProductImage(productId, prepared); URL.revokeObjectURL(prepared.previewUrl); onChange?.(replaceIndex === undefined ? [...value, result.fileID] : value.map((url, index) => index === replaceIndex ? result.fileID : url)) } catch (error) { onError(error) } finally { setUploading(false); if (inputRef.current) inputRef.current.value = '' }
  }
  const move = (from: number, to: number) => { const next = [...value]; const [item] = next.splice(from, 1); next.splice(to, 0, item); onChange?.(next) }
  return <div className="product-image-editor">
<Alert type="info" showIcon message="第 1 张图片是商品封面" description="自取与配送的商品卡片、详情页首图都会使用封面；可用上移、下移调整图片展示顺序。" />
<div className="product-image-grid">{value.map((url, index) => <div className="product-image-item" key={`${url}-${index}`}>
<div className="product-image-position"><Tag color={index === 0 ? 'magenta' : 'default'}>{index === 0 ? '封面 · 第 1 张' : `第 ${index + 1} 张`}</Tag></div>
<img src={previewUrls[url] || url} alt={`商品图 ${index + 1}`} />
<Space size={4}>
<Button size="small" disabled={index === 0} onClick={() => move(index, index - 1)}>上移</Button>
<Button size="small" disabled={index === value.length - 1} onClick={() => move(index, index + 1)}>下移</Button>
<Button size="small" onClick={() => { inputRef.current?.setAttribute('data-replace', String(index)); inputRef.current?.click() }}>替换</Button>
<Button size="small" danger onClick={() => onChange?.(value.filter((_, itemIndex) => itemIndex !== index))}>删除</Button>
</Space>
</div>)}</div>
<input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; const rawReplace = event.currentTarget.dataset.replace; delete event.currentTarget.dataset.replace; upload(file, rawReplace === undefined ? undefined : Number(rawReplace)) }} />
<Button loading={uploading} disabled={value.length >= PRODUCT_IMAGE_RULES.maxCount} onClick={() => inputRef.current?.click()}>上传图片</Button>
<Typography.Paragraph type="secondary" className="image-help">JPEG / PNG / WebP，原图≤10MB，宽高均600–6000px，比例3:5–9:5，最多5张。上传前等比缩放为最长边≤1600px的 JPEG，且≤1MB；不裁切。</Typography.Paragraph>
</div>
}
function ProductDisplayPreview() {
  const form = Form.useFormInstance(); const values = Form.useWatch([], form) || {}; const imageUrls = Array.isArray(values.imageUrls) ? values.imageUrls : []; const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})
  useEffect(() => { let active = true; resolveCloudFileURLs(imageUrls.filter((url: string) => url.startsWith('cloud://'))).then((urls) => active && setPreviewUrls(urls)).catch(() => active && setPreviewUrls({})); return () => { active = false } }, [imageUrls.join('|')])
  const cover = imageUrls[0] ? (previewUrls[imageUrls[0]] || imageUrls[0]) : ''; const name = String(values.name || '商品名称'); const summary = String(values.desc || '商城卡片简述会显示在这里'); const detail = String(values.detailDesc || values.desc || '商品详情介绍会显示在这里'); const specs = (Array.isArray(values.specs) ? values.specs : []).filter((spec: any) => spec?.enabled !== false); const price = (value: unknown) => `¥${(Number(value) || 0).toFixed(2)}`
  return <section className="product-display-preview">
<div className="preview-heading"><div><Typography.Text strong>顾客端展示预览</Typography.Text><Typography.Paragraph type="secondary">仅用于检查当前表单效果；保存时仍只提交现有商品字段。</Typography.Paragraph></div><Tag>第一张图片为封面</Tag></div>
<div className="scene-preview-grid">{[{ key: 'pickup', label: '到店自取', price: values.priceYuan }, { key: 'delivery', label: '外卖/邮寄', price: values.deliveryPriceYuan }].map((scene) => <Card key={scene.key} size="small" title={scene.label} className="scene-preview-card">
<div className="customer-card-preview">{cover ? <img src={cover} alt={`${scene.label}商品封面`} /> : <div className="preview-image-empty">暂无封面</div>}<div><Typography.Text strong>{name}</Typography.Text><Typography.Paragraph ellipsis={{ rows: 2 }}>{summary}</Typography.Paragraph><b>{price(scene.price)}</b></div></div>
<div className="customer-detail-preview"><Typography.Text type="secondary">详情关键信息</Typography.Text><Typography.Paragraph>{detail}</Typography.Paragraph><div className="preview-specs"><span>可选规格</span>{specs.length ? specs.map((spec: any, index: number) => <Tag key={`${spec.specId || spec.name}-${index}`}>{spec.name || '未命名'}{Number(spec.extraFeeYuan) > 0 ? ` +${price(spec.extraFeeYuan)}` : ''}</Tag>) : <Tag>暂无启用规格</Tag>}</div></div>
</Card>)}</div>
</section>
}
const queueLabel: Record<string, string> = { pending: '待处理', preparing: '制作中', fulfilling: '履约中', completed: '已完成', canceled: '已取消' }
const queueStatuses: Record<string, string[]> = { pending: ['placed'], preparing: ['preparing'], fulfilling: ['ready_for_pickup', 'delivering', 'awaiting_shipment', 'in_transit'], completed: ['completed'], canceled: ['canceled'] }
function nextStatusOf(order: any) { const flow = order.purchaseScene === 'pickup' ? ['placed', 'preparing', 'ready_for_pickup', 'completed'] : order.deliveryMethod === 'shipping' ? ['placed', 'preparing', 'awaiting_shipment', 'in_transit', 'completed'] : ['placed', 'preparing', 'delivering', 'completed']; const index = flow.indexOf(order.orderStatus); return index >= 0 && index < flow.length - 1 ? flow[index + 1] : null }
function waitAge(value: unknown) { const minutes = Math.max(0, Math.floor((Date.now() - new Date(String(value)).getTime()) / 60000)); return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟` }
function DashboardPage() {
  const navigate = useNavigate(); const [summary, setSummary] = useState<any>(); const [error, setError] = useState<any>(); const [unreadOrderNos, setUnreadOrderNos] = useState<string[]>([]); const knownPlaced = useRef<Set<string> | null>(null)
  const load = () => adminApi.getDashboardSummary().then(setSummary).catch(setError)
  const checkNewOrders = () => adminApi.listOrders({ orderStatus: 'placed', page: 1, pageSize: 100 }).then((data: any) => {
    const placed = (data.orders || []).map((order: any) => order.orderNo).filter(Boolean)
    if (knownPlaced.current === null) { knownPlaced.current = new Set(placed); return }
    const incoming = placed.filter((orderNo: string) => !knownPlaced.current?.has(orderNo))
    knownPlaced.current = new Set(placed)
    if (incoming.length) { setUnreadOrderNos((current) => [...new Set([...current, ...incoming])]); load() }
  }).catch(() => undefined)
  const openPending = () => { setUnreadOrderNos([]); navigate('/orders') }
  useEffect(() => { load(); checkNewOrders(); const interval = window.setInterval(checkNewOrders, 30000); return () => window.clearInterval(interval) }, [])
  if (!summary && !error) return <div className="page-center">
<Spin tip="正在加载经营概览" />
</div>
  const maxTrend = Math.max(1, ...(summary?.trend || []).map((item: any) => item.orderCount))
  return <>
<div className="page-heading">
<div>
<Typography.Title level={3}>首页</Typography.Title>
<Typography.Paragraph type="secondary">优先处理等待中的订单</Typography.Paragraph>
</div>
<Button onClick={load}>刷新</Button>
</div>{unreadOrderNos.length > 0 && <Alert type="info" showIcon message={`有 ${unreadOrderNos.length} 笔新的待处理订单`} action={<Button size="small" type="primary" onClick={openPending}>查看新订单</Button>} style={{ marginBottom: 16 }} />}{error && <ErrorBox error={error} />}{summary && <>
<div className="metric-grid">
<Card>
<Statistic title="今日订单数" value={summary.today.orderCount} suffix="笔" />
</Card>
<Card>
<Statistic title="今日订单金额" value={fen(summary.today.orderAmountFen)} />
</Card>
{summary.today.paidAmountFen !== undefined && <Card><Statistic title="今日实付" value={fen(summary.today.paidAmountFen)} /></Card>}
{summary.today.refundedAmountFen !== undefined && <Card><Statistic title="今日退款" value={fen(summary.today.refundedAmountFen)} /></Card>}
{summary.today.netReceivedAmountFen !== undefined && <Card><Statistic title="今日净实收" value={fen(summary.today.netReceivedAmountFen)} /></Card>}
<Card>
<Statistic title="今日完成" value={summary.today.completedCount} suffix="笔" />
</Card>
<Card>
<Statistic title="今日取消" value={summary.today.canceledCount} suffix="笔" />
</Card>
<Card>
<Statistic title="当前待处理" value={summary.today.pendingCount} suffix="笔" />
</Card>
</div><Alert type="info" showIcon message={summary.financialNotice} style={{ marginBottom: 16 }} />
<div className="dashboard-grid">
<Card title="待处理订单" extra={<Badge dot={unreadOrderNos.length > 0}>
<Button type="link" onClick={openPending}>进入工作台</Button>
</Badge>}>
<div className="queue-summary">{['pending', 'preparing', 'fulfilling'].map((queue) => <span key={queue}>
<b>{summary.queueCounts[queue] || 0}</b>{queueLabel[queue]}</span>)}</div>{summary.pendingOrders.length ? <Table rowKey="orderNo" size="small" pagination={false} dataSource={summary.pendingOrders} onRow={() => ({ onClick: openPending })} columns={[{ title: '订单', dataIndex: 'orderNo' }, { title: '等待', dataIndex: 'createdAt', render: waitAge }, { title: '场景', render: (_: unknown, order: any) => `${labelOf(sceneLabel, order.purchaseScene)}${order.deliveryMethod ? ` / ${labelOf(methodLabel, order.deliveryMethod)}` : ''}` }, { title: '金额', dataIndex: 'totalFen', render: fen }, { title: '下一步', render: (_: unknown, order: any) => order.paymentStatus === undefined ? '查看订单' : (canAdvanceOrder(order) ? '开始制作' : '等待支付') }]} /> : <Empty description="暂无待处理订单" image={Empty.PRESENTED_IMAGE_SIMPLE} />}</Card>
<Card title="近 7 天订单趋势">
<div className="trend-bars">{summary.trend.map((item: any) => <div className="trend-day" key={item.date}>
<span className="trend-value">{item.orderCount}</span>
<div className="trend-track">
<i style={{ height: `${Math.max(6, item.orderCount / maxTrend * 100)}%` }} />
</div>
<span>{item.date.slice(5)}</span>
<small>{fen(item.orderAmountFen)}</small>
</div>)}</div>
</Card>
</div>
</>}</>
}
function OrdersPage() {
  const { session } = useAuth()
  const [rows, setRows] = useState<any[]>([]); const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 20, queueCounts: {} as Record<string, number> }); const [filters, setFilters] = useState<any>({ queue: 'pending' }); const [error, setError] = useState<any>(); const [loading, setLoading] = useState(false); const [exporting, setExporting] = useState(false); const [selected, setSelected] = useState<any>(); const [unreadOrderNos, setUnreadOrderNos] = useState<string[]>([]); const [form] = Form.useForm(); const scene = Form.useWatch('purchaseScene', form); const knownPlaced = useRef<Set<string> | null>(null)
  const load = (next = {}) => { setLoading(true); adminApi.listOrders({ ...filters, ...next }).then((data: any) => { setRows(data.orders); setMeta(data) }).catch(setError).finally(() => setLoading(false)) }
  const checkNewOrders = () => adminApi.listOrders({ orderStatus: 'placed', page: 1, pageSize: 100 }).then((data: any) => {
    const placed = (data.orders || []).map((order: any) => order.orderNo).filter(Boolean)
    if (knownPlaced.current === null) { knownPlaced.current = new Set(placed); return }
    const incoming = placed.filter((orderNo: string) => !knownPlaced.current?.has(orderNo))
    knownPlaced.current = new Set(placed)
    if (incoming.length) setUnreadOrderNos((current) => [...new Set([...current, ...incoming])])
  }).catch(() => undefined)
  const closeAndReload = () => { setSelected(undefined); load(); checkNewOrders() }
  const showNewOrders = () => { form.resetFields(); setFilters({ queue: 'pending', page: 1 }); setUnreadOrderNos([]) }
  const confirmCancel = (order: any) => { let reason = ''; const paid = paymentStatusOf(order) === 'paid'; Modal.confirm({ title: paid ? '撤销订单并申请全额退款' : '撤销未支付订单', content: <><Alert type={paid ? 'warning' : 'info'} showIcon message={paid ? '撤销后将创建异步全额退款请求；退款不会立即标记成功。' : '撤销后将关闭支付并释放库存。'} style={{ marginBottom: 12 }} /><Input.TextArea autoFocus rows={3} maxLength={200} placeholder="请填写取消原因（顾客可见）" onChange={(event) => { reason = event.target.value }} /></>, okText: paid ? '撤销并申请退款' : '确认撤销', okButtonProps: { danger: true }, onOk: () => { if (!reason.trim()) return Promise.reject(new Error('请填写取消原因')); return adminApi.cancelOrder(order.orderNo, reason.trim()).then(closeAndReload).catch((cause) => { setError(cause); throw cause }) } }) }
  const retryRefund = (order: any) => { let reason = ''; Modal.confirm({ title: '重试全额退款', content: <Input.TextArea autoFocus rows={3} maxLength={200} placeholder="请填写重试原因" onChange={(event) => { reason = event.target.value }} />, okText: '重新提交退款', onOk: () => { if (!reason.trim()) return Promise.reject(new Error('请填写重试原因')); return adminApi.retryRefund(order.orderNo, reason.trim()).then(closeAndReload).catch((cause) => { setError(cause); throw cause }) } }) }
  useEffect(() => { load() }, [filters])
  useEffect(() => { checkNewOrders(); const interval = window.setInterval(checkNewOrders, 30000); return () => window.clearInterval(interval) }, [])
  const updateOrder = (order: any) => { const next = nextStatusOf(order); if (!next || !canAdvanceOrder(order)) return; Modal.confirm({ title: `将订单更新为“${labelOf(statusLabel, next)}”？`, okText: '确认更新', onOk: () => adminApi.advanceOrder(order.orderNo, next).then(closeAndReload).catch(setError) }) }
  const exportOrders = async () => { setExporting(true); setError(undefined); try { const all: any[] = []; let page = 1; let total = 0; do { const result: any = await adminApi.listOrders({ ...filters, page, pageSize: 100 }); all.push(...(result.orders || [])); total = Number(result.total) || 0; page += 1 } while (all.length < total); downloadOrderCsv(all); if (!session?.permissions.includes('orders.address.read') && all.some((order) => order.purchaseScene === 'delivery')) Modal.info({ title: '导出完成', content: '当前账号没有配送地址查看权限，CSV 中配送收件人、电话和完整地址列已留空。' }) } catch (cause) { setError(cause) } finally { setExporting(false) } }
  return <><PageIntro title="订单工作台" description="按处理阶段查看订单，优先处理等待时间较长的订单。" actions={<Badge count={unreadOrderNos.length} size="small"><Space><Button loading={exporting} onClick={exportOrders}>导出当前筛选</Button><Button type="primary" onClick={showNewOrders}>查看新订单</Button></Space></Badge>} /><Card className="content-card order-workbench">
    {unreadOrderNos.length > 0 && <Alert type="info" showIcon message={`有 ${unreadOrderNos.length} 笔新的待处理订单`} action={<Button size="small" type="primary" onClick={showNewOrders}>查看新订单</Button>} style={{ marginBottom: 16 }} />}
    <Tabs activeKey={filters.queue} onChange={(queue) => { form.resetFields(); setFilters({ queue, page: 1 }) }} items={Object.keys(queueLabel).map((queue) => ({ key: queue, label: <span>{queueLabel[queue]} <Badge count={meta.queueCounts[queue] || 0} showZero overflowCount={999} />
</span> }))} />
    <Collapse ghost items={[{ key: 'filters', label: '更多筛选', children: <Form form={form} layout="inline" onValuesChange={(changed) => { if (changed.purchaseScene === 'pickup') form.setFieldValue('deliveryMethod', undefined) }} onFinish={({ orderDateRange, ...values }) => setFilters({ ...filters, ...values, orderStartDate: orderDateRange?.[0]?.format('YYYY-MM-DD'), orderEndDate: orderDateRange?.[1]?.format('YYYY-MM-DD'), page: 1 })}>
<Form.Item name="keyword">
<Input placeholder="订单号关键词" allowClear />
</Form.Item>
<Form.Item name="purchaseScene">
<Select allowClear placeholder="购买场景" style={{ width: 130 }} options={[{ value: 'pickup', label: '到店自取' }, { value: 'delivery', label: '外卖/邮寄' }]} />
</Form.Item>
<Form.Item name="deliveryMethod">
<Select allowClear disabled={scene === 'pickup'} placeholder={scene === 'pickup' ? '自取无需配送' : '配送方式'} style={{ width: 130 }} options={[{ value: 'local', label: '同城外卖' }, { value: 'shipping', label: '快递邮寄' }]} />
</Form.Item>
<Form.Item name="orderDateRange">
<DatePicker.RangePicker allowClear format="YYYY-MM-DD" placeholder={['下单开始日期', '下单结束日期']} />
</Form.Item>
<Button htmlType="submit" type="primary">应用筛选</Button>
</Form> }]} />
    {error && <ErrorBox error={error} />}<Table rowKey="orderNo" loading={loading} onRow={(order) => ({ onClick: () => adminApi.getOrder(order.orderNo).then(setSelected).catch(setError) })} locale={{ emptyText: <Empty description="当前队列暂无订单" /> }} pagination={{ current: meta.page, pageSize: meta.pageSize, total: meta.total, onChange: (page, pageSize) => load({ page, pageSize }) }} dataSource={rows} columns={[{ title: '订单', dataIndex: 'orderNo' }, { title: '等待时长', dataIndex: 'createdAt', render: (value: unknown, order: any) => filters.queue === 'pending' ? waitAge(value) : formatTime(value) }, { title: '场景 / 配送', render: (_: unknown, order: any) => <Space size={4}>
<Tag>{labelOf(sceneLabel, order.purchaseScene)}</Tag>{order.deliveryMethod && <Tag>{labelOf(methodLabel, order.deliveryMethod)}</Tag>}</Space> }, { title: '资金状态', render: (_: unknown, order: any) => session?.permissions.includes('payments.read') ? <Space direction="vertical" size={2}><Tag color={paymentStatusOf(order) === 'paid' ? 'green' : 'default'}>{labelOf(paymentStatusLabel, paymentStatusOf(order))}</Tag>{refundStatusOf(order) !== 'none' && <Tag color={refundStatusOf(order) === 'failed' ? 'red' : refundStatusOf(order) === 'succeeded' ? 'green' : 'gold'}>{labelOf(refundStatusLabel, refundStatusOf(order))}</Tag>}</Space> : <Typography.Text type="secondary">无权限</Typography.Text> }, { title: '商品数', render: (_: unknown, order: any) => order.items.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0) }, { title: '金额', dataIndex: 'totalFen', render: fen }, { title: '下一步', render: (_: unknown, order: any) => { const next = nextStatusOf(order), allowed = canAdvanceOrder(order); return next ? <Button type="primary" disabled={!allowed} title={allowed ? '' : '订单支付成功后才能进入制作'} onClick={(event) => { event.stopPropagation(); updateOrder(order) }}>{allowed ? `更新为${labelOf(statusLabel, next)}` : '等待支付'}</Button> : <span>-</span> } }]} />
    <Drawer title={selected ? `订单 ${selected.order.orderNo}` : ''} width={680} open={Boolean(selected)} onClose={() => setSelected(undefined)}>{selected && <>
      <Typography.Title level={5}>订单信息</Typography.Title>
<Descriptions column={1} size="small">
<Descriptions.Item label="下单时间">{formatTime(selected.order.createdAt)}</Descriptions.Item>
<Descriptions.Item label="最近更新">{formatTime(selected.order.updatedAt)}</Descriptions.Item>
<Descriptions.Item label="完成时间">{formatTime(selected.order.completedAt)}</Descriptions.Item>
<Descriptions.Item label="撤销时间">{formatTime(selected.order.canceledAt)}</Descriptions.Item>
<Descriptions.Item label="场景">{labelOf(sceneLabel, selected.order.purchaseScene)}</Descriptions.Item>
<Descriptions.Item label="配送方式">{labelOf(methodLabel, selected.order.deliveryMethod)}</Descriptions.Item>
<Descriptions.Item label="状态">{labelOf(statusLabel, selected.order.orderStatus)}</Descriptions.Item>
</Descriptions>
      <Typography.Title level={5}>支付与退款</Typography.Title>
{session?.permissions.includes('payments.read') ? <Descriptions column={1} size="small">
<Descriptions.Item label="支付状态">{labelOf(paymentStatusLabel, paymentStatusOf(selected.order))}</Descriptions.Item><Descriptions.Item label="退款状态">{labelOf(refundStatusLabel, refundStatusOf(selected.order))}</Descriptions.Item><Descriptions.Item label="应付金额">{fen(selected.order.payableAmountFen)}</Descriptions.Item><Descriptions.Item label="实付金额">{fen(selected.order.paidAmountFen)}</Descriptions.Item><Descriptions.Item label="已退款金额">{fen(selected.order.refundedAmountFen)}</Descriptions.Item>
</Descriptions> : <Alert type="info" showIcon message="当前账号没有资金数据查看权限；订单金额不代表实收。" />}
      <Typography.Title level={5}>商品明细</Typography.Title>
<Table rowKey={(item: any) => `${item.productId}-${item.specId}`} size="small" pagination={false} dataSource={selected.order.items} columns={[{ title: '商品', dataIndex: 'productName' }, { title: '规格', dataIndex: 'specName' }, { title: '单价', dataIndex: 'unitPriceFen', render: fen }, { title: '数量', dataIndex: 'quantity' }, { title: '小计', dataIndex: 'lineTotalFen', render: fen }]} />
      {selected.order.deliveryMethod === 'shipping' && <Typography.Paragraph>快递费用：默认顺丰特快到付</Typography.Paragraph>}
      {selected.order.deliveryMethod === 'local' && !hasLegacyLocalFees(selected.order) && <Typography.Paragraph>同城配送费：到付；打包费用已作为商品计入商品小计。</Typography.Paragraph>}
      <Typography.Title level={5}>费用明细</Typography.Title>
<Descriptions column={1} size="small">
<Descriptions.Item label="商品小计">{fen(selected.order.subtotalFen)}</Descriptions.Item>{hasLegacyLocalFees(selected.order) && <Descriptions.Item label="保温包装费">{fen(selected.order.insulationFeeFen)}</Descriptions.Item>}{hasLegacyLocalFees(selected.order) && <Descriptions.Item label="配送费">{fen(selected.order.deliveryFeeFen)}</Descriptions.Item>}<Descriptions.Item label="订单合计">{fen(selected.order.totalFen)}</Descriptions.Item>
</Descriptions>
      {selected.order.purchaseScene === 'pickup' ? <>
<Typography.Title level={5}>自取门店</Typography.Title>
<Descriptions column={1} size="small">
<Descriptions.Item label="门店">{selected.order.storeSnapshot?.name || '-'}</Descriptions.Item>
<Descriptions.Item label="地址">{selected.order.storeSnapshot?.addressText || '-'}</Descriptions.Item>
<Descriptions.Item label="营业时间">{selected.order.storeSnapshot?.businessHours || '-'}</Descriptions.Item>
</Descriptions>
</> : <>
<Typography.Title level={5}>配送收件信息</Typography.Title>{selected.order.addressSnapshot ? <Descriptions column={1} size="small">
<Descriptions.Item label="收件人">{selected.order.addressSnapshot.contactName || '-'}</Descriptions.Item>
<Descriptions.Item label="联系电话">{selected.order.addressSnapshot.phone || '-'}</Descriptions.Item>
<Descriptions.Item label="收货地址">{selected.order.addressSnapshot.fullAddress || '-'}</Descriptions.Item>
<Descriptions.Item label="邮编">{selected.order.addressSnapshot.postalCode || '-'}</Descriptions.Item>
</Descriptions> : <Alert type="info" showIcon message="当前账号没有查看配送地址的权限" />}</>}
      {(() => { const printable = printableOrder(selected.order, session?.permissions || []); return <><Typography.Title level={5}>订单打印</Typography.Title>{!printable.ready && <Alert type="warning" showIcon message={printable.reason} style={{ marginBottom: 12 }} />}<Button disabled={!printable.ready} title={printable.reason || '打印订单商品单'} onClick={() => window.print()}>打印订单</Button>{printable.ready && <OrderPrintSheet order={selected.order} />}</> })()}
      <Typography.Title level={5}>状态历史</Typography.Title>
<Table rowKey={(r) => `${r.changedAt}-${r.toStatus}`} size="small" pagination={false} dataSource={selected.history} columns={[{ title: '时间', dataIndex: 'changedAt', render: formatTime }, { title: '来源', dataIndex: 'source' }, { title: '状态', render: (_: unknown, r: any) => `${labelOf(statusLabel, r.fromStatus)} -> ${labelOf(statusLabel, r.toStatus)}` }, { title: '原因', dataIndex: 'reason', render: (v: string) => v || '-' }]} />
      <Space style={{ marginTop: 16 }}>
<Button type="primary" disabled={!selected.nextStatus || !canAdvanceOrder(selected.order)} title={!canAdvanceOrder(selected.order) ? '订单支付成功后才能进入制作' : ''} onClick={() => Modal.confirm({ title: `将订单更新为“${labelOf(statusLabel, selected.nextStatus)}”？`, okText: '确认更新', onOk: () => adminApi.advanceOrder(selected.order.orderNo, selected.nextStatus).then(closeAndReload).catch(setError) })}>{selected.nextStatus ? (canAdvanceOrder(selected.order) ? `更新为${labelOf(statusLabel, selected.nextStatus)}` : '等待支付') : '订单已结束'}</Button>
<Button danger disabled={selected.order.orderStatus !== 'placed'} onClick={() => confirmCancel(selected.order)}>撤销订单</Button>
{refundStatusOf(selected.order) === 'failed' && session?.permissions.includes('refunds.retry') && <Button onClick={() => retryRefund(selected.order)}>重试退款</Button>}
</Space>
    </>}</Drawer>
  </Card></>
}
function CategoryManager({ open, categories, onClose, onChanged, onError }: { open: boolean; categories: any[]; onClose: () => void; onChanged: () => void; onError: (error: unknown) => void }) {
  const [editing, setEditing] = useState<any>(); const [saving, setSaving] = useState(false); const [form] = Form.useForm()
  const edit = (category?: any) => { setEditing(category || { isNew: true }); form.resetFields(); form.setFieldsValue(category || { enabled: true, sortOrder: 0 }) }
  const save = () => form.validateFields().then((values) => { const fixed = editing?.name === SHIPPING_REQUIRED_CATEGORY || values.name === SHIPPING_REQUIRED_CATEGORY, category = fixed ? { ...values, name: SHIPPING_REQUIRED_CATEGORY, enabled: true } : values; setSaving(true); const request = editing.isNew ? adminApi.createProductCategory(values.categoryId, category) : adminApi.saveProductCategory(editing.categoryId, editing.version, category); return request.then(() => { setEditing(undefined); onChanged() }).catch(onError).finally(() => setSaving(false)) })
  return <Modal title="商品分类管理" open={open} width={720} footer={null} onCancel={onClose}><Button type="primary" onClick={() => edit()} style={{ marginBottom: 12 }}>新增分类</Button><Table size="small" pagination={false} rowKey="categoryId" dataSource={categories} columns={[{ title: '分类', dataIndex: 'name' }, { title: '排序', dataIndex: 'sortOrder' }, { title: '状态', render: (_: unknown, item: any) => <Tag color={item.enabled ? 'green' : 'default'}>{item.enabled ? '已启用' : '已停用'}</Tag> }, { title: '操作', render: (_: unknown, item: any) => <Space><Button onClick={() => edit(item)}>编辑</Button><Button danger disabled={item.name === SHIPPING_REQUIRED_CATEGORY} onClick={() => Modal.confirm({ title: `删除分类“${item.name}”？`, content: '只有未被任何商品使用的分类才能删除。', okText: '删除', okButtonProps: { danger: true }, onOk: () => adminApi.deleteProductCategory(item.categoryId).then(onChanged).catch(onError) })}>删除</Button></Space> }]} />
  <Modal title={editing?.isNew ? '新增分类' : '编辑分类'} open={Boolean(editing)} confirmLoading={saving} onCancel={() => setEditing(undefined)} onOk={save}>{editing && <Form form={form} layout="vertical">{editing.name === SHIPPING_REQUIRED_CATEGORY && <Alert type="info" showIcon message="“拍前必读”是快递流程固定分类，名称不可修改且保存后保持启用。" style={{ marginBottom: 12 }} />}{editing.isNew && <Form.Item name="categoryId" label="分类标识" extra="创建后不可修改。" rules={[{ required: true }, { pattern: /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/, message: '仅支持字母、数字、下划线和短横线' }]}><Input /></Form.Item>}<Form.Item name="name" label="分类名称" rules={[{ required: true }, { max: 40 }]}><Input disabled={editing.name === SHIPPING_REQUIRED_CATEGORY} /></Form.Item><Form.Item name="sortOrder" label="排序" rules={[{ required: true, type: 'number', min: 0 }]}><InputNumber min={0} precision={0} /></Form.Item><Form.Item name="enabled" label="启用" valuePropName="checked"><Switch disabled={editing.name === SHIPPING_REQUIRED_CATEGORY} /></Form.Item></Form>}</Modal></Modal>
}
function ProductSpecsEditor() {
  const form = Form.useFormInstance(); const specs = Form.useWatch('specs', form) || []
  const move = (from: number, to: number) => { const next = [...specs]; const [item] = next.splice(from, 1); next.splice(to, 0, item); form.setFieldValue('specs', next) }
  const remove = (index: number, name?: string) => Modal.confirm({ title: `删除规格“${name || '未命名规格'}”？`, content: '删除后仅影响后续购买，不会改动历史订单中的规格快照。', okText: '删除', okButtonProps: { danger: true }, onOk: () => form.setFieldValue('specs', specs.filter((_: any, itemIndex: number) => itemIndex !== index)) })
  return <Form.List name="specs" rules={[{ validator: (_, value) => Array.isArray(value) && value.length ? Promise.resolve() : Promise.reject(new Error('至少保留一个规格')) }, { validator: (_, value) => (value || []).some((item: any) => item?.enabled !== false) ? Promise.resolve() : Promise.reject(new Error('至少启用一个规格；如暂停整个商品，请使用“上架”开关')) }, { validator: (_, value) => { const ids = (value || []).map((item: any) => item?.specId?.trim()).filter(Boolean); return new Set(ids).size === ids.length ? Promise.resolve() : Promise.reject(new Error('规格标识不能重复')) } }]}>{(fields, { add }, { errors }) => <div className="spec-editor">
<div className="spec-editor-heading"><div><Typography.Text strong>规格选项</Typography.Text><Typography.Paragraph type="secondary">顾客选中规格后，实付价 = 场景基础价 + 规格加价。</Typography.Paragraph></div><Button onClick={() => add({ specId: '', name: '', extraFeeYuan: 0, enabled: true })}>+新增规格</Button></div>
{fields.map((field, index) => <Card size="small" className="spec-row" key={field.key} title={`规格 ${index + 1}`} extra={<Space><Button size="small" disabled={index === 0} onClick={() => move(index, index - 1)}>上移</Button><Button size="small" disabled={index === fields.length - 1} onClick={() => move(index, index + 1)}>下移</Button><Button size="small" danger disabled={fields.length === 1} onClick={() => remove(index, specs[index]?.name)}>删除</Button></Space>}>
<div className="spec-fields"><Form.Item {...field} name={[field.name, 'specId']} label="规格标识" extra={index === 0 ? '保存后建议不修改，避免已加入购物车的项目失效。' : undefined} rules={[{ required: true, message: '请填写规格标识' }, { pattern: /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/, message: '仅支持字母、数字、下划线和短横线' }]}><Input placeholder="如 large" /></Form.Item><Form.Item {...field} name={[field.name, 'name']} label="规格名称" rules={[{ required: true, whitespace: true, message: '请填写规格名称' }, { max: 80 }]}><Input placeholder="如 大份" /></Form.Item><Form.Item {...field} name={[field.name, 'extraFeeYuan']} label="加价（元）" rules={[{ required: true, type: 'number', min: 0, message: '加价不能为负数' }]}><InputNumber min={0} precision={2} /></Form.Item><Form.Item {...field} name={[field.name, 'enabled']} label="可选" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item></div>
</Card>)}<Form.ErrorList errors={errors} />{!fields.length && <Alert type="warning" showIcon message="至少需要一个规格" />}</div>}</Form.List>
}
function ProductsPage() { const [rows, setRows] = useState<any[]>([]);
const [categories, setCategories] = useState<any[]>([]);
const [meta, setMeta] = useState<any>({ total: 0, page: 1, pageSize: 20 });
const [filters, setFilters] = useState<any>({});
const [error, setError] = useState<any>();
const [loading, setLoading] = useState(false);
const [exporting, setExporting] = useState(false);
const [bulkListing, setBulkListing] = useState<'up' | 'down'>();
const [bulkSoldOut, setBulkSoldOut] = useState<'on' | 'off'>();
const [editing, setEditing] = useState<any>();
const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
const [recommendationOpen, setRecommendationOpen] = useState(false);
const [recommendationProducts, setRecommendationProducts] = useState<any[]>([]);
const [recommendationIds, setRecommendationIds] = useState<string[]>([]);
const [form] = Form.useForm();
const categoryOptions = categories.map((item) => ({ value: item.categoryId, label: item.enabled ? item.name : `${item.name}（已停用）`, disabled: !item.enabled && !(editing?.categoryIds || []).includes(item.categoryId) }));
const load = () => { setLoading(true);
adminApi.listProducts(filters).then((data: any) => { setRows(data.products);
setMeta(data) }).catch(setError).finally(() => setLoading(false)) };
const loadCategories = () => adminApi.listProductCategories().then((data: any) => setCategories(data.categories)).catch(setError);
useEffect(load, [filters]);
useEffect(() => { loadCategories() }, []);
const openCreate = () => { setEditing({ isNew: true });
form.resetFields();
form.setFieldsValue({ imageUrls: [], categoryIds: [], pickupListed: true, deliveryListed: true, stockQuantity: 0, priceYuan: 0, deliveryPriceYuan: 0, sortOrder: 0, specs: [{ specId: 'standard', name: '标准规格', extraFeeYuan: 0, enabled: true }] }) };
const openEdit = (product: any) => { const required = shippingRequiredConfig(product.productId); setEditing(product); const legacyCategoryIds = categories.filter((item) => item.name === product.category).map((item) => item.categoryId);
form.setFieldsValue({ ...product, categoryIds: product.categoryIds?.length ? product.categoryIds : legacyCategoryIds, ...listingValues(product), stockQuantity: required ? 999999 : product.stockQuantity, priceYuan: product.priceFen / 100, deliveryPriceYuan: product.deliveryPriceFen / 100, specs: (product.specs || []).map((spec: any) => ({ ...spec, specId: spec.specId || spec.id, extraFeeYuan: (Number(spec.extraFeeFen) || 0) / 100, enabled: spec.enabled !== false })) }) };
const openRecommendations = () => { setLoading(true); adminApi.listProducts({ page: 1, pageSize: 100 }).then((data: any) => { const products = data.products || []; setRecommendationProducts(products); setRecommendationIds(products.filter((item: any) => item.homeRecommended === true).sort((a: any, b: any) => (a.homeRecommendOrder || 0) - (b.homeRecommendOrder || 0)).map((item: any) => item.productId)); setRecommendationOpen(true) }).catch(setError).finally(() => setLoading(false)) };
const moveRecommendation = (index: number, offset: number) => setRecommendationIds((current) => { const next = [...current], target = index + offset; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next });
const saveRecommendations = () => { setLoading(true); return adminApi.saveHomeRecommendations(recommendationIds).then(() => { setRecommendationOpen(false); load() }).catch(setError).finally(() => setLoading(false)) };
const exportProducts = async () => { setExporting(true); setError(undefined); try { const all: any[] = []; let page = 1; let total = 0; do { const result: any = await adminApi.listProducts({ ...filters, page, pageSize: 100 }); all.push(...(result.products || [])); total = Number(result.total) || 0; page += 1 } while (all.length < total); downloadProductCsv(all) } catch (cause) { setError(cause) } finally { setExporting(false) } };
const bulkSetListing = (listed: boolean) => Modal.confirm({ title: listed ? '一键上架当前筛选？' : '一键下架当前筛选？', content: `将${listed ? '同时开启' : '同时关闭'}当前筛选中普通商品的到店自取与外卖/邮寄上架状态。当前匹配 ${meta.total || 0} 件；配送必拍商品会按业务规则跳过。`, okText: listed ? '确认全部上架' : '确认全部下架', okButtonProps: { danger: !listed }, onOk: async () => { setBulkListing(listed ? 'up' : 'down'); setError(undefined); try { const result = await adminApi.bulkSetProductListing({ keyword: filters.keyword, categoryId: filters.categoryId }, listed); Modal.success({ title: listed ? '批量上架完成' : '批量下架完成', content: `匹配 ${result.matchedCount} 件，已更新 ${result.updatedCount} 件${result.skippedRequiredCount ? `，跳过配送必拍商品 ${result.skippedRequiredCount} 件` : ''}。` }); load() } catch (cause) { setError(cause); throw cause } finally { setBulkListing(undefined) } } });
const bulkSetSoldOut = (soldOut: boolean) => Modal.confirm({ title: soldOut ? '一键售罄当前筛选？' : '一键恢复当前筛选？', content: `${soldOut ? '将把' : '将恢复'}当前筛选中的普通商品${soldOut ? '设为售罄' : '为可售'}。当前匹配 ${meta.total || 0} 件；配送必拍商品会按业务规则跳过。`, okText: soldOut ? '确认全部售罄' : '确认全部恢复', okButtonProps: { danger: soldOut }, onOk: async () => { setBulkSoldOut(soldOut ? 'on' : 'off'); setError(undefined); try { const result = await adminApi.bulkSetProductSoldOut({ keyword: filters.keyword, categoryId: filters.categoryId }, soldOut); Modal.success({ title: soldOut ? '批量售罄完成' : '批量恢复完成', content: `匹配 ${result.matchedCount} 件，已更新 ${result.updatedCount} 件${result.skippedRequiredCount ? `，跳过配送必拍商品 ${result.skippedRequiredCount} 件` : ''}。` }); load() } catch (cause) { setError(cause); throw cause } finally { setBulkSoldOut(undefined) } } });
const save = () => form.validateFields().then((values) => { const required = shippingRequiredConfig(editing?.productId || editing?.requiredProductId || values.productId), listing = required ? { enabled: true, supportsPickup: false, supportsLocalDelivery: required.methods.includes('local'), supportsShipping: required.methods.includes('shipping') } : listingFields(editing.isNew ? null : editing, values.pickupListed === true, values.deliveryListed === true); const requiredCategoryId = categories.find((item) => item.name === SHIPPING_REQUIRED_CATEGORY)?.categoryId; if (required && !requiredCategoryId) throw new Error('未找到“拍前必读”固定分类，请先刷新分类后重试'); const selectedIds = required ? [requiredCategoryId] : values.categoryIds; const selectedNames = selectedIds.map((id: string) => categories.find((item) => item.categoryId === id)?.name).filter(Boolean); const product = { ...values, ...listing, name: values.name, categoryIds: selectedIds, category: required ? SHIPPING_REQUIRED_CATEGORY : (selectedNames[0] || ''), priceFen: required ? 0 : Math.round(values.priceYuan * 100), deliveryPriceFen: required?.priceLocked ? 0 : Math.round(values.deliveryPriceYuan * 100), stockQuantity: required ? 999999 : values.stockQuantity, specs: required ? [{ specId: 'standard', name: '标准规格', extraFeeFen: 0, enabled: true }] : values.specs.map((spec: any) => ({ specId: spec.specId.trim(), name: spec.name.trim(), extraFeeFen: Math.round(spec.extraFeeYuan * 100), enabled: spec.enabled !== false })) }; delete product.priceYuan; delete product.deliveryPriceYuan; delete product.pickupListed; delete product.deliveryListed;
setLoading(true);
const request = editing.isNew ? adminApi.createProduct(values.productId, product) : adminApi.saveProduct(editing.productId, editing.version, product);
return request.then(() => { setEditing(undefined);
load();
loadCategories() }).catch(setError).finally(() => setLoading(false)) });
return <><PageIntro title="商品与分类" description="统一管理商品资料、图片、规格、库存、首页推荐和销售状态。" actions={<Space wrap><Button loading={bulkListing === 'up'} disabled={!meta.total || Boolean(bulkListing)} onClick={() => bulkSetListing(true)}>一键上架当前筛选</Button><Button danger loading={bulkListing === 'down'} disabled={!meta.total || Boolean(bulkListing)} onClick={() => bulkSetListing(false)}>一键下架当前筛选</Button><Button loading={exporting} onClick={exportProducts}>导出当前筛选</Button><Button onClick={openRecommendations}>设置今日推荐</Button><Button onClick={() => setCategoryManagerOpen(true)}>管理分类</Button><Button type="primary" onClick={openCreate}>新增商品</Button></Space>} /><Space wrap style={{ marginBottom: 16 }}><Button danger loading={bulkSoldOut === 'on'} disabled={!meta.total || Boolean(bulkListing) || Boolean(bulkSoldOut)} onClick={() => bulkSetSoldOut(true)}>一键售罄当前筛选</Button><Button loading={bulkSoldOut === 'off'} disabled={!meta.total || Boolean(bulkListing) || Boolean(bulkSoldOut)} onClick={() => bulkSetSoldOut(false)}>一键恢复当前筛选</Button></Space><Card className="content-card">
<CategoryManager open={categoryManagerOpen} categories={categories} onClose={() => setCategoryManagerOpen(false)} onChanged={loadCategories} onError={setError} />
<Modal title="首页今日推荐" width={680} open={recommendationOpen} confirmLoading={loading} onCancel={() => setRecommendationOpen(false)} onOk={saveRecommendations} okText="保存推荐"><Alert type="info" showIcon message="选择 0–6 件商品" description="首页将严格按下方顺序展示；清空后首页显示暂无推荐。已下架或无库存商品不会展示。" style={{ marginBottom: 16 }} /><Select mode="multiple" value={recommendationIds} maxCount={6} style={{ width: '100%', marginBottom: 16 }} placeholder="选择推荐商品" options={recommendationProducts.filter((item) => item.enabled !== false && (item.supportsPickup !== false || item.supportsLocalDelivery !== false || item.supportsShipping !== false)).map((item) => ({ value: item.productId, label: `${item.name}（${item.category}）` }))} onChange={(ids) => setRecommendationIds(ids.slice(0, 6))} /><Table size="small" pagination={false} rowKey="productId" dataSource={recommendationIds.map((id, index) => ({ productId: id, index, name: recommendationProducts.find((item) => item.productId === id)?.name || id }))} columns={[{ title: '顺序', render: (_: unknown, row: any) => row.index + 1 }, { title: '商品', dataIndex: 'name' }, { title: '调整', render: (_: unknown, row: any) => <Space><Button size="small" disabled={row.index === 0} onClick={() => moveRecommendation(row.index, -1)}>上移</Button><Button size="small" disabled={row.index === recommendationIds.length - 1} onClick={() => moveRecommendation(row.index, 1)}>下移</Button><Button size="small" danger onClick={() => setRecommendationIds((ids) => ids.filter((id) => id !== row.productId))}>移除</Button></Space> }]} /></Modal>
<Form layout="inline" onFinish={(values) => setFilters({ ...values, page: 1 })}>
<Form.Item name="keyword">
<Input placeholder="商品关键词" allowClear />
</Form.Item>
<Form.Item name="categoryId">
<AutoComplete allowClear options={categoryOptions} placeholder="分类" style={{ width: 150 }} />
</Form.Item>
<Button htmlType="submit" type="primary">筛选</Button>
</Form>{error && <ErrorBox error={error} />}<Table rowKey="productId" loading={loading} dataSource={rows} pagination={{ current: meta.page, pageSize: meta.pageSize, total: meta.total, onChange: (page, pageSize) => setFilters({ ...filters, page, pageSize }) }} columns={[{ title: '商品', dataIndex: 'name', render: (name: string, r: any) => <Space>{name}{shippingRequiredConfig(r.productId) && <Tag color="blue">配送必拍</Tag>}</Space> }, { title: '分类', render: (_: string, r: any) => (r.categoryNames || [r.category]).join('、') }, { title: '自取价', dataIndex: 'priceFen', render: (v: number) => `¥${(v / 100).toFixed(2)}` }, { title: '库存', dataIndex: 'stockQuantity', render: (v: number | null, r: any) => shippingRequiredConfig(r.productId) ? '固定充足' : (v === null ? '未设置' : v) }, { title: '状态', render: (_: unknown, r: any) => <Space>
<Tag color={r.soldOut || r.stockQuantity === 0 ? 'red' : 'green'}>{r.soldOut || r.stockQuantity === 0 ? '不可售' : '可售'}</Tag>
<Tag color={r.enabled !== false && r.supportsPickup !== false ? 'green' : 'default'}>自取{r.enabled !== false && r.supportsPickup !== false ? '已上架' : '已下架'}</Tag>
<Tag color={r.enabled !== false && (r.supportsLocalDelivery !== false || r.supportsShipping !== false) ? 'green' : 'default'}>配送{r.enabled !== false && (r.supportsLocalDelivery !== false || r.supportsShipping !== false) ? '已上架' : '已下架'}</Tag>
</Space> }, { title: '操作', render: (_: unknown, r: any) => <Space>
<Button disabled={Boolean(shippingRequiredConfig(r.productId))} onClick={() => adminApi.toggleSoldOut(r.productId, !r.soldOut).then(() => { load();
loadCategories() }).catch(setError)}>{r.soldOut ? '恢复销售' : '设为售罄'}</Button>
<Button onClick={() => openEdit(r)}>编辑</Button>
<Button danger disabled={Boolean(shippingRequiredConfig(r.productId))} onClick={() => Modal.confirm({ title: `删除“${r.name}”？`, content: '不会影响已有订单记录，但用户端将无法再购买该商品。', okText: '删除', okButtonProps: { danger: true }, onOk: () => adminApi.deleteProduct(r.productId).then(() => { load();
loadCategories() }).catch(setError) })}>删除</Button>
</Space> }]} />
<Modal title={editing?.isNew ? '新增商品' : '编辑商品'} width={920} className="product-modal" open={Boolean(editing)} confirmLoading={loading} onCancel={() => setEditing(undefined)} onOk={save}>
{editing && shippingRequiredConfig(editing.productId || editing.requiredProductId) && <Alert type="info" showIcon message="配送必拍商品" description="该商品归入“拍前必读”分类。名称、图片、说明、排序以及打包商品的配送价格可维护；商品标识、分类、standard 规格、配送范围和固定 1 件语义不可修改。库存由系统保持充足，无需填写。" style={{ marginBottom: 16 }} />}
<Form form={form} layout="vertical">{editing?.isNew && <Form.Item name="productId" label="商品标识" extra="仅支持字母、数字、下划线和短横线；创建后不可修改。" rules={[{ required: true }, { pattern: /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/, message: '商品标识格式不正确' }]}>
<Input disabled={Boolean(editing?.requiredProductId)} />
</Form.Item>}<Form.Item name="name" label="名称" rules={[{ required: true }]}>
<Input />
</Form.Item>
<Form.Item name="imageUrls" label="商品图片">
<ProductImageEditor getProductId={() => editing?.productId || form.getFieldValue('productId') || ''} onError={setError} />
</Form.Item>
<Form.Item name="categoryIds" label="分类" extra="已停用分类仅保留给已有商品，不能再分配。" rules={[{ required: true, message: '请选择分类' }]}>
<Select mode="multiple" maxCount={2} disabled={Boolean(shippingRequiredConfig(editing?.productId || editing?.requiredProductId))} options={categoryOptions} placeholder="选择分类" />
</Form.Item>
<Form.Item name="desc" label="商城卡片简述" rules={[{ required: true, message: '请填写商城卡片简述' }, { max: 80 }]} extra="用于商品列表和首页卡片，建议 20 字内。">
<Input.TextArea rows={2} showCount maxLength={80} />
</Form.Item>
<Form.Item name="detailDesc" label="商品详情介绍" rules={[{ max: 500 }]} extra="用于商品详情页；留空时自动显示商城卡片简述。">
<Input.TextArea rows={4} showCount maxLength={500} />
</Form.Item>
<Form.Item name="priceYuan" label="自取价（元）" rules={[{ required: true, type: 'number', min: 0 }]}>
<InputNumber disabled={Boolean(shippingRequiredConfig(editing?.productId || editing?.requiredProductId))} precision={2} min={0} />
</Form.Item>
<Form.Item name="deliveryPriceYuan" label="配送价（元）" extra={shippingRequiredConfig(editing?.productId || editing?.requiredProductId)?.priceLocked ? '该说明项价格固定为 ¥0.00，不计入商品金额。' : undefined} rules={[{ required: true, type: 'number', min: 0 }]}>
<InputNumber disabled={Boolean(shippingRequiredConfig(editing?.productId || editing?.requiredProductId)?.priceLocked)} precision={2} min={0} />
</Form.Item>
<Form.Item name="sortOrder" label="展示排序" extra="数字越小越靠前。" rules={[{ required: true, type: 'number', min: 0 }, { validator: (_, value) => Number.isInteger(value) ? Promise.resolve() : Promise.reject(new Error('排序必须为整数')) }]}><InputNumber min={0} precision={0} /></Form.Item>
<Form.Item name="stockQuantity" label="库存数量" extra={shippingRequiredConfig(editing?.productId || editing?.requiredProductId) ? '配送必拍商品由系统保持充足库存，不需要手动修改。' : undefined} rules={[{ required: true, type: 'number', min: 0 }, { validator: (_, value) => Number.isInteger(value) ? Promise.resolve() : Promise.reject(new Error('库存必须为整数')) }]}>
<InputNumber disabled={Boolean(shippingRequiredConfig(editing?.productId || editing?.requiredProductId))} min={0} precision={0} />
</Form.Item>{shippingRequiredConfig(editing?.productId || editing?.requiredProductId) ? <Alert type="success" showIcon message="固定规格：标准规格（specId=standard），规格加价 ¥0.00" style={{ marginBottom: 16 }} /> : <ProductSpecsEditor />}<ProductDisplayPreview />{!shippingRequiredConfig(editing?.productId || editing?.requiredProductId) && <><Form.Item name="pickupListed" label="到店自取上架" valuePropName="checked" extra="关闭后，商品不会出现在自取列表、详情或快捷加购中。">
<Switch checkedChildren="已上架" unCheckedChildren="已下架" />
</Form.Item><Form.Item name="deliveryListed" label="外卖/邮寄上架" valuePropName="checked" extra="当前同时控制同城外卖与快递邮寄；底层仍分别保留两种配送能力字段。">
<Switch checkedChildren="已上架" unCheckedChildren="已下架" />
</Form.Item></>}
</Form>
</Modal>
</Card></> }
function StoresPage() { const [rows, setRows] = useState<any[]>([]); const [error, setError] = useState<any>(); const [editing, setEditing] = useState<any>(); const [form] = Form.useForm(); const load = () => adminApi.listStores().then((data: any) => setRows(data.stores)).catch(setError); useEffect(() => { load() }, []); const openCreate = () => { setEditing({ isNew: true }); form.resetFields(); form.setFieldsValue({ enabled: true }) }; const save = () => form.validateFields().then((values) => { const request = editing.isNew ? adminApi.createStore(values.storeId, values) : adminApi.saveStore(editing.storeId, values); return request.then(() => { setEditing(undefined); load() }).catch(setError) }); return <Card title="门店管理" extra={<Button type="primary" onClick={openCreate}>新增门店</Button>}>{error && <ErrorBox error={error} />}<Table rowKey="storeId" dataSource={rows} locale={{ emptyText: <Empty description="暂无门店" /> }} columns={[{ title: '门店', dataIndex: 'name' }, { title: '地址', dataIndex: 'addressText' }, { title: '营业时间', dataIndex: 'businessHours' }, { title: '状态', render: (_: unknown, r: any) => <Tag color={r.status === 'open' ? 'green' : 'default'}>{r.status === 'open' ? '营业中' : '已打烊'}</Tag> }, { title: '操作', render: (_: unknown, r: any) => <Space>
<Button onClick={() => adminApi.toggleStoreOpen(r.storeId, r.status !== 'open').then(load).catch(setError)}>{r.status === 'open' ? '暂停营业' : '恢复营业'}</Button>
<Button onClick={() => { setEditing(r); form.setFieldsValue(r) }}>编辑</Button>
<Button danger onClick={() => Modal.confirm({ title: `删除“${r.name}”？`, content: '不会影响已有订单中的门店快照；用户端将不再显示该门店。', okText: '删除', okButtonProps: { danger: true }, onOk: () => adminApi.deleteStore(r.storeId).then(load).catch(setError) })}>删除</Button>
</Space> }]} />
<Modal title={editing?.isNew ? '新增门店' : '编辑门店'} open={Boolean(editing)} onCancel={() => setEditing(undefined)} onOk={save}>
<Form form={form} layout="vertical">{editing?.isNew && <Form.Item name="storeId" label="门店标识" extra="仅支持字母、数字、下划线和短横线；创建后不可修改。" rules={[{ required: true }, { pattern: /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/, message: '门店标识格式不正确' }]}>
<Input />
</Form.Item>}<Form.Item name="name" label="名称" rules={[{ required: true }]}>
<Input />
</Form.Item>
<Form.Item name="addressText" label="地址">
<Input />
</Form.Item>
<Form.Item name="businessHours" label="营业时间" rules={[{ max: 100 }]}>
<Input placeholder="如 08:00-21:00" />
</Form.Item>
<Form.Item name="enabled" label="启用" valuePropName="checked">
<Switch />
</Form.Item>
</Form>
</Modal>
</Card> }
const auditActionLabel: Record<string, string> = { 'orders.advance': '推进订单状态', 'orders.cancel': '商家撤销未支付订单', 'refunds.create': '撤销订单并申请退款', 'refunds.retry': '重试退款', 'products.create': '新增商品', 'products.write': '编辑商品', 'products.bulkListing.write': '批量上下架当前筛选', 'products.homeRecommendations.write': '设置首页今日推荐', 'products.delete': '删除商品', 'products.toggleSoldOut': '切换商品售罄', 'productCategories.create': '新增商品分类', 'productCategories.write': '编辑商品分类', 'productCategories.delete': '删除商品分类', 'stores.create': '新增门店', 'stores.write': '编辑门店', 'stores.delete': '删除门店', 'stores.toggleOpen': '切换门店营业状态' }
const auditTargetLabel: Record<string, string> = { order: '订单', product: '商品', productFilter: '商品筛选结果', homeRecommendations: '首页推荐', productCategory: '商品分类', store: '门店' }
function AuditPage() { const [rows, setRows] = useState<any[]>([]); const [meta, setMeta] = useState<any>({ total: 0, page: 1, pageSize: 20 }); const [filters, setFilters] = useState<any>({}); const [error, setError] = useState<any>(); const [selected, setSelected] = useState<any>(); const load = (next = {}) => adminApi.listAuditLogs({ ...filters, ...next }).then((data: any) => { setRows(data.auditLogs); setMeta(data) }).catch(setError); useEffect(() => { load() }, [filters]); return <Card title="审计日志">
<Alert type="info" showIcon message="记录后台的每次管理操作" description="这里会保存订单状态推进、商品新增/编辑/删除/售罄切换，以及门店资料和营业状态的变更。每条记录包含操作者、对象、变更前后内容和时间；它只用于追溯管理操作，不记录顾客的完整地址或手机号。" style={{ marginBottom: 16 }} />
<Form layout="inline" onFinish={(values) => setFilters({ ...values, auditStartDate: values.auditStartDate?.format('YYYY-MM-DD'), auditEndDate: values.auditEndDate?.format('YYYY-MM-DD'), page: 1 })}>
<Form.Item name="auditAction">
<Select allowClear placeholder="操作类型" style={{ width: 160 }} options={Object.entries(auditActionLabel).map(([value, label]) => ({ value, label }))} />
</Form.Item>
<Form.Item name="targetType">
<Select allowClear placeholder="对象类型" style={{ width: 120 }} options={Object.entries(auditTargetLabel).map(([value, label]) => ({ value, label }))} />
</Form.Item>
<Form.Item name="actorId">
<Input placeholder="操作者" />
</Form.Item>
<Form.Item name="auditStartDate">
<DatePicker placeholder="开始日期" format="YYYY-MM-DD" />
</Form.Item>
<Form.Item name="auditEndDate">
<DatePicker placeholder="结束日期" format="YYYY-MM-DD" />
</Form.Item>
<Button htmlType="submit" type="primary">筛选</Button>
</Form>{error && <ErrorBox error={error} />}<Table rowKey="id" dataSource={rows} pagination={{ current: meta.page, pageSize: meta.pageSize, total: meta.total, onChange: (page, pageSize) => load({ page, pageSize }) }} columns={[{ title: '操作', dataIndex: 'action', render: (value: string) => auditActionLabel[value] || value }, { title: '对象', render: (_: unknown, r: any) => `${auditTargetLabel[r.targetType] || r.targetType}/${r.targetId}` }, { title: '操作者', dataIndex: 'actorId' }, { title: '时间', dataIndex: 'createdAt', render: formatTime }, { title: '操作', render: (_: unknown, row: any) => <Button type="link" onClick={() => setSelected(row)}>查看变更</Button> }]} />
<Drawer title={selected ? `${auditActionLabel[selected.action] || selected.action}：变更详情` : ''} width={560} open={Boolean(selected)} onClose={() => setSelected(undefined)}>{selected && <Descriptions column={1} size="small">
<Descriptions.Item label="操作者">{selected.actorId}</Descriptions.Item>
<Descriptions.Item label="对象">{auditTargetLabel[selected.targetType] || selected.targetType}/{selected.targetId}</Descriptions.Item>
<Descriptions.Item label="时间">{formatTime(selected.createdAt)}</Descriptions.Item>
<Descriptions.Item label="变更前">
<pre>{JSON.stringify(selected.before, null, 2)}</pre>
</Descriptions.Item>
<Descriptions.Item label="变更后">
<pre>{JSON.stringify(selected.after, null, 2)}</pre>
</Descriptions.Item>
<Descriptions.Item label="备注">{selected.reason || '-'}</Descriptions.Item>
</Descriptions>}</Drawer>
</Card> }
function PageContentPage() {
  const [page, setPage] = useState<'home'|'profile'>('home'); const [form] = Form.useForm(); const [version, setVersion] = useState(0); const [loading, setLoading] = useState(false); const [error, setError] = useState<any>(); const [brandPreview, setBrandPreview] = useState(''); const inputRef = useRef<HTMLInputElement>(null)
  const defaults:any = page === 'home' ? { heroKicker:'08:00 — 21:00 / 今日现烤', heroTitle:'把刚出炉的香气，带回家。', heroCopy:'伯爵茶可颂限定回归，下午三点后售罄概率较高。', heroPill:'新品尝鲜 · 第二件立减 ¥4', noticeText:'活动公告：到店自取满 ¥49 赠法棍切片一份，赠品数量有限。' } : { brandImageUrl:'', brandKicker:'麦香小屋 · BREAD CLUB', brandTitle:'麦香朋友', brandSubtitle:'好面包，慢慢吃。', tipTitle:'今日面包小贴士', tipText:'面包室温密封保存，复烤 3 分钟风味更佳。' }
  const labels:any = { brandImageUrl:'品牌图片', brandKicker:'品牌眉题', brandTitle:'品牌名称', brandSubtitle:'品牌副标题', tipTitle:'面包小贴士标题', tipText:'面包小贴士正文', heroKicker:'首页活动眉题', heroTitle:'首页活动标题', heroCopy:'首页活动说明', heroPill:'首页活动标签', noticeText:'首页底部公告' }
  useEffect(() => { let active = true; setError(undefined); setLoading(true); adminApi.getPageConfiguration(page).then((result) => { if (!active) return; setVersion(result.version || 0); const config:any = result.config || {}; const values = page === 'profile' ? { ...defaults, brandImageUrl: config.brand?.imageUrl || '', brandKicker: config.brand?.kicker || defaults.brandKicker, brandTitle: config.brand?.title || defaults.brandTitle, brandSubtitle: config.brand?.subtitle || defaults.brandSubtitle, tipTitle: config.tip?.title || defaults.tipTitle, tipText: config.tip?.text || defaults.tipText } : { ...defaults, heroKicker: config.hero?.kicker || defaults.heroKicker, heroTitle: config.hero?.title || defaults.heroTitle, heroCopy: config.hero?.copy || defaults.heroCopy, heroPill: config.hero?.pill || defaults.heroPill, noticeText: config.notice?.text || defaults.noticeText }; form.setFieldsValue(values); if (values.brandImageUrl) resolveCloudFileURLs([values.brandImageUrl]).then((urls) => active && setBrandPreview(urls[values.brandImageUrl] || '')).catch(() => {}); else setBrandPreview('') }).catch(setError).finally(() => active && setLoading(false)); return () => { active = false } }, [page])
  const uploadBrand = async (file?: File) => { if (!file) return; setLoading(true); try { const prepared = await prepareProductImage(file); const result = await adminApi.uploadPageContentImage('profile', prepared); form.setFieldValue('brandImageUrl', result.fileID); setBrandPreview(prepared.previewUrl) } catch (reason) { setError(reason) } finally { setLoading(false); if (inputRef.current) inputRef.current.value = '' } }
  const save = async (values:any) => { setLoading(true); setError(undefined); try { const config = page === 'profile' ? { brand: { visible: true, imageUrl: values.brandImageUrl || '', kicker: values.brandKicker, title: values.brandTitle, subtitle: values.brandSubtitle }, tip: { visible: true, title: values.tipTitle, text: values.tipText } } : { hero: { visible: true, kicker: values.heroKicker, title: values.heroTitle, copy: values.heroCopy, pill: values.heroPill }, notice: { visible: true, text: values.noticeText } }; const result = await adminApi.savePageConfiguration(page, version, config as any); setVersion(result.version); window.alert('已保存到 CloudBase') } catch (reason) { setError(reason) } finally { setLoading(false) } }
  return <Card title="小程序页面内容" extra={<Tabs activeKey={page} onChange={(v)=>setPage(v as any)} items={[{key:'home',label:'首页'},{key:'profile',label:'个人页'}]} />}><Alert type="info" showIcon message="仅可修改标注区域的文字与图片；订单状态、跳转和布局位置由系统控制。配置直接保存到 CloudBase。" style={{marginBottom:16}} />{error && <ErrorBox error={error} />}<Form form={form} layout="vertical" onFinish={save}>{Object.keys(defaults).filter((key) => key !== 'brandImageUrl').map((key)=><Form.Item key={key} name={key} label={labels[key] || key}><Input.TextArea autoSize={{minRows:1,maxRows:3}} /></Form.Item>)}{page === 'profile' && <><Form.Item name="brandImageUrl" hidden><Input /></Form.Item><Form.Item label="品牌图片"><Space><Button onClick={() => inputRef.current?.click()} loading={loading}>上传品牌图片</Button>{brandPreview && <img src={brandPreview} alt="品牌图片预览" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 12 }} />}</Space><Typography.Paragraph type="secondary">支持 JPEG、PNG、WebP；上传后会自动压缩为符合小程序要求的 JPEG 并保存到 CloudBase。</Typography.Paragraph></Form.Item><input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadBrand(event.target.files?.[0])} /></>}<div style={{marginTop:16}}><Button type="primary" htmlType="submit" loading={loading}>保存配置</Button></div></Form></Card>
}
function NotFound() { return <Result status="404" title="页面不存在" extra={<Button type="primary" href="/">返回首页</Button>} /> }
export default function App() { return <ConfigProvider theme={{ token: { colorPrimary: '#d96f78', colorInfo: '#d96f78', colorSuccess: '#4f8b78', colorText: '#284b4a', colorTextSecondary: '#6f8583', colorBgLayout: '#d3e8f4', colorBgContainer: '#fffdf6', colorBorderSecondary: '#d8e7ea', borderRadius: 12, borderRadiusLG: 16, controlHeight: 38, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif' }, components: { Layout: { headerBg: '#fffdf6', siderBg: '#fffdf6' }, Menu: { itemSelectedBg: '#ffe0e6', itemSelectedColor: '#a94e5c', itemBorderRadius: 10 }, Button: { primaryShadow: 'none' }, Table: { headerBg: '#edf6f8', headerColor: '#355a59' } } }}><AntApp>
<BrowserRouter>
<AuthProvider>
<Routes>
<Route path="/login" element={<LoginPage />} />
<Route element={<ProtectedLayout />}>
<Route path="/" element={<Guard permission="orders.read">
<DashboardPage />
</Guard>} />
<Route path="/orders" element={<Guard permission="orders.read">
<OrdersPage />
</Guard>} />
<Route path="/products" element={<Guard permission="products.read">
<ProductsPage />
</Guard>} />
<Route path="/stores" element={<Guard permission="stores.read">
<StoresPage />
</Guard>} />
<Route path="/page-content" element={<Guard permission="products.read"><PageContentPage /></Guard>} />
<Route path="/audit-logs" element={<Guard permission="auditLogs.read">
<AuditPage />
</Guard>} />
<Route path="*" element={<NotFound />} />
</Route>
<Route path="*" element={<Navigate to="/" replace />} />
</Routes>
</AuthProvider>
</BrowserRouter>
</AntApp></ConfigProvider> }
