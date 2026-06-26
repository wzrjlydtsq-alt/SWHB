import {
  DEFAULT_API_CONFIGS,
  DEFAULT_BASE_URL,
  DEFAULT_GROUP_API_URLS,
  DEFAULT_VIDEO_URL,
  DELETED_MODEL_IDS,
  isAllowedModelApiBaseUrl,
  normalizeModelApiBaseUrl,
  normalizeOptionalModelApiBaseUrl
} from '../../utils/constants'

const normalizeConfigModelName = (config) =>
  String(config?.modelName || config?.id || '')
    .trim()
    .toLowerCase()

const getConfigDedupeKey = (config) =>
  `${config?.type || 'Chat'}:${normalizeConfigModelName(config)}`

const getConfigStorageKey = (config) => {
  const id = String(config?.id || '')
    .trim()
    .toLowerCase()
  return id ? `${config?.type || 'Chat'}:id:${id}` : getConfigDedupeKey(config)
}

const scoreApiConfig = (config) =>
  (config?.key ? 8 : 0) +
  (isAllowedModelApiBaseUrl(config?.url) ? 4 : 0) +
  (config?.isCustom ? 0 : 2) +
  (config?.provider ? 1 : 0)

const normalizeBaseUrl = (value, fallback = '') => {
  const trimmed = String(value || '').trim()
  if (!trimmed) return normalizeModelApiBaseUrl(fallback)
  return normalizeModelApiBaseUrl(trimmed, fallback)
}

const normalizeApiConfigUrl = (config, canonical) => {
  if (Object.prototype.hasOwnProperty.call(config || {}, 'url')) {
    return normalizeOptionalModelApiBaseUrl(config?.url, canonical?.url || DEFAULT_BASE_URL)
  }

  const fallback = canonical?.url || ''
  return fallback ? normalizeModelApiBaseUrl(fallback, DEFAULT_BASE_URL) : ''
}

const mergeApiConfigs = (current, incoming, canonical) => {
  const preferred = scoreApiConfig(incoming) > scoreApiConfig(current) ? incoming : current
  const fallback = preferred === incoming ? current : incoming
  const base = canonical || preferred

  return {
    ...base,
    ...preferred,
    id: canonical?.id || preferred.id,
    provider: preferred.provider || fallback.provider || canonical?.provider || preferred.id,
    modelName: preferred.modelName || fallback.modelName || canonical?.modelName || preferred.id,
    type: preferred.type || fallback.type || canonical?.type || 'Chat',
    key: preferred.key || fallback.key || canonical?.key || '',
    url: preferred.url || fallback.url || canonical?.url || '',
    durations: preferred.durations || fallback.durations || canonical?.durations,
    isCustom: canonical ? false : preferred.isCustom
  }
}

const normalizeApiConfigs = (configs = []) => {
  const canonicalByKey = new Map(
    DEFAULT_API_CONFIGS.map((config) => [getConfigDedupeKey(config), config])
  )
  const canonicalById = new Map(DEFAULT_API_CONFIGS.map((config) => [config.id, config]))
  const byKey = new Map()
  const seenDefaultIds = new Set()

  for (const config of Array.isArray(configs) ? configs : []) {
    if (!config || DELETED_MODEL_IDS.includes(config.id)) continue
    const key = getConfigDedupeKey(config)
    const canonical = canonicalById.get(config.id) || canonicalByKey.get(key)
    const normalized = canonical
      ? {
          ...canonical,
          ...config,
          id: canonical.id,
          provider: config.provider || canonical.provider,
          modelName: config.modelName || canonical.modelName,
          type: config.type || canonical.type,
          url: normalizeApiConfigUrl(config, canonical),
          isCustom: false
        }
      : {
          ...config,
          url: normalizeApiConfigUrl(config, null)
        }
    if (canonical) seenDefaultIds.add(canonical.id)

    const normalizedKey = getConfigStorageKey(normalized)
    if (byKey.has(normalizedKey)) {
      byKey.set(normalizedKey, mergeApiConfigs(byKey.get(normalizedKey), normalized, canonical))
    } else {
      byKey.set(normalizedKey, normalized)
    }
  }

  for (const config of DEFAULT_API_CONFIGS) {
    if (DELETED_MODEL_IDS.includes(config.id) || seenDefaultIds.has(config.id)) continue
    const key = getConfigStorageKey(config)
    if (!byKey.has(key)) byKey.set(key, config)
  }

  return Array.from(byKey.values())
}

const persistApiConfigsImmediately = (apiConfigs) => {
  try {
    const value = JSON.stringify(apiConfigs)
    localStorage.setItem('tapnow_api_configs', value)
    if (window.dbAPI?.settings) {
      window.dbAPI.settings.set('tapnow_api_configs', value).catch(() => {})
    }
  } catch {
    /* ignore persistence fallback errors */
  }
}

const persistGroupApiUrlsImmediately = (groupApiUrls) => {
  try {
    const value = JSON.stringify(groupApiUrls)
    localStorage.setItem('tapnow_groupApiUrls', value)
    if (window.dbAPI?.settings) {
      window.dbAPI.settings.set('tapnow_groupApiUrls', value).catch(() => {})
    }
  } catch {
    /* ignore persistence fallback errors */
  }
}

