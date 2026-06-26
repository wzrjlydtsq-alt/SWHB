/**
 * CanvasOperationsContext — 画布操作 Provider
 *
 * 从 App.jsx 提取的画布操作逻辑：
 * - useNodesState hook 的返回值（addNode, deleteNode, updateNodeSettings...）
 * - 所有 refs（canvasRef, viewRef, nodesRef, copiedNodesRef...）
 * - screenToWorld 函数
 * - useMenuManager 的返回值
 * - useContextMenuActions 的返回值
 * - useAppShortcuts 调用
 * - useMediaHandlers 的返回值
 */
import { createContext, useContext, useRef, useEffect, useMemo, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore.ts'
import { useShallow } from 'zustand/react/shallow'
import { useNodesState } from '../hooks/useNodesState.ts'
import { useMenuManager } from '../hooks/useMenuManager.ts'
import { useContextMenuActions } from '../hooks/useContextMenuActions.ts'
import { useAppShortcuts } from '../hooks/useAppShortcuts.ts'
import { useMediaHandlers } from '../hooks/useMediaHandlers.ts'
import { isVideoUrl } from '../utils/projectUtils.ts'
import { useProjectContext } from './ProjectContext.tsx'
import { createApiConfigsMap } from '../utils/apiConfigResolver.ts'

const CanvasOperationsContext = createContext(null)

export function CanvasOperationsProvider({ children }) {
  const { chatFeatureRef, handleSaveToHistory } = useProjectContext()

  const {
    apiConfigs,
    setNodes,
    connections,
    setConnections,
    view,
    setView,
    selectedNodeId,
    setSelectedNodeId,
    selectedNodeIds,
    setSelectedNodeIds
  } = useAppStore(
    useShallow((state) => ({
      apiConfigs: state.apiConfigs || [],
      setNodes: state.setNodes,
      connections: state.connections,
      setConnections: state.setConnections,
      view: state.view,
      setView: state.setView,
      selectedNodeId: state.selectedNodeId,
      setSelectedNodeId: state.setSelectedNodeId,
      selectedNodeIds: state.selectedNodeIds,
      setSelectedNodeIds: state.setSelectedNodeIds
    }))
  )

  // nodes：自定义相等性 — 仅位置变化时跳过重渲染
  const nodes = (useAppStore as any)(
    (state) => state.nodes,
    (a, b) => {
      if (a === b) return true
      if (a.length !== b.length) return false
      for (let i = 0; i < a.length; i++) {
        if (a[i] === b[i]) continue
        if (
          a[i].id !== b[i].id ||
          a[i].type !== b[i].type ||
          a[i].content !== b[i].content ||
          a[i].width !== b[i].width ||
          a[i].height !== b[i].height ||
          a[i].settings !== b[i].settings ||
          a[i].frames !== b[i].frames ||
          a[i].selectedKeyframes !== b[i].selectedKeyframes ||
          a[i].videoMeta !== b[i].videoMeta
        ) {
          return false
        }
      }
      return true
    }
  )

  // ========== 节点 & 连接状态 ==========
  const {
    nodesMap,
    nodeConnectedStatus,
    adjacentNodesCache,
    addNode,
    deleteNode,
    updateNodeSettings,
    scheduleNodeUpdate,
    scheduleMultiNodeUpdate,
    flushNodeUpdate,
    handleVideoFileUpload
  } = useNodesState(apiConfigs)

  // ========== Refs ==========
  const viewRef = useRef({ x: 0, y: 0, zoom: 1 })
  const canvasRef = useRef(null)
  const copiedNodesRef = useRef(null)
  const nodesRef = useRef(nodes)
  const selectedNodeIdRef = useRef(selectedNodeId)
  const selectedNodeIdsRef = useRef(selectedNodeIds)
  const connectionsRef = useRef(connections)

  useEffect(() => {
    viewRef.current = view
  }, [view])

  useEffect(() => {
    nodesRef.current = nodes
    selectedNodeIdRef.current = selectedNodeId
    selectedNodeIdsRef.current = selectedNodeIds
    connectionsRef.current = connections
  }, [nodes, selectedNodeId, selectedNodeIds, connections])

  // 同步 viewRef
  viewRef.current = view

  // ========== Memoized Maps ==========
  const apiConfigsMap = useMemo(() => {
    return createApiConfigsMap(apiConfigs)
  }, [apiConfigs])

  // ========== Menu Manager ==========
  const {
    contextMenu,
    setContextMenu,
    historyContextMenu,
    setHistoryContextMenu,
    nodeContextMenu,
    setNodeContextMenu,
    frameContextMenu,
    setFrameContextMenu,
    inputImageContextMenu,
    closeInputImageContextMenu
  } = useMenuManager()

  // ========== screenToWorld ==========
  const screenToWorld = useCallback(
    (screenX, screenY) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }
      const currentView = viewRef.current || view
      const zoom = currentView.zoom || 1
      const panX = currentView.x || 0
      const panY = currentView.y || 0
      return {
        x: (screenX - rect.left - panX) / zoom,
        y: (screenY - rect.top - panY) / zoom
      }
    },
    [view.zoom, view.x, view.y]
  )

  // ========== Media Handlers ==========
  const {
    handleFileUpload,
    handleAudioFileUpload,
    handleSplitGridFromUrl,
    handleAutoExtractKeyframes,
    handleSmartExtractKeyframes
  } = useMediaHandlers({
    setNodes,
    nodesMap,
    selectedNodeIdsRef,
    screenToWorld
  })

  // ========== Context Menu Actions ==========
  const {
    sendFrameToChat,
    sendFrameToCanvas,
    applyFrameToSelectedNode,
    applyHistoryToSelectedNode,
    sendHistoryToCanvas,
    sendHistoryToChat,
    sendInputImageToChat
  } = useContextMenuActions({
    setFrameContextMenu,
    frameContextMenu,
    setChatFiles: (files) => {
      if (chatFeatureRef.current?.setChatFiles) {
        chatFeatureRef.current.setChatFiles(files)
      }
    },
    setIsChatOpen: (open) => {
      if (chatFeatureRef.current?.setIsChatOpen) {
        chatFeatureRef.current.setIsChatOpen(open)
      }
    },
    screenToWorld,
    addNode,
    selectedNodeId,
    nodesMap,
    setNodes,
    historyContextMenu,
    setHistoryContextMenu,
    isVideoUrl,
    inputImageContextMenu,
    closeInputImageContextMenu
  })

  // ========== App Shortcuts ==========
  useAppShortcuts({
    nodesRef,
    selectedNodeIdRef,
    selectedNodeIdsRef,
    connectionsRef,
    copiedNodesRef,
    canvasRef,
    setNodes,
    setConnections,
    view,
    handleSaveToHistory
  })

  // ========== Canvas DragOver handler ==========
  const handleCanvasDragOver = useCallback((e) => {
    e.preventDefault()
  }, [])

  const handleGlobalDrop = useCallback((e) => {
    e.preventDefault()
  }, [])

  const value = useMemo(
    () => ({
      // 节点操作
      nodesMap,
      nodeConnectedStatus,
      adjacentNodesCache,
      addNode,
      deleteNode,
      updateNodeSettings,
      scheduleNodeUpdate,
      scheduleMultiNodeUpdate,
      flushNodeUpdate,
      handleVideoFileUpload,
      // Refs
      canvasRef,
      viewRef,
      nodesRef,
      copiedNodesRef,
      selectedNodeIdRef,
      selectedNodeIdsRef,
      connectionsRef,
      // Maps
      apiConfigsMap,
      // 坐标转换
      screenToWorld,
      // 菜单管理
      contextMenu,
      setContextMenu,
      historyContextMenu,
      setHistoryContextMenu,
      nodeContextMenu,
      setNodeContextMenu,
      frameContextMenu,
      setFrameContextMenu,
      inputImageContextMenu,
      closeInputImageContextMenu,
      // 菜单 Actions
      sendFrameToChat,
      sendFrameToCanvas,
      applyFrameToSelectedNode,
      applyHistoryToSelectedNode,
      sendHistoryToCanvas,
      sendHistoryToChat,
      sendInputImageToChat,
      // 媒体处理
      handleFileUpload,
      handleAudioFileUpload,
      handleSplitGridFromUrl,
      handleAutoExtractKeyframes,
      handleSmartExtractKeyframes,
      // Canvas 事件
      handleCanvasDragOver,
      handleGlobalDrop
    }),
    [
      nodesMap,
      nodeConnectedStatus,
      adjacentNodesCache,
      addNode,
      deleteNode,
      updateNodeSettings,
      scheduleNodeUpdate,
      scheduleMultiNodeUpdate,
      flushNodeUpdate,
      handleVideoFileUpload,
      apiConfigsMap,
      screenToWorld,
      contextMenu,
      setContextMenu,
      historyContextMenu,
      setHistoryContextMenu,
      nodeContextMenu,
      setNodeContextMenu,
      frameContextMenu,
      setFrameContextMenu,
      inputImageContextMenu,
      closeInputImageContextMenu,
      sendFrameToChat,
      sendFrameToCanvas,
      applyFrameToSelectedNode,
      applyHistoryToSelectedNode,
      sendHistoryToCanvas,
      sendHistoryToChat,
      sendInputImageToChat,
      handleFileUpload,
      handleAudioFileUpload,
      handleSplitGridFromUrl,
      handleAutoExtractKeyframes,
      handleSmartExtractKeyframes,
      handleCanvasDragOver,
      handleGlobalDrop
    ]
  )

  return (
    <CanvasOperationsContext.Provider value={value}>{children}</CanvasOperationsContext.Provider>
  )
}

export function useCanvasOperations() {
  const ctx = useContext(CanvasOperationsContext)
  if (!ctx) throw new Error('useCanvasOperations must be used within CanvasOperationsProvider')
  return ctx
}
