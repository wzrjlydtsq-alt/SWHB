/**
 * 云端 API 类型定义
 * 来源：docs/m2/02-api-contract.md
 *
 * 规则：
 *   - 只定义与后端 API 契约对应的类型
 *   - 不引入复杂状态管理
 *   - 时间字段统一为 ISO 8601 字符串
 */

// ═══════════════════════════════════
//  通用
// ═══════════════════════════════════

/** 后端统一响应格式 */
export interface ApiResponse<T = unknown> {
  code: number
  data: T
  message: string
}

/** 分页结果 */
export interface PagedResult<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

/** 分页请求参数 */
export interface PageParams {
  page?: number
  page_size?: number
}

// ═══════════════════════════════════
//  认证
// ═══════════════════════════════════

export interface SendCodeRequest {
  target: string
  type: 'phone' | 'email'
}

export interface SendCodeResponse {
  expires_in: number
}

export interface LoginRequest {
  target: string
  type: 'phone' | 'email'
  code: string
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  user: CloudUser
}

export interface PlatformLoginRequest {
  ticket: string
  phone?: string
  email?: string
  nickname?: string
  avatar_url?: string
}

export interface RefreshRequest {
  refresh_token: string
}

export interface RefreshResponse {
  access_token: string
  refresh_token: string
  expires_in: number
}

// ═══════════════════════════════════
//  用户
// ═══════════════════════════════════

export interface CloudUser {
  id: number
  phone: string | null
  email: string | null
  nickname: string
  avatar_url: string | null
  role?: TeamRole | string | null
  department?: string | null
  created_at: string
}

export interface UpdateUserRequest {
  nickname?: string
  avatar_url?: string
}

export interface AvatarUploadUrlResponse {
  method: string
  upload_url: string
  oss_key: string
  avatar_url: string
  headers: Record<string, string>
  expires_in: number
}

// ═══════════════════════════════════
//  团队
// ═══════════════════════════════════

export interface CloudTeam {
  id: number
  org_id?: number | null
  parent_team_id?: number | null
  team_type?: 'group' | 'personal'
  join_policy?: JoinPolicy
  name: string
  invite_code: string
  owner_id: number
  member_count: number
  role?: TeamRole
  created_at?: string
}

export type TeamRole =
  | 'owner'
  | 'emergency_admin'
  | 'admin'
  | 'head_director'
  | 'director'
  | 'writer'
  | 'producer'
  | 'member'
  | 'viewer'
export type JoinPolicy = 'invite' | 'approval' | 'closed'

export interface CreateTeamRequest {
  name: string
}

export interface TeamMember {
  user_id: number
  nickname: string
  avatar_url: string | null
  role: TeamRole
  joined_at: string
  is_online?: boolean
  online?: boolean
  presence?: string
  status?: string
  last_seen_at?: string | null
  last_active_at?: string | null
  updated_at?: string | null
}

export interface UpdateMemberRoleRequest {
  role: TeamRole
}

export interface JoinTeamRequest {
  invite_code: string
}

export interface CloudOrganization {
  id: number
  name: string
  invite_code: string
  owner_id: number
  join_policy: JoinPolicy
  member_count: number
  role?: TeamRole
  created_at?: string
}

export interface CreateOrganizationRequest {
  name: string
  join_policy?: JoinPolicy
}

export interface JoinOrganizationRequest {
  invite_code: string
  message?: string
}

export interface CreateOrgTeamRequest {
  name: string
  parent_team_id?: number | null
  join_policy?: JoinPolicy
}

export interface CloudJoinRequest {
  id: number
  scope_type: 'organization' | 'team'
  scope_id: number
  requester_id: number
  nickname: string
  avatar_url: string | null
  status: 'pending' | 'approved' | 'rejected' | 'canceled'
  message: string | null
  review_note: string | null
  created_at: string
  reviewed_at: string | null
}

export interface ReviewJoinRequestBody {
  action: 'approve' | 'reject'
  review_note?: string
}

// ═══════════════════════════════════
//  素材
// ═══════════════════════════════════

export type AssetType = 'image' | 'video' | 'audio' | 'document' | 'project' | 'other'

export interface CloudAsset {
  id: number
  team_id: number
  uploader_id: number
  uploader_nickname?: string
  name: string
  asset_type: AssetType
  mime_type: string | null
  file_size: number
  oss_key: string
  thumb_oss_key: string | null
  thumb_url?: string | null
  preview_oss_key?: string | null
  preview_status?: 'pending' | 'processing' | 'done' | 'failed' | 'skipped'
  width: number | null
  height: number | null
  duration_sec: number | null
  tags: string[] | null
  description: string | null
  current_version: number
  status: 'active' | 'archived' | 'deleted'
  created_at: string
  updated_at: string
}

export interface UploadUrlRequest {
  filename: string
  content_type: string
  file_size: number
}

export interface UploadUrlResponse {
  method: string
  upload_url: string
  oss_key: string
  headers: Record<string, string>
  expires_in: number
}

export interface CreateAssetRequest {
  name: string
  asset_type: AssetType
  mime_type: string
  file_size: number
  oss_key: string
  width?: number
  height?: number
  duration_sec?: number
  tags?: string[]
  description?: string
}

export interface AssetListParams extends PageParams {
  type?: AssetType
  search?: string
  sort?: string
}

export interface DownloadUrlResponse {
  download_url: string
  expires_in: number
}

// ═══════════════════════════════════
//  发送/接收
// ═══════════════════════════════════

export interface CloudTransfer {
  id: number
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  asset?: {
    id: number
    name: string
    asset_type: AssetType
    file_size: number
  }
  sender?: {
    id: number
    nickname: string | null
  }
  receiver?: {
    id: number
    nickname: string | null
  }
  team?: {
    id: number
    name: string
  }
  asset_id: number
  asset_name?: string
  asset_thumb_url?: string
  sender_id: number
  sender_nickname?: string
  receiver_id: number
  receiver_nickname?: string
  team_id: number
  team_name?: string
  message: string | null
  responded_at: string | null
  expires_at?: string | null
  created_at: string
}

export interface CreateTransferRequest {
  asset_id: number
  receiver_id: number
  message?: string
}

// ═══════════════════════════════════
//  通知
// ═══════════════════════════════════

export interface CloudNotification {
  id: number
  type: string
  title: string
  body: string | null
  ref_type: string | null
  ref_id: number | null
  is_read: boolean
  created_at: string
}
