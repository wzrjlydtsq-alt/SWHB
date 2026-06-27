/**
 * useAppInit — 应用初始化 Hook
 * 从 App.jsx 提取的初始化逻辑，包含：
 * 1. dbService 初始化
 * 2. API Key 从 SQLite 加载（含 localStorage → SQLite 迁移）
 * 3. 历史记录 URL 格式迁移（裸路径 → xinghe:// 协议）
 * 4. 主题色初始化
 * 5. API 配置初始化
 */

import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore.ts'
import { initSettings, getSetting } from '../services/dbService.ts'
import { applyThemePreferences } from '../store/slices/createUiSlice.ts'
import { getXingheMediaSrc } from '../utils/fileHelpers.ts'
import { DEFAULT_GROUP_API_URLS, normalizeModelApiBaseUrl } from '../utils/constants.ts'

function parseSettingObject(value) {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

export function useAppInit() {
  useEffect(() => {
    // 1. 初始化 dbService（SQLite settings 缓存）+ 加载 API Key
    initSettings().then(async () => {
      console.log('[dbService] 设置缓存初始化完成')

      try {
        if (window.dbAPI?.settings) {
          const allSettings = await window.dbAPI.settings.getAll()
          const state: any = useAppStore.getState()
          const updates: Record<string, any> = {}

          // 一次性迁移：旧的 localStorage Zustand persist 数据 → SQLite
          const migrateEntries = []
          const persistData = localStorage.getItem('tapnow-storage')
          if (persistData) {
            try {
              const parsed = JSON.parse(persistData)
              // 兼容旧版：如果存在分类 key，合并到全局（优先取 chatApiKey 作为统一值）
              const legacyKey =
                parsed.state?.globalApiKey ||
                parsed.state?.chatApiKey ||
                parsed.state?.imageApiKey ||
                parsed.state?.videoApiKey
              const legacyUrl =
                parsed.state?.globalApiUrl ||
                parsed.state?.chatApiUrl ||
                parsed.state?.imageApiUrl ||
                parsed.state?.videoApiUrl
              if (legacyKey && !allSettings['tapnow_globalApiKey']) {
                migrateEntries.push({ key: 'tapnow_globalApiKey', value: legacyKey })
                allSettings['tapnow_globalApiKey'] = legacyKey
              }
              if (legacyUrl && !allSettings['tapnow_globalApiUrl']) {
                migrateEntries.push({ key: 'tapnow_globalApiUrl', value: legacyUrl })
                allSettings['tapnow_globalApiUrl'] = legacyUrl
              }
              if (parsed.state?.groupApiKeys && !allSettings['tapnow_groupApiKeys']) {
                const value = JSON.stringify(parsed.state.groupApiKeys)
                migrateEntries.push({ key: 'tapnow_groupApiKeys', value })
                allSettings['tapnow_groupApiKeys'] = value
              }
              if (parsed.state?.groupApiUrls && !allSettings['tapnow_groupApiUrls']) {
                const value = JSON.stringify(parsed.state.groupApiUrls)
                migrateEntries.push({ key: 'tapnow_groupApiUrls', value })
                allSettings['tapnow_groupApiUrls'] = value
              }
              if (Array.isArray(parsed.state?.apiConfigs) && !allSettings['tapnow_api_configs']) {
                const value = JSON.stringify(parsed.state.apiConfigs)
                migrateEntries.push({ key: 'tapnow_api_configs', value })
                allSettings['tapnow_api_configs'] = value
              }
              if (migrateEntries.length > 0) {
                await window.dbAPI.settings.setBatch(migrateEntries)
                console.log(
                  `[App] API Key 已从 localStorage 迁移到 SQLite (${migrateEntries.length} 项)`
                )
              }
            } catch {
              /* ignore parse errors */
            }
          }

          // 从 SQLite 恢复到 Zustand
          if (allSettings['tapnow_globalApiKey'] && !state.globalApiKey)
            updates.globalApiKey = allSettings['tapnow_globalApiKey']
          if (allSettings['tapnow_globalApiUrl'] && !state.globalApiUrl)
            updates.globalApiUrl = allSettings['tapnow_globalApiUrl']
          const savedGroupApiKeys = parseSettingObject(allSettings['tapnow_groupApiKeys'])
          if (Object.keys(savedGroupApiKeys).length > 0) {
            updates.groupApiKeys = {
              ...(state.groupApiKeys || {}),
              ...savedGroupApiKeys
            }
          }
          const savedGroupApiUrls = parseSettingObject(allSettings['tapnow_groupApiUrls'])
          updates.groupApiUrls = {
            ...(state.groupApiUrls || {}),
            ...savedGroupApiUrls,
            Chat: normalizeModelApiBaseUrl(
              savedGroupApiUrls.Chat || state.groupApiUrls?.Chat,
              DEFAULT_GROUP_API_URLS.Chat
            ),
            Image: normalizeModelApiBaseUrl(
              savedGroupApiUrls.Image || state.groupApiUrls?.Image,
              DEFAULT_GROUP_API_URLS.Image
            ),
            Video: normalizeModelApiBaseUrl(
              savedGroupApiUrls.Video || state.groupApiUrls?.Video,
              DEFAULT_GROUP_API_URLS.Video
            )
          }

          if (allSettings['tapnow_enableGpu'] !== undefined) {
            updates.enableGpu = allSettings['tapnow_enableGpu'] !== 'false'
          }
          if (allSettings['tapnow_enableUpdateCheck'] !== undefined) {
            updates.enableUpdateCheck = allSettings['tapnow_enableUpdateCheck'] !== 'false'
          }

          if (Object.keys(updates).length > 0) {
            useAppStore.setState(updates)
          }

          const savedApiConfigs = parseSettingObject(allSettings['tapnow_api_configs'])
          if (Array.isArray(savedApiConfigs) && savedApiConfigs.length > 0) {
            const currentConfigs = useAppStore.getState().apiConfigs || []
            const savedHasKey = savedApiConfigs.some((config) => config?.key)
            const currentHasKey = currentConfigs.some((config) => config?.key)
            if (savedHasKey && !currentHasKey) {
              useAppStore.getState().setApiConfigs([...currentConfigs, ...savedApiConfigs])
              console.log('[App] API 模型配置已从 SQLite 恢复')
            }
          }

          // ── 从 SQLite 加载全局 history（旧版迁移兼容） ──
          // 注意：项目专属历史在 handleLoadFromHistory / WelcomeScreen 加载项目时才读取
          // 这里只处理全局 key 'tapnow_history_v2'（旧版 / 无项目隔离的数据）
          let historyLoaded = false
          const historyJson = allSettings['tapnow_history_v2']

          if (historyJson) {
            try {
              const parsed = JSON.parse(historyJson)
              if (Array.isArray(parsed) && parsed.length > 0) {
                useAppStore.getState().setHistory(parsed)
                historyLoaded = true
                console.log(`[App] 从 SQLite 加载 ${parsed.length} 条全局历史记录`)
              }
            } catch {
              console.warn('[App] 解析 SQLite history 失败')
            }
          }

          // 一次性迁移：旧 localStorage history → SQLite
          if (!historyLoaded && persistData) {
            try {
              const parsed = JSON.parse(persistData)
              if (Array.isArray(parsed.state?.history) && parsed.state.history.length > 0) {
                useAppStore.getState().setHistory(parsed.state.history)
                console.log(
                  `[App] history 已从 localStorage 迁移到 SQLite (${parsed.state.history.length} 条)`
                )
              }
            } catch {
              /* ignore */
            }
          }
        }
      } catch (err) {
        console.error('[App] 从 SQLite 加载 API Key 失败:', err)
      }
    })

    // 2. 迁移历史记录中的裸文件路径 → xinghe:// 协议
    // 注意：此段在 initSettings 之前同步执行，处理的是 Zustand persist 恢复的旧数据
    // SQLite 加载的新数据会在上面的异步回调中处理
    const currentState = useAppStore.getState()
    const hist = currentState.history
    if (hist && hist.length > 0) {
      let needsMigration = false
      const migrated = hist.map((item) => {
        if (
          item.url &&
          !item.url.startsWith('http') &&
          !item.url.startsWith('data:') &&
          !item.url.startsWith('blob:') &&
          !item.url.startsWith('xinghe:')
        ) {
          needsMigration = true
          return { ...item, url: getXingheMediaSrc(item.url) }
        }
        return item
      })
      if (needsMigration) {
        currentState.setHistory(migrated)
        console.log('[App] 历史记录 URL 格式迁移完成')
      }
    }

    // 3. 初始化主题色
    applyThemePreferences(useAppStore.getState())

    // 3.1 恢复 RGB 自选配色覆盖
    const { canvasBgColor, textBaseColor, textBrightness, componentBaseColor } =
      useAppStore.getState()

    // 4. 初始化 API 配置（防御 rehydrate 期间 state 不完整）
    const state = useAppStore.getState()
    if (state && typeof state.initializeConfigs === 'function') {
      state.initializeConfigs()
    } else {
      console.warn('[useAppInit] initializeConfigs 不可用，延迟重试')
      const retryTimer = setTimeout(() => {
        const retryState = useAppStore.getState()
        if (retryState && typeof retryState.initializeConfigs === 'function') {
          retryState.initializeConfigs()
        }
      }, 500)
      // cleanup on unmount (though this hook runs once)
      return () => clearTimeout(retryTimer)
    }

    // 5. 不再自动恢复上次项目 — 始终从首页欢迎页开始
    // 用户可在欢迎页选择项目进入画布
  }, [])
}
