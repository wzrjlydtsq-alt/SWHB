import { useAppStore } from '../store/useAppStore.js'
import { useRef, useCallback } from 'react'

export const useCanvasDragLogic = ({
  view,
  setView,
  nodesRef,
  selectedNodeIdsRef,
  scheduleNodeUpdate,
  scheduleMultiNodeUpdate,
  screenToWorld,
  setContextMenu,
  setActiveDropdown,
  setHistoryContextMenu,
  connectingSource,
  connectingTarget,
  setSelectedNodeId,
  setSelectedNodeIds
}) => {
  const isPanning = useAppStore((s) => s.isPanning)
  const setIsPanning = useAppStore((s) => s.setIsPanning)
  const isDragging = useAppStore((s) => s.isDragging)
  const setIsDragging = useAppStore((s) => s.setIsDragging)
  const dragNodeId = useAppStore((s) => s.dragNodeId)
  const setDragNodeId = useAppStore((s) => s.setDragNodeId)
  const resizingNodeId = useAppStore((s) => s.resizingNodeId)
  const setResizingNodeId = useAppStore((s) => s.setResizingNodeId)
  const mousePos = useAppStore((s) => s.mousePos)
  const setMousePos = useAppStore((s) => s.setMousePos)

  const isSelecting = useAppStore((s) => s.isSelecting)
  const setIsSelecting = useAppStore((s) => s.setIsSelecting)
  const selectionBox = useAppStore((s) => s.selectionBox)
  const setSelectionBox = useAppStore((s) => s.setSelectionBox)

  const isSelectingRef = useRef(false)
  const isPanningRef = useRef(false)
  const panRafRef = useRef(null)
  const pendingPanUpdate = useRef(null)
  const multiNodeDragStartPos = useRef(null)
  const lastZoomRef = useRef(null)
  const lastMousePos = useRef({ x: 0, y: 0 })
  const selectionRafRef = useRef(null)
  const pendingSelectionUpdate = useRef(null)
  const panThrottleLastTsRef = useRef(0)

  const handleMouseMove = useCallback(
    (e, canvasRef) => {
      const { clientX, clientY } = e
      const worldPos = screenToWorld(clientX, clientY)
      // 仅在连线时写入 store（拖动/平移时不需要触发全局更新）
      if (connectingSource || connectingTarget) {
        setMousePos(worldPos)
      }

      if (isSelecting || isSelectingRef.current) {
        if (!isSelecting) setIsSelecting(true)
        const rect = canvasRef.current?.getBoundingClientRect()
        const endX = clientX - (rect?.left || 0)
        const endY = clientY - (rect?.top || 0)

        setSelectionBox((prev) => (prev ? { ...prev, endX, endY } : null))
        pendingSelectionUpdate.current = { endX, endY, rect }

        if (!selectionRafRef.current) {
          selectionRafRef.current = requestAnimationFrame(() => {
            if (!pendingSelectionUpdate.current) {
              selectionRafRef.current = null
              return
            }

            const { endX, endY, rect } = pendingSelectionUpdate.current
            const currentSelectionBox = selectionBox
            if (!currentSelectionBox) {
              selectionRafRef.current = null
              return
            }

            const boxStartX = Math.min(currentSelectionBox.startX, endX)
            const boxStartY = Math.min(currentSelectionBox.startY, endY)
            const boxEndX = Math.max(currentSelectionBox.startX, endX)
            const boxEndY = Math.max(currentSelectionBox.startY, endY)

            const worldStart = screenToWorld(
              boxStartX + (rect?.left || 0),
              boxStartY + (rect?.top || 0)
            )
            const worldEnd = screenToWorld(boxEndX + (rect?.left || 0), boxEndY + (rect?.top || 0))

            const currentNodes = nodesRef.current
            const selected = new Set()
            currentNodes.forEach((node) => {
              const nodeRight = node.x + node.width
              const nodeBottom = node.y + node.height
              if (
                node.x < worldEnd.x &&
                nodeRight > worldStart.x &&
                node.y < worldEnd.y &&
                nodeBottom > worldStart.y
              ) {
                selected.add(node.id)
              }
            })
            setSelectedNodeIds(selected)

            pendingSelectionUpdate.current = null
            selectionRafRef.current = null
          })
        }
        return
      }

      if ((isPanning || isPanningRef.current) && !isSelectingRef.current) {
        setIsDragging(true)
        const dx = clientX - lastMousePos.current.x
        const dy = clientY - lastMousePos.current.y

        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return

        if (pendingPanUpdate.current) {
          pendingPanUpdate.current.dx += dx
          pendingPanUpdate.current.dy += dy
        } else {
          pendingPanUpdate.current = { dx, dy }
        }

        const nowTs =
          typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
        const lastTs = panThrottleLastTsRef.current || 0
        if (nowTs - lastTs >= 32 && pendingPanUpdate.current) {
          const { dx: accDx, dy: accDy } = pendingPanUpdate.current
          setView((prev) => {
            const safeZoom = Math.max(0.2, Math.min(3.0, prev.zoom))
            const precision = safeZoom < 0.5 || safeZoom > 2.5 ? 1000 : 100
            return {
              ...prev,
              zoom: safeZoom,
              x: Math.round((prev.x + accDx) * precision) / precision,
              y: Math.round((prev.y + accDy) * precision) / precision
            }
          })
          pendingPanUpdate.current = null
          panThrottleLastTsRef.current = nowTs
        }

        lastMousePos.current = { x: clientX, y: clientY }
        return
      }

      if (resizingNodeId) {
        scheduleNodeUpdate(resizingNodeId, (node) => ({
          ...node,
          width: Math.max(250, worldPos.x - node.x),
          height: Math.max(250, worldPos.y - node.y)
        }))
      } else if (dragNodeId) {
        const safeZoom = Math.max(0.2, Math.min(3.0, view.zoom))
        const deltaX = e.movementX / safeZoom
        const deltaY = e.movementY / safeZoom
        const threshold = safeZoom < 0.5 || safeZoom > 2.5 ? 0.5 : 1

        if (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold) return

        const currentSelectedNodeIds = selectedNodeIdsRef.current
        let dragNodeIds = [dragNodeId]
        if (
          currentSelectedNodeIds &&
          currentSelectedNodeIds.size > 1 &&
          currentSelectedNodeIds.has(dragNodeId)
        ) {
          dragNodeIds = Array.from(currentSelectedNodeIds)
        }

        // 组联动：如果拖动的节点属于某个 group，合并 group 内所有节点
        const nodeGroups = useAppStore.getState().nodeGroups
        const dragGroup = nodeGroups.find((g) => g.nodeIds.includes(dragNodeId))
        if (dragGroup) {
          const groupSet = new Set(dragNodeIds)
          dragGroup.nodeIds.forEach((id) => groupSet.add(id))
          dragNodeIds = Array.from(groupSet)
        }

        const currentNodes = nodesRef.current
        const currentZoom = Math.max(0.2, Math.min(3.0, view.zoom))

        if (
          !multiNodeDragStartPos.current ||
          (lastZoomRef.current !== null && Math.abs(lastZoomRef.current - currentZoom) > 0.01)
        ) {
          multiNodeDragStartPos.current = {
            mouseX: clientX,
            mouseY: clientY,
            nodes: new Map(
              dragNodeIds
                .map((nodeId) => {
                  const node = currentNodes.find((n) => n.id === nodeId)
                  return node ? [nodeId, { x: node.x, y: node.y }] : null
                })
                .filter(Boolean)
            )
          }
        }
        lastZoomRef.current = currentZoom

        const totalDeltaX = (clientX - multiNodeDragStartPos.current.mouseX) / currentZoom
        const totalDeltaY = (clientY - multiNodeDragStartPos.current.mouseY) / currentZoom

        if (dragNodeIds.length > 1) {
          // 多节点拖动：ReactFlow 只拖主节点，我们负责跟随节点
          // 只更新非主拖动节点的位置，避免与 ReactFlow 冲突
          const updates = Array.from(multiNodeDragStartPos.current.nodes.entries())
            .filter(([nodeId]) => nodeId !== dragNodeId) // 跳过主节点（ReactFlow 已处理）
            .map(([nodeId, startPos]) => ({
              nodeId,
              updater: (node) => ({
                ...node,
                x: startPos.x + totalDeltaX,
                y: startPos.y + totalDeltaY
              })
            }))
          if (updates.length > 0) {
            scheduleMultiNodeUpdate(updates)
          }
        }
        // 单节点拖动：完全由 ReactFlow 的 onNodesChange 处理，不重复更新
      }
    },
    [
      isPanning,
      isSelecting,
      selectionBox,
      dragNodeId,
      resizingNodeId,
      screenToWorld,
      view.zoom,
      scheduleNodeUpdate,
      scheduleMultiNodeUpdate
    ]
  )

  const handleMouseUp = useCallback(
    (flushNodeUpdate) => {
      if (panRafRef.current) {
        cancelAnimationFrame(panRafRef.current)
        panRafRef.current = null
      }
      if (pendingPanUpdate.current) {
        const { dx, dy } = pendingPanUpdate.current
        setView((prev) => {
          const safeZoom = Math.max(0.2, Math.min(3.0, prev.zoom))
          const precision = safeZoom < 0.5 || safeZoom > 2.5 ? 1000 : 100
          return {
            ...prev,
            zoom: safeZoom,
            x: Math.round((prev.x + dx) * precision) / precision,
            y: Math.round((prev.y + dy) * precision) / precision
          }
        })
        pendingPanUpdate.current = null
      }

      if (flushNodeUpdate) {
        flushNodeUpdate()
      }

      if (isSelecting || isSelectingRef.current) {
        setIsSelecting(false)
        isSelectingRef.current = false
        setSelectionBox(null)

        const currentSelectedIds = selectedNodeIdsRef.current
        if (currentSelectedIds && currentSelectedIds.size === 1) {
          const nodeId = Array.from(currentSelectedIds)[0]
          setSelectedNodeId(nodeId)
        } else if (currentSelectedIds && currentSelectedIds.size === 0) {
          setSelectedNodeId(null)
        }
        setIsDragging(false)
        setIsPanning(false)
        isPanningRef.current = false
        multiNodeDragStartPos.current = null
        lastZoomRef.current = null
        return
      }

      if (isPanning || isPanningRef.current) {
        setIsPanning(false)
        isPanningRef.current = false
        setIsDragging(false)
        if (!connectingSource && !connectingTarget && !dragNodeId && !resizingNodeId) {
          setSelectedNodeId(null)
          setSelectedNodeIds(new Set())
          setContextMenu((prev) => ({ ...prev, visible: false }))
          setActiveDropdown(null)
          setHistoryContextMenu((prev) => ({ ...prev, visible: false }))
        }
      }
      if (!connectingSource && !connectingTarget) {
        setDragNodeId(null)
        setResizingNodeId(null)
        multiNodeDragStartPos.current = null
        lastZoomRef.current = null
      }
      setIsDragging(false)
      isSelectingRef.current = false
      lastMousePos.current = { x: 0, y: 0 }
    },
    [
      isSelecting,
      isPanning,
      connectingSource,
      connectingTarget,
      dragNodeId,
      resizingNodeId,
      setView,
      setSelectedNodeId,
      setSelectedNodeIds,
      setContextMenu,
      setActiveDropdown,
      setHistoryContextMenu
    ]
  )

  return {
    isPanning,
    setIsPanning,
    isPanningRef,
    isDragging,
    setIsDragging,
    dragNodeId,
    setDragNodeId,
    resizingNodeId,
    setResizingNodeId,
    mousePos,
    setMousePos,
    isSelecting,
    setIsSelecting,
    isSelectingRef,
    selectionBox,
    setSelectionBox,
    lastMousePos,
    handleMouseMove,
    handleMouseUp
  }
}
