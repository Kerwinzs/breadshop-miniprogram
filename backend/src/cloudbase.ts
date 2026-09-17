import cloudbase from '@cloudbase/js-sdk'

const envId = import.meta.env.VITE_CLOUDBASE_ENV_ID || ''
const accessKey = import.meta.env.VITE_CLOUDBASE_ACCESS_KEY || ''
export const cloudApp = envId && accessKey ? cloudbase.init({ env: envId, region: 'ap-shanghai', accessKey }) : null

let anonymousSession: Promise<void> | null = null

export async function ensureAnonymousSession(): Promise<void> {
  if (!cloudApp) throw new Error('未配置 CloudBase 环境或 Publishable Key')
  if (!anonymousSession) {
    anonymousSession = (async () => {
      const auth = cloudApp.auth()
      const current = await auth.getSession()
      if (current.data?.session) return
      const result = await auth.signInAnonymously()
      if (result.error || !result.data?.session) {
        throw new Error(result.error?.message || '无法建立 CloudBase 匿名身份')
      }
    })().catch((error) => {
      anonymousSession = null
      throw error
    })
  }
  return anonymousSession
}

export async function callFunction<T>(name: string, data: Record<string, unknown>): Promise<T> {
  await ensureAnonymousSession()
  const app = cloudApp
  if (!app) throw new Error('未配置 CloudBase 环境或 Publishable Key')
  const result = await app.callFunction({ name, data })
  const payload = result && result.result as { ok?: boolean; data?: T; error?: { code?: string; message?: string } } | undefined
  if (!payload || payload.ok !== true) {
    const error = new Error(payload?.error?.message || '云端请求失败') as Error & { code?: string }
    error.code = payload?.error?.code
    throw error
  }
  return payload.data as T
}

export async function resolveCloudFileURLs(fileIDs: string[]) {
  await ensureAnonymousSession()
  if (!cloudApp || !fileIDs.length) return {}
  const result = await cloudApp.getTempFileURL({ fileList: fileIDs })
  return (result.fileList || []).reduce<Record<string, string>>((urls, item) => {
    if (item.fileID && item.tempFileURL) urls[item.fileID] = item.tempFileURL
    return urls
  }, {})
}
