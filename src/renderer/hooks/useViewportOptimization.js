import { useEffect, useRef } from 'react'

/**
 * useViewportOptimization — 可视区域节点优化 + 媒体离屏卸载
 *
 * 从 main.jsx 提取的两段逻辑：
 * 1. visibleNodes 计算（延迟 200ms 避免拖动卡顿）
 * 2. IntersectionObserver 媒体降载
 */
export function useViewportOptimization({ nodes, view, canvasRef }) {
  // 性能优化：可见节点计算改为 ref + 延迟
  const visibleNodesRef = useRef(nodes)
  const visibleNodesTimerRef = useRef(null)

  useEffect(() => {
    if (visibleNodesTimerRef.current) clearTimeout(visibleNodesTimerRef.current)
    visibleNodesTimerRef.current = setTimeout(() => {
      if (!canvasRef.current) {
        visibleNodesRef.current = nodes
        return
      }
      const rect = canvasRef.current.getBoundingClientRect()
      const padding = 200
      const cv = view
      const vl = (-cv.x - padding) / cv.zoom
      const vr = (rect.width - cv.x + padding) / cv.zoom
      const vt = (-cv.y - padding) / cv.zoom
      const vb = (rect.height - cv.y + padding) / cv.zoom
      visibleNodesRef.current = nodes.filter((n) => {
        const nr = n.x + (n.width || 0)
        const nb = n.y + (n.height || 0)
        return n.x < vr && nr > vl && n.y < vb && nb > vt
      })
    }, 200)
    return () => {
      if (visibleNodesTimerRef.current) clearTimeout(visibleNodesTimerRef.current)
    }
  }, [nodes, view.x, view.y, view.zoom])

  const visibleNodes = visibleNodesRef.current

  // 媒体降载：节点离开视口时隐藏 img/video
  const mediaObserverRef = useRef(null)
  const observedNodeElsRef = useRef(new Set())
  const mediaScanTimerRef = useRef(null)

  useEffect(() => {
    const rootEl = canvasRef.current
    if (!rootEl) return

    if (!mediaObserverRef.current) {
      mediaObserverRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const el = entry.target
            if (!entry.isIntersecting) {
              el.classList.add('media-offscreen')
            } else {
              el.classList.remove('media-offscreen')
            }
          })
        },
        {
          root: null,
          threshold: 0
        }
      )
    }

    const obs = mediaObserverRef.current

    if (mediaScanTimerRef.current) clearTimeout(mediaScanTimerRef.current)
    mediaScanTimerRef.current = setTimeout(() => {
      const nodeEls = rootEl.querySelectorAll('.node-wrapper')
      nodeEls.forEach((el) => {
        if (!observedNodeElsRef.current.has(el)) {
          obs.observe(el)
          observedNodeElsRef.current.add(el)
        }
      })

      Array.from(observedNodeElsRef.current).forEach((el) => {
        if (!rootEl.contains(el)) {
          try {
            obs.unobserve(el)
          } catch (e) {
            console.error(e)
          }
          observedNodeElsRef.current.delete(el)
        }
      })
    }, 120)

    return () => {
      if (mediaScanTimerRef.current) {
        clearTimeout(mediaScanTimerRef.current)
        mediaScanTimerRef.current = null
      }
    }
  }, [visibleNodes])

  return { visibleNodes }
}
