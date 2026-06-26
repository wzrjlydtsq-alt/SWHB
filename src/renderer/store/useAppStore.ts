import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppState } from '../../types/store'
import { createUiSlice } from './slices/createUiSlice'
import { createProjectSlice } from './slices/createProjectSlice'
import { createHistorySlice } from './slices/createHistorySlice'
import { createLibrarySlice } from './slices/createLibrarySlice'
import { createCanvasSlice } from './slices/createCanvasSlice'
import { createDagEngineSlice } from './slices/createDagEngineSlice'
import { DEFAULT_GROUP_API_URLS, normalizeModelApiBaseUrl } from '../utils/constants'

// 完全自定义的节流持久化 Storage
// 将 partialize + JSON.stringify + localStorage.setItem 全部纳入节流范围
// 拖动期间完全不执行任何序列化/写入操作
const createFullyThrottledStorage = (throttleMs = 2000) => {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingState: unknown = null

  return {
    getItem: (name: string) => {
      const str = localStorage.getItem(name)
      if (!str) return null
      try {
        const parsed = JSON.parse(str)
        if (!parsed || typeof parsed !== 'object') return null
        if ('state' in parsed && (!parsed.state || typeof parsed.state !== 'object')) return null
        return parsed
      } catch {
        return null
      }
    },
    setItem: (name: string, value: unknown) => {
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
    removeItem: (name: string) => localStorage.removeItem(name)
  }
}

// partialize 缓存：只有持久化字段变化时才重新计算
let _cachedPartial: Partial<AppState> | null = null
let _lastPersistRefs: unknown[] | null = null

function memoizedPartialize(state: AppState) {
  const currentPersistRefs = [
    state.themeColor,
    state.projectName,
    state.uiScale,
    state.imageSavePath,
    state.videoSavePath,
    state.autoSaveInterval,
    state.showConnectionAnimations,
    state.silenceConfirmations,
    state.apiConfigs,
    state.groupApiKeys,
    state.groupApiUrls,
    state.characterLibrary,
    state.promptLibrary,
    state.isPerformanceMode,
    state.jimengUseLocalFile,
    state.historyPerformanceMode,
    state.savedFolderHistory,
    state.canvasBgColor,
    state.textBaseColor,
    state.textBrightness,
    state.componentBaseColor
  ]
  // 快速路径：如果所有持久化字段都没变，直接返回缓存
  if (
    _cachedPartial !== null &&
    _lastPersistRefs !== null &&
    currentPersistRefs.every((value, index) => Object.is(value, _lastPersistRefs[index]))
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
    groupApiKeys: state.groupApiKeys,
    groupApiUrls: state.groupApiUrls,
    characterLibrary: characterLibraryToSave,
    promptLibrary: state.promptLibrary,
    isPerformanceMode: state.isPerformanceMode,
    jimengUseLocalFile: state.jimengUseLocalFile,
    historyPerformanceMode: state.historyPerformanceMode,
    savedFolderHistory: state.savedFolderHistory,
    canvasBgColor: state.canvasBgColor,
    textBaseColor: state.textBaseColor,
    textBrightness: state.textBrightness,
    componentBaseColor: state.componentBaseColor
  }

  // 更新缓存引用
  _lastPersistRefs = currentPersistRefs

  return _cachedPartial
}
// 安全代理：防止 Zustand persist rehydrate 期间 selector 收到 null/undefined state 时崩溃
// 核心思路：让 persist 跳过自动 hydrate，store 先以初始值运行，
// 然后在渲染进程就绪后手动触发 rehydrate，避免 state 为 null 的窗口期
export const useAppStore = create<AppState>()(
  persist(
    (set: any, get: any, api: any) =>
      ({
        ...(createUiSlice as any)(set, get, api),
        ...(createProjectSlice as any)(set, get, api),
        ...(createHistorySlice as any)(set, get, api),
        ...(createLibrarySlice as any)(set, get, api),
        ...(createCanvasSlice as any)(set, get, api),
        ...(createDagEngineSlice as any)(set, get, api)
      }) as unknown as AppState,
    {
      name: 'tapnow-storage',
      storage: createFullyThrottledStorage(2000),
      partialize: memoizedPartialize,
      skipHydration: true, // 关键：跳过自动 hydrate，防止 state 为 null
      migrate: (persistedState) => {
        try {
          if (!persistedState || typeof persistedState !== 'object') return {}
          const persisted = persistedState as any
          // 旧数据迁移：分类 API Key/URL → 统一的 globalApiKey/globalApiUrl
          if (!persisted.globalApiKey) {
            const legacyKey =
              persisted.chatApiKey || persisted.imageApiKey || persisted.videoApiKey
            if (legacyKey) persisted.globalApiKey = legacyKey
          }
          if (!persisted.globalApiUrl) {
            const legacyUrl =
              persisted.chatApiUrl || persisted.imageApiUrl || persisted.videoApiUrl
            if (legacyUrl) persisted.globalApiUrl = legacyUrl
          }
          // 清除已废弃的分类字段
          delete persisted.chatApiKey
          delete persisted.chatApiUrl
          delete persisted.imageApiKey
          delete persisted.imageApiUrl
          delete persisted.videoApiKey
          delete persisted.videoApiUrl

          // apiConfigs 修复
          if (persisted.apiConfigs && !Array.isArray(persisted.apiConfigs)) {
            console.warn('[迁移] 检测到损坏的 apiConfigs 数据，将重置为默认配置')
            delete persisted.apiConfigs
          }
          persisted.groupApiUrls = {
            ...(persisted.groupApiUrls || {}),
            Chat: normalizeModelApiBaseUrl(persisted.groupApiUrls?.Chat, DEFAULT_GROUP_API_URLS.Chat),
            Image: normalizeModelApiBaseUrl(
              persisted.groupApiUrls?.Image,
              DEFAULT_GROUP_API_URLS.Image
            ),
            Video: normalizeModelApiBaseUrl(
              persisted.groupApiUrls?.Video,
              DEFAULT_GROUP_API_URLS.Video
            )
          }
          return persisted
        } catch (e) {
          console.error('[Store] migrate 数据迁移失败，丢弃持久化数据使用默认状态:', e)
          return {} // 返回空对象，让 Zustand 用初始 state 兜底
        }
      },
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState && typeof persistedState === 'object' ? persistedState : {})
      }),
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

// 手动触发 rehydrate — 在模块加载时立即执行，store 已用初始值创建完毕不会为 null
useAppStore.persist.rehydrate()
