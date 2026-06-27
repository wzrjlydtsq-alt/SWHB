import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { AlertCircle, Camera, Eraser, Sparkles, Sun, X } from '../../utils/icons.tsx'
import { OutputResultsPanel } from './OutputResultsPanel.tsx'
import { GenPromptArea } from './gen/GenPromptArea.tsx'
import { GenMediaPanel } from './gen/GenMediaPanel.tsx'
import { GenToolbar, enablePanoramaMode } from './gen/GenToolbar.tsx'
import {
  buildHiddenCameraPrompt,
  buildHiddenLightingPrompt,
  GenImageToolPanel
} from './gen/GenImageToolPanel.tsx'
import {
  buildPanoramaPrompt,
  PANORAMA_TEXT2IMG_SUFFIX
} from '../../features/panorama/panoramaPrompt.ts'
import {
  canReadFileAsDataUrl,
  getPreferredMediaUrl,
  getXingheMediaSrc
} from '../../utils/fileHelpers.ts'
import { withProjectCacheContext } from '../../utils/projectCache.ts'
import { useAppStore } from '../../store/useAppStore.ts'
import { isActiveGenerationStatus } from '../../utils/generationStatus.ts'
import { friendlyError } from '../../utils/friendlyError.ts'

const ACTIVE_GENERATION_STALE_MS = 30 * 60 * 1000

function areShallowArraysEqual(prev = [], next = []) {
  if (prev === next) return true
  if (!Array.isArray(prev) || !Array.isArray(next)) return false
  if (prev.length !== next.length) return false
  for (let index = 0; index < prev.length; index += 1) {
    if (prev[index] !== next[index]) return false
  }
  return true
}

// 快速浅比较两个对象的关键字段，避免 JSON.stringify 开销
function shallowEqualObjects(a, b, keys) {
  for (const key of keys) {
    if (a?.[key] !== b?.[key]) return false
  }
  return true
}

function areGenNodePropsEqual(prevProps, nextProps) {
  const pn = prevProps.node
  const nn = nextProps.node
  if (pn.id !== nn.id) return false
  if (pn.type !== nn.type) return false

  const ps = pn.settings || {}
  const ns = nn.settings || {}

  // 基础字段快速比较
  const baseKeys = [
    'status',
    'progress',
    'isGenerating',
    'error',
    'model',
    'ratio',
    'resolution',
    'duration',
    'prompt',
    'videoPrompt',
    'imageUrl',
    'videoStartFrameUrl',
    'videoEndFrameUrl',
    'videoRefUrls',
    'generateAudio',
    'enableWebSearch',
    'manualStartFrame',
    'manualEndFrame',
    'veoFramesMode',
    'batchSize',
    'outputCollapsed',
    '_isPanorama',
    'assetPreviewMap'
  ]
  if (!shallowEqualObjects(ps, ns, baseKeys)) return false

  // 工具状态比较：只比较关键字段，避免 JSON.stringify
  if (ps._cameraToolState || ns._cameraToolState) {
    const pc = ps._cameraToolState || {}
    const nc = ns._cameraToolState || {}
    if (!shallowEqualObjects(pc, nc, ['enabled', 'mode', 'angle'])) return false
  }
  if (ps._lightingToolState || ns._lightingToolState) {
    const pl = ps._lightingToolState || {}
    const nl = ns._lightingToolState || {}
    if (!shallowEqualObjects(pl, nl, ['enabled', 'mode', 'intensity'])) return false
  }

  if (ps.appliedTemplates?.length !== ns.appliedTemplates?.length) return false
  if (ps.appliedVideoTemplates?.length !== ns.appliedVideoTemplates?.length) return false

  if (!areShallowArraysEqual(ps.manualImages || [], ns.manualImages || [])) return false
  if (!areShallowArraysEqual(ps.manualAudios || [], ns.manualAudios || [])) return false
  if (!areShallowArraysEqual(ps.assetIds || [], ns.assetIds || [])) return false
  if (!areShallowArraysEqual(ps.videoAssetIds || [], ns.videoAssetIds || [])) return false
  if (!areShallowArraysEqual(ps.audioAssetIds || [], ns.audioAssetIds || [])) return false
  if (!areShallowArraysEqual(ps.manualVideos || [], ns.manualVideos || [])) return false

  const prevResults = ps.outputResults || []
  const nextResults = ns.outputResults || []
  if (prevResults.length !== nextResults.length) return false
  if (
    prevResults.length > 0 &&
    prevResults[prevResults.length - 1]?.url !== nextResults[nextResults.length - 1]?.url
  ) {
    return false
  }

  if (!areShallowArraysEqual(prevProps.connectedImages || [], nextProps.connectedImages || [])) {
    return false
  }
  if (prevProps.activeDropdown !== nextProps.activeDropdown) return false

  return true
}

function hasRenderableResult(result: any) {
  return Boolean(getPreferredMediaUrl(result))
}

function getHistoryTimeMs(item: any) {
  const candidates = [
    item?.updatedAt,
    item?.submittedAt,
    item?.startTime,
    item?.createdAt,
    item?.timestamp
  ]
  for (const candidate of candidates) {
    if (!candidate) continue
    const value = typeof candidate === 'number' ? candidate : Date.parse(candidate)
    if (Number.isFinite(value) && value > 0) return value
  }
  return 0
}

