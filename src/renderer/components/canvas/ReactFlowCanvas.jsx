import React, { useCallback, useRef } from 'react'
import {
  ReactFlow,
  MiniMap,
  Background,
  ReactFlowProvider,
  BackgroundVariant,
  useReactFlow
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useAppStore } from '../../store/useAppStore'
import { NodeRenderer } from './NodeRenderer'
import { useCanvasContext } from '../../contexts/CanvasContext'
import { NodeRegistry } from '../../utils/nodeRegistry'

import { getImageDimensions } from '../../utils/fileHelpers'
import { SelectionToolbar } from './SelectionToolbar'

const PAN_ON_DRAG_CONFIG = [1, 2]



// 使用 store 的 nodesMap 进行 O(1) 查找，避免每个节点订阅整个 nodes 数组
const ReactFlowCustomNode = React.memo(function ReactFlowCustomNode({ id }) {
  const node = useAppStore(useCallback((state) => state.nodesMap.get(id), [id]))
  if (!node) return null

  return (
    <div
      className="react-flow-node-bridge"
      style={{
        width: node.width,
        height: node.height,
        overflow: 'visible'
      }}
    >
      <NodeRenderer node={node} />
    </div>
  )
})

const nodeTypes = {
  customNode: ReactFlowCustomNode
}
Object.keys(NodeRegistry).forEach((type) => {
  nodeTypes[type] = ReactFlowCustomNode
})

