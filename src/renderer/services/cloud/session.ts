/**
 * 云端登录态管理
 *
 * 职责：token 的保存 / 读取 / 清除 / 过期检测
 * 存储：localStorage（预留 secureStorage 接口，后续可换 Electron safeStorage / Keychain）
 *
 * 安全规则：
 *   ❌ 不存阿里云 AccessKey
 *   ❌ 不存用户密码
 *   ✅ 只存后端签发的 access_token / refresh_token
 */

const KEYS = {
  ACCESS_TOKEN: 'xh_cloud_access_token',
  REFRESH_TOKEN: 'xh_cloud_refresh_token',
  TOKEN_EXPIRES_AT: 'xh_cloud_token_expires_at', // Unix ms
  USER_INFO: 'xh_cloud_user_info',
  CLOUD_CONTEXT: 'xh_cloud_context'
} as const

export const CLOUD_AUTH_CHANGE_EVENT = 'cloud-auth-change'

function emitAuthChange(): void {
  try {
    window.dispatchEvent(new CustomEvent(CLOUD_AUTH_CHANGE_EVENT))
  } catch {}
}

// ═══════════════════════════════════
//  Storage Adapter（预留安全存储接口）
// ═══════════════════════════════════

interface ISecureStorage {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

/** 默认实现：localStorage */
const localStorageAdapter: ISecureStorage = {
  get: (key) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value)
    } catch (e) {
      console.error('[session] 写入存储失败:', e)
    }
  },
  remove: (key) => {
    try {
      localStorage.removeItem(key)
    } catch {}
  }
}

// 当前使用的存储实现（后续可替换为 Electron safeStorage）
let storage: ISecureStorage = localStorageAdapter

/**
 * 替换底层存储实现（预留给 Electron 安全存储）
 */
export function setStorageAdapter(adapter: ISecureStorage): void {
  storage = adapter
}

// ═══════════════════════════════════
//  Token 操作
// ═══════════════════════════════════

export interface SessionTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number // Unix ms
}

/**
 * 保存登录令牌
 */
export function saveTokens(accessToken: string, refreshToken: string, expiresInSec: number): void {
  const expiresAt = Date.now() + expiresInSec * 1000
  storage.set(KEYS.ACCESS_TOKEN, accessToken)
  storage.set(KEYS.REFRESH_TOKEN, refreshToken)
  storage.set(KEYS.TOKEN_EXPIRES_AT, String(expiresAt))
  emitAuthChange()
}

/**
 * 读取当前令牌
 */
export function getTokens(): SessionTokens | null {
  const accessToken = storage.get(KEYS.ACCESS_TOKEN)
  const refreshToken = storage.get(KEYS.REFRESH_TOKEN)
  const expiresAtStr = storage.get(KEYS.TOKEN_EXPIRES_AT)

  if (!accessToken || !refreshToken) return null

  return {
    accessToken,
    refreshToken,
    expiresAt: expiresAtStr ? Number(expiresAtStr) : 0
  }
}

/**
 * 获取 access_token（未过期时直接返回，过期返回 null）
 */
export function getAccessToken(): string | null {
  const tokens = getTokens()
  if (!tokens) return null
  // 提前 60 秒视为过期，留出刷新窗口
  if (Date.now() > tokens.expiresAt - 60_000) return null
  return tokens.accessToken
}

/**
 * 获取 refresh_token
 */
export function getRefreshToken(): string | null {
  return storage.get(KEYS.REFRESH_TOKEN)
}

/**
 * access_token 是否已过期（或即将过期）
 */
export function isTokenExpired(): boolean {
  const expiresAtStr = storage.get(KEYS.TOKEN_EXPIRES_AT)
  if (!expiresAtStr) return true
  return Date.now() > Number(expiresAtStr) - 60_000
}

/**
 * 是否已登录（有 token 存在，不管过期与否——过期可刷新）
 */
export function isLoggedIn(): boolean {
  return !!storage.get(KEYS.ACCESS_TOKEN) && !!storage.get(KEYS.REFRESH_TOKEN)
}

// ═══════════════════════════════════
//  用户信息缓存
// ═══════════════════════════════════

export interface CachedUser {
  id: number
  nickname: string
  phone: string | null
  email: string | null
  avatar_url: string | null
  role?: string | null
  department?: string | null
}

export interface CachedCloudContext {
  userId: number
  teamId: number | null
  orgId: number | null
  role: string | null
  teamName?: string | null
  orgName?: string | null
  updatedAt: string
}

export function saveUserInfo(user: CachedUser): void {
  storage.set(KEYS.USER_INFO, JSON.stringify(user))
  emitAuthChange()
}

export function getUserInfo(): CachedUser | null {
  const raw = storage.get(KEYS.USER_INFO)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveCloudContext(context: Omit<CachedCloudContext, 'updatedAt'>): void {
  storage.set(KEYS.CLOUD_CONTEXT, JSON.stringify({
    ...context,
    updatedAt: new Date().toISOString()
  }))
  emitAuthChange()
}

export function getCloudContext(): CachedCloudContext | null {
  const raw = storage.get(KEYS.CLOUD_CONTEXT)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// ═══════════════════════════════════
//  登出
// ═══════════════════════════════════

/**
 * 清除所有登录态
 */
export function clearSession(): void {
  storage.remove(KEYS.ACCESS_TOKEN)
  storage.remove(KEYS.REFRESH_TOKEN)
  storage.remove(KEYS.TOKEN_EXPIRES_AT)
  storage.remove(KEYS.USER_INFO)
  storage.remove(KEYS.CLOUD_CONTEXT)
  emitAuthChange()
}