function isStaleActiveHistory(item: any, now = Date.now()) {
  if (!isActiveGenerationStatus(item?.status)) return false
  const timeMs = getHistoryTimeMs(item)
  return timeMs > 0 && now - timeMs > ACTIVE_GENERATION_STALE_MS
}

type FloatingRect = {
  left: number
  top: number
  width: number
  height: number
}

export const GenNode = React.memo(function GenNode({
  node,
  apiConfigs,
  updateNodeSettings,
  connections,
  nodesMap,
  apiConfigsMap,
  connectedImages,
  startGeneration,
  getStatusColor,
  getConnectedImageForInput,
  activeDropdown,
  setActiveDropdown,
  getConnectedTextNodes,
  getConnectedAudioNodes,
  setLightboxItem
}: any) {
  const [activeToolPanel, setActiveToolPanel] = useState<'camera' | 'lighting' | null>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [isFloatingControlsHovered, setIsFloatingControlsHovered] = useState(false)
  const [floatingControlsPinned, setFloatingControlsPinned] = useState(false)
  const [isSubmittingGeneration, setIsSubmittingGeneration] = useState(false)
  const generationClickLockRef = useRef(false)
  const hoverHideTimerRef = useRef<number | null>(null)
  const nodeRootRef = useRef<HTMLDivElement | null>(null)
  const [floatingHost, setFloatingHost] = useState<HTMLElement | null>(null)
  const [floatingRect, setFloatingRect] = useState<FloatingRect | null>(null)

  const storeManualStartFrame = useAppStore(
    (state) => state.nodesMap.get(node.id)?.settings?.manualStartFrame
  )
  const storeManualEndFrame = useAppStore(
    (state) => state.nodesMap.get(node.id)?.settings?.manualEndFrame
  )
  const storeVeoFramesMode = useAppStore(
    (state) => state.nodesMap.get(node.id)?.settings?.veoFramesMode
  )
  const isNodeSelected = useAppStore((state) => {
    const selectedNodeIds = state.selectedNodeIds as Set<string> | string[]
    if (selectedNodeIds instanceof Set) return selectedNodeIds.has(node.id)
    if (Array.isArray(selectedNodeIds)) return selectedNodeIds.includes(node.id)
    return state.selectedNodeId === node.id
  })
  const prevLayoutRef = useRef({ nodeWidth: 320, nodeHeight: 420 })
  const { nodeWidth, nodeHeight } = useAppStore(
    useCallback(
      (state) => {
        const n = state.nodesMap.get(node.id)
        const w = n?.width ?? node.width ?? 320
        const h = n?.height ?? node.height ?? 420
        const prev = prevLayoutRef.current
        if (prev.nodeWidth === w && prev.nodeHeight === h) {
          return prev
        }
        const next = { nodeWidth: w, nodeHeight: h }
        prevLayoutRef.current = next
        return next
      },
      [node.id, node.width, node.height]
    )
  )

  // 只订阅布尔值，避免 find() 返回不稳定对象引用导致无限重渲染
  const historyGenerationState = useAppStore((state) => {
    const items = state.history || []
    const now = Date.now()
    for (let i = 0; i < items.length; i += 1) {
      const h = items[i]
      const sourceNodeId =
        h?.sourceNodeId || h?.nodeId || h?.payload?.nodeId || h?.originalPayload?.nodeId
      if (sourceNodeId !== node.id) continue
      if (isActiveGenerationStatus(h.status)) return isStaleActiveHistory(h, now) ? 'stale' : 'active'
      if (h.status === 'completed' || h.status === 'failed' || h.status === 'cancelled') {
        return 'terminal'
      }
    }
    return 'none'
  })
  const hasFreshHistoryGeneration = historyGenerationState === 'active'
  const shouldTrustNodeGenerationState = historyGenerationState !== 'stale'
  const isGenerating =
    isSubmittingGeneration ||
    (shouldTrustNodeGenerationState &&
      (node.settings?.isGenerating === true || isActiveGenerationStatus(node.settings?.status))) ||
    hasFreshHistoryGeneration
  const historyFallbackResults = useAppStore(
    useShallow(
      useCallback(
        (state) => {
          const matched = []
          const items = state.history || []
          for (let index = 0; index < items.length && matched.length < 12; index += 1) {
            const item = items[index]
            const sourceNodeId = item?.sourceNodeId || item?.nodeId || item?.originalPayload?.nodeId
            if (sourceNodeId !== node.id) continue
            if (item.status !== 'completed') continue
            if (!item.url && !item.resultUrl && !item.localCacheUrl) continue
            matched.push(item)
          }
          return matched.reverse()
        },
        [node.id]
      )
    )
  )
  const settingsOutputResults = Array.isArray(node.settings?.outputResults)
    ? node.settings.outputResults
    : []
  const outputResults = settingsOutputResults.some(hasRenderableResult)
    ? settingsOutputResults
    : historyFallbackResults

  const connectedAudios = getConnectedAudioNodes ? getConnectedAudioNodes(node.id) : []
  const assetPreviewMap = node.settings?.assetPreviewMap || {}
  const imageAssetRefs = (node.settings?.assetIds || []).map((assetRef) => {
    const assetId =
      typeof assetRef === 'object'
        ? assetRef?.id || assetRef?.assetId || assetRef?.seedanceId
        : assetRef
    const previewSrc =
      assetPreviewMap[assetId] || assetPreviewMap[String(assetId || '').replace(/^asset-/, '')]
    return previewSrc ? { id: assetId, seedanceId: assetId, path: previewSrc } : assetRef
  })
  const allRefImages = [
    ...connectedImages,
    ...(node.settings?.manualImages || []),
    ...imageAssetRefs
  ]
  const allRefAudios = [
    ...connectedAudios,
    ...(node.settings?.manualAudios || []),
    ...(node.settings?.audioAssetIds || [])
  ]
  const sourceVideoUrls = node.settings?.sourceVideosText
    ? node.settings.sourceVideosText.split('\n').filter((value) => value.trim())
    : []
  const allRefVideos = [
    ...(node.settings?.manualVideos || []),
    ...(node.settings?.videoAssetIds || []),
    ...sourceVideoUrls
  ]

  const model = apiConfigsMap.get(node.settings?.model)
  const modelId = model?.id || model?.modelName || node.settings?.model || ''
  const isVeo31 = modelId.includes('veo3.1')
  const isSeedance =
    modelId.toLowerCase().includes('seedance') ||
    modelId.toLowerCase().includes('doubao') ||
    (model?.modelName &&
      (model.modelName.toLowerCase().includes('seedance') ||
        model.modelName.toLowerCase().includes('doubao'))) ||
    (model?.provider &&
      (model.provider.toLowerCase().includes('seedance') ||
        model.provider.toLowerCase().includes('doubao')))

  const startFrame =
    storeManualStartFrame ||
    node.settings?.manualStartFrame ||
    getConnectedImageForInput(node.id, 'veo_start')
  const endFrame =
    storeManualEndFrame ||
    node.settings?.manualEndFrame ||
    getConnectedImageForInput(node.id, 'veo_end')

  const hasMaskInfo = useMemo(() => {
    if (node.type !== 'gen-image') return null
    let incomingConnection = connections.find(
      (connection) =>
        connection.to === node.id && (!connection.inputType || connection.inputType === 'default')
    )
    if (!incomingConnection) {
      incomingConnection = connections.find((connection) => connection.to === node.id)
    }
    const sourceNode = incomingConnection ? nodesMap.get(incomingConnection.from) : null
    const hasMask = node?.maskContent || (sourceNode && sourceNode.maskContent)
    return hasMask
      ? { hasMask: true, hasMaskFromSource: !!(sourceNode && sourceNode.maskContent) }
      : null
  }, [connections, node.id, node.maskContent, node.type, nodesMap])

  const handleGenerate = async (event) => {
    event.stopPropagation()
    if (isGenerating || generationClickLockRef.current) return
    generationClickLockRef.current = true
    setIsSubmittingGeneration(true)

    try {
      const basePrompt =
        node.type === 'gen-image' ? node.settings?.prompt || '' : node.settings?.videoPrompt || ''

      const appliedTemplates =
        node.type === 'gen-image'
          ? node.settings?.appliedTemplates || []
          : node.settings?.appliedVideoTemplates || []
      const templateContents = appliedTemplates.map((template) => template.content).filter(Boolean)

      const connectedTexts = getConnectedTextNodes(node.id)
      const allPromptParts = [...templateContents, ...connectedTexts]
      if (basePrompt) allPromptParts.push(basePrompt)
      const rawPrompt = allPromptParts.join(' ')

      const manualImagePaths = (node.settings?.manualImages || []).map((path) =>
        getXingheMediaSrc(path)
      )
      const assetIdRefs = node.settings?.assetIds || []
      let finalConnectedImages = [...connectedImages, ...manualImagePaths, ...assetIdRefs]
      const payloadSettings = { ...node.settings, batchSize: 1 }

      if (node.type === 'gen-video' && node.settings?.veoFramesMode) {
        const firstFrame =
          node.settings?.manualStartFrame || getConnectedImageForInput(node.id, 'veo_start')
        const lastFrame =
          node.settings?.manualEndFrame || getConnectedImageForInput(node.id, 'veo_end')
        finalConnectedImages = []
        const roles = []
        if (firstFrame) {
          finalConnectedImages.push(firstFrame)
          roles.push('first_frame')
        }
        if (lastFrame) {
          finalConnectedImages.push(lastFrame)
          roles.push('last_frame')
        }
        payloadSettings.imageRoles = roles.length > 0 ? roles : undefined
        payloadSettings.generationMode = 'image-first-last-frame'
      }

      if (node.type === 'gen-video') {
        const localVideos = node.settings?.manualVideos || []
        const videoAssetIds = node.settings?.videoAssetIds || []
        const textVideoUrls = node.settings?.sourceVideosText
          ? node.settings.sourceVideosText.split('\n').filter((value) => value.trim())
          : []
        const allVideos = [...localVideos, ...videoAssetIds, ...textVideoUrls]
        payloadSettings.sourceVideos = allVideos.length > 0 ? allVideos : undefined
        const generatedAudios = getConnectedAudioNodes ? getConnectedAudioNodes(node.id) : []
        const manualAudios = node.settings?.manualAudios || []
        const audioAssetIds = node.settings?.audioAssetIds || []
        const allAudios = [...generatedAudios, ...manualAudios, ...audioAssetIds]
        payloadSettings.sourceAudios = allAudios.length > 0 ? allAudios : undefined
      }

      const hiddenPromptParts = [
        buildHiddenCameraPrompt(node.settings?._cameraToolState),
        buildHiddenLightingPrompt(node.settings?._lightingToolState)
      ].filter(Boolean)

      let finalPrompt = [...allPromptParts, ...hiddenPromptParts]
        .join(', ')
        .replace(/@图片(\d+)\s?/g, '【图片$1】')
        .replace(/@素材(\d+)\s?/g, '【图片$1】')
        .replace(/@音频(\d+)\s?/g, '【音频$1】')
        .replace(/@视频(\d+)\s?/g, '【视频$1】')

      if (node.type === 'gen-image' && node.settings?._isPanorama) {
        finalPrompt = buildPanoramaPrompt(finalPrompt, finalConnectedImages.length > 0)
      } else if (node.type === 'gen-video' && node.settings?._isPanorama) {
        finalPrompt = buildVideoPanoramaPrompt(finalPrompt)
      }

      const batchSize = node.settings?.batchSize || 1
      for (let index = 0; index < batchSize; index += 1) {
        await startGeneration(
          finalPrompt,
          node.type === 'gen-image' ? 'image' : 'video',
          finalConnectedImages,
          node.id,
          {
            ...payloadSettings,
            allowNodeConcurrency: batchSize > 1
          }
        )
        if (index < batchSize - 1) await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    } finally {
      generationClickLockRef.current = false
      setIsSubmittingGeneration(false)
    }
  }

  const prompt =
    node.type === 'gen-image' ? node.settings?.prompt || '' : node.settings?.videoPrompt || ''
  const showFrames =
    node.type === 'gen-video' &&
    (storeVeoFramesMode ?? node.settings?.veoFramesMode) &&
    (isVeo31 || isSeedance)

  const previewImage =
    node.settings?.outputResults
      ?.slice()
      .reverse()
      .find((result: any) => result?.type !== 'video')?.url ||
    node.settings?.manualStartFrame ||
    node.settings?.manualImages?.[0] ||
    startFrame ||
    connectedImages?.[0] ||
    null
  const hasCameraToolState = !!node.settings?._cameraToolState
  const hasLightingToolState = !!node.settings?._lightingToolState
  const isOwnDropdownOpen = activeDropdown?.nodeId === node.id

  useEffect(() => {
    setFloatingHost(document.body)
  }, [])

  const updateFloatingRect = useCallback(() => {
    const anchor =
      (nodeRootRef.current?.closest('.react-flow__node') as HTMLElement | null) ||
      nodeRootRef.current
    if (!anchor) return

    const rect = anchor.getBoundingClientRect()
    const next = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    }

    setFloatingRect((prev) => {
      if (
        prev &&
        Math.abs(prev.left - next.left) < 0.5 &&
        Math.abs(prev.top - next.top) < 0.5 &&
        Math.abs(prev.width - next.width) < 0.5 &&
        Math.abs(prev.height - next.height) < 0.5
      ) {
        return prev
      }
      return next
    })
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (target?.closest?.(`[data-gen-node-layer="${node.id}"]`)) return
      setFloatingControlsPinned(false)
      setActiveToolPanel(null)
    }

    window.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      if (hoverHideTimerRef.current) {
        window.clearTimeout(hoverHideTimerRef.current)
      }
      window.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [node.id])

  const handleNodeMouseEnter = useCallback(() => {
    if (hoverHideTimerRef.current) {
      window.clearTimeout(hoverHideTimerRef.current)
      hoverHideTimerRef.current = null
    }
    setIsHovered(true)
    setFloatingControlsPinned(true)
  }, [])

  const handleNodeMouseLeave = useCallback(() => {
    if (hoverHideTimerRef.current) {
      window.clearTimeout(hoverHideTimerRef.current)
    }
    hoverHideTimerRef.current = window.setTimeout(() => {
      setIsHovered(false)
      hoverHideTimerRef.current = null
    }, 160)
  }, [])

  const handleFloatingControlsMouseEnter = useCallback(() => {
    if (hoverHideTimerRef.current) {
      window.clearTimeout(hoverHideTimerRef.current)
      hoverHideTimerRef.current = null
    }
    setIsFloatingControlsHovered(true)
    setFloatingControlsPinned(true)
  }, [])

  const handleFloatingControlsMouseLeave = useCallback(() => {
    setIsFloatingControlsHovered(false)
  }, [])

  const handlePinFloatingControls = useCallback(() => {
    if (hoverHideTimerRef.current) {
      window.clearTimeout(hoverHideTimerRef.current)
      hoverHideTimerRef.current = null
    }
    setFloatingControlsPinned(true)
    setIsFloatingControlsHovered(true)
  }, [])

  const shouldShowFloatingControls =
    isHovered ||
    isNodeSelected ||
    isFloatingControlsHovered ||
    floatingControlsPinned ||
    activeToolPanel ||
    isOwnDropdownOpen

  useEffect(() => {
    if (!shouldShowFloatingControls) {
      setFloatingRect(null)
      return
    }

    let frameId = 0
    const tick = () => {
      updateFloatingRect()
      frameId = window.requestAnimationFrame(tick)
    }

    tick()
    window.addEventListener('resize', updateFloatingRect)
    window.addEventListener('scroll', updateFloatingRect, true)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', updateFloatingRect)
      window.removeEventListener('scroll', updateFloatingRect, true)
    }
  }, [shouldShowFloatingControls, updateFloatingRect])

  const handleActivatePanorama = useCallback(() => {
    if (node.type === 'gen-image') {
      enablePanoramaMode(node.id, node.settings, updateNodeSettings)
      return
    }
    updateNodeSettings(node.id, {
      _isPanorama: !node.settings?._isPanorama
    })
  }, [node.id, node.settings, node.type, updateNodeSettings])

  const handleApplyCameraTool = useCallback(
    (toolState: any) => {
      updateNodeSettings(node.id, { _cameraToolState: toolState })
    },
    [node.id, updateNodeSettings]
  )

  const handleApplyLightingTool = useCallback(
    (toolState: any) => {
      updateNodeSettings(node.id, { _lightingToolState: toolState })
    },
    [node.id, updateNodeSettings]
  )

  const handleClearCameraTool = useCallback(() => {
    updateNodeSettings(node.id, { _cameraToolState: undefined })
  }, [node.id, updateNodeSettings])

  const handleClearLightingTool = useCallback(() => {
    updateNodeSettings(node.id, { _lightingToolState: undefined })
  }, [node.id, updateNodeSettings])

  const toggleImageToolPanel = useCallback((panel: 'camera' | 'lighting') => {
    setActiveToolPanel((current) => (current === panel ? null : panel))
  }, [])

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      const imageItems = Array.from(items).filter((item) => item.type.indexOf('image') !== -1)
      if (imageItems.length === 0) return

      const files = imageItems.map((item) => item.getAsFile()).filter(Boolean)
      if (files.length === 0) return

      // We do NOT preventDefault to allow text to still paste into the textarea if it's focused.

      try {
        const savedPaths: string[] = []
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          if (!canReadFileAsDataUrl(file, 'Pasted image')) {
            continue
          }
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = (event) => resolve(String(event.target?.result || ''))
            reader.onerror = reject
            reader.readAsDataURL(file as File)
          })
          const saved = await window.api.localCacheAPI.saveCache(
            withProjectCacheContext({
              id: `paste_${Date.now()}_${i}`,
              content: base64,
              category: 'manual',
              ext: '.png',
              type: 'image'
            })
          )
          if (saved?.success && saved.path) {
            savedPaths.push(saved.path)
          }
        }

        if (savedPaths.length > 0) {
          const existing = node.settings?.manualImages || []
          updateNodeSettings(node.id, { manualImages: [...existing, ...savedPaths] })
        }
      } catch (err) {
        console.error('[GenNode] Failed to paste image:', err)
      }
    },
    [node.id, node.settings?.manualImages, updateNodeSettings]
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const files = Array.from(e.dataTransfer.files || [])
      const assetPath = e.dataTransfer.getData('asset-path')
      const assetPathsJson = e.dataTransfer.getData('asset-paths')
      const seedanceId = e.dataTransfer.getData('seedance-id')
      const seriesAssetRaw = e.dataTransfer.getData('application/x-xinghe-series-asset')
      if (seriesAssetRaw) {
        try {
          const seriesAsset = JSON.parse(seriesAssetRaw)
          if (seriesAsset?.source === 'series-asset-library') {
            const updates: any = {}
            if (seriesAsset.imageUrl) {
              updates.manualImages = [...(node.settings?.manualImages || []), seriesAsset.imageUrl]
            }
            if (seriesAsset.prompt || seriesAsset.name) {
              const promptKey = node.type === 'gen-video' ? 'videoPrompt' : 'prompt'
              const currentPrompt = node.settings?.[promptKey] || ''
              const nextPrompt = seriesAsset.prompt || seriesAsset.name
              updates[promptKey] = currentPrompt
                ? `${currentPrompt}\n@${seriesAsset.name} ${nextPrompt}`
                : nextPrompt
            }
            if (Object.keys(updates).length > 0) updateNodeSettings(node.id, updates)
            return
          }
        } catch {}
      }

      const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
      const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']
      const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'webm', 'mkv']

      // 如果检测到 seedance-id，直接将它吸收入库资产池，不再走物理图片的分拣流程
      if (seedanceId) {
        const assetType = e.dataTransfer.getData('asset-type') || ''
        const assetPreviewMap = assetPath
          ? { ...(node.settings?.assetPreviewMap || {}), [seedanceId]: assetPath }
          : node.settings?.assetPreviewMap
        if (assetType.startsWith('video/')) {
          const currentVideoAssetIds = node.settings?.videoAssetIds || []
          if (!currentVideoAssetIds.includes(seedanceId)) {
            updateNodeSettings(node.id, {
              videoAssetIds: [...currentVideoAssetIds, seedanceId],
              ...(assetPreviewMap ? { assetPreviewMap } : {})
            })
          }
        } else if (assetType.startsWith('audio/')) {
          const currentAudioAssetIds = node.settings?.audioAssetIds || []
          if (!currentAudioAssetIds.includes(seedanceId)) {
            updateNodeSettings(node.id, {
              audioAssetIds: [...currentAudioAssetIds, seedanceId],
              ...(assetPreviewMap ? { assetPreviewMap } : {})
            })
          }
        } else {
          const currentAssetIds = node.settings?.assetIds || []
          if (!currentAssetIds.includes(seedanceId)) {
            updateNodeSettings(node.id, {
              assetIds: [...currentAssetIds, seedanceId],
              ...(assetPreviewMap ? { assetPreviewMap } : {})
            })
          }
        }
        return
      }

      let internalPaths: string[] = []
      if (assetPath) {
        internalPaths.push(assetPath)
      } else if (assetPathsJson) {
        try {
          const paths = JSON.parse(assetPathsJson)
          if (Array.isArray(paths)) internalPaths = paths
        } catch (err) {}
      }

      // 如果没有本地物理文件也没有内部资产库路径，直接退出
      if (files.length === 0 && internalPaths.length === 0) return

      // 如果已经从资产库拿到了内部路径，就不再处理 dataTransfer.files（避免同一张图被添加两次）
      const externalFiles = internalPaths.length > 0 ? [] : files

      try {
        const newImages = []
        const newVideos = []
        const newAudios = []

        // 处理从资产库等内部拖拽过来的纯路径
        for (const path of internalPaths) {
          if (!path) continue
          const ext = path.split('.').pop()?.toLowerCase() || ''
          if (IMAGE_EXTENSIONS.includes(ext)) newImages.push(path)
          else if (VIDEO_EXTENSIONS.includes(ext)) newVideos.push(path)
          else if (AUDIO_EXTENSIONS.includes(ext)) newAudios.push(path)
        }

        for (let i = 0; i < externalFiles.length; i++) {
          const file = externalFiles[i]
          const ext = file.name.split('.').pop()?.toLowerCase() || ''
          let type = ''
          let category = 'gen-media'

          if (IMAGE_EXTENSIONS.includes(ext)) type = 'image'
          else if (VIDEO_EXTENSIONS.includes(ext)) type = 'video'
          else if (AUDIO_EXTENSIONS.includes(ext)) type = 'audio'
          else continue

          let finalPath = ''

          if (file.path) {
            const copied = await window.api.invoke(
              'cache:copy-file',
              withProjectCacheContext({
                id: `drop_${node.id}_${Date.now()}_${i}`,
                sourcePath: file.path,
                category,
                type
              })
            )
            if (copied?.success && copied.path) finalPath = copied.path
          }

          if (!finalPath) {
            if (!canReadFileAsDataUrl(file, `${type} drop`)) {
              continue
            }
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = (event) => resolve(String(event.target?.result || ''))
              reader.onerror = reject
              reader.readAsDataURL(file)
            })
            const saved = await window.api.localCacheAPI.saveCache(
              withProjectCacheContext({
                id: `drop_${node.id}_${Date.now()}_${i}`,
                content: base64,
                category,
                ext: `.${ext}`,
                type
              })
            )
            if (saved?.success && saved.path) finalPath = saved.path
          }

          if (finalPath) {
            if (type === 'image') newImages.push(finalPath)
            else if (type === 'video') newVideos.push(finalPath)
            else if (type === 'audio') newAudios.push(finalPath)
          }
        }

        const updates: any = {}
        if (newImages.length > 0) {
          updates.manualImages = [...(node.settings?.manualImages || []), ...newImages]
        }
        if (newVideos.length > 0) {
          updates.manualVideos = [...(node.settings?.manualVideos || []), ...newVideos]
        }
        if (newAudios.length > 0) {
          updates.manualAudios = [...(node.settings?.manualAudios || []), ...newAudios]
        }

        if (Object.keys(updates).length > 0) {
          updateNodeSettings(node.id, updates)
        }
      } catch (err) {
        console.error('[GenNode] Failed to handle drop:', err)
      }
    },
    [node.id, node.settings, updateNodeSettings]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  return (
    <div
      ref={nodeRootRef}
      className="flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)] pointer-events-auto outline-none"
      tabIndex={-1}
      data-gen-node-layer={node.id}
      data-onboarding="node-example"
      onMouseEnter={handleNodeMouseEnter}
      onMouseLeave={handleNodeMouseLeave}
      onMouseDown={handlePinFloatingControls}
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      style={{
        background: 'color-mix(in srgb, var(--bg-card) 18%, transparent)',
        border: '1px solid rgba(255, 255, 255, 0.07)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.045)',
        backdropFilter: 'blur(12px) saturate(120%)',
        WebkitBackdropFilter: 'blur(12px) saturate(120%)',
        transition: 'border-color var(--duration-normal) var(--ease-in-out)'
      }}
    >
      <div className="flex flex-1 flex-col min-h-0">
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          {hasMaskInfo && (
            <div className="mx-3 mt-2 flex items-center gap-2 rounded-xl border border-[var(--primary-color)]/20 bg-[var(--primary-color)]/10 px-2.5 py-1.5 text-[10px] font-medium text-[var(--primary-color)] shadow-sm">
              <Eraser size={12} className="shrink-0" />
              <span>{hasMaskInfo.hasMaskFromSource ? '已链接蒙版区域' : '已设置蒙版区域'}</span>
            </div>
          )}

          {node.settings?._isPanorama && <PanoramaBanner onClose={handleActivatePanorama} />}

          {node.settings?.error && (
            <div className="mx-3 mt-2 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[10px] text-red-100 shadow-sm">
              <AlertCircle size={12} className="mt-0.5 shrink-0 text-red-300" />
              <span className="min-w-0 flex-1 leading-snug">{friendlyError(node.settings.error)}</span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  updateNodeSettings(node.id, { error: null })
                }}
                className="shrink-0 rounded p-0.5 text-red-200/70 transition-colors hover:bg-red-500/20 hover:text-red-100"
                title="关闭"
              >
                <X size={10} />
              </button>
            </div>
          )}

          <GenPromptArea
            nodeId={node.id}
            nodeType={node.type}
            prompt={prompt}
            updateNodeSettings={updateNodeSettings}
            allRefImages={allRefImages}
            allRefAudios={allRefAudios}
            allRefVideos={allRefVideos}
            placeholder={
              node.type === 'gen-image'
                ? '描述你想要生成的画面内容，按 / 呼出指令，@ 引用素材'
                : '今天我们要创作什么'
            }
            data-onboarding="node-prompt"
          />
        </div>
      </div>

      {showFrames && (
        <GenMediaPanel
          nodeId={node.id}
          nodeType={node.type}
          showFrames={showFrames}
          startFrame={startFrame}
          endFrame={endFrame}
          updateNodeSettings={updateNodeSettings}
          setLightboxItem={setLightboxItem}
          framesOnly
        />
      )}

      <GenToolbar
        nodeId={node.id}
        nodeType={node.type}
        settings={node.settings}
        apiConfigs={apiConfigs}
        apiConfigsMap={apiConfigsMap}
        activeDropdown={activeDropdown}
        setActiveDropdown={setActiveDropdown}
        updateNodeSettings={updateNodeSettings}
        getStatusColor={getStatusColor}
        handleGenerate={handleGenerate}
        isGenerating={isGenerating}
        onActivatePanorama={handleActivatePanorama}
      />

      <OutputResultsPanel
        results={outputResults}
        nodeId={node.id}
        updateNodeSettings={updateNodeSettings}
        setLightboxItem={setLightboxItem}
        startGeneration={startGeneration}
      />

      {(node.type === 'gen-image' || node.type === 'gen-video') && shouldShowFloatingControls && (
        <FloatingMediaTray
          host={floatingHost}
          nodeRect={floatingRect}
          layerId={node.id}
          stacked={node.type === 'gen-video'}
          onMouseEnter={handleFloatingControlsMouseEnter}
          onMouseLeave={handleFloatingControlsMouseLeave}
          onPin={handlePinFloatingControls}
        >
          <GenMediaPanel
            nodeId={node.id}
            nodeType={node.type}
            connectedImages={connectedImages}
            manualImages={node.settings?.manualImages}
            manualAudios={node.settings?.manualAudios}
            connectedAudios={connectedAudios}
            assetIds={node.settings?.assetIds}
            videoAssetIds={node.settings?.videoAssetIds}
            audioAssetIds={node.settings?.audioAssetIds}
            showFrames={false}
            startFrame={startFrame}
            endFrame={endFrame}
            updateNodeSettings={updateNodeSettings}
            setLightboxItem={setLightboxItem}
            showSourceVideos={node.type === 'gen-video' && isSeedance}
            sourceVideosText={node.settings?.sourceVideosText}
            manualVideos={node.settings?.manualVideos}
            floating
          />
        </FloatingMediaTray>
      )}

      {(node.type === 'gen-image' || node.type === 'gen-video') && shouldShowFloatingControls && (
        <FloatingImageControls
          nodeWidth={nodeWidth}
          nodeHeight={nodeHeight}
          host={floatingHost}
          nodeRect={floatingRect}
          activePanel={activeToolPanel}
          cameraToolState={node.settings?._cameraToolState}
          lightingToolState={node.settings?._lightingToolState}
          hasCameraToolState={hasCameraToolState}
          hasLightingToolState={hasLightingToolState}
          isPanorama={!!node.settings?._isPanorama}
          previewImage={previewImage}
          onOpenCamera={() => toggleImageToolPanel('camera')}
          onOpenLighting={() => toggleImageToolPanel('lighting')}
          onOpenPanorama={handleActivatePanorama}
          onApplyCamera={handleApplyCameraTool}
          onApplyLighting={handleApplyLightingTool}
          onClearCamera={handleClearCameraTool}
          onClearLighting={handleClearLightingTool}
          onClosePanel={() => setActiveToolPanel(null)}
          onMouseEnter={handleFloatingControlsMouseEnter}
          onMouseLeave={handleFloatingControlsMouseLeave}
          onPin={handlePinFloatingControls}
          layerId={node.id}
        />
      )}
    </div>
  )
}, areGenNodePropsEqual)

