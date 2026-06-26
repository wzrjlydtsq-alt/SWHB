import { app, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

const THUMB_SIZE = 160 // 短边 px
const THUMB_QUALITY = 'good' // nativeImage resize quality
const MAX_THUMB_CACHE_FILES = 1000
const MAX_THUMB_CACHE_BYTES = 512 * 1024 * 1024
const THUMB_PRUNE_INTERVAL_MS = 60 * 1000
let thumbCacheDir = null
let lastPruneAt = 0

function ensureCacheDir() {
  if (!thumbCacheDir) {
    thumbCacheDir = path.join(app.getPath('userData'), 'thumbnail_cache')
  }
  if (!fs.existsSync(thumbCacheDir)) {
    fs.mkdirSync(thumbCacheDir, { recursive: true })
  }
  return thumbCacheDir
}

function getThumbPath(originalPath) {
  const hash = crypto.createHash('md5').update(originalPath).digest('hex')
  return path.join(ensureCacheDir(), `${hash}.webp`)
}

function resolveMediaSourcePath(source) {
  if (!source || typeof source !== 'string') return ''

  try {
    if (source.startsWith('xinghe://local')) {
      const url = new URL(source)
      const encodedPath = url.searchParams.get('path')
      if (encodedPath) return decodeURIComponent(encodedPath)
    }
  } catch {
    // Fall back to the raw source string.
  }

  return source
}

function getVideoThumbPath(source) {
  const resolvedSource = resolveMediaSourcePath(source)
  let cacheKey = resolvedSource

  try {
    if (path.isAbsolute(resolvedSource) && fs.existsSync(resolvedSource)) {
      const stat = fs.statSync(resolvedSource)
      cacheKey = `${resolvedSource}|${stat.size}|${Math.round(stat.mtimeMs)}`
    }
  } catch {
    // If stat fails, the raw source is still a stable fallback key.
  }

  const hash = crypto.createHash('md5').update(cacheKey).digest('hex')
  return path.join(ensureCacheDir(), `video_${hash}.jpg`)
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath)
  } catch {
    return null
  }
}

function deleteFileIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const stat = safeStat(filePath)
      fs.unlinkSync(filePath)
      return stat?.size || 0
    }
  } catch {
    // Best-effort cache cleanup only.
  }
  return 0
}

function pruneThumbnailCache() {
  const now = Date.now()
  if (now - lastPruneAt < THUMB_PRUNE_INTERVAL_MS) return
  lastPruneAt = now

  try {
    const dir = ensureCacheDir()
    const entries = fs
      .readdirSync(dir)
      .map((name) => {
        const filePath = path.join(dir, name)
        const stat = safeStat(filePath)
        if (!stat || !stat.isFile()) return null
        return { name, filePath, size: stat.size, mtimeMs: stat.mtimeMs }
      })
      .filter(Boolean)

    let totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0)
    const primaryEntries = entries
      .filter((entry) => !entry.name.endsWith('.json'))
      .sort((a, b) => a.mtimeMs - b.mtimeMs)

    if (primaryEntries.length <= MAX_THUMB_CACHE_FILES && totalBytes <= MAX_THUMB_CACHE_BYTES) {
      return
    }

    while (
      primaryEntries.length > MAX_THUMB_CACHE_FILES ||
      (totalBytes > MAX_THUMB_CACHE_BYTES && primaryEntries.length > 0)
    ) {
      const oldest = primaryEntries.shift()
      if (!oldest) break
      totalBytes -= deleteFileIfExists(oldest.filePath)
      totalBytes -= deleteFileIfExists(`${oldest.filePath}.json`)
    }

    for (const entry of entries) {
      if (!entry.name.endsWith('.json')) continue
      const primaryPath = entry.filePath.slice(0, -'.json'.length)
      if (!fs.existsSync(primaryPath)) {
        deleteFileIfExists(entry.filePath)
      }
    }
  } catch (err) {
    console.warn('[ThumbnailService] Cache prune skipped:', err?.message || err)
  }
}

