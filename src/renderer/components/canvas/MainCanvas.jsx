import { ConnectionLayer } from './ConnectionLayer.jsx'
import { GroupLayer } from './GroupLayer.jsx'
import { NodeRenderer } from './NodeRenderer.jsx'
import { useAppStore } from '../../store/useAppStore.js'
import { CanvasContext, useCanvasContext } from '../../contexts/CanvasContext.jsx'
import { useShallow } from 'zustand/react/shallow'
import { useState, useEffect, useMemo } from 'react'

export function MainCanvas() {
  const { view, selectionBox, nodes } = useAppStore(
    useShallow((state) => ({
      view: state.view,
      selectionBox: state.selectionBox,
      nodes: state.nodes
    }))
  )

  const visibleNodes = nodes || []

  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080
  })

  useEffect(() => {
    const handleResize = () =>
      setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Virtualization: 仅渲染可视区域内的节点
  const renderedNodes = useMemo(() => {
    // 额外 Padding 避免滚动过快漏出空白
    const cullPadding = 500 / view.zoom
    const viewportStartX = -view.x / view.zoom - cullPadding
    const viewportStartY = -view.y / view.zoom - cullPadding
    const viewportEndX = (windowSize.width - view.x) / view.zoom + cullPadding
    const viewportEndY = (windowSize.height - view.y) / view.zoom + cullPadding

    return visibleNodes.filter((node) => {
      const nw = node.width || 800
      const nh = node.height || 800
      return (
        node.x + nw > viewportStartX &&
        node.x < viewportEndX &&
        node.y + nh > viewportStartY &&
        node.y < viewportEndY
      )
    })
  }, [visibleNodes, view.x, view.y, view.zoom, windowSize])

  const parentContext = useCanvasContext()

  // Combine ONLY explicit props for the context (no sprawling Zustand state)
  const contextValue = { ...parentContext, visibleNodes }

  const {
    canvasRef,
    VIRTUAL_CANVAS_WIDTH,
    VIRTUAL_CANVAS_HEIGHT,
    handleMouseDown,
    handleBackgroundClick,
    handleCanvasContextMenu
  } = contextValue

  return (
    <CanvasContext.Provider value={contextValue}>
      <div
        ref={canvasRef}
        id="canvas-bg"
        className="flex-1 h-full cursor-default relative"
        onMouseDown={handleMouseDown}
        onClick={handleBackgroundClick}
        onContextMenu={handleCanvasContextMenu}
        style={{
          backgroundPosition: `${view.x}px ${view.y}px`,
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          textRendering: 'optimizeLegibility',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden'
        }}
      >
        <div
          className="absolute origin-top-left will-change-transform"
          style={{
            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.zoom})`,
            width: VIRTUAL_CANVAS_WIDTH,
            height: VIRTUAL_CANVAS_HEIGHT,
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
            textRendering: 'optimizeLegibility',
            transformOrigin: 'top left',
            imageRendering: view.zoom >= 1 ? 'auto' : 'crisp-edges'
          }}
        >
          <GroupLayer />
          <ConnectionLayer />
          {renderedNodes.map((node) => (
            <NodeRenderer key={node.id} node={node} />
          ))}
        </div>

        {/* 框选框 */}
        {selectionBox && (
          <div
            className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none z-50"
            style={{
              left: Math.min(selectionBox.startX, selectionBox.endX),
              top: Math.min(selectionBox.startY, selectionBox.endY),
              width: Math.abs(selectionBox.endX - selectionBox.startX),
              height: Math.abs(selectionBox.endY - selectionBox.startY)
            }}
          />
        )}
      </div>
    </CanvasContext.Provider>
  )
}
