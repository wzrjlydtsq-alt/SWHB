import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useCanvasContext } from '../../contexts/CanvasContext.jsx'

import { NodeResizer } from '@xyflow/react'
import { useAppStore } from '../../store/useAppStore.js'

const DEFAULT_NODE_NAMES = {
  'gen-image': 'AI绘图',
  'gen-video': 'AI视频',
  'alchemy-node': '炼丹炉',
  'novel-input': '小说',
  'agent-node': '智能体'
}

export const NodeWrapper = React.memo(function NodeWrapper({
  node,
  isPerformanceMode,
  isSelected,
  isDragging,
  dragNodeId,
  selectedNodeIds,

  children
}) {


  const { setNodeContextMenu, updateNodeSettings } = useCanvasContext()

  // 查找节点所属的 group
  const nodeGroup = useAppStore(
    useCallback((state) => state.nodeGroups.find((g) => g.nodeIds.includes(node.id)) || null, [node.id])
  )

  // 可编辑名称
  const displayName = node.settings?.customName || DEFAULT_NODE_NAMES[node.type] || node.type
  const [isEditingName, setIsEditingName] = useState(false)
  const [editNameValue, setEditNameValue] = useState(displayName)
  const nameInputRef = useRef(null)

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [isEditingName])

  const saveName = () => {
    const trimmed = editNameValue.trim()
    const defaultName = DEFAULT_NODE_NAMES[node.type] || node.type
    if (trimmed && trimmed !== defaultName) {
      updateNodeSettings(node.id, { customName: trimmed })
    } else {
      // 清除自定义名称，恢复默认
      updateNodeSettings(node.id, { customName: undefined })
      setEditNameValue(defaultName)
    }
    setIsEditingName(false)
  }

  const isGenNode =
    node.type === 'gen-video' ||
    node.type === 'gen-image' ||
    node.type === 'alchemy-node' ||
    node.type === 'preview-image'

  const wrapperClass = `group flex flex-col node-wrapper text-scale-target ${
    isGenNode
      ? isSelected
        ? 'shadow-[0_0_8px_rgba(100,100,100,0.3)]'
        : ''
      : isSelected
        ? 'shadow-[0_0_8px_rgba(100,100,100,0.3)] bg-[var(--bg-secondary)] border'
        : 'shadow-lg bg-[var(--bg-secondary)] border'
  }`

  const borderColor = nodeGroup
    ? `${nodeGroup.color}${isSelected ? '' : '60'}`
    : isSelected
      ? 'rgba(100,100,100,0.4)'
      : 'var(--border-color)'

  const style = {
    width: node.width,
    height: node.height,
    cursor:
      dragNodeId === node.id || (dragNodeId && selectedNodeIds.has(node.id))
        ? 'grabbing'
        : 'default',
    zIndex: isDragging ? 50 : 10,
    boxShadow: isPerformanceMode
      ? undefined
      : isDragging
        ? '0 0 12px rgba(100, 100, 100, 0.5), 0 0 5px rgba(100, 100, 100, 0.3)'
        : undefined,
    contain: 'style'
  }

  return (
    <div
      className={wrapperClass}
      style={{
        ...style,
        borderColor: isGenNode ? undefined : borderColor
      }}
      data-node-id={node.id}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        // 预览节点不显示节点操作菜单
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

      {/* Native React Flow Node Resizer */}
      {!isPerformanceMode && (
        <NodeResizer
          minWidth={250}
          minHeight={250}
          isVisible={isSelected}
          lineClassName="border-gray-500"
          handleClassName="h-3 w-3 !bg-[var(--bg-base)] !border-2 !border-gray-500 !rounded"
        />
      )}


      {/* 顶部：名称标签 + 拖拽手柄（跳过本身整体可拖的节点类型） */}
      {node.type !== 'novel-input' && (
        <div
          className="w-full shrink-0 flex items-center px-2 py-1 cursor-grab active:cursor-grabbing select-none"
          title="拖动节点"
        >
          {isEditingName ? (
            <input
              ref={nameInputRef}
              value={editNameValue}
              onChange={(e) => setEditNameValue(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') saveName()
                if (e.key === 'Escape') {
                  setEditNameValue(displayName)
                  setIsEditingName(false)
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="nodrag text-[10px] font-mono tracking-wide bg-[var(--bg-panel)] border border-[var(--primary-color)] rounded px-1.5 py-0.5 outline-none text-[var(--text-primary)] w-24"
            />
          ) : (
            <span
              className="text-[10px] font-mono tracking-wide text-zinc-500 hover:text-[var(--primary-color)] transition-colors"
              onDoubleClick={(e) => {
                e.stopPropagation()
                setEditNameValue(displayName)
                setIsEditingName(true)
              }}
              title="双击编辑名称"
            >
              {displayName}
            </span>
          )}
          <div className="flex-1" />
          <div className="w-6 h-[3px] rounded-full bg-[var(--text-muted)] opacity-30" />
        </div>
      )}

      {/* Inner Content Area */}
      <div
        className={`overflow-hidden flex-1 flex flex-col pointer-events-none h-full w-full relative bg-transparent`}
      >
        {children}
      </div>

      {/* 组标签 */}
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
