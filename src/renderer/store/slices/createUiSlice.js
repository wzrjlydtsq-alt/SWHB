// 将 hex 颜色转为 HSL
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max - min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

// 应用主题色到所有 CSS 变量（primary + 背景 + 边框）
export function applyThemeColor(color) {
  const root = document.documentElement
  root.style.setProperty('--primary-color', color)
  root.style.setProperty('--primary-hover', `color-mix(in srgb, ${color} 80%, white)`)
  root.style.setProperty('--primary-active', `color-mix(in srgb, ${color} 60%, black)`)

  // 从主题色提取色相、饱和度、亮度，派生全套色板
  const [h, s, l] = hexToHsl(color)

  if (l > 50) {
    // 浅色主题（白色、灰色等高亮度颜色）
    const sat = Math.max(Math.min(s, 15), 0)
    root.style.setProperty('--bg-base', `hsl(${h}, ${sat}%, 95%)`)
    root.style.setProperty('--bg-panel', `hsla(${h}, ${sat}%, 98%, 0.95)`)
    root.style.setProperty('--bg-secondary', `hsl(${h}, ${sat}%, 92%)`)
    root.style.setProperty('--bg-hover', `hsl(${h}, ${sat}%, 88%)`)
    root.style.setProperty('--border-color', `hsla(${h}, ${sat}%, 75%, 0.4)`)
    root.style.setProperty('--text-primary', '#1a1a1a')
    root.style.setProperty('--text-secondary', '#4a4a4a')
    root.style.setProperty('--text-muted', '#888888')
    root.classList.add('light-theme')
  } else {
    // 深色主题（默认）
    const sat = s < 5 ? 0 : Math.max(Math.min(s, 50), 25)
    root.style.setProperty('--bg-base', `hsl(${h}, ${sat}%, 13%)`)
    root.style.setProperty('--bg-panel', `hsla(${h}, ${sat}%, 20%, 0.85)`)
    root.style.setProperty('--bg-secondary', `hsl(${h}, ${sat * 0.8}%, 17%)`)
    root.style.setProperty('--bg-hover', `hsl(${h}, ${sat * 0.8}%, 22%)`)
    root.style.setProperty('--border-color', `hsla(${h}, ${sat * 0.7}%, 35%, 0.3)`)
    root.style.setProperty('--text-primary', '#f0f0f0')
    root.style.setProperty('--text-secondary', '#a0a0a0')
    root.style.setProperty('--text-muted', '#666666')
    root.classList.remove('light-theme')
  }
}

export const createUiSlice = (set) => ({
  // Defaults & Configs
  uiScale: 100,
  setUiScale: (uiScale) => {
    set({ uiScale })
    document.documentElement.style.setProperty('--text-scale', `${uiScale / 100}`)
  },
  imageSavePath: '',
  setImageSavePath: (imageSavePath) => set({ imageSavePath }),
  videoSavePath: '',
  setVideoSavePath: (videoSavePath) => set({ videoSavePath }),
  autoSaveInterval: 0,
  setAutoSaveInterval: (autoSaveInterval) => set({ autoSaveInterval }),

  // 高级系统设置
  enableGpu: true,
  setEnableGpu: (enableGpu) => set({ enableGpu }),
  enableUpdateCheck: true,
  setEnableUpdateCheck: (enableUpdateCheck) => set({ enableUpdateCheck }),

  showConnectionAnimations: true,
  setShowConnectionAnimations: (showConnectionAnimations) => set({ showConnectionAnimations }),
  silenceConfirmations: false,
  setSilenceConfirmations: (silenceConfirmations) => set({ silenceConfirmations }),

  theme: 'dark',
  setTheme: (theme) => set({ theme }),

  themeColor: '#3b82f6',
  setThemeColor: (color) => {
    set({ themeColor: color })
    applyThemeColor(color)
  },

  // App Configs
  isPerformanceMode: false,
  setPerformanceMode: (isPerformanceMode) => set({ isPerformanceMode }),
  jimengUseLocalFile: true,
  setJimengUseLocalFile: (jimengUseLocalFile) => set({ jimengUseLocalFile }),
  historyPerformanceMode: 'normal',
  setHistoryPerformanceMode: (mode) => set({ historyPerformanceMode: mode }),

  // Ephemeral Modals & Panels
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  historyOpen: false,
  setHistoryOpen: (historyOpen) => set({ historyOpen }),
  localCacheSettingsOpen: false,
  setLocalCacheSettingsOpen: (localCacheSettingsOpen) => set({ localCacheSettingsOpen }),
  batchSelectedIds: new Set(),
  setBatchSelectedIds: (batchSelectedIdsOrFn) => {
    if (typeof batchSelectedIdsOrFn === 'function') {
      set((state) => ({ batchSelectedIds: batchSelectedIdsOrFn(state.batchSelectedIds) }))
    } else {
      set({ batchSelectedIds: batchSelectedIdsOrFn })
    }
  },
  batchModalOpen: false,
  setBatchModalOpen: (batchModalOpen) => set({ batchModalOpen }),
  activeTool: 'select',
  setActiveTool: (activeTool) => set({ activeTool }),
  activeDropdown: null,
  setActiveDropdown: (activeDropdown) => set({ activeDropdown }),
  projectListOpen: false,
  setProjectListOpen: (projectListOpen) => set({ projectListOpen }),
  assetLibraryOpen: false,
  setAssetLibraryOpen: (assetLibraryOpen) => set({ assetLibraryOpen }),

  // 全局灯箱（Lightbox）状态 — 统一管理所有组件的灯箱
  lightboxItem: null,
  setLightboxItem: (lightboxItem) => set({ lightboxItem }),
  closeLightbox: () => set({ lightboxItem: null })
})
