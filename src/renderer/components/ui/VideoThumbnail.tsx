import { useEffect, useMemo, useRef, useState } from 'react'
import { getXingheMediaSrc } from '../../utils/fileHelpers.ts'
import { useNearViewport } from '../../hooks/useNearViewport.ts'
import { Film } from '../../utils/icons.tsx'

const MAX_THUMB_CACHE = 80
const MAX_CAPTURE_CONCURRENCY = 1
const THUMB_MAX_WIDTH = 240
const THUMB_MAX_HEIGHT = 135
const VIDEO_ROOT_MARGIN = '220px'

type ThumbCacheEntry = { url: string; width: number; height: number }
type CapturedVideoThumbnail = ThumbCacheEntry & { blob: Blob }

const thumbCache = new Map<string, ThumbCacheEntry>()
const failedThumbSources = new Set<string>()
let activeCaptures = 0
const captureQueue: Array<() => void> = []

function runQueuedCaptures() {
  while (activeCaptures < MAX_CAPTURE_CONCURRENCY && captureQueue.length > 0) {
    const task = captureQueue.shift()
    if (!task) return
    activeCaptures += 1
    task()
  }
}

function enqueueCapture<T>(task: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    captureQueue.push(() => {
      task()
        .then(resolve, reject)
        .finally(() => {
          activeCaptures = Math.max(0, activeCaptures - 1)
          runQueuedCaptures()
        })
    })
    runQueuedCaptures()
  })
}

function setThumbCache(key: string, value: ThumbCacheEntry) {
  const existing = thumbCache.get(key)
  if (existing?.url?.startsWith('blob:') && existing.url !== value.url) {
    URL.revokeObjectURL(existing.url)
  }
  if (thumbCache.has(key)) thumbCache.delete(key)
  thumbCache.set(key, value)

  while (thumbCache.size > MAX_THUMB_CACHE) {
    const firstKey = thumbCache.keys().next().value
    if (firstKey === undefined) break
    const evicted = thumbCache.get(firstKey)
    thumbCache.delete(firstKey)
    if (evicted?.url?.startsWith('blob:')) URL.revokeObjectURL(evicted.url)
  }
}

function resolveVideoSrc(src: string) {
  const videoSrc =
    src.startsWith('http') ||
    src.startsWith('data:') ||
    src.startsWith('blob:') ||
    src.startsWith('xinghe:')
      ? src
      : getXingheMediaSrc(src)

  return videoSrc + (videoSrc.includes('#') ? '' : '#t=0.1')
}

function shouldUseDiskVideoThumb(src: string) {
  return Boolean(
    src &&
      !src.startsWith('blob:') &&
      !src.startsWith('data:') &&
      window.api?.thumbnailAPI?.getVideo &&
      window.api?.thumbnailAPI?.saveVideo
  )
}

async function readDiskCachedVideoThumbnail(src: string): Promise<ThumbCacheEntry | null> {
  if (!shouldUseDiskVideoThumb(src)) return null

  const cached = await window.api.thumbnailAPI.getVideo(src)
  if (!cached?.success || !cached.thumbPath) return null

  return {
    url: getXingheMediaSrc(cached.thumbPath),
    width: Number(cached.width) || 0,
    height: Number(cached.height) || 0
  }
}

async function saveVideoThumbnailToDisk(src: string, thumb: CapturedVideoThumbnail) {
  if (!shouldUseDiskVideoThumb(src)) return

  try {
    const content = await thumb.blob.arrayBuffer()
    await window.api.thumbnailAPI.saveVideo(src, content, {
      width: thumb.width,
      height: thumb.height
    })
  } catch (error) {
    console.warn('[VideoThumbnail] Failed to save disk thumbnail cache:', error)
  }
}

function captureVideoThumbnail(src: string) {
  return new Promise<CapturedVideoThumbnail>((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'

    let settled = false
    const cleanup = () => {
      video.removeEventListener('loadeddata', onLoaded)
      video.removeEventListener('loadedmetadata', onMetadata)
      video.removeEventListener('error', onError)
      video.src = ''
      video.load()
    }

    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error instanceof Error ? error : new Error('Video thumbnail load failed'))
    }

    const drawFrame = () => {
      if (settled) return
      try {
        const sourceWidth = video.videoWidth || 160
        const sourceHeight = video.videoHeight || 90
        const scale = Math.min(
          1,
          THUMB_MAX_WIDTH / Math.max(1, sourceWidth),
          THUMB_MAX_HEIGHT / Math.max(1, sourceHeight)
        )
        const width = Math.max(1, Math.round(sourceWidth * scale))
        const height = Math.max(1, Math.round(sourceHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d', { alpha: false })
        if (!ctx) throw new Error('No canvas context')

        ctx.drawImage(video, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (settled) return
            settled = true
            cleanup()
            if (!blob) {
              reject(new Error('Failed to encode thumbnail'))
              return
            }
            resolve({
              url: URL.createObjectURL(blob),
              width: sourceWidth,
              height: sourceHeight,
              blob
            })
          },
          'image/jpeg',
          0.6
        )
      } catch (error) {
        fail(error)
      }
    }

    const onLoaded = () => drawFrame()
    const onMetadata = () => {
      if (video.readyState >= 2) drawFrame()
    }
    const onError = () => fail(new Error('Video thumbnail load failed'))

    video.addEventListener('loadeddata', onLoaded, { once: true })
    video.addEventListener('loadedmetadata', onMetadata, { once: true })
    video.addEventListener('error', onError, { once: true })
    video.src = resolveVideoSrc(src)
  })
}

