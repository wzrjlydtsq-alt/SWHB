/**
 * 星河智绘 — Electron IPC 通道类型声明
 *
 * 基于 preload/index.js 的 57 个 IPC 通道定义
 */

// ========== 数据库 API ==========

export interface DbProjectsAPI {
  list: () => Promise<DbProject[]>
  get: (id: string) => Promise<DbProject | null>
  save: (project: DbProject) => Promise<void>
  delete: (id: string) => Promise<void>
}

export interface DbNodesAPI {
  list: (projectId: string) => Promise<DbNodeRow[]>
  save: (node: DbNodeRow, projectId: string) => Promise<void>
  saveBatch: (nodes: DbNodeRow[], projectId: string) => Promise<void>
  delete: (id: string) => Promise<void>
  deleteByProject: (projectId: string) => Promise<void>
}

export interface DbConnectionsAPI {
  list: (projectId: string) => Promise<DbConnectionRow[]>
  save: (connection: DbConnectionRow, projectId: string) => Promise<void>
  saveBatch: (connections: DbConnectionRow[], projectId: string) => Promise<void>
  delete: (id: string) => Promise<void>
  deleteByProject: (projectId: string) => Promise<void>
}

export interface DbHistoryAPI {
  list: (projectId: string, limit?: number) => Promise<DbHistoryRow[]>
  listAll: (limit?: number) => Promise<DbHistoryRow[]>
  save: (item: DbHistoryRow, projectId: string) => Promise<void>
  saveBatch: (items: DbHistoryRow[], projectId: string) => Promise<void>
  delete: (id: string) => Promise<void>
}

export interface DbSettingsAPI {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string) => Promise<void>
  delete: (key: string) => Promise<void>
  getAll: () => Promise<Array<{ key: string; value: string }>>
  setBatch: (entries: Array<{ key: string; value: string }>) => Promise<void>
}

export interface DbMaintenanceAPI {
  cleanup: () => Promise<void>
}

/** 完整的 dbAPI 接口 */
export interface DbAPI {
  projects: DbProjectsAPI
  nodes: DbNodesAPI
  connections: DbConnectionsAPI
  history: DbHistoryAPI
  settings: DbSettingsAPI
  maintenance: DbMaintenanceAPI
}

// ========== 数据库行类型 ==========

