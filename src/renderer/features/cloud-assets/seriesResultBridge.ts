import { MOCK_SERIES_PROJECTS } from './seriesMockData'
import type { SeriesShotAsset, ShotMediaCandidate } from './seriesTypes'

export const SERIES_RESULT_BRIDGE_EVENT = 'series-result-bridge:updated'
export const SERIES_DIRECTOR_NOTIFICATION_EVENT = 'series-director-notification:created'

/**
 * W8-B: 将生成结果回调到剧集分镜资产的媒体候选库中 (Mock)
 * @param result 从 canvas history/outputResults 获取的带 sourceMeta 的生成结果
 */
export function addShotMediaCandidateFromResult(result: any) {
  if (!result || !result.sourceMeta || !result.sourceMeta.shotId) {
    console.warn('[addShotMediaCandidateFromResult] 缺少有效的 sourceMeta.shotId')
    return false
  }

  const meta = {
    ...result.sourceMeta,
    requestId: result.requestId || result.request_id || result.id || result.sourceMeta.requestId,
    taskId: result.taskId || result.task_id || result.remoteTaskId || result.sourceMeta.taskId,
    remoteTaskId: result.remoteTaskId || result.remote_task_id || result.sourceMeta.remoteTaskId,
    durationMs: result.durationMs || result.duration_ms || result.sourceMeta.durationMs,
    modelName: result.modelName || result.sourceMeta.modelName,
    prompt: result.prompt || result.sourceMeta.prompt
  }
  const projectId = meta.projectId || 'series-1' // Fallback to first project
  const episodeTitle = meta.episodeTitle // Because episodeId might not be provided easily

  // Find Project
  let project = MOCK_SERIES_PROJECTS.find(p => p.id === projectId)
  if (!project) {
    project = MOCK_SERIES_PROJECTS[0]
  }

  // Find Episode (try by id first, then by title)
  let episode = null
  if (meta.episodeId) {
    episode = project.episodes.find(ep => ep.id === meta.episodeId)
  }
  if (!episode && episodeTitle) {
    episode = project.episodes.find(ep => ep.title === episodeTitle)
  }
  if (!episode) {
    // If not found, just use the first episode as a fallback for mock purposes
    episode = project.episodes[0]
  }

  // Find Shot. W8 local mocks can have different stable IDs between writing and
  // series data, so exact shotId wins and shotNumber is a mock-only fallback.
  const shot = episode.shots.find(s => s.id === meta.shotId)
    || findShotByNumber(episode.shots, meta.shotNumber)
  if (!shot) {
    console.warn(`[addShotMediaCandidateFromResult] 未在集 ${episode.id} 找到镜头 ${meta.shotId}`)
    return false
  }

  // Create candidate
  const candidate: ShotMediaCandidate = {
    id: `media-gen-${result.id}`,
    shotId: shot.id,
    type: result.type === 'video' ? 'video' : 'image',
    url: result.url,
    thumbUrl: result.thumbUrl || result.url,
    creator: '当前用户',
    creatorName: '我',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'pending',
    sourceNodeId: result.sourceNodeId,
    sourceHistoryId: result.id,
    sourceMeta: meta
  }

  // Add to media candidates
  if (!shot.mediaCandidates) {
    shot.mediaCandidates = []
  }
  shot.mediaCandidates.push(candidate)
  notifySeriesResultBridgeUpdated()
  
  console.log(`[addShotMediaCandidateFromResult] 已将生成结果回流到分镜 ${shot.id} 作为备选媒体。`)
  return true
}

function findShotByNumber(shots: SeriesShotAsset[], shotNumber?: number | string) {
  const normalized = Number(shotNumber)
  if (!Number.isFinite(normalized)) return null
  return shots.find((shot) => shot.shotNumber === normalized) || null
}

function notifySeriesResultBridgeUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SERIES_RESULT_BRIDGE_EVENT))
}

export function notifyDirectorAssetReady(sourceMeta: Record<string, any>) {
  if (typeof window === 'undefined') return false
  const notification = {
    id: `director_notice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'series.asset_review_requested',
    title: '组员已完成本集素材制作',
    message: `${sourceMeta.seriesTitle || sourceMeta.projectTitle || '剧集'} / ${sourceMeta.episodeTitle || sourceMeta.episodeId || '单集'} 已提交导演审核`,
    sourceMeta,
    createdAt: new Date().toISOString(),
    read: false
  }

  try {
    const key = 'xinghe_series_director_notifications_v1'
    const list = JSON.parse(localStorage.getItem(key) || '[]')
    localStorage.setItem(key, JSON.stringify([notification, ...(Array.isArray(list) ? list : [])]))
  } catch {
    // The event below is still enough for an in-memory UI listener.
  }

  window.dispatchEvent(new CustomEvent(SERIES_DIRECTOR_NOTIFICATION_EVENT, { detail: notification }))
  return true
}
