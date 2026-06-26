import { reconcileGenerationNodeStatus } from '../../utils/generationStatus.ts'

const _historySaveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const MAX_PERSISTENT_STRING_LENGTH = 8000
const MAX_PERSISTENT_ARRAY_ITEMS = 20

function buildNodesMap(nodes) {
  const map = new Map()
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (node?.id) map.set(node.id, node)
  }
  return map
}

export function sanitizePersistentUrl(value) {
  if (typeof value !== 'string') return value
  if (value.startsWith('blob:')) return ''
  if (value.startsWith('data:')) {
    const separatorIndex = value.indexOf(';')
    const mime = separatorIndex > 5 ? value.slice(5, separatorIndex) : 'unknown'
    return `[DATA_URL ${mime} length=${value.length}]`
  }
  if (value.length > MAX_PERSISTENT_STRING_LENGTH) {
    return `${value.substring(0, 400)}...[truncated length=${value.length}]`
  }
  return value
}

export function sanitizePersistentValue(value, key = '') {
  const lowerKey = String(key || '').toLowerCase()
  if (lowerKey.includes('apikey') || lowerKey === 'api_key' || lowerKey === 'authorization') {
    return value ? '[REDACTED]' : value
  }
  if (typeof value === 'string') return sanitizePersistentUrl(value)
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_PERSISTENT_ARRAY_ITEMS)
      .map((item) => sanitizePersistentValue(item, key))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        sanitizePersistentValue(childValue, childKey)
      ])
    )
  }
  return value
}

function hasPersistentLocalMediaUrl(value) {
  if (typeof value !== 'string') return false
  const text = value.trim()
  return (
    text.startsWith('xinghe://local') ||
    text.startsWith('file://') ||
    /^[a-zA-Z]:[/\\]/.test(text) ||
    text.startsWith('\\\\')
  )
}

export function normalizeHistoryForPlayback(history) {
  return (history || []).map((item) => {
    if (!item || typeof item !== 'object') return item
    const localCacheUrl =
      typeof item.localCacheUrl === 'string' && item.localCacheUrl.trim()
        ? item.localCacheUrl.trim()
        : ''
    if (!hasPersistentLocalMediaUrl(localCacheUrl)) return item

    const currentUrl = typeof item.url === 'string' ? item.url.trim() : ''
    if (currentUrl === localCacheUrl) return item

    return {
      ...item,
      url: localCacheUrl,
      originalUrl: item.originalUrl || currentUrl || item.resultUrl || undefined
    }
  })
}

export function sanitizeHistoryForSave(history) {
  return normalizeHistoryForPlayback(history).map((item) => {
    const saved = { ...item }
    if (item.mjImages && item.mjImages.length === 4) {
      saved.mjImages = null
      saved.mjNeedsSplit = true
      saved.mjOriginalUrl = item.mjOriginalUrl || item.url
    }
    const sanitizedUrl = sanitizePersistentUrl(item.url)
    const sanitizedLocalCacheUrl = sanitizePersistentUrl(item.localCacheUrl)
    saved.url = hasPersistentLocalMediaUrl(sanitizedLocalCacheUrl)
      ? sanitizedLocalCacheUrl
      : sanitizedUrl
    saved.originalUrl = sanitizePersistentUrl(item.originalUrl)
    saved.thumbnailUrl = sanitizePersistentUrl(item.thumbnailUrl)
    saved.localCacheUrl = sanitizedLocalCacheUrl
    saved.mjOriginalUrl = sanitizePersistentUrl(item.mjOriginalUrl)
    saved.resultUrl = sanitizePersistentUrl(item.resultUrl)
    saved.downloadUrl = sanitizePersistentUrl(item.downloadUrl)
    saved.src = sanitizePersistentUrl(item.src)
    saved.apiConfig = sanitizePersistentValue(item.apiConfig || {})
    saved.originalPayload = sanitizePersistentValue(item.originalPayload || {})
    saved.sourceMeta = sanitizePersistentValue(item.sourceMeta || null)
    saved.cacheError = sanitizePersistentValue(item.cacheError || null)
    saved.rawErrorMsg = sanitizePersistentValue(item.rawErrorMsg || null)
    saved.errorMsg = sanitizePersistentValue(item.errorMsg || null)
    delete saved.mjImageInfo
    delete saved.blob
    delete saved.file
    delete saved.previewBlob
    return saved
  })
}

function getProjectHistoryKey(projectId?: string) {
  return projectId ? `tapnow_history_v2_${projectId}` : 'tapnow_history_v2'
}

function scheduleHistorySave(projectId: string | undefined, history) {
  const projectHistoryKey = getProjectHistoryKey(projectId)
  const existingTimer = _historySaveTimers.get(projectHistoryKey)
  if (existingTimer) clearTimeout(existingTimer)

  const timer = setTimeout(() => {
    _historySaveTimers.delete(projectHistoryKey)
    try {
      const sanitized = sanitizeHistoryForSave(history || [])
      const json = JSON.stringify(sanitized)
      if (window.dbAPI?.settings) {
        window.dbAPI.settings.set(projectHistoryKey, json).catch((err) => {
          console.error(`[History] write SQLite failed (${projectHistoryKey}):`, err)
        })
      }
    } catch (err) {
      console.error('[History] serialize history failed:', err)
    }
  }, 1000)

  _historySaveTimers.set(projectHistoryKey, timer)
}

export const createHistorySlice = (set, get) => ({
  history: [],
  setHistory: (historyOrFn) => {
    let nextHistory = []
    if (typeof historyOrFn === 'function') {
      set((state) => {
        const history = normalizeHistoryForPlayback(historyOrFn(state.history))
        nextHistory = history
        const nodes = reconcileGenerationNodeStatus(state.nodes || [], history)
        if (nodes === state.nodes) return { history }
        return { history, nodes, nodesMap: buildNodesMap(nodes) }
      })
    } else {
      set((state) => {
        const history = normalizeHistoryForPlayback(historyOrFn)
        nextHistory = history
        const nodes = reconcileGenerationNodeStatus(state.nodes || [], history)
        if (nodes === state.nodes) return { history }
        return { history, nodes, nodesMap: buildNodesMap(nodes) }
      })
    }

    scheduleHistorySave(get().currentProject?.id, nextHistory)
  },

  savedFolderHistory: [],
  setSavedFolderHistory: (history) => set({ savedFolderHistory: history }),
  addFolderToHistory: (folder) => {
    if (!folder || folder.trim() === '') return
    const prev = get().savedFolderHistory
    const filtered = prev.filter((f) => f !== folder)
    set({ savedFolderHistory: [folder, ...filtered].slice(0, 10) })
  }
})