export interface DbProject {
  id: string
  name: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface DbNodeRow {
  id: string
  type: string
  data?: string | Record<string, any>
  settings?: string | Record<string, any>
  [key: string]: any
}

export interface DbConnectionRow {
  id: string
  from: string
  to: string
  [key: string]: unknown
}

export interface DbHistoryRow {
  id: string
  data?: string
  [key: string]: unknown
}

// ========== 缓存 API ==========

export interface LocalCacheAPI {
  ping: (data?: Record<string, unknown>) => Promise<Record<string, unknown>>
  config: (
    newConfig: Record<string, unknown>
  ) => Promise<{ success: boolean; config?: Record<string, unknown>; error?: string }>
  openDirectory: (
    currentPath?: string
  ) => Promise<{ success: boolean; path?: string; error?: string }>
  openFiles: (
    options?: Record<string, unknown>
  ) => Promise<{ success: boolean; paths?: string[]; error?: string }>
  saveThumbnail: (
    data: Record<string, unknown>
  ) => Promise<{ success: boolean; url?: string; path?: string; error?: string }>
  saveCache: (
    data: Record<string, unknown>
  ) => Promise<{ success: boolean; url?: string; path?: string; error?: string }>
  downloadUrl: (
    data: Record<string, unknown>
  ) => Promise<{ success: boolean; url?: string; path?: string; thumbPath?: string | null; error?: string }>
  checkCache: (
    data: Record<string, unknown>
  ) => Promise<{ exists: boolean; path?: string; url?: string; error?: string }>
  getStats: (data?: { projectId?: string; cacheRoot?: string }) => Promise<{
    success: boolean
    totals?: Record<string, { count: number; size: number }>
    orphan?: { count: number; size: number }
    currentProject?: {
      id?: string
      name?: string
      count?: number
      size?: number
      cacheRoot?: string
    } | null
    projectSizes?: Array<{ id: string; name?: string; count: number; size: number }>
    policy?: { limitMb: number; limitBytes: number } | null
    error?: string
  }>
  diagnose: (data?: { projectId?: string }) => Promise<{
    success: boolean
    orphan?: { count: number; size: number }
    missingCacheRefCount?: number
    missingLocalRefCount?: number
    missingCacheRefs?: string[]
    missingLocalRefs?: string[]
    error?: string
  }>
  cleanup: (
    data: Record<string, unknown>
  ) => Promise<{ success: boolean; deletedFiles?: number; freedBytes?: number; error?: string }>
  clearProjectCache: (
    projectId: string
  ) => Promise<{ success: boolean; deletedFiles?: number; freedBytes?: number; error?: string }>
  policy: (data?: { limitMb?: number } | null) => Promise<{
    success: boolean
    policy?: { limitMb: number; limitBytes: number }
    error?: string
  }>
  deleteBatch: (data: {
    paths?: string[]
    files?: string[]
  }) => Promise<{ success: boolean; results?: Record<string, unknown>[]; error?: string }>
  deleteProject: (
    projectId: string
  ) => Promise<{ success: boolean; deletedFiles?: number; freedBytes?: number; error?: string }>
  clearGenerated: (data?: Record<string, unknown>) => Promise<{
    success: boolean
    deletedFiles?: number
    freedBytes?: number
    error?: string
  }>
  clearHistory: () => Promise<{ success: boolean; changes?: number; error?: string }>
  showItemInFolder: (path: string) => Promise<{ success: boolean; error?: string }>
  saveFileAs: (
    sourcePath: string,
    defaultName: string
  ) => Promise<{ success: boolean; path?: string; error?: string }>
  concatVideos: (
    videoPaths: string[],
    outputName: string,
    cacheContext?: Record<string, unknown>
  ) => Promise<{ success: boolean; path?: string; error?: string }>
}

// ========== 引擎 API ==========

export interface EngineAPI {
  submitTask: (payload: import('./task').TaskPayload) => Promise<{
    success?: boolean
    taskId?: string
    error?: string
    [key: string]: unknown
  }>
  cancelTask: (taskId: string) => Promise<void>
  getStatus: () => Promise<Record<string, unknown>>
  onTaskUpdated: (callback: (update: import('./task').TaskUpdate) => void) => () => void
}

// ========== 更新器 API ==========

export interface UpdaterAPI {
  onMessage: (callback: (message: unknown) => void) => () => void
  checkForUpdates: (options?: {
    manual?: boolean
  }) => Promise<{ success: boolean; result?: unknown; error?: string }>
  downloadUpdate: () => Promise<void>
  preflightCheck: (options?: {
    repair?: boolean
  }) => Promise<{ success: boolean; ok?: boolean; checks?: unknown[]; repairs?: unknown[]; error?: string }>
  quitAndInstall: () => Promise<void>
  clearAndInstall: () => Promise<void>
}

// ========== 安全存储 API ==========

export interface SafeStorageAPI {
  isAvailable: () => Promise<boolean>
  encrypt: (plainText: string) => Promise<string>
  decrypt: (base64Cipher: string) => Promise<string>
}

// ========== 监控 API ==========

export interface MonitorAPI {
  getStats: () => Promise<{
    cpu?: number
    memory?: { used: number; total: number }
    gpu?: unknown
    [key: string]: unknown
  }>
}

// ========== 缩略图 API ==========

export interface DiagnosticsAPI {
  drainMainEvents: () => Promise<unknown[]>
  createReport: () => Promise<{ success: boolean; text?: string; error?: string }>
  migrationStatus: () => Promise<{
    success: boolean
    currentDataVersion?: string | null
    targetDataVersion?: string
    lastResult?: Record<string, unknown> | null
    latestBackupDir?: string | null
    error?: string
  }>
  healthCheck: (options?: { repair?: boolean; projectId?: string | null }) => Promise<{
    success: boolean
    status?: 'ok' | 'warn' | 'error'
    mode?: 'check' | 'repair'
    appVersion?: string
    pendingUpdate?: {
      fromVersion?: string
      toVersion?: string
      detectedAt?: string
    } | null
    issues?: Array<{
      severity: 'info' | 'warn' | 'error'
      code: string
      title: string
      detail?: string
      fixable?: boolean
      resolved?: boolean
    }>
    repairs?: Array<{
      code: string
      title: string
      detail?: string
    }>
    summary?: {
      checkedProjects?: number
      invalidProjectFiles?: number
      repairedProjects?: number
      copiedLegacyCacheFiles?: number
      rewrittenLegacyCacheRefs?: number
      missingLegacyCacheFiles?: number
      deletedOrphanCacheFiles?: number
      freedOrphanCacheBytes?: number
      databaseCleanupChanges?: number
      missingCacheRefCount?: number
      missingLocalRefCount?: number
      issueCount?: number
      unresolvedIssueCount?: number
      repairCount?: number
      fixableIssueCount?: number
    }
    error?: string
    [key: string]: unknown
  }>
  exportPackage: () => Promise<{ success: boolean; path?: string; copied?: unknown[]; error?: string }>
}

export interface ProjectFileAPI {
  save: (
    id: string,
    data: Record<string, unknown>
  ) => Promise<{ success: boolean; path?: string; error?: string; [key: string]: unknown }>
  load: (id: string) => Promise<Record<string, unknown> | null>
  list: () => Promise<Array<Record<string, unknown>>>
  importLocal: (options?: { folderId?: string | null }) => Promise<{
    success: boolean
    canceled?: boolean
    project?: Record<string, unknown>
    path?: string
    sourcePath?: string
    duplicatedId?: boolean
    error?: string
  }>
  delete: (id: string) => Promise<{ success: boolean; error?: string }>
  repair: (id: string) => Promise<{
    success: boolean
    projectId?: string
    copiedLegacyCacheFiles?: number
    rewrittenLegacyCacheRefs?: number
    missingLegacyCacheFiles?: number
    error?: string
    [key: string]: unknown
  }>
  saveSync: (
    id: string,
    data: Record<string, unknown>
  ) => { success: boolean; path?: string; error?: string; [key: string]: unknown }
}

export interface FsAPI {
  readTextFile: (
    filePath: string
  ) => Promise<{ success: boolean; content?: string; error?: string }>
  listDirectory: (
    dirPath: string,
    filter?: unknown
  ) => Promise<{ success: boolean; files?: unknown[]; error?: string }>
  readImagesAsPaths: (
    dirPath: string
  ) => Promise<{ success: boolean; paths?: string[]; error?: string }>
  writeTextFile: (payload: {
    filePath: string
    content?: string
    append?: boolean
    createDirs?: boolean
  }) => Promise<{ success: boolean; path?: string; size?: number; error?: string }>
  saveTextFileAs: (payload: {
    content: string
    defaultName?: string
    filters?: Array<{ name: string; extensions: string[] }>
  }) => Promise<{
    success: boolean
    canceled?: boolean
    path?: string
    size?: number
    error?: string
  }>
  copyPath: (payload: {
    sourcePath: string
    targetPath: string
    overwrite?: boolean
  }) => Promise<{ success: boolean; sourcePath?: string; targetPath?: string; error?: string }>
  movePath: (payload: {
    sourcePath: string
    targetPath: string
    overwrite?: boolean
  }) => Promise<{ success: boolean; sourcePath?: string; targetPath?: string; error?: string }>
  deletePath: (payload: { targetPath: string; recursive?: boolean }) => Promise<{
    success: boolean
    path?: string
    missing?: boolean
    deletedDirectory?: boolean
    error?: string
  }>
  makeDirectory: (payload: {
    dirPath: string
  }) => Promise<{ success: boolean; path?: string; error?: string }>
  openPath: (targetPath: string) => Promise<{ success: boolean; path?: string; error?: string }>
  runCommand: (payload: { command: string; cwd?: string; timeoutMs?: number }) => Promise<{
    success: boolean
    code?: number
    signal?: string
    stdout?: string
    stderr?: string
    truncated?: boolean
    error?: string
  }>
}

export interface TerminalAPI {
  start: (payload?: {
    cwd?: string
    shell?: string
    command?: string
  }) => Promise<{ success: boolean; session?: Record<string, unknown>; error?: string }>
  input: (id: string, input: string) => Promise<{ success: boolean; error?: string }>
  stop: (id: string) => Promise<{ success: boolean; error?: string }>
  list: () => Promise<{
    success: boolean
    sessions?: Array<Record<string, unknown>>
    error?: string
  }>
  onUpdate: (callback: (update: Record<string, unknown>) => void) => () => void
}

export interface ThumbnailAPI {
  generate: (
    filePath: string,
    size?: number
  ) => Promise<{ success: boolean; thumbPath?: string; error?: string }>
  getVideo: (src: string) => Promise<{
    success: boolean
    thumbPath?: string
    width?: number
    height?: number
    error?: string
  }>
  saveVideo: (
    src: string,
    content: ArrayBuffer | Uint8Array | string,
    metadata?: { width?: number; height?: number }
  ) => Promise<{ success: boolean; thumbPath?: string; error?: string }>
}

// ========== 窗口 API ==========

export interface WindowAPI {
  focusFix: () => Promise<void>
  writeClipboardText: (text: string) => Promise<{ success: boolean; error?: string }>
  openExternal: (url: string) => Promise<{ success: boolean; url?: string; error?: string }>
  inspectUrl: (url: string) => Promise<{
    success: boolean
    url?: string
    finalUrl?: string
    status?: number
    ok?: boolean
    contentType?: string
    title?: string
    snippet?: string
    error?: string
  }>
  captureUrlScreenshot: (url: string) => Promise<{
    success: boolean
    url?: string
    screenshotPath?: string
    width?: number
    height?: number
    error?: string
  }>
  inspectUrlDom: (url: string) => Promise<{
    success: boolean
    url?: string
    title?: string
    heading?: string
    textSnippet?: string
    elements?: Array<{
      selector: string
      tag: string
      role?: string
      type?: string
      text?: string
      ariaLabel?: string
      title?: string
      href?: string
      rect?: { x: number; y: number; width: number; height: number }
    }>
    error?: string
  }>
  clickUrlSelector: (payload: { url: string; selector?: string; text?: string }) => Promise<{
    success: boolean
    url?: string
    finalUrl?: string
    title?: string
    target?: {
      tag?: string
      text?: string
      ariaLabel?: string
      href?: string
      rect?: { x: number; y: number; width: number; height: number }
    }
    screenshotPath?: string
    error?: string
  }>
  captureUrlViewportMatrix: (payload: {
    url: string
    viewports?: Array<{ name?: string; width: number; height: number }>
  }) => Promise<{
    success: boolean
    url?: string
    captures?: Array<{
      name: string
      width: number
      height: number
      url?: string
      title?: string
      screenshotPath: string
    }>
    error?: string
  }>
  annotateUrlScreenshot: (payload: {
    url: string
    selectors?: string[]
    texts?: string[]
    width?: number
    height?: number
  }) => Promise<{
    success: boolean
    url?: string
    finalUrl?: string
    title?: string
    annotations?: Array<{
      index: number
      label?: string
      text?: string
      rect?: { x: number; y: number; width: number; height: number }
    }>
    screenshotPath?: string
    error?: string
  }>
  inspectUrlConsole: (payload: {
    url: string
    width?: number
    height?: number
    limit?: number
    timeoutMs?: number
  }) => Promise<{
    success: boolean
    url?: string
    finalUrl?: string
    title?: string
    readyState?: string
    consoleMessages?: Array<{
      level?: number
      message?: string
      line?: number
      sourceId?: string
    }>
    severeMessages?: Array<{
      level?: number
      message?: string
      line?: number
      sourceId?: string
    }>
    loadFailures?: Array<{
      errorCode?: number
      errorDescription?: string
      url?: string
      isMainFrame?: boolean
    }>
    crashes?: Array<Record<string, unknown>>
    pageErrors?: Array<{
      message?: string
      source?: string
      line?: number
      column?: number
    }>
    textSnippet?: string
    error?: string
  }>
  fillUrlForm: (payload: {
    url: string
    fields: Array<{
      selector?: string
      label?: string
      name?: string
      placeholder?: string
      value: string | number | boolean
    }>
    submit?: boolean
    submitSelector?: string
    submitText?: string
  }) => Promise<{
    success: boolean
    url?: string
    finalUrl?: string
    title?: string
    filled?: Array<{ selector?: string; label?: string; tag?: string; type?: string }>
    missing?: Array<{ selector?: string; label?: string }>
    submitted?: boolean
    screenshotPath?: string
    error?: string
  }>
  startBrowserSession: (payload: {
    url: string
    sessionId?: string
    width?: number
    height?: number
    persistProfile?: boolean
  }) => Promise<{
    success: boolean
    sessionId?: string
    sessionProfile?: string
    sessionPersisted?: boolean
    url?: string
    title?: string
    error?: string
  }>
  importBrowserCookies: (payload: {
    sessionId?: string
    cookies: any[] | { cookies?: any[]; data?: any[] }
  }) => Promise<{
    success: boolean
    sessionId?: string
    sessionProfile?: string
    imported?: number
    failed?: number
    failures?: Array<{ name?: string; domain?: string; error?: string }>
    error?: string
  }>
  listBrowserProfiles: () => Promise<{
    success: boolean
    profiles?: Array<{
      browser: string
      name: string
      profilePath: string
      rootPath: string
      hasCookiesDb?: boolean
      hasLocalStorage?: boolean
      hasExtensions?: boolean
    }>
    error?: string
  }>
  importBrowserProfileCookies: (payload: {
    sessionId?: string
    profilePath: string
    domain?: string
    limit?: number
  }) => Promise<{
    success: boolean
    sessionId?: string
    sessionProfile?: string
    sourceProfile?: {
      browser: string
      name: string
      profilePath: string
      rootPath: string
    }
    imported?: number
    failed?: number
    failures?: Array<{ name?: string; domain?: string; error?: string }>
    error?: string
  }>
  inspectBrowserSessionDom: (payload: { sessionId: string; limit?: number }) => Promise<{
    success: boolean
    sessionId?: string
    url?: string
    title?: string
    heading?: string
    textSnippet?: string
    elements?: Array<{
      selector: string
      tag: string
      role?: string
      type?: string
      text?: string
      ariaLabel?: string
      title?: string
      href?: string
      rect?: { x: number; y: number; width: number; height: number }
    }>
    error?: string
  }>
  inspectBrowserSessionConsole: (payload: { sessionId: string; limit?: number }) => Promise<{
    success: boolean
    sessionId?: string
    url?: string
    title?: string
    readyState?: string
    consoleMessages?: Array<{
      level?: number
      message?: string
      line?: number
      sourceId?: string
      at?: string
    }>
    severeMessages?: Array<{
      level?: number
      message?: string
      line?: number
      sourceId?: string
      at?: string
    }>
    loadFailures?: Array<{
      errorCode?: number
      errorDescription?: string
      url?: string
      isMainFrame?: boolean
      at?: string
    }>
    crashes?: Array<Record<string, unknown>>
    textSnippet?: string
    error?: string
  }>
  captureBrowserSessionScreenshot: (payload: { sessionId: string }) => Promise<{
    success: boolean
    sessionId?: string
    url?: string
    title?: string
    screenshotPath?: string
    error?: string
  }>
  clickBrowserSessionElement: (payload: {
    sessionId: string
    selector?: string
    text?: string
    waitMs?: number
  }) => Promise<{
    success: boolean
    sessionId?: string
    url?: string
    title?: string
    target?: {
      tag?: string
      text?: string
      href?: string
      rect?: { x: number; y: number; width: number; height: number }
    }
    screenshotPath?: string
    error?: string
  }>
  fillBrowserSessionForm: (payload: {
    sessionId: string
    fields: Array<{
      selector?: string
      label?: string
      name?: string
      placeholder?: string
      value: string | number | boolean
    }>
    submit?: boolean
    submitSelector?: string
    submitText?: string
  }) => Promise<{
    success: boolean
    sessionId?: string
    url?: string
    title?: string
    filled?: Array<{ selector?: string; label?: string; tag?: string; type?: string }>
    missing?: Array<{ selector?: string; label?: string }>
    submitted?: boolean
    screenshotPath?: string
    error?: string
  }>
  closeBrowserSession: (payload: {
    sessionId: string
  }) => Promise<{ success: boolean; sessionId?: string; url?: string; error?: string }>
  capturePage: () => Promise<string | null>
  captureThumbnail: () => Promise<string | null>
}

// ========== OSS API ==========

export interface OssAPI {
  getConfig: () => Promise<{
    success: boolean
    configured?: boolean
    storedConfigured?: boolean
    envConfigured?: boolean
    safeStorageAvailable?: boolean
    source?: 'settings' | 'environment' | 'none'
    accessKeyIdMasked?: string
    region?: string
    bucket?: string
    endpoint?: string
    publicUrl?: string
    updatedAt?: string | null
    error?: string
  }>
  saveConfig: (payload: {
    accessKeyId?: string
    accessKeySecret?: string
    region?: string
    bucket?: string
    endpoint?: string
    publicUrl?: string
  }) => Promise<{
    success: boolean
    configured?: boolean
    storedConfigured?: boolean
    error?: string
  }>
  clearConfig: () => Promise<{ success: boolean; configured?: boolean; error?: string }>
  uploadFile: (localPath: string) => Promise<{ success: boolean; url?: string; error?: string }>
}

// ========== Seedance Asset API ==========

export interface SeedanceAsset {
  id: string
  name: string
  url: string
  status: 'Processing' | 'Active' | 'Failed' | 'Unknown'
  groupId: string
  assetType: string
  error?: { Code: string; Message: string } | null
  createTime: string
  updateTime: string
}

export interface AssetAPI {
  getConfig: () => Promise<{
    success: boolean
    configured?: boolean
    storedConfigured?: boolean
    safeStorageAvailable?: boolean
    source?: 'settings' | 'none'
    accessKeyIdMasked?: string
    updatedAt?: string | null
    error?: string
  }>
  saveConfig: (payload: {
    accessKeyId?: string
    accessKeySecret?: string
  }) => Promise<{
    success: boolean
    configured?: boolean
    storedConfigured?: boolean
    error?: string
  }>
  clearConfig: () => Promise<{ success: boolean; configured?: boolean; error?: string }>
  createGroup: (name: string, description?: string) => Promise<{ id: string }>
  getDefaultGroup: () => Promise<{ id: string }>
  getGroup: (groupId: string) => Promise<Record<string, unknown>>
  listGroups: (
    page?: number,
    pageSize?: number
  ) => Promise<{ items: Record<string, unknown>[]; totalCount: number }>
  updateGroup: (groupId: string, name?: string, description?: string) => Promise<{ id: string }>
  create: (
    imageUrl: string,
    name?: string,
    groupId?: string
  ) => Promise<{ id: string; groupId: string }>
  get: (assetId: string) => Promise<SeedanceAsset>
  poll: (assetId: string, intervalMs?: number, timeoutMs?: number) => Promise<SeedanceAsset>
  list: (
    groupId?: string,
    page?: number,
    pageSize?: number,
    statuses?: string[]
  ) => Promise<{ items: SeedanceAsset[]; totalCount: number }>
  update: (assetId: string, name: string) => Promise<{ id: string }>
}

// ========== 主 API 接口 ==========

export interface AppAPI {
  invoke: (channel: string, data?: unknown) => Promise<any>
  on: (channel: string, callback: (data: unknown) => void) => () => void
  promptPilot: PromptPilotAPI
  localCacheAPI: LocalCacheAPI
  engineAPI: EngineAPI
  updater: UpdaterAPI
  safeStorageAPI: SafeStorageAPI
  monitorAPI: MonitorAPI
  diagnosticsAPI: DiagnosticsAPI
  thumbnailAPI: ThumbnailAPI
  ossAPI: OssAPI
  assetAPI: AssetAPI
  windowAPI: WindowAPI
  videoAPI: VideoAPI
  vodAITranslation: VodAITranslationAPI
  fsAPI: FsAPI
  terminalAPI: TerminalAPI
  projectFileAPI: ProjectFileAPI
}

export interface PromptPilotAPI {
  run: (payload: {
    mode: 'generate' | 'optimize' | 'check'
    text: string
    context?: Record<string, unknown>
  }) => Promise<{
    success: boolean
    mode?: 'generate' | 'optimize' | 'check'
    text?: string
    model?: string
    error?: string
  }>
}

export interface VideoAPI {
  eraseSubtitle: (
    videoUrl: string,
    apiKey: string
  ) => Promise<{ success: boolean; resultUrl?: string; error?: string }>
}

export interface VodAITranslationAPI {
  status: () => Promise<VodCredentialStatus>
  getConfig: () => Promise<VodCredentialStatus>
  saveConfig: (payload: {
    accessKeyId: string
    secretAccessKey: string
    region?: string
    spaceName?: string
  }) => Promise<VodCredentialStatus>
  clearConfig: () => Promise<VodCredentialStatus>
  submitWorkflow: (payload: Record<string, unknown>) => Promise<VodAPIResult>
  getProject: (payload: Record<string, unknown>) => Promise<VodAPIResult>
  listProject: (payload: Record<string, unknown>) => Promise<VodAPIResult>
  updateUtterances: (payload: Record<string, unknown>) => Promise<VodAPIResult>
  continueWorkflow: (payload: Record<string, unknown>) => Promise<VodAPIResult>
  refreshProject: (payload: Record<string, unknown>) => Promise<VodAPIResult>
  uploadMediaByUrl: (payload: Record<string, unknown>) => Promise<VodAPIResult>
  queryUploadTask: (payload: Record<string, unknown>) => Promise<VodAPIResult>
}

export interface VodCredentialStatus {
  success: boolean
  configured?: boolean
  storedConfigured?: boolean
  envConfigured?: boolean
  safeStorageAvailable?: boolean
  source?: 'settings' | 'environment' | 'none'
  accessKeyIdMasked?: string
  region?: string
  spaceName?: string
  updatedAt?: string | null
  error?: string
}

export interface VodAPIResult {
  success: boolean
  configured?: boolean
  status?: number
  code?: string
  error?: string
  data?: Record<string, unknown>
  result?: Record<string, unknown> | null
}

// ========== Window 全局扩展 ==========

declare global {
  interface Window {
    /** Electron API（由 @electron-toolkit/preload 提供） */
    electron: typeof import('@electron-toolkit/preload').electronAPI
    /** 应用自定义 API */
    api: AppAPI
    /** 数据库 API */
    dbAPI: DbAPI
    /** HMR 时保持 React root 引用 */
    __react_root?: import('react-dom/client').Root
    __tapnowPerf?: {
      edges?: number
      hiddenEdges?: number
      visibleEdges?: number
      nodes?: number
      [key: string]: unknown
    }
  }

  interface File {
    path?: string
  }
}
