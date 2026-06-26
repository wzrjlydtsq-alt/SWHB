/**
 * 星河智绘 — 性能优化工具库
 *
 * 提供通用的性能优化原语：
 * - throttle / debounce
 * - batched state updates
 * - RAF-based scheduling
 */

/**
 * 节流函数 — 每 interval 毫秒最多执行一次
 * @template {(...args: any[]) => void} T
 * @param {T} fn
 * @param {number} interval
 * @returns {T & { cancel(): void }}
 */
export function throttle(fn, interval) {
  let lastTime = 0
  let timer = null

  function throttled(this: any, ...args: any[]) {
    const now = performance.now()
    const remaining = interval - (now - lastTime)

    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      lastTime = now
      fn.apply(this, args)
    } else if (!timer) {
      timer = setTimeout(() => {
        lastTime = performance.now()
        timer = null
        fn.apply(this, args)
      }, remaining)
    }
  }

  throttled.cancel = () => {
    clearTimeout(timer)
    timer = null
  }

  return throttled
}

/**
 * 防抖函数 — 停止调用后 delay 毫秒才执行
 * @template {(...args: any[]) => void} T
 * @param {T} fn
 * @param {number} delay
 * @returns {T & { cancel(): void; flush(): void }}
 */
export function debounce(fn, delay) {
  let timer = null
  let lastArgs = null
  let lastContext = null

  function debounced(this: any, ...args: any[]) {
    lastArgs = args
    lastContext = this
    clearTimeout(timer)
    timer = setTimeout(() => {
      fn.apply(lastContext, lastArgs)
      lastArgs = null
      lastContext = null
    }, delay)
  }

  debounced.cancel = () => {
    clearTimeout(timer)
    timer = null
    lastArgs = null
    lastContext = null
  }

  debounced.flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
      if (lastArgs) fn.apply(lastContext, lastArgs)
      lastArgs = null
      lastContext = null
    }
  }

  return debounced
}

/**
 * RAF 批量调度器 — 将多次更新合并到下一帧
 * 用于高频事件（拖拽、滚动）中避免过度 setState
 *
 * @param {() => void} fn
 * @returns {{ schedule(): void; cancel(): void }}
 */
export function createRafScheduler(fn) {
  let rafId = null

  return {
    schedule() {
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null
          fn()
        })
      }
    },
    cancel() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
    }
  }
}

/**
 * 浅比较两个对象的 key-value
 * @param {Record<string, any>} a
 * @param {Record<string, any>} b
 * @returns {boolean}
 */
export function shallowEqual(a, b) {
  if (a === b) return true
  if (!a || !b) return false

  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false

  for (const key of keysA) {
    if (a[key] !== b[key]) return false
  }
  return true
}

/**
 * 创建一个稳定引用的回调 — 始终指向最新函数但引用不变
 * 用于解决 useCallback 依赖过多的问题
 *
 * 注意：这个函数返回的是一个普通对象，不是 React hook。
 * 在 React 组件中应使用 useStableCallback hook（见下方）。
 *
 * @template {(...args: any[]) => any} T
 * @param {T} fn
 * @returns {{ current: T }}
 */
export function createStableRef(fn) {
  const ref = { current: fn }
  return ref
}
