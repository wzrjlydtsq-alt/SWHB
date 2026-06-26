/**
 * W12: 剧集制素材数据类型
 *
 * 定义剧项目 → 剧集 → 文本资产 → 分镜资产的完整类型体系。
 * W8/W9 UI 必须使用这些类型，不散落匿名对象。
 * 后续接后端时平滑替换。
 */

/** 分镜审核状态 */
export type ShotStatus = 'draft' | 'in_progress' | 'review' | 'approved' | 'rejected'

/** 集完成状态 */
export type EpisodeStatus = 'not_started' | 'in_progress' | 'completed'

/** 文本资产类型 */
export type TextAssetType = 'script' | 'worldview' | 'inspiration' | 'storyboard_text' | 'notes'

/** 备选媒体候选 */
export interface ShotMediaCandidate {
  id: string
  shotId: string
  type: 'image' | 'video'
  url: string
  thumbUrl?: string
  creator: string
  creatorName?: string
  createdAt: string
  updatedAt?: string
  selected?: boolean
  sourceNodeId?: string
  sourceHistoryId?: string
  status?: 'pending' | 'approved' | 'rejected'
  sourceMeta?: any
}

/** 分镜资产 */
export interface SeriesShotAsset {
  id: string
  episodeId: string
  shotNumber: number
  description: string
  cameraAngle: string
  cameraMovement: string
  characters: string[]
  scene: string
  props: string[]
  promptDraft: string
  status: ShotStatus
  assignee: string
  lastModified: string
  mediaCandidates: ShotMediaCandidate[]
}

/** 文本资产 */
export interface SeriesTextAsset {
  id: string
  episodeId: string
  type: TextAssetType
  title: string
  content: string
  lastModified: string
}

/** 剧集 */
export interface SeriesEpisode {
  id: string
  seriesId: string
  episodeNumber: number
  title: string
  synopsis: string
  status: EpisodeStatus
  assignee: string
  lastModified: string
  characters: string[]
  scenes: string[]
  props: string[]
  textAssets: SeriesTextAsset[]
  shots: SeriesShotAsset[]
}

/** 剧项目 */
export interface SeriesProject {
  id: string
  title: string
  genre: string
  coverUrl: string
  synopsis: string
  totalEpisodes: number
  completedEpisodes: number
  status: 'active' | 'archived'
  lastModified: string
  /** 全剧级角色 */
  characters: string[]
  /** 全剧级场景 */
  scenes: string[]
  /** 全剧级道具 */
  props: string[]
  episodes: SeriesEpisode[]
}
