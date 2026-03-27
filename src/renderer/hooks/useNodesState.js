import { useMemo, useRef, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useAppStore } from '../store/useAppStore.js'
import { getVideoMetadata } from '../utils/fileHelpers.js'

// A proper map-based debouncer to save independent nodes without stepping on each other
const debouncedSaveNodeMap = new Map()
const customDebouncedSaveNode = (nodeData) => {
  if (debouncedSaveNodeMap.has(nodeData.id)) {
    clearTimeout(debouncedSaveNodeMap.get(nodeData.id))
  }
  const timer = setTimeout(() => {
    if (window.dbAPI?.nodes?.save) {
      window.dbAPI.nodes.save(nodeData).catch(console.error)
    }
    debouncedSaveNodeMap.delete(nodeData.id)
  }, 150)
  debouncedSaveNodeMap.set(nodeData.id, timer)
}

// 序列化节点为 SQLite 保存格式（完整字段）
const serializeNodeForSave = (node) => ({
  id: node.id,
  type: node.type,
  content: typeof node.content === 'string' ? node.content : JSON.stringify(node.content),
  x: node.position?.x ?? node.x ?? 0,
  y: node.position?.y ?? node.y ?? 0,
  width: node.width || null,
  height: node.height || null,
  settings: node.settings ? JSON.stringify(node.settings) : null,
  data: node.data ? JSON.stringify(node.data) : null,
  frames: node.frames ? JSON.stringify(node.frames) : null,
  selected_keyframes: node.selectedKeyframes ? JSON.stringify(node.selectedKeyframes) : null,
  video_meta: node.videoMeta ? JSON.stringify(node.videoMeta) : null
})

/**
 * useNodesState Hook
 * 管理节点和连接的状态，以及相关的辅助映射和更新逻辑。
 */
