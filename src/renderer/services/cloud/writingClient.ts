/**
 * 写作模块云端 API Client
 *
 * 路由契约与 server/src/routes/writing.ts 严格对齐。
 * 复用 cloudClient 的 request 方法（统一 baseUrl、Bearer Token、自动刷新、错误处理）。
 *
 * 适配层说明：
 *   - 前端 UI 不直接调用此 client，而是通过 assignmentClient.ts 的适配层
 *   - 适配层在云端不可用时自动降级到本地 Mock
 *   - 当前默认 adapterMode='local'，不会发起真实 HTTP 请求
 */

import { request } from './cloudClient'
import type {
  WritingProjectDTO,
  WritingProjectListResponse,
  CreateWritingProjectRequest,
  UpdateWritingProjectRequest,
  WritingProjectMemberDTO,
  UpsertWritingProjectMemberRequest,
  AssignWritingWriterRequest,
  AssignWritingProductionRequest,
  WritingEpisodeDTO,
  CreateWritingEpisodeRequest,
  UpdateWritingEpisodeRequest,
  WritingTextAssetDTO,
  CreateWritingTextAssetRequest,
  UpdateWritingTextAssetRequest,
  WritingTextAssetVersionDTO,
  CreateTextAssetVersionRequest,
  SyncScriptDraftRequest,
  SubmitScriptReviewRequest,
  ReviewScriptRequest,
  WritingStoryboardShotDTO,
  CreateStoryboardShotRequest,
  UpdateStoryboardShotRequest,
  ImportStoryboardRequest,
  LockStoryboardRequest,
  StoryboardStatusResponse,
  WritingShotMediaCandidateDTO,
  BindShotMediaRequest,
  ReviewShotRequest,
  WritingAssignmentDTO,
  WritingAssignmentListResponse,
  CreateWritingAssignmentRequest,
  SubmitWritingAssignmentRequest,
  CompleteWritingAssignmentRequest,
  ReviewWritingAssignmentRequest,
  WritingStoryElementDTO,
  WritingCommentDTO,
  CreateWritingCommentRequest,
  ReplyWritingCommentRequest,
  WritingReviewHistoryDTO,
  WritingNotificationListResponse,
  WritingAdminNotificationListResponse,
  WritingPresenceDTO,
  UpsertWritingPresenceRequest,
  ParseScriptRequest,
  ParseScriptResponse
} from './writingTypes'

// ═══════════════════════════════════
//  项目
// ═══════════════════════════════════

export const writingProjectsApi = {
  list(params?: { page?: number; per_page?: number; team_id?: number }) {
    return request<WritingProjectListResponse>('GET', '/writing/projects', undefined, {
      params: params as Record<string, string | number | undefined>
    })
  },

  getById(projectId: number) {
    return request<WritingProjectDTO>('GET', `/writing/projects/${projectId}`)
  },

  create(data: CreateWritingProjectRequest) {
    return request<WritingProjectDTO>('POST', '/writing/projects', data)
  },

  update(projectId: number, data: UpdateWritingProjectRequest) {
    return request<{ id: number; updated: number }>('PATCH', `/writing/projects/${projectId}`, data)
  },

  listMembers(projectId: number) {
    return request<WritingProjectMemberDTO[]>('GET', `/writing/projects/${projectId}/members`)
  },

  upsertMember(projectId: number, data: UpsertWritingProjectMemberRequest) {
    return request<{ project_id: number; user_id: number; role: string; status: string }>('PUT', `/writing/projects/${projectId}/members`, data)
  },

  removeMember(projectId: number, userId: number) {
    return request<{ project_id: number; user_id: number; status: string }>('DELETE', `/writing/projects/${projectId}/members/${userId}`)
  },

  assignWriter(projectId: number, data: AssignWritingWriterRequest) {
    return request<{ project_id: number; episode_id: number | null; user_id: number; role: 'writer' }>('POST', `/writing/projects/${projectId}/assign-writer`, data)
  },

  assignProduction(projectId: number, data: AssignWritingProductionRequest) {
    return request<{
      project_id: number
      episode_id?: number | null
      shot_id?: number | null
      assignment_id?: number
      assignee_id?: number
      user_id?: number
      role?: 'producer'
      status?: string
    }>('POST', `/writing/projects/${projectId}/assign-production`, data)
  }
}

// ═══════════════════════════════════
//  剧集
// ═══════════════════════════════════

export const writingEpisodesApi = {
  list(projectId: number) {
    return request<WritingEpisodeDTO[]>('GET', `/writing/projects/${projectId}/episodes`)
  },

  create(projectId: number, data: CreateWritingEpisodeRequest) {
    return request<{ id: number; project_id: number; episode_number: number; title: string | null; status: string }>('POST', `/writing/projects/${projectId}/episodes`, data)
  },

  update(episodeId: number, data: UpdateWritingEpisodeRequest) {
    return request<{ id: number; updated: number }>('PATCH', `/writing/episodes/${episodeId}`, data)
  }
}

// ═══════════════════════════════════
//  文本资产与版本
// ═══════════════════════════════════

