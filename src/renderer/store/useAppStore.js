import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createUiSlice } from './slices/createUiSlice'
import { createProjectSlice } from './slices/createProjectSlice'
import { createHistorySlice } from './slices/createHistorySlice'
import { createLibrarySlice } from './slices/createLibrarySlice'
import { createCanvasSlice } from './slices/createCanvasSlice'
import { createDagEngineSlice } from './slices/createDagEngineSlice'

// 完全自定义的节流持久化 Storage
// 将 partialize + JSON.stringify + localStorage.setItem 全部纳入节流范围
// 拖动期间完全不执行任何序列化/写入操作
const createFullyThrottledStorage = (throttleMs = 2000) => {
  let timer = null
  let pendingState = null

  return {
    getItem: (name) => {
      const str = localStorage.getItem(name)
      if (!str) return null
      try {
        return JSON.parse(str)
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      pendingState = value
      if (!timer) {
        timer = setTimeout(() => {
          if (pendingState !== null) {
            try {
              localStorage.setItem(name, JSON.stringify(pendingState))
            } catch (e) {
              console.error('[persist] 写入 localStorage 失败:', e)
            }
            pendingState = null
          }
          timer = null
        }, throttleMs)
      }
    },
    removeItem: (name) => localStorage.removeItem(name)
  }
}

// partialize 缓存：只有持久化字段变化时才重新计算
let _cachedPartial = null
let _lastCharacterLibrary = null
let _lastApiConfigs = null
let _lastView = null
let _lastProjectName = null
let _lastPromptLibrary = null

function memoizedPartialize(state) {
  // 快速路径：如果所有持久化字段都没变，直接返回缓存
  if (
    _cachedPartial !== null &&
    state.characterLibrary === _lastCharacterLibrary &&
    state.apiConfigs === _lastApiConfigs &&
    state.view === _lastView &&
    state.projectName === _lastProjectName &&
    state.promptLibrary === _lastPromptLibrary
  ) {
    return _cachedPartial
  }

  // 注意: history 不再写入 localStorage，完全由 SQLite 管理

  const characterLibraryToSave = (state.characterLibrary || []).map((char) => {
    const saved = { ...char }
    if (char.imageUrl && char.imageUrl.startsWith('blob:')) {
      saved.imageUrl = ''
    }
    return saved
  })

  let apiConfigsToSave = state.apiConfigs
  if (!Array.isArray(apiConfigsToSave)) {
    apiConfigsToSave = []
  }

  _cachedPartial = {
    themeColor: state.themeColor,
    projectName: state.projectName,
    uiScale: state.uiScale,
    imageSavePath: state.imageSavePath,
    videoSavePath: state.videoSavePath,
    autoSaveInterval: state.autoSaveInterval,
    showConnectionAnimations: state.showConnectionAnimations,
    silenceConfirmations: state.silenceConfirmations,
    apiConfigs: apiConfigsToSave.filter((c) => c.id !== 'jimeng-4.5'),
    characterLibrary: characterLibraryToSave,
    promptLibrary: state.promptLibrary,
    isPerformanceMode: state.isPerformanceMode,
    jimengUseLocalFile: state.jimengUseLocalFile,
    historyPerformanceMode: state.historyPerformanceMode,
    savedFolderHistory: state.savedFolderHistory,
    view: state.view
  }

  // 更新缓存引用
  _lastCharacterLibrary = state.characterLibrary
  _lastApiConfigs = state.apiConfigs
  _lastView = state.view
  _lastProjectName = state.projectName
  _lastPromptLibrary = state.promptLibrary

  return _cachedPartial
}

export const useAppStore = create(
  persist(
    (...args) => ({
      ...createUiSlice(...args),
      ...createProjectSlice(...args),
      ...createHistorySlice(...args),
      ...createLibrarySlice(...args),
      ...createCanvasSlice(...args),
      ...createDagEngineSlice(...args)
    }),
    {
      name: 'tapnow-storage',
      storage: createFullyThrottledStorage(2000),
      partialize: memoizedPartialize,
      migrate: (persistedState) => {
        // 旧数据迁移：globalApiKey → 三组新 key
        if (persistedState.globalApiKey && !persistedState.chatApiKey) {
          persistedState.chatApiKey = persistedState.globalApiKey
          persistedState.imageApiKey = persistedState.globalApiKey
          persistedState.videoApiKey = persistedState.globalApiKey
        }
        if (persistedState.globalApiUrl && !persistedState.chatApiUrl) {
          persistedState.chatApiUrl = persistedState.globalApiUrl
          persistedState.imageApiUrl = persistedState.globalApiUrl
          persistedState.videoApiUrl = persistedState.globalApiUrl
        }
        // apiConfigs 修复
        if (persistedState.apiConfigs && !Array.isArray(persistedState.apiConfigs)) {
          console.warn('[迁移] 检测到损坏的 apiConfigs 数据，将重置为默认配置')
          delete persistedState.apiConfigs
        }
        return persistedState
      },
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.error('[Store] localStorage 数据恢复失败，使用默认状态:', error)
            try {
              localStorage.removeItem('tapnow-storage')
            } catch (e) {
              console.error('[Store] 清除损坏数据失败:', e)
            }
          }
        }
      }
    }
  )
)
