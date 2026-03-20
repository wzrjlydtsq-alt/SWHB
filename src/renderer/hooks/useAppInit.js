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
import { initSettings } from '../services/dbService.js'
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
              const migrateMap = {
                chatApiKey: 'tapnow_chatApiKey',
                chatApiUrl: 'tapnow_chatApiUrl',
                imageApiKey: 'tapnow_imageApiKey',
                imageApiUrl: 'tapnow_imageApiUrl',
                videoApiKey: 'tapnow_videoApiKey',
                videoApiUrl: 'tapnow_videoApiUrl'
              }
              for (const [stateKey, dbKey] of Object.entries(migrateMap)) {
                if (parsed.state?.[stateKey] && !allSettings[dbKey]) {
                  migrateEntries.push({ key: dbKey, value: parsed.state[stateKey] })
                  allSettings[dbKey] = parsed.state[stateKey]
                }
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
          if (allSettings['tapnow_chatApiKey'] && !state.chatApiKey)
            updates.chatApiKey = allSettings['tapnow_chatApiKey']
          if (allSettings['tapnow_chatApiUrl'] && !state.chatApiUrl)
            updates.chatApiUrl = allSettings['tapnow_chatApiUrl']
          if (allSettings['tapnow_imageApiKey'] && !state.imageApiKey)
            updates.imageApiKey = allSettings['tapnow_imageApiKey']
          if (allSettings['tapnow_imageApiUrl'] && !state.imageApiUrl)
            updates.imageApiUrl = allSettings['tapnow_imageApiUrl']
          if (allSettings['tapnow_videoApiKey'] && !state.videoApiKey)
            updates.videoApiKey = allSettings['tapnow_videoApiKey']
          if (allSettings['tapnow_videoApiUrl'] && !state.videoApiUrl)
            updates.videoApiUrl = allSettings['tapnow_videoApiUrl']

          if (Object.keys(updates).length > 0) {
            useAppStore.setState(updates)
          }

          // ── 从 SQLite 加载 history ──
          let historyLoaded = false
          const historyJson = allSettings['tapnow_history_v2']
          if (historyJson) {
            try {
              const parsed = JSON.parse(historyJson)
              if (Array.isArray(parsed) && parsed.length > 0) {
                useAppStore.getState().setHistory(parsed)
                historyLoaded = true
                console.log(`[App] 从 SQLite 加载 ${parsed.length} 条历史记录`)
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
  }, [])
}
