import { withProjectCacheContext } from '../utils/projectCache.ts'

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
    const data = await window.api.localCacheAPI.saveThumbnail(
      withProjectCacheContext({
        id: itemId,
        content: thumbnailDataUrl,
        category
      })
    )
    if (data && data.success) {
      return data.url
    }
  } catch (e) {
    console.warn('[cache] save thumbnail failed:', e)
  }
  return null
}

const isLocalPath = (url) => {
  if (!url) return false
  if (url.startsWith('xinghe://') || url.startsWith('file://')) return true
  if (/^[a-zA-Z]:[/\\]/.test(url)) return true
  return false
}

const readUrlAsDataUrl = async (url) => {
  if (url.startsWith('data:')) return url
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`)
  const blob = await res.blob()
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.readAsDataURL(blob)
  })
}

export const saveImageToLocalCache = async (
  localCacheServerConnected,
  localCacheServerUrl,
  itemId,
  imageUrl,
  category = 'characters'
) => {
  try {
    if (isLocalPath(imageUrl)) return { url: imageUrl, path: imageUrl }

    const filenameFromUrl = getFilenameFromUrl(imageUrl)
    const saveId = filenameFromUrl || itemId
    const content = await readUrlAsDataUrl(imageUrl)

    const data = await window.api.localCacheAPI.saveCache(
      withProjectCacheContext({
        id: saveId,
        content,
        category,
        ext: '.jpg',
        type: 'image'
      })
    )
    if (data && data.success) {
      console.log('[cache] image saved:', data.url, 'path:', data.path)
      return { url: data.url, path: data.path }
    }
  } catch (e) {
    console.warn('[cache] save image failed:', e)
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
    if (isLocalPath(videoUrl)) return { url: videoUrl, path: videoUrl }

    const filenameFromUrl = getFilenameFromUrl(videoUrl)
    const saveId = filenameFromUrl || itemId
    console.log('[cache] start saving video:', saveId, '(source id:', itemId, ')')

    const content = await readUrlAsDataUrl(videoUrl)
    const data = await window.api.localCacheAPI.saveCache(
      withProjectCacheContext({
        id: saveId,
        content,
        category,
        ext: '.mp4',
        type: 'video'
      })
    )
    if (data && data.success) {
      console.log('[cache] video saved:', data.url, 'path:', data.path)
      return { url: data.url, path: data.path }
    }
  } catch (e) {
    console.warn('[cache] save video failed:', e)
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
    const res = await window.api.localCacheAPI.checkCache(withProjectCacheContext({ basePath }))
    if (res && res.exists) {
      return res.url
    }
  } catch {
    // Ignored.
  }
  return null
}
