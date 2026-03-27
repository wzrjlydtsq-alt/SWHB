import { useRef, useState, useMemo, useCallback } from 'react'

import { useCanvasInteractions } from '../../hooks/useCanvasInteractions.js'
import { useCanvasDragLogic } from '../../hooks/useCanvasDragLogic.js'

import { useViewportOptimization } from '../../hooks/useViewportOptimization.js'
import { useGlobalDragAndDrop } from '../../hooks/useGlobalDragAndDrop.js'
import { useWorkflowExecutor } from '../../hooks/useWorkflowExecutor.js'
import { useGenerationManager } from '../../hooks/useGenerationManager.js'

import { VIRTUAL_CANVAS_WIDTH, VIRTUAL_CANVAS_HEIGHT } from '../../utils/constants.js'
import { isVideoUrl } from '../../utils/projectUtils.js'

import { ReactFlowCanvas } from '../../components/canvas/ReactFlowCanvas.jsx'
import { Lightbox } from '../../components/ui/Lightbox.jsx'
import { CanvasContext } from '../../contexts/CanvasContext.jsx'
import { useAppStore } from '../../store/useAppStore.js'

import { useShallow } from 'zustand/react/shallow'

export function CanvasFeature({
  canvasRef,
  nodesRef,
  selectedNodeIdsRef,
  connectionsRef,
  view,
  setView,
  nodesMap,
  nodes,
  setNodes,
  connections,
  setConnections,
  adjacentNodesCache,
  nodeConnectedStatus,
  scheduleNodeUpdate,
  scheduleMultiNodeUpdate,
  flushNodeUpdate,
  addNode,
  deleteNode,
  updateNodeSettings,
  setSelectedNodeId,
  setSelectedNodeIds,
  apiConfigsMap,
  screenToWorld,
  handleFileUpload,
  handleAudioFileUpload,
  handleVideoFileUpload,
  handleAutoExtractKeyframes,
  handleSmartExtractKeyframes,
  handleCanvasDragOver,
  setContextMenu,
  setActiveDropdown,
  setHistoryContextMenu,
  setNodeContextMenu,
  nodeContextMenu,
  frameContextMenu,
  setFrameContextMenu,
  history,
  setHistory,
  activeDropdown,
  characterReferenceBarExpanded,
  setCharacterReferenceBarExpanded,
  setCharactersOpen,
  historyMap,
  setResizingNodeId,
  chatFeatureRef
}) {
  // ========== canvas store 状态 ==========
  const {
    dragNodeId,
    connectingSource,
    setConnectingSource,
    connectingTarget,
    setConnectingTarget,
    connectingInputType,
    setConnectingInputType,
    isPanning,
    setIsPanning,
    isDragging,
    setIsDragging,
    resizingNodeId,
    isSelecting,
    setIsSelecting,
    setSelectionBox
  } = useAppStore(
    useShallow((state) => ({
      dragNodeId: state.dragNodeId,
      connectingSource: state.connectingSource,
      setConnectingSource: state.setConnectingSource,
      connectingTarget: state.connectingTarget,
      setConnectingTarget: state.setConnectingTarget,
      connectingInputType: state.connectingInputType,
      setConnectingInputType: state.setConnectingInputType,
      isPanning: state.isPanning,
      setIsPanning: state.setIsPanning,
      isDragging: state.isDragging,
      setIsDragging: state.setIsDragging,
      resizingNodeId: state.resizingNodeId,
      isSelecting: state.isSelecting,
      setIsSelecting: state.setIsSelecting,
      setSelectionBox: state.setSelectionBox
    }))
  )

  const isSelectingRef = useRef(isSelecting)
  const isPanningRef = useRef(isPanning)
  const [activeShot, setActiveShot] = useState({ nodeId: null, shotId: null })
  const lightboxItem = useAppStore((s) => s.lightboxItem)
  const setLightboxItem = useAppStore((s) => s.setLightboxItem)
  const closeLightbox = useAppStore((s) => s.closeLightbox)
  const storyboardTaskMapRef = useRef(new Map())

  // ========== Canvas Interactions ==========
  useCanvasInteractions({ canvasRef, setView })

  const { handleMouseMove, handleMouseUp, lastMousePos } = useCanvasDragLogic({
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
  })

  useViewportOptimization({ nodes, view, canvasRef })

  // Connection cache removed — connections system deprecated
  const connectionsByNode = new Map()
  const getConnectedInputImages = () => []
  const getConnectedImageForInput = () => null
  const getConnectedTextNodes = () => []
  const getConnectedAudioNodes = () => []

  // ========== Generation ==========
  const updateShot = useCallback(
    (nodeId, shotId, updates) => {
      const node = nodesMap.get(nodeId)
      if (!node || node.type !== 'storyboard-node') return
      const updatedShots = (node.settings?.shots || []).map((shot) =>
        shot.id === shotId ? { ...shot, ...updates } : shot
      )
      updateNodeSettings(nodeId, { shots: updatedShots })
    },
    [nodesMap, updateNodeSettings]
  )

  const { updatePreviewFromTask } = useWorkflowExecutor({
    historyMap
  })

  const { startGeneration } = useGenerationManager({
    nodes,
    setNodes,
    connections,
    nodesMap,
    setHistory,
    historyMap,
    storyboardTaskMapRef,
    updateShot,
    updatePreviewFromTask,
    chatApiKey: useAppStore.getState().globalApiKey,
    chatApiUrl: useAppStore.getState().globalApiUrl,
    imageApiKey: useAppStore.getState().globalApiKey,
    imageApiUrl: useAppStore.getState().globalApiUrl,
    videoApiKey: useAppStore.getState().globalApiKey,
    videoApiUrl: useAppStore.getState().globalApiUrl,
    apiConfigsMap,
    setSettingsOpen: useAppStore.getState().setSettingsOpen,
    getConnectedImageForInput
  })

  const getStatusColor = useCallback((status) => {
    if (status === 'ok' || status === 'connected') return '#22c55e'
    if (status === 'error' || status === 'failed') return '#ef4444'
    return '#a1a1aa'
  }, [])

  // ========== Duration helpers ==========
  const getDefaultDurationForModel = useCallback((modelId) => {
    if (!modelId) return '5s'
    if (modelId === 'sora-2-pro') return '15s'
    if (modelId.includes('sora-2') || modelId === 'sora-2') return '15s'
    if (modelId.includes('veo') || modelId === 'google-veo3') return '8s'
    if (modelId.includes('grok') || modelId === 'grok-3') return '8s'
    return '5s'
  }, [])

  const getDefaultDurationsForModel = useCallback((modelId) => {
    if (!modelId) return ['5s', '10s', '8s']
    if (modelId === 'sora-2-pro') return ['15s', '25s']
    if (modelId.includes('sora-2') || modelId === 'sora-2') return ['5s', '10s', '15s']
    if (modelId.includes('veo') || modelId === 'google-veo3') return ['8s']
    if (modelId.includes('grok') || modelId === 'grok-3') return ['8s', '5s']
    return ['5s', '10s', '8s']
  }, [])

  // ========== Connection MouseUp ==========
  const _handleMouseUp = useCallback(
    (targetNodeId, e, targetInputType) => {
      if (connectingSource && targetNodeId && connectingSource !== targetNodeId) {
        setConnections((prev) => {
          const exists = prev.find(
            (c) =>
              c.from === connectingSource &&
              c.to === targetNodeId &&
              c.inputType === (targetInputType || 'default')
          )
          if (exists) return prev
          return [
            ...prev,
            {
              id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              from: connectingSource,
              to: targetNodeId,
              inputType: targetInputType || 'default'
            }
          ]
        })
      } else if (connectingTarget && targetNodeId && connectingTarget !== targetNodeId) {
        setConnections((prev) => {
          const exists = prev.find(
            (c) =>
              c.from === targetNodeId &&
              c.to === connectingTarget &&
              c.inputType === (connectingInputType || 'default')
          )
          if (exists) return prev
          return [
            ...prev,
            {
              id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              from: targetNodeId,
              to: connectingTarget,
              inputType: connectingInputType || 'default'
            }
          ]
        })
      }
      handleMouseUp(flushNodeUpdate)
    },
    [
      connectingSource,
      connectingTarget,
      connectingInputType,
      setConnections,
      handleMouseUp,
      flushNodeUpdate
    ]
  )

  // ========== Mouse & Context ==========
  const handleMouseDown = useCallback(
    (e) => {
      if (e.button === 0 || e.button === 1) {
        if (e.currentTarget.id === 'canvas-bg') {
          const selection = window.getSelection()
          if (selection && selection.toString().length > 0) return

          const target = e.target
          if (
            target &&
            (target.tagName === 'INPUT' ||
              target.tagName === 'TEXTAREA' ||
              target.tagName === 'SELECT' ||
              target.tagName === 'BUTTON' ||
              target.isContentEditable ||
              target.closest('input, textarea, select, button, [contenteditable="true"]'))
          ) {
            return
          }

          if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            setIsSelecting(true)
            isSelectingRef.current = true
            setIsPanning(false)
            const rect = canvasRef.current?.getBoundingClientRect()
            const startX = e.clientX - (rect?.left || 0)
            const startY = e.clientY - (rect?.top || 0)
            setSelectionBox({ startX, startY, endX: startX, endY: startY })
            setSelectedNodeIds(new Set())
            setSelectedNodeId(null)
            return
          }

          if (!isSelectingRef.current) {
            setIsPanning(true)
            isPanningRef.current = true
            setIsDragging(false)
            lastMousePos.current = { x: e.clientX, y: e.clientY }
          }
        }
      }
    },
    [
      canvasRef,
      setIsSelecting,
      setIsPanning,
      setIsDragging,
      setSelectionBox,
      setSelectedNodeIds,
      setSelectedNodeId,
      lastMousePos
    ]
  )

  useGlobalDragAndDrop({
    isPanning,
    isPanningRef,
    isDragging,
    dragNodeId,
    resizingNodeId,
    isSelecting,
    isSelectingRef,
    connectingSource,
    connectingTarget,
    handleMouseMove,
    handleMouseUp,
    canvasRef
  })

  const handleBackgroundClick = useCallback(
    (e) => {
      if (connectingSource) {
        const world = screenToWorld(e.clientX, e.clientY)
        setContextMenu({
          visible: true,
          x: e.clientX,
          y: e.clientY,
          worldX: world.x,
          worldY: world.y,
          sourceNodeId: connectingSource
        })
        setConnectingSource(null)
      } else if (connectingTarget) {
        const world = screenToWorld(e.clientX, e.clientY)
        setContextMenu({
          visible: true,
          x: e.clientX,
          y: e.clientY,
          worldX: world.x,
          worldY: world.y,
          targetNodeId: connectingTarget,
          inputType: connectingInputType
        })
        setConnectingTarget(null)
        setConnectingInputType(null)
      }
    },
    [
      connectingSource,
      connectingTarget,
      connectingInputType,
      screenToWorld,
      setContextMenu,
      setConnectingSource,
      setConnectingTarget,
      setConnectingInputType
    ]
  )

  const handleCanvasContextMenu = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      let worldX = e.customWorldX
      let worldY = e.customWorldY
      if (worldX === undefined || worldY === undefined) {
        const world = screenToWorld(e.clientX, e.clientY)
        worldX = world.x
        worldY = world.y
      }
      setContextMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        worldX,
        worldY,
        sourceNodeId: undefined
      })
    },
    [screenToWorld, setContextMenu]
  )

  const disconnectConnection = useCallback(
    (connectionId) => {
      setConnections((prev) => prev.filter((conn) => conn.id !== connectionId))
    },
    [setConnections]
  )

  const handleInputImageRightClick = useCallback(
    (e, nodeId) => {
      e.preventDefault()
      e.stopPropagation()
      const node = nodesMap.get(nodeId)
      if (!node || !node.content) return
      // use the parent's inputImageContextMenu setter if available via context
    },
    [nodesMap]
  )

  // ========== Canvas Context value ==========
  const canvasContextValue = useMemo(
    () => ({
      canvasRef,
      VIRTUAL_CANVAS_WIDTH,
      VIRTUAL_CANVAS_HEIGHT,
      handleMouseDown,
      handleBackgroundClick,
      handleCanvasContextMenu,
      get nodesMap() {
        return useAppStore.getState().nodesMap
      },
      connectionsByNode,
      apiConfigsMap,
      disconnectConnection,
      adjacentNodesCache,
      nodeConnectedStatus,
      setActiveDropdown,
      handleNodeMouseUp: _handleMouseUp,
      setLightboxItem,
      deleteNode,
      setResizingNodeId,
      screenToWorld,
      handleDrop: handleFileUpload,
      handleDragOver: handleCanvasDragOver,

      handleInputImageRightClick,
      handleFileUpload,
      handleAudioFileUpload,
      handleVideoDrop: handleFileUpload,
      handleVideoFileUpload,
      handleAutoExtractKeyframes,
      handleSmartExtractKeyframes,
      updateNodeSettings,
      getConnectedImageForInput,
      setChatFiles: (files) => {
        if (chatFeatureRef?.current?.setChatFiles) {
          chatFeatureRef.current.setChatFiles(files)
        }
      },
      setIsChatOpen: (open) => {
        if (chatFeatureRef?.current?.setIsChatOpen) {
          chatFeatureRef.current.setIsChatOpen(open)
        }
      },
      addNode,

      isVideoUrl,
      updateShot,
      getDefaultDurationForModel,
      getDefaultDurationsForModel,
      history,
      activeShot,
      setActiveShot,
      getStatusColor,
      characterReferenceBarExpanded,
      setCharacterReferenceBarExpanded,
      setCharactersOpen,
      getConnectedTextNodes,
      getConnectedAudioNodes,
      getConnectedInputImages,
      startGeneration,
      activeDropdown,
      onDisconnectConnection: disconnectConnection,
      setHistoryContextMenu,
      setNodeContextMenu,
      nodeContextMenu,
      frameContextMenu,
      setFrameContextMenu
    }),
    [
      canvasRef,
      handleMouseDown,
      handleBackgroundClick,
      handleCanvasContextMenu,
      connectionsByNode,
      apiConfigsMap,
      disconnectConnection,
      adjacentNodesCache,
      nodeConnectedStatus,
      setActiveDropdown,
      _handleMouseUp,
      deleteNode,
      setResizingNodeId,
      screenToWorld,
      handleCanvasDragOver,
      handleInputImageRightClick,
      handleFileUpload,
      handleVideoFileUpload,
      handleAutoExtractKeyframes,
      handleSmartExtractKeyframes,
      updateNodeSettings,
      getConnectedImageForInput,
      addNode,
      updateShot,
      getDefaultDurationForModel,
      getDefaultDurationsForModel,
      history,
      getStatusColor,
      characterReferenceBarExpanded,
      setCharacterReferenceBarExpanded,
      setCharactersOpen,
      getConnectedTextNodes,
      getConnectedAudioNodes,
      getConnectedInputImages,
      startGeneration,
      activeDropdown,
      setHistoryContextMenu,
      setNodeContextMenu,
      nodeContextMenu,
      frameContextMenu,
      setFrameContextMenu
    ]
  )

  return (
    <div className="flex-1 relative overflow-hidden flex">
      <CanvasContext.Provider value={canvasContextValue}>
        <ReactFlowCanvas />
      </CanvasContext.Provider>
      {/* 画布视频灯箱 */}
      <Lightbox item={lightboxItem} onClose={closeLightbox} />
    </div>
  )
}
