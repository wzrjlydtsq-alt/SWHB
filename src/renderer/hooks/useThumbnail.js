import { useState, useEffect } from 'react'
import { getXingheMediaSrc } from '../utils/fileHelpers.js'

// 内存缓存：原始路径 → 缩略图 xinghe URL
const thumbCache = new Map()

/**
 * 为给定原始路径生成/获取缩略图 URL。
 * 如果原路径不是本地文件（http/base64/blob），直接返回原路径。
 * @param {string|null} originalPath - 原始文件路径
 * @returns {string|null} 缩略图的 xinghe URL（或原路径 fallback）
 */
export function useThumbnail(originalPath) {
  const [thumbUrl, setThumbUrl] = useState(null)

  useEffect(() => {
    if (!originalPath) {
      setThumbUrl(null)
      return
    }

    // 跳过非本地文件：http URL、base64 data、blob URL
    if (
      originalPath.startsWith('http://') ||
      originalPath.startsWith('https://') ||
      originalPath.startsWith('data:') ||
      originalPath.startsWith('blob:') ||
      originalPath.startsWith('xinghe://')
    ) {
      setThumbUrl(originalPath)
      return
    }

    // 内存缓存命中
    if (thumbCache.has(originalPath)) {
      setThumbUrl(thumbCache.get(originalPath))
      return
    }

    let cancelled = false

    // 异步请求主进程生成缩略图
    window.api.thumbnailAPI
      .generate(originalPath)
      .then((result) => {
        if (cancelled) return
        if (result.success && result.thumbPath) {
          const url = getXingheMediaSrc(result.thumbPath)
          thumbCache.set(originalPath, url)
          setThumbUrl(url)
        } else {
          // 生成失败，回退到原图
          const url = getXingheMediaSrc(originalPath)
          thumbCache.set(originalPath, url)
          setThumbUrl(url)
        }
      })
      .catch(() => {
        if (cancelled) return
        const url = getXingheMediaSrc(originalPath)
        thumbCache.set(originalPath, url)
        setThumbUrl(url)
      })

    return () => {
      cancelled = true
    }
  }, [originalPath])

  return thumbUrl
}

/**
 * 批量获取多个路径的缩略图 URL（非 hook 版本，用于命令式调用）。
 * @param {string[]} paths
 * @returns {Promise<Map<string, string>>}
 */
export async function batchGenerateThumbnails(paths) {
  const result = new Map()
  const toGenerate = []

  for (const p of paths) {
    if (thumbCache.has(p)) {
      result.set(p, thumbCache.get(p))
    } else if (
      p.startsWith('http://') ||
      p.startsWith('https://') ||
      p.startsWith('data:') ||
      p.startsWith('blob:') ||
      p.startsWith('xinghe://')
    ) {
      result.set(p, p)
    } else {
      toGenerate.push(p)
    }
  }

  // 并行生成
  await Promise.all(
    toGenerate.map(async (p) => {
      try {
        const res = await window.api.thumbnailAPI.generate(p)
        const url = res.success && res.thumbPath
          ? getXingheMediaSrc(res.thumbPath)
          : getXingheMediaSrc(p)
        thumbCache.set(p, url)
        result.set(p, url)
      } catch {
        const url = getXingheMediaSrc(p)
        thumbCache.set(p, url)
        result.set(p, url)
      }
    })
  )

  return result
}
