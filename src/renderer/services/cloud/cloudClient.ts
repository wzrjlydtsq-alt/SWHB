/**
 * 浜戠 API Client
 *
 * 鑱岃矗锛? *   - 缁熶竴 baseUrl銆丅earer Token 娉ㄥ叆
 *   - 缁熶竴閿欒澶勭悊涓庡搷搴旇В鍖? *   - 鑷姩 token 鍒锋柊锛坅ccess_token 杩囨湡 鈫?鐢?refresh_token 鎹㈡柊锛? *   - 灏佽 auth / users / teams / assets 鍥涘ぇ妯″潡鏂规硶
 *
 * 瀹夊叏瑙勫垯锛? *   鉂?涓嶅湪姝ゆ枃浠朵腑鍐欏叆浠讳綍鐪熷疄瀵嗛挜
 *   鉂?涓嶇洿鎺ヨ闂樋閲屼簯 OSS / STS
 *   鉁?鍙笌鎴戜滑鑷繁鐨勫悗绔?API 閫氫俊
 */
import type {
  ApiResponse,
  PagedResult,
  SendCodeRequest,
  SendCodeResponse,
  LoginRequest,
  LoginResponse,
  PlatformLoginRequest,
  RefreshResponse,
  CloudUser,
  UpdateUserRequest,
  AvatarUploadUrlResponse,
  CloudTeam,
  CloudOrganization,
  CreateTeamRequest,
  CreateOrganizationRequest,
  JoinOrganizationRequest,
  CreateOrgTeamRequest,
  CloudJoinRequest,
  ReviewJoinRequestBody,
  TeamMember,
  UpdateMemberRoleRequest,
  JoinTeamRequest,
  CloudAsset,
  UploadUrlRequest,
  UploadUrlResponse,
  CreateAssetRequest,
  AssetListParams,
  DownloadUrlResponse,
  CreateTransferRequest,
  CloudTransfer,
  CloudNotification
} from './types'

import {
  getAccessToken,
  getRefreshToken,
  saveTokens,
  saveUserInfo,
  clearSession,
  isTokenExpired
} from './session'

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?//  閰嶇疆
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
const viteEnv = (import.meta as any).env || {}
const envBaseUrl = viteEnv.VITE_CLOUD_API_BASE_URL || viteEnv.VITE_API_BASE_URL
let _baseUrl = (envBaseUrl || 'http://47.109.138.168/api/v1').replace(/\/+$/, '')

/**
 * 璁剧疆鍚庣 API 鍩虹鍦板潃
 * 寮€鍙戞湡鎸囧悜鏈湴锛岄儴缃插悗鎸囧悜 https://api.yourdomain.com/api/v1
 */
export function setBaseUrl(url: string): void {
  _baseUrl = url.replace(/\/+$/, '')
}

export function getBaseUrl(): string {
  return _baseUrl
}

