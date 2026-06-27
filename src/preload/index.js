import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// ========== IPC 通道白名单 ==========
const ALLOWED_CHANNELS = [
  'cache:ping',
  'cache:config',
  'cache:openDirectory',
  'cache:openFiles',
  'cache:save-thumbnail',
  'cache:save-cache',
  'cache:copy-file',
  'clipboard:copy-image',
  'cache:check',
  'cache:stats',
  'cache:diagnose',
  'cache:cleanup',
  'cache:clear-project-cache',
  'cache:policy',
  'cache:delete-batch',
  'cache:delete-project',
  'cache:clear-generated',
  'cache:clear-history',
  'cache:download-url',
  'system:show-item-in-folder',
  'system:clipboard-write-text',
  'system:open-external',
  'system:inspect-url',
  'system:capture-url-screenshot',
  'system:inspect-url-dom',
  'system:click-url-selector',
  'system:capture-url-viewport-matrix',
  'system:annotate-url-screenshot',
  'system:inspect-url-console',
  'system:fill-url-form',
  'system:start-browser-session',
  'system:import-browser-cookies',
  'system:list-browser-profiles',
  'system:import-browser-profile-cookies',
  'system:inspect-browser-session-dom',
  'system:inspect-browser-session-console',
  'system:capture-browser-session-screenshot',
  'system:click-browser-session-element',
  'system:fill-browser-session-form',
  'system:close-browser-session',
  'system:save-file-as',
  'system:save-text-file-as',
  'system:concat-videos',
  'system:migration-status',
  'system:health-check',
  'engine:submit-task',
  'engine:cancel-task',
  'engine:get-status',
  'video:erase-subtitle',
  'vod:ai-translation:status',
  'vod:ai-translation:get-config',
  'vod:ai-translation:save-config',
  'vod:ai-translation:clear-config',
  'vod:ai-translation:submit-workflow',
  'vod:ai-translation:get-project',
  'vod:ai-translation:list-project',
  'vod:ai-translation:update-utterances',
  'vod:ai-translation:continue-workflow',
  'vod:ai-translation:refresh-project',
  'vod:ai-translation:upload-media-by-url',
  'vod:ai-translation:query-upload-task',
  'db:projects:list',
  'db:projects:get',
  'db:projects:save',
  'db:projects:delete',
  'db:nodes:list',
  'db:nodes:save',
  'db:nodes:saveBatch',
  'db:nodes:delete',
  'db:nodes:deleteByProject',
  'db:connections:list',
  'db:connections:save',
  'db:connections:saveBatch',
  'db:connections:delete',
  'db:connections:deleteByProject',
  'db:history:list',
  'db:history:listAll',
  'db:history:save',
  'db:history:saveBatch',
  'db:history:delete',
  'db:settings:get',
  'db:settings:set',
  'db:settings:delete',
  'db:settings:getAll',
  'db:settings:setBatch',
  'db:maintenance:cleanup',
  'safeStorage:isAvailable',
  'safeStorage:encrypt',
  'safeStorage:decrypt',
  'updater-check',
  'updater-download',
  'updater-preflight-check',
  'updater-quit-install',
  'updater-clear-and-install',
  'auth:open-platform-login',
  'cloud:request',
  'cloud-request',
  'promptpilot:run',
  'monitor:get-stats',
  'thumbnail:generate',
  'thumbnail:get-video',
  'thumbnail:save-video',
  'window:focus-fix',
  'window:capture-page',
  'window:capture-thumbnail',
  'renderer-log',
  'diagnostics:drain-main-events',
  'diagnostics:create-report',
  'diagnostics:export-package',
  'oss:get-config',
  'oss:save-config',
  'oss:clear-config',
  'oss:upload-file',
  'asset:get-config',
  'asset:save-config',
  'asset:clear-config',
  'asset:create-group',
  'asset:get-default-group',
  'asset:get-group',
  'asset:list-groups',
  'asset:update-group',
  'asset:create',
  'asset:get',
  'asset:poll',
  'asset:list',
  'asset:update',
  'fs:read-text-file',
  'fs:list-directory',
  'fs:read-images-as-paths',
  'fs:write-text-file',
  'fs:copy-path',
  'fs:move-path',
  'fs:delete-path',
  'fs:make-directory',
  'fs:open-path',
  'fs:run-command',
  'terminal:start',
  'terminal:input',
  'terminal:stop',
  'terminal:list',
  'feishu:get-config',
  'feishu:save-config',
  'feishu:get-status',
  'feishu:test-connection',
  'feishu:disconnect',
  'feishu:reply-message',
  'feishu:push-message',
  'feishu:list-chats',
  'project:save',
  'project:load',
  'project:list',
  'project:import-local',
  'project:delete',
  'project:repair'
]

