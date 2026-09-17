import { callFunction } from './cloudbase'

const STORAGE_KEY = 'breadshop.merchant.session'

export type MerchantSession = {
  token: string
  expiresAt: number
  merchantUserId: string
  roleId: string
  permissions: string[]
}

type SessionResponse = Omit<MerchantSession, 'token'> & { token: string }

function assertSession(value: unknown): asserts value is MerchantSession {
  const item = value as Partial<MerchantSession> | null
  if (!item || typeof item.token !== 'string' || !item.token || typeof item.expiresAt !== 'number' || !Number.isInteger(item.expiresAt) || item.expiresAt <= Math.floor(Date.now() / 1000) || typeof item.merchantUserId !== 'string' || typeof item.roleId !== 'string' || !Array.isArray(item.permissions) || item.permissions.some((permission) => typeof permission !== 'string')) {
    throw new Error('商家会话响应无效')
  }
}

export function readSession(): MerchantSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as MerchantSession
    if (!value.token || !value.expiresAt || value.expiresAt <= Math.floor(Date.now() / 1000)) {
      sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return value
  } catch {
    sessionStorage.removeItem(STORAGE_KEY)
    return null
  }
}

function writeSession(session: MerchantSession) {
  assertSession(session)
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  return session
}

export async function login(account: string, password: string): Promise<MerchantSession> {
  const result = await callFunction<SessionResponse>('merchant-auth', { action: 'login', account, password })
  assertSession(result)
  return writeSession(result)
}

export async function verifySession(session: MerchantSession): Promise<MerchantSession> {
  const result = await callFunction<Omit<MerchantSession, 'token'>>('merchant-auth', { action: 'verifySession', token: session.token })
  const next = { ...session, ...result }
  assertSession(next)
  return writeSession(next)
}

export async function logout(session: MerchantSession | null) {
  try {
    if (session?.token) await callFunction<{ loggedOut: boolean }>('merchant-auth', { action: 'logout', token: session.token })
  } finally {
    sessionStorage.removeItem(STORAGE_KEY)
  }
}