export const writingTextAssetsApi = {
  list(episodeId: number) {
    return request<WritingTextAssetDTO[]>('GET', `/writing/episodes/${episodeId}/text-assets`)
  },

  syncScriptDraft(episodeId: number, data: SyncScriptDraftRequest) {
    return request<{ id: number; episode_id: number; title: string; review_status: string; version?: number }>(
      'PUT',
      `/writing/episodes/${episodeId}/script-draft`,
      data
    )
  },

  create(episodeId: number, data: CreateWritingTextAssetRequest) {
    return request<{ id: number; episode_id: number; title: string; asset_type: string }>('POST', `/writing/episodes/${episodeId}/text-assets`, data)
  },

  update(assetId: number, data: UpdateWritingTextAssetRequest) {
    return request<{ id: number; updated: number }>('PUT', `/writing/text-assets/${assetId}`, data)
  },

  createVersion(assetId: number, data?: CreateTextAssetVersionRequest) {
    return request<{ id: number; text_asset_id: number; version: number; is_auto_save: boolean }>('POST', `/writing/text-assets/${assetId}/versions`, data)
  },

  submitReview(assetId: number, data?: SubmitScriptReviewRequest) {
    return request<{
      id: number
      assignment_id: number
      review_status: string
      reviewer_id: number
      version?: number
    }>('POST', `/writing/text-assets/${assetId}/submit-review`, data)
  },

  reviewScript(assetId: number, data: ReviewScriptRequest) {
    return request<{
      id: number
      review_status: string
      episode_status: string
      review_note: string | null
      version?: number
    }>('POST', `/writing/text-assets/${assetId}/review`, data)
  },

  listVersions(assetId: number) {
    return request<WritingTextAssetVersionDTO[]>('GET', `/writing/text-assets/${assetId}/versions`)
  }
}

// ═══════════════════════════════════
//  故事元素
// ═══════════════════════════════════

export const writingStoryElementsApi = {
  list(projectId: number) {
    return request<WritingStoryElementDTO[]>('GET', `/writing/projects/${projectId}/story-elements`)
  }
}

// ═══════════════════════════════════
//  分镜
// ═══════════════════════════════════

export const writingShotsApi = {
  list(episodeId: number) {
    return request<WritingStoryboardShotDTO[]>('GET', `/writing/episodes/${episodeId}/shots`)
  },

  importStoryboard(episodeId: number, data: ImportStoryboardRequest) {
    const payload = {
      ...data,
      replace_existing: data.replace_existing ?? data.replace ?? false
    }
    return request<{ episode_id: number; inserted_ids: number[]; count: number; locked: boolean }>(
      'POST',
      `/writing/episodes/${episodeId}/storyboard/import`,
      payload
    )
  },

  lockStoryboard(episodeId: number, data: LockStoryboardRequest) {
    return request<{ episode_id: number; locked: boolean }>('PATCH', `/writing/episodes/${episodeId}/storyboard/lock`, data)
  },

  getStoryboardStatus(episodeId: number) {
    return request<StoryboardStatusResponse>('GET', `/writing/episodes/${episodeId}/storyboard/status`)
  },

  create(episodeId: number, data: CreateStoryboardShotRequest) {
    return request<{ id: number; episode_id: number; status: string }>('POST', `/writing/episodes/${episodeId}/shots`, data)
  },

  update(shotId: number, data: UpdateStoryboardShotRequest) {
    return request<{ id: number; updated: number }>('PATCH', `/writing/shots/${shotId}`, data)
  },

  remove(shotId: number) {
    return request<{ id: number; status: string }>('DELETE', `/writing/shots/${shotId}`)
  },

  listMediaCandidates(shotId: number) {
    return request<WritingShotMediaCandidateDTO[]>('GET', `/writing/shots/${shotId}/media-candidates`)
  },

  bindMedia(shotId: number, data: BindShotMediaRequest) {
    return request<{ id: number; shot_id: number; asset_id: number; status: string }>('POST', `/writing/shots/${shotId}/media-candidates`, data)
  },

  review(shotId: number, data: ReviewShotRequest) {
    return request<{ shot_id: number; status: string; selected_candidate_id?: number; feedback?: string }>('POST', `/writing/shots/${shotId}/review`, data)
  },

  listReviewHistory(shotId: number, params?: { page?: number; per_page?: number }) {
    return request<WritingReviewHistoryDTO[]>('GET', `/writing/shots/${shotId}/review-history`, undefined, {
      params: params as Record<string, string | number | undefined>
    })
  }
}

// ═══════════════════════════════════
//  任务分发
// ═══════════════════════════════════

