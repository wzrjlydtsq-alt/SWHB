/**
 * 星河智绘 — 任务引擎类型
 */

/** 任务状态 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/** 任务类型 */
export type TaskType = 'image' | 'video' | 'chat'

/** 任务提交负载 */
export interface TaskPayload {
  baseUrl?: string
  apiKey?: string
  modelId?: string
  type?: TaskType | string
  prompt?: string
  sizeStr?: string
  sourceImages?: string[]
  sourceVideos?: string[]
  sourceAudios?: string[]
  imageRoles?: string[]
  duration?: string
  ratio?: string
  resolution?: string
  configName?: string
  enableWebSearch?: boolean
  generateAudio?: boolean
  framesPerSecond?: number
  framespersecond?: number
  retryRemoteTaskId?: string
}

/** 任务定义 */
export interface Task {
  id: string
  payload: TaskPayload
  status: TaskStatus
  createdAt: number
  abortController?: AbortController
}

/** 任务执行结果 */
export interface TaskResult {
  success: boolean
  resultUrl?: string
  error?: string
}

/** 任务更新回调 */
export type TaskUpdateCallback = (progress: number, message: string) => void

/** 任务状态更新（IPC 事件） */
export interface TaskUpdate {
  id?: string
  taskId: string
  status: TaskStatus
  payload?: TaskPayload & Record<string, unknown>
  progress?: number
  message?: string
  resultUrl?: string
  error?: string
}

/** DAG 工作流引擎状态 */
export type EngineStatus = 'idle' | 'running' | 'completed' | 'error' | 'aborted'
