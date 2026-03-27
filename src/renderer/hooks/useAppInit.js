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
import { useAppStore } from '../store/useAppStore.js'
import { initSettings, getSetting } from '../services/dbService.js'
import { applyThemeColor } from '../store/slices/createUiSlice.js'
import { getXingheMediaSrc } from '../utils/fileHelpers.js'

export function useAppInit() {
  useEffect(() => {
    // 1. 初始化 dbService（SQLite settings 缓存）+ 加载 API Key
    initSettings().then(async () => {
      console.log('[dbService] 设置缓存初始化完成')

      try {
        if (window.dbAPI?.settings) {
          const allSettings = await window.dbAPI.settings.getAll()
          const state = useAppStore.getState()
          const updates = {}

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

          if (allSettings['tapnow_enableGpu'] !== undefined) {
            updates.enableGpu = allSettings['tapnow_enableGpu'] !== 'false'
          }
          if (allSettings['tapnow_enableUpdateCheck'] !== undefined) {
            updates.enableUpdateCheck = allSettings['tapnow_enableUpdateCheck'] !== 'false'
          }

          if (Object.keys(updates).length > 0) {
            useAppStore.setState(updates)
          }

          // ── 从 SQLite 加载 history (按当前项目隔离) ──
          let historyLoaded = false
          const projectId = state.currentProject?.id
          const projectHistoryKey = projectId
            ? `tapnow_history_v2_${projectId}`
            : 'tapnow_history_v2'
          const historyJson = allSettings[projectHistoryKey] || allSettings['tapnow_history_v2']

          if (historyJson) {
            try {
              const parsed = JSON.parse(historyJson)
              if (Array.isArray(parsed) && parsed.length > 0) {
                useAppStore.getState().setHistory(parsed)
                historyLoaded = true
                console.log(
                  `[App] 从 SQLite 加载 ${parsed.length} 条历史记录 (key: ${projectHistoryKey})`
                )
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
    const themeColor = useAppStore.getState().themeColor
    if (themeColor) {
      applyThemeColor(themeColor)
    }

    // 4. 初始化 API 配置
    useAppStore.getState().initializeConfigs()

    // 5. 不再自动恢复上次项目 — 始终从首页欢迎页开始
    // 用户可在欢迎页选择项目进入画布
  }, [])
}
