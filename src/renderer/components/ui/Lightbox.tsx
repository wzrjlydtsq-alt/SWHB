import { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight, Copy, Check } from '../../utils/icons.tsx'
import { getPreferredMediaUrl, getXingheMediaSrc, isVideoUrl } from '../../utils/fileHelpers.ts'
import { friendlyError } from '../../utils/friendlyError.ts'

const normalizeLightboxItem = (item) => {
  if (!item) return null
  if (typeof item === 'string') {
    return { type: 'image', url: item }
  }
  return item
}

const formatDuration = (ms) => {
  const value = Number(ms)
  if (!Number.isFinite(value) || value <= 0) return null
  if (value < 1000) return `${Math.round(value)}ms`
  const seconds = value / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${minutes}m ${rest}s`
}

const resolveDurationMs = (item) => {
  const direct = item?.durationMs || item?.duration_ms
  if (direct) return direct
  const start = item?.startTime || item?.createdAt || item?.created_at
  const end = item?.completedAt || item?.completed_at || item?.timeMs
  if (start && end) return Number(end) - Number(start)
  return null
}

const firstText = (...values) => {
  const value = values.find((item) => typeof item === 'string' && item.trim())
  return value ? value.trim() : ''
}

export const Lightbox = ({ item, onClose, onNavigate, scope = 'viewport' }) => {
  const normalizedItem = normalizeLightboxItem(item)
  const mediaUrl = getPreferredMediaUrl(normalizedItem)
  const mediaSrc = mediaUrl ? getXingheMediaSrc(mediaUrl) : ''
  const mediaType =
    normalizedItem?.type === 'video' || normalizedItem?.mediaType === 'video' || isVideoUrl(mediaUrl)
      ? 'video'
      : 'image'
  const itemRef = useRef(normalizedItem)
  const [copiedKey, setCopiedKey] = useState('')
  const [mediaLoadError, setMediaLoadError] = useState(false)
  const [mediaReloadKey, setMediaReloadKey] = useState(0)
  const scoped = scope === 'parent'

  useEffect(() => {
    itemRef.current = normalizedItem
  }, [normalizedItem])

  useEffect(() => {
    setMediaLoadError(false)
    setMediaReloadKey(0)
  }, [mediaSrc])

  useEffect(() => {
    if (!normalizedItem) return

    const handleKeyDown = (e) => {
      const currentItem = itemRef.current
      if (!currentItem?.mjImages || currentItem.mjImages.length <= 1) return
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return

      const currentIndex =
        currentItem.selectedMjImageIndex !== undefined ? currentItem.selectedMjImageIndex : 0

      if (e.key === 'ArrowLeft' || e.key === 'Left') {
        e.preventDefault()
        e.stopPropagation()
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : currentItem.mjImages.length - 1
        if (prevIndex >= 0 && prevIndex < currentItem.mjImages.length && onNavigate) {
          onNavigate(prevIndex)
        }
      } else if (e.key === 'ArrowRight' || e.key === 'Right') {
        e.preventDefault()
        e.stopPropagation()
        const nextIndex = currentIndex < currentItem.mjImages.length - 1 ? currentIndex + 1 : 0
        if (nextIndex >= 0 && nextIndex < currentItem.mjImages.length && onNavigate) {
          onNavigate(nextIndex)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [normalizedItem, onNavigate])

  if (!normalizedItem) return null

  const selectedImageIndex =
    normalizedItem.selectedMjImageIndex !== undefined ? normalizedItem.selectedMjImageIndex : 0
  const promptText = normalizedItem.prompt || ''
  const errorText = normalizedItem.errorMsg ? friendlyError(normalizedItem.errorMsg) : ''
  const durationText = formatDuration(resolveDurationMs(normalizedItem))
  const displayPromptText =
    firstText(
      promptText,
      normalizedItem.originalPayload?.prompt,
      normalizedItem.settings?.prompt,
      normalizedItem.settings?.videoPrompt,
      normalizedItem.sourceMeta?.prompt
    ) || '无提示词'
  const rawErrorText = firstText(
    normalizedItem.rawErrorMsg,
    normalizedItem.errorMsg,
    normalizedItem.error
  )
  const displayErrorText = rawErrorText ? friendlyError(rawErrorText) : errorText
  const shouldShowErrorState =
    displayErrorText && (normalizedItem.status === 'failed' || normalizedItem.status === 'error')
  const requestId = normalizedItem.requestId || normalizedItem.request_id || normalizedItem.id
  const taskId =
    normalizedItem.taskId ||
    normalizedItem.task_id ||
    normalizedItem.remoteTaskId ||
    normalizedItem.remote_task_id ||
    normalizedItem.id

  const copyText = async (key, text) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(String(text))
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey(''), 1200)
    } catch (error) {
      console.warn('[Lightbox] copy failed:', error)
    }
  }

  const retryMediaLoad = (event) => {
    event.stopPropagation()
    setMediaLoadError(false)
    setMediaReloadKey((value) => value + 1)
  }

  const handleMediaDragStart = (event) => {
    if (!mediaUrl) {
      event.preventDefault()
      return
    }
    event.dataTransfer.setData('asset-path', mediaUrl)
    event.dataTransfer.setData('asset-type', mediaType)
    event.dataTransfer.setData('text/plain', mediaUrl)
    event.dataTransfer.effectAllowed = 'copy'
  }

  const CopyButton = ({ copyKey, text, label = '复制' }) => (
    <button
      type="button"
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-medium text-white/70 transition-colors hover:bg-white/15 hover:text-white"
      onClick={(event) => {
        event.stopPropagation()
        copyText(copyKey, text)
      }}
    >
      {copiedKey === copyKey ? <Check size={11} /> : <Copy size={11} />}
      {copiedKey === copyKey ? '已复制' : label}
    </button>
  )

  const lightboxNode = (
    <div
      className={`${scoped ? 'absolute' : 'fixed'} inset-0 z-[200] lightbox-overlay flex flex-col items-center justify-center animate-in fade-in duration-200`}
      onClick={onClose}
    >
      <button
        className={`${scoped ? 'top-3 right-3 p-1.5' : 'top-4 right-4 p-2'} absolute text-white/70 hover:text-white bg-black/50 rounded-full transition-colors`}
        onClick={onClose}
      >
        <X size={scoped ? 18 : 24} />
      </button>

      <div
        className={`flex min-h-0 flex-col items-center ${scoped ? 'h-[92%] w-[94%]' : 'h-[95vh] w-[min(90vw,1600px)]'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex min-h-0 flex-1 w-full justify-center">
          {mediaSrc && !mediaLoadError && !shouldShowErrorState ? (
            mediaType === 'image' ? (
              <img
                key={`${mediaSrc}-${mediaReloadKey}`}
                src={mediaSrc}
                alt={normalizedItem.prompt || normalizedItem.title || ''}
                className="h-full max-w-full rounded-lg object-contain shadow-2xl"
                draggable
                onDragStart={handleMediaDragStart}
                onError={() => setMediaLoadError(true)}
              />
            ) : (
              <video
                key={`${mediaSrc}-${mediaReloadKey}`}
                src={mediaSrc}
                controls
                autoPlay
                className="h-full max-w-full rounded-lg object-contain shadow-2xl"
                draggable
                onDragStart={handleMediaDragStart}
                onError={() => setMediaLoadError(true)}
              />
            )
          ) : mediaSrc && mediaLoadError && !shouldShowErrorState ? (
            <div className="min-w-80 max-w-[600px] rounded-lg border border-amber-500/30 bg-amber-950/30 px-6 py-8 text-center shadow-2xl">
              <div className="mb-3 text-sm font-medium text-amber-200">媒体加载失败</div>
              <button
                type="button"
                className="rounded-md border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                onClick={retryMediaLoad}
              >
                重试加载
              </button>
            </div>
          ) : displayErrorText ? (
            <div className="min-w-80 max-w-[600px] rounded-lg border border-red-500/30 bg-red-950/40 px-6 py-8 text-center shadow-2xl">
              <div className="text-red-400 text-sm font-medium mb-3">❌ 生成失败</div>
              <div className="text-red-300/80 text-xs leading-relaxed break-all whitespace-pre-wrap">
                {displayErrorText}
              </div>
            </div>
          ) : (
            <div className="min-w-64 rounded-lg border border-white/10 bg-black/60 px-6 py-8 text-center text-sm text-white/80 shadow-2xl">
              媒体地址为空
            </div>
          )}

          {normalizedItem.mjImages && normalizedItem.mjImages.length > 1 && (
            <>
              <button
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-3 bg-black/50 rounded-full transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  const prevIndex =
                    selectedImageIndex > 0
                      ? selectedImageIndex - 1
                      : normalizedItem.mjImages.length - 1
                  if (onNavigate) onNavigate(prevIndex)
                }}
                title="上一张"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-3 bg-black/50 rounded-full transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  const nextIndex =
                    selectedImageIndex < normalizedItem.mjImages.length - 1
                      ? selectedImageIndex + 1
                      : 0
                  if (onNavigate) onNavigate(nextIndex)
                }}
                title="下一张"
              >
                <ChevronRight size={24} />
              </button>
            </>
          )}
        </div>

        <div
          className={`${scoped ? 'mt-2 hidden' : 'mt-3 flex'} h-[26vh] max-h-[260px] min-h-[116px] w-full shrink-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-black/60 px-6 py-4 text-white shadow-2xl backdrop-blur-md`}
        >
          <div className="flex min-h-0 flex-1 items-stretch gap-3 overflow-hidden">
            <div
              className="h-full min-h-0 min-w-0 flex-1 select-text overflow-y-auto overscroll-contain whitespace-pre-wrap break-words pr-2 text-sm font-medium leading-relaxed"
              style={{ userSelect: 'text', cursor: 'text' }}
              onClick={(event) => event.stopPropagation()}
            >
              {displayPromptText}
            </div>
            <div className="shrink-0 self-start">
              <CopyButton copyKey="prompt" text={displayPromptText} label="复制提示词" />
            </div>
          </div>

          <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2 text-[11px]">
            <span className="px-2.5 py-1 bg-blue-500/20 rounded-md text-blue-300 border border-blue-500/30">
              模型: {firstText(
                normalizedItem.modelName,
                normalizedItem.apiConfig?.modelName,
                normalizedItem.apiConfig?.modelId,
                normalizedItem.originalPayload?.configName,
                normalizedItem.originalPayload?.modelId,
                normalizedItem.settings?.model
              ) || '未知'}
            </span>

            {durationText && (
              <span className="px-2.5 py-1 bg-amber-500/20 rounded-md text-amber-200 border border-amber-500/30">
                生成时长: {durationText}
              </span>
            )}

            {requestId && (
              <span className="inline-flex max-w-full items-center gap-1.5 px-2.5 py-1 bg-cyan-500/15 rounded-md text-cyan-200 border border-cyan-500/25">
                <span className="shrink-0">Request ID:</span>
                <span className="max-w-[220px] truncate font-mono">{requestId}</span>
                <CopyButton copyKey="requestId" text={requestId} />
              </span>
            )}

            {taskId && (
              <span className="inline-flex max-w-full items-center gap-1.5 px-2.5 py-1 bg-green-500/20 rounded-md text-green-300 border border-green-500/30">
                <span className="shrink-0">task_id:</span>
                <span className="max-w-[220px] truncate font-mono">{taskId}</span>
                <CopyButton copyKey="taskId" text={taskId} />
              </span>
            )}

            {normalizedItem.width && normalizedItem.height && (
              <span className="px-2.5 py-1 bg-zinc-700/50 rounded-md text-zinc-400 border border-zinc-600/30">
                {normalizedItem.width}x{normalizedItem.height}
              </span>
            )}

            {normalizedItem.mjImages && normalizedItem.mjImages.length > 1 && (
              <span className="px-2.5 py-1 bg-purple-500/20 rounded-md text-purple-300 border border-purple-500/30">
                {selectedImageIndex + 1} / {normalizedItem.mjImages.length}
              </span>
            )}
          </div>

          {displayErrorText && (
            <div className="mt-2 w-full bg-red-950/50 backdrop-blur-md px-5 py-3 rounded-xl border border-red-500/30 shadow-lg">
              <div className="text-[11px] font-semibold text-red-400 mb-1.5">❌ 报错详情</div>
              <div
                className="text-[11px] text-red-300/80 leading-relaxed break-all whitespace-pre-wrap select-text"
                style={{ userSelect: 'text', cursor: 'text' }}
              >
                {displayErrorText}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  if (scoped || typeof document === 'undefined') return lightboxNode
  return createPortal(lightboxNode, document.body)
}
