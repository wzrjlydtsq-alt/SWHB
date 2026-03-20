import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '../store/useAppStore.js'
import {
  saveThumbnailToLocal,
  saveImageToLocalCache,
  saveVideoToLocalCache,
  checkLocalCache,
  getFilenameFromUrl
} from '../services/localCacheService.js'

export function useLocalCacheManager(historyPerformanceMode) {
  const history = useAppStore((state) => state.history)
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

        const data = await window.api.localCacheAPI.ping()
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
        const data = await window.api.localCacheAPI.config(newConfig)
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
    if (!history || history.length === 0) return
    const generateThumbnailsForHistory = async () => {
      for (const item of history) {
        if (item.status !== 'completed' || item.type !== 'image' || item.thumbnailUrl) continue
        if (!item.url && !item.originalUrl) continue
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
                setHistory((prev) =>
                  prev.map((h) => (h.id === item.id ? { ...h, thumbnailUrl: cachedThumb } : h))
                )
                continue
              }
            }
            setHistory((prev) =>
              prev.map((h) => (h.id === item.id ? { ...h, thumbnailUrl: thumbUrl } : h))
            )
          }
        } catch (err) {
          console.warn('[缓存] 生成缩略图失败:', item.id, err)
        }
      }
    }
    const timer = setTimeout(generateThumbnailsForHistory, 100)
    return () => clearTimeout(timer)
  }, [
    historyPerformanceMode,
    history.length,
    localCacheServerConnected,
    generateThumbnail,
    setHistory
  ])

  useEffect(() => {
    if (!localCacheServerConnected || !history || history.length === 0) return
    const cacheHistoryImages = async () => {
      for (const item of history) {
        if (item.status !== 'completed' || item.type !== 'image' || item.localCacheUrl) continue
        if (triedCacheIdsRef.current.has(item.id)) continue
        triedCacheIdsRef.current.add(item.id)

        const imageUrl = item.url || item.originalUrl || item.mjOriginalUrl
        const filenameFromUrl = imageUrl ? getFilenameFromUrl(imageUrl) : null
        let foundLocal = false
        const filenamesToCheck = [filenameFromUrl, item.id].filter(Boolean)
        for (const filename of filenamesToCheck) {
          if (foundLocal) break
          for (const ext of ['.jpg', '.png']) {
            try {
              // 适配过去保存的旧结构: "images/history_id.jpg" 即 backend 规范
              const checkRes = await window.api.localCacheAPI.checkCache({
                basePath: `images/history_${filename}${ext}`
              })
              if (checkRes && checkRes.exists) {
                setHistory((prev) =>
                  prev.map((h) =>
                    h.id === item.id
                      ? {
                          ...h,
                          localCacheUrl: checkRes.url,
                          localFilePath: `images/history_${filename}${ext}`
                        }
                      : h
                  )
                )
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
          if (result) {
            setHistory((prev) =>
              prev.map((h) =>
                h.id === item.id
                  ? { ...h, localCacheUrl: result.url, localFilePath: result.path }
                  : h
              )
            )
          }
        } catch (err) {
          console.warn('[缓存] 历史缓存图片失败:', item.id, err)
        }
      }
    }
    const timer = setTimeout(cacheHistoryImages, 3000)
    return () => clearTimeout(timer)
  }, [history.length, localCacheServerConnected, setHistory])

  useEffect(() => {
    if (!localCacheServerConnected || !history || history.length === 0) return
    const cacheHistoryVideos = async () => {
      for (const item of history) {
        if (item.status !== 'completed' || item.type !== 'video' || item.localCacheUrl) continue
        if (triedCacheIdsRef.current.has(item.id)) continue
        triedCacheIdsRef.current.add(item.id)

        const videoUrl = item.url || item.originalUrl
        if (videoUrl && (videoUrl.includes('localhost:') || videoUrl.includes('127.0.0.1:')))
          continue

        const filenameFromUrl = videoUrl ? getFilenameFromUrl(videoUrl) : null
        const filenamesToCheck = [filenameFromUrl, item.id].filter(Boolean)
        let foundLocalVideo = false
        for (const filename of filenamesToCheck) {
          if (foundLocalVideo) break
          try {
            const checkRes = await window.api.localCacheAPI.checkCache({
              basePath: `videos/history_${filename}.mp4`
            })
            if (checkRes && checkRes.exists) {
              setHistory((prev) =>
                prev.map((h) =>
                  h.id === item.id
                    ? {
                        ...h,
                        localCacheUrl: checkRes.url,
                        localFilePath: `videos/history_${filename}.mp4`
                      }
                    : h
                )
              )
              foundLocalVideo = true
            }
          } catch (err) {
            console.error(err)
          }
        }
        if (foundLocalVideo) continue
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
          if (result) {
            setHistory((prev) =>
              prev.map((h) =>
                h.id === item.id
                  ? { ...h, localCacheUrl: result.url, localFilePath: result.path }
                  : h
              )
            )
          }
        } catch (err) {
          console.warn('[缓存] 视频缓存失败:', item.id, err)
        }
      }
    }
    const timer = setTimeout(cacheHistoryVideos, 5000)
    return () => clearTimeout(timer)
  }, [history.length, localCacheServerConnected, setHistory])

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