export const createProjectSlice = (set, get) => ({
  projectName: '未命名项目',
  setProjectName: (projectName) => set({ projectName }),

  currentProject: null,
  setCurrentProject: (currentProject) => set({ currentProject }),

  apiConfigs: DEFAULT_API_CONFIGS,
  setApiConfigs: (apiConfigsOrUpdater) => {
    // 支持函数式更新
    if (typeof apiConfigsOrUpdater === 'function') {
      set((state) => {
        const apiConfigs = normalizeApiConfigs(apiConfigsOrUpdater(state.apiConfigs))
        persistApiConfigsImmediately(apiConfigs)
        return { apiConfigs }
      })
    } else {
      const apiConfigs = normalizeApiConfigs(apiConfigsOrUpdater)
      persistApiConfigsImmediately(apiConfigs)
      set({ apiConfigs })
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

  groupApiKeys: { Chat: '', Image: '', Video: '' },
  groupApiUrls: { ...DEFAULT_GROUP_API_URLS },
  setGroupApiKey: (type, key) => {
    set((state) => {
      const groupApiKeys = { ...state.groupApiKeys, [type]: key }
      try {
        const value = JSON.stringify(groupApiKeys)
        localStorage.setItem('tapnow_groupApiKeys', value)
        if (window.dbAPI?.settings) {
          window.dbAPI.settings.set('tapnow_groupApiKeys', value).catch(() => {})
        }
      } catch {
        /* ignore */
      }
      return { groupApiKeys }
    })
  },
  setGroupApiUrl: (type, url) => {
    set((state) => {
      const groupApiUrls = {
        ...state.groupApiUrls,
        [type]: normalizeModelApiBaseUrl(url, DEFAULT_GROUP_API_URLS[type] || DEFAULT_BASE_URL)
      }
      try {
        const value = JSON.stringify(groupApiUrls)
        localStorage.setItem('tapnow_groupApiUrls', value)
        if (window.dbAPI?.settings) {
          window.dbAPI.settings.set('tapnow_groupApiUrls', value).catch(() => {})
        }
      } catch {
        /* ignore */
      }
      return { groupApiUrls }
    })
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
          c.id.includes('jimeng') || c.provider?.includes('Jimeng')
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
    const currentGroupApiUrls = get().groupApiUrls || {}
    const nextGroupApiUrls = {
      ...currentGroupApiUrls,
      Chat: normalizeBaseUrl(currentGroupApiUrls.Chat, DEFAULT_GROUP_API_URLS.Chat),
      Image: normalizeBaseUrl(currentGroupApiUrls.Image, DEFAULT_GROUP_API_URLS.Image),
      Video: normalizeBaseUrl(currentGroupApiUrls.Video, DEFAULT_GROUP_API_URLS.Video)
    }
    const groupApiUrlsChanged =
      nextGroupApiUrls.Chat !== currentGroupApiUrls.Chat ||
      nextGroupApiUrls.Image !== currentGroupApiUrls.Image ||
      nextGroupApiUrls.Video !== currentGroupApiUrls.Video

    // ── 迁移注入新 Chat 模型 ──
    const newChatModels = [
      { id: 'gpt-5.5', provider: 'GPT 5.5', modelName: 'gpt-5.5' },
      { id: 'claude-opus-4-6', provider: 'Claude Opus 4.6', modelName: 'claude-opus-4-6' },
      { id: 'kimi-k2.6', provider: 'Kimi K2.6', modelName: 'kimi-k2.6' }
    ]
    for (const m of newChatModels) {
      if (!configs.some((c) => c.id === m.id)) {
        const geminiIndex = configs.findIndex((c) => c.id === 'gemini-3-pro')
        configs.splice(geminiIndex >= 0 ? geminiIndex + 1 : configs.length, 0, {
          id: m.id,
          provider: m.provider,
          modelName: m.modelName,
          type: 'Chat',
          key: '',
          url: DEFAULT_BASE_URL
        })
        changed = true
      }
    }

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
          (c.id.includes('jimeng') || c.provider?.includes('Jimeng')) &&
          c.key !== savedSessionId
      )
      if (jimengChanged) {
        configs = configs.map((c) =>
          c.id.includes('jimeng') || c.provider?.includes('Jimeng')
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
        url: DEFAULT_VIDEO_URL,
        durations: ['5s', '8s', '11s', '15s']
      })
      changed = true
    }

    if (!configs.some((c) => c.id === 'doubao-seedance-2.0-fast')) {
      const doubaoIndex = configs.findIndex((c) => c.id === 'doubao-seedance-2')
      configs.splice(doubaoIndex >= 0 ? doubaoIndex + 1 : configs.length, 0, {
        id: 'doubao-seedance-2.0-fast',
        provider: 'Doubao-Seedance-2.0-fast',
        modelName: 'Doubao-Seedance-2.0-fast',
        type: 'Video',
        key: '',
        url: DEFAULT_VIDEO_URL,
        durations: ['5s', '8s', '11s', '15s']
      })
      changed = true
    }

    if (!configs.some((c) => c.id === 'gpt-image-2')) {
      const bananaIndex = configs.findIndex((c) => c.id === 'nano-banana-3.1')
      configs.splice(bananaIndex >= 0 ? bananaIndex + 1 : configs.length, 0, {
        id: 'gpt-image-2',
        provider: 'GPT Image 2',
        modelName: 'gpt-image-2',
        type: 'Image',
        key: '',
        url: ''
      })
      changed = true
    }

    if (!configs.some((c) => c.id === 'sub2api-gpt-image-2')) {
      const gptImage2Index = configs.findIndex((c) => c.id === 'gpt-image-2')
      configs.splice(gptImage2Index >= 0 ? gptImage2Index + 1 : configs.length, 0, {
        id: 'sub2api-gpt-image-2',
        provider: 'Sub2API',
        modelName: 'gpt-image-2',
        type: 'Image',
        key: '',
        url: ''
      })
      changed = true
    }

    const newImageModels = [
      {
        id: 'gemini-3.1-flash-image-preview-2k',
        provider: 'Gemini 3.1 Flash Image 2K',
        modelName: 'gemini-3.1-flash-image-preview-2k'
      },
      {
        id: 'nano-banana-pro-2k',
        provider: 'Nano Banana Pro 2K',
        modelName: 'nano-banana-pro-2k'
      }
    ]
    for (const m of newImageModels) {
      const existingIndex = configs.findIndex((c) => c.id === m.id)
      if (existingIndex === -1) {
        const imageInsertIndex = configs.findIndex((c) => c.id === 'gpt-image-2')
        configs.splice(imageInsertIndex >= 0 ? imageInsertIndex : configs.length, 0, {
          id: m.id,
          provider: m.provider,
          modelName: m.modelName,
          type: 'Image',
          key: '',
          url: DEFAULT_BASE_URL
        })
        changed = true
      } else if (
        configs[existingIndex].type !== 'Image' ||
        configs[existingIndex].provider !== m.provider ||
        configs[existingIndex].modelName !== m.modelName
      ) {
        configs[existingIndex] = {
          ...configs[existingIndex],
          provider: m.provider,
          modelName: m.modelName,
          type: 'Image',
          url: configs[existingIndex].url || DEFAULT_BASE_URL
        }
        changed = true
      }
    }

    // ─── HappyHorse (阿里 DashScope) ───
    const happyHorseModels = [
      {
        id: 'happyhorse-1.1-t2v',
        provider: 'HappyHorse 1.1 T2V',
        modelName: 'happyhorse-1.1-t2v',
        type: 'Video',
        key: '',
        url: '',
        durations: ['3s', '5s', '8s', '10s', '15s']
      },
      {
        id: 'happyhorse-1.1-i2v',
        provider: 'HappyHorse 1.1 I2V',
        modelName: 'happyhorse-1.1-i2v',
        type: 'Video',
        key: '',
        url: '',
        durations: ['3s', '5s', '8s', '10s', '15s']
      },
      {
        id: 'happyhorse-1.1-r2v',
        provider: 'HappyHorse 1.1 R2V',
        modelName: 'happyhorse-1.1-r2v',
        type: 'Video',
        key: '',
        url: '',
        durations: ['3s', '5s', '8s', '10s', '15s']
      },
      {
        id: 'happyhorse-video-edit',
        provider: 'HappyHorse 视频编辑',
        modelName: 'happyhorse-1.0-video-edit',
        type: 'Video',
        key: '',
        url: '',
        durations: ['3s', '5s', '8s', '10s', '15s']
      }
    ]
    for (const hh of happyHorseModels) {
      const existingIndex = configs.findIndex((c) => c.id === hh.id)
      if (existingIndex === -1) {
        configs.push(hh)
        changed = true
      } else if (
        configs[existingIndex].type !== 'Video' ||
        configs[existingIndex].provider !== hh.provider ||
        configs[existingIndex].modelName !== hh.modelName
      ) {
        configs[existingIndex] = {
          ...configs[existingIndex],
          provider: hh.provider,
          modelName: hh.modelName,
          type: 'Video',
          url: configs[existingIndex].url || '',
          durations: configs[existingIndex].durations || hh.durations
        }
        changed = true
      }
    }

    const normalizedConfigs = normalizeApiConfigs(
      configs.filter((c) => !DELETED_MODEL_IDS.includes(c.id))
    )
    if (JSON.stringify(normalizedConfigs) !== JSON.stringify(configs)) {
      configs = normalizedConfigs
      changed = true
    }

    if (changed) {
      if (groupApiUrlsChanged) persistGroupApiUrlsImmediately(nextGroupApiUrls)
      set({ apiConfigs: configs, ...(groupApiUrlsChanged ? { groupApiUrls: nextGroupApiUrls } : {}) })
    } else if (groupApiUrlsChanged) {
      persistGroupApiUrlsImmediately(nextGroupApiUrls)
      set({ groupApiUrls: nextGroupApiUrls })
    }
  }
})
