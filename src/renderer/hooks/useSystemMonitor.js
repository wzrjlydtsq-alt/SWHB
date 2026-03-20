import { useState, useEffect, useRef } from 'react'

/**
 * 系统监控数据拉取 Hook
 * @param {boolean} enabled - 是否启用轮询
 * @param {number} interval - 轮询间隔（毫秒），默认 2000
 */
export function useSystemMonitor(enabled = false, interval = 2000) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!enabled) {
      // 面板关闭时清除定时器
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      return
    }

    const fetchStats = async () => {
      try {
        setLoading((prev) => (prev ? prev : true))
        const result = await window.api.monitorAPI.getStats()
        setStats(result)
        setError(null)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    // 立即拉取一次
    fetchStats()

    // 定时轮询
    timerRef.current = setInterval(fetchStats, interval)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [enabled, interval])

  return { stats, loading, error }
}
