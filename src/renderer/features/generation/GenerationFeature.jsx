import { useEffect, useRef } from 'react'
import { useAppStore } from '../../store/useAppStore.js'
import { splitMidjourneyImage } from '../../utils/dataHelpers.js'

/**
 * GenerationFeature
 * 管理生成任务的 MJ 切割 + 计时器等 Effect 逻辑
 * 不渲染任何 UI — 仅提供逻辑副作用
 */
export function GenerationFeature({ history, setHistory }) {
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

          splitMidjourneyImage(item.mjOriginalUrl, ratio)
            .then((splitImages) => {
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
  }, [history])

  // ========== 计时器 Effect ==========
  useEffect(() => {
    // 无活跃任务时不启动轮询
    const hasActive = history.some((h) => h.status === 'generating')
    if (!hasActive) return

    const interval = setInterval(() => {
      const now = Date.now()
      const activeTasks = history.filter(
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
  }, [history])

  // ========== "从历史重新生成" ==========
  // 此函数逻辑已移入 HistoryFeature (handleRegenerateFromHistory)

  // 不渲染任何 UI
  return null
}
