import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPoller } from '../createPoller.ts'

describe('createPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('应能创建一个轮询器实例', () => {
    const poller = createPoller({ maxAttempts: 10 })
    expect(poller).toBeDefined()
    expect(typeof poller.start).toBe('function')
    expect(typeof poller.cancel).toBe('function')
    expect(typeof poller.cancelAll).toBe('function')
    expect(typeof poller.getActiveCount).toBe('function')
  })

  it('任务完成时应停止轮询', async () => {
    const poller = createPoller({ maxAttempts: 100, baseDelayMs: 1000 })
    const pollFn = vi.fn().mockResolvedValue({ done: true })

    poller.start('test-task', pollFn)
    await vi.advanceTimersByTimeAsync(0) // 执行第一次 poll

    expect(pollFn).toHaveBeenCalledTimes(1)
    expect(poller.getActiveCount()).toBe(0)
  })

  it('超时后应停止轮询并调用 onTimeout', async () => {
    const poller = createPoller({ maxAttempts: 2, baseDelayMs: 100 })
    const pollFn = vi.fn().mockResolvedValue({ done: false, progress: 10 })
    const onTimeout = vi.fn()

    poller.start('timeout-task', pollFn, onTimeout)

    // 执行 3 轮（attempt 0, 1, 2 → 超过 maxAttempts 2）
    await vi.advanceTimersByTimeAsync(0) // attempt 0
    await vi.advanceTimersByTimeAsync(200) // attempt 1
    await vi.advanceTimersByTimeAsync(200) // attempt 2
    await vi.advanceTimersByTimeAsync(200) // attempt 3 → timeout

    expect(onTimeout).toHaveBeenCalled()
  })

  it('取消后应停止轮询', async () => {
    const poller = createPoller({ maxAttempts: 100, baseDelayMs: 100 })
    const pollFn = vi.fn().mockResolvedValue({ done: false, progress: 10 })

    poller.start('cancel-task', pollFn)
    await vi.advanceTimersByTimeAsync(0) // first poll

    poller.cancel('cancel-task')
    expect(poller.getActiveCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(500) // 即使等待也不应再调用
    expect(pollFn).toHaveBeenCalledTimes(1)
  })

  it('应去重：启动同 ID 任务会取消旧任务', async () => {
    const poller = createPoller({ maxAttempts: 100, baseDelayMs: 100 })
    const pollFn1 = vi.fn().mockResolvedValue({ done: false, progress: 10 })
    const pollFn2 = vi.fn().mockResolvedValue({ done: true })

    poller.start('dedup-task', pollFn1)
    poller.start('dedup-task', pollFn2) // 应取消 pollFn1

    await vi.advanceTimersByTimeAsync(0) // 执行 pollFn2
    expect(pollFn2).toHaveBeenCalledTimes(1)
    expect(poller.getActiveCount()).toBe(0) // pollFn2 返回 done:true
  })

  it('cancelAll 应取消所有活跃轮询', async () => {
    const poller = createPoller({ maxAttempts: 100, baseDelayMs: 100 })
    const pollFn = vi.fn().mockResolvedValue({ done: false })

    poller.start('task1', pollFn)
    poller.start('task2', pollFn)
    poller.start('task3', pollFn)

    expect(poller.getActiveCount()).toBe(3)
    poller.cancelAll()
    expect(poller.getActiveCount()).toBe(0)
  })
})
