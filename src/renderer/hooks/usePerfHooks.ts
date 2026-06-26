/**
 * 星河智绘 — 性能优化 React Hooks
 *
 * useStableCallback: 引用稳定的回调 hook（解决 useCallback 依赖爆炸问题）
 * useDebouncedValue: 防抖的状态值
 * useThrottledCallback: 节流回调
 */
import { useRef, useCallback, useState, useEffect } from 'react'

/**
 * 创建引用稳定的回调函数
 * - 返回值引用永远不变（不会导致子组件重渲染）
 * - 但总是调用最新版本的 fn
 *
 * @template {(...args: any[]) => any} T
 * @param {T} fn
 * @returns {T}
 */
export function useStableCallback(fn) {
  const ref = useRef(fn)
  ref.current = fn
  return useCallback((...args) => ref.current(...args), [])
}

/**
 * 防抖的状态值 — 高频更新的输入在 delay 后才传播
 *
 * @template T
 * @param {T} value
 * @param {number} delay
 * @returns {T}
 */
export function useDebouncedValue(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

/**
 * 节流回调
 * @template {(...args: any[]) => void} T
 * @param {T} fn
 * @param {number} interval
 * @returns {T}
 */
export function useThrottledCallback(fn, interval) {
  const ref = useRef(fn)
  ref.current = fn

  const lastTimeRef = useRef(0)
  const timerRef = useRef(null)

  // 组件卸载时清理
  useEffect(() => () => clearTimeout(timerRef.current), [])

  return useCallback(
    (...args) => {
      const now = performance.now()
      const remaining = interval - (now - lastTimeRef.current)

      if (remaining <= 0) {
        clearTimeout(timerRef.current)
        timerRef.current = null
        lastTimeRef.current = now
        ref.current(...args)
      } else if (!timerRef.current) {
        timerRef.current = setTimeout(() => {
          lastTimeRef.current = performance.now()
          timerRef.current = null
          ref.current(...args)
        }, remaining)
      }
    },
    [interval]
  )
}
