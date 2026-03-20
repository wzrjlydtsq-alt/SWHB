import { app, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

const THUMB_SIZE = 160 // 短边 px
const THUMB_QUALITY = 'good' // nativeImage resize quality
let thumbCacheDir = null

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
    return { success: true, thumbPath }
  } catch (err) {
    console.error('[ThumbnailService] Error:', err)
    return { success: false, error: err.message }
  }
}
