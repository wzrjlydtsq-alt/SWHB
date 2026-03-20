import React, { Suspense } from 'react'
import { NodeWrapper } from './NodeWrapper.jsx'
import { useCanvasContext } from '../../contexts/CanvasContext.jsx'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../../store/useAppStore.js'

import { getNodeConfig } from '../../utils/nodeRegistry.js'

export const NodeRenderer = React.memo(function NodeRenderer({ node }) {
  const contextVars = useCanvasContext()
  const zustandVars = useAppStore(
    useShallow((state) => ({
      isPerformanceMode: state.isPerformanceMode,
      setSelectedNodeId: state.setSelectedNodeId,
      selectedNodeIds: state.selectedNodeIds,
      setSelectedNodeIds: state.setSelectedNodeIds,
      setDragNodeId: state.setDragNodeId,
      setHoverTargetId: state.setHoverTargetId,
      setMousePos: state.setMousePos,
      setNodes: state.setNodes
    }))
  )
  const stableStore = useAppStore.getState()
  const allVars = {
    ...contextVars,
    ...zustandVars,
    connections: [],
    apiConfigs: stableStore.apiConfigs,
    chatApiKey: stableStore.chatApiKey,
    imageApiKey: stableStore.imageApiKey,
    videoApiKey: stableStore.videoApiKey,
    chatApiUrl: stableStore.chatApiUrl,
    imageApiUrl: stableStore.imageApiUrl,
    videoApiUrl: stableStore.videoApiUrl,
    characterLibrary: stableStore.characterLibrary
  }

  const {
    isPerformanceMode,
    deleteNode,
    setResizingNodeId,
    screenToWorld,
    setMousePos,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    nodesMap
  } = allVars

  // Derived boolean selectors
  const isSelected = useAppStore(
    (state) => state.selectedNodeId === node.id || state.selectedNodeIds.has(node.id)
  )
  const isHoverTarget = useAppStore((state) => state.hoverTargetId === node.id)
  const isDragging = useAppStore(
    (state) =>
      state.isDragging && (state.dragNodeId === node.id || state.selectedNodeIds.has(node.id))
  )

  const commonProps = {
    node,
    isSelected,
    isPerformanceMode,
    isConnected: false,
    isHoverTarget,
    isDragging: isDragging && !isPerformanceMode,
    selectedNodeId: useAppStore.getState().selectedNodeId,
    apiConfigs: allVars.apiConfigs,
    nodesMap,
    deleteNode,
    setResizingNodeId,
    screenToWorld,
    setMousePos,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    activeShot: allVars.activeShot,
    setActiveShot: allVars.setActiveShot,
    getDefaultDurationForModel: allVars.getDefaultDurationForModel,
    getDefaultDurationsForModel: allVars.getDefaultDurationsForModel,
    onDelete: deleteNode
  }

  const renderContent = () => {
    const config = getNodeConfig(node.type)
    const Component = config.component

    if (!Component) {
      return <div className="p-4 text-xs text-zinc-500">Unknown node type: {node.type}</div>
    }

    // Map node types to API key categories
    const nodeTypeToCategory = {
      'gen-image': 'Image',
      'gen-video': 'Video',
      'alchemy-node': 'Chat',
      'agent-node': 'Chat',
      'novel-input': 'Chat'
    }
    const category = nodeTypeToCategory[node.type] || 'Chat'
    const globalApiKey =
      category === 'Video'
        ? allVars.videoApiKey
        : category === 'Image'
          ? allVars.imageApiKey
          : allVars.chatApiKey
    const globalApiUrl =
      category === 'Video'
        ? allVars.videoApiUrl
        : category === 'Image'
          ? allVars.imageApiUrl
          : allVars.chatApiUrl

    const nodeComponentProps = {
      ...allVars,
      node,
      deleteNode,
      globalApiKey,
      globalApiUrl,
      connectedImages: [],
      allPreviewImages: [],
      isExtractingKeyframes: node.extractingFrames,
      handleExtractKeyframes: allVars.handleAutoExtractKeyframes
    }

    return (
      <Suspense fallback={<div className="p-4 text-xs text-zinc-400 animate-pulse">加载中...</div>}>
        <Component {...nodeComponentProps} />
      </Suspense>
    )
  }

  return <NodeWrapper {...commonProps}>{renderContent()}</NodeWrapper>
})
