import { DEFAULT_API_CONFIGS, DEFAULT_BASE_URL, DELETED_MODEL_IDS } from '../../utils/constants'

export const createProjectSlice = (set, get) => ({
  projectName: '未命名项目',
  setProjectName: (projectName) => set({ projectName }),

  currentProject: null,
  setCurrentProject: (currentProject) => set({ currentProject }),

  apiConfigs: DEFAULT_API_CONFIGS,
  setApiConfigs: (apiConfigsOrUpdater) => {
    // 支持函数式更新
    if (typeof apiConfigsOrUpdater === 'function') {
      set((state) => ({
        apiConfigs: apiConfigsOrUpdater(state.apiConfigs)
      }))
    } else {
      set({ apiConfigs: apiConfigsOrUpdater })
    }
  },

  // === 统一全局 API Key/URL（持久化到 SQLite settings） ===
  globalApiKey: '',
  globalApiUrl: '',
  setGlobalApiKey: (globalApiKey) => {
    set({ globalApiKey })
    if (window.dbAPI?.settings)
      window.dbAPI.settings.set('tapnow_globalApiKey', globalApiKey).catch(() => {})
  },
  setGlobalApiUrl: (globalApiUrl) => {
    set({ globalApiUrl })
    if (window.dbAPI?.settings)
      window.dbAPI.settings.set('tapnow_globalApiUrl', globalApiUrl).catch(() => {})
  },

  jimengSessionId:
    (typeof window !== 'undefined' && localStorage.getItem('tapnow_jimeng_session_id')) || '',
  setJimengSessionId: (jimengSessionId) => {
    try {
      localStorage.setItem('tapnow_jimeng_session_id', jimengSessionId)
      if (window.dbAPI?.settings)
        window.dbAPI.settings.set('tapnow_jimeng_session_id', jimengSessionId)
    } catch {
      /* ignore */
    }
    set((state) => {
      const currentConfigs = Array.isArray(state.apiConfigs) ? state.apiConfigs : []
      return {
        jimengSessionId,
        apiConfigs: currentConfigs.map((c) =>
          c.id.includes('jimeng') || c.provider?.includes('Jimeng') || c.id === 'seedance-2'
            ? { ...c, key: jimengSessionId }
            : c
        )
      }
    })
  },

  initializeConfigs: () => {
    const currentConfigs = Array.isArray(get().apiConfigs) ? get().apiConfigs : []
    let configs = [...currentConfigs]
    let changed = false

    if (!configs.some((c) => c.id === 'gpt-5-2')) {
      const gpt51Index = configs.findIndex((c) => c.id === 'gpt-5-1')
      const insertIndex = gpt51Index >= 0 ? gpt51Index + 1 : configs.length
      configs.splice(insertIndex, 0, {
        id: 'gpt-5-2',
        provider: 'GPT 5.2',
        modelName: 'gpt-5.2',
        type: 'Chat',
        key: '',
        url: DEFAULT_BASE_URL
      })
      changed = true
    }

    if (!configs.some((c) => c.id === 'sora-2-pro')) {
      const sora2Index = configs.findIndex((c) => c.id === 'sora-2')
      configs.splice(sora2Index >= 0 ? sora2Index + 1 : configs.length, 0, {
        id: 'sora-2-pro',
        provider: 'Sora 2 Pro',
        modelName: 'sora-2-pro',
        type: 'Video',
        key: '',
        url: DEFAULT_BASE_URL,
        durations: ['15s', '25s']
      })
      changed = true
    }

    const savedSessionId = get().jimengSessionId
    if (savedSessionId) {
      const jimengChanged = configs.some(
        (c) =>
          (c.id.includes('jimeng') || c.provider?.includes('Jimeng') || c.id === 'seedance-2') &&
          c.key !== savedSessionId
      )
      if (jimengChanged) {
        configs = configs.map((c) =>
          c.id.includes('jimeng') || c.provider?.includes('Jimeng') || c.id === 'seedance-2'
            ? { ...c, key: savedSessionId }
            : c
        )
        changed = true
      }
    }

    if (!configs.some((c) => c.id === 'doubao-seedance-2')) {
      const doubaoIndex = configs.findIndex((c) => c.id === 'seedance-2')
      configs.splice(doubaoIndex >= 0 ? doubaoIndex + 1 : configs.length, 0, {
        id: 'doubao-seedance-2',
        provider: 'doubao',
        modelName: 'doubao-seedance-2',
        type: 'Video',
        key: '',
        url: '',
        durations: ['5s', '8s', '11s', '15s']
      })
      changed = true
    }

    if (!configs.some((c) => c.id === 'seedance-2')) {
      const sora2ProIndex = configs.findIndex((c) => c.id === 'sora-2-pro')
      configs.splice(sora2ProIndex >= 0 ? sora2ProIndex + 1 : configs.length, 0, {
        id: 'seedance-2',
        provider: 'Seedance 2.0',
        modelName: 'doubao-seedance-2-0-260128',
        type: 'Video',
        key: savedSessionId || '',
        url: 'https://ark.cn-beijing.volces.com',
        durations: ['5s', '8s', '11s', '15s']
      })
      changed = true
    } else {
      // Force update the config if it already exists (to handle legacy corrupted local caches)
      const seedanceIndex = configs.findIndex((c) => c.id === 'seedance-2')
      const targetConfig = configs[seedanceIndex]
      const expectedKey = savedSessionId || '320b6806-2512-4cac-a623-70e379e8d668'
      if (
        targetConfig.key !== expectedKey ||
        targetConfig.url !== 'https://ark.cn-beijing.volces.com' ||
        targetConfig.modelName !== 'doubao-seedance-2-0-260128'
      ) {
        configs[seedanceIndex] = {
          ...targetConfig,
          modelName: 'doubao-seedance-2-0-260128',
          key: expectedKey,
          url: 'https://ark.cn-beijing.volces.com',
          durations: ['5s', '8s', '11s', '15s']
        }
        changed = true
      }
    }

    const filtered = configs.filter((c) => !DELETED_MODEL_IDS.includes(c.id))
    if (filtered.length !== configs.length) {
      configs = filtered
      changed = true
    }

    if (changed) {
      set({ apiConfigs: configs })
    }
  }
})
