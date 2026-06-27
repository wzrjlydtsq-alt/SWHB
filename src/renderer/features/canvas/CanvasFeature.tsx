import { useRef, useState, useMemo, useCallback, useEffect } from 'react'

import { useCanvasInteractions } from '../../hooks/useCanvasInteractions.ts'
import { useCanvasDragLogic } from '../../hooks/useCanvasDragLogic.ts'

import { useViewportOptimization } from '../../hooks/useViewportOptimization.ts'
import { useGlobalDragAndDrop } from '../../hooks/useGlobalDragAndDrop.ts'
import { useWorkflowExecutor } from '../../hooks/useWorkflowExecutor.ts'
import { useGenerationManager } from '../../hooks/useGenerationManager.ts'

import {
  DEFAULT_GROUP_API_URLS,
  VIRTUAL_CANVAS_WIDTH,
  VIRTUAL_CANVAS_HEIGHT
} from '../../utils/constants.ts'
import { isVideoUrl } from '../../utils/projectUtils.ts'
import { registerStartGeneration } from '../../utils/canvasTools.ts'

import { ReactFlowCanvas } from '../../components/canvas/ReactFlowCanvas.tsx'
import { Lightbox } from '../../components/ui/Lightbox.tsx'
import { CanvasContext } from '../../contexts/CanvasContext.tsx'
import { useAppStore } from '../../store/useAppStore.ts'

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
  setHistory,
  activeDropdown,
  characterReferenceBarExpanded,
  setCharacterReferenceBarExpanded,
  setCharactersOpen,
  setResizingNodeId,
  chatFeatureRef
}) {
  // ========== canvas store 鐘舵€?==========
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
  const generationApiRuntime = useAppStore(
    useShallow((state) => ({
      chatApiKey: state.groupApiKeys?.Chat || state.globalApiKey || '',
      chatApiUrl:
        state.groupApiUrls?.Chat || state.globalApiUrl || DEFAULT_GROUP_API_URLS.Chat,
      imageApiKey: state.groupApiKeys?.Image || state.globalApiKey || '',
      imageApiUrl:
        state.groupApiUrls?.Image || state.globalApiUrl || DEFAULT_GROUP_API_URLS.Image,
      videoApiKey: state.groupApiKeys?.Video || state.globalApiKey || '',
      videoApiUrl:
        state.groupApiUrls?.Video || state.globalApiUrl || DEFAULT_GROUP_API_URLS.Video,
      setSettingsOpen: state.setSettingsOpen
    }))
  )

  // 浣跨敤 ref 鍖呰楂橀鍙樺寲鐨勫€硷紝閬垮厤瀹冧滑浣滀负 canvasContextValue 鐨?useMemo
  // 渚濊禆瀵艰嚧 Context value 棰戠箒閲嶅缓锛岃繘鑰岃Е鍙戞墍鏈夎妭鐐圭粍浠堕噸娓叉煋
  const activeDropdownRef = useRef(activeDropdown)
  activeDropdownRef.current = activeDropdown
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

  // Connection cache removed 鈥?connections system deprecated
  const connectionsByNode = useMemo(() => new Map(), [])
  const getConnectedInputImages = () => []
  const getConnectedImageForInput = () => null
  const getConnectedTextNodes = () => []
  const getConnectedAudioNodes = () => []

  // ========== Generation ==========
  const updateShot = useCallback(
    (nodeId, shotId, updates) => {
      const node = useAppStore.getState().nodesMap.get(nodeId)
      if (!node || node.type !== 'storyboard-node') return
      const updatedShots = (node.settings?.shots || []).map((shot) =>
        shot.id === shotId ? { ...shot, ...updates } : shot
      )
      updateNodeSettings(nodeId, { shots: updatedShots })
    },
    [updateNodeSettings]
  )

  const { updatePreviewFromTask } = useWorkflowExecutor()

  const { startGeneration } = useGenerationManager({
    storyboardTaskMapRef,
    updateShot,
    updatePreviewFromTask,
    chatApiKey: generationApiRuntime.chatApiKey,
    chatApiUrl: generationApiRuntime.chatApiUrl,
    imageApiKey: generationApiRuntime.imageApiKey,
    imageApiUrl: generationApiRuntime.imageApiUrl,
    videoApiKey: generationApiRuntime.videoApiKey,
    videoApiUrl: generationApiRuntime.videoApiUrl,
    apiConfigsMap,
    setSettingsOpen: generationApiRuntime.setSettingsOpen,
    getConnectedImageForInput
  })

  // AI 鍓┚锛氭敞鍐?startGeneration 鍒板伐鍏峰眰
  useEffect(() => {
    registerStartGeneration(startGeneration)
  }, [startGeneration])

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

  const handleInputImageRightClick = useCallback((e, nodeId) => {
    e.preventDefault()
    e.stopPropagation()
    const node = useAppStore.getState().nodesMap.get(nodeId)
    if (!node || !node.content) return
    // use the parent's inputImageContextMenu setter if available via context
  }, [])

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
      get history() {
        return useAppStore.getState().history
      },
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
      get activeDropdown() {
        return activeDropdownRef.current
      },
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
      // history 鍜?activeDropdown 閫氳繃 getter 浠?ref 璇诲彇锛?      // 涓嶅啀浣滀负 useMemo 渚濊禆锛岄伩鍏嶉绻?Context 閲嶅缓
      getStatusColor,
      characterReferenceBarExpanded,
      setCharacterReferenceBarExpanded,
      setCharactersOpen,
      getConnectedTextNodes,
      getConnectedAudioNodes,
      getConnectedInputImages,
      startGeneration,
      setNodeContextMenu,
      nodeContextMenu,
      frameContextMenu,
      setFrameContextMenu
    ]
  )

  return (
    <div className="flex-1 relative overflow-hidden flex" data-onboarding="canvas">
      <CanvasContext.Provider value={canvasContextValue}>
        <ReactFlowCanvas />
      </CanvasContext.Provider>
      {/* 鐢诲竷瑙嗛鐏 */}
      <Lightbox item={lightboxItem} onClose={closeLightbox} onNavigate={() => {}} />
    </div>
  )
}
