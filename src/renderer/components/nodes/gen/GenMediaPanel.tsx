import React, { memo, useEffect, useRef, useState } from 'react'
import {
  X,
  Music,
  LinkIcon,
  Video,
  ImageIcon,
  FileAudio,
  FileVideo,
  Plus,
  Film,
  Sparkles
} from '../../../utils/icons.tsx'
import { useAppStore } from '../../../store/useAppStore.ts'
import { canReadFileAsDataUrl, getXingheMediaSrc } from '../../../utils/fileHelpers.ts'
import { withProjectCacheContext } from '../../../utils/projectCache.ts'
import { VideoThumbnail } from '../../../components/ui/VideoThumbnail.tsx'
import { ThumbnailImage } from '../../../components/ui/ThumbnailImage.tsx'

type MediaPanelProps = {
  nodeId: string
  nodeType: string
  connectedImages?: string[]
  connectedAudios?: string[]
  connectedVideos?: string[]
  manualImages?: string[]
  manualAudios?: string[]
  manualVideos?: string[]
  assetIds?: string[]
  videoAssetIds?: string[]
  audioAssetIds?: string[]
  updateNodeSettings: (nodeId: string, patch: Record<string, any>) => void
  setLightboxItem?: (item: any) => void
  sourceVideosText?: string
  showFrames?: boolean
  startFrame?: string | null
  endFrame?: string | null
  showSourceVideos?: boolean
  floating?: boolean
  framesOnly?: boolean
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'webm', 'mkv']

const rowLabelClass = 'sr-only'
const FLOATING_VISIBLE_LIMIT = 4

