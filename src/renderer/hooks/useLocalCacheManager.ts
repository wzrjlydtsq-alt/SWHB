import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '../store/useAppStore.ts'
import {
  saveThumbnailToLocal,
  saveImageToLocalCache,
  saveVideoToLocalCache,
  checkLocalCache,
  getFilenameFromUrl
} from '../services/localCacheService.ts'
import { withProjectCacheContext } from '../utils/projectCache.ts'

const isDocumentHidden = () => typeof document !== 'undefined' && document.hidden
const shouldAutoCacheOriginalHistoryMedia = () => false
const MAX_CACHE_ATTEMPT_IDS = 1000

const rememberAttemptId = (setRef, id) => {
  const key = String(id || '')
  if (!key) return
  setRef.current.add(key)
  while (setRef.current.size > MAX_CACHE_ATTEMPT_IDS) {
    const first = setRef.current.values().next().value
    if (!first) break
    setRef.current.delete(first)
  }
}

const getPathFromLocalCacheUrl = (url) => {
  if (!url || typeof url !== 'string') return ''
  try {
    if (!url.startsWith('xinghe://local')) return ''
    return new URL(url).searchParams.get('path') || ''
  } catch {
    return ''
  }
}

export function useLocalCacheManager(historyPerformanceMode) {
  const setHistory = useAppStore((state) => state.setHistory)

  const [localCacheServerConnected, setLocalCacheServerConnected] = useState(false)
  const localCacheServerUrl = 'ipc-internal' // No longer HTTP based
  const [localServerConfig, setLocalServerConfig] = useState({
    imageSavePath: '',
    videoSavePath: '',
    convertPngToJpg: true,
    jpgQuality: 95
  })

  const triedCacheIdsRef = useRef(new Set())
  const triedThumbIdsRef = useRef(new Set())
  const thumbnailJobRunningRef = useRef(false)
  const imageCacheJobRunningRef = useRef(false)
  const videoCacheJobRunningRef = useRef(false)
  const historyBatchLimit =
    historyPerformanceMode === 'ultra' ? 1 : historyPerformanceMode === 'normal' ? 2 : 3

  const applyHistoryPatches = useCallback(
    (patches) => {
      if (!patches || patches.size === 0) return
      setHistory((prev) => {
        let changed = false
        const next = prev.map((item) => {
          const patch = patches.get(item.id)
          if (!patch) return item
          const entries = Object.entries(patch)
          if (entries.every(([key, value]) => item?.[key] === value)) return item
          changed = true
          return { ...item, ...patch }
        })
        return changed ? next : prev
      })
    },
    [setHistory]
  )

  const takePendingHistoryItems = useCallback(
    (matcher, limit = historyBatchLimit) => {
      const history = useAppStore.getState().history || []
      const pending = []
      for (const item of history) {
        if (!matcher(item)) continue
        pending.push(item)
        if (pending.length >= limit) break
      }
      return pending
    },
    [historyBatchLimit]
  )

  useEffect(() => {
    let interval
    const checkLocalCacheServer = async () => {
      try {
        // 检查 window.api 和 localCacheAPI 是否存在
        if (!window.api || !window.api.localCacheAPI) {
          console.warn('Local cache API not available yet')
          setLocalCacheServerConnected(false)
          return
        }

        const data: any = await window.api.localCacheAPI.ping(withProjectCacheContext())
        if (data) {
          setLocalCacheServerConnected(true)
          setLocalServerConfig((prev) => ({
            ...prev,
            imageSavePath: data.image_save_path || '',
            videoSavePath: data.video_save_path || '',
            convertPngToJpg: data.convert_png_to_jpg !== false,
            pilAvailable: data.pil_available || false
          }))
        } else {
          setLocalCacheServerConnected(false)
        }
      } catch (err) {
        console.error('Local cache check ping fail:', err)
        setLocalCacheServerConnected(false)
      }
    }
    checkLocalCacheServer()
    interval = setInterval(checkLocalCacheServer, 30000)
    return () => clearInterval(interval)
  }, [])

  const updateLocalServerConfig = useCallback(
    async (newConfig) => {
      if (!localCacheServerConnected) return false
      try {
        const data: any = await window.api.localCacheAPI.config(withProjectCacheContext(newConfig))
        if (data && data.success) {
          setLocalServerConfig((prev) => ({
            ...prev,
            imageSavePath: data.config.image_save_path || '',
            videoSavePath: data.config.video_save_path || '',
            convertPngToJpg: data.config.convert_png_to_jpg !== false,
            jpgQuality: data.config.jpg_quality || 95
          }))
          return true
        }
      } catch (err) {
        console.error(err)
      }
      return false
    },
    [localCacheServerConnected]
  )

  const generateThumbnail = useCallback(async (imageUrl, quality = 'normal') => {
    const config =
      quality === 'ultra' ? { maxSize: 80, jpegQuality: 0.3 } : { maxSize: 150, jpegQuality: 0.6 }
    return new Promise((resolve) => {
      try {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let w = img.naturalWidth
          let h = img.naturalHeight
          if (w > h) {
            if (w > config.maxSize) {
              h = (h * config.maxSize) / w
              w = config.maxSize
            }
          } else {
            if (h > config.maxSize) {
              w = (w * config.maxSize) / h
              h = config.maxSize
            }
          }
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, w, h)
          resolve(canvas.toDataURL('image/jpeg', config.jpegQuality))
        }
        img.onerror = () => resolve(null)
        img.src = imageUrl
      } catch (err) {
        console.error('generateThumbnail fail:', err)
        resolve(null)
      }
    })
  }, [])

  const handleSaveThumbnail = useCallback(
    (itemId, thumbnailDataUrl, category) => {
      return saveThumbnailToLocal(
        localCacheServerConnected,
        localCacheServerUrl,
        itemId,
        thumbnailDataUrl,
        category
      )
    },
    [localCacheServerConnected]
  )

  const handleSaveImageToLocalCache = useCallback(
    (itemId, imageUrl, category) => {
      return saveImageToLocalCache(
        localCacheServerConnected,
        localCacheServerUrl,
        itemId,
        imageUrl,
        category
      )
    },
    [localCacheServerConnected]
  )

  const handleSaveVideoToLocalCache = useCallback(
    (itemId, videoUrl, category) => {
      return saveVideoToLocalCache(
        localCacheServerConnected,
        localCacheServerUrl,
        itemId,
        videoUrl,
        category
      )
    },
    [localCacheServerConnected]
  )

  const handleCheckLocalCache = useCallback(
    (itemId, category) => {
      return checkLocalCache(localCacheServerConnected, localCacheServerUrl, itemId, category)
    },
    [localCacheServerConnected]
  )

  useEffect(() => {
    const generateThumbnailsForHistory = async () => {
      if (isDocumentHidden()) return
      if (thumbnailJobRunningRef.current) return
      thumbnailJobRunningRef.current = true
      try {
      const candidates = takePendingHistoryItems(
        (item) =>
          item.status === 'completed' &&
          item.type === 'image' &&
          !item.thumbnailUrl &&
          !!(item.url || item.originalUrl) &&
          !triedThumbIdsRef.current.has(item.id)
      )
      if (candidates.length === 0) return

      const patches = new Map()
      for (const item of candidates) {
        rememberAttemptId(triedThumbIdsRef, item.id)
        try {
          const thumbUrl = await generateThumbnail(
            item.url || item.originalUrl,
            historyPerformanceMode
          )
          if (thumbUrl) {
            if (localCacheServerConnected) {
              const cachedThumb = await saveThumbnailToLocal(
                localCacheServerConnected,
                localCacheServerUrl,
                item.id,
                thumbUrl,
                'history_thumb'
              )
              if (cachedThumb) {
                patches.set(item.id, { thumbnailUrl: cachedThumb })
                continue
              }
            }
            patches.set(item.id, { thumbnailUrl: thumbUrl })
          }
        } catch (err) {
          console.warn('[缓存] 生成缩略图失败:', item.id, err)
        }
      }
      applyHistoryPatches(patches)
      } finally {
        thumbnailJobRunningRef.current = false
      }
    }
    const intervalMs = historyPerformanceMode === 'ultra' ? 16000 : 8000
    const timer = setTimeout(generateThumbnailsForHistory, 1000)
    const interval = setInterval(generateThumbnailsForHistory, intervalMs)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [
    historyPerformanceMode,
    localCacheServerConnected,
    localCacheServerUrl,
    applyHistoryPatches,
    generateThumbnail,
    takePendingHistoryItems
  ])

  useEffect(() => {
    // Keep remote-expiring history media durable by downloading originals in small batches.
    if (!shouldAutoCacheOriginalHistoryMedia('image')) return
    if (!localCacheServerConnected) return
    const cacheHistoryImages = async () => {
      if (isDocumentHidden()) return
      if (imageCacheJobRunningRef.current) return
      imageCacheJobRunningRef.current = true
      try {
      const candidates = takePendingHistoryItems((item) => {
        if (item.status !== 'completed' || item.type !== 'image' || item.localCacheUrl) return false
        if (triedCacheIdsRef.current.has(item.id)) return false
        return true
      })
      if (candidates.length === 0) return

      const patches = new Map()
      for (const item of candidates) {
        rememberAttemptId(triedCacheIdsRef, item.id)

        const imageUrl = item.url || item.originalUrl || item.mjOriginalUrl
        const filenameFromUrl = imageUrl ? getFilenameFromUrl(imageUrl) : null
        let foundLocal = false
        const filenamesToCheck = [filenameFromUrl, item.id].filter(Boolean)
        for (const filename of filenamesToCheck) {
          if (foundLocal) break
          for (const ext of ['.jpg', '.png']) {
            try {
              // 适配过去保存的旧结构: "images/history_id.jpg" 即 backend 规范
              const checkRes = await window.api.localCacheAPI.checkCache(withProjectCacheContext({
                basePath: `images/history_${filename}${ext}`
              }))
              if (checkRes && checkRes.exists) {
                patches.set(item.id, {
                  localCacheUrl: checkRes.url,
                  localFilePath: `images/history_${filename}${ext}`
                })
                foundLocal = true
                break
              }
            } catch (err) {
              console.error(err)
            }
          }
        }
        if (foundLocal) continue
        if (!imageUrl || imageUrl.startsWith('blob:') || imageUrl.includes('...')) continue

        try {
          const result = await saveImageToLocalCache(
            localCacheServerConnected,
            localCacheServerUrl,
            item.id,
            imageUrl,
            'history'
          )
          if (result) patches.set(item.id, { localCacheUrl: result.url, localFilePath: result.path })
        } catch (err) {
          console.warn('[缓存] 历史缓存图片失败:', item.id, err)
        }
      }
      applyHistoryPatches(patches)
      } finally {
        imageCacheJobRunningRef.current = false
      }
    }
    const intervalMs = historyPerformanceMode === 'ultra' ? 24000 : 12000
    const timer = setTimeout(cacheHistoryImages, 5000)
    const interval = setInterval(cacheHistoryImages, intervalMs)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [
    historyPerformanceMode,
    localCacheServerConnected,
    localCacheServerUrl,
    applyHistoryPatches,
    takePendingHistoryItems
  ])

  useEffect(() => {
    // Keep remote-expiring history media durable by downloading originals in small batches.
    if (!shouldAutoCacheOriginalHistoryMedia('video')) return
    if (!localCacheServerConnected) return
    const cacheHistoryVideos = async () => {
      if (isDocumentHidden()) return
      if (videoCacheJobRunningRef.current) return
      videoCacheJobRunningRef.current = true
      try {
        const candidates = takePendingHistoryItems((item) => {
          if (item.status !== 'completed' || item.type !== 'video') return false
          if (triedCacheIdsRef.current.has(item.id)) return false
          return true
        })
        if (candidates.length === 0) return

        const patches = new Map()
        for (const item of candidates) {
          rememberAttemptId(triedCacheIdsRef, item.id)

        const videoUrl = item.url || item.originalUrl
        if (videoUrl && (videoUrl.includes('localhost:') || videoUrl.includes('127.0.0.1:')))
          continue

          const existingLocalPaths = [
            item.localFilePath,
            getPathFromLocalCacheUrl(item.localCacheUrl)
          ].filter(Boolean)
          const hadLocalVideo = Boolean(item.localCacheUrl || item.localFilePath)
          let foundLocalVideo = false
          for (const basePath of existingLocalPaths) {
            if (foundLocalVideo) break
            try {
              const checkRes = await window.api.localCacheAPI.checkCache(withProjectCacheContext({
                basePath
              }))
              if (checkRes && checkRes.exists) {
                patches.set(item.id, {
                  localCacheUrl: checkRes.url,
                  localFilePath: checkRes.path || basePath
                })
                foundLocalVideo = true
              }
            } catch (err) {
              console.error(err)
            }
          }

        const filenameFromUrl = videoUrl ? getFilenameFromUrl(videoUrl) : null
        const filenamesToCheck = [filenameFromUrl, item.id].filter(Boolean)
        for (const filename of filenamesToCheck) {
          if (foundLocalVideo) break
          try {
            const checkRes = await window.api.localCacheAPI.checkCache(withProjectCacheContext({
              basePath: `videos/history_${filename}.mp4`
            }))
            if (checkRes && checkRes.exists) {
              patches.set(item.id, {
                localCacheUrl: checkRes.url,
                localFilePath: `videos/history_${filename}.mp4`
              })
              foundLocalVideo = true
            }
          } catch (err) {
            console.error(err)
          }
        }
        if (foundLocalVideo) continue
        if (hadLocalVideo) patches.set(item.id, { localCacheUrl: null, localFilePath: null })
        if (!videoUrl || videoUrl.startsWith('blob:') || videoUrl.includes('...')) continue
        // 跳过已是本地路径的 URL（绝对路径、file://、xinghe://）
        if (
          videoUrl.startsWith('xinghe://') ||
          videoUrl.startsWith('file://') ||
          /^[a-zA-Z]:[/\\]/.test(videoUrl)
        )
          continue

        try {
          const result = await saveVideoToLocalCache(
            localCacheServerConnected,
            localCacheServerUrl,
            item.id,
            videoUrl,
            'history'
          )
          if (result) patches.set(item.id, { localCacheUrl: result.url, localFilePath: result.path })
        } catch (err) {
          console.warn('[缓存] 视频缓存失败:', item.id, err)
        }
      }
      applyHistoryPatches(patches)
      } finally {
        videoCacheJobRunningRef.current = false
      }
    }
    const intervalMs = historyPerformanceMode === 'ultra' ? 30000 : 15000
    const timer = setTimeout(cacheHistoryVideos, 8000)
    const interval = setInterval(cacheHistoryVideos, intervalMs)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [
    historyPerformanceMode,
    localCacheServerConnected,
    localCacheServerUrl,
    applyHistoryPatches,
    takePendingHistoryItems
  ])

  const convertToJpg = useCallback(async (imgUrl) => {
    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL('image/jpeg', 0.95))
      }
      img.onerror = () => resolve(imgUrl)
      img.src = imgUrl
    })
  }, [])

  return {
    localCacheServerConnected,
    localCacheServerUrl,
    localServerConfig,
    setLocalServerConfig,
    updateLocalServerConfig,
    handleSaveThumbnail,
    handleSaveImageToLocalCache,
    handleSaveVideoToLocalCache,
    handleCheckLocalCache,
    generateThumbnail,
    convertToJpg
  }
}
