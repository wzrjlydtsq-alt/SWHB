import { useState, useEffect } from 'react'
import { getSetting, getSettingJSON, setSetting, setSettingJSON } from '../services/dbService.js'

/**
 * useAppConfig Hook
 * 管理应用的全局配置、主题、API 设置及性能模式。
 * 使用 dbService 双写模式（SQLite + localStorage）。
 */
export const useAppConfig = (
  DEFAULT_API_CONFIGS,
  DEFAULT_BASE_URL,
  JIMENG_API_BASE_URL,
  DELETED_MODEL_IDS
) => {
  // 性能模式
  const [isPerformanceMode, setPerformanceMode] = useState(() => {
    return getSetting('tapnow_performance_mode') === 'true'
  })

  useEffect(() => {
    setSetting('tapnow_performance_mode', isPerformanceMode.toString())
  }, [isPerformanceMode])

  // 主题设置
  const [theme, setTheme] = useState(() => {
    return getSetting('tapnow_theme', 'dark')
  })

  useEffect(() => {
    setSetting('tapnow_theme', theme)
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('theme-dark')
      root.classList.remove('theme-light')
    } else {
      root.classList.add('theme-light')
      root.classList.remove('theme-dark')
    }
  }, [theme])

  // API 配置
  const [apiConfigs, setApiConfigs] = useState(() => {
    let configs = getSettingJSON('tapnow_api_configs', DEFAULT_API_CONFIGS)

    // 过滤已删除模型
    configs = configs.filter((c) => !DELETED_MODEL_IDS.includes(c.id))

    return configs
  })

  useEffect(() => {
    setSettingJSON('tapnow_api_configs', apiConfigs)
  }, [apiConfigs])

  const [globalApiKey, setGlobalApiKey] = useState(() => getSetting('tapnow_global_key', ''))
  useEffect(() => {
    setSetting('tapnow_global_key', globalApiKey)
  }, [globalApiKey])

  const [globalApiUrl, setGlobalApiUrl] = useState(() =>
    getSetting('tapnow_global_url', DEFAULT_BASE_URL)
  )
  useEffect(() => {
    setSetting('tapnow_global_url', globalApiUrl)
  }, [globalApiUrl])

  // 即梦本地文件使用设置
  const [jimengUseLocalFile, setJimengUseLocalFile] = useState(() => {
    const saved = getSetting('tapnow_jimeng_use_local_file')
    return saved !== null ? saved === 'true' : true
  })
  useEffect(() => {
    setSetting('tapnow_jimeng_use_local_file', jimengUseLocalFile.toString())
  }, [jimengUseLocalFile])

  // 历史记录性能模式
  const [historyPerformanceMode, setHistoryPerformanceMode] = useState(() => {
    return getSetting('tapnow_history_performance_mode', 'normal')
  })
  useEffect(() => {
    setSetting('tapnow_history_performance_mode', historyPerformanceMode)
  }, [historyPerformanceMode])

  // 本地缓存路径
  const [imageSavePath, setImageSavePath] = useState(() => getSetting('tapnow_image_save_path', ''))
  const [videoSavePath, setVideoSavePath] = useState(() => getSetting('tapnow_video_save_path', ''))

  useEffect(() => {
    setSetting('tapnow_image_save_path', imageSavePath)
    if (window.api?.invoke && imageSavePath) {
      window.api.invoke('cache:config', { imageSavePath })
    }
  }, [imageSavePath])

  useEffect(() => {
    setSetting('tapnow_video_save_path', videoSavePath)
    if (window.api?.invoke && videoSavePath) {
      window.api.invoke('cache:config', { videoSavePath })
    }
  }, [videoSavePath])

  // 初始化时同步一次配置到后端
  useEffect(() => {
    if (window.api?.invoke) {
      const initConfig = {}
      if (imageSavePath) initConfig.imageSavePath = imageSavePath
      if (videoSavePath) initConfig.videoSavePath = videoSavePath
      if (Object.keys(initConfig).length > 0) {
        window.api.invoke('cache:config', initConfig)
      }
    }
  }, [])

  return {
    isPerformanceMode,
    setPerformanceMode,
    theme,
    setTheme,
    apiConfigs,
    setApiConfigs,
    globalApiKey,
    setGlobalApiKey,
    globalApiUrl,
    setGlobalApiUrl,
    jimengUseLocalFile,
    setJimengUseLocalFile,
    historyPerformanceMode,
    setHistoryPerformanceMode,
    imageSavePath,
    setImageSavePath,
    videoSavePath,
    setVideoSavePath
  }
}
