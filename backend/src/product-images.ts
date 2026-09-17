export const PRODUCT_IMAGE_RULES = {
  acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'],
  sourceMaxBytes: 10 * 1024 * 1024,
  outputMaxBytes: 1024 * 1024,
  minSide: 600,
  maxSourceSide: 6000,
  maxOutputSide: 1600,
  minAspectRatio: 0.6,
  maxAspectRatio: 1.8,
  maxCount: 5
} as const

export function validateImageSource(file: Pick<File, 'type' | 'size'>) {
  if (!PRODUCT_IMAGE_RULES.acceptedTypes.includes(file.type as any)) throw new Error('仅支持 JPEG、PNG 或 WebP 图片')
  if (file.size <= 0 || file.size > PRODUCT_IMAGE_RULES.sourceMaxBytes) throw new Error('原图大小需在 10MB 以内')
}

export function validateImageDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < PRODUCT_IMAGE_RULES.minSide || height < PRODUCT_IMAGE_RULES.minSide) throw new Error('图片宽高均不能小于 600px')
  if (width > PRODUCT_IMAGE_RULES.maxSourceSide || height > PRODUCT_IMAGE_RULES.maxSourceSide) throw new Error('图片单边不能超过 6000px')
  const ratio = width / height
  if (ratio < PRODUCT_IMAGE_RULES.minAspectRatio || ratio > PRODUCT_IMAGE_RULES.maxAspectRatio) throw new Error('图片宽高比需在 3:5 至 9:5 之间')
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片无法解码，请重新导出后上传')) }
    image.src = url
  })
}

function toBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('图片压缩失败')), 'image/jpeg', quality))
}

export async function prepareProductImage(file: File) {
  validateImageSource(file)
  const image = await loadImage(file); validateImageDimensions(image.naturalWidth, image.naturalHeight)
  const scale = Math.min(1, PRODUCT_IMAGE_RULES.maxOutputSide / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.round(image.naturalWidth * scale), height = Math.round(image.naturalHeight * scale)
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const context = canvas.getContext('2d'); if (!context) throw new Error('当前浏览器不支持图片处理')
  context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); context.drawImage(image, 0, 0, width, height)
  let blob: Blob | null = null
  for (const quality of [0.9, 0.82, 0.74, 0.66, 0.58]) { blob = await toBlob(canvas, quality); if (blob.size <= PRODUCT_IMAGE_RULES.outputMaxBytes) break }
  if (!blob || blob.size > PRODUCT_IMAGE_RULES.outputMaxBytes) throw new Error('压缩后仍超过 1MB，请选择细节更少的图片')
  const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(blob!) })
  return { dataUrl, width, height, size: blob.size, previewUrl: URL.createObjectURL(blob) }
}
