import { memo, useMemo } from 'react'
import { Unlink } from '../../utils/icons.jsx'
import { useCanvasContext } from '../../contexts/CanvasContext.jsx'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../../store/useAppStore.js'

export const ConnectionLayer = memo(function ConnectionLayer() {
  const {
    nodesMap,
    connectionsByNode,
    apiConfigsMap,
    onDisconnectConnection,
    visibleNodes: contextVisibleNodes
  } = useCanvasContext()

  const {
    connections,
    connectingSource,
    connectingTarget,
    connectingInputType,
    mousePos,
    selectedNodeId,
    nodes
  } = useAppStore(
    useShallow((state) => ({
      connections: state.connections,
      connectingSource: state.connectingSource,
      connectingTarget: state.connectingTarget,
      connectingInputType: state.connectingInputType,
      mousePos: state.mousePos,
      selectedNodeId: state.selectedNodeId,
      nodes: state.nodes
    }))
  )

  const visibleNodes = contextVisibleNodes || nodes
  // 连接线虚拟化：只渲染可见节点的连接线
  const visibleNodeIds = useMemo(() => {
    return new Set(visibleNodes.map((n) => n.id))
  }, [visibleNodes])

  const visibleConnections = useMemo(() => {
    return connections.filter(
      (conn) => visibleNodeIds.has(conn.from) || visibleNodeIds.has(conn.to)
    )
  }, [connections, visibleNodeIds])

  return (
    <div
      className="absolute top-0 left-0 pointer-events-none overflow-visible"
      style={{ width: 1, height: 1 }}
    >
      <svg className="absolute top-0 left-0 overflow-visible" style={{ width: 1, height: 1 }}>
        {visibleConnections.map((conn) => {
          // 使用 nodesMap 快速查找，O(1) 复杂度
          const rawFrom = nodesMap.get(conn.from)
          const rawTo = nodesMap.get(conn.to)
          if (!rawFrom || !rawTo) return null

          const fromNode = {
            ...rawFrom,
            x: rawFrom.position?.x ?? rawFrom.x,
            y: rawFrom.position?.y ?? rawFrom.y
          }
          const toNode = {
            ...rawTo,
            x: rawTo.position?.x ?? rawTo.x,
            y: rawTo.position?.y ?? rawTo.y
          }

          // 检查连接线是否与选中节点相关
          const isRelatedToSelected =
            selectedNodeId && (fromNode.id === selectedNodeId || toNode.id === selectedNodeId)
          // 设置透明度：选中节点相关为100%，其他为35%
          const opacity = isRelatedToSelected ? 1 : 0.35

          const startX = fromNode.x + fromNode.width - 4
          const startY = fromNode.y + fromNode.height / 2
          const endX = toNode.x + 4
          let endY = toNode.y + toNode.height / 2

          // 处理image-compare节点的多个输入点
          if (toNode.type === 'image-compare') {
            // 使用缓存的 connectionsByNode，避免重复 filter
            const relevantConns = connectionsByNode.to.get(toNode.id) || []
            const idx = relevantConns.findIndex((c) => c.id === conn.id)
            if (idx === 0) endY = toNode.y + toNode.height * 0.33
            else if (idx >= 1) endY = toNode.y + toNode.height * 0.66
          }

          // 处理Midjourney节点的oref和sref输入点
          // 检查inputType是否为oref或sref（注意：default连接时inputType可能是undefined）
          if (
            toNode.type === 'gen-image' &&
            (conn.inputType === 'oref' || conn.inputType === 'sref')
          ) {
            const currentModel = apiConfigsMap.get(toNode.settings?.model)
            const isMidjourney =
              currentModel &&
              (currentModel.id.includes('mj') ||
                currentModel.provider.toLowerCase().includes('midjourney'))

            if (isMidjourney) {
              // 使用基于节点世界坐标的计算，考虑实际DOM结构
              // 节点结构：p-3(12px) + 计时器(如果有，约28px + mb-2=8px) + 标题(约16px + mb-2=8px) + 引用状态区域(如果有，约60px + mb-2=8px) + 提示词区域(约100px + mb-2=8px) + 指令区域
              // 指令区域：gap-1.5(6px) + oref项(约16px) + gap-1.5(6px) + ow项(约16px + input高度) + gap-1.5(6px) + sref项(约16px)
              const paddingTop = 12 // 节点顶部padding (p-3 = 12px)
              const timerHeight = 28 // 计时器区域高度（px-2 py-1 + text-[10px] ≈ 28px）
              const timerMarginBottom = 8 // 计时器下方margin (mb-2 = 8px)
              const titleHeight = 16 // 标题高度 (text-xs ≈ 12px + line-height ≈ 16px，flex items-center)
              const titleMarginBottom = 8 // 标题下方margin (mb-2 = 8px)
              const refAreaHeight = 60 // 引用状态区域高度（p-2 + 内容，约60px）
              const refAreaMarginBottom = 8 // 引用区域下方margin (mb-2 = 8px)
              const promptAreaHeight = 100 // 提示词区域高度（p-3 + textarea，约100px）
              const promptAreaMarginBottom = 8 // 提示词区域下方margin (mb-2 = 8px)
              const instructionGap = 6 // 指令项之间的gap (gap-1.5 = 6px)
              const instructionItemHeight = 16 // 每个指令项的实际高度（text-[10px] + flex items-center ≈ 16px）
              const owInputHeight = 28 // ow输入框高度（px-2 py-1 + text-[10px] ≈ 28px）

              // 检查是否有计时器（正在生成或已完成）
              const hasTimer = false // 计时器是动态的，这里简化处理，实际应该从节点状态判断

              // 使用缓存的 connectionsByNode，避免重复 some 计算
              const toNodeConns = connectionsByNode.to.get(toNode.id) || []
              const hasRefArea = toNodeConns.some((c) => !c.inputType || c.inputType === 'default')

              // 计算基础偏移（到指令区域开始的位置）
              let baseOffset = paddingTop
              if (hasTimer) {
                baseOffset += timerHeight + timerMarginBottom
              }
              baseOffset += titleHeight + titleMarginBottom
              if (hasRefArea) {
                baseOffset += refAreaHeight + refAreaMarginBottom
              }
              baseOffset += promptAreaHeight + promptAreaMarginBottom

              if (conn.inputType === 'oref') {
                // oref在第一个指令位置（第一个指令项的中心）
                // 指令区域开始 + 第一个指令项的中心
                endY = toNode.y + baseOffset + instructionItemHeight * 0.5
              } else if (conn.inputType === 'sref') {
                // sref在第三个指令位置
                // 指令区域开始 + oref项(16px) + gap(6px) + ow项(owInputHeight ≈ 28px) + gap(6px) + sref项的中心(8px)
                endY =
                  toNode.y +
                  baseOffset +
                  instructionItemHeight +
                  instructionGap +
                  owInputHeight +
                  instructionGap +
                  instructionItemHeight * 0.5
              }
            }
          }

          const dist = Math.abs(endX - startX)
          const cp1X = startX + dist * 0.5
          const cp2X = endX - dist * 0.5
          const midX = (startX + endX) / 2
          const midY = (startY + endY) / 2

          return (
            <g key={conn.id} className="connection-group" style={{ opacity }}>
              {/* 透明路径用于点击检测连接线 */}
              <path
                d={`M ${startX} ${startY} C ${cp1X} ${startY}, ${cp2X} ${endY}, ${endX} ${endY}`}
                stroke="transparent"
                strokeWidth="20"
                fill="none"
                style={{ pointerEvents: 'stroke' }}
              />
              {/* 优化后的连接线：单层、1px宽度、蚂蚁线效果 */}
              <path
                d={`M ${startX} ${startY} C ${cp1X} ${startY}, ${cp2X} ${endY}, ${endX} ${endY}`}
                stroke={isRelatedToSelected ? '#71717a' : '#a1a1aa'}
                strokeWidth="1"
                fill="none"
                strokeDasharray="4,4"
              />
              {/* 删除按钮：使用更大的透明热区确保可点击，必须在最后渲染以覆盖透明 path */}
              <g
                className="connection-delete cursor-pointer"
                style={{
                  opacity: isRelatedToSelected ? 1 : 0.35,
                  pointerEvents: 'auto',
                  cursor: 'pointer'
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  onDisconnectConnection(conn.id)
                }}
                onMouseDown={(e) => {
                  // 阻止事件冒泡，防止触发画布拖动
                  e.stopPropagation()
                  e.preventDefault()
                  // 立即执行断开连接，不等待 onClick（修复点击无法断开的问题）
                  onDisconnectConnection(conn.id)
                }}
              >
                {/* 大的透明点击热区（半径25），确保完全覆盖透明 path 的 stroke（宽度20） */}
                <circle
                  cx={midX}
                  cy={midY}
                  r="25"
                  fill="transparent"
                  style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    onDisconnectConnection(conn.id)
                  }}
                  onMouseDown={(e) => {
                    // 阻止事件冒泡，防止触发画布拖动
                    e.stopPropagation()
                    e.preventDefault()
                    // 立即执行断开连接，不等待 onClick（修复点击无法断开的问题）
                    onDisconnectConnection(conn.id)
                  }}
                />
                {/* 视觉元素 */}
                <circle
                  cx={midX}
                  cy={midY}
                  r="12"
                  fill="#ef4444"
                  opacity="0.8"
                  style={{ pointerEvents: 'none' }}
                />
                <circle
                  cx={midX}
                  cy={midY}
                  r="8"
                  fill="#ef4444"
                  style={{ pointerEvents: 'none' }}
                />
                <Unlink
                  size={10}
                  className="text-white"
                  x={midX - 5}
                  y={midY - 5}
                  style={{ pointerEvents: 'none' }}
                />
              </g>
            </g>
          )
        })}
        {connectingSource &&
          (() => {
            // 使用 nodesMap 快速查找
            const node = nodesMap.get(connectingSource)
            if (!node) return null
            return (
              <path
                d={`M ${node.x + node.width - 4} ${node.y + node.height / 2} C ${node.x + node.width + 100} ${node.y + node.height / 2}, ${mousePos.x - 100} ${mousePos.y}, ${mousePos.x} ${mousePos.y}`}
                stroke="#60a5fa"
                strokeWidth="2"
                fill="none"
                strokeDasharray="4,4"
              />
            )
          })()}
        {connectingTarget &&
          (() => {
            // 使用 nodesMap 快速查找
            const node = nodesMap.get(connectingTarget)
            if (!node) return null
            // 从输入端口向左拖拽，连接线从左侧开始
            const startX = node.x + 4
            let startY = node.y + node.height / 2

            // 处理Midjourney节点的oref和sref输入点
            if (node.type === 'gen-image' && connectingInputType) {
              const currentModel = apiConfigsMap.get(node.settings?.model)
              const isMidjourney =
                currentModel &&
                (currentModel.id.includes('mj') ||
                  currentModel.provider.toLowerCase().includes('midjourney'))

              if (isMidjourney) {
                // 使用与连接线渲染相同的计算逻辑
                const paddingTop = 12
                const timerHeight = 28
                const timerMarginBottom = 8
                const titleHeight = 16 // 标题高度 (text-xs ≈ 12px + line-height ≈ 16px)
                const titleMarginBottom = 8
                const refAreaHeight = 60
                const refAreaMarginBottom = 8
                const promptAreaHeight = 100
                const promptAreaMarginBottom = 8
                const instructionGap = 6
                const instructionItemHeight = 16 // 每个指令项的实际高度（text-[10px] + flex items-center ≈ 16px）
                const owInputHeight = 28 // ow输入框高度（px-2 py-1 + text-[10px] ≈ 28px）

                const hasTimer = false // 计时器是动态的，这里简化处理
                // 使用缓存的 connectionsByNode，避免重复 some 计算
                const toNodeConns = connectionsByNode.to.get(node.id) || []
                const hasRefArea = toNodeConns.some(
                  (c) => !c.inputType || c.inputType === 'default'
                )

                let baseOffset = paddingTop
                if (hasTimer) {
                  baseOffset += timerHeight + timerMarginBottom
                }
                baseOffset += titleHeight + titleMarginBottom
                if (hasRefArea) {
                  baseOffset += refAreaHeight + refAreaMarginBottom
                }
                baseOffset += promptAreaHeight + promptAreaMarginBottom

                if (connectingInputType === 'oref') {
                  startY = node.y + baseOffset + instructionItemHeight * 0.5
                } else if (connectingInputType === 'sref') {
                  // sref在第三个指令位置：oref项(16px) + gap(6px) + ow项(owInputHeight ≈ 28px) + gap(6px) + sref项的中心(8px)
                  startY =
                    node.y +
                    baseOffset +
                    instructionItemHeight +
                    instructionGap +
                    owInputHeight +
                    instructionGap +
                    instructionItemHeight * 0.5
                }
              }
            }
            // 处理image-compare节点的多个输入点
            else if (node.type === 'image-compare') {
              // 这里可以根据鼠标位置判断是哪个输入点，暂时使用中间位置
              startY = node.y + node.height / 2
            }

            return (
              <path
                d={`M ${startX} ${startY} C ${startX - 100} ${startY}, ${mousePos.x + 100} ${mousePos.y}, ${mousePos.x} ${mousePos.y}`}
                stroke="#60a5fa"
                strokeWidth="2"
                fill="none"
                strokeDasharray="4,4"
              />
            )
          })()}
      </svg>
    </div>
  )
})
