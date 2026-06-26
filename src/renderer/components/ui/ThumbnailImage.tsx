import { useEffect, useState } from 'react'
import type { CSSProperties, ImgHTMLAttributes, SyntheticEvent } from 'react'
import { getXingheMediaSrc } from '../../utils/fileHelpers.ts'
import { useNearViewport } from '../../hooks/useNearViewport.ts'

const thumbCache = new Map<string, string>()
const MAX_THUMB_CACHE_SIZE = 160
const MAX_THUMBNAIL_JOBS = 1
const THUMBNAIL_JOB_DELAY_MS = 140

let activeThumbnailJobs = 0
const thumbnailQueue: Array<() => void> = []

function runThumbnailQueue() {
  while (activeThumbnailJobs < MAX_THUMBNAIL_JOBS && thumbnailQueue.length > 0) {
    const task = thumbnailQueue.shift()
    if (!task) return
    activeThumbnailJobs += 1
    window.setTimeout(task, THUMBNAIL_JOB_DELAY_MS)
  }
}

function enqueueThumbnailJob<T>(task: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    thumbnailQueue.push(() => {
      task()
        .then(resolve, reject)
        .finally(() => {
          activeThumbnailJobs = Math.max(0, activeThumbnailJobs - 1)
          runThumbnailQueue()
        })
    })
    runThumbnailQueue()
  })
}

function rememberThumb(key: string, value: string) {
  if (thumbCache.has(key)) {
    thumbCache.delete(key)
  }
  thumbCache.set(key, value)

  while (thumbCache.size > MAX_THUMB_CACHE_SIZE) {
    const oldestKey = thumbCache.keys().next().value
    if (!oldestKey) break
    thumbCache.delete(oldestKey)
  }
}

function canUseDirectly(src: string) {
  return (
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('data:') ||
    src.startsWith('blob:') ||
    src.startsWith('xinghe:')
  )
}

type ThumbnailImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'style'> & {
  src?: string | null
  alt?: string
  className?: string
  style?: CSSProperties
  draggable?: boolean
  onError?: (event: SyntheticEvent<HTMLImageElement, Event>) => void
  onLoad?: (event: SyntheticEvent<HTMLImageElement, Event>) => void
}

export function ThumbnailImage({
  src,
  alt,
  className,
  style,
  draggable,
  onError,
  onLoad,
  ...imgProps
}: ThumbnailImageProps) {
  const [displayUrl, setDisplayUrl] = useState<string | null>(null)
  const [hasError, setHasError] = useState(false)
  const [containerRef, isNearViewport] = useNearViewport<HTMLDivElement>()

  useEffect(() => {
    if (!src) {
      setDisplayUrl(null)
      setHasError(false)
      return
    }

    setHasError(false)
    if (!isNearViewport) return

    if (canUseDirectly(src)) {
      setDisplayUrl(src)
      return
    }

    const cached = thumbCache.get(src)
    if (cached) {
      rememberThumb(src, cached)
      setDisplayUrl(cached)
      return
    }

    let cancelled = false
    const fallbackUrl = getXingheMediaSrc(src)

    if (!window.api?.thumbnailAPI?.generate) {
      rememberThumb(src, fallbackUrl)
      setDisplayUrl(fallbackUrl)
      return
    }

    enqueueThumbnailJob(() => window.api.thumbnailAPI.generate(src))
      .then((result: any) => {
        if (cancelled) return

        if (result?.success && result.thumbPath) {
          const thumbUrl = getXingheMediaSrc(result.thumbPath)
          rememberThumb(src, thumbUrl)
          setDisplayUrl(thumbUrl)
          return
        }

        rememberThumb(src, fallbackUrl)
        setDisplayUrl(fallbackUrl)
      })
      .catch(() => {
        if (cancelled) return
        rememberThumb(src, fallbackUrl)
        setDisplayUrl(fallbackUrl)
      })

    return () => {
      cancelled = true
    }
  }, [isNearViewport, src])

  if (!displayUrl || hasError) {
    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          ...style,
          background: style?.background || 'rgba(255,255,255,0.035)'
        }}
      />
    )
  }

  return (
    <img
      src={displayUrl}
      alt={alt}
      className={className}
      style={style}
      draggable={draggable}
      loading="lazy"
      decoding="async"
      {...imgProps}
      onError={(event) => {
        setHasError(true)
        onError?.(event)
      }}
      onLoad={onLoad}
    />
  )
}
