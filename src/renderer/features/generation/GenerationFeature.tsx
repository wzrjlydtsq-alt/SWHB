import { useEffect, useRef } from 'react'
import { useAppStore } from '../../store/useAppStore.ts'
import { splitMidjourneyImage } from '../../utils/dataHelpers.ts'

/**
 * GenerationFeature
 * 管理生成任务的 MJ 切割 + 计时器等 Effect 逻辑
 * 不渲染任何 UI — 仅提供逻辑副作用
 */
export function GenerationFeature() {
  const history = useAppStore((state) => state.history)
  const hasGeneratingTasks = useAppStore((state) =>
    state.history.some((h) => h.status === 'generating')
  )
  const setHistory = useAppStore((state) => state.setHistory)
  // ========== MJ 切割 Effect ==========
  const splittingRef = useRef(new Set())

  useEffect(() => {
    history.forEach((item) => {
      if (
        item.mjNeedsSplit &&
        item.mjOriginalUrl &&
        item.apiConfig?.modelId?.includes('mj') &&
        item.status === 'completed'
      ) {
        if (splittingRef.current.has(item.id)) return
        splittingRef.current.add(item.id)

        setTimeout(() => {
          let ratio = item.mjRatio || '1:1'
          if (item.prompt && item.prompt.includes('--ar ')) {
            const arMatch = item.prompt.match(/--ar\s+([\d:]+)/)
            if (arMatch && arMatch[1]) ratio = arMatch[1]
          }

          console.log('Midjourney: 开始重新切割图片，任务ID: ' + item.id + ', 比例: ' + ratio)

          ;(splitMidjourneyImage as any)(item.mjOriginalUrl, ratio)
            .then((splitImages: any[]) => {
              const imageUrls = splitImages.map((img) => (typeof img === 'string' ? img : img.url))
              const firstImage = splitImages[0]
              const firstUrl = typeof firstImage === 'string' ? firstImage : firstImage.url

              setHistory((prev) =>
                prev.map((hItem) =>
                  hItem.id === item.id
                    ? {
                        ...hItem,
                        mjImages: imageUrls,
                        url: firstUrl,
                        selectedMjImageIndex: 0,
                        mjRatio: ratio,
                        mjNeedsSplit: false,
                        mjImageInfo: splitImages.map((img) =>
                          typeof img === 'string'
                            ? null
                            : { width: img.width, height: img.height, ratio: img.ratio }
                        )
                      }
                    : hItem
                )
              )

              splittingRef.current.delete(item.id)
              console.log('Midjourney: 重新切割完成，任务ID: ' + item.id)
            })
            .catch((err) => {
              console.error('Midjourney: 重新切割图片失败:', err)
              splittingRef.current.delete(item.id)
              setHistory((prev) =>
                prev.map((hItem) =>
                  hItem.id === item.id ? { ...hItem, mjNeedsSplit: true } : hItem
                )
              )
            })
        }, 500)
      }
    })
  }, [history, setHistory])

  // ========== 计时器 Effect ==========
  useEffect(() => {
    // Only run the timer while generation jobs are active.
    if (!hasGeneratingTasks) {
      useAppStore.getState().setNodeTimers({})
      return
    }

    const interval = setInterval(() => {
      const now = Date.now()
      const activeTasks = useAppStore.getState().history.filter(
        (h) => h.sourceNodeId && h.status === 'generating' && h.startTime
      )

      if (activeTasks.length === 0) return

      const newTimers = {}
      activeTasks.forEach((task) => {
        const elapsed = Math.floor((now - task.startTime) / 1000)
        newTimers[task.sourceNodeId] = elapsed
      })

      useAppStore.getState().setNodeTimers(newTimers)
    }, 1000)
    return () => clearInterval(interval)
  }, [hasGeneratingTasks])

  // ========== "从历史重新生成" ==========
  // 此函数逻辑已移入 HistoryFeature (handleRegenerateFromHistory)

  // 不渲染任何 UI
  return null
}
