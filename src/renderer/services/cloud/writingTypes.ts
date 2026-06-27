/**
 * 写作模块云端 API 类型定义
 *
 * 与后端 /api/v1/writing/... 路由契约对齐。
 * 基于 server/src/routes/writing.ts 实际路由 + 004_writing_studio.sql 表结构。
 * 所有主键使用 BIGINT UNSIGNED，前端用 number 表示。
 * 时间字段统一为 ISO 8601 字符串。
 */

// ═══════════════════════════════════
//  写作项目
// ═══════════════════════════════════

export interface WritingProjectDTO {
  id: number
  team_id: number
  org_id: number | null
  title: string
  genre: string | null
  cover_url: string | null
  synopsis: string | null
  status: 'active' | 'paused' | 'archived' | 'deleted'
  created_by: number
  created_at: string
  updated_at: string
  my_role: string | null
  stats?: {
    episode_count: number
    shot_count: number
    completed_episodes: number
  }
}

export interface WritingProjectListResponse {
  items: WritingProjectDTO[]
  total: number
  page: number
  per_page: number
}

export interface CreateWritingProjectRequest {
  title: string
  team_id: number
  org_id?: number
  genre?: string
  synopsis?: string
}

export interface UpdateWritingProjectRequest {
  title?: string
  genre?: string
  cover_url?: string
  synopsis?: string
  status?: 'active' | 'paused' | 'archived' | 'deleted'
}

export type WritingProjectMemberRole = 'director' | 'writer' | 'producer' | 'viewer'

export interface WritingProjectMemberDTO {
  id: number
  project_id: number
  user_id: number
  role: WritingProjectMemberRole
  status: 'active' | 'removed'
  assigned_by: number | null
  nickname: string | null
  avatar_url: string | null
  assigned_by_name: string | null
  created_at: string
  updated_at: string
}

export interface UpsertWritingProjectMemberRequest {
  user_id: number
  role: WritingProjectMemberRole
}

export interface AssignWritingWriterRequest {
  user_id: number
  episode_id?: number
}

export interface AssignWritingProductionRequest {
  user_id: number
  episode_id?: number
  shot_id?: number
  title?: string
  description?: string
  deadline?: string
}

// ═══════════════════════════════════
//  剧集
// ═══════════════════════════════════

export interface WritingEpisodeDTO {
  id: number
  project_id: number
  episode_number: number
  title: string | null
  synopsis: string | null
  status: 'not_started' | 'writing' | 'in_progress' | 'script_review' | 'script_approved' | 'asset_planning' | 'production' | 'director_review' | 'completed'
  assignee_id: number | null
  writer_id?: number | null
  assignee_name: string | null
  created_at: string
  updated_at: string
}

export interface CreateWritingEpisodeRequest {
  episode_number: number
  title?: string
  synopsis?: string
  assignee_id?: number
}

export interface UpdateWritingEpisodeRequest {
  title?: string
  synopsis?: string
  status?: 'not_started' | 'writing' | 'in_progress' | 'script_review' | 'script_approved' | 'asset_planning' | 'production' | 'director_review' | 'completed'
  assignee_id?: number | null
}

// ═══════════════════════════════════
//  文本资产与版本
// ═══════════════════════════════════

export type WritingTextAssetType =
  | 'script'
  | 'worldview'
  | 'inspiration'
  | 'storyboard_text'
  | 'note'

export interface WritingTextAssetDTO {
  id: number
  project_id: number
  episode_id: number | null
  asset_type: WritingTextAssetType
  title: string
  content: string | null
  last_editor_id: number | null
  editor_name: string | null
  status: 'active' | 'archived' | 'deleted'
  review_status?: 'draft' | 'submitted' | 'approved' | 'rejected'
  submitted_at?: string | null
  reviewer_id?: number | null
  reviewed_at?: string | null
  review_note?: string | null
  created_at: string
  updated_at: string
}

export interface CreateWritingTextAssetRequest {
  asset_type?: WritingTextAssetType
  title: string
  content?: string
}

export interface UpdateWritingTextAssetRequest {
  title?: string
  content?: string
}