function ReactFlowCanvasInner() {
  const parentContext = useCanvasContext()
  const { handleCanvasContextMenu, handleBackgroundClick, canvasRef } = parentContext

  const globalNodes = useAppStore((state) => state.nodes)
  const onNodesChange = useAppStore((state) => state.onNodesChange)
  const setView = useAppStore((state) => state.setView)
  const theme = useAppStore((state) => state.theme)
  const themeColor = useAppStore((state) => state.themeColor)

  const isDragging = useAppStore((state) => state.isDragging)

  const handleNodesDelete = useCallback((nodesToDelete) => {
    if (window.dbAPI?.nodes?.delete) {
      nodesToDelete.forEach((n) => {
        window.dbAPI.nodes.delete(n.id).catch(console.error)
      })
    }
  }, [])

  const handleSelectionChange = useCallback(({ nodes }) => {
    const state = useAppStore.getState()
    const ids = new Set(nodes.map((n) => n.id))

    // Ignore updates that don't actually change selection to prevent infinite loops
    const currentSelectedNodeIds = state.selectedNodeIds
    if (ids.size === currentSelectedNodeIds.size) {
      let same = true
      for (let id of ids) {
        if (!currentSelectedNodeIds.has(id)) {
          same = false
          break
        }
      }
      if (same) return
    }

    state.setSelectedNodeIds(ids)
    state.setSelectedNodeId(nodes.length === 1 ? nodes[0].id : null)
  }, [])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(async (e) => {
    e.preventDefault()
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return

    const files = Array.from(e.dataTransfer.files)
    const state = useAppStore.getState()

    // 独立处理 JSON 直接导入逻辑（仅允许传入单个）
    const jsonFile = files.find((f) => f.name.endsWith('.json'))
    if (jsonFile) {
      state.setProgressState({
        visible: true,
        progress: 0,
        status: '解析工作流...',
        type: 'import'
      })
      try {
        const text = await jsonFile.text()
        const projectData = JSON.parse(text)

        if (projectData.nodes) state.setNodes(projectData.nodes)
        if (projectData.connections) state.setConnections(projectData.connections)
        if (projectData.view) state.setView(projectData.view)
        if (projectData.projectName) state.setProjectName(projectData.projectName)

        state.setProgressState({ visible: false })
      } catch (err) {
        console.error('工作流 JSON 解析失败:', err)
        state.setProgressState({ visible: false })
        alert(`工作流加载失败: ${err.message}`)
      }
      return
    }

    // 过滤可用多媒体文件
    const validMediaFiles = files.filter((f) => {
      const isVideo = f.type.startsWith('video/')
      const isImage = f.type.startsWith('image/')
      const isAudio =
        f.type.startsWith('audio/') || f.name.endsWith('.mp3') || f.name.endsWith('.wav')
      return isVideo || isImage || isAudio
    })

    if (validMediaFiles.length === 0) {
      alert('仅支持图片、视频、音频或 .json 工作流文件')
      return
    }

    // 获取基础落点
    const reactFlowBounds = e.currentTarget.getBoundingClientRect()
    const view = state.view
    const baseX = (e.clientX - reactFlowBounds.left - view.x) / view.zoom
    const baseY = (e.clientY - reactFlowBounds.top - view.y) / view.zoom

    const newNodes = []

    // 遍历每一个拖入的文件提取节点
    for (let i = 0; i < validMediaFiles.length; i++) {
      const file = validMediaFiles[i]
      const isVideo = file.type.startsWith('video/')
      const isImage = file.type.startsWith('image/')
      const isAudio =
        file.type.startsWith('audio/') || file.name.endsWith('.mp3') || file.name.endsWith('.wav')
      const type = isVideo ? 'video-input' : isImage ? 'input-image' : 'audio-input'

      const offsetX = baseX + i * 50
      const offsetY = baseY + i * 30

      // 视频文件：直接用 blob URL 显示，后台异步保存缓存（避免大文件 base64 IPC 超时）
      if (isVideo) {
        const blobUrl = URL.createObjectURL(file)
        const newNode = {
          id: `node_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type,
          position: { x: offsetX, y: offsetY },
          data: {},
          content: blobUrl,
          videoFileName: file.name,
          width: 480,
          height: 360,
          dimensions: { w: 480, h: 360 }
        }
        newNodes.push(newNode)
        continue
      }

      await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = async (event) => {
          const base64Content = event.target.result

          let ext = '.jpg'
          let cacheType = 'image'

          if (isAudio) {
            ext = file.name ? '.' + file.name.split('.').pop() : '.mp3'
            cacheType = 'audio'
          } else {
            ext = file.name ? '.' + file.name.split('.').pop() : '.jpg'
          }

          const response = await window.api.invoke('cache:save-cache', {
            id: `drop_${Date.now()}_${i}`,
            content: base64Content,
            category: 'user_upload',
            ext: ext,
            type: cacheType
          })

          if (response?.success && response.url) {
            const finalUrl = response.url
            let finalW = type === 'audio-input' ? 320 : 300
            let finalH = type === 'audio-input' ? 150 : 300

            if (type === 'input-image') {
              try {
                const dims = await getImageDimensions(finalUrl)
                if (dims && dims.w > 0) {
                  const maxDim = 400
                  let w = dims.w
                  let h = dims.h

                  if (w > maxDim || h > maxDim) {
                    if (w > h) {
                      h = Math.round(h * (maxDim / w))
                      w = maxDim
                    } else {
                      w = Math.round(w * (maxDim / h))
                      h = maxDim
                    }
                  }
                  finalW = w
                  finalH = h
                }
              } catch (err) {
                console.error('Failed to get dimensions:', err)
              }
            }

            const newNode = {
              id: `node_${Date.now()}_${Math.random().toString(36).substring(7)}`,
              type,
              position: { x: offsetX, y: offsetY },
              data: {},
              content: finalUrl,
              fileName: isAudio ? file.name : undefined,
              filePath: isAudio ? response.path || finalUrl : undefined,
              width: finalW,
              height: finalH,
              dimensions: { w: finalW, h: finalH }
            }
            newNodes.push(newNode)
          } else {
            console.error(`处理文件 ${file.name} 失败`)
          }
          resolve()
        }
        reader.onerror = () => resolve()
        reader.readAsDataURL(file)
      })
    }

    if (newNodes.length > 0) {
      state.setNodes([...state.nodes, ...newNodes])
    }
  }, [])

  // 节流 setView：ReactFlow 内部已平滑渲染视口，store 只需低频同步
  const moveThrottleRef = useRef(0)
  const handleMove = useCallback(
    (e, viewport) => {
      const now = performance.now()
      if (now - moveThrottleRef.current < 32) return // ~30fps 对 store 足够
      moveThrottleRef.current = now
      setView(viewport)
    },
    [setView]
  )

  const { screenToFlowPosition } = useReactFlow()

  return (
    <div
      ref={canvasRef}
      className="bg-[var(--bg-base)]"
      style={{ width: '100vw', height: '100vh', position: 'relative' }}
      onContextMenu={(e) => {
        if (e.target.closest('.react-flow__node') || e.target.closest('.react-flow__edge')) {
          return
        }

        e.preventDefault()
        let preciseWorldX, preciseWorldY

        try {
          if (screenToFlowPosition) {
            const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
            if (pos) {
              preciseWorldX = pos.x
              preciseWorldY = pos.y
            }
          }
        } catch (err) {
          console.error('screenToFlowPosition error', err)
        }

        if (preciseWorldX !== undefined && preciseWorldY !== undefined) {
          e.customWorldX = preciseWorldX
          e.customWorldY = preciseWorldY
        }

        handleCanvasContextMenu(e)
      }}
      onClick={handleBackgroundClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={globalNodes}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodesDelete={handleNodesDelete}
        onSelectionChange={handleSelectionChange}
        nodesDraggable={true}
        panOnDrag={PAN_ON_DRAG_CONFIG}
        selectionOnDrag={true}
        selectionMode="partial"
        onMove={handleMove}
        zoomOnScroll={true}
        fitView
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={2}
          color={theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}
        />
        {/* Controls 已隐藏 */}
        {!isDragging && (
          <MiniMap
            zoomable
            pannable
            nodeColor={themeColor || '#3b82f6'}
            maskColor="rgba(0, 0, 0, 0.5)"
            style={{ backgroundColor: 'var(--bg-secondary)', width: 120, height: 80 }}
          />
        )}
      </ReactFlow>
      <SelectionToolbar />
    </div>
  )
}

export function ReactFlowCanvas() {
  return (
    <ReactFlowProvider>
      <ReactFlowCanvasInner />
    </ReactFlowProvider>
  )
}
