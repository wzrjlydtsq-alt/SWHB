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
  'cache:check',
  'cache:delete-batch',
  'cache:clear-generated',
  'cache:clear-history',
  'cache:download-url',
  'system:show-item-in-folder',
  'engine:submit-task',
  'engine:cancel-task',
  'engine:get-status',
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
  'safeStorage:isAvailable',
  'safeStorage:encrypt',
  'safeStorage:decrypt',
  'updater-check',
  'updater-download',
  'updater-quit-install',
  'monitor:get-stats',
  'thumbnail:generate'
]

// 白名单校验的 invoke 包装
function safeInvoke(channel, data) {
  if (!ALLOWED_CHANNELS.includes(channel)) {
    return Promise.reject(new Error(`IPC channel not allowed: ${channel}`))
  }
  return ipcRenderer.invoke(channel, data)
}

// ========== 监听通道白名单 ==========
const ALLOWED_ON_CHANNELS = ['engine:task-update', 'updater-message']

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
    }
  }
}

// Custom APIs for renderer
const api = {
  invoke: (channel, data) => safeInvoke(channel, data),
  on: (channel, callback) => safeOn(channel, callback),
  localCacheAPI: {
    ping: () => safeInvoke('cache:ping'),
    config: (newConfig) => safeInvoke('cache:config', newConfig),
    openDirectory: (currentPath) => safeInvoke('cache:openDirectory', currentPath),
    openFiles: (options) => safeInvoke('cache:openFiles', options),
    saveThumbnail: (data) => safeInvoke('cache:save-thumbnail', data),
    saveCache: (data) => safeInvoke('cache:save-cache', data),
    checkCache: (data) => safeInvoke('cache:check', data),
    deleteBatch: (data) => safeInvoke('cache:delete-batch', data),
    clearGenerated: () => safeInvoke('cache:clear-generated'),
    clearHistory: () => safeInvoke('cache:clear-history'),
    showItemInFolder: (path) => safeInvoke('system:show-item-in-folder', path)
  },
  engineAPI: {
    submitTask: (payload) => safeInvoke('engine:submit-task', payload),
    cancelTask: (taskId) => safeInvoke('engine:cancel-task', taskId),
    getStatus: () => safeInvoke('engine:get-status'),
    onTaskUpdated: (callback) => safeOn('engine:task-update', callback)
  },
  updater: {
    onMessage: (callback) => safeOn('updater-message', callback),
    checkForUpdates: () => safeInvoke('updater-check'),
    downloadUpdate: () => safeInvoke('updater-download'),
    quitAndInstall: () => safeInvoke('updater-quit-install')
  },
  safeStorageAPI: {
    isAvailable: () => safeInvoke('safeStorage:isAvailable'),
    encrypt: (plainText) => safeInvoke('safeStorage:encrypt', plainText),
    decrypt: (base64Cipher) => safeInvoke('safeStorage:decrypt', base64Cipher)
  },
  monitorAPI: {
    getStats: () => safeInvoke('monitor:get-stats')
  },
  thumbnailAPI: {
    generate: (filePath, size) => safeInvoke('thumbnail:generate', { filePath, size })
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
