/**
 * 星河智绘 — API 配置和响应类型
 */

/** API 模型类型 */
export type ApiModelType = 'Chat' | 'Image' | 'Video'

/** API 配置 */
export interface ApiConfig {
  id: string
  provider: string
  modelName: string
  type: ApiModelType
  key: string
  url: string
  durations?: string[]
}

/** API 配置 Map */
export type ApiConfigsMap = Map<string, ApiConfig>

/** API 错误详情 */
export interface ApiErrorDetail {
  message: string
  status: number
  data?: unknown
}

/** 图像生成请求参数 */
export interface ImageGenerationPayload {
  model: string
  prompt: string
  n?: number
  size?: string
  image_size?: string
  aspect_ratio?: string
  response_format?: string
  image?: string[]
  image_url?: string
}

/** 视频生成请求参数 */
export interface VideoGenerationPayload {
  model: string
  prompt: string
  generate_audio?: boolean
  ratio?: string
  duration?: number
  resolution?: string
  framespersecond?: number
  watermark?: boolean
  metadata?: {
    content?: VideoContentItem[]
    generate_audio?: boolean
    ratio?: string
    duration?: number
    resolution?: string
    framespersecond?: number
    watermark?: boolean
    tools?: Array<{ type: string }>
  }
  image_url?: string
}

/** 视频内容项 */
export interface VideoContentItem {
  type: 'text' | 'image_url' | 'video_url' | 'audio_url'
  text?: string
  image_url?: { url: string }
  video_url?: { url: string }
  audio_url?: { url: string }
  role?: string
}

/** 分辨率计算结果 */
export interface ResolutionResult {
  str: string
  w: number
  h: number
}

/** Sora2 合规尺寸结果 */
export interface Sora2Size extends ResolutionResult {
  aspect: string
}
