import React, { useRef, useEffect, useCallback } from 'react'
import { useCanvasContext } from '../../contexts/CanvasContext.tsx'

import { NodeResizeControl, ResizeControlVariant } from '@xyflow/react'
import { useAppStore } from '../../store/useAppStore.ts'

const nodeResizeSaveTimers = new Map()

function persistNodeSize(node) {
  if (!window.dbAPI?.nodes?.save) return
  const projectId = useAppStore.getState().currentProject?.id
  if (!projectId) return

  if (nodeResizeSaveTimers.has(node.id)) {
    clearTimeout(nodeResizeSaveTimers.get(node.id))
  }

  const timer = setTimeout(() => {
    window.dbAPI.nodes.save(node, projectId).catch(console.error)
    nodeResizeSaveTimers.delete(node.id)
  }, 180)

  nodeResizeSaveTimers.set(node.id, timer)
}

function isAutoExpandTextarea(textarea) {
  const className =
    typeof textarea.className === 'string'
      ? textarea.className
      : textarea.getAttribute('class') || ''

  if (className.includes('no-auto-expand')) return false
  return className.includes('flex-1') || className.includes('h-full')
}
const DEFAULT_NODE_NAMES = {
  'gen-image': 'AI绘图',
  'gen-video': 'AI视频',
  'novel-input': '小说',
  'agent-node': '智能体',
  'director-stage': '3D 导演台',
  'sticky-note': '便签'
}

const RESIZE_LINE_POSITIONS = ['top', 'right', 'bottom', 'left'] as const
const RESIZE_HANDLE_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
const AUTO_GROW_NODE_TYPES = new Set([
  'gen-image',
  'gen-video',
  'novel-input',
  'agent-node',
  'director-node',
  'director-stage',
  'sticky-note',
  'text-node'
])

const RESIZE_LINE_STYLE = {
  top: {
    width: 'calc(100% - 24px)',
    height: 16,
    borderColor: 'transparent',
    background: 'transparent',
    zIndex: 30
  },
  right: {
    width: 16,
    height: 'calc(100% - 24px)',
    borderColor: 'transparent',
    background: 'transparent',
    zIndex: 30
  },
  bottom: {
    width: 'calc(100% - 24px)',
    height: 16,
    borderColor: 'transparent',
    background: 'transparent',
    zIndex: 30
  },
  left: {
    width: 16,
    height: 'calc(100% - 24px)',
    borderColor: 'transparent',
    background: 'transparent',
    zIndex: 30
  }
}

const RESIZE_HANDLE_STYLE = {
  width: 16,
  height: 16,
  borderRadius: 8,
  background: 'transparent',
  border: 'none',
  boxShadow: 'none',
  zIndex: 31
}

