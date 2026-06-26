/**
 * 星河智绘 — 历史记录类型
 */

/** 历史记录状态 */
export type HistoryStatus = 'generating' | 'completed' | 'failed' | 'cancelled'

/** 历史记录 API 配置快照 */
export interface HistoryApiConfig {
  modelId?: string
  configName?: string
  type?: string
}

/** 历史记录原始负载（用于从历史重新生成） */
export interface HistoryOriginalPayload {
  prompt?: string
  modelId?: string
  type?: string
  ratio?: string
  resolution?: string
  duration?: string
  sourceImages?: string[]
  sourceVideos?: string[]
}

/** 历史记录条目 */
export interface HistoryItem {
  id: string
  status: HistoryStatus
  url?: string
  originalUrl?: string
  prompt?: string
  /** 源节点 ID */
  sourceNodeId?: string
  /** 开始时间戳 (ms) */
  startTime?: number
  /** 提交时间戳 (ms) */
  submittedAt?: number
  /** 提交到主进程/引擎的状态 */
  submitStatus?: 'pending' | 'submitted' | 'failed'
  /** 完成时间戳 (ms) */
  completedTime?: number
  resultUrl?: string
  localCacheUrl?: string
  localFilePath?: string
  cacheStatus?: 'idle' | 'pending' | 'completed' | 'failed'
  cacheError?: string | null
  resubmittedFrom?: string
  /** API 配置快照 */
  apiConfig?: HistoryApiConfig
  /** 原始负载（用于重新生成） */
  originalPayload?: HistoryOriginalPayload
  /** Midjourney 相关 */
  mjImages?: string[] | null
  mjOriginalUrl?: string
  mjNeedsSplit?: boolean
  mjRatio?: string
  selectedMjImageIndex?: number
  mjImageInfo?: Array<{
    width?: number
    height?: number
    ratio?: string
  } | null>
  /** 其他扩展字段 */
  [key: string]: any
}
