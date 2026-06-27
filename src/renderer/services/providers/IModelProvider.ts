/**
 * ModelProvider 统一接口定义
 *
 * 所有 AI 服务商（火山引擎、Midjourney、OpenAI 等）必须实现此接口。
 * 桌面端和后端共用同一接口合约，具体实现可不同。
 */

/**
 * 生成请求的标准输入
 */
export interface GenerationRequest {
  /** 文本提示词 */
  prompt: string
  /** 生成类型 */
  type: 'image' | 'video' | 'text'
  /** 模型 ID */
  modelId: string
  /** 宽高比 */
  ratio?: string
  /** 分辨率 */
  resolution?: string
  /** 尺寸字符串 (例如 "1024x576") */
  sizeStr?: string
  /** 宽 */
  width?: number
  /** 高 */
  height?: number
  /** 视频时长（秒） */
  duration?: number | string
  /** 参考图片列表 (URL 或 base64) */
  sourceImages?: string[]
  /** 参考视频列表 */
  sourceVideos?: string[]
  /** 参考音频列表 */
  sourceAudios?: string[]
  /** 是否生成音频（视频模型） */
  generateAudio?: boolean
  /** Video FPS, defaults to 24 for Seedance */
  framesPerSecond?: number
  /** 额外的模型特定参数 */
  extra?: Record<string, unknown>
}

/**
 * 生成结果的标准输出
 */
export interface GenerationResult {
  /** 是否成功 */
  success: boolean
  /** 结果资源 URL */
  resultUrl?: string
  /** 远端任务 ID（轮询模型用） */
  remoteTaskId?: string
  /** 是否需要轮询 */
  needsPolling?: boolean
  /** 轮询间隔（毫秒） */
  pollInterval?: number
  /** 错误信息 */
  error?: string
  /** 原始 API 响应 */
  rawResponse?: unknown
}

/**
 * 轮询状态
 */
export interface PollResult {
  /** 任务状态 */
  status: 'pending' | 'processing' | 'completed' | 'failed'
  /** 完成进度 0-100 */
  progress: number
  /** 结果 URL（完成时） */
  resultUrl?: string
  /** 错误信息（失败时） */
  error?: string
}

/**
 * Provider 能力声明
 */
export interface ProviderCapabilities {
  /** 支持的生成类型 */
  supportedTypes: ('image' | 'video' | 'text')[]
  /** 是否支持图生图/图生视频 */
  supportsImageInput: boolean
  /** 是否支持音频生成 */
  supportsAudioGeneration: boolean
  /** 是否为异步轮询模型 */
  isAsyncPolling: boolean
  /** 支持的比例列表 */
  supportedRatios?: string[]
  /** 支持的时长列表 */
  supportedDurations?: string[]
  /** 运行位置：桌面本地 / 云端后端 / 两者皆可 */
  runtime: 'local' | 'cloud' | 'both'
}

/**
 * 统一 ModelProvider 接口
 */
export interface IModelProvider {
  /** Provider 唯一标识 */
  readonly id: string
  /** 显示名称 */
  readonly name: string
  /** 能力声明 */
  readonly capabilities: ProviderCapabilities

  /**
   * 提交生成任务
   */
  generate(request: GenerationRequest, apiKey: string, baseUrl: string): Promise<GenerationResult>

  /**
   * 轮询异步任务状态（仅异步模型需实现）
   */
  poll?(taskId: string, apiKey: string, baseUrl: string): Promise<PollResult>
}