export const NodeWrapper = React.memo(function NodeWrapper({
  node,
  isPerformanceMode,
  isSelected,
  isDragging,

  children
}: any) {
  const { setNodeContextMenu } = useCanvasContext()
  const wrapperRef = useRef(null)
  const nodeOrdinal = useAppStore(
    useCallback((state) => state.nodeIndexMap?.get(node.id) || null, [node.id])
  )

  // 鏌ユ壘鑺傜偣鎵€灞炵殑 group
  const nodeGroup = useAppStore(
    useCallback((state) => state.nodeGroupMap?.get(node.id) || null, [node.id])
  )

  // Editable display name for the node header.
  const displayName = node.settings?.customName || DEFAULT_NODE_NAMES[node.type] || node.type

  const isGenNode =
    node.type === 'gen-video' ||
    node.type === 'gen-image' ||
    node.type === 'preview-image'
  const isCollapsed = Boolean(node.settings?.outputCollapsed)

  // 节点类型色条 class
  const nodeTypeClass =
    node.type === 'gen-image'
      ? 'node-type-image'
      : node.type === 'gen-video'
        ? 'node-type-video'
        : node.type === 'agent-node'
          ? 'node-type-agent'
          : node.type === 'director-node' || node.type === 'director-stage'
            ? 'node-type-director'
            : ''

  const wrapperClass = `group flex flex-col node-wrapper text-scale-target ${nodeTypeClass} ${
    isCollapsed ? 'node-wrapper--collapsed' : ''
  } rounded-xl overflow-hidden transition-all duration-200`

  const style: React.CSSProperties = {
    width: node.width,
    height: node.height,
    cursor: isDragging ? 'grabbing' : 'default',
    zIndex: isDragging ? 50 : 10,
    background:
      'linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.025)), color-mix(in srgb, var(--bg-panel) 42%, transparent)',
    backdropFilter: 'blur(18px) saturate(135%)',
    WebkitBackdropFilter: 'blur(18px) saturate(135%)',
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 0 1px rgba(255,255,255,0.035)',
    contain: 'layout paint style',
    contentVisibility: isCollapsed || isDragging || isSelected ? 'visible' : 'auto',
    containIntrinsicSize: `${node.width || 320}px ${node.height || 240}px`,
    ...(nodeGroup
      ? { borderWidth: '1px', borderStyle: 'solid', borderColor: `${nodeGroup.color}40` }
      : { borderWidth: '1px', borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.055)' })
  }

  const growNodeToFitText = useCallback(() => {
    const root = wrapperRef.current
    if (!root) return

    const textareas = Array.from(root.querySelectorAll('textarea'))
      .filter(isAutoExpandTextarea)
      .map((textarea) => textarea as HTMLTextAreaElement)

    const totalOverflow = textareas.reduce((sum, textarea) => {
      const overflow = Math.ceil(textarea.scrollHeight - textarea.clientHeight)
      return overflow > 4 ? sum + overflow : sum
    }, 0)

    const contentRoot = root.querySelector('[data-node-inner-content]') as HTMLDivElement | null
    const contentOverflow = contentRoot
      ? Math.ceil(contentRoot.scrollHeight - contentRoot.clientHeight)
      : 0
    const requiredGrowth = Math.max(totalOverflow, contentOverflow > 4 ? contentOverflow : 0)

    if (requiredGrowth <= 4) return

    // 限制单次增长和总高度上限，防止粘贴大量文本时节点无限膨胀
    const MAX_NODE_HEIGHT = 1200
    const MAX_SINGLE_GROWTH = 300
    const clampedGrowth = Math.min(requiredGrowth, MAX_SINGLE_GROWTH)

    const { setNodes } = useAppStore.getState()
    let updatedNode = null

    setNodes((prev) =>
      prev.map((candidate) => {
        if (candidate.id !== node.id) return candidate
        const currentHeight = Math.max(candidate.height || 0, node.height || 0)
        if (currentHeight >= MAX_NODE_HEIGHT) return candidate
        const newHeight = Math.min(currentHeight + clampedGrowth + 8, MAX_NODE_HEIGHT)
        if (newHeight <= currentHeight) return candidate
        updatedNode = { ...candidate, height: newHeight }
        return updatedNode
      })
    )

    if (updatedNode) {
      persistNodeSize(updatedNode)
    }
  }, [node.id, node.height])

  useEffect(() => {
    if (isCollapsed || !AUTO_GROW_NODE_TYPES.has(node.type)) return

    const root = wrapperRef.current
    if (!root) return

    let frameId = 0
    let throttleTimer = 0
    let lastRequestedAt = 0
    const requestGrow = () => {
      const now = performance.now()
      const run = () => {
        lastRequestedAt = performance.now()
        cancelAnimationFrame(frameId)
        frameId = requestAnimationFrame(growNodeToFitText)
      }
      const remaining = 80 - (now - lastRequestedAt)
      if (remaining <= 0) {
        if (throttleTimer) {
          clearTimeout(throttleTimer)
          throttleTimer = 0
        }
        run()
      } else if (!throttleTimer) {
        throttleTimer = window.setTimeout(() => {
          throttleTimer = 0
          run()
        }, remaining)
      }
    }

    const handleInput = (event) => {
      const target = event.target
      if (!(target instanceof HTMLTextAreaElement)) return
      if (!isAutoExpandTextarea(target)) return
      requestGrow()
    }

    const observer = new MutationObserver(() => {
      requestGrow()
    })

    requestGrow()
    root.addEventListener('input', handleInput, true)
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true
    })

    return () => {
      cancelAnimationFrame(frameId)
      if (throttleTimer) clearTimeout(throttleTimer)
      root.removeEventListener('input', handleInput, true)
      observer.disconnect()
    }
  }, [growNodeToFitText, node.type, isCollapsed])

  const minWidth = node.type === 'sticky-note' ? 140 : 220
  const minHeight = node.type === 'sticky-note' ? 100 : 180

  return (
    <div
      ref={wrapperRef}
      className={wrapperClass}
      style={{
        ...style
      }}
      data-node-id={node.id}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (node.type === 'preview-image' || node.type === 'preview') return
        if (setNodeContextMenu) {
          setNodeContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            nodeId: node.id
          })
        }
      }}
    >
      {/* Delete button removed - use Delete key instead */}


      {/* Resize Controls */}
      {!isCollapsed &&
        !isPerformanceMode &&
        isSelected &&
        RESIZE_LINE_POSITIONS.map((position) => (
          <NodeResizeControl
            key={`resize-line-${position}`}
            position={position}
            variant={ResizeControlVariant.Line}
            minWidth={minWidth}
            minHeight={minHeight}
            autoScale={false}
            className={`node-resize-line-hitbox node-resize-line-hitbox-${position}`}
            style={RESIZE_LINE_STYLE[position]}
          />
        ))}

      {!isCollapsed &&
        !isPerformanceMode &&
        isSelected &&
        RESIZE_HANDLE_POSITIONS.map((position) => (
          <NodeResizeControl
            key={`resize-handle-${position}`}
            position={position}
            variant={ResizeControlVariant.Handle}
            minWidth={minWidth}
            minHeight={minHeight}
            autoScale={false}
            className="node-resize-corner-handle"
            style={RESIZE_HANDLE_STYLE}
          />
        ))}

      {/* Top transparent drag strip: keeps the node draggable without showing a title bar. */}
      {(isCollapsed || (node.type !== 'novel-input' && node.type !== 'sticky-note')) && (
        <div
          className={`node-drag-handle absolute inset-x-0 top-0 z-20 cursor-grab active:cursor-grabbing ${
            isCollapsed ? 'bottom-0 h-auto' : 'h-5'
          }`}
          title={displayName}
        />
      )}

      {/* Inner Content Area */}
      <div
        data-node-inner-content
        className={`overflow-hidden flex-1 flex flex-col pointer-events-none h-full w-full relative bg-transparent`}
      >
        {isCollapsed ? (
          <div className="node-collapsed-shell">
            <div className="node-collapsed-title">{displayName}</div>
            <div className="node-collapsed-meta">
              {nodeOrdinal !== null ? `#${nodeOrdinal}` : node.type}
              {nodeGroup ? ` · ${nodeGroup.name}` : ''}
            </div>
          </div>
        ) : (
          children
        )}
      </div>

      {/* 缁勬爣绛?*/}
      {nodeGroup && (
        <div
          className="absolute -bottom-5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-b text-[9px] font-medium whitespace-nowrap pointer-events-none select-none"
          style={{
            backgroundColor: `${nodeGroup.color}20`,
            color: nodeGroup.color,
            borderLeft: `1px solid ${nodeGroup.color}40`,
            borderRight: `1px solid ${nodeGroup.color}40`,
            borderBottom: `1px solid ${nodeGroup.color}40`
          }}
        >
          {nodeGroup.name}
        </div>
      )}
    </div>
  )
})

