import { memo, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import {
  getPreferredMediaUrl,
  getPreferredMediaUrls,
  getXingheMediaSrc
} from '../../utils/fileHelpers.ts'
import { ThumbnailImage } from '../ui/ThumbnailImage.tsx'
import { VideoThumbnail } from '../ui/VideoThumbnail.tsx'
import { useAppStore } from '../../store/useAppStore.ts'
import { PanoramaViewer } from '../../features/panorama/PanoramaViewer.tsx'
import { addAssetToLibrary } from '../../utils/assetLibrary.ts'
import { addGeneratedResultToFavorites } from '../../features/cloud-assets/favoritesStore.ts'
import { PET_RADAR_EVENT } from '../../features/chat/pet/usePetTaskRadar.ts'

function hasRenderableResult(result: any) {
  return Boolean(getPreferredMediaUrl(result))
}

function getViewportWorldBounds(viewport: Element) {
  if (typeof window === 'undefined') return null

  const container = viewport.parentElement
  if (!container) return null

  const transform = window.getComputedStyle(viewport).transform
  let scale = 1
  let tx = 0
  let ty = 0

  if (transform && transform !== 'none') {
    if (transform.startsWith('matrix3d(')) {
      const values = transform
        .slice(9, -1)
        .split(',')
        .map((value) => Number(value.trim()))
      scale = values[0] || 1
      tx = values[12] || 0
      ty = values[13] || 0
    } else if (transform.startsWith('matrix(')) {
      const values = transform
        .slice(7, -1)
        .split(',')
        .map((value) => Number(value.trim()))
      scale = values[0] || 1
      tx = values[4] || 0
      ty = values[5] || 0
    }
  }

  const rect = container.getBoundingClientRect()
  return {
    left: -tx / scale,
    top: -ty / scale,
    right: (rect.width - tx) / scale,
    bottom: (rect.height - ty) / scale
  }
}

export const OutputResultsPanel = memo(function OutputResultsPanel({
  results: propResults,
  nodeId,
  updateNodeSettings,
  setLightboxItem,
  startGeneration
}: any) {
  const [contextMenu, setContextMenu] = useState<any>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [editPopup, setEditPopup] = useState<any>(null)
  const [editPrompt, setEditPrompt] = useState('')
  const [dims, setDims] = useState<Record<number, string>>({})
  const [panoramaResult, setPanoramaResult] = useState<any>(null)
  const [panelHovered, setPanelHovered] = useState(false)

  const nodeLayout = useAppStore(
    useShallow(
      useCallback(
        (state) => {
          const n = state.nodesMap.get(nodeId)
          const x = n?.position?.x ?? n?.x ?? 0
          const y = n?.position?.y ?? n?.y ?? 0
          const w = n?.width ?? 300
          return { x, y, w }
        },
        [nodeId]
      )
    )
  )
  const nodeX = nodeLayout.x
  const nodeY = nodeLayout.y
  const nodeWidth = nodeLayout.w
  const nodeExists = useAppStore((state) => state.nodesMap.has(nodeId))
  const storeResults = useAppStore((state) => state.nodesMap.get(nodeId)?.settings?.outputResults)

  const storeRenderableResults = Array.isArray(storeResults)
    ? storeResults.filter(hasRenderableResult)
    : []
  const propRenderableResults = Array.isArray(propResults)
    ? propResults.filter(hasRenderableResult)
    : []
  const results = storeRenderableResults.length > 0 ? storeRenderableResults : propRenderableResults

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 1500)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!results?.length) {
      setDims({})
      return
    }

    setDims((prev) => {
      let changed = false
      const next: Record<number, string> = {}
      for (const [key, value] of Object.entries(prev)) {
        const idx = Number(key)
        if (Number.isInteger(idx) && idx >= 0 && idx < results.length) {
          next[idx] = value
        } else {
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [results?.length])

  useEffect(() => {
    if (!contextMenu) return

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (target?.closest?.('[data-context-menu]')) return
      setContextMenu(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null)
    }

    window.addEventListener('pointerdown', closeOnOutsidePointer, true)
    window.addEventListener('keydown', closeOnEscape, true)
    window.addEventListener('blur', closeOnOutsidePointer as any, true)
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer, true)
      window.removeEventListener('keydown', closeOnEscape, true)
      window.removeEventListener('blur', closeOnOutsidePointer as any, true)
    }
  }, [contextMenu])

  if (!results || results.length === 0 || !nodeExists) return null

  const cardSize = 104
  const cardGap = 8
  const expanded = panelHovered || Boolean(contextMenu) || Boolean(editPopup)
  const gridCols = Math.min(3, results.length)
  const gridRows = Math.ceil(results.length / gridCols)
  const expandedPanelWidth = gridCols * cardSize + Math.max(0, gridCols - 1) * cardGap
  const expandedPanelHeight = gridRows * cardSize + Math.max(0, gridRows - 1) * cardGap
  const collapsedPanelWidth = cardSize + Math.min(2, results.length - 1) * 10
  const collapsedPanelHeight = cardSize + Math.min(2, results.length - 1) * 8

  const viewport = document.querySelector('.react-flow__viewport')
  if (!viewport) return null

  const viewportBounds = getViewportWorldBounds(viewport)
  const currentPanelWidth = expanded ? expandedPanelWidth : collapsedPanelWidth
  const currentPanelHeight = expanded ? expandedPanelHeight : collapsedPanelHeight
  let panelX = nodeX + nodeWidth + 12
  let panelY = nodeY

  if (viewportBounds) {
    const margin = 8
    if (panelX + currentPanelWidth > viewportBounds.right - margin) {
      panelX = Math.max(viewportBounds.left + margin, nodeX - currentPanelWidth - 12)
    }
    if (panelY + currentPanelHeight > viewportBounds.bottom - margin) {
      panelY = Math.max(
        viewportBounds.top + margin,
        viewportBounds.bottom - currentPanelHeight - margin
      )
    }
    panelY = Math.max(viewportBounds.top + margin, panelY)
  }

  const handleContextMenu = (event: any, result: any, idx: number) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ x: event.clientX, y: event.clientY, result, idx })
  }

  const closeContextMenu = () => setContextMenu(null)

  const handleViewLarge = (result: any) => {
    if (result?.isPanorama) {
      setPanoramaResult(result)
      closeContextMenu()
      return
    }

    if (setLightboxItem) {
      const isVideo = result.type === 'video'
      const sizeText = dims[results.findIndex((item: any) => item === result)]
      const [width, height] = sizeText ? sizeText.split('x').map((value) => Number(value)) : []
      setLightboxItem({
        ...result,
        type: isVideo ? 'video' : 'image',
        url: getPreferredMediaUrl(result),
        width: result.width || width,
        height: result.height || height,
        requestId: result.requestId || result.id,
        taskId: result.taskId || result.remoteTaskId || result.id
      })
    }
    closeContextMenu()
  }

  const handleEdit = (result: any) => {
    setEditPopup(result)
    setEditPrompt('')
    closeContextMenu()
  }

  const handleSubmitEdit = async () => {
    if (!editPopup || !editPrompt.trim()) return
    const sourceUrl = getPreferredMediaUrl(editPopup)
    if (startGeneration) {
      await startGeneration(editPrompt.trim(), 'image', [sourceUrl], nodeId, {})
    }
    setEditPopup(null)
    setEditPrompt('')
  }

  const handleAddToLibrary = (result: any, category: string, label: string) => {
    const outputPath = getPreferredMediaUrl(result)
    const libraryResult = addAssetToLibrary({
      category,
      path: outputPath,
      name: outputPath?.split(/[/\\]/).pop()?.split('?')[0]
    })

    if (libraryResult?.success) {
      useAppStore.getState().setAssetLibraryOpen?.(true)
    }

    setToast(libraryResult?.success ? `已添加到${label}` : libraryResult?.error || '添加失败')
    closeContextMenu()
  }

  const getResultWithNodeMeta = (result: any) => {
    const node = useAppStore.getState().nodesMap.get(nodeId)
    const rawSourceMeta =
      result?.sourceMeta || node?.settings?.sourceMeta || node?.data?.sourceMeta || null
    const sourceMeta = rawSourceMeta
      ? {
          ...rawSourceMeta,
          cloudProjectId: rawSourceMeta.cloudProjectId || node?.settings?.cloudProjectId || null,
          cloudEpisodeId: rawSourceMeta.cloudEpisodeId || node?.settings?.cloudEpisodeId || null,
          cloudShotId:
            rawSourceMeta.cloudShotId ||
            rawSourceMeta.shotId ||
            node?.settings?.cloudShotId ||
            null,
          objectKey:
            rawSourceMeta.objectKey || result?.objectKey || result?.ossKey || result?.oss_key || ''
        }
      : null
    return {
      ...result,
      sourceNodeId: result?.sourceNodeId || nodeId,
      sourceMeta,
      prompt: result?.prompt || node?.settings?.prompt || node?.settings?.videoPrompt || '',
      modelName: result?.modelName || node?.settings?.model || '',
      objectKey:
        result?.objectKey ||
        result?.ossKey ||
        result?.oss_key ||
        result?.sourceMeta?.objectKey ||
        '',
      ossKey: result?.ossKey || result?.objectKey || result?.oss_key || '',
      requestId: result?.requestId || result?.id || '',
      taskId: result?.taskId || result?.remoteTaskId || result?.id || '',
      remoteTaskId: result?.remoteTaskId || '',
      cloudProjectId: sourceMeta?.cloudProjectId || node?.settings?.cloudProjectId || null,
      cloudEpisodeId: sourceMeta?.cloudEpisodeId || node?.settings?.cloudEpisodeId || null,
      cloudShotId:
        sourceMeta?.cloudShotId || sourceMeta?.shotId || node?.settings?.cloudShotId || null,
      cloudAssignmentId: sourceMeta?.cloudAssignmentId || node?.settings?.cloudAssignmentId || null
    }
  }

  const handleAddToFavorites = (result: any) => {
    const favoriteResult = addGeneratedResultToFavorites(getResultWithNodeMeta(result))
    setToast(favoriteResult.success ? '已添加到收藏夹' : favoriteResult.error || '添加收藏夹失败')
    closeContextMenu()
  }

  const handleUploadToCloudLibrary = async (result: any) => {
    const enriched = getResultWithNodeMeta(result)
    const shotId =
      enriched.sourceMeta?.shotId || enriched.sourceMeta?.cloudShotId || enriched.cloudShotId
    const projectId =
      enriched.sourceMeta?.cloudProjectId ||
      enriched.sourceMeta?.projectId ||
      enriched.cloudProjectId
    const episodeId =
      enriched.sourceMeta?.cloudEpisodeId ||
      enriched.sourceMeta?.episodeId ||
      enriched.cloudEpisodeId
    if (!shotId || !projectId || !episodeId) {
      setToast('缺少云端镜头上下文，无法上传到本集素材库')
      closeContextMenu()
      return
    }

    try {
      window.dispatchEvent(
        new CustomEvent(PET_RADAR_EVENT, {
          detail: { type: 'cloudUploadStart', resultId: enriched.id }
        })
      )
      const { writingProjectAssetsApi } = await import('../../services/cloud')
      const type =
        enriched.type === 'video' ? 'video' : enriched.type === 'audio' ? 'audio' : 'image'
      await writingProjectAssetsApi.create(Number(projectId), {
        episode_id: Number(episodeId),
        shot_id: Number(shotId),
        name: enriched.name || enriched.fileName || enriched.id || '生成素材',
        asset_type: type,
        url: enriched.url,
        object_key: enriched.objectKey || enriched.ossKey || undefined,
        thumb_url: enriched.thumbUrl || enriched.thumbnailUrl || enriched.url,
        prompt: enriched.prompt || enriched.sourceMeta?.prompt || '',
        model: enriched.modelName || enriched.model || enriched.sourceMeta?.model || '',
        duration_ms: enriched.durationMs || enriched.elapsedMs || undefined,
        request_id: enriched.requestId || enriched.sourceMeta?.requestId || '',
        task_id: enriched.taskId || enriched.remoteTaskId || enriched.sourceMeta?.taskId || '',
        status: 'pending',
        metadata: {
          sourceNodeId: enriched.sourceNodeId,
          sourceHistoryId: enriched.id,
          cloudAssignmentId:
            enriched.sourceMeta?.cloudAssignmentId || enriched.cloudAssignmentId || null
        }
      })
      useAppStore.getState().setCloudAssetsOpen?.(true)
      window.dispatchEvent(
        new CustomEvent(PET_RADAR_EVENT, {
          detail: { type: 'cloudUploadSuccess', resultId: enriched.id }
        })
      )
      setToast('已上传到本集云素材库，状态为待审核')
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent(PET_RADAR_EVENT, {
          detail: {
            type: 'cloudUploadFailed',
            resultId: enriched.id,
            error: error?.message || String(error || '')
          }
        })
      )
      console.error('[OutputResultsPanel] 上传云素材库失败:', error)
      setToast('上传云素材库失败')
    }
    closeContextMenu()
  }

  const handleImageLoad = (event: any, idx: number) => {
    const width = event.target.naturalWidth
    const height = event.target.naturalHeight
    if (width && height) {
      const value = `${width}x${height}`
      setDims((prev) => (prev[idx] === value ? prev : { ...prev, [idx]: value }))
    }
  }

  const handleVideoMeta = (event: any, idx: number) => {
    const width = event.target.videoWidth
    const height = event.target.videoHeight
    if (width && height) {
      const value = `${width}x${height}`
      setDims((prev) => (prev[idx] === value ? prev : { ...prev, [idx]: value }))
    }
  }

  const handleResultDragStart = (event: any, result: any) => {
    const rawUrl = getPreferredMediaUrl(result)
    if (!rawUrl) {
      event.preventDefault()
      return
    }
    const type = result?.type === 'video' ? 'video' : result?.type === 'audio' ? 'audio' : 'image'
    event.dataTransfer.setData('asset-path', rawUrl)
    event.dataTransfer.setData('asset-type', type)
    event.dataTransfer.setData('text/plain', rawUrl)
    event.dataTransfer.effectAllowed = 'copy'
  }

  const panel = (
    <div
      className="pointer-events-auto"
      style={{
        position: 'absolute',
        left: panelX,
        top: panelY,
        zIndex: 50,
        transform: 'translate3d(0, 0, 0)'
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        const target = event.target as HTMLElement
        if (contextMenu && !target?.closest('[data-context-menu]')) {
          closeContextMenu()
        }
      }}
      onMouseEnter={() => setPanelHovered(true)}
      onMouseLeave={() => setPanelHovered(false)}
    >
      <div
        className={expanded ? 'grid gap-2' : 'relative'}
        style={
          expanded
            ? { gridTemplateColumns: `repeat(${gridCols}, ${cardSize}px)` }
            : { width: collapsedPanelWidth, height: collapsedPanelHeight }
        }
      >
        {(expanded ? results : results.slice(-Math.min(3, results.length))).map(
          (result: any, listIdx: number) => {
            const idx = expanded ? listIdx : results.length - Math.min(3, results.length) + listIdx
            const isVideo = result.type === 'video'
            const videoSources = isVideo ? getPreferredMediaUrls(result) : []
            const imageSource = !isVideo ? getPreferredMediaUrl(result) : ''
            const stackDepth = expanded ? 0 : Math.min(3, results.length) - 1 - listIdx
            const isTopStackCard = expanded || listIdx === Math.min(3, results.length) - 1
            return (
              <div
                key={`${result.id || result.requestId || result.taskId || result.remoteTaskId || 'result'}-${idx}`}
                className={`relative group rounded-[var(--radius-md)] overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-[var(--shadow-sm)] transition-all duration-200 ${
                  isTopStackCard
                    ? 'cursor-pointer hover:border-[var(--primary-color)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5'
                    : 'pointer-events-none'
                }`}
                style={{
                  width: cardSize,
                  height: cardSize,
                  ...(expanded
                    ? {}
                    : {
                        position: 'absolute',
                        left: stackDepth * 10,
                        top: stackDepth * 8,
                        zIndex: 10 - stackDepth,
                        opacity: isTopStackCard ? 1 : 0.58
                      })
                }}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  handleViewLarge(result)
                }}
                onDoubleClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  handleViewLarge(result)
                }}
                draggable={isTopStackCard}
                onDragStart={(event) => handleResultDragStart(event, result)}
                onContextMenu={(event) => handleContextMenu(event, result, idx)}
              >
                <div className="absolute left-1 top-1 z-10 rounded-md bg-black/65 px-1.5 py-0.5 text-[9px] font-semibold text-white/90 shadow-sm pointer-events-none">
                  #{idx + 1}
                </div>

                {isVideo ? (
                  <VideoThumbnail
                    src={videoSources[0]}
                    fallbackSrcs={videoSources.slice(1)}
                    className="w-full h-full object-cover"
                    allowCapture
                    onLoadedDimensions={(width, height) => {
                      const value = `${width}x${height}`
                      setDims((prev) => (prev[idx] === value ? prev : { ...prev, [idx]: value }))
                    }}
                  />
                ) : (
                  <ThumbnailImage
                    src={getXingheMediaSrc(imageSource)}
                    alt={`Output ${idx + 1}`}
                    className="w-full h-full object-cover"
                    style={undefined}
                    draggable={false}
                    onError={undefined}
                    onLoad={(event) => handleImageLoad(event, idx)}
                  />
                )}

                {dims[idx] && (
                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[8px] text-white/90 font-mono pointer-events-none">
                    {dims[idx]}
                  </div>
                )}

                {result?.isPanorama && (
                  <div className="absolute top-1 left-9 px-1.5 py-0.5 rounded bg-emerald-500/80 text-[8px] text-white font-medium">
                    720
                  </div>
                )}

                {isVideo && (
                  <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[8px] text-white font-medium">
                    视频
                  </div>
                )}
              </div>
            )
          }
        )}
        {!expanded && results.length > 1 && (
          <div className="absolute -right-2 -top-2 z-20 rounded-full bg-[var(--primary-color)] px-1.5 py-0.5 text-[9px] font-bold text-white shadow-md pointer-events-none">
            {results.length}
          </div>
        )}
      </div>
    </div>
  )

  const overlays = (
    <>
      {contextMenu && (
        <div
          data-context-menu
          className="context-menu fixed z-[200] w-36"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="context-menu-item text-xs"
            onClick={() => handleViewLarge(contextMenu.result)}
          >
            {contextMenu.result?.isPanorama ? '全景漫游' : '查看大图'}
          </button>
          {contextMenu.result?.type !== 'video' && (
            <button
              className="context-menu-item text-xs"
              onClick={async () => {
                try {
                  const response = (await window.api.invoke('clipboard:copy-image', {
                    filePath: getPreferredMediaUrl(contextMenu.result)
                  })) as { success?: boolean; error?: string }
                  setToast(
                    response?.success
                      ? '已复制到剪贴板'
                      : `复制失败: ${response?.error || '未知错误'}`
                  )
                } catch {
                  setToast('复制失败')
                }
                closeContextMenu()
              }}
            >
              复制图片
            </button>
          )}
          <button
            className="context-menu-item text-xs"
            onClick={() => handleEdit(contextMenu.result)}
          >
            修改
          </button>
          {contextMenu.result.type === 'video' && (
            <button
              className="context-menu-item text-xs"
              onClick={async () => {
                const rawUrl = contextMenu.result.url
                const resolvedUrl = getXingheMediaSrc(rawUrl)
                if (!resolvedUrl.startsWith('http')) {
                  setToast('仅支持擦除云端视频的字幕')
                  closeContextMenu()
                  return
                }
                setToast('正在擦除字幕...')
                closeContextMenu()
                try {
                  const apiKey = useAppStore.getState().globalApiKey
                  const res = await window.api.videoAPI.eraseSubtitle(resolvedUrl, apiKey)
                  if (res?.success && res.resultUrl) {
                    // 从 store 实时获取最新的 outputResults，避免竞态覆盖
                    const latestNode = useAppStore.getState().nodesMap.get(nodeId)
                    const latestResults = latestNode?.settings?.outputResults || []
                    const targetId = contextMenu.result.id || contextMenu.result.url
                    const idx = latestResults.findIndex((r: any) => (r.id || r.url) === targetId)
                    if (idx !== -1) {
                      const updated = [...latestResults]
                      updated[idx] = { ...updated[idx], url: res.resultUrl }
                      if (updateNodeSettings) updateNodeSettings(nodeId, { outputResults: updated })
                    }
                    setToast('字幕擦除完成')
                  } else {
                    setToast(res?.error || '字幕擦除失败')
                  }
                } catch (err) {
                  setToast('字幕擦除失败')
                }
              }}
            >
              擦除字幕
            </button>
          )}
          <div className="context-menu-divider" />
          {contextMenu.result?.type !== 'video' ? (
            <>
              <button
                className="context-menu-item text-xs"
                onClick={() => handleAddToLibrary(contextMenu.result, 'characters', '人物库')}
              >
                添加到人物库
              </button>
              <button
                className="context-menu-item text-xs"
                onClick={() => handleAddToLibrary(contextMenu.result, 'materials', '素材库')}
              >
                添加到素材库
              </button>
            </>
          ) : (
            <button
              className="context-menu-item text-xs"
              onClick={() => handleAddToLibrary(contextMenu.result, 'videos', '视频库')}
            >
              添加到视频库
            </button>
          )}
          <button
            className="context-menu-item text-xs"
            onClick={() => handleAddToFavorites(contextMenu.result)}
          >
            添加到收藏夹
          </button>
          <button
            className="context-menu-item text-xs"
            onClick={() => handleUploadToCloudLibrary(contextMenu.result)}
          >
            上传云素材库
          </button>
          <div className="context-menu-divider" />
          <button
            className="context-menu-item text-xs"
            onClick={async () => {
              const rawUrl = getPreferredMediaUrl(contextMenu.result)
              const resolvedUrl = getXingheMediaSrc(rawUrl)
              let name = rawUrl.split(/[/\\]/).pop()?.split('?')[0] || `output-${Date.now()}`
              if (!name.includes('.')) {
                const isVid =
                  contextMenu.result.type === 'video' || rawUrl.match(/\.(mp4|webm|mov)(\?|$)/i)
                name += isVid ? '.mp4' : '.png'
              }
              try {
                await window.api.localCacheAPI.saveFileAs(resolvedUrl, name)
              } catch (error) {
                console.error('另存为失败', error)
              }
              closeContextMenu()
            }}
          >
            另存为...
          </button>
          <div className="context-menu-divider" />
          <button
            className="context-menu-item text-xs text-red-400"
            onClick={(event) => {
              event.stopPropagation()
              // 从 store 实时获取最新的 outputResults，避免竞态导致删错条目
              const latestNode = useAppStore.getState().nodesMap.get(nodeId)
              const latestResults = latestNode?.settings?.outputResults || []
              const targetId = contextMenu.result.id || contextMenu.result.url
              const updated = latestResults.filter((r: any) => (r.id || r.url) !== targetId)
              if (updateNodeSettings) updateNodeSettings(nodeId, { outputResults: updated })
              closeContextMenu()
            }}
          >
            删除
          </button>
        </div>
      )}

      {editPopup && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50"
          onClick={() => setEditPopup(null)}
        >
          <div
            className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-4 w-80"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <img
                src={getXingheMediaSrc(getPreferredMediaUrl(editPopup))}
                alt="source"
                className="w-16 h-16 rounded-[var(--radius-sm)] object-cover border border-[var(--border-default)]"
              />
              <div className="text-xs text-[var(--text-secondary)]">基于此图进行修改</div>
            </div>
            <textarea
              autoFocus
              value={editPrompt}
              onChange={(event) => setEditPrompt(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  handleSubmitEdit()
                }
                if (event.key === 'Escape') setEditPopup(null)
              }}
              onMouseDown={(event) => event.stopPropagation()}
              placeholder="输入修改提示词..."
              className="input-field w-full h-20 p-2.5 text-xs resize-none"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setEditPopup(null)}
                className="btn-ghost px-3 py-1.5 text-xs rounded-[var(--radius-sm)]"
              >
                取消
              </button>
              <button
                onClick={handleSubmitEdit}
                disabled={!editPrompt.trim()}
                className="px-4 py-1.5 text-xs text-white bg-[var(--primary-color)] rounded-lg hover:opacity-90 disabled:opacity-40"
              >
                生成
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[300] px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] shadow-[var(--shadow-lg)] animate-slide-up">
          {toast}
        </div>
      )}

      <PanoramaViewer
        open={!!panoramaResult}
        imageUrl={panoramaResult?.url || null}
        sourceNodeId={panoramaResult?.sourceNodeId || nodeId}
        onClose={() => setPanoramaResult(null)}
      />
    </>
  )

  return (
    <>
      {createPortal(panel, viewport)}
      {createPortal(overlays, document.body)}
    </>
  )
})