function getEnterpriseNameCandidates(name: string): string[] {
  const normalized = name.trim().replace(/\s+/g, '')
  const candidates = new Set<string>()
  if (normalized) candidates.add(normalized)

  const variants = new Set<string>([normalized])
  for (const value of Array.from(variants)) {
    if (value.includes('鍔ㄦ极')) variants.add(value.replace(/鍔ㄦ极/g, '鍔ㄧ敾'))
    if (value.includes('鍔ㄧ敾')) variants.add(value.replace(/鍔ㄧ敾/g, '鍔ㄦ极'))
  }

  for (const value of Array.from(variants)) {
    candidates.add(value)
    if (value.includes('鐏靛鏄熸渤') && !value.startsWith('鎴愰兘')) {
      candidates.add(`鎴愰兘${value}`)
    }
  }

  return Array.from(candidates)
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?//  搴曞眰 request
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
export class CloudApiError extends Error {
  code: number
  status: number

  constructor(message: string, code: number, status: number) {
    super(message)
    this.name = 'CloudApiError'
    this.code = code
    this.status = status
  }
}

type CloudProxyResponse = {
  success?: boolean
  status: number
  statusText?: string
  headers?: Record<string, string>
  body?: string
  error?: string
}

function toHeaderByteString(value: unknown): string {
  return String(value ?? '')
    .replace(/[^\x09\x20-\x7e\x80-\xff]/g, '')
    .replace(/[\r\n]/g, ' ')
}

function sanitizeHeaders(headers?: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers || {})) {
    const safeKey = String(key || '')
      .replace(/[^!#$%&'*+\-.^_`|~0-9A-Za-z]/g, '')
      .toLowerCase()
    if (safeKey) sanitized[safeKey] = toHeaderByteString(value)
  }
  return sanitized
}

async function fetchCloudApi(url: string, init: RequestInit): Promise<Response> {
  const cloudRequest = (window as any).api?.cloudRequest
  if (typeof cloudRequest === 'function') {
    const proxied = await cloudRequest({
      url,
      method: init.method || 'GET',
      headers: init.headers || {},
      body: typeof init.body === 'string' ? init.body : undefined
    }) as CloudProxyResponse

    if (proxied?.success === false) {
      throw new CloudApiError(proxied.error || '浜戠璇锋眰澶辫触', 50000, 0)
    }

    if (typeof proxied?.status === 'number') {
      return new Response(proxied.body || '', {
        status: proxied.status,
        statusText: proxied.statusText || '',
        headers: sanitizeHeaders(proxied.headers)
      })
    }
  }

  return fetch(url, init)
}

/**
 * 缁熶竴璇锋眰鏂规硶
 * @internal 瀛愭ā鍧?writingClient 绛夊彲澶嶇敤姝ゆ柟娉? */
export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: { skipAuth?: boolean; params?: Record<string, string | number | undefined> } = {}
): Promise<T> {
  const url = new URL(`${_baseUrl}${path}`)

  // 鏌ヨ鍙傛暟
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v))
      }
    }
  }

  const headers: Record<string, string> = {}
  if (body) headers['Content-Type'] = 'application/json'

  // Bearer Token
  if (!options.skipAuth) {
    let token = getAccessToken()

    // 鑷姩鍒锋柊
    if (!token && isTokenExpired()) {
      const refreshed = await _tryRefresh()
      if (refreshed) {
        token = getAccessToken()
      } else {
        clearSession()
        throw new CloudApiError('登录已过期，请重新登录', 40101, 401)
      }
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
  }

  const res = await fetchCloudApi(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })

  // 澶勭悊闈?JSON 鍝嶅簲
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    if (!res.ok) {
      throw new CloudApiError(`HTTP ${res.status}`, 50000, res.status)
    }
    return null as T
  }

  const json: ApiResponse<T> = await res.json()

  if (json.code !== 0) {
    const detail = typeof (json as any).detail === 'string' ? (json as any).detail : ''
    throw new CloudApiError(json.message || detail || '请求失败', json.code || res.status, res.status)
  }

  return json.data
}

/**
 * 灏濊瘯鐢?refresh_token 鎹㈡柊 access_token
 */