// 白名单校验的 invoke 包装
function safeInvoke(channel, data) {
  if (!ALLOWED_CHANNELS.includes(channel)) {
    return Promise.reject(new Error(`IPC channel not allowed: ${channel}`))
  }
  return ipcRenderer.invoke(channel, data)
}

// ========== 监听通道白名单 ==========
const ALLOWED_ON_CHANNELS = [
  'engine:task-update',
  'updater-message',
  'auth:platform-callback',
  'feishu:incoming-message',
  'terminal:update'
]

function safeOn(channel, callback) {
  if (!ALLOWED_ON_CHANNELS.includes(channel)) {
    console.error(`IPC on channel not allowed: ${channel}`)
    return () => {}
  }
  const handler = (event, args) => callback(args)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

// ========== 公共 API 定义（消除重复） ==========

function createDbAPI() {
  return {
    // 项目
    projects: {
      list: () => ipcRenderer.invoke('db:projects:list'),
      get: (id) => ipcRenderer.invoke('db:projects:get', id),
      save: (project) => ipcRenderer.invoke('db:projects:save', project),
      delete: (id) => ipcRenderer.invoke('db:projects:delete', id)
    },
    // 节点
    nodes: {
      list: (projectId) => ipcRenderer.invoke('db:nodes:list', projectId),
      save: (node, projectId) => ipcRenderer.invoke('db:nodes:save', { node, projectId }),
      saveBatch: (nodes, projectId) =>
        ipcRenderer.invoke('db:nodes:saveBatch', { nodes, projectId }),
      delete: (id) => ipcRenderer.invoke('db:nodes:delete', id),
      deleteByProject: (projectId) => ipcRenderer.invoke('db:nodes:deleteByProject', projectId)
    },
    // 连接
    connections: {
      list: (projectId) => ipcRenderer.invoke('db:connections:list', projectId),
      save: (connection, projectId) =>
        ipcRenderer.invoke('db:connections:save', { connection, projectId }),
      saveBatch: (connections, projectId) =>
        ipcRenderer.invoke('db:connections:saveBatch', { connections, projectId }),
      delete: (id) => ipcRenderer.invoke('db:connections:delete', id),
      deleteByProject: (projectId) =>
        ipcRenderer.invoke('db:connections:deleteByProject', projectId)
    },
    // 历史
    history: {
      list: (projectId, limit) => ipcRenderer.invoke('db:history:list', { projectId, limit }),
      listAll: (limit) => ipcRenderer.invoke('db:history:listAll', limit),
      save: (item, projectId) => ipcRenderer.invoke('db:history:save', { item, projectId }),
      saveBatch: (items, projectId) =>
        ipcRenderer.invoke('db:history:saveBatch', { items, projectId }),
      delete: (id) => ipcRenderer.invoke('db:history:delete', id)
    },
    // 设置 KV
    settings: {
      get: (key) => ipcRenderer.invoke('db:settings:get', key),
      set: (key, value) => ipcRenderer.invoke('db:settings:set', { key, value }),
      delete: (key) => ipcRenderer.invoke('db:settings:delete', key),
      getAll: () => ipcRenderer.invoke('db:settings:getAll'),
      setBatch: (entries) => ipcRenderer.invoke('db:settings:setBatch', entries)
    },
    // 数据库维护
    maintenance: {
      cleanup: () => ipcRenderer.invoke('db:maintenance:cleanup')
    }
  }
}

// Custom APIs for renderer
const api = {
  invoke: (channel, data) => safeInvoke(channel, data),
  on: (channel, callback) => safeOn(channel, callback),
  cloudRequest: (payload) => safeInvoke('cloud:request', payload),
  promptPilot: {
    run: (payload) => safeInvoke('promptpilot:run', payload)
  },
  localCacheAPI: {
    ping: (data) => safeInvoke('cache:ping', data),
    config: (newConfig) => safeInvoke('cache:config', newConfig),
    openDirectory: (currentPath) => safeInvoke('cache:openDirectory', currentPath),
    openFiles: (options) => safeInvoke('cache:openFiles', options),
    saveThumbnail: (data) => safeInvoke('cache:save-thumbnail', data),
    saveCache: (data) => safeInvoke('cache:save-cache', data),
    downloadUrl: (data) => safeInvoke('cache:download-url', data),
    checkCache: (data) => safeInvoke('cache:check', data),
    getStats: (data) => safeInvoke('cache:stats', data),
    diagnose: (data) => safeInvoke('cache:diagnose', data),
    cleanup: (data) => safeInvoke('cache:cleanup', data),
    clearProjectCache: (projectId) => safeInvoke('cache:clear-project-cache', projectId),
    policy: (data) => safeInvoke('cache:policy', data),
    deleteBatch: (data) => safeInvoke('cache:delete-batch', data),
    deleteProject: (projectId) => safeInvoke('cache:delete-project', projectId),
    clearGenerated: (data) => safeInvoke('cache:clear-generated', data),
    clearHistory: () => safeInvoke('cache:clear-history'),
    showItemInFolder: (path) => safeInvoke('system:show-item-in-folder', path),
    writeClipboardText: (text) => safeInvoke('system:clipboard-write-text', text),
    saveFileAs: (sourcePath, defaultName) =>
      safeInvoke('system:save-file-as', { sourcePath, defaultName }),
    concatVideos: (videoPaths, outputName, cacheContext = {}) =>
      safeInvoke('system:concat-videos', { videoPaths, outputName, ...cacheContext })
  },
  engineAPI: {
    submitTask: (payload) => safeInvoke('engine:submit-task', payload),
    cancelTask: (taskId) => safeInvoke('engine:cancel-task', taskId),
    getStatus: () => safeInvoke('engine:get-status'),
    onTaskUpdated: (callback) => safeOn('engine:task-update', callback)
  },
  videoAPI: {
    eraseSubtitle: (videoUrl, apiKey) => safeInvoke('video:erase-subtitle', { videoUrl, apiKey })
  },
  vodAITranslation: {
    status: () => safeInvoke('vod:ai-translation:status'),
    getConfig: () => safeInvoke('vod:ai-translation:get-config'),
    saveConfig: (payload) => safeInvoke('vod:ai-translation:save-config', payload),
    clearConfig: () => safeInvoke('vod:ai-translation:clear-config'),
    submitWorkflow: (payload) => safeInvoke('vod:ai-translation:submit-workflow', payload),
    getProject: (payload) => safeInvoke('vod:ai-translation:get-project', payload),
    listProject: (payload) => safeInvoke('vod:ai-translation:list-project', payload),
    updateUtterances: (payload) => safeInvoke('vod:ai-translation:update-utterances', payload),
    continueWorkflow: (payload) => safeInvoke('vod:ai-translation:continue-workflow', payload),
    refreshProject: (payload) => safeInvoke('vod:ai-translation:refresh-project', payload),
    uploadMediaByUrl: (payload) => safeInvoke('vod:ai-translation:upload-media-by-url', payload),
    queryUploadTask: (payload) => safeInvoke('vod:ai-translation:query-upload-task', payload)
  },
  updater: {
    onMessage: (callback) => safeOn('updater-message', callback),
    checkForUpdates: (options) => safeInvoke('updater-check', options),
    downloadUpdate: () => safeInvoke('updater-download'),
    preflightCheck: (options) => safeInvoke('updater-preflight-check', options),
    quitAndInstall: () => safeInvoke('updater-quit-install'),
    clearAndInstall: () => safeInvoke('updater-clear-and-install')
  },
  safeStorageAPI: {
    isAvailable: () => safeInvoke('safeStorage:isAvailable'),
    encrypt: (plainText) => safeInvoke('safeStorage:encrypt', plainText),
    decrypt: (base64Cipher) => safeInvoke('safeStorage:decrypt', base64Cipher)
  },
  monitorAPI: {
    getStats: () => safeInvoke('monitor:get-stats')
  },
  diagnosticsAPI: {
    drainMainEvents: () => safeInvoke('diagnostics:drain-main-events'),
    createReport: () => safeInvoke('diagnostics:create-report'),
    exportPackage: () => safeInvoke('diagnostics:export-package'),
    migrationStatus: () => safeInvoke('system:migration-status'),
    healthCheck: (options) => safeInvoke('system:health-check', options)
  },
  thumbnailAPI: {
    generate: (filePath, size) => safeInvoke('thumbnail:generate', { filePath, size }),
    getVideo: (src) => safeInvoke('thumbnail:get-video', { src }),
    saveVideo: (src, content, metadata) =>
      safeInvoke('thumbnail:save-video', { src, content, metadata })
  },
  ossAPI: {
    getConfig: () => safeInvoke('oss:get-config'),
    saveConfig: (payload) => safeInvoke('oss:save-config', payload),
    clearConfig: () => safeInvoke('oss:clear-config'),
    uploadFile: (localPath) => safeInvoke('oss:upload-file', { localPath })
  },
  assetAPI: {
    getConfig: () => safeInvoke('asset:get-config'),
    saveConfig: (payload) => safeInvoke('asset:save-config', payload),
    clearConfig: () => safeInvoke('asset:clear-config'),
    createGroup: (name, description) => safeInvoke('asset:create-group', { name, description }),
    getDefaultGroup: () => safeInvoke('asset:get-default-group'),
    getGroup: (groupId) => safeInvoke('asset:get-group', { groupId }),
    listGroups: (page, pageSize) => safeInvoke('asset:list-groups', { page, pageSize }),
    updateGroup: (groupId, name, description) =>
      safeInvoke('asset:update-group', { groupId, name, description }),
    create: (imageUrl, name, groupId, assetType) =>
      safeInvoke('asset:create', { imageUrl, name, groupId, assetType }),
    get: (assetId) => safeInvoke('asset:get', { assetId }),
    poll: (assetId, intervalMs, timeoutMs) =>
      safeInvoke('asset:poll', { assetId, intervalMs, timeoutMs }),
    list: (groupId, page, pageSize, statuses) =>
      safeInvoke('asset:list', { groupId, page, pageSize, statuses }),
    update: (assetId, name) => safeInvoke('asset:update', { assetId, name })
  },
  windowAPI: {
    focusFix: () => safeInvoke('window:focus-fix'),
    writeClipboardText: (text) => safeInvoke('system:clipboard-write-text', text),
    openExternal: (url) => safeInvoke('system:open-external', url),
    inspectUrl: (url) => safeInvoke('system:inspect-url', url),
    captureUrlScreenshot: (url) => safeInvoke('system:capture-url-screenshot', url),
    inspectUrlDom: (url) => safeInvoke('system:inspect-url-dom', url),
    clickUrlSelector: (payload) => safeInvoke('system:click-url-selector', payload),
    captureUrlViewportMatrix: (payload) =>
      safeInvoke('system:capture-url-viewport-matrix', payload),
    annotateUrlScreenshot: (payload) => safeInvoke('system:annotate-url-screenshot', payload),
    inspectUrlConsole: (payload) => safeInvoke('system:inspect-url-console', payload),
    fillUrlForm: (payload) => safeInvoke('system:fill-url-form', payload),
    startBrowserSession: (payload) => safeInvoke('system:start-browser-session', payload),
    importBrowserCookies: (payload) => safeInvoke('system:import-browser-cookies', payload),
    listBrowserProfiles: () => safeInvoke('system:list-browser-profiles'),
    importBrowserProfileCookies: (payload) =>
      safeInvoke('system:import-browser-profile-cookies', payload),
    inspectBrowserSessionDom: (payload) =>
      safeInvoke('system:inspect-browser-session-dom', payload),
    inspectBrowserSessionConsole: (payload) =>
      safeInvoke('system:inspect-browser-session-console', payload),
    captureBrowserSessionScreenshot: (payload) =>
      safeInvoke('system:capture-browser-session-screenshot', payload),
    clickBrowserSessionElement: (payload) =>
      safeInvoke('system:click-browser-session-element', payload),
    fillBrowserSessionForm: (payload) => safeInvoke('system:fill-browser-session-form', payload),
    closeBrowserSession: (payload) => safeInvoke('system:close-browser-session', payload),
    capturePage: () => safeInvoke('window:capture-page'),
    captureThumbnail: () => safeInvoke('window:capture-thumbnail')
  },
  fsAPI: {
    readTextFile: (filePath) => safeInvoke('fs:read-text-file', filePath),
    listDirectory: (dirPath, filter) => safeInvoke('fs:list-directory', { dirPath, filter }),
    readImagesAsPaths: (dirPath) => safeInvoke('fs:read-images-as-paths', dirPath),
    writeTextFile: (payload) => safeInvoke('fs:write-text-file', payload),
    saveTextFileAs: (payload) => safeInvoke('system:save-text-file-as', payload),
    copyPath: (payload) => safeInvoke('fs:copy-path', payload),
    movePath: (payload) => safeInvoke('fs:move-path', payload),
    deletePath: (payload) => safeInvoke('fs:delete-path', payload),
    makeDirectory: (payload) => safeInvoke('fs:make-directory', payload),
    openPath: (targetPath) => safeInvoke('fs:open-path', targetPath),
    runCommand: (payload) => safeInvoke('fs:run-command', payload)
  },
  terminalAPI: {
    start: (payload) => safeInvoke('terminal:start', payload),
    input: (id, input) => safeInvoke('terminal:input', { id, input }),
    stop: (id) => safeInvoke('terminal:stop', id),
    list: () => safeInvoke('terminal:list'),
    onUpdate: (callback) => safeOn('terminal:update', callback)
  },
  projectFileAPI: {
    save: (id, data) => safeInvoke('project:save', { id, data }),
    load: (id) => safeInvoke('project:load', id),
    list: () => safeInvoke('project:list'),
    importLocal: (options) => safeInvoke('project:import-local', options),
    delete: (id) => safeInvoke('project:delete', id),
    repair: (id) => safeInvoke('project:repair', id),
    saveSync: (id, data) => ipcRenderer.sendSync('project:save-sync', { id, data })
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('dbAPI', createDbAPI())
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.dbAPI = createDbAPI()
}