function FloatingMediaTray({
  host,
  nodeRect,
  layerId,
  stacked,
  children,
  onMouseEnter,
  onMouseLeave,
  onPin
}: {
  host: HTMLElement | null
  nodeRect: FloatingRect | null
  layerId: string
  stacked?: boolean
  children: React.ReactNode
  onMouseEnter: () => void
  onMouseLeave: () => void
  onPin: () => void
}) {
  if (!host || !nodeRect) return null

  return createPortal(
    <div
      className="pointer-events-auto"
      style={{
        position: 'fixed',
        left: nodeRect.left,
        top: nodeRect.top + (stacked ? -150 : -52),
        transform: 'none',
        zIndex: 86
      }}
      data-gen-node-layer={layerId}
      onPointerDownCapture={onPin}
      onMouseDown={(event) => {
        event.stopPropagation()
        onPin()
      }}
      onClick={onPin}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>,
    host
  )
}

function buildVideoPanoramaPrompt(prompt: string) {
  const basePrompt = (prompt || 'wide cinematic scene').trim()
  const suffix = PANORAMA_TEXT2IMG_SUFFIX.replace('panoramic view', 'panoramic video scene')
  return `${basePrompt}${suffix}, smooth camera motion, immersive ultra wide video composition`
}

function FloatingImageControls({
  nodeWidth,
  nodeHeight,
  host,
  nodeRect,
  activePanel,
  cameraToolState,
  lightingToolState,
  hasCameraToolState,
  hasLightingToolState,
  isPanorama,
  previewImage,
  onOpenCamera,
  onOpenLighting,
  onOpenPanorama,
  onApplyCamera,
  onApplyLighting,
  onClearCamera,
  onClearLighting,
  onClosePanel,
  onMouseEnter,
  onMouseLeave,
  onPin,
  layerId
}: {
  nodeWidth: number
  nodeHeight: number
  host: HTMLElement | null
  nodeRect: FloatingRect | null
  activePanel: 'camera' | 'lighting' | null
  cameraToolState?: any
  lightingToolState?: any
  hasCameraToolState: boolean
  hasLightingToolState: boolean
  isPanorama: boolean
  previewImage: string | null
  onOpenCamera: () => void
  onOpenLighting: () => void
  onOpenPanorama: () => void
  onApplyCamera: (state: any) => void
  onApplyLighting: (state: any) => void
  onClearCamera: () => void
  onClearLighting: () => void
  onClosePanel: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  onPin: () => void
  layerId: string
}) {
  if (!host || !nodeRect) return null

  const rectWidth = nodeRect.width || nodeWidth
  const rectHeight = nodeRect.height || nodeHeight

  return createPortal(
    <>
      <div
        className="pointer-events-auto"
        style={{
          position: 'fixed',
          left: nodeRect.left - 14,
          top: nodeRect.top - 8,
          transform: 'translateX(-100%)',
          zIndex: 88
        }}
        data-gen-node-layer={layerId}
        onPointerDownCapture={onPin}
        onMouseDown={(event) => {
          event.stopPropagation()
          onPin()
        }}
        onClick={onPin}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div className="flex flex-col items-stretch gap-2">
          <QuickActionButton
            icon={<Sparkles size={13} />}
            label="全景"
            badge="NEW"
            active={isPanorama}
            onClick={onOpenPanorama}
          />
          <QuickActionButton
            icon={<Camera size={13} />}
            label="多角度"
            active={activePanel === 'camera' || hasCameraToolState}
            onClick={onOpenCamera}
          />
          <QuickActionButton
            icon={<Sun size={13} />}
            label="打光"
            active={activePanel === 'lighting' || hasLightingToolState}
            onClick={onOpenLighting}
          />
        </div>
      </div>

      {activePanel && (
        <div
          className="pointer-events-auto"
          style={{
            position: 'fixed',
            left: nodeRect.left + rectWidth / 2,
            top: nodeRect.top + rectHeight + 14,
            transform: 'translateX(-50%)',
            zIndex: 80
          }}
          data-gen-node-layer={layerId}
          onPointerDownCapture={onPin}
          onMouseDown={(event) => {
            event.stopPropagation()
            onPin()
          }}
          onClick={onPin}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        >
          <GenImageToolPanel
            kind={activePanel}
            previewImage={previewImage}
            initialState={activePanel === 'camera' ? cameraToolState : lightingToolState}
            onApply={activePanel === 'camera' ? onApplyCamera : onApplyLighting}
            onClear={activePanel === 'camera' ? onClearCamera : onClearLighting}
            onClose={onClosePanel}
          />
        </div>
      )}
    </>,
    host
  )
}