const AddMediaButton = memo(function AddMediaButton({
  icon: Icon,
  label,
  title,
  tone = 'asset',
  disabled = false,
  onClick
}: any) {
  const toneClass =
    tone === 'image'
      ? 'hover:bg-emerald-500/10 hover:text-emerald-300'
      : tone === 'video'
        ? 'hover:bg-purple-500/10 hover:text-purple-300'
        : tone === 'audio'
          ? 'hover:bg-emerald-500/10 hover:text-emerald-300'
          : 'hover:bg-blue-500/10 hover:text-blue-300'

  return (
    <button
      className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-transparent bg-[color-mix(in_srgb,var(--bg-panel)_34%,transparent)] text-[var(--text-secondary)] shadow-[0_6px_14px_rgba(0,0,0,0.12)] backdrop-blur-md transition-colors pointer-events-auto ${toneClass} ${disabled ? 'cursor-wait opacity-60' : ''}`}
      title={title || label}
      aria-label={title || label}
      disabled={disabled}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (disabled) return
        onClick?.(event)
      }}
    >
      <Plus size={17} strokeWidth={2.2} className="pointer-events-none" />
      <span className="absolute bottom-0.5 right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--bg-panel)_58%,transparent)] text-current pointer-events-none">
        <Icon size={8} strokeWidth={2.2} />
      </span>
    </button>
  )
})

const ImageTile = memo(function ImageTile({
  src,
  removable,
  dragState,
  dragIndex,
  setLightboxItem,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onRemove,
  showIndex,
  index,
  isSeedanceAsset
}: any) {
  const isDragging = dragState?.drag === dragIndex
  const isOver = dragState?.over === dragIndex
  return (
    <div
      className={`relative group shrink-0 h-10 w-10 cursor-grab overflow-hidden rounded-[12px] border transition-all active:cursor-grabbing ${
        isDragging
          ? 'scale-95 border-blue-500 opacity-30'
          : isOver
            ? 'z-10 scale-105 border-blue-400'
          : 'border-transparent'
      }`}
      draggable={removable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (!removable) return
        event.preventDefault()
        onDragOver?.(event)
      }}
      onDragLeave={onDragLeave}
      onClick={(event) => {
        event.stopPropagation()
        if (src) setLightboxItem?.({ type: 'image', url: src })
      }}
    >
      <ThumbnailImage
        src={src}
        alt=""
        className="h-full w-full object-cover pointer-events-none"
      />
      {showIndex && (
        <div className="absolute left-0 top-0 rounded-br bg-black/60 px-1 text-[8px] text-white pointer-events-none">
          {index}
        </div>
      )}
      {isSeedanceAsset && (
        <div
          className="absolute top-0.5 left-0.5 flex items-center justify-center bg-emerald-500 text-white rounded-full p-[3px] shadow-sm shadow-emerald-500/50 z-10 cursor-help"
          title="已入库的专属资产"
        >
          <Sparkles size={6} />
        </div>
      )}
      {removable && (
        <button
          className="absolute right-0.5 top-0.5 z-20 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/20 bg-red-500/90 text-white opacity-0 transition-all group-hover:opacity-100 hover:bg-red-400 hover:scale-110 shadow-sm"
          title="删除参考图"
          onMouseDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onRemove?.()
          }}
        >
          <X size={8} />
        </button>
      )}
    </div>
  )
})

const AudioTile = memo(function AudioTile({
  label,
  removable,
  dragState,
  dragIndex,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onRemove
}: any) {
  const isDragging = dragState?.drag === dragIndex
  const isOver = dragState?.over === dragIndex

  return (
    <div
      className={`relative flex h-8 max-w-[112px] cursor-grab items-center gap-1.5 rounded-[10px] border border-transparent bg-[color-mix(in_srgb,var(--bg-panel)_34%,transparent)] px-2 py-1 text-[10px] text-emerald-100/80 shadow-[0_6px_14px_rgba(0,0,0,0.12)] backdrop-blur-md transition-all active:cursor-grabbing ${
        isDragging ? 'scale-95 opacity-30' : isOver ? 'z-10 scale-105 border-emerald-400' : ''
      }`}
      draggable={removable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (!removable) return
        event.preventDefault()
        onDragOver?.(event)
      }}
      onDragLeave={onDragLeave}
    >
      <Music size={10} className="shrink-0 pointer-events-none" />
      <span className="max-w-[80px] truncate pointer-events-none">{label}</span>
      {removable && (
        <button
          className="shrink-0 rounded-md bg-black/40 p-[2px] text-white transition-colors hover:bg-red-500"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onRemove?.()
          }}
        >
          <X size={8} />
        </button>
      )}
    </div>
  )
})

const VideoTile = memo(function VideoTile({
  src,
  label,
  removable,
  dragState,
  dragIndex,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onRemove,
  setLightboxItem
}: any) {
  const isDragging = dragState?.drag === dragIndex
  const isOver = dragState?.over === dragIndex

  return (
    <div
      className={`relative group shrink-0 h-10 w-10 cursor-grab overflow-hidden rounded-[12px] border transition-all active:cursor-grabbing ${
        isDragging
          ? 'scale-95 border-purple-500 opacity-30'
          : isOver
            ? 'z-10 scale-105 border-purple-400'
            : 'border-transparent'
      }`}
      draggable={removable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (!removable) return
        event.preventDefault()
        onDragOver?.(event)
      }}
      onDragLeave={onDragLeave}
      onClick={(event) => {
        event.stopPropagation()
        if (src) setLightboxItem?.({ type: 'video', url: src })
      }}
      title={label}
    >
      {src ? (
        <VideoThumbnail
          src={src}
          className="h-full w-full object-cover pointer-events-none"
          allowCapture
        />
      ) : (
        <div className="h-full w-full bg-purple-500/10 flex items-center justify-center">
          <Video size={14} className="text-purple-400/50" />
        </div>
      )}

      <div className="absolute top-0.5 left-0.5 bg-black/60 rounded p-[2px] pointer-events-none">
        <Film size={7} className="text-white" />
      </div>

      {removable && (
        <button
          className="absolute right-0.5 top-0.5 z-20 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/20 bg-red-500/90 text-white opacity-0 transition-all group-hover:opacity-100 hover:bg-red-400 hover:scale-110 shadow-sm"
          title="删除视频"
          onMouseDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onRemove?.()
          }}
        >
          <X size={8} />
        </button>
      )}
    </div>
  )
})

export const GenMediaPanel = memo(function GenMediaPanel({
  nodeId,
  nodeType,
  connectedImages = [],
  connectedAudios = [],
  connectedVideos = [],
  manualImages = [],
  manualAudios = [],
  manualVideos = [],
  assetIds = [],
  videoAssetIds = [],
  audioAssetIds = [],
  updateNodeSettings,
  setLightboxItem,
  sourceVideosText,
  showFrames,
  startFrame,
  endFrame,
  showSourceVideos,
  floating = false,
  framesOnly = false
}: MediaPanelProps) {
  const currentProject = useAppStore((state) => state.currentProject)
  const [allAssetItems, setAllAssetItems] = useState<any[]>([])

  // 当项目变化或 asset 数量变化时重新加载资产库数据（用 .length 避免无限循环）
  const totalAssetCount = assetIds.length + videoAssetIds.length + audioAssetIds.length
  useEffect(() => {
    try {
      if (!currentProject?.id) return
      const key = currentProject.id
        ? `tapnow_asset_library_${currentProject.id}`
        : 'tapnow_asset_library'
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        const items = Object.values(parsed).flatMap((cat: any) => [
          ...(cat?.items || []),
          ...(cat?.folders || []).flatMap((f: any) => f?.items || [])
        ])
        setAllAssetItems(items)
      }
    } catch (err) {
      console.error('Failed to load assets for preview', err)
    }
  }, [currentProject?.id, totalAssetCount])

  const [assetIdInput, setAssetIdInput] = useState<string | null>(null)
  const [videoAssetIdInput, setVideoAssetIdInput] = useState<string | null>(null)
  const [audioAssetIdInput, setAudioAssetIdInput] = useState<string | null>(null)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [localSourceVideos, setLocalSourceVideos] = useState(sourceVideosText || '')
  const [imageDrag, setImageDrag] = useState<{ drag: number | null; over: number | null }>({
    drag: null,
    over: null
  })
  const [videoDrag, setVideoDrag] = useState<{ drag: number | null; over: number | null }>({
    drag: null,
    over: null
  })
  const [audioDrag, setAudioDrag] = useState<{ drag: number | null; over: number | null }>({
    drag: null,
    over: null
  })
  const [expandedSection, setExpandedSection] = useState<'image' | 'video' | 'audio' | null>(null)
  const [pickerBusy, setPickerBusy] = useState(false)
  const pickerBusyRef = useRef(false)

  // useRef 存储最新拖拽状态，避免闭包问题
  const imageDragRef = useRef(imageDrag)
  const videoDragRef = useRef(videoDrag)
  const audioDragRef = useRef(audioDrag)
  imageDragRef.current = imageDrag
  videoDragRef.current = videoDrag
  audioDragRef.current = audioDrag

  useEffect(() => {
    setLocalSourceVideos(sourceVideosText || '')
  }, [sourceVideosText])

  const getFieldSource = (field: string) => {
    if (field === 'manualImages') return manualImages
    if (field === 'manualAudios') return manualAudios
    if (field === 'manualVideos') return manualVideos
    if (field === 'assetIds') return assetIds
    if (field === 'videoAssetIds') return videoAssetIds
    if (field === 'audioAssetIds') return audioAssetIds
    return []
  }

  const appendUnique = (field: string, incoming: string[]) => {
    const existing = getFieldSource(field)
    const next = incoming.filter((item) => item && !existing.includes(item))
    if (next.length > 0) updateNodeSettings(nodeId, { [field]: [...existing, ...next] })
  }

  const removeAt = (field: string, index: number) => {
    updateNodeSettings(nodeId, {
      [field]: getFieldSource(field).filter((_, itemIndex) => itemIndex !== index)
    })
  }

  const reorderList = (
    field: 'manualImages' | 'manualAudios' | 'manualVideos',
    from: number,
    to: number
  ) => {
    const source = [...getFieldSource(field)]
    if (from === to || from < 0 || to < 0 || from >= source.length || to >= source.length) return
    const [moved] = source.splice(from, 1)
    source.splice(to, 0, moved)
    updateNodeSettings(nodeId, { [field]: source })
  }

  const cacheDroppedFiles = async ({
    files,
    extensions,
    category,
    type,
    idPrefix
  }: {
    files: any[]
    extensions: string[]
    category: string
    type: 'image' | 'audio' | 'video'
    idPrefix: string
  }) => {
    const savedPaths: string[] = []

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      const name = file?.name || 'unknown'
      const ext = name.split('.').pop()?.toLowerCase() || ''
      if (!extensions.includes(ext)) continue

      let finalPath: string | null = null
      try {
        if (file.path) {
          const copied = await window.api.invoke('cache:copy-file', withProjectCacheContext({
            id: `${idPrefix}_${Date.now()}_${index}`,
            sourcePath: file.path,
            category,
            type
          }))
          if (copied?.success && copied.path) finalPath = copied.path
        }

        if (!finalPath) {
          if (!canReadFileAsDataUrl(file, `${type} media`)) {
            continue
          }
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = (event) => resolve(String(event.target?.result || ''))
            reader.onerror = reject
            reader.readAsDataURL(file)
          })
          const saved = await window.api.localCacheAPI.saveCache(withProjectCacheContext({
            id: `${idPrefix}_${Date.now()}_${index}`,
            content: base64,
            category,
            ext: `.${ext}`,
            type
          }))
          if (saved?.success && saved.path) finalPath = saved.path
        }
      } catch (error) {
        console.error(`[GenMedia] 处理 ${type} 失败:`, name, error)
      }

      if (finalPath && !savedPaths.includes(finalPath)) savedPaths.push(finalPath)
    }

    return savedPaths
  }

  const openPicker = async (extensions: string[], name: string, multiple = true) => {
    if (pickerBusyRef.current) return []
    pickerBusyRef.current = true
    setPickerBusy(true)
    try {
      const result = await window.api.localCacheAPI.openFiles({
        filters: [{ name, extensions }],
        multiple
      })
      return result.success && result.paths?.length ? result.paths : []
    } finally {
      pickerBusyRef.current = false
      setPickerBusy(false)
    }
  }

  const commitSourceVideos = (value = localSourceVideos) => {
    updateNodeSettings(nodeId, { sourceVideosText: value })
  }

  const sourceVideoUrls = localSourceVideos
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)

  const isFloatingSectionCollapsed = (section: 'image' | 'video' | 'audio') =>
    floating && expandedSection !== section
  const canShowFloatingItem = (section: 'image' | 'video' | 'audio', index: number) =>
    !isFloatingSectionCollapsed(section) || index < FLOATING_VISIBLE_LIMIT
  const getHiddenCount = (section: 'image' | 'video' | 'audio', total: number) =>
    isFloatingSectionCollapsed(section) ? Math.max(0, total - FLOATING_VISIBLE_LIMIT) : 0

  const totalImageItems = connectedImages.length + manualImages.length + assetIds.length
  const totalVideoItems =
    connectedVideos.length + manualVideos.length + videoAssetIds.length + sourceVideoUrls.length
  const totalAudioItems = connectedAudios.length + manualAudios.length + audioAssetIds.length
  const hiddenImageCount = getHiddenCount('image', totalImageItems)
  const hiddenVideoCount = getHiddenCount('video', totalVideoItems)
  const hiddenAudioCount = getHiddenCount('audio', totalAudioItems)
  let imageItemIndex = 0
  let videoItemIndex = 0
  let audioItemIndex = 0

  const floatingSectionClass =
    'group/media-section flex h-10 min-w-10 max-w-[260px] items-center gap-1 overflow-hidden rounded-[12px] border-0 bg-transparent px-0 shadow-none transition-[max-width,transform] duration-200 hover:max-w-[520px] hover:-translate-y-0.5'
  const imageRowClass = floating
    ? floatingSectionClass
    : `nodrag flex items-center gap-2 px-3 pt-2 flex-wrap ${nodeType === 'gen-video' ? 'pb-1' : 'pb-2'}`
  const videoRowClass = floating
    ? floatingSectionClass
    : 'nodrag flex items-center gap-2 px-3 py-1 flex-wrap'
  const audioRowClass = floating
    ? floatingSectionClass
    : 'nodrag flex items-center gap-2 px-3 pb-2 pt-1 flex-wrap'
  const floatingRowLabelClass = floating
    ? 'inline-flex h-10 w-12 shrink-0 items-center justify-center rounded-[12px] bg-[color-mix(in_srgb,var(--bg-panel)_24%,transparent)] text-[10px] font-semibold text-[var(--text-secondary)] shadow-[0_6px_14px_rgba(0,0,0,0.08)] backdrop-blur-md'
    : rowLabelClass

  const FloatingHiddenBadge = ({ count }: { count: number }) =>
    count > 0 ? (
      <span className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-[12px] bg-[color-mix(in_srgb,var(--bg-panel)_34%,transparent)] px-2 text-[10px] font-semibold text-[var(--text-secondary)] shadow-[0_6px_14px_rgba(0,0,0,0.12)] backdrop-blur-md">
        +{count}
      </span>
    ) : null

  return (
    <div
      className={
        floating
          ? `nodrag pointer-events-auto relative flex max-w-[560px] ${nodeType === 'gen-video' ? 'flex-col items-start gap-1.5' : 'items-start gap-1.5'}`
          : 'contents'
      }
    >
      {!framesOnly && (
        <div
          className={imageRowClass}
          onMouseEnter={() => floating && setExpandedSection('image')}
          onMouseLeave={() => floating && setExpandedSection(null)}
        >
        {(nodeType === 'gen-video' || floating) && (
          <span className={floatingRowLabelClass}>图</span>
        )}

        {connectedImages.map((imgSrc, index) => {
          const itemIndex = imageItemIndex++
          if (!canShowFloatingItem('image', itemIndex)) return null
          return (
            <ImageTile
              key={`c-${index}`}
              src={imgSrc}
              showIndex={nodeType === 'gen-image'}
              index={index + 1}
              setLightboxItem={setLightboxItem}
            />
          )
        })}

        {manualImages.map((imgPath, index) => {
          const itemIndex = imageItemIndex++
          if (!canShowFloatingItem('image', itemIndex)) return null
          return (
            <ImageTile
              key={`m-${index}`}
              src={imgPath}
              removable
              dragState={imageDrag}
              dragIndex={index}
              setLightboxItem={setLightboxItem}
              onDragStart={() => setImageDrag({ drag: index, over: null })}
              onDragEnd={() => {
                const { drag, over } = imageDragRef.current
                if (drag !== null && over !== null) reorderList('manualImages', drag, over)
                setImageDrag({ drag: null, over: null })
              }}
              onDragOver={() => {
                if (imageDrag.drag !== null && imageDrag.drag !== index) {
                  setImageDrag((prev) => ({ ...prev, over: index }))
                }
              }}
              onDragLeave={() => {
                if (imageDrag.over === index) setImageDrag((prev) => ({ ...prev, over: null }))
              }}
              onRemove={() => removeAt('manualImages', index)}
            />
          )
        })}

        {floating && <FloatingHiddenBadge count={hiddenImageCount} />}

        <AddMediaButton
          icon={ImageIcon}
          label="参考图"
          tone="image"
          disabled={pickerBusy}
          onClick={async (event) => {
            event.stopPropagation()
            const paths = await openPicker(IMAGE_EXTENSIONS, '图片')
            appendUnique('manualImages', paths)
          }}
        />

        {assetIds.map((assetId, index) => {
          const itemIndex = imageItemIndex++
          if (!canShowFloatingItem('image', itemIndex)) return null
          // 在全局资产库中反查这个 seedanceId 对应的原始物理路径
          const matchedItem = allAssetItems.find(
            (item) => item.seedanceId === assetId || item.id === assetId
          )

          if (matchedItem && matchedItem.path) {
            return (
              <ImageTile
                key={`asset-img-${index}`}
                src={matchedItem.path}
                isSeedanceAsset={true}
                removable
                setLightboxItem={setLightboxItem}
                onRemove={() => removeAt('assetIds', index)}
              />
            )
          }

          // 如果反查失败（跨设备或者被删除等），降级为带图标的缩略图方块
          return (
            <div
              key={`asset-${index}`}
              className="relative group shrink-0 h-10 w-10 rounded-lg border-2 border-emerald-500/30 bg-emerald-500/5 flex items-center justify-center overflow-hidden pointer-events-auto"
              title={`Asset: ${assetId}`}
            >
              <ImageIcon size={16} className="text-emerald-400/50" />
              <div
                className="absolute top-0.5 left-0.5 flex items-center justify-center bg-emerald-500 text-white rounded-full p-[3px] shadow-sm shadow-emerald-500/50 z-10"
                title="已入库资产"
              >
                <Sparkles size={6} />
              </div>
              <button
                className="absolute right-0.5 top-0.5 z-20 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/20 bg-red-500/90 text-white opacity-0 transition-all group-hover:opacity-100 hover:bg-red-400 hover:scale-110 shadow-sm"
                title="删除"
                onMouseDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  removeAt('assetIds', index)
                }}
              >
                <X size={8} />
              </button>
            </div>
          )
        })}

        {assetIdInput !== null ? (
          <input
            autoFocus
            type="text"
            placeholder="asset-xxxxx"
            value={assetIdInput}
            onChange={(event) => setAssetIdInput(event.target.value)}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter') {
                const value = assetIdInput.trim()
                if (value) {
                  appendUnique('assetIds', [value.startsWith('asset-') ? value : `asset-${value}`])
                }
                setAssetIdInput(null)
              } else if (event.key === 'Escape') {
                setAssetIdInput(null)
              }
            }}
            onBlur={() => {
              const value = (assetIdInput || '').trim()
              if (value)
                appendUnique('assetIds', [value.startsWith('asset-') ? value : `asset-${value}`])
              setAssetIdInput(null)
            }}
            className="nodrag h-8 w-28 rounded-lg border border-blue-500/40 bg-[var(--bg-secondary)] px-2 text-[10px] text-blue-400 outline-none focus:border-blue-500 pointer-events-auto"
          />
        ) : (
          <AddMediaButton
            icon={LinkIcon}
            label="Asset ID"
            tone="asset"
            onClick={(event) => {
              event.stopPropagation()
              setAssetIdInput('')
            }}
          />
        )}
        </div>
      )}

      {!framesOnly && nodeType === 'gen-video' && (
        <>
          <div
            className={videoRowClass}
            onMouseEnter={() => floating && setExpandedSection('video')}
            onMouseLeave={() => floating && setExpandedSection(null)}
          >
            <span className={floatingRowLabelClass}>视频</span>

            {connectedVideos.map((videoSrc, index) => {
              const itemIndex = videoItemIndex++
              if (!canShowFloatingItem('video', itemIndex)) return null
              return (
                <VideoTile
                  key={`cv-${index}`}
                  src={videoSrc}
                  label={`视频${index + 1}`}
                  setLightboxItem={setLightboxItem}
                />
              )
            })}

            {manualVideos.map((videoPath, index) => {
              const itemIndex = videoItemIndex++
              if (!canShowFloatingItem('video', itemIndex)) return null
              return (
                <VideoTile
                  key={`mv-${index}`}
                  src={videoPath}
                  label={videoPath.split(/[\\/]/).pop() || `视频${index + 1}`}
                  removable
                  dragState={videoDrag}
                  dragIndex={index}
                  setLightboxItem={setLightboxItem}
                  onDragStart={() => setVideoDrag({ drag: index, over: null })}
                  onDragEnd={() => {
                    const { drag, over } = videoDragRef.current
                    if (drag !== null && over !== null) reorderList('manualVideos', drag, over)
                    setVideoDrag({ drag: null, over: null })
                  }}
                  onDragOver={() => {
                    if (videoDrag.drag !== null && videoDrag.drag !== index) {
                      setVideoDrag((prev) => ({ ...prev, over: index }))
                    }
                  }}
                  onDragLeave={() => {
                    if (videoDrag.over === index) setVideoDrag((prev) => ({ ...prev, over: null }))
                  }}
                  onRemove={() => removeAt('manualVideos', index)}
                />
              )
            })}

            {floating && <FloatingHiddenBadge count={hiddenVideoCount} />}

            <AddMediaButton
              icon={FileVideo}
              label="参考视频"
              tone="video"
              disabled={pickerBusy}
              onClick={async (event) => {
                event.stopPropagation()
                const paths = await openPicker(VIDEO_EXTENSIONS, '视频')
                appendUnique('manualVideos', paths)
              }}
            />

            <AddMediaButton
              icon={LinkIcon}
              label="视频URL"
              title={showUrlInput ? '收起视频 URL' : '添加视频 URL'}
              tone="video"
              onClick={(event) => {
                event.stopPropagation()
                setShowUrlInput((value) => !value)
              }}
            />

            {sourceVideoUrls.length > 0 && !showUrlInput && (() => {
              const itemIndex = videoItemIndex++
              if (!canShowFloatingItem('video', itemIndex)) return null
              return (
              <button
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-300 pointer-events-auto"
                title={sourceVideoUrls.join('\n')}
                aria-label={`已添加 ${sourceVideoUrls.length} 个视频 URL`}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  setShowUrlInput(true)
                }}
              >
                <LinkIcon size={12} />
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-purple-500 px-1 text-[8px] font-semibold text-white">
                  {sourceVideoUrls.length}
                </span>
              </button>
              )
            })()}

            {videoAssetIds.map((assetId, index) => {
              const itemIndex = videoItemIndex++
              if (!canShowFloatingItem('video', itemIndex)) return null
              const matchedItem = allAssetItems.find(
                (item) => item.seedanceId === assetId || item.id === assetId
              )

              if (matchedItem && matchedItem.path) {
                return (
                  <VideoTile
                    key={`asset-video-${index}`}
                    src={matchedItem.path}
                    label={matchedItem.name || `视频${index + 1}`}
                    removable
                    setLightboxItem={setLightboxItem}
                    onRemove={() => removeAt('videoAssetIds', index)}
                  />
                )
              }

              return (
                <div
                  key={`asset-vid-${index}`}
                  className="relative group shrink-0 h-10 w-10 rounded-lg border-2 border-purple-500/30 bg-purple-500/5 flex items-center justify-center overflow-hidden pointer-events-auto"
                  title={`Asset: ${assetId}`}
                >
                  <Video size={16} className="text-purple-400/50" />
                  <div
                    className="absolute top-0.5 left-0.5 flex items-center justify-center bg-emerald-500 text-white rounded-full p-[3px] shadow-sm shadow-emerald-500/50 z-10"
                    title="已入库资产"
                  >
                    <Sparkles size={6} />
                  </div>
                  <div className="absolute bottom-0.5 right-0.5 bg-black/60 rounded p-[2px] pointer-events-none">
                    <Film size={7} className="text-white" />
                  </div>
                  <button
                    className="absolute right-0.5 top-0.5 z-20 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/20 bg-red-500/90 text-white opacity-0 transition-all group-hover:opacity-100 hover:bg-red-400 hover:scale-110 shadow-sm"
                    title="删除"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    onClick={(event) => {
                      event.stopPropagation()
                      removeAt('videoAssetIds', index)
                    }}
                  >
                    <X size={8} />
                  </button>
                </div>
              )
            })}

            {videoAssetIdInput !== null ? (
              <input
                autoFocus
                type="text"
                placeholder="asset-xxxxx"
                value={videoAssetIdInput}
                onChange={(event) => setVideoAssetIdInput(event.target.value)}
                onMouseDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Enter') {
                    const value = videoAssetIdInput.trim()
                    if (value) {
                      appendUnique('videoAssetIds', [
                        value.startsWith('asset-') ? value : `asset-${value}`
                      ])
                    }
                    setVideoAssetIdInput(null)
                  } else if (event.key === 'Escape') {
                    setVideoAssetIdInput(null)
                  }
                }}
                onBlur={() => {
                  const value = (videoAssetIdInput || '').trim()
                  if (value)
                    appendUnique('videoAssetIds', [
                      value.startsWith('asset-') ? value : `asset-${value}`
                    ])
                  setVideoAssetIdInput(null)
                }}
                className="nodrag h-8 w-28 rounded-lg border border-purple-500/40 bg-[var(--bg-secondary)] px-2 text-[10px] text-purple-400 outline-none focus:border-purple-500 pointer-events-auto"
              />
            ) : (
              <AddMediaButton
                icon={LinkIcon}
                label="Asset ID"
                tone="video"
                onClick={(event) => {
                  event.stopPropagation()
                  setVideoAssetIdInput('')
                }}
              />
            )}
          </div>

          {showUrlInput && (
            <div
              className={
                floating
                  ? 'nodrag absolute left-2 top-[calc(100%+6px)] w-[360px] rounded-xl border border-white/10 bg-[var(--bg-panel)]/95 p-2 shadow-lg backdrop-blur-md'
                  : 'nodrag px-3 pb-1'
              }
            >
              <textarea
                value={localSourceVideos}
                onChange={(event) => {
                  setLocalSourceVideos(event.target.value)
                  commitSourceVideos(event.target.value)
                }}
                onBlur={() => commitSourceVideos()}
                onMouseDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                placeholder="每行一个参考视频 URL"
                className="h-12 w-full resize-none rounded-lg border border-purple-500/25 bg-[var(--bg-secondary)] px-2 py-1.5 text-[10px] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-purple-400 pointer-events-auto custom-scrollbar"
              />
            </div>
          )}

          <div
            className={audioRowClass}
            onMouseEnter={() => floating && setExpandedSection('audio')}
            onMouseLeave={() => floating && setExpandedSection(null)}
          >
            <span className={floatingRowLabelClass}>音频</span>

            {connectedAudios.map((_, index) => {
              const itemIndex = audioItemIndex++
              if (!canShowFloatingItem('audio', itemIndex)) return null
              return <AudioTile key={`ca-${index}`} label={`音频${index + 1}`} />
            })}

            {manualAudios.map((audioPath, index) => {
              const itemIndex = audioItemIndex++
              if (!canShowFloatingItem('audio', itemIndex)) return null
              return (
                <AudioTile
                  key={`ma-${index}`}
                  label={audioPath.split(/[\\/]/).pop() || `音频${index + 1}`}
                  removable
                  dragState={audioDrag}
                  dragIndex={index}
                  onDragStart={() => setAudioDrag({ drag: index, over: null })}
                  onDragEnd={() => {
                    const { drag, over } = audioDragRef.current
                    if (drag !== null && over !== null) reorderList('manualAudios', drag, over)
                    setAudioDrag({ drag: null, over: null })
                  }}
                  onDragOver={() => {
                    if (audioDrag.drag !== null && audioDrag.drag !== index) {
                      setAudioDrag((prev) => ({ ...prev, over: index }))
                    }
                  }}
                  onDragLeave={() => {
                    if (audioDrag.over === index) setAudioDrag((prev) => ({ ...prev, over: null }))
                  }}
                  onRemove={() => removeAt('manualAudios', index)}
                />
              )
            })}

            {floating && <FloatingHiddenBadge count={hiddenAudioCount} />}

            <AddMediaButton
              icon={FileAudio}
              label="参考音频"
              tone="audio"
              disabled={pickerBusy}
              onClick={async (event) => {
                event.stopPropagation()
                const paths = await openPicker(AUDIO_EXTENSIONS, '音频')
                appendUnique('manualAudios', paths)
              }}
            />

            {audioAssetIds.map((assetId, index) => {
              const itemIndex = audioItemIndex++
              if (!canShowFloatingItem('audio', itemIndex)) return null
              const matchedItem = allAssetItems.find(
                (item) => item.seedanceId === assetId || item.id === assetId
              )

              if (matchedItem && matchedItem.path) {
                return (
                  <AudioTile
                    key={`asset-audio-${index}`}
                    label={matchedItem.name || `音频${index + 1}`}
                    removable
                    onRemove={() => removeAt('audioAssetIds', index)}
                  />
                )
              }

              return (
                <div
                  key={`asset-aud-${index}`}
                  className="relative group shrink-0 h-10 w-10 rounded-lg border-2 border-orange-500/30 bg-orange-500/5 flex items-center justify-center overflow-hidden pointer-events-auto"
                  title={`Asset: ${assetId}`}
                >
                  <Music size={16} className="text-orange-400/50" />
                  <div
                    className="absolute top-0.5 left-0.5 flex items-center justify-center bg-emerald-500 text-white rounded-full p-[3px] shadow-sm shadow-emerald-500/50 z-10"
                    title="已入库资产"
                  >
                    <Sparkles size={6} />
                  </div>
                  <button
                    className="absolute right-0.5 top-0.5 z-20 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/20 bg-red-500/90 text-white opacity-0 transition-all group-hover:opacity-100 hover:bg-red-400 hover:scale-110 shadow-sm"
                    title="删除"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    onClick={(event) => {
                      event.stopPropagation()
                      removeAt('audioAssetIds', index)
                    }}
                  >
                    <X size={8} />
                  </button>
                </div>
              )
            })}

            {audioAssetIdInput !== null ? (
              <input
                autoFocus
                type="text"
                placeholder="asset-xxxxx"
                value={audioAssetIdInput}
                onChange={(event) => setAudioAssetIdInput(event.target.value)}
                onMouseDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Enter') {
                    const value = audioAssetIdInput.trim()
                    if (value) {
                      appendUnique('audioAssetIds', [
                        value.startsWith('asset-') ? value : `asset-${value}`
                      ])
                    }
                    setAudioAssetIdInput(null)
                  } else if (event.key === 'Escape') {
                    setAudioAssetIdInput(null)
                  }
                }}
                onBlur={() => {
                  const value = (audioAssetIdInput || '').trim()
                  if (value)
                    appendUnique('audioAssetIds', [
                      value.startsWith('asset-') ? value : `asset-${value}`
                    ])
                  setAudioAssetIdInput(null)
                }}
                className="nodrag h-8 w-28 rounded-lg border border-orange-500/40 bg-[var(--bg-secondary)] px-2 text-[10px] text-orange-400 outline-none focus:border-orange-500 pointer-events-auto"
              />
            ) : (
              <AddMediaButton
                icon={LinkIcon}
                label="Asset ID"
                tone="audio"
                onClick={(event) => {
                  event.stopPropagation()
                  setAudioAssetIdInput('')
                }}
              />
            )}
          </div>
        </>
      )}

      {showFrames && (
        <div
          className={
            floating
              ? 'nodrag flex min-h-11 items-center gap-2 rounded-[14px] border border-amber-500/15 bg-amber-500/[0.06] px-2 py-1.5'
              : 'nodrag flex items-center gap-3 px-3 py-2 border-t border-[var(--border-color)]'
          }
        >
          {/* 首帧 */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-[var(--text-muted)] w-8 shrink-0">
              首帧
            </span>
            {startFrame ? (
              <div className="relative group shrink-0 h-12 w-12 rounded-lg border-2 border-amber-500/30 overflow-hidden">
                <ThumbnailImage
                  src={startFrame}
                  alt="首帧"
                  className="h-full w-full object-cover cursor-pointer"
                  onClick={(event) => {
                    event.stopPropagation()
                    setLightboxItem?.({ type: 'image', url: startFrame })
                  }}
                />
                <button
                  className="absolute right-0.5 top-0.5 z-20 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/20 bg-red-500/90 text-white opacity-0 transition-all group-hover:opacity-100 hover:bg-red-400 hover:scale-110 shadow-sm"
                  title="删除首帧"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onClick={(event) => {
                    event.stopPropagation()
                    updateNodeSettings(nodeId, { manualStartFrame: undefined })
                  }}
                >
                  <X size={8} />
                </button>
              </div>
            ) : (
              <button
                className="h-12 w-12 rounded-lg border-2 border-dashed border-amber-500/30 flex items-center justify-center text-amber-500/50 hover:border-amber-500/60 hover:text-amber-500/80 hover:bg-amber-500/5 transition-all pointer-events-auto"
                title="上传首帧图片"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={async (event) => {
                  event.stopPropagation()
                  const paths = await openPicker(IMAGE_EXTENSIONS, '首帧图片', false)
                  if (paths.length > 0) {
                    updateNodeSettings(nodeId, { manualStartFrame: paths[0] })
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  event.dataTransfer.dropEffect = 'copy'
                }}
                onDrop={async (event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (!event.dataTransfer.files?.length) return
                  const paths = await cacheDroppedFiles({
                    files: Array.from(event.dataTransfer.files),
                    extensions: IMAGE_EXTENSIONS,
                    category: 'gen-media',
                    type: 'image',
                    idPrefix: `sf_${nodeId}`
                  })
                  if (paths.length > 0) {
                    updateNodeSettings(nodeId, { manualStartFrame: paths[0] })
                  }
                }}
              >
                <Plus size={16} strokeWidth={2} />
              </button>
            )}
          </div>

          {/* 尾帧 */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-[var(--text-muted)] w-8 shrink-0">
              尾帧
            </span>
            {endFrame ? (
              <div className="relative group shrink-0 h-12 w-12 rounded-lg border-2 border-orange-500/30 overflow-hidden">
                <ThumbnailImage
                  src={endFrame}
                  alt="尾帧"
                  className="h-full w-full object-cover cursor-pointer"
                  onClick={(event) => {
                    event.stopPropagation()
                    setLightboxItem?.({ type: 'image', url: endFrame })
                  }}
                />
                <button
                  className="absolute right-0.5 top-0.5 z-20 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/20 bg-red-500/90 text-white opacity-0 transition-all group-hover:opacity-100 hover:bg-red-400 hover:scale-110 shadow-sm"
                  title="删除尾帧"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onClick={(event) => {
                    event.stopPropagation()
                    updateNodeSettings(nodeId, { manualEndFrame: undefined })
                  }}
                >
                  <X size={8} />
                </button>
              </div>
            ) : (
              <button
                className="h-12 w-12 rounded-lg border-2 border-dashed border-orange-500/30 flex items-center justify-center text-orange-500/50 hover:border-orange-500/60 hover:text-orange-500/80 hover:bg-orange-500/5 transition-all pointer-events-auto"
                title="上传尾帧图片"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={async (event) => {
                  event.stopPropagation()
                  const paths = await openPicker(IMAGE_EXTENSIONS, '尾帧图片', false)
                  if (paths.length > 0) {
                    updateNodeSettings(nodeId, { manualEndFrame: paths[0] })
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  event.dataTransfer.dropEffect = 'copy'
                }}
                onDrop={async (event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (!event.dataTransfer.files?.length) return
                  const paths = await cacheDroppedFiles({
                    files: Array.from(event.dataTransfer.files),
                    extensions: IMAGE_EXTENSIONS,
                    category: 'gen-media',
                    type: 'image',
                    idPrefix: `ef_${nodeId}`
                  })
                  if (paths.length > 0) {
                    updateNodeSettings(nodeId, { manualEndFrame: paths[0] })
                  }
                }}
              >
                <Plus size={16} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