async function _tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false

  try {
    const data = await request<RefreshResponse>(
      'POST',
      '/auth/refresh',
      { refresh_token: refreshToken },
      { skipAuth: true }
    )
    saveTokens(data.access_token, data.refresh_token, data.expires_in)
    return true
  } catch {
    return false
  }
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?//  auth 妯″潡
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
export const authApi = {
  /** 鍙戦€侀獙璇佺爜 */
  sendCode(req: SendCodeRequest) {
    return request<SendCodeResponse>('POST', '/auth/send-code', req, { skipAuth: true })
  },

  /** Login with verification code. */
  async login(req: LoginRequest) {
    const data = await request<LoginResponse>('POST', '/auth/login', req, { skipAuth: true })
    saveTokens(data.access_token, data.refresh_token, data.expires_in)
    saveUserInfo(data.user)
    return data
  },

  async platformLogin(req: PlatformLoginRequest) {
    const data = await request<LoginResponse>('POST', '/auth/platform-login', req, { skipAuth: true })
    saveTokens(data.access_token, data.refresh_token, data.expires_in)
    saveUserInfo(data.user)
    return data
  },

  /** 鐧诲嚭 */
  async logout() {
    const refreshToken = getRefreshToken()
    if (refreshToken) {
      try {
        await request('POST', '/auth/logout', { refresh_token: refreshToken })
      } catch {
        // Logout failures are non-blocking; local session is cleared below.
      }
    }
    clearSession()
  },

  /** 鍒锋柊 token */
  async refresh() {
    const ok = await _tryRefresh()
    if (!ok) {
      clearSession()
      throw new CloudApiError('鍒锋柊澶辫触', 40101, 401)
    }
  },

  /** 鏌ヨ浼佷笟鏄惁瀛樺湪 */
  async checkEnterprise(name: string) {
    const candidates = getEnterpriseNameCandidates(name)
    let lastResult: { exists: boolean; enterprise_id?: number; display_name?: string } = { exists: false }

    for (const candidate of candidates) {
      const result = await request<{ exists: boolean; enterprise_id?: number; display_name?: string }>(
        'GET',
        '/auth/enterprise/check',
        undefined,
        { skipAuth: true, params: { name: candidate } }
      )
      if (result.exists) return result
      lastResult = result
    }

    return lastResult
  },

  /** 浼佷笟璐﹀彿鐧诲綍 */
  async enterpriseLogin(req: { enterprise_id: number; username: string; password: string }) {
    const data = await request<LoginResponse>('POST', '/auth/enterprise-login', req, { skipAuth: true })
    saveTokens(data.access_token, data.refresh_token, data.expires_in)
    saveUserInfo(data.user)
    return data
  }
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?//  users 妯″潡
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
export const usersApi = {
  /** 鑾峰彇褰撳墠鐢ㄦ埛淇℃伅 */
  getMe() {
    return request<CloudUser>('GET', '/users/me')
  },

  /** 鏇存柊涓汉淇℃伅锛堟樀绉?+ 澶村儚锛?*/
  updateMe(data: UpdateUserRequest) {
    return request<CloudUser>('PATCH', '/users/me', data)
  },

  /** 鑾峰彇澶村儚涓婁紶绛惧悕 URL */
  getAvatarUploadUrl() {
    return request<AvatarUploadUrlResponse>('GET', '/users/me/avatar-upload-url')
  }
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?//  teams 妯″潡
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
export const teamsApi = {
  /** 鍒涘缓鍥㈤槦 */
  create(data: CreateTeamRequest) {
    return request<CloudTeam>('POST', '/teams', data)
  },

  /** 鎴戠殑鍥㈤槦鍒楄〃 */
  list() {
    return request<CloudTeam[]>('GET', '/teams')
  },

  /** 閫氳繃閭€璇风爜鍔犲叆鍥㈤槦 */
  join(data: JoinTeamRequest) {
    return request<CloudTeam>('POST', '/teams/join', data)
  },

  /** 鍥㈤槦鎴愬憳鍒楄〃 */
  getMembers(teamId: number) {
    return request<TeamMember[]>('GET', `/teams/${teamId}/members`)
  },

  updatePresence(teamId: number, state: 'online' | 'idle' = 'online') {
    return request<{ team_id: number; user_id: number; state: string }>(
      'POST',
      `/teams/${teamId}/presence`,
      { state }
    )
  },

  /** 淇敼鎴愬憳瑙掕壊 */
  updateMemberRole(teamId: number, userId: number, data: UpdateMemberRoleRequest) {
    return request<void>('PATCH', `/teams/${teamId}/members/${userId}`, data)
  },

  /** 绉婚櫎鎴愬憳 */
  removeMember(teamId: number, userId: number) {
    return request<void>('DELETE', `/teams/${teamId}/members/${userId}`)
  },

  archive(teamId: number) {
    return request<{ id: number; status: string }>('PATCH', `/teams/${teamId}/archive`)
  },

  delete(teamId: number) {
    return request<{ id: number; status: string }>('DELETE', `/teams/${teamId}`)
  }
}

export const teamCanvasApi = {
  getMemberSnapshot(teamId: number, userId: number) {
    return request<{
      user_id: number
      team_id: number
      project_id?: string | number | null
      project_name?: string | null
      updated_at?: string | null
      snapshot_url?: string | null
      canvas?: unknown
    }>('GET', `/teams/${teamId}/members/${userId}/canvas-snapshot`)
  }
}

export const organizationsApi = {
  create(data: CreateOrganizationRequest) {
    return request<CloudOrganization>('POST', '/organizations', data)
  },

  list() {
    return request<CloudOrganization[]>('GET', '/organizations')
  },

  join(data: JoinOrganizationRequest) {
    return request<{ id?: number; organization_id?: number; organization_name?: string; status?: string; role?: string }>(
      'POST',
      '/organizations/join',
      data
    )
  },

  createTeam(orgId: number, data: CreateOrgTeamRequest) {
    return request<CloudTeam>('POST', `/organizations/${orgId}/teams`, data)
  },

  listTeams(orgId: number) {
    return request<CloudTeam[]>('GET', `/organizations/${orgId}/teams`)
  },

  archive(orgId: number) {
    return request<{ id: number; status: string }>('PATCH', `/organizations/${orgId}/archive`)
  },

  delete(orgId: number) {
    return request<{ id: number; status: string }>('DELETE', `/organizations/${orgId}`)
  }
}

export const joinRequestsApi = {
  list(params: { scope_type: 'organization' | 'team'; scope_id: number }) {
    return request<CloudJoinRequest[]>('GET', '/join-requests', undefined, {
      params: params as Record<string, string | number | undefined>
    })
  },

  review(requestId: number, data: ReviewJoinRequestBody) {
    return request<{ id: number; status: string }>('POST', `/join-requests/${requestId}/review`, data)
  },

  requestTeamJoin(teamId: number, message?: string) {
    return request<{ id: number; status: string; reused?: boolean }>(
      'POST',
      `/teams/${teamId}/join-requests`,
      message ? { message } : {}
    )
  }
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?//  assets 妯″潡
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
export const assetsApi = {
  /** 鑾峰彇涓婁紶鍑瘉 */
  getUploadUrl(teamId: number, data: UploadUrlRequest) {
    return request<UploadUrlResponse>('POST', `/teams/${teamId}/assets/upload-url`, data)
  },

  /** 鍒涘缓绱犳潗璁板綍锛堜笂浼犲畬鎴愬悗璋冪敤锛?*/
  create(teamId: number, data: CreateAssetRequest) {
    return request<CloudAsset>('POST', `/teams/${teamId}/assets`, data)
  },

  /** 绱犳潗鍒楄〃 */
  list(teamId: number, params?: AssetListParams) {
    return request<PagedResult<CloudAsset>>('GET', `/teams/${teamId}/assets`, undefined, {
      params: params as Record<string, string | number | undefined>
    })
  },

  /** 绱犳潗璇︽儏 */
  getDetail(teamId: number, assetId: number) {
    return request<CloudAsset>('GET', `/teams/${teamId}/assets/${assetId}`)
  },

  /** 鑾峰彇涓嬭浇閾炬帴 */
  getDownloadUrl(teamId: number, assetId: number) {
    return request<DownloadUrlResponse>('GET', `/teams/${teamId}/assets/${assetId}/download-url`)
  },

  /** 鍒犻櫎绱犳潗 */
  delete(teamId: number, assetId: number) {
    return request<void>('DELETE', `/teams/${teamId}/assets/${assetId}`)
  }
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?//  transfers 妯″潡
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
export const favoritesApi = {
  listFolders() {
    return request<any[]>('GET', '/favorites/folders')
  },

  createFolder(data: { name: string; parent_id?: number | null }) {
    return request<any>('POST', '/favorites/folders', data)
  },

  updateFolder(folderId: number, data: { name: string; parent_id?: number | null }) {
    return request<any>('PATCH', `/favorites/folders/${folderId}`, data)
  },

  deleteFolder(folderId: number) {
    return request<any>('DELETE', `/favorites/folders/${folderId}`)
  },

  listAssets(params?: { folder_id?: number; asset_type?: string }) {
    return request<any>('GET', '/favorites/assets', undefined, {
      params: params as Record<string, string | number | undefined>
    })
  },

  createAsset(data: Record<string, unknown>) {
    return request<any>('POST', '/favorites/assets', data)
  },

  updateAsset(assetId: number, data: Record<string, unknown>) {
    return request<any>('PATCH', `/favorites/assets/${assetId}`, data)
  },

  deleteAsset(assetId: number) {
    return request<any>('DELETE', `/favorites/assets/${assetId}`)
  },

  copyToProject(assetId: number, data: { project_id: number; episode_id?: number; shot_id?: number; category_id?: number; status?: string }) {
    return request<any>('POST', `/favorites/assets/${assetId}/copy-to-project`, data)
  }
}

export const transfersApi = {
  /** 鍙戦€佺礌鏉?*/
  send(teamId: number, data: CreateTransferRequest) {
    return request<CloudTransfer>('POST', `/teams/${teamId}/transfers`, data)
  },

  /** 鎴戞敹鍒扮殑绱犳潗鍒楄〃 */
  received(params?: { status?: string; page?: number; page_size?: number }) {
    return request<PagedResult<CloudTransfer>>('GET', '/transfers/received', undefined, {
      params: params as Record<string, string | number | undefined>
    })
  },

  /** 鎴戝彂鍑虹殑绱犳潗鍒楄〃 */
  sent(params?: { status?: string; page?: number; page_size?: number }) {
    return request<PagedResult<CloudTransfer>>('GET', '/transfers/sent', undefined, {
      params: params as Record<string, string | number | undefined>
    })
  },

  /** 鎺ユ敹 */
  accept(transferId: number) {
    return request<void>('POST', `/transfers/${transferId}/accept`)
  },

  /** 鎷掔粷 */
  reject(transferId: number, reason?: string) {
    return request<void>('POST', `/transfers/${transferId}/reject`, reason ? { reason } : undefined)
  }
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?//  notifications 妯″潡
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
export const notificationsApi = {
  /** 閫氱煡鍒楄〃 */
  list(params?: { is_read?: boolean; page?: number; page_size?: number }) {
    return request<PagedResult<CloudNotification>>('GET', '/notifications', undefined, {
      params: params as Record<string, string | number | undefined>
    })
  },

  /** 鏍囪宸茶 */
  markRead(id: number) {
    return request<void>('PATCH', `/notifications/${id}/read`)
  },

  /** 鍏ㄩ儴宸茶 */
  markAllRead() {
    return request<void>('PATCH', '/notifications/read-all')
  }
}
