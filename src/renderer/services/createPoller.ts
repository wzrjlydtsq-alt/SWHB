/**
 * createPoller — 通用轮询工厂
 *
 * 将轮询的基础设施（超时、自适应延迟、错误重试）与业务逻辑解耦。
 */

// ========== 类型定义 ==========

export interface PollResult {
  /** 轮询是否完成（成功或失败都算完成） */
  done: boolean
  /** 完成时的结果数据 */
  result?: unknown
  /** 失败时的错误信息 */
  error?: string
  /** 当前进度 (0-100)，用于自适应延迟 */
  progress?: number
  /** 自定义下一次延迟（毫秒），覆盖自适应计算 */
  delayMs?: number
}

export interface PollerOptions {
  /** 最大轮询次数 */
  maxAttempts?: number
  /** 基础延迟（毫秒） */
  baseDelayMs?: number
  /** 轮询器名称（用于日志） */
  name?: string
}

export type PollFn = (attempt: number) => Promise<PollResult>

export interface Poller {
  start: (taskId: string, pollFn: PollFn, onTimeout?: () => void) => void
  cancel: (taskId: string) => void
  cancelAll: () => void
  getActiveCount: () => number
}

// ========== 实现 ==========

interface ActivePoller {
  cancel: () => void
}

// 全局轮询注册表：用于取消和去重
const _activePollers = new Map<string, ActivePoller>()

/**
 * 创建一个轮询器实例
 */
export function createPoller({
  maxAttempts = 300,
  baseDelayMs = 5000,
  name = 'Poller'
}: PollerOptions = {}): Poller {
  function start(taskId: string, pollFn: PollFn, onTimeout?: () => void): void {
    // 去重：取消同 ID 的旧轮询
    cancel(taskId)

    let cancelled = false
    _activePollers.set(taskId, { cancel: () => (cancelled = true) })

    async function poll(attempt: number): Promise<void> {
      if (cancelled) {
        _activePollers.delete(taskId)
        return
      }

      if (attempt > maxAttempts) {
        _activePollers.delete(taskId)
        if (onTimeout) onTimeout()
        else console.warn(`[${name}] 轮询超时: ${taskId} (${maxAttempts} 次)`)
        return
      }

      try {
        const result = await pollFn(attempt)

        if (cancelled) {
          _activePollers.delete(taskId)
          return
        }

        if (result.done) {
          _activePollers.delete(taskId)
          return
        }

        // 自适应延迟
        let delay = result.delayMs || baseDelayMs
        const progress = result.progress || 0
        if (progress >= 90) delay = Math.min(delay, 1000)
        else if (progress >= 70) delay = Math.min(delay, 2000)
        else if (progress >= 50) delay = Math.min(delay, 3000)
        else if (attempt > 50) delay = Math.max(delay, 10000)

        setTimeout(() => poll(attempt + 1), delay)
      } catch (err) {
        if (cancelled) {
          _activePollers.delete(taskId)
          return
        }
        console.error(`[${name}] 轮询错误 (attempt ${attempt}):`, err)
        setTimeout(() => poll(attempt + 1), baseDelayMs)
      }
    }

    poll(0)
  }

  function cancel(taskId: string): void {
    const existing = _activePollers.get(taskId)
    if (existing) {
      existing.cancel()
      _activePollers.delete(taskId)
    }
  }

  function cancelAll(): void {
    for (const [id, poller] of _activePollers) {
      poller.cancel()
      _activePollers.delete(id)
    }
  }

  function getActiveCount(): number {
    return _activePollers.size
  }

  return { start, cancel, cancelAll, getActiveCount }
}

// 预创建的轮询器实例（供 generationService 直接使用）
export const imagePoller = createPoller({
  maxAttempts: 300,
  baseDelayMs: 5000,
  name: 'ImagePoller'
})
export const videoPoller = createPoller({
  maxAttempts: 360,
  baseDelayMs: 5000,
  name: 'VideoPoller'
})
export const mjPoller = createPoller({
  maxAttempts: 120,
  baseDelayMs: 5000,
  name: 'MidjourneyPoller'
})