export interface WritingTextAssetVersionDTO {
  id: number
  text_asset_id: number
  version: number
  content_snapshot: string
  author_id: number
  author_name: string | null
  version_name: string | null
  change_summary: string | null
  is_auto_save: boolean
  created_at: string
}

export interface CreateTextAssetVersionRequest {
  version_name?: string
  change_summary?: string
  is_auto_save?: boolean
}

export interface SyncScriptDraftRequest {
  asset_id?: number
  title?: string
  content?: string
  auto_version?: boolean
  change_summary?: string
}

export interface SubmitScriptReviewRequest {
  reviewer_id?: number
  note?: string
}

export interface ReviewScriptRequest {
  action: 'approve' | 'reject'
  review_note?: string
}

// ═══════════════════════════════════
//  故事元素（角色/场景/道具）
// ═══════════════════════════════════

export type StoryElementType = 'character' | 'location' | 'prop'

export interface WritingStoryElementDTO {
  id: number
  project_id: number
  episode_id: number | null
  element_type: StoryElementType
  name: string
  description: string | null
  visual_prompt: string | null
  status: 'active' | 'archived' | 'deleted'
  created_at: string
  updated_at: string
}

// ═══════════════════════════════════
//  分镜
// ═══════════════════════════════════

export type WritingShotStatus =
  | 'draft'
  | 'assigned'
  | 'in_progress'
  | 'reviewing'
  | 'approved'
  | 'rejected'

export interface WritingStoryboardShotDTO {
  id: number
  episode_id: number
  scene_number: string | null
  shot_number: number
  shot_label: string | null
  description: string | null
  camera_angle: string | null
  camera_movement: string | null
  prompt_draft: string | null
  video_prompt_draft: string | null
  status: WritingShotStatus
  assignee_id: number | null
  reviewer_id: number | null
  reviewed_at: string | null
  is_locked?: boolean
  locked_by?: number | null
  locked_at?: string | null
  candidate_count: number
  approved_count: number
  created_at: string
  updated_at: string
}

export interface CreateStoryboardShotRequest {
  scene_number?: string
  shot_number?: number
  shot_label?: string
  description?: string
  camera_angle?: string
  camera_movement?: string
  prompt_draft?: string
  video_prompt_draft?: string
}

export interface UpdateStoryboardShotRequest {
  scene_number?: string
  shot_number?: number
  shot_label?: string
  description?: string
  camera_angle?: string
  camera_movement?: string
  prompt_draft?: string
  video_prompt_draft?: string
}

export interface ImportStoryboardRequest {
  replace?: boolean
  replace_existing?: boolean
  lock_after_import?: boolean
  shots: CreateStoryboardShotRequest[]
}

export interface LockStoryboardRequest {
  locked: boolean
}

export interface StoryboardStatusResponse {
  episode_id: number
  total: number
  locked_count: number
  by_status: Array<{ status: WritingShotStatus; count: number; locked_count: number }>
}

// ═══════════════════════════════════
//  分镜候选媒体
// ═══════════════════════════════════

export type MediaCandidateStatus = 'pending' | 'approved' | 'rejected'

export interface WritingShotMediaCandidateDTO {
  id: number
  shot_id: number
  asset_id: number
  media_type: 'image' | 'video' | 'audio'
  creator_id: number
  is_selected: boolean
  feedback: string | null
  status: MediaCandidateStatus
  asset_name: string | null
  oss_key: string | null
  thumb_oss_key: string | null
  file_size: number | null
  original_asset_type: string | null
  creator_name: string | null
  created_at: string
  updated_at: string
}

export interface BindShotMediaRequest {
  asset_id: number
  media_type?: 'image' | 'video' | 'audio'
  creator_id: number
}

// ═══════════════════════════════════
//  导演审核
// ═══════════════════════════════════

export interface ReviewShotRequest {
  action: 'approve' | 'reject'
  selected_candidate_id?: number
  feedback?: string
}

// ═══════════════════════════════════
//  任务分发
// ═══════════════════════════════════

export type AssignmentStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'canceled'

