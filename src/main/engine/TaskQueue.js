import { EventEmitter } from 'events'
import { TaskExecutor } from './TaskExecutor.js'

class TaskQueue extends EventEmitter {
  constructor(concurrency = 3) {
    super()
    this.concurrency = concurrency
    this.activeTasks = new Map() // tasks currently running
    this.waitingQueue = [] // tasks waiting to run
    this.completedTasks = new Map()
    this.failedTasks = new Map()
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
    this.emit('task-updated', task)

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
    this.emit('task-updated', task)

    // Fire off execution asynchronously
    this.executeTask(task)
  }

  async executeTask(task) {
    try {
      // Fire execution through the real Executor instead of mocking
      const result = await TaskExecutor.execute(task, {}, (progress, message) => {
        // Only update if task hasn't been cancelled
        if (this.activeTasks.has(task.id)) {
          task.progress = progress
          if (message) task.statusMessage = message
          this.emit('task-updated', task)
        }
      })

      // Check if task was cancelled while running
      if (!this.activeTasks.has(task.id)) {
        throw new Error('Task Cancelled locally')
      }

      // Success
      task.status = 'completed'
      task.resultUrl = result.resultUrl
      console.log('[TaskQueue] Task completed:', {
        id: task.id,
        status: task.status,
        resultUrl: task.resultUrl?.substring(0, 50),
        payload: task.payload
      })
      this.activeTasks.delete(task.id)
      this.completedTasks.set(task.id, task)
      if (this.completedTasks.size > 50) {
        const oldest = this.completedTasks.keys().next().value
        this.completedTasks.delete(oldest)
      }
      this.emit('task-updated', task)
    } catch (error) {
      // Failure
      task.status = 'failed'
      task.error = error.message
      this.activeTasks.delete(task.id)
      this.failedTasks.set(task.id, task)
      if (this.failedTasks.size > 50) {
        const oldest = this.failedTasks.keys().next().value
        this.failedTasks.delete(oldest)
      }
      this.emit('task-updated', task)
    } finally {
      // Loop
      this.processQueue()
    }
  }

  cancelTask(taskId) {
    // 1. If waiting, just remove it
    const waitIndex = this.waitingQueue.findIndex((t) => t.id === taskId)
    if (waitIndex !== -1) {
      const task = this.waitingQueue.splice(waitIndex, 1)[0]
      task.status = 'cancelled'
      this.emit('task-updated', task)
      return true
    }

    // 2. If active, remove it from active mapping. The executing loop will catch the deletion and abort.
    if (this.activeTasks.has(taskId)) {
      const task = this.activeTasks.get(taskId)
      task.abortController?.abort()
      this.activeTasks.delete(taskId)
      task.status = 'cancelled'
      this.emit('task-updated', task)

      // Frees up a slot, process next
      this.processQueue()
      return true
    }

    return false
  }

  getStatus() {
    return {
      active: Array.from(this.activeTasks.values()),
      waiting: this.waitingQueue,
      completed: Array.from(this.completedTasks.values()).slice(-20), // Only keep last 20 for memory
      failed: Array.from(this.failedTasks.values()).slice(-20)
    }
  }
}

export const globalTaskQueue = new TaskQueue()
