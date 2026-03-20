import { useEffect } from 'react'
export function useCanvasInteractions({ canvasRef, setView }) {
  // 屏蔽滚轮事件相关的控制台错误（passive 事件监听器错误）- 双重保护
  useEffect(() => {
    const originalError = console.error
    const originalWarn = console.warn

    const shouldFilter = (args) => {
      const msg = args
        .map((arg) => {
          if (typeof arg === 'string') return arg
          if (arg && arg.toString) return arg.toString()
          return ''
        })
        .join(' ')
      return (
        msg.includes('Unable to preventDefault') ||
        msg.includes('passive event listener') ||
        (msg.includes('preventDefault') && msg.includes('passive'))
      )
    }

    console.error = function (...args) {
      if (shouldFilter(args)) return
      originalError(...args)
    }

    console.warn = function (...args) {
      if (shouldFilter(args)) return
      originalWarn(...args)
    }

    return () => {
      console.error = originalError
      console.warn = originalWarn
    }
  }, [])

  // 全局禁止 Ctrl+滚轮 缩放
  useEffect(() => {
    const preventCtrlZoom = (e) => {
      if (!e.ctrlKey) return
      try {
        if (e.cancelable) {
          e.preventDefault()
          e.stopPropagation()
        }
      } catch {
        // Ignored
      }
    }

    const opts = { passive: false, capture: true }
    window.addEventListener('wheel', preventCtrlZoom, opts)
    document.addEventListener('wheel', preventCtrlZoom, opts)
    window.addEventListener('mousewheel', preventCtrlZoom, opts)
    document.addEventListener('mousewheel', preventCtrlZoom, opts)

    return () => {
      window.removeEventListener('wheel', preventCtrlZoom, opts)
      document.removeEventListener('wheel', preventCtrlZoom, opts)
      window.removeEventListener('mousewheel', preventCtrlZoom, opts)
      document.removeEventListener('mousewheel', preventCtrlZoom, opts)
    }
  }, [])

  // 使用原生事件监听器绑定 handleWheel，避免 React 合成事件的 passive 问题
  useEffect(() => {
    const canvasElement = canvasRef?.current
    if (!canvasElement) return

    const wheelHandler = (e) => {
      if (e.ctrlKey) {
        try {
          if (e.cancelable) {
            e.preventDefault()
            e.stopPropagation()
          }
        } catch {
          // Ignored
        }
        return
      }

      const target = e.target
      let isInsideNode = false
      let scrollableElement = null

      let current = target
      while (current && current !== canvasElement) {
        if (current.classList) {
          const isStoryboardContainer =
            current.classList.contains('flex') &&
            current.classList.contains('flex-col') &&
            current.classList.contains('h-full') &&
            current.classList.contains('rounded-xl') &&
            current.classList.contains('overflow-hidden')

          if (
            current.classList.contains('video-input-container') ||
            current.classList.contains('video-analyze-container') ||
            current.classList.contains('agent-chat-container') ||
            isStoryboardContainer
          ) {
            isInsideNode = true

            if (isStoryboardContainer) {
              scrollableElement =
                current.querySelector('.flex-1.overflow-y-auto.custom-scrollbar') ||
                current.querySelector('.flex-1.overflow-y-auto')
            } else {
              scrollableElement = current.querySelector(
                '.overflow-y-auto, .custom-scrollbar, [class*="overflow-y"]'
              )
              if (!scrollableElement) {
                const style = window.getComputedStyle(current)
                if (
                  style.overflowY === 'auto' ||
                  style.overflowY === 'scroll' ||
                  current.classList.contains('custom-scrollbar')
                ) {
                  scrollableElement = current
                }
              }
            }
            break
          }

          const container = current.closest(
            '.video-input-container, .video-analyze-container, .agent-chat-container'
          )
          if (container) {
            isInsideNode = true
            scrollableElement = container.querySelector(
              '.overflow-y-auto, .custom-scrollbar, [class*="overflow-y"]'
            )
            if (!scrollableElement) {
              const style = window.getComputedStyle(container)
              if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                scrollableElement = container
              }
            }
            break
          }

          const storyboardContainer = current.closest(
            '.flex.flex-col.h-full.rounded-xl.overflow-hidden'
          )
          if (storyboardContainer) {
            isInsideNode = true
            scrollableElement =
              storyboardContainer.querySelector('.flex-1.overflow-y-auto.custom-scrollbar') ||
              storyboardContainer.querySelector('.flex-1.overflow-y-auto')
            break
          }
        }
        current = current.parentElement
      }

      if (isInsideNode && scrollableElement) {
        try {
          if (e.cancelable) {
            e.preventDefault()
            e.stopPropagation()
          }
        } catch {
          // Ignored
        }
        const maxScroll = scrollableElement.scrollHeight - scrollableElement.clientHeight
        const currentScroll = scrollableElement.scrollTop
        const newScroll = Math.max(0, Math.min(maxScroll, currentScroll + e.deltaY))
        scrollableElement.scrollTop = newScroll
        return
      }

      try {
        if (e.cancelable) {
          e.preventDefault()
        }
      } catch {
        // Ignored
      }

      const rect = canvasElement.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      setView((prev) => {
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
        let newZoom = Math.min(Math.max(prev.zoom * zoomFactor, 0.2), 3)
        newZoom = Math.round(newZoom * 10000) / 10000
        const scale = newZoom / prev.zoom
        const newX = mouseX - (mouseX - prev.x) * scale
        const newY = mouseY - (mouseY - prev.y) * scale
        const precision = newZoom < 0.5 || newZoom > 2.5 ? 1000 : 100
        return {
          ...prev, // preserve other properties if any, but mainly zoom, x, y
          zoom: newZoom,
          x: Math.round(newX * precision) / precision,
          y: Math.round(newY * precision) / precision
        }
      })
    }

    canvasElement.addEventListener('wheel', wheelHandler, { passive: false })

    return () => {
      canvasElement.removeEventListener('wheel', wheelHandler)
    }
  }, [canvasRef, setView])
}
