import { getBase64FromUrl, getBlobFromUrl } from './dataHelpers.js'
import { useAppStore } from '../store/useAppStore.js'

// --- Helper: Convert Absolute Path to Custom Protocol ---
export const getXingheMediaSrc = (absolutePath) => {
  if (!absolutePath) return ''
  // 如果已经是网络图片、Base64或Blob则直接返回
  // 兼容拦截旧版本的 13307 本地服务器 URL
  if (absolutePath.startsWith('http://127.0.0.1:13307/')) {
    // 提取真实的物理路径。如果是 http://127.0.0.1:13307/videos/xxx，在旧版它的实际路径可能是 D:\KF... 但旧缓存丢失了真正的物理盘符
    // 由于我们不知道它在哪个盘符，这种极其老旧的缓存只能尽量恢复，或者直接忽略。
    // 但是这里只要确保它不走 http 逻辑即可，交给后文替换。
  } else if (
    absolutePath.startsWith('http') ||
    absolutePath.startsWith('data:') ||
    absolutePath.startsWith('blob:') ||
    absolutePath.startsWith('xinghe:')
  ) {
    return absolutePath
  }

  // 彻底清洗旧版 13307 或 gen_hist_ 缓存：提取纯文件名并和真实输出目录拼接
  let finalPath = absolutePath
  if (
    finalPath.startsWith('http://127.0.0.1:13307/') ||
    finalPath.startsWith('http://localhost') ||
    finalPath.includes('13307') ||
    (!finalPath.includes('/') && !finalPath.includes('\\') && finalPath.includes('gen_hist_'))
  ) {
    const segments = finalPath.split(/[/\\]/)
    const filename = segments[segments.length - 1].split('?')[0] // 剥离 query 参数

    // 获取 Zustand 中的真实物理保存目录
    const state = useAppStore.getState()
    const ext = filename.split('.').pop().toLowerCase()
    const isVideo = ['mp4', 'webm', 'mov', 'ogg'].includes(ext)

    const baseDir = isVideo ? state.videoSavePath : state.imageSavePath

    if (baseDir) {
      // 拼接成真正的绝对物理路径
      finalPath = `${baseDir}\\${filename}`
    } else {
      // 如果实在没有配置目录，使用默认降级（Electron 主进程如果找不到会自动 404）
      finalPath = filename
    }
  }

  // 将物理路径安全地包裹在 Query 参数里，彻底避开浏览器的自动格式化机制
  return `xinghe://local/?path=${encodeURIComponent(finalPath)}`
}

// --- Helper: Get Image Dimensions ---
export const getImageDimensions = (src) => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = getXingheMediaSrc(src)
  })
}

// --- Helper: Check if URL is video ---
export const isVideoUrl = (url) => {
  if (!url) return false
  if (url.startsWith('data:video')) return true
  if (url.includes('force_video_display=true')) return true
  const ext = url.split('.').pop().split('?')[0].toLowerCase()
  return ['mp4', 'webm', 'ogg', 'mov'].includes(ext)
}

// --- Helper: Load Video Metadata ---
export const getVideoMetadata = (src) => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.onloadedmetadata = () => {
      resolve({
        duration: Number(video.duration) || 0,
        w: video.videoWidth || 0,
        h: video.videoHeight || 0
      })
    }
    video.onerror = () => reject(new Error('视频加载失败'))
    video.src = src
  })
}

// --- Helper: Extract Key Frames from video using <video> + <canvas> ---
export const extractKeyFrames = (src, { fps = 2 } = {}) => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    video.muted = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'
    video.src = src
    const frames = []

    const handleError = () => reject(new Error('视频抽帧失败'))
    video.onerror = handleError

    video.onloadedmetadata = () => {
      const duration = Number(video.duration) || 0
      if (!duration || !isFinite(duration)) {
        reject(new Error('无法读取视频时长'))
        return
      }
      canvas.width = video.videoWidth || 1280
      canvas.height = video.videoHeight || 720
      const interval = 1 / Math.max(0.1, fps)
      let current = 0

      const captureFrame = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        frames.push({
          time: Number(current.toFixed(2)),
          url: canvas.toDataURL('image/jpeg', 0.82)
        })
        current += interval
        if (current <= duration) {
          video.currentTime = Math.min(current, duration)
        } else {
          resolve(frames)
        }
      }

      video.onseeked = captureFrame
      // 启动首次抽帧
      video.currentTime = 0
    }
  })
}

