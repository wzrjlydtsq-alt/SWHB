// 将 hex 颜色转为 HSL
const DEFAULT_THEME_COLOR = '#33334d'

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function normalizeHex(hex) {
  if (typeof hex !== 'string') return DEFAULT_THEME_COLOR
  const value = hex.trim()
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    return `#${value
      .slice(1)
      .split('')
      .map((c) => c + c)
      .join('')}`
  }
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value
  return DEFAULT_THEME_COLOR
}

export function hexToRgb(hex) {
  const safeHex = normalizeHex(hex)
  return [
    parseInt(safeHex.slice(1, 3), 16),
    parseInt(safeHex.slice(3, 5), 16),
    parseInt(safeHex.slice(5, 7), 16)
  ]
}

function hexToHsl(hex) {
  const [ri, gi, bi] = hexToRgb(hex)
  const r = ri / 255
  const g = gi / 255
  const b = bi / 255
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

// 应用主题色到所有 CSS 变量（v3 质感升级版）
export function applyThemeColor(color) {
  const root = document.documentElement
  const safeColor = normalizeHex(color)
  const [r, g, b] = hexToRgb(safeColor)
  root.style.setProperty('--primary-color', safeColor)
  root.style.setProperty('--primary-hover', `color-mix(in srgb, ${safeColor} 80%, white)`)
  root.style.setProperty('--primary-active', `color-mix(in srgb, ${safeColor} 60%, black)`)
  root.style.setProperty('--primary-glow', `color-mix(in srgb, ${safeColor} 25%, transparent)`)
  root.style.setProperty('--primary-rgb', `${r}, ${g}, ${b}`)

  const [h, s, l] = hexToHsl(safeColor)

  // 通用 token
  root.style.setProperty('--radius-xs', '6px')
  root.style.setProperty('--radius-sm', '8px')
  root.style.setProperty('--radius-md', '12px')
  root.style.setProperty('--radius-lg', '16px')
  root.style.setProperty('--radius-xl', '20px')
  root.style.setProperty('--space-xs', '4px')
  root.style.setProperty('--space-sm', '8px')
  root.style.setProperty('--space-md', '12px')
  root.style.setProperty('--space-lg', '16px')
  root.style.setProperty('--space-xl', '24px')
  root.style.setProperty('--ease-out', 'cubic-bezier(0.16, 1, 0.3, 1)')
  root.style.setProperty('--ease-in-out', 'cubic-bezier(0.4, 0, 0.2, 1)')
  root.style.setProperty('--duration-fast', '120ms')
  root.style.setProperty('--duration-normal', '200ms')
  root.style.setProperty('--duration-slow', '350ms')

  if (l > 50) {
    // ── 浅色主题 ──
    const sat = Math.max(Math.min(s, 15), 0)
    const bgDeepest = `hsl(${h}, ${sat}%, 90%)`
    const bgBase = `hsl(${h}, ${sat}%, 95%)`
    root.style.setProperty('--bg-deepest', bgDeepest)
    root.style.setProperty('--bg-base', bgBase)
    root.style.setProperty('--canvas-bg-deepest', bgDeepest)
    root.style.setProperty('--canvas-bg-base', bgBase)
    root.style.setProperty('--bg-panel', `hsla(${h}, ${sat}%, 98%, 0.95)`)
    root.style.setProperty('--bg-secondary', `hsl(${h}, ${sat}%, 92%)`)
    root.style.setProperty('--bg-card', `hsl(${h}, ${sat}%, 97%)`)
    root.style.setProperty('--bg-elevated', `hsl(${h}, ${sat}%, 99%)`)
    root.style.setProperty('--bg-input', `hsl(${h}, ${sat}%, 93%)`)
    root.style.setProperty('--bg-hover', `hsl(${h}, ${sat}%, 88%)`)
    root.style.setProperty('--border-subtle', `hsla(${h}, ${sat}%, 20%, 0.06)`)
    root.style.setProperty('--border-default', `hsla(${h}, ${sat}%, 20%, 0.1)`)
    root.style.setProperty('--border-strong', `hsla(${h}, ${sat}%, 20%, 0.18)`)
    root.style.setProperty('--border-color', `hsla(${h}, ${sat}%, 20%, 0.1)`)
    root.style.setProperty('--text-primary', 'hsla(0, 0%, 5%, 0.92)')
    root.style.setProperty('--text-secondary', 'hsla(0, 0%, 5%, 0.78)')
    root.style.setProperty('--text-muted', 'hsla(0, 0%, 5%, 0.62)')
    root.style.setProperty('--text-on-primary', '#ffffff')
    root.style.setProperty('--shadow-xs', '0 1px 2px hsla(0,0%,0%,0.05)')
    root.style.setProperty(
      '--shadow-sm',
      '0 1px 3px hsla(0,0%,0%,0.06), 0 1px 2px hsla(0,0%,0%,0.04)'
    )
    root.style.setProperty(
      '--shadow-md',
      '0 4px 12px hsla(0,0%,0%,0.06), 0 1px 3px hsla(0,0%,0%,0.04)'
    )
    root.style.setProperty(
      '--shadow-lg',
      '0 12px 32px hsla(0,0%,0%,0.08), 0 2px 6px hsla(0,0%,0%,0.04)'
    )
    root.classList.add('light-theme')
  } else {
    // ── 深色主题（深空质感 v8） ──
    const sat = s < 5 ? 0 : Math.max(Math.min(s, 50), 25)
    const bgDeepest = `hsl(${h}, ${sat * 0.6}%, 23%)`
    const bgBase = `hsl(${h}, ${sat * 0.6}%, 26%)`
    root.style.setProperty('--bg-deepest', bgDeepest)
    root.style.setProperty('--bg-base', bgBase)
    root.style.setProperty('--canvas-bg-deepest', bgDeepest)
    root.style.setProperty('--canvas-bg-base', bgBase)
    root.style.setProperty('--bg-panel', `hsla(${h}, ${sat * 0.5}%, 28%, 0.95)`)
    root.style.setProperty('--bg-secondary', `hsl(${h}, ${sat * 0.4}%, 30%)`)
    root.style.setProperty('--bg-card', `hsl(${h}, ${sat * 0.4}%, 32%)`)
    root.style.setProperty('--bg-elevated', `hsl(${h}, ${sat * 0.4}%, 37%)`)
    root.style.setProperty('--bg-input', `hsl(${h}, ${sat * 0.4}%, 24%)`)
    root.style.setProperty('--bg-hover', `hsla(${h}, ${sat * 0.3}%, 70%, 0.16)`)
    root.style.setProperty('--border-subtle', `hsla(${h}, ${sat * 0.3}%, 80%, 0.12)`)
    root.style.setProperty('--border-default', `hsla(${h}, ${sat * 0.3}%, 80%, 0.18)`)
    root.style.setProperty('--border-strong', `hsla(${h}, ${sat * 0.3}%, 80%, 0.28)`)
    root.style.setProperty('--border-color', `hsla(${h}, ${sat * 0.3}%, 80%, 0.18)`)
    root.style.setProperty('--text-primary', 'hsla(210, 15%, 97%, 0.95)')
    root.style.setProperty('--text-secondary', 'hsla(210, 10%, 95%, 0.78)')
    root.style.setProperty('--text-muted', 'hsla(210, 10%, 90%, 0.62)')
    root.style.setProperty('--text-on-primary', '#ffffff')
    root.style.setProperty('--shadow-xs', '0 1px 2px hsla(0,0%,0%,0.25)')
    root.style.setProperty(
      '--shadow-sm',
      '0 1px 3px hsla(0,0%,0%,0.18), 0 1px 2px hsla(0,0%,0%,0.20)'
    )
    root.style.setProperty(
      '--shadow-md',
      '0 4px 16px hsla(0,0%,0%,0.15), 0 1px 4px hsla(0,0%,0%,0.18)'
    )
    root.style.setProperty(
      '--shadow-lg',
      '0 12px 40px hsla(0,0%,0%,0.18), 0 2px 8px hsla(0,0%,0%,0.12)'
    )
    root.classList.remove('light-theme')
  }
}

// 独立画布背景色
export function applyCanvasBg(hex) {
  if (!hex) return
  const root = document.documentElement
  const safeHex = normalizeHex(hex)
  const [h, s, l] = hexToHsl(safeHex)
  root.style.setProperty('--canvas-bg-base', safeHex)
  root.style.setProperty('--canvas-bg-deepest', `hsl(${h}, ${s}%, ${Math.max(l - 3, 0)}%)`)
}

// 独立字体色 + 亮度
export function applyTextStyle(baseHex, brightness) {
  if (!baseHex) return
  const root = document.documentElement
  const safeHex = normalizeHex(baseHex)
  const safeBrightness = clamp(Number(brightness) || 95, 20, 100)
  const a1 = Math.round((safeBrightness / 100) * 255)
  const a2 = Math.round(a1 * 0.82)
  const a3 = Math.round(a1 * 0.66)
  const toHex = (v) => v.toString(16).padStart(2, '0')
  root.style.setProperty('--text-primary', `${safeHex}${toHex(a1)}`)
  root.style.setProperty('--text-secondary', `${safeHex}${toHex(a2)}`)
  root.style.setProperty('--text-muted', `${safeHex}${toHex(a3)}`)
}

// 独立组件色（一个基色自动派生全部层级）
export function applyComponentColor(hex) {
  if (!hex) return
  const root = document.documentElement
  const [h, s, l] = hexToHsl(hex)
  const sat = s < 5 ? 0 : Math.min(s, 50)
  root.style.setProperty('--bg-panel', `hsl(${h}, ${sat * 0.5}%, ${clamp(l + 2, 0, 100)}%)`)
  root.style.setProperty('--bg-secondary', `hsl(${h}, ${sat * 0.4}%, ${clamp(l + 4, 0, 100)}%)`)
  root.style.setProperty('--bg-card', `hsl(${h}, ${sat * 0.4}%, ${clamp(l + 6, 0, 100)}%)`)
  root.style.setProperty('--bg-elevated', `hsl(${h}, ${sat * 0.4}%, ${clamp(l + 11, 0, 100)}%)`)
  root.style.setProperty('--bg-input', `hsl(${h}, ${sat * 0.4}%, ${clamp(l - 2, 0, 100)}%)`)
  root.style.setProperty('--bg-hover', `hsla(${h}, ${sat * 0.3}%, ${clamp(l + 40, 0, 100)}%, 0.16)`)
  root.style.setProperty('--border-subtle', `hsla(${h}, ${sat * 0.3}%, 80%, 0.12)`)
  root.style.setProperty('--border-default', `hsla(${h}, ${sat * 0.3}%, 80%, 0.18)`)
  root.style.setProperty('--border-strong', `hsla(${h}, ${sat * 0.3}%, 80%, 0.28)`)
  root.style.setProperty('--border-color', `hsla(${h}, ${sat * 0.3}%, 80%, 0.18)`)
}

export function applyThemePreferences(state) {
  applyThemeColor(state.themeColor || DEFAULT_THEME_COLOR)
  if (state.componentBaseColor) applyComponentColor(state.componentBaseColor)
  if (state.canvasBgColor) applyCanvasBg(state.canvasBgColor)
  if (state.textBaseColor) applyTextStyle(state.textBaseColor, state.textBrightness)
}

export const createUiSlice = (set, get) => ({
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

  themeColor: '#33334d',
  setThemeColor: (color) => {
    set({ themeColor: color })
    applyThemePreferences({ ...get(), themeColor: color })
  },

  // RGB 自选配色
  canvasBgColor: '',
  setCanvasBgColor: (color) => {
    set({ canvasBgColor: color })
    if (color) applyCanvasBg(color)
    else applyThemePreferences({ ...get(), canvasBgColor: color })
  },
  textBaseColor: '',
  textBrightness: 95,
  setTextStyle: (color, brightness) => {
    set({ textBaseColor: color, textBrightness: brightness })
    if (color) applyTextStyle(color, brightness)
    else applyThemePreferences({ ...get(), textBaseColor: color, textBrightness: brightness })
  },
  componentBaseColor: '',
  setComponentBaseColor: (color) => {
    set({ componentBaseColor: color })
    if (color) applyComponentColor(color)
    else applyThemePreferences({ ...get(), componentBaseColor: color })
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
  cloudAssetsOpen: false,
  setCloudAssetsOpen: (cloudAssetsOpen) => set({ cloudAssetsOpen }),
  favoriteLibraryOpen: false,
  setFavoriteLibraryOpen: (favoriteLibraryOpen) => set({ favoriteLibraryOpen }),
  skillPanelOpen: false,
  setSkillPanelOpen: (skillPanelOpen) => set({ skillPanelOpen }),
  productionDeskOpen: false,
  setProductionDeskOpen: (productionDeskOpen) => set({ productionDeskOpen }),
  directorStageOpen: false,
  setDirectorStageOpen: (directorStageOpen) => set({ directorStageOpen }),

  // 自动化导入弹窗（全局状态，供 SkillPanel 和 Sidebar 共用）
  scriptImportOpen: false,
  setScriptImportOpen: (scriptImportOpen) => set({ scriptImportOpen }),
  characterImportOpen: false,
  setCharacterImportOpen: (characterImportOpen) => set({ characterImportOpen }),
  sceneImportOpen: false,
  setSceneImportOpen: (sceneImportOpen) => set({ sceneImportOpen }),

  // 全局灯箱（Lightbox）状态 — 统一管理所有组件的灯箱
  lightboxItem: null,
  setLightboxItem: (lightboxItem) => set({ lightboxItem }),
  closeLightbox: () => set({ lightboxItem: null }),

  // ══ Sprint 2: 项目管理画廊 ══
  projectGalleryOpen: false,
  setProjectGalleryOpen: (projectGalleryOpen) => set({ projectGalleryOpen }),

  // ══ Sprint 2: 浮动 AI 气泡 ══
  aiBubbleOpen: false,
  setAiBubbleOpen: (aiBubbleOpen) => set({ aiBubbleOpen }),

  // ══ Sprint 3: 批量生产板 ══
  activeWorkspacePage: 'assistant',
  setActiveWorkspacePage: (activeWorkspacePage) =>
    set({
      activeWorkspacePage,
      productionBoardOpen: activeWorkspacePage === 'production'
    }),
  productionBoardOpen: false,
  setProductionBoardOpen: (productionBoardOpen) =>
    set({
      productionBoardOpen,
      activeWorkspacePage: productionBoardOpen ? 'production' : 'canvas'
    }),
  productionBoardMode: 'video',
  setProductionBoardMode: (productionBoardMode) => set({ productionBoardMode }),
  productionBoardInitCount: 0,
  setProductionBoardInitCount: (n) => set({ productionBoardInitCount: n }),
  productionBoardInitData: null, // [{ prompt }] 从剧本导入的镜头数据
  setProductionBoardInitData: (data) => set({ productionBoardInitData: data }),
  // 视频模式行数据
  productionBoardVideoRows: null,
  setProductionBoardVideoRows: (rows) => set({ productionBoardVideoRows: rows }),
  productionBoardVideoCommonValues: null,
  setProductionBoardVideoCommonValues: (v) => set({ productionBoardVideoCommonValues: v }),
  // 图片模式行数据
  productionBoardImageRows: null,
  setProductionBoardImageRows: (rows) => set({ productionBoardImageRows: rows }),
  productionBoardImageCommonValues: null,
  setProductionBoardImageCommonValues: (v) => set({ productionBoardImageCommonValues: v }),
  // 共享参考数据（视频/图片板互通）
  productionBoardSharedRefs: null, // { refCharacters, refProps, refScenes, assetIds }
  setProductionBoardSharedRefs: (v) => set({ productionBoardSharedRefs: v }),
  // 兼容旧接口 — 根据当前 mode 自动路由
  productionBoardRows: null,
  setProductionBoardRows: (rows) => set({ productionBoardRows: rows }),
  productionBoardCommonValues: null,
  setProductionBoardCommonValues: (v) => set({ productionBoardCommonValues: v }),

  // ══ Sprint 4: 任务看板 ══
  kanbanOpen: false,
  setKanbanOpen: (kanbanOpen) => set({ kanbanOpen }),

  // ══ Sprint 5: 无人值守模式 ══
  unattendedMode: null, // { active, phase, config, startTime, progress }
  setUnattendedMode: (v) => set({ unattendedMode: v })
})