type VideoThumbnailProps = {
  src?: string | null
  fallbackSrcs?: Array<string | null | undefined>
  className?: string
  style?: React.CSSProperties
  onLoadedDimensions?: (width: number, height: number) => void
  allowCapture?: boolean
}

export function VideoThumbnail({
  src,
  fallbackSrcs = [],
  className,
  style,
  onLoadedDimensions,
  allowCapture = false
}: VideoThumbnailProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [sourceIndex, setSourceIndex] = useState(0)
  const [containerRef, isNearViewport] = useNearViewport<HTMLDivElement>(VIDEO_ROOT_MARGIN)
  const onLoadedDimensionsRef = useRef(onLoadedDimensions)
  const fallbackKey = fallbackSrcs.filter(Boolean).join('\n')
  const sourceCandidates = useMemo(() => {
    const seen = new Set<string>()
    return [src, ...fallbackSrcs].filter((value): value is string => {
      if (typeof value !== 'string' || !value.trim()) return false
      const key = value.trim()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [fallbackKey, src])
  const sourceKey = sourceCandidates.join('\n')
  const activeSrc = sourceCandidates[sourceIndex] || ''

  useEffect(() => {
    onLoadedDimensionsRef.current = onLoadedDimensions
  }, [onLoadedDimensions])

  useEffect(() => {
    setSourceIndex(0)
    setThumbUrl((prev) => (prev === null ? prev : null))
    setError((prev) => (prev ? false : prev))
  }, [sourceKey])

  useEffect(() => {
    if (!activeSrc) {
      setThumbUrl((prev) => (prev === null ? prev : null))
      setError((prev) => (prev ? false : prev))
      return
    }

    setError((prev) => (prev ? false : prev))
    if (!isNearViewport) return
    if (failedThumbSources.has(activeSrc)) {
      if (sourceIndex + 1 < sourceCandidates.length) {
        setSourceIndex(sourceIndex + 1)
        return
      }
      setError((prev) => (prev ? prev : true))
      return
    }

    const cached = thumbCache.get(activeSrc)
    if (cached) {
      thumbCache.delete(activeSrc)
      thumbCache.set(activeSrc, cached)
      setThumbUrl((prev) => (prev === cached.url ? prev : cached.url))
      if (cached.width > 0 && cached.height > 0) {
        onLoadedDimensionsRef.current?.(cached.width, cached.height)
      }
      return
    }

    let cancelled = false

    const loadThumbnail = async () => {
      const diskCached = await readDiskCachedVideoThumbnail(activeSrc)
      if (cancelled) return

      if (diskCached) {
        setThumbCache(activeSrc, diskCached)
        setThumbUrl((prev) => (prev === diskCached.url ? prev : diskCached.url))
        if (diskCached.width > 0 && diskCached.height > 0) {
          onLoadedDimensionsRef.current?.(diskCached.width, diskCached.height)
        }
        return
      }

      if (!allowCapture) {
        return
      }

      const thumb = await enqueueCapture(() => captureVideoThumbnail(activeSrc))
      const cacheEntry = { url: thumb.url, width: thumb.width, height: thumb.height }
      setThumbCache(activeSrc, cacheEntry)
      void saveVideoThumbnailToDisk(activeSrc, thumb)

      if (!cancelled) {
        setThumbUrl((prev) => (prev === thumb.url ? prev : thumb.url))
        onLoadedDimensionsRef.current?.(thumb.width, thumb.height)
      }
    }

    loadThumbnail()
      .catch(() => {
        if (cancelled) return
        failedThumbSources.add(activeSrc)
        if (sourceIndex + 1 < sourceCandidates.length) {
          setSourceIndex(sourceIndex + 1)
          return
        }
        setError((prev) => (prev ? prev : true))
      })

    return () => {
      cancelled = true
    }
  }, [activeSrc, allowCapture, isNearViewport, sourceCandidates.length, sourceIndex])

  if (error || !thumbUrl) {
    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          ...style,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.2)'
        }}
      >
        <Film size={14} style={{ opacity: 0.4 }} />
      </div>
    )
  }

  return (
    <img
      src={thumbUrl}
      alt=""
      className={className}
      style={style}
      draggable={false}
      loading="lazy"
      decoding="async"
    />
  )
}
