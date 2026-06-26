import React, { Suspense, useRef, useMemo } from 'react'
import { NodeWrapper } from './NodeWrapper.tsx'
import { useCanvasContext } from '../../contexts/CanvasContext.tsx'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../../store/useAppStore.ts'

import { getNodeConfig } from '../../utils/nodeRegistry.ts'

// 节点类型 → API Key 分类
const NODE_TYPE_CATEGORY = {
  'gen-image': 'Image',
  'gen-video': 'Video',
  'agent-node': 'Chat',
  'novel-input': 'Chat',
  'director-node': 'Chat',
  'director-stage': 'Chat'
}

export const NodeRenderer = React.memo(function NodeRenderer({ node }: any) {
  const contextVars = useCanvasContext()

  // 仅订阅 setter 函数（稳定引用，不触发重渲染）和少量需要触发渲染的状态
  const zustandVars = useAppStore(
    useShallow((state) => ({
      isPerformanceMode: state.isPerformanceMode,
      setSelectedNodeId: state.setSelectedNodeId,
      setSelectedNodeIds: state.setSelectedNodeIds,
      setDragNodeId: state.setDragNodeId,
      setHoverTargetId: state.setHoverTargetId,
      setMousePos: state.setMousePos,
      setNodes: state.setNodes
    }))
  )

  // 低频变化的 store 数据：用 useShallow selector 代替 getState()
  // 这样当 apiConfigs 等变化时能正确触发重渲染
  const storeData = useAppStore(
    useShallow((state) => ({
      apiConfigs: state.apiConfigs || [],
      globalApiKey: state.globalApiKey,
      globalApiUrl: state.globalApiUrl,
      characterLibrary: state.characterLibrary
    }))
  )

  // 布尔选择器 — 精确订阅，只在值变化时触发渲染
  const isSelected = useAppStore(
    (state) => state.selectedNodeId === node.id || state.selectedNodeIds.has(node.id)
  )
  const isHoverTarget = useAppStore((state) => state.hoverTargetId === node.id)
  const isDragging = useAppStore(
    (state) =>
      state.isDragging && (state.dragNodeId === node.id || state.selectedNodeIds.has(node.id))
  )

  // 从 Context 解构（稳定引用）
  const {
    deleteNode,
    setResizingNodeId,
    screenToWorld,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    nodesMap,
    activeShot,
    setActiveShot,
    getDefaultDurationForModel,
    getDefaultDurationsForModel,
    handleAutoExtractKeyframes
  } = contextVars

  // 稳定化 commonProps — 使用 useMemo 避免每次渲染创建新对象
  const commonProps = useMemo(
    () => ({
      node,
      isSelected,
      isPerformanceMode: zustandVars.isPerformanceMode,
      isConnected: false,
      isHoverTarget,
      isDragging: isDragging && !zustandVars.isPerformanceMode,
      apiConfigs: storeData.apiConfigs || [],
      nodesMap,
      deleteNode,
      setResizingNodeId,
      screenToWorld,
      setMousePos: zustandVars.setMousePos,
      handleDrop,
      handleDragOver,
      handleDragLeave,
      activeShot,
      setActiveShot,
      getDefaultDurationForModel,
      getDefaultDurationsForModel,
      onDelete: deleteNode
    }),
    [
      node,
      isSelected,
      zustandVars.isPerformanceMode,
      isHoverTarget,
      isDragging,
      storeData.apiConfigs,
      nodesMap,
      deleteNode,
      setResizingNodeId,
      screenToWorld,
      zustandVars.setMousePos,
      handleDrop,
      handleDragOver,
      handleDragLeave,
      activeShot,
      setActiveShot,
      getDefaultDurationForModel,
      getDefaultDurationsForModel
    ]
  )

  // 稳定化 nodeComponentProps — 只挑选节点组件真正需要的字段，避免 context 无关变化触发重渲染
  const nodeComponentProps = useMemo(() => {
    const globalApiKey = storeData.globalApiKey
    const globalApiUrl = storeData.globalApiUrl

    return {
      // 从 context 中精确挑选（这些是稳定的 useCallback 引用）
      deleteNode,
      setResizingNodeId,
      screenToWorld,
      handleDrop,
      handleDragOver,
      handleDragLeave,
      nodesMap,
      activeShot,
      setActiveShot,
      getDefaultDurationForModel,
      getDefaultDurationsForModel,
      handleAutoExtractKeyframes: handleAutoExtractKeyframes,
      updateNodeSettings: contextVars.updateNodeSettings,
      startGeneration: contextVars.startGeneration,
      getStatusColor: contextVars.getStatusColor,
      getConnectedImageForInput: contextVars.getConnectedImageForInput,
      activeDropdown: contextVars.activeDropdown,
      setActiveDropdown: contextVars.setActiveDropdown,
      getConnectedTextNodes: contextVars.getConnectedTextNodes,
      getConnectedAudioNodes: contextVars.getConnectedAudioNodes,
      setLightboxItem: contextVars.setLightboxItem,
      // 从 zustand 中挑选
      ...zustandVars,
      connections: [],
      apiConfigs: storeData.apiConfigs || [],
      apiConfigsMap: contextVars.apiConfigsMap,
      characterLibrary: storeData.characterLibrary,
      node,
      globalApiKey,
      globalApiUrl,
      connectedImages: [],
      allPreviewImages: [],
      isExtractingKeyframes: node.extractingFrames,
      handleExtractKeyframes: handleAutoExtractKeyframes
    }
  }, [
    node,
    deleteNode,
    setResizingNodeId,
    screenToWorld,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    nodesMap,
    activeShot,
    setActiveShot,
    getDefaultDurationForModel,
    getDefaultDurationsForModel,
    handleAutoExtractKeyframes,
    contextVars.updateNodeSettings,
    contextVars.startGeneration,
    contextVars.getStatusColor,
    contextVars.getConnectedImageForInput,
    contextVars.activeDropdown,
    contextVars.setActiveDropdown,
    contextVars.getConnectedTextNodes,
    contextVars.getConnectedAudioNodes,
    contextVars.setLightboxItem,
    contextVars.apiConfigsMap,
    zustandVars,
    storeData,
  ])

  const config = getNodeConfig(node.type)
  const Component = config.component

  if (!Component) {
    return (
      <NodeWrapper {...commonProps}>
        <div className="p-4 text-xs text-zinc-500">Unknown node type: {node.type}</div>
      </NodeWrapper>
    )
  }

  return (
    <NodeWrapper {...commonProps}>
      <Suspense fallback={<div className="p-4 text-xs text-zinc-400 animate-pulse">加载中...</div>}>
        <Component {...nodeComponentProps} />
      </Suspense>
    </NodeWrapper>
  )
})
