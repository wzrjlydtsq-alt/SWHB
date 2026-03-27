// 防抖计时器：避免高频 setHistory 调用频繁写 SQLite
let _historySaveTimer = null

// 清理 history 条目中不可持久化的数据（blob URL, 大 base64）
function sanitizeHistoryForSave(history) {
  return (history || []).map((item) => {
    const saved = { ...item }
    // 清理 Midjourney 图片集（太大）
    if (item.mjImages && item.mjImages.length === 4) {
      saved.mjImages = null
      saved.mjNeedsSplit = true
      saved.mjOriginalUrl = item.mjOriginalUrl || item.url
    }
    // 截断大 base64 data URL
    if (item.url && item.url.startsWith('data:') && item.url.length > 5000) {
      saved.url = item.url.substring(0, 100) + '...'
    }
    // blob URL 不可持久化
    if (item.url && item.url.startsWith('blob:')) {
      saved.url = ''
    }
    delete saved.mjImageInfo
    return saved
  })
}

export const createHistorySlice = (set, get) => ({
  history: [],
  setHistory: (historyOrFn) => {
    if (typeof historyOrFn === 'function') {
      set((state) => ({ history: historyOrFn(state.history) }))
    } else {
      set({ history: historyOrFn })
    }

    // 防抖写入 SQLite（1 秒后执行，合并高频调用）
    clearTimeout(_historySaveTimer)
    _historySaveTimer = setTimeout(() => {
      try {
        const currentHistory = get().history
        const projectId = get().currentProject?.id
        const projectHistoryKey = projectId ? `tapnow_history_v2_${projectId}` : 'tapnow_history_v2'
        const sanitized = sanitizeHistoryForSave(currentHistory)
        const json = JSON.stringify(sanitized)
        if (window.dbAPI?.settings) {
          window.dbAPI.settings.set(projectHistoryKey, json).catch((err) => {
            console.error(`[History] 写入 SQLite 失败 (${projectHistoryKey}):`, err)
          })
        }
      } catch (err) {
        console.error('[History] 序列化 history 失败:', err)
      }
    }, 1000)
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