function QuickActionButton({
  icon,
  label,
  badge,
  active,
  onClick
}: {
  icon: React.ReactNode
  label: string
  badge?: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      onMouseDown={(event) => event.stopPropagation()}
      className={`group inline-flex h-8 min-w-8 items-center justify-center gap-0 rounded-[10px] border px-1.5 text-left shadow-[0_6px_14px_rgba(0,0,0,0.12)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:min-w-[82px] hover:gap-1.5 ${
        active
          ? 'border-transparent bg-[color-mix(in_srgb,var(--bg-panel)_38%,transparent)] text-[var(--text-primary)]'
          : 'border-transparent bg-[color-mix(in_srgb,var(--bg-panel)_28%,transparent)] text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--bg-panel)_40%,transparent)] hover:text-[var(--text-primary)]'
      }`}
    >
      <span className="flex h-5 w-5 items-center justify-center text-current">{icon}</span>
      <span className="w-0 overflow-hidden whitespace-nowrap text-[11px] font-medium opacity-0 transition-all group-hover:w-auto group-hover:opacity-100">
        {label}
      </span>
      {badge && (
        <span className="hidden rounded-full bg-white/14 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)] group-hover:inline-flex">
          {badge}
        </span>
      )}
    </button>
  )
}

function PanoramaBanner({ onClose }: { onClose: () => void }) {
  return (
    <div className="mx-3 mb-1 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--bg-elevated)] text-[var(--text-primary)]">
          <Sparkles size={12} />
        </div>
        <div className="min-w-0 flex-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
          <span className="mr-2 font-semibold text-[var(--text-primary)]">720°全景已开启</span>
          生成时会自动按全景模式处理参考图和画面比例。
        </div>
        <button
          onClick={onClose}
          onMouseDown={(event) => event.stopPropagation()}
          className="rounded-lg p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title="关闭 720 全景"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}
