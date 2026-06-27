import { EventEmitter } from 'events'
import { TaskExecutor } from './TaskExecutor.js'

const RENDERER_PAYLOAD_KEYS = [
  'historyTaskId',
  'nodeId',
  'projectId',
  'type',
  'modelId',
  'configName',
  'baseUrl',
  'ratio',
  'resolution',
  'duration',
  'w',
  'h',
  'sourceMeta',
  'retryRemoteTaskId'
]

function mediaCount(value) {
  return Array.isArray(value) ? value.length : value ? 1 : 0
}

export function summarizeTaskPayload(payload = {}) {
  return {
    historyTaskId: payload?.historyTaskId || null,
    nodeId: payload?.nodeId || null,
    projectId: payload?.projectId || null,
    type: payload?.type || null,
    modelId: payload?.modelId || null,
    configName: payload?.configName || null,
    baseUrl: payload?.baseUrl || null,
    promptLength: typeof payload?.prompt === 'string' ? payload.prompt.length : 0,
    sourceImages: mediaCount(payload?.sourceImages),
    sourceVideos: mediaCount(payload?.sourceVideos),
    sourceAudios: mediaCount(payload?.sourceAudios),
    hasApiKey: Boolean(payload?.apiKey),
    enableWebSearch: Boolean(payload?.enableWebSearch),
    generateAudio: payload?.generateAudio
  }
}

export function sanitizeTaskPayloadForRenderer(payload = {}) {
  if (!payload || typeof payload !== 'object') return {}
  return Object.fromEntries(
    RENDERER_PAYLOAD_KEYS
      .filter((key) => payload[key] !== undefined)
      .map((key) => [key, payload[key]])
  )
}

export function sanitizeTaskForRenderer(task = {}) {
  return {
    id: task.id,
    status: task.status,
    progress: task.progress,
    resultUrl: task.resultUrl,
    requestId: task.requestId,
    taskId: task.taskId,
    remoteTaskId: task.remoteTaskId,
    error: task.error,
    payload: sanitizeTaskPayloadForRenderer(task.payload),
    statusMessage: task.statusMessage,
    requestDebug: task.requestDebug
  }
}

class TaskQueue extends EventEmitter {
  constructor(concurrency = 10) {
    super()
    this.concurrency = concurrency
    this.activeTasks = new Map() // tasks currently running
    this.waitingQueue = [] // tasks waiting to run
    this.completedTasks = new Map()
    this.failedTasks = new Map()
  }

  emitTaskUpdated(task, { force = false } = {}) {
    const now = Date.now()
    const last = task._lastUpdateEmit || {}
    const progress = Number(task.progress || 0)
    const statusChanged = last.status !== task.status
    const progressChanged = Math.abs(progress - Number(last.progress || 0)) >= 5
    const terminal =
      task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled'

    if (force || terminal || statusChanged || (now - (last.time || 0) >= 500 && progressChanged)) {
      task._lastUpdateEmit = { time: now, progress, status: task.status }
      this.emit('task-updated', task)
    }
  }

  submitTask(taskPayload) {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const abortController = new AbortController()
    const task = {
      id: taskId,
      status: 'waiting',
      progress: 0,
      createdAt: Date.now(),
      payload: taskPayload,
      abortController
    }

    this.waitingQueue.push(task)
    this.emitTaskUpdated(task, { force: true })

    // Attempt to process queue
    this.processQueue()

    return taskId
  }

  processQueue() {
    if (this.activeTasks.size >= this.concurrency) {
      return // Queue full
    }

    if (this.waitingQueue.length === 0) {
      this.emit('queue-empty')
      return // No tasks
    }

    // Dequeue next task
    const task = this.waitingQueue.shift()
    this.activeTasks.set(task.id, task)
    task.status = 'processing'
    this.emitTaskUpdated(task, { force: true })

    // Fire off execution asynchronously
    this.executeTask(task)
  }

  async executeTask(task) {
    // 立刻释放并发位，让后续任务不被阻塞
    // 任务启动即释放，轮询/等待阶段不占用并发位
    this.activeTasks.delete(task.id)
    if (!this.pollingTasks) this.pollingTasks = new Map()
    this.pollingTasks.set(task.id, task)

    // 立刻触发下一个队列任务
    this.processQueue()

    try {
      // Fire execution through the real Executor instead of mocking
      const result = await TaskExecutor.execute(task, {}, (progress, message) => {
        // Only update if task hasn't been cancelled
        if (this.pollingTasks.has(task.id)) {
          task.progress = progress
          if (message) task.statusMessage = message
          this.emitTaskUpdated(task)
        }
      })

      // Check if task was cancelled while running
      if (!this.pollingTasks.has(task.id)) {
        throw new Error('Task Cancelled locally')
      }

      // Success
      task.status = 'completed'
      task.resultUrl = result.resultUrl
      task.remoteTaskId = result.remoteTaskId
      task.requestDebug = result.requestDebug
      task.requestId = result.requestId || result.rawResponse?.request_id || task.id
      task.taskId = result.taskId || result.remoteTaskId
      console.log('[TaskQueue] Task completed:', {
        id: task.id,
        status: task.status,
        resultUrl: task.resultUrl?.substring(0, 50),
        requestId: task.requestId,
        taskId: task.taskId,
        remoteTaskId: task.remoteTaskId,
        payload: summarizeTaskPayload(task.payload)
      })
      this.pollingTasks.delete(task.id)
      this.completedTasks.set(task.id, task)
      if (this.completedTasks.size > 50) {
        const oldest = this.completedTasks.keys().next().value
        this.completedTasks.delete(oldest)
      }
      this.emitTaskUpdated(task, { force: true })
    } catch (error) {
      // Failure
      task.status = 'failed'
      task.error = error.message
      this.pollingTasks.delete(task.id)
      this.failedTasks.set(task.id, task)
      if (this.failedTasks.size > 50) {
        const oldest = this.failedTasks.keys().next().value
        this.failedTasks.delete(oldest)
      }
      this.emitTaskUpdated(task, { force: true })
    }
  }

  cancelTask(taskId) {
    // 1. If waiting, just remove it
    const waitIndex = this.waitingQueue.findIndex((t) => t.id === taskId)
    if (waitIndex !== -1) {
      const task = this.waitingQueue.splice(waitIndex, 1)[0]
      task.status = 'cancelled'
      this.emitTaskUpdated(task, { force: true })
      return true
    }

    // 2. If active (submitting HTTP), abort it
    if (this.activeTasks.has(taskId)) {
      const task = this.activeTasks.get(taskId)
      task.abortController?.abort()
      this.activeTasks.delete(taskId)
      task.status = 'cancelled'
      this.emitTaskUpdated(task, { force: true })
      this.processQueue()
      return true
    }

    // 3. If polling (waiting for result), abort it
    if (this.pollingTasks && this.pollingTasks.has(taskId)) {
      const task = this.pollingTasks.get(taskId)
      task.abortController?.abort()
      this.pollingTasks.delete(taskId)
      task.status = 'cancelled'
      this.emitTaskUpdated(task, { force: true })
      return true
    }

    return false
  }

  getStatus() {
    const polling = this.pollingTasks ? Array.from(this.pollingTasks.values()) : []
    return {
      active: [...Array.from(this.activeTasks.values()), ...polling],
      waiting: this.waitingQueue,
      completed: Array.from(this.completedTasks.values()).slice(-20),
      failed: Array.from(this.failedTasks.values()).slice(-20)
    }
  }
}

export const globalTaskQueue = new TaskQueue()
