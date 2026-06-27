import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  MiniMap,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  ViewportPortal
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { RotateCcw, Search } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { useAppStore } from '../../store/useAppStore'
import { NodeRenderer } from './NodeRenderer'
import { useCanvasContext } from '../../contexts/CanvasContext'
import { NodeRegistry } from '../../utils/nodeRegistry'

import { canReadFileAsDataUrl, getImageDimensions } from '../../utils/fileHelpers'
import { readCloudAssetDrag, readSeriesAssetDrag, resolveCloudAssetForDrop, getDefaultNodeType } from '../../utils/cloudAssetDrop'
import { SelectionToolbar } from './SelectionToolbar'
import { GroupLayer } from './GroupLayer'
import { ScreenshotOverlay, ScreenshotActionDialog } from './ScreenshotOverlay'
import { TagBar } from '../ui/TagBar'
import { CanvasBgPicker } from './CanvasBgPicker'
import { captureViewport } from '../../utils/canvasCapture'
import {
  registerManagedBlobUrl,
  revokeAllManagedBlobUrls,
  revokeManagedBlobUrl,
  syncManagedBlobUrls
} from '../../utils/blobUrlRegistry'
import { withProjectCacheContext } from '../../utils/projectCache'

const PAN_ON_DRAG_CONFIG = [1, 2]
const MINIMAP_NODE_LIMIT = 120
const HEAVY_CANVAS_NODE_LIMIT = 50
const CANVAS_MIN_ZOOM = 0.05
const CANVAS_MAX_ZOOM = 3
const NODE_INDEX_LABEL_REFRESH_EVENT = 'ljxh:node-index-label-refresh'

let nodeIndexLabelRefreshFrame = 0
function scheduleNodeIndexLabelRefresh() {
  if (typeof window === 'undefined') return
  if (nodeIndexLabelRefreshFrame) return
  nodeIndexLabelRefreshFrame = window.requestAnimationFrame(() => {
    nodeIndexLabelRefreshFrame = 0
    window.dispatchEvent(new Event(NODE_INDEX_LABEL_REFRESH_EVENT))
  })
}

function normalizeNodeSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/\s+/g, '')
}

function getNodeSearchLabel(node) {
  return typeof node?.settings?.nodeSearchLabel === 'string'
    ? node.settings.nodeSearchLabel.trim()
    : ''
}

function getNodeSearchKey(node, index) {
  const label = getNodeSearchLabel(node)
  return label ? `${index}(${label})` : String(index)
}

