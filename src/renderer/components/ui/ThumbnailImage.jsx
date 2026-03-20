import { useState, useEffect } from 'react'
import { getXingheMediaSrc } from '../../utils/fileHelpers.js'

// 内存缓存：原始路径 → 缩略图 xinghe URL
const thumbCache = new Map()

/**
 * 带缩略图支持的 <img> 组件。
 * - 如果是本地文件路径，异步生成缩略图后显示
 * - 如果是 http/base64/blob/xinghe，直接用 getXingheMediaSrc
 * - 生成失败时回退到原图
 */
export function ThumbnailImage({ src, alt, className, style, draggable, onError, onLoad }) {
  const [displayUrl, setDisplayUrl] = useState(null)

  useEffect(() => {
    if (!src) {
      setDisplayUrl(null)
      return
    }

    // 非本地文件直接显示
    if (
      src.startsWith('http://') ||
      src.startsWith('https://') ||
      src.startsWith('data:') ||
      src.startsWith('blob:') ||
      src.startsWith('xinghe://')
    ) {
      setDisplayUrl(src)
      return
    }

    // 内存缓存命中
    if (thumbCache.has(src)) {
      setDisplayUrl(thumbCache.get(src))
      return
    }

    // 先显示原图（防止闪白），再异步替换为缩略图
    setDisplayUrl(getXingheMediaSrc(src))

    let cancelled = false
    window.api.thumbnailAPI
      .generate(src)
      .then((result) => {
        if (cancelled) return
        if (result.success && result.thumbPath) {
          const url = getXingheMediaSrc(result.thumbPath)
          thumbCache.set(src, url)
          setDisplayUrl(url)
        }
      })
      .catch(() => {
        // 保持原图
      })

    return () => { cancelled = true }
  }, [src])

  if (!displayUrl) return null

  return (
    <img
      src={displayUrl}
      alt={alt}
      className={className}
      style={style}
      draggable={draggable}
      onError={onError}
      onLoad={onLoad}
    />
  )
}