export interface WritingAssignmentDTO {
  id: number
  shot_id: number | null
  text_asset_id: number | null
  project_id: number
  episode_id: number
  assigner_id: number
  assignee_id: number
  title: string
  description: string | null
  deadline: string | null
  status: AssignmentStatus
  accepted_at: string | null
  submitted_at: string | null
  reviewed_at: string | null
  review_note: string | null
  source_meta: Record<string, unknown> | null
  created_at: string
  updated_at: string
  project_title: string | null
  episode_title: string | null
  assigner_name: string | null
  assignee_name: string | null
}

export interface WritingAssignmentListResponse {
  items: WritingAssignmentDTO[]
  total: number
  page: number
  per_page: number
}

export interface CreateWritingAssignmentRequest {
  shot_id?: number
  text_asset_id?: number
  episode_id: number
  assignee_id: number
  title: string
  description?: string
  deadline?: string
  source_meta?: Record<string, unknown>
}

export interface SubmitWritingAssignmentRequest {
  media_candidate_ids?: number[]
  note?: string
}

export interface CompleteWritingAssignmentRequest extends SubmitWritingAssignmentRequest {
  asset_ids?: number[]
}

export interface ReviewWritingAssignmentRequest {
  action: 'approve' | 'reject'
  review_note?: string
}

// ═══════════════════════════════════
//  评论/批注
// ═══════════════════════════════════

export type CommentTargetType = 'project' | 'episode' | 'text_asset' | 'shot' | 'media_candidate' | 'assignment'

export interface WritingCommentDTO {
  id: number
  project_id: number
  target_type: CommentTargetType
  target_id: number
  author_id: number
  author_name: string | null
  author_avatar: string | null
  parent_id: number | null
  content: string
  line_number: number | null
  status: 'active' | 'resolved' | 'deleted'
  reply_count: number
  created_at: string
  updated_at: string
}

export interface CreateWritingCommentRequest {
  target_type: CommentTargetType
  target_id: number
  content: string
  line_number?: number
  parent_id?: number
}

export interface ReplyWritingCommentRequest {
  content: string
}

export type WritingPresenceTargetType = 'text_asset' | 'project' | 'episode'
export type WritingPresenceState = 'viewing' | 'editing' | 'commenting'

export interface WritingPresenceDTO {
  user_id: number
  nickname: string
  avatar_url: string | null
  target_type: WritingPresenceTargetType
  target_id: number
  state: WritingPresenceState
  line_number: number | null
  updated_at: string
}

export interface UpsertWritingPresenceRequest {
  target_type: WritingPresenceTargetType
  target_id: number
  state: WritingPresenceState
  line_number?: number
}

// ═══════════════════════════════════
//  通知/提醒
// ═══════════════════════════════════

export interface WritingNotificationDTO {
  id: number
  user_id: number
  type: string
  title: string
  body: string | null
  ref_type: string | null
  ref_id: number | null
  is_read: boolean
  created_at: string
}

export interface WritingNotificationListResponse {
  items: WritingNotificationDTO[]
  total_unread: number
}

export interface WritingAdminNotificationDTO extends WritingNotificationDTO {
  recipient_name: string | null
  project_id: number | null
  episode_id: number | null
  shot_id: number | null
  text_asset_id: number | null
  assignment_title: string | null
  assignment_status: AssignmentStatus | null
  project_title: string | null
  episode_title: string | null
  assigner_name: string | null
  assignee_name: string | null
}

export interface WritingAdminNotificationListResponse {
  items: WritingAdminNotificationDTO[]
  total: number
  total_unread: number
  page: number
  per_page: number
}

// ═══════════════════════════════════
//  审核历史与评论回复
// ═══════════════════════════════════

export interface WritingReviewHistoryDTO {
  media_candidate_id: number
  review_status: MediaCandidateStatus
  feedback: string | null
  is_selected: boolean
  reviewed_at: string
  asset_name: string | null
  thumb_oss_key: string | null
  file_size: number | null
  reviewer_name: string | null
}

// ═══════════════════════════════════
//  剧本解析
// ═══════════════════════════════════

export interface ParseScriptRequest {
  raw_text: string
}

export interface ParseScriptResponse {
  message: string
  char_count: number
  line_count: number
}
