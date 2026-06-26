import { useEffect, useMemo, useState } from 'react'
import { useNearViewport } from '../../hooks/useNearViewport.ts'

const EMPTY_FALLBACK_SRCS = []
const MAX_DATA_BLOB_CACHE = 50
const dataBlobCache = new Map<string, string>()

function uniqueSources(sources) {
  const seen = new Set()
  return sources.filter((source) => {
    if (!source || seen.has(source)) return false
    seen.add(source)
    return true
  })
}

function rememberDataBlob(source, blobUrl) {
  if (dataBlobCache.has(source)) dataBlobCache.delete(source)
  dataBlobCache.set(source, blobUrl)

  while (dataBlobCache.size > MAX_DATA_BLOB_CACHE) {
    const oldestKey = dataBlobCache.keys().next().value
    if (!oldestKey) break
    const oldestUrl = dataBlobCache.get(oldestKey)
    dataBlobCache.delete(oldestKey)
    if (oldestUrl?.startsWith('blob:')) URL.revokeObjectURL(oldestUrl)
  }
}

function isDirectMediaSrc(source) {
  return (
    !source ||
    source.startsWith('blob:') ||
    source.startsWith('http://') ||
    source.startsWith('https://') ||
    source.startsWith('xinghe:')
  )
}

export const LazyBase64Image = ({
  src,
  fallbackSrcs = EMPTY_FALLBACK_SRCS,
  className,
  alt,
  onError,
  onLoad = undefined,
  ...props
}) => {
  const [displaySrc, setDisplaySrc] = useState(null)
  const [error, setError] = useState(false)
  const [sourceIndex, setSourceIndex] = useState(0)
  const [containerRef, isNearViewport] = useNearViewport()
  const sources = useMemo(
    () => uniqueSources([src, ...(Array.isArray(fallbackSrcs) ? fallbackSrcs : [])]),
    [src, fallbackSrcs]
  )
  const sourcesKey = sources.join('\n')
  const activeSrc = sources[sourceIndex] || null

  useEffect(() => {
    setSourceIndex(0)
    setError(false)
    setDisplaySrc(null)
  }, [sourcesKey])

  useEffect(() => {
    if (!isNearViewport) return

    if (isDirectMediaSrc(activeSrc)) {
      setDisplaySrc(activeSrc)
      return
    }

    if (activeSrc?.startsWith('data:')) {
      const cached = dataBlobCache.get(activeSrc)
      if (cached) {
        dataBlobCache.delete(activeSrc)
        dataBlobCache.set(activeSrc, cached)
        setDisplaySrc(cached)
        return
      }

      let cancelled = false
      fetch(activeSrc)
        .then((res) => res.blob())
        .then((blob) => {
          if (cancelled) return
          const url = URL.createObjectURL(blob)
          rememberDataBlob(activeSrc, url)
          setDisplaySrc(url)
        })
        .catch((err) => {
          console.error('Base64 to Blob failed', err)
          if (cancelled) return
          setError(true)
          setDisplaySrc(activeSrc)
        })

      return () => {
        cancelled = true
      }
    }

    setDisplaySrc(activeSrc)
  }, [activeSrc, isNearViewport])

  if ((error && !displaySrc) || !displaySrc) {
    return <div ref={containerRef as React.Ref<HTMLDivElement>} className={className} {...props} />
  }

  return (
    <img
      src={displaySrc}
      className={className}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={(event) => {
        if (sourceIndex < sources.length - 1) {
          event.currentTarget.style.removeProperty('display')
          setError(false)
          setSourceIndex((idx) => idx + 1)
          return
        }
        setError(true)
        onError?.(event)
      }}
      onLoad={onLoad}
      {...props}
    />
  )
}