// --- 性能优化工具函数 ---
export const debounce = (func, wait) => {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

export const normalizeImageBlobToSize = async (blob, targetW, targetH, mime = 'image/png') => {
  if (!(blob instanceof Blob) || !targetW || !targetH) return blob
  return new Promise((resolve) => {
    const img = new Image()
    const objUrl = URL.createObjectURL(blob)
    img.onload = () => {
      try {
        const srcW = img.naturalWidth || img.width || 1
        const srcH = img.naturalHeight || img.height || 1

        const canvas = document.createElement('canvas')
        canvas.width = targetW
        canvas.height = targetH
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          URL.revokeObjectURL(objUrl)
          resolve(blob)
          return
        }
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'

        // cover 裁剪：保持主体充满目标画布，居中裁剪
        const scale = Math.max(targetW / srcW, targetH / srcH)
        const drawW = srcW * scale
        const drawH = srcH * scale
        const dx = (targetW - drawW) / 2
        const dy = (targetH - drawH) / 2
        ctx.clearRect(0, 0, targetW, targetH)
        ctx.drawImage(img, dx, dy, drawW, drawH)

        canvas.toBlob(
          (out) => {
            URL.revokeObjectURL(objUrl)
            resolve(out || blob)
          },
          mime,
          0.92
        )
      } catch {
        URL.revokeObjectURL(objUrl)
        resolve(blob)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(objUrl)
      resolve(blob)
    }
    img.src = objUrl
  })
}

// 缩放图片到合理尺寸（用于Veo接口，避免图片过大）
export const resizeImageForVeo = async (imageUrl, maxWidth = 1920, maxHeight = 1920) => {
  // Ensure dataHelpers dependencies are loaded

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      const originalWidth = img.width
      const originalHeight = img.height

      // 如果图片尺寸已经小于等于目标尺寸，直接返回原图
      if (originalWidth <= maxWidth && originalHeight <= maxHeight) {
        console.log(`Veo: 图片尺寸 ${originalWidth}x${originalHeight} 无需缩放`)
        if (imageUrl.startsWith('data:')) {
          resolve(imageUrl)
        } else {
          // 如果是URL，转换为data URL
          getBase64FromUrl(imageUrl)
            .then((base64) => {
              resolve(`data:image/png;base64,${base64}`)
            })
            .catch(reject)
        }
        return
      }

      // 计算缩放后的尺寸，保持宽高比
      let newWidth = originalWidth
      let newHeight = originalHeight

      if (originalWidth > maxWidth || originalHeight > maxHeight) {
        const scale = Math.min(maxWidth / originalWidth, maxHeight / originalHeight)
        newWidth = Math.round(originalWidth * scale)
        newHeight = Math.round(originalHeight * scale)

        // 确保尺寸是偶数（某些编码器要求）
        newWidth = newWidth % 2 === 0 ? newWidth : newWidth - 1
        newHeight = newHeight % 2 === 0 ? newHeight : newHeight - 1
      }

      console.log(`Veo: 缩放图片 ${originalWidth}x${originalHeight} -> ${newWidth}x${newHeight}`)

      // 使用canvas缩放图片
      const canvas = document.createElement('canvas')
      canvas.width = newWidth
      canvas.height = newHeight
      const ctx = canvas.getContext('2d')

      // 使用高质量缩放
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, newWidth, newHeight)

      // 转换为data URL
      const dataUrl = canvas.toDataURL('image/png', 0.95)
      resolve(dataUrl)
    }

    img.onerror = (e) => {
      console.error('Veo: 图片加载失败', e)
      reject(new Error('图片加载失败'))
    }

    // 设置图片源
    if (imageUrl.startsWith('data:')) {
      img.src = imageUrl
    } else if (imageUrl.startsWith('blob:')) {
      img.src = imageUrl
    } else {
      // 对于其他URL，先转换为blob再加载（避免CORS问题）
      getBlobFromUrl(imageUrl)
        .then((blob) => {
          const blobUrl = URL.createObjectURL(blob)
          img.src = blobUrl
        })
        .catch(reject)
    }
  })
}