/**
 * 生成缩略图。如果缓存已存在则直接返回路径。
 * @param {string} originalPath - 原图绝对路径
 * @param {number} [size] - 缩略图短边大小（默认 160）
 * @returns {{ success: boolean, thumbPath?: string, error?: string }}
 */
export function generateThumbnail(originalPath, size = THUMB_SIZE) {
  try {
    if (!originalPath || !fs.existsSync(originalPath)) {
      return { success: false, error: '文件不存在' }
    }

    // 只处理图片
    const ext = path.extname(originalPath).toLowerCase()
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']
    if (!imageExts.includes(ext)) {
      return { success: false, error: '不是图片文件' }
    }

    const thumbPath = getThumbPath(originalPath)

    // 缓存命中
    if (fs.existsSync(thumbPath)) {
      return { success: true, thumbPath }
    }

    // 用 nativeImage 生成缩略图
    const img = nativeImage.createFromPath(originalPath)
    if (img.isEmpty()) {
      return { success: false, error: '无法读取图片' }
    }

    const { width, height } = img.getSize()
    // 按短边缩放
    let newW, newH
    if (width <= size && height <= size) {
      // 原图已经很小，直接用原图
      return { success: true, thumbPath: originalPath }
    } else if (width < height) {
      newW = size
      newH = Math.round((height / width) * size)
    } else {
      newH = size
      newW = Math.round((width / height) * size)
    }

    const resized = img.resize({ width: newW, height: newH, quality: THUMB_QUALITY })
    const webpBuffer = resized.toJPEG(75) // nativeImage 不支持 webp 导出，用 JPEG 替代

    fs.writeFileSync(thumbPath, webpBuffer)
    pruneThumbnailCache()
    return { success: true, thumbPath }
  } catch (err) {
    console.error('[ThumbnailService] Error:', err)
    return { success: false, error: err.message }
  }
}

export function getCachedVideoThumbnail(source) {
  try {
    if (!source) {
      return { success: false, error: 'missing source' }
    }

    const thumbPath = getVideoThumbPath(source)
    if (!fs.existsSync(thumbPath)) {
      return { success: false, error: 'cache miss' }
    }
    let metadata = {}
    try {
      const metadataPath = `${thumbPath}.json`
      if (fs.existsSync(metadataPath)) {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
      }
    } catch {
      metadata = {}
    }
    return { success: true, thumbPath, ...metadata }
  } catch (err) {
    console.error('[ThumbnailService] Video cache read error:', err)
    return { success: false, error: err.message }
  }
}

export function saveVideoThumbnail(source, content, metadata = {}) {
  try {
    if (!source || !content) {
      return { success: false, error: 'missing source or content' }
    }

    let buffer = null
    if (Buffer.isBuffer(content)) {
      buffer = content
    } else if (content instanceof ArrayBuffer) {
      buffer = Buffer.from(content)
    } else if (ArrayBuffer.isView(content)) {
      buffer = Buffer.from(content.buffer, content.byteOffset, content.byteLength)
    } else if (typeof content === 'string') {
      const base64 = content.includes(',') ? content.split(',').pop() : content
      buffer = Buffer.from(base64, 'base64')
    }

    if (!buffer || buffer.length === 0) {
      return { success: false, error: 'invalid thumbnail content' }
    }

    const thumbPath = getVideoThumbPath(source)
    fs.writeFileSync(thumbPath, buffer)
    fs.writeFileSync(
      `${thumbPath}.json`,
      JSON.stringify({
        width: Number(metadata.width) || 0,
        height: Number(metadata.height) || 0,
        updatedAt: Date.now()
      })
    )
    pruneThumbnailCache()
    return { success: true, thumbPath }
  } catch (err) {
    console.error('[ThumbnailService] Video cache write error:', err)
    return { success: false, error: err.message }
  }
}