function parseNodeSearchIndex(query) {
  const normalized = normalizeNodeSearchText(query)
  const match = normalized.match(/^#?(?:第)?(\d+)(?:个|号|集)?/)
  if (!match) return null
  const index = Number(match[1])
  return Number.isFinite(index) && index > 0 ? index : null
}

function findNodeBySearchQuery(nodes, query) {
  const normalizedQuery = normalizeNodeSearchText(query)
  if (!normalizedQuery) return null

  const indexedTarget = parseNodeSearchIndex(query)
  if (indexedTarget && indexedTarget <= nodes.length) {
    return nodes[indexedTarget - 1]
  }

  const rows = nodes.map((node, idx) => {
    const index = idx + 1
    const label = getNodeSearchLabel(node)
    const customName =
      typeof node?.settings?.customName === 'string' ? node.settings.customName : ''
    return {
      node,
      terms: [
        String(index),
        `#${index}`,
        getNodeSearchKey(node, index),
        label,
        customName,
        node.id,
        node.type
      ].map(normalizeNodeSearchText)
    }
  })

  return (
    rows.find((row) => row.terms.includes(normalizedQuery))?.node ||
    rows.find((row) => row.terms.some((term) => term && term.includes(normalizedQuery)))?.node ||
    null
  )
}

function collectBlobUrlsFromValue(value, out = new Set<string>(), seen = new WeakSet<object>()) {
  if (!value) return out
  if (typeof value === 'string') {
    if (value.startsWith('blob:')) out.add(value)
    return out
  }
  if (typeof value !== 'object') return out
  if (seen.has(value)) return out
  seen.add(value as object)

  if (Array.isArray(value)) {
    for (const item of value) collectBlobUrlsFromValue(item, out, seen)
    return out
  }

  for (const item of Object.values(value)) {
    collectBlobUrlsFromValue(item, out, seen)
  }
  return out
}

function collectBlobUrlsFromNodes(nodes) {
  const urls = new Set<string>()
  for (const node of nodes || []) {
    collectBlobUrlsFromValue(node, urls)
  }
  return urls
}

function getFlowNodeSignature(node, activeTagFilter, nodeGroupMap) {
  const position = node.position || { x: node.x || 0, y: node.y || 0 }
  const tagIds = Array.isArray(node.data?.tags) ? node.data.tags.join(',') : ''
  const filtered = activeTagFilter ? !node.data?.tags?.includes(activeTagFilter) : false
  const group = nodeGroupMap?.get(node.id)
  const hiddenByGroup = Boolean(group?.collapsed)
  return [
    node.id,
    node.type,
    position.x,
    position.y,
    node.width,
    node.height,
    node.hidden || hiddenByGroup ? 1 : 0,
    node.selected ? 1 : 0,
    node.dragHandle || '',
    tagIds,
    filtered ? 1 : 0,
    group?.id || '',
    hiddenByGroup ? 1 : 0
  ].join('|')
}

function toFlowNode(node, activeTagFilter, nodeGroupMap) {
  const position = node.position || { x: node.x || 0, y: node.y || 0 }
  const filtered = activeTagFilter ? !node.data?.tags?.includes(activeTagFilter) : false
  const group = nodeGroupMap?.get(node.id)
  return {
    id: node.id,
    type: node.type || 'customNode',
    position,
    data: {},
    width: node.width,
    height: node.height,
    hidden: node.hidden || Boolean(group?.collapsed),
    selected: node.selected,
    dragHandle: node.dragHandle,
    style: filtered
      ? {
          opacity: 0.15,
          pointerEvents: 'none'
        }
      : undefined
  }
}

function sampleCanvasFps(durationMs = 5000) {
  const safeDuration = Math.min(Math.max(Number(durationMs) || 5000, 1000), 30000)
  return new Promise((resolve) => {
    const startedAt = performance.now()
    let frames = 0
    let lastFrameAt = startedAt
    let minFrameMs = Number.POSITIVE_INFINITY
    let maxFrameMs = 0

    const tick = (now) => {
      frames += 1
      const frameMs = now - lastFrameAt
      if (frames > 1) {
        minFrameMs = Math.min(minFrameMs, frameMs)
        maxFrameMs = Math.max(maxFrameMs, frameMs)
      }
      lastFrameAt = now

      if (now - startedAt < safeDuration) {
        requestAnimationFrame(tick)
        return
      }

      const elapsedMs = now - startedAt
      const result = {
        durationMs: Math.round(elapsedMs),
        frames,
        averageFps: Math.round((frames / elapsedMs) * 100000) / 100,
        minFrameMs: Math.round((Number.isFinite(minFrameMs) ? minFrameMs : 0) * 100) / 100,
        maxFrameMs: Math.round(maxFrameMs * 100) / 100,
        nodeCount: useAppStore.getState().nodes.length,
        sampledAt: new Date().toISOString()
      }
      console.table(result)
      resolve(result)
    }

    requestAnimationFrame(tick)
  })
}

// 使用 store 的 nodesMap 进行 O(1) 查找，避免每个节点订阅整个 nodes 数组
function restoreProductionBoardSnapshot(store, snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return
  store.setProductionBoardRows?.(Array.isArray(snapshot.rows) ? snapshot.rows : null)
  store.setProductionBoardCommonValues?.(snapshot.commonValues || null)
  store.setProductionBoardMode?.(snapshot.mode === 'image' ? 'image' : 'video')
  store.setProductionBoardVideoRows?.(
    Array.isArray(snapshot.videoRows) ? snapshot.videoRows : null
  )
  store.setProductionBoardVideoCommonValues?.(snapshot.videoCommonValues || null)
  store.setProductionBoardImageRows?.(
    Array.isArray(snapshot.imageRows) ? snapshot.imageRows : null
  )
  store.setProductionBoardImageCommonValues?.(snapshot.imageCommonValues || null)
  store.setProductionBoardSharedRefs?.(snapshot.sharedRefs || null)
}

const ReactFlowCustomNode = React.memo(function ReactFlowCustomNode({ id }: any) {
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

const nodeTypes: Record<string, any> = {
  customNode: ReactFlowCustomNode
}
Object.keys(NodeRegistry).forEach((type) => {
  nodeTypes[type] = ReactFlowCustomNode
})

function ReactFlowCanvasInner() {
  const parentContext = useCanvasContext()
  const { handleCanvasContextMenu, handleBackgroundClick, canvasRef } = parentContext

  const { nodesLayoutVersion, nodeCount, nodeGroups, nodeGroupMap } = useAppStore(
    useShallow((state) => ({
      nodesLayoutVersion: state.nodesLayoutVersion,
      nodeCount: state.nodes.length,
      nodeGroups: state.nodeGroups,
      nodeGroupMap: state.nodeGroupMap
    }))
  )
  const onNodesChange = useAppStore((state) => state.onNodesChange)
  const setView = useAppStore((state) => state.setView)
  const setIsDragging = useAppStore((state) => state.setIsDragging)
  const themeColor = useAppStore((state) => state.themeColor)

  const isDragging = useAppStore((state) => state.isDragging)
  const activeTagFilter = useAppStore((state) => state.activeTagFilter)
  const screenshotMode = useAppStore((state) => state.screenshotMode)
  const screenshotResult = useAppStore((state) => state.screenshotResult)
  const setSelectedNodeId = useAppStore((state) => state.setSelectedNodeId)
  const setSelectedNodeIds = useAppStore((state) => state.setSelectedNodeIds)
  const currentProject = useAppStore((state) => state.currentProject)
  const [nodeSearchQuery, setNodeSearchQuery] = useState('')
  const [nodeSearchStatus, setNodeSearchStatus] = useState('idle')
  const [canvasRecoveryStatus, setCanvasRecoveryStatus] = useState<'idle' | 'busy' | 'ok' | 'error'>('idle')
  const flowNodeCacheRef = useRef(new Map())
  const isHeavyCanvas = nodeCount >= HEAVY_CANVAS_NODE_LIMIT

  const layoutNodes = useMemo(() => useAppStore.getState().nodes, [nodesLayoutVersion])

  const flowNodes = useMemo(() => {
    const cache = flowNodeCacheRef.current
    const nextCache = new Map()
    const nextNodes = layoutNodes.map((node) => {
      const signature = getFlowNodeSignature(node, activeTagFilter, nodeGroupMap)
      const cached = cache.get(node.id)
      if (cached?.signature === signature) {
        nextCache.set(node.id, cached)
        return cached.node
      }

      const flowNode = toFlowNode(node, activeTagFilter, nodeGroupMap)
      const entry = { signature, node: flowNode }
      nextCache.set(node.id, entry)
      return flowNode
    })
    flowNodeCacheRef.current = nextCache
    return nextNodes
  }, [layoutNodes, activeTagFilter, nodeGroups, nodeGroupMap])

  // 截图快捷键: Ctrl+Shift+S
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault()
        useAppStore.getState().setScreenshotMode('selection')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    window.addEventListener('beforeunload', revokeAllManagedBlobUrls)
    return () => window.removeEventListener('beforeunload', revokeAllManagedBlobUrls)
  }, [])

  useEffect(() => {
    let timer = 0
    const syncSoon = () => {
      if (timer) return
      timer = window.setTimeout(() => {
        timer = 0
        syncManagedBlobUrls(collectBlobUrlsFromNodes(useAppStore.getState().nodes))
      }, 1000)
    }

    syncSoon()
    const unsubscribe = useAppStore.subscribe(syncSoon)
    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    window.__tapnowPerf = {
      ...(window.__tapnowPerf || {}),
      sampleCanvasFps
    }

    return () => {
      if (window.__tapnowPerf?.sampleCanvasFps === sampleCanvasFps) {
        delete window.__tapnowPerf.sampleCanvasFps
      }
    }
  }, [])

  const handleNodesDelete = useCallback((nodesToDelete) => {
    if (window.dbAPI?.nodes?.delete) {
      nodesToDelete.forEach((n) => {
        const sourceNode = useAppStore.getState().nodesMap.get(n.id)
        revokeManagedBlobUrl(sourceNode?.content)
        window.dbAPI.nodes.delete(n.id).catch(console.error)
      })
    }
  }, [])

  const handleSelectionChange = useCallback(({ nodes }: any) => {
    const state = useAppStore.getState()
    const ids = new Set<string>(nodes.map((n: any) => String(n.id)))

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
    // 如果落点在资产库面板区域，不拦截，让资产库面板自行处理
    const assetLibraryOpen = useAppStore.getState().assetLibraryOpen
    if (assetLibraryOpen && e.clientY <= window.innerHeight * 0.18) {
      return
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(async (e) => {
    // 如果落点在资产库面板区域（顶部 18vh），不处理，让资产库接收
    const assetLibraryOpen = useAppStore.getState().assetLibraryOpen
    if (assetLibraryOpen && e.clientY <= window.innerHeight * 0.18) {
      return
    }
    e.preventDefault()

    const seriesAsset = readSeriesAssetDrag(e.dataTransfer)
    if (seriesAsset) {
      const state = useAppStore.getState()
      const reactFlowBounds = e.currentTarget.getBoundingClientRect()
      const view = state.view
      const dropX = (e.clientX - reactFlowBounds.left - view.x) / view.zoom
      const dropY = (e.clientY - reactFlowBounds.top - view.y) / view.zoom
      const nodeId = `node_${Date.now()}_${Math.random().toString(36).substring(7)}`
      const prompt = seriesAsset.prompt || seriesAsset.name
      const newNode = {
        id: nodeId,
        type: 'gen-image',
        position: { x: dropX, y: dropY },
        x: dropX,
        y: dropY,
        data: {},
        content: seriesAsset.imageUrl || null,
        fileName: seriesAsset.name,
        settings: {
          prompt,
          manualImages: seriesAsset.imageUrl ? [seriesAsset.imageUrl] : [],
          cloudSeriesAsset: seriesAsset
        },
        width: 400,
        height: 300,
        dimensions: { w: 400, h: 300 }
      }
      state.setNodes([...state.nodes, newNode as any])
      return
    }

    // 云素材拖入处理
    const cloudPayload = readCloudAssetDrag(e.dataTransfer)
    if (cloudPayload) {
      const state = useAppStore.getState()
      const reactFlowBounds = e.currentTarget.getBoundingClientRect()
      const view = state.view
      const dropX = (e.clientX - reactFlowBounds.left - view.x) / view.zoom
      const dropY = (e.clientY - reactFlowBounds.top - view.y) / view.zoom

      try {
        const { downloadUrl } = await resolveCloudAssetForDrop(cloudPayload)
        const nodeType = getDefaultNodeType(cloudPayload.assetType)
        const nodeId = `node_${Date.now()}_${Math.random().toString(36).substring(7)}`
        const newNode = {
          id: nodeId,
          type: nodeType,
          position: { x: dropX, y: dropY },
          x: dropX,
          y: dropY,
          data: {},
          content: downloadUrl,
          fileName: cloudPayload.name,
          cloudAssetId: cloudPayload.assetId,
          cloudTeamId: cloudPayload.teamId,
          width: nodeType === 'audio-input' ? 320 : 400,
          height: nodeType === 'audio-input' ? 150 : 300,
          dimensions: {
            w: nodeType === 'audio-input' ? 320 : 400,
            h: nodeType === 'audio-input' ? 150 : 300
          }
        }
        state.setNodes([...state.nodes, newNode as any])
      } catch (err) {
        console.error('[Canvas] 云素材拖入失败:', err)
        alert(`云素材拖入失败: ${err instanceof Error ? err.message : '未知错误'}`)
      }
      return
    }

    const assetPath = e.dataTransfer.getData('asset-path')
    const assetPathsJson = e.dataTransfer.getData('asset-paths')
    const assetType = e.dataTransfer.getData('asset-type') || ''
    let internalAssetPaths: string[] = []
    if (assetPath) {
      internalAssetPaths = [assetPath]
    } else if (assetPathsJson) {
      try {
        const parsedPaths = JSON.parse(assetPathsJson)
        if (Array.isArray(parsedPaths)) {
          internalAssetPaths = parsedPaths.filter((path: unknown): path is string => typeof path === 'string' && Boolean(path))
        }
      } catch {
        internalAssetPaths = []
      }
    }

    if (internalAssetPaths.length > 0) {
      const state = useAppStore.getState()
      const reactFlowBounds = e.currentTarget.getBoundingClientRect()
      const view = state.view
      const baseX = (e.clientX - reactFlowBounds.left - view.x) / view.zoom
      const baseY = (e.clientY - reactFlowBounds.top - view.y) / view.zoom

      const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
      const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv']
      const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']
      const newNodes: any[] = []

      for (let i = 0; i < internalAssetPaths.length; i++) {
        const path = internalAssetPaths[i]
        const ext = String(path).split(/[?#]/)[0].split('.').pop()?.toLowerCase() || ''
        const isVideo = assetType.startsWith('video/') || videoExts.includes(ext)
        const isAudio = assetType.startsWith('audio/') || audioExts.includes(ext)
        const isImage = assetType.startsWith('image/') || imageExts.includes(ext) || (!isVideo && !isAudio)
        const nodeType = isVideo ? 'video-input' : isAudio ? 'audio-input' : 'input-image'
        const offsetX = baseX + i * 50
        const offsetY = baseY + i * 30
        let finalW = isVideo ? 480 : isAudio ? 320 : 300
        let finalH = isVideo ? 360 : isAudio ? 150 : 300

        if (isImage) {
          try {
            const dims = (await getImageDimensions(path)) as any
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
            console.error('Failed to get asset dimensions:', err)
          }
        }

        newNodes.push({
          id: `node_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type: nodeType,
          position: { x: offsetX, y: offsetY },
          x: offsetX,
          y: offsetY,
          data: {},
          content: path,
          fileName: path.split(/[\\/]/).pop() || undefined,
          filePath: isAudio ? path : undefined,
          width: finalW,
          height: finalH,
          dimensions: { w: finalW, h: finalH }
        })
      }

      if (newNodes.length > 0) {
        state.setNodes([...state.nodes, ...newNodes])
      }
      return
    }

    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return

    const files = Array.from(e.dataTransfer.files) as File[]
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
        const projectData = JSON.parse(text) as any

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

    const newNodes: any[] = []

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
        const blobUrl = registerManagedBlobUrl(URL.createObjectURL(file))
        const newNode = {
          id: `node_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type,
          position: { x: offsetX, y: offsetY },
          x: offsetX,
          y: offsetY,
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

      try {
        let finalUrl = null
        let finalPath = null
        let ext = '.jpg'
        let cacheType = 'image'

        if (isAudio) {
          ext = file.name ? '.' + file.name.split('.').pop() : '.mp3'
          cacheType = 'audio'
        } else {
          ext = file.name ? '.' + file.name.split('.').pop() : '.jpg'
        }

        // 优先通过主进程文件拷贝
        if (file.path) {
          const response = await window.api.invoke('cache:copy-file', withProjectCacheContext({
            id: `drop_${Date.now()}_${i}`,
            sourcePath: file.path,
            category: 'user_upload',
            type: cacheType
          }))
          if (response?.success && response.url) {
            finalUrl = response.url
            finalPath = response.path
          }
        }

        // 降级使用 FileReader 读取
        if (!finalUrl) {
          if (!canReadFileAsDataUrl(file, isAudio ? 'Audio drop' : 'Image drop')) {
            continue
          }
          const base64Content = await new Promise((res, rej) => {
            const reader = new FileReader()
            reader.onload = (e) => res(e.target.result)
            reader.onerror = (e) => rej(e)
            reader.readAsDataURL(file)
          })

          const response = await window.api.invoke('cache:save-cache', withProjectCacheContext({
            id: `drop_${Date.now()}_${i}`,
            content: base64Content,
            category: 'user_upload',
            ext: ext,
            type: cacheType
          }))

          if (response?.success && response.url) {
            finalUrl = response.url
            finalPath = response.path
          }
        }

        if (finalUrl) {
          let finalW = type === 'audio-input' ? 320 : 300
          let finalH = type === 'audio-input' ? 150 : 300

          if (type === 'input-image') {
            try {
              const dims = (await getImageDimensions(finalUrl)) as any
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
            x: offsetX,
            y: offsetY,
            data: {},
            content: finalUrl,
            fileName: isAudio ? file.name : undefined,
            filePath: isAudio ? finalPath || finalUrl : undefined,
            width: finalW,
            height: finalH,
            dimensions: { w: finalW, h: finalH }
          }
          newNodes.push(newNode)
        } else {
          console.error(`处理文件 ${file.name} 失败`)
        }
      } catch (err) {
        console.error(`处理拖拽文件异常:`, err)
      }
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
      if (now - moveThrottleRef.current < 250) return
      scheduleNodeIndexLabelRefresh()
      if (now - moveThrottleRef.current < 50) return // ~20fps 对 store 足够
      moveThrottleRef.current = now
      setView(viewport)
    },
    [setView]
  )
  const handleMoveStart = useCallback(() => {
    setIsDragging(true)
  }, [setIsDragging])
  const handleMoveEnd = useCallback((e, viewport) => {
    moveThrottleRef.current = performance.now()
    scheduleNodeIndexLabelRefresh()
    setView(viewport)
    setIsDragging(false)
  }, [setIsDragging, setView])

  const { screenToFlowPosition, setCenter, getViewport } = useReactFlow()

  const handleNodeSearchSubmit = useCallback(
    (event) => {
      event.preventDefault()
      const targetNode = findNodeBySearchQuery(useAppStore.getState().nodes, nodeSearchQuery)
      if (!targetNode) {
        setNodeSearchStatus('not-found')
        window.setTimeout(() => setNodeSearchStatus('idle'), 1600)
        return
      }

      const position = targetNode.position || {
        x: targetNode.x || 0,
        y: targetNode.y || 0
      }
      const centerX = position.x + (targetNode.width || 320) / 2
      const centerY = position.y + (targetNode.height || 240) / 2
      const currentZoom = getViewport?.().zoom || 1
      const zoom = Math.min(Math.max(currentZoom, 0.8), 1.15)

      setSelectedNodeIds(new Set([targetNode.id]))
      setSelectedNodeId(targetNode.id)
      setCenter(centerX, centerY, { zoom, duration: 500 })
      setNodeSearchStatus('found')
      window.setTimeout(() => setNodeSearchStatus('idle'), 1000)
    },
    [
      nodeSearchQuery,
      getViewport,
      setCenter,
      setSelectedNodeId,
      setSelectedNodeIds
    ]
  )

  const handleRecoverCanvas = useCallback(async () => {
    if (!currentProject?.id || canvasRecoveryStatus === 'busy') return
    if (
      nodeCount > 0 &&
      !window.confirm('从项目文件重新恢复当前画布？这会覆盖当前未保存的画布运行态。')
    ) {
      return
    }

    setCanvasRecoveryStatus('busy')
    try {
      try {
        await window.api?.projectFileAPI?.repair?.(currentProject.id)
      } catch (repairError) {
        console.warn('[CanvasRecovery] Project repair failed, trying direct load:', repairError)
      }

      const projectData = await window.api?.projectFileAPI?.load?.(currentProject.id)
      const recoveredNodes = Array.isArray(projectData?.nodes) ? projectData.nodes : []
      if (recoveredNodes.length === 0) {
        setCanvasRecoveryStatus('error')
        window.setTimeout(() => setCanvasRecoveryStatus('idle'), 1600)
        alert('当前项目文件里没有可恢复的画布节点')
        return
      }

      const store = useAppStore.getState()
      if (projectData.cacheRoot && store.currentProject?.id === currentProject.id) {
        store.setCurrentProject({ ...store.currentProject, cacheRoot: projectData.cacheRoot })
      }
      store.setNodes(recoveredNodes)
      store.setNodeGroups(Array.isArray(projectData.nodeGroups) ? projectData.nodeGroups : [])
      store.setConnections(Array.isArray(projectData.connections) ? projectData.connections : [])
      if (projectData.view) store.setView(projectData.view)
      if (projectData.name) store.setProjectName(projectData.name)
      if (Array.isArray(projectData.history)) store.setHistory(projectData.history)
      restoreProductionBoardSnapshot(store, projectData.productionBoard)
      window.dispatchEvent(new Event(NODE_INDEX_LABEL_REFRESH_EVENT))
      setCanvasRecoveryStatus('ok')
      window.setTimeout(() => setCanvasRecoveryStatus('idle'), 1200)
    } catch (err) {
      console.error('[CanvasRecovery] Failed to recover canvas:', err)
      setCanvasRecoveryStatus('error')
      window.setTimeout(() => setCanvasRecoveryStatus('idle'), 1600)
      alert('恢复画布失败，请看控制台日志')
    }
  }, [canvasRecoveryStatus, currentProject?.id, nodeCount])

  return (
    <div
      ref={canvasRef}
      className={`bg-[var(--canvas-bg-base)] ${isHeavyCanvas ? 'canvas-heavy-load' : ''} ${
        isDragging ? 'canvas-interacting' : ''
      }`}
      style={{ width: '100vw', height: '100vh', position: 'relative' }}
      onContextMenu={(e) => {
        const target = e.target as HTMLElement
        if (target.closest('.react-flow__node') || target.closest('.react-flow__edge')) {
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
          ;(e as any).customWorldX = preciseWorldX
          ;(e as any).customWorldY = preciseWorldY
        }

        handleCanvasContextMenu(e)
      }}
      onClick={handleBackgroundClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={flowNodes}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodesDelete={handleNodesDelete}
        onSelectionChange={handleSelectionChange}
        nodesDraggable={true}
        nodesFocusable={false}
        edgesFocusable={false}
        panOnDrag={PAN_ON_DRAG_CONFIG}
        selectionOnDrag={true}
        selectionMode={SelectionMode.Partial}
        onMoveStart={handleMoveStart}
        onMove={handleMove}
        onMoveEnd={handleMoveEnd}
        zoomOnScroll={true}
        minZoom={CANVAS_MIN_ZOOM}
        maxZoom={CANVAS_MAX_ZOOM}
        onlyRenderVisibleElements={true}
        elevateNodesOnSelect={false}
        elevateEdgesOnSelect={false}
        proOptions={{ hideAttribution: true }}
      >
        <ViewportPortal>
          <GroupLayer />
        </ViewportPortal>
        {/* Controls 已隐藏 */}
        {!isDragging && flowNodes.length <= MINIMAP_NODE_LIMIT && (
          <MiniMap
            zoomable
            pannable
            nodeColor={themeColor || '#3b82f6'}
            maskColor="rgba(0, 0, 0, 0.4)"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              bottom: 18,
              right: 24,
              width: 160,
              height: 104,
              zIndex: 35
            }}
          />
        )}
      </ReactFlow>
      <SelectionToolbar />
      {currentProject?.id && (
        <button
          type="button"
          className={`nodrag nowheel absolute top-[14px] right-[214px] z-[44] flex h-[34px] items-center justify-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium text-[var(--text-primary)] shadow-sm backdrop-blur-md transition-all hover:scale-105 active:scale-95 disabled:opacity-70 ${
            canvasRecoveryStatus === 'ok'
              ? 'border-emerald-400/60 bg-emerald-500/25'
              : canvasRecoveryStatus === 'error'
                ? 'border-red-400/60 bg-red-500/25'
                : 'border-white/15 bg-[var(--bg-panel)]/70 hover:bg-[var(--bg-hover)]'
          }`}
          onClick={handleRecoverCanvas}
          disabled={canvasRecoveryStatus === 'busy'}
          title="从项目文件恢复画布"
          aria-label="从项目文件恢复画布"
        >
          <RotateCcw
            size={14}
            className={canvasRecoveryStatus === 'busy' ? 'animate-spin' : ''}
          />
          <span className="whitespace-nowrap">
            {canvasRecoveryStatus === 'busy'
              ? '恢复中'
              : canvasRecoveryStatus === 'ok'
                ? '已恢复'
                : canvasRecoveryStatus === 'error'
                  ? '恢复失败'
                  : '恢复画布'}
          </span>
        </button>
      )}
      <form
        className={`canvas-node-search nodrag nowheel ${
          nodeSearchStatus === 'not-found' ? 'is-not-found' : ''
        } ${nodeSearchStatus === 'found' ? 'is-found' : ''}`}
        onSubmit={handleNodeSearchSubmit}
      >
        <Search size={15} strokeWidth={2} aria-hidden="true" />
        <input
          value={nodeSearchQuery}
          onChange={(event) => {
            setNodeSearchQuery(event.target.value)
            if (nodeSearchStatus !== 'idle') setNodeSearchStatus('idle')
          }}
          placeholder="4 / 4（第二集）"
          aria-label="节点搜索"
        />
      </form>
      <TagBar />
      <CanvasBgPicker />

      {/* 截图遮罩 */}
      {screenshotMode === 'selection' && (
        <ScreenshotOverlay
          onClose={() => useAppStore.getState().setScreenshotMode(null)}
          onCapture={(result) => useAppStore.getState().setScreenshotResult(result)}
        />
      )}

      {/* 截图操作弹窗 */}
      {screenshotResult && (
        <ScreenshotActionDialog
          result={screenshotResult}
          onClose={() => useAppStore.getState().setScreenshotResult(null)}
        />
      )}

      {/* 标签筛选时降低非匹配节点透明度 */}
      {activeTagFilter && (
        <style>{`
          .react-flow__node {
            transition: opacity 0.3s ease;
          }
          .react-flow__node[data-tag-filtered="false"] {
            opacity: 0.15 !important;
            pointer-events: none;
          }
        `}</style>
      )}
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