export const writingAssignmentsApi = {
  create(data: CreateWritingAssignmentRequest) {
    return request<{ id: number; status: string; assignee_id: number }>('POST', '/writing/assignments', data)
  },

  getMyAssignments(params?: { page?: number; per_page?: number }) {
    return request<WritingAssignmentListResponse>('GET', '/writing/assignments/me', undefined, {
      params: params as Record<string, string | number | undefined>
    })
  },

  getSentAssignments(params?: { page?: number; per_page?: number }) {
    return request<WritingAssignmentListResponse>('GET', '/writing/assignments/sent', undefined, {
      params: params as Record<string, string | number | undefined>
    })
  },

  accept(assignmentId: number) {
    return request<{ id: number; status: string }>('PATCH', `/writing/assignments/${assignmentId}/accept`)
  },

  submit(assignmentId: number, data?: SubmitWritingAssignmentRequest) {
    return request<{ id: number; status: string }>('PATCH', `/writing/assignments/${assignmentId}/submit`, data)
  },

  complete(assignmentId: number, data?: CompleteWritingAssignmentRequest) {
    return request<{ id: number; status: string; notified_user_id: number }>('PATCH', `/writing/assignments/${assignmentId}/complete`, data)
  },

  review(assignmentId: number, data: ReviewWritingAssignmentRequest) {
    return request<{ id: number; status: string; review_note: string | null }>('PATCH', `/writing/assignments/${assignmentId}/review`, data)
  },

  /** 拒绝任务 */
  reject(assignmentId: number, data?: { reason?: string }) {
    return request<{ id: number; status: string }>('PATCH', `/writing/assignments/${assignmentId}/reject`, data)
  },

  /** 开始任务（accepted → in_progress） */
  start(assignmentId: number) {
    return request<{ id: number; status: string }>('PATCH', `/writing/assignments/${assignmentId}/start`)
  },

  /** 删除/取消任务 */
  remove(assignmentId: number) {
    return request<{ id: number; status: string }>('DELETE', `/writing/assignments/${assignmentId}`)
  }
}

// ═══════════════════════════════════
//  评论/批注
// ═══════════════════════════════════

export const writingCommentsApi = {
  list(projectId: number, params?: { page?: number; per_page?: number; target_type?: string; target_id?: number }) {
    return request<WritingCommentDTO[]>('GET', `/writing/projects/${projectId}/comments`, undefined, {
      params: params as Record<string, string | number | undefined>
    })
  },

  create(projectId: number, data: CreateWritingCommentRequest) {
    return request<{ id: number; project_id: number; target_type: string; target_id: number; content: string }>('POST', `/writing/projects/${projectId}/comments`, data)
  },

  listReplies(commentId: number) {
    return request<WritingCommentDTO[]>('GET', `/writing/comments/${commentId}/replies`)
  },

  reply(commentId: number, data: ReplyWritingCommentRequest) {
    return request<{ id: number; parent_id: number; content: string }>('POST', `/writing/comments/${commentId}/replies`, data)
  },

  resolve(commentId: number) {
    return request<{ id: number; status: string }>('PATCH', `/writing/comments/${commentId}/resolve`)
  },

  remove(commentId: number) {
    return request<{ id: number; status: string }>('DELETE', `/writing/comments/${commentId}`)
  }
}

export const writingPresenceApi = {
  upsert(data: UpsertWritingPresenceRequest) {
    return request<null>('POST', '/writing/presence', data)
  },

  list(params: { target_type: UpsertWritingPresenceRequest['target_type']; target_id: number }) {
    return request<WritingPresenceDTO[]>('GET', '/writing/presence', undefined, {
      params
    })
  }
}

// ═══════════════════════════════════
//  通知/提醒
// ═══════════════════════════════════

export const writingNotificationsApi = {
  list(params?: { page?: number; per_page?: number; updated_after?: string; unread_only?: boolean }) {
    const query = params
      ? { ...params, unread_only: params.unread_only === undefined ? undefined : String(params.unread_only) }
      : undefined
    return request<WritingNotificationListResponse>('GET', '/writing/notifications', undefined, {
      params: query as Record<string, string | number | undefined>
    })
  },

  listAdmin(params?: { page?: number; per_page?: number; project_id?: number; unread_only?: boolean }) {
    const query = params
      ? { ...params, unread_only: params.unread_only === undefined ? undefined : String(params.unread_only) }
      : undefined
    return request<WritingAdminNotificationListResponse>('GET', '/writing/admin/notifications', undefined, {
      params: query as Record<string, string | number | undefined>
    })
  },

  markAllRead() {
    return request<null>('PATCH', '/writing/notifications/read-all')
  },

  markRead(notificationId: number) {
    return request<{ id: number; is_read: true }>('PATCH', `/writing/notifications/${notificationId}/read`)
  }
}

// ═══════════════════════════════════
//  剧本解析
// ═══════════════════════════════════

export const writingParseApi = {
  script(data: ParseScriptRequest) {
    return request<ParseScriptResponse>('POST', '/writing/parse/script', data)
  }
}

export const writingProjectAssetsApi = {
  list(projectId: number, params?: {
    episode_id?: number
    shot_id?: number
    category_id?: number
    status?: string
    asset_type?: string
  }) {
    return request<any>('GET', `/writing/projects/${projectId}/assets`, undefined, {
      params: params as Record<string, string | number | undefined>
    })
  },

  create(projectId: number, data: Record<string, unknown>) {
    return request<any>('POST', `/writing/projects/${projectId}/assets`, data)
  },

  review(assetId: number, data: { action: 'approve' | 'reject' | 'final'; review_note?: string }) {
    return request<any>('POST', `/writing/assets/${assetId}/review`, data)
  }
}