export const useNodesState = (apiConfigs = []) => {
  // 仅订阅 setter 和 connections（稳定引用或低频变化）
  // nodes 和 nodesMap 不在此订阅——由 ljxhapp 的自定义相等性控制重渲染
  const { setNodes, connections, setConnections } = useAppStore(
    useShallow((state) => ({
      setNodes: state.setNodes,
      connections: state.connections,
      setConnections: state.setConnections
    }))
  )

  // 惰性读取：不触发组件重渲染，始终获取最新值
  const nodes = useAppStore.getState().nodes
  const nodesMap = useAppStore.getState().nodesMap

  // 连接状态表：nodeId -> boolean (是否已接入默认输入)
  const nodeConnectedStatus = useMemo(() => {
    const status = new Map()
    connections.forEach((conn) => {
      const to = conn.target || conn.to
      if (to) {
        status.set(to, true)
      }
    })
    return status
  }, [connections])

  // 相邻节点缓存：nodeId -> Set (所有相邻的 nodeId)
  const adjacentNodesCache = useMemo(() => {
    const cache = new Map()
    connections.forEach((conn) => {
      const from = conn.source || conn.from
      const to = conn.target || conn.to
      if (!cache.has(from)) cache.set(from, new Set())
      if (!cache.has(to)) cache.set(to, new Set())
      cache.get(from).add(to)
      cache.get(to).add(from)
    })
    return cache
  }, [connections])

  // ========== 批量更新逻辑 (Performance Optimized) ==========

  const nodeUpdateRef = useRef(null)
  const nodeUpdateRaf = useRef(null)
  const multiNodeUpdateRef = useRef(null)

  const flushNodeUpdate = useCallback(() => {
    // 优先处理多节点更新
    if (multiNodeUpdateRef.current) {
      const updates = multiNodeUpdateRef.current
      const nodeIdMap = new Map(updates.map(({ nodeId }) => [nodeId, true]))

      setNodes((prev) => {
        if (prev.length > 50 && updates.length > 10) {
          const nodeIndexMap = new Map()
          prev.forEach((node, idx) => {
            if (nodeIdMap.has(node.id)) nodeIndexMap.set(node.id, idx)
          })

          const next = [...prev]
          let hasChanges = false
          updates.forEach(({ nodeId, updater }) => {
            const idx = nodeIndexMap.get(nodeId)
            if (idx !== undefined) {
              const updatedNode = updater(next[idx])
              if (updatedNode !== next[idx]) {
                next[idx] = updatedNode
                hasChanges = true
                if (window.dbAPI?.nodes?.save) {
                  customDebouncedSaveNode(serializeNodeForSave(updatedNode))
                }
              }
            }
          })
          return hasChanges ? next : prev
        } else {
          const next = [...prev]
          let hasChanges = false
          updates.forEach(({ nodeId, updater }) => {
            const idx = next.findIndex((n) => n.id === nodeId)
            if (idx !== -1) {
              const updatedNode = updater(next[idx])
              if (updatedNode !== next[idx]) {
                next[idx] = updatedNode
                hasChanges = true
                if (window.dbAPI?.nodes?.save) {
                  customDebouncedSaveNode(serializeNodeForSave(updatedNode))
                }
              }
            }
          })
          return hasChanges ? next : prev
        }
      })
      multiNodeUpdateRef.current = null
      nodeUpdateRaf.current = null
      return
    }

    if (!nodeUpdateRef.current) {
      nodeUpdateRaf.current = null
      return
    }

    const { nodeId, updater } = nodeUpdateRef.current
    setNodes((prev) => {
      const idx = prev.findIndex((n) => n.id === nodeId)
      if (idx === -1) return prev
      const updatedNode = updater(prev[idx])
      if (updatedNode === prev[idx]) return prev
      const next = [...prev]
      next[idx] = updatedNode
      if (window.dbAPI?.nodes?.save) {
        customDebouncedSaveNode(serializeNodeForSave(updatedNode))
      }
      return next
    })
    nodeUpdateRef.current = null
    nodeUpdateRaf.current = null
  }, [])

  const scheduleNodeUpdate = useCallback(
    (nodeId, updater) => {
      nodeUpdateRef.current = { nodeId, updater }
      if (!nodeUpdateRaf.current) {
        nodeUpdateRaf.current = requestAnimationFrame(flushNodeUpdate)
      }
    },
    [flushNodeUpdate]
  )

  const scheduleMultiNodeUpdate = useCallback(
    (updates) => {
      multiNodeUpdateRef.current = updates
      if (!nodeUpdateRaf.current) {
        nodeUpdateRaf.current = requestAnimationFrame(flushNodeUpdate)
      }
    },
    [flushNodeUpdate]
  )

  // ========== 原子操作 ==========

  const deleteNode = useCallback((id) => {
    setNodes((prev) => prev.filter((n) => n.id !== id))
    setConnections((prev) =>
      prev.filter((c) => {
        const from = c.from || c.source
        const to = c.to || c.target
        return from !== id && to !== id
      })
    )

    if (window.dbAPI?.nodes?.delete) {
      window.dbAPI.nodes.delete(id).catch((e) => console.error('删除 SQLite 节点失败', e))
    }
  }, [])

  // 微任务批量合并：同一帧内多次 updateNodeSettings 只触发一次 setNodes
  const pendingUpdatesRef = useRef(new Map()) // Map<nodeId, mergedSettings>
  const flushScheduledRef = useRef(false)

  const updateNodeSettings = useCallback((id, newSettings) => {
    // 合并 pending 更新
    const existing = pendingUpdatesRef.current.get(id) || {}
    pendingUpdatesRef.current.set(id, { ...existing, ...newSettings })

    // 调度微任务 flush（同一帧内只执行一次）
    if (!flushScheduledRef.current) {
      flushScheduledRef.current = true
      queueMicrotask(() => {
        const updates = new Map(pendingUpdatesRef.current)
        pendingUpdatesRef.current.clear()
        flushScheduledRef.current = false

        if (updates.size === 0) return

        setNodes((prev) => {
          const next = prev.map((n) => {
            const merged = updates.get(n.id)
            return merged ? { ...n, settings: { ...n.settings, ...merged } } : n
          })
          // 批量保存所有更新的节点
          for (const nodeId of updates.keys()) {
            const updatedNode = next.find((n) => n.id === nodeId)
            if (updatedNode) {
              customDebouncedSaveNode(serializeNodeForSave(updatedNode))
            }
          }
          return next
        })
      })
    }
  }, [])

  const handleVideoFileUpload = useCallback(
    async (nodeId, file) => {
      if (!file) return

      // Use URL.createObjectURL unconditionally to bypass Electron file:// restrictions
      // as `file` here is a Web File object generated by the drop/file input event.
      let content = URL.createObjectURL(file)

      let videoMeta = { duration: 0, w: 0, h: 0 }
      try {
        videoMeta = await getVideoMetadata(content)
      } catch (err) {
        console.warn('读取视频元信息失败', err)
      }

      setNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                content,
                videoMeta,
                frames: [],
                selectedKeyframes: [],
                extractingFrames: false,
                videoFileName: file.name
              }
            : n
        )
      )
    },
    [setNodes]
  )

  const handleVideoDrop = useCallback(
    (nodeId, e) => {
      e.preventDefault()
      e.stopPropagation()
      e.currentTarget.classList.remove('drag-over')
      const files = Array.from(e.dataTransfer.files)
      const videoFile = files.find((file) => file.type.startsWith('video/'))
      if (videoFile) {
        handleVideoFileUpload(nodeId, videoFile)
      }
    },
    [handleVideoFileUpload]
  )

  const addNode = useCallback(
    (
      type,
      worldX,
      worldY,
      sourceId = null,
      initialContent = undefined,
      initialDimensions = undefined,
      targetId = undefined,
      inputType = undefined
    ) => {
      const defaultSizes = {
        'gen-video': { w: 420, h: 360 },
        'gen-image': { w: 360, h: 340 },
        'video-input': { w: 480, h: 360 },
        'video-analyze': { w: 400, h: 500 },
        'storyboard-node': { w: 600, h: 500 },
        'image-compare': { w: 400, h: 300 },
        preview: { w: 320, h: 260 },
        'text-node': { w: 280, h: 200 },
        'novel-input': { w: 400, h: 500 },
        'extract-characters-scenes': { w: 400, h: 500 },
        'character-description': { w: 400, h: 400 },
        'scene-description': { w: 400, h: 400 },
        'create-character': { w: 350, h: 300 },
        'create-scene': { w: 350, h: 300 },
        'generate-character-video': { w: 750, h: 540 },
        'generate-scene-video': { w: 750, h: 540 },
        'generate-character-image': { w: 400, h: 450 },
        'generate-scene-image': { w: 400, h: 450 },
        'agent-node': { w: 400, h: 500 },
        'alchemy-node': { w: 420, h: 320 },
        'director-node': { w: 580, h: 520 }
      }

      const defaultSize = defaultSizes[type] || { w: 260, h: 260 }

      const newNode = {
        id: `node-${Date.now()}`,
        type,
        x: worldX - defaultSize.w / 2,
        y: worldY - defaultSize.h / 2,
        position: {
          x: worldX - defaultSize.w / 2,
          y: worldY - defaultSize.h / 2
        },
        width: defaultSize.w,
        height: defaultSize.h,
        content: initialContent,
        ...(initialDimensions ? { dimensions: initialDimensions } : {}),
        settings:
          type === 'gen-image'
            ? { model: 'nano-banana', ratio: 'Auto', resolution: 'Auto', prompt: '' }
            : type === 'gen-video'
              ? { model: 'sora-2', duration: '5s', ratio: '16:9', videoPrompt: '' }
              : type === 'video-analyze'
                ? {
                    model: 'gemini-3-pro',
                    segmentDuration: 3,
                    analysisMode: 'manual',
                    voiceoverResults: [],
                    analysisResults: []
                  }
                : type === 'storyboard-node'
                  ? { projectTitle: '未命名分镜', shots: [] }
                  : type === 'text-node'
                    ? { text: initialContent || '' }
                    : type === 'novel-input'
                      ? { content: '' }
                      : type === 'extract-characters-scenes'
                        ? {
                            model: apiConfigs.find((c) => c.type === 'Chat')?.id || '',
                            analysisResults: null,
                            lastAnalyzed: null
                          }
                        : type === 'character-description'
                          ? {
                              characterId: '',
                              characterName: '',
                              role: '',
                              description: '',
                              prompt: '',
                              duration: '15s',
                              style: 'none',
                              mode: 'video',
                              imageModel: '',
                              imageRatio: '16:9',
                              imageResolution: '2k',
                              referenceImages: []
                            }
                          : type === 'scene-description'
                            ? {
                                sceneId: '',
                                sceneName: '',
                                description: '',
                                prompt: '',
                                duration: '15s',
                                style: 'none',
                                mode: 'video',
                                imageModel: '',
                                imageRatio: '16:9',
                                imageResolution: '2k',
                                referenceImages: [],
                                chatModel: ''
                              }
                            : type === 'create-character'
                              ? {
                                  name: '',
                                  startSecond: 1,
                                  endSecond: 3,
                                  isCreating: false,
                                  createProgress: 0,
                                  createError: null
                                }
                              : type === 'create-scene'
                                ? { name: '', timeRange: '' }
                                : type === 'generate-character-video' ||
                                    type === 'generate-scene-video'
                                  ? {
                                      model: 'sora-2',
                                      duration: '15s',
                                      ratio: '16:9',
                                      videoPrompt: '',
                                      referenceImages: [],
                                      sourceType: '',
                                      sourceId: '',
                                      isGenerating: false,
                                      progress: 0,
                                      error: null,
                                      videoUrl: ''
                                    }
                                  : type === 'generate-character-image' ||
                                      type === 'generate-scene-image'
                                    ? {
                                        model: 'nano-banana',
                                        ratio: 'Auto',
                                        resolution: 'Auto',
                                        prompt: '',
                                        referenceImages: [],
                                        chatModel: '',
                                        imageUrls: [],
                                        selectedImageIndex: null,
                                        isGenerating: false,
                                        progress: 0,
                                        error: null,
                                        imageUrl: ''
                                      }
                                    : type === 'agent-node'
                                      ? {
                                          role: '',
                                          template: '',
                                          input: '',
                                          chatModel: '',
                                          status: 'idle',
                                          logs: [],
                                          result: '',
                                          autoMode: false
                                        }
                                      : {}
      }

      setNodes((prev) => [...prev, newNode])

      // 持久化到 SQLite
      if (window.dbAPI?.nodes?.save) {
        window.dbAPI.nodes
          .save(serializeNodeForSave(newNode))
          .catch((e) => console.error('保存节点到 SQLite 失败', e))
      }

      // 处理连接
      if (sourceId) {
        setConnections((prev) => [
          ...prev,
          { id: `conn-${Date.now()}`, from: sourceId, to: newNode.id }
        ])
      }
      if (targetId) {
        setConnections((prev) => {
          if (inputType && inputType !== 'default') {
            const filtered = prev.filter(
              (c) => !(c.to === targetId && (c.inputType || 'default') === inputType)
            )
            return [
              ...filtered,
              {
                id: `conn-${Date.now()}`,
                from: newNode.id,
                to: targetId,
                inputType: inputType !== 'default' ? inputType : undefined
              }
            ]
          }
          return [
            ...prev,
            {
              id: `conn-${Date.now()}`,
              from: newNode.id,
              to: targetId
            }
          ]
        })
      }

      return newNode
    },
    [apiConfigs]
  )

  return {
    nodes,
    setNodes,
    connections,
    setConnections,
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
    handleVideoDrop
  }
}
