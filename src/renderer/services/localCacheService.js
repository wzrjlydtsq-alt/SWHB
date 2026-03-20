export const getFilenameFromUrl = (url) => {
  if (!url) return null
  try {
    const urlWithoutQuery = url.split('?')[0]
    const parts = urlWithoutQuery.split('/')
    const filename = parts[parts.length - 1]
    const nameWithoutExt = filename.replace(/\.[^.]+$/, '')
    return nameWithoutExt || null
  } catch {
    return null
  }
}

export const saveThumbnailToLocal = async (
  localCacheServerConnected,
  localCacheServerUrl,
  itemId,
  thumbnailDataUrl,
  category = 'history'
) => {
  if (!thumbnailDataUrl) return null
  try {
    const data = await window.api.localCacheAPI.saveThumbnail({
      id: itemId,
      content: thumbnailDataUrl,
      category
    })
    if (data && data.success) {
      return data.url
    }
  } catch (e) {
    console.warn('[缓存] 保存缩略图失败:', e)
  }
  return null
}

// 判断是否为本地路径（无需 fetch）
const isLocalPath = (url) => {
  if (!url) return false
  if (url.startsWith('xinghe://') || url.startsWith('file://')) return true
  // Windows 绝对路径: C:\ 或 D:/
  if (/^[a-zA-Z]:[/\\]/.test(url)) return true
  return false
}

export const saveImageToLocalCache = async (
  localCacheServerConnected,
  localCacheServerUrl,
  itemId,
  imageUrl,
  category = 'characters'
) => {
  try {
    // 已是本地文件，无需再缓存
    if (isLocalPath(imageUrl)) return { url: imageUrl, path: imageUrl }

    const filenameFromUrl = getFilenameFromUrl(imageUrl)
    const saveId = filenameFromUrl || itemId

    let content = imageUrl
    if (!imageUrl.startsWith('data:')) {
      const res = await fetch(imageUrl)
      if (!res.ok) throw new Error(`fetch 失败: ${res.status} ${res.statusText}`)
      const blob = await res.blob()
      content = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
    }

    const data = await window.api.localCacheAPI.saveCache({
      id: saveId,
      content,
      category,
      ext: '.jpg',
      type: 'image'
    })
    if (data && data.success) {
      console.log('[缓存] 图片已缓存到本地:', data.url, '路径:', data.path)
      return { url: data.url, path: data.path }
    }
  } catch (e) {
    console.warn('[缓存] 保存图片缓存失败:', e)
  }
  return null
}

export const saveVideoToLocalCache = async (
  localCacheServerConnected,
  localCacheServerUrl,
  itemId,
  videoUrl,
  category = 'history'
) => {
  try {
    // 已是本地文件，无需再缓存
    if (isLocalPath(videoUrl)) return { url: videoUrl, path: videoUrl }

    const filenameFromUrl = getFilenameFromUrl(videoUrl)
    const saveId = filenameFromUrl || itemId
    console.log('[缓存] 开始缓存视频:', saveId, '(原ID:', itemId, ')')

    const res = await fetch(videoUrl)
    if (!res.ok) throw new Error(`fetch 失败: ${res.status} ${res.statusText}`)
    const blob = await res.blob()
    const content = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })

    const data = await window.api.localCacheAPI.saveCache({
      id: saveId,
      content,
      category,
      ext: '.mp4',
      type: 'video'
    })
    if (data && data.success) {
      console.log('[缓存] 视频已缓存到本地:', data.url, '路径:', data.path)
      return { url: data.url, path: data.path }
    }
  } catch (e) {
    console.warn('[缓存] 保存视频缓存失败:', e)
  }
  return null
}

export const checkLocalCache = async (
  localCacheServerConnected,
  localCacheServerUrl,
  itemId,
  category = 'history'
) => {
  try {
    const basePath = `images/${category}_${itemId}.jpg`
    const res = await window.api.localCacheAPI.checkCache({ basePath })
    if (res && res.exists) {
      return res.url
    }
  } catch {
    // Ignored
  }
  return null
}
