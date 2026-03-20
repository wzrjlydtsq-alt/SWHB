import { ipcMain, app, dialog, BrowserWindow, shell, safeStorage } from 'electron'
import path from 'path'
import fs from 'fs'
import { globalTaskQueue } from './engine/TaskQueue.js'
import { collectStats, incrementIpcCount } from './systemMonitor.js'
import {
  getAllProjects,
  getProject,
  saveProject,
  deleteProject,
  getNodesByProject,
  saveNode,
  saveNodesBatch,
  deleteNode,
  deleteNodesByProject,
  getConnectionsByProject,
  saveConnection,
  saveConnectionsBatch,
  deleteConnection,
  deleteConnectionsByProject,
  getHistoryByProject,
  getAllHistory,
  saveHistoryItem,
  saveHistoryBatch,
  deleteHistoryItem,
  clearAllHistory,
  getSetting,
  setSetting,
  deleteSetting,
  getAllSettings,
  setSettingsBatch
} from './database.js'
import { generateThumbnail } from './thumbnailService.js'

export let currentConfig = null

export function setupIpcHandlers() {
  // 包装 ipcMain.handle 以统计 IPC 调用次数
  const originalHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (channel, handler) => {
    return originalHandle(channel, async (...args) => {
      incrementIpcCount()
      return handler(...args)
    })
  }

  const defaultSavePath = path.join(app.getPath('userData'), 'LocalCache')

  currentConfig = {
    image_save_path: path.join(defaultSavePath, 'images'),
    video_save_path: path.join(defaultSavePath, 'videos'),
    convert_png_to_jpg: true,
    jpg_quality: 95
  }

  const ensureDirs = () => {
    if (!fs.existsSync(currentConfig.image_save_path)) {
      fs.mkdirSync(currentConfig.image_save_path, { recursive: true })
    }
    if (!fs.existsSync(currentConfig.video_save_path)) {
      fs.mkdirSync(currentConfig.video_save_path, { recursive: true })
    }
  }

  ensureDirs()

  ipcMain.handle('cache:openDirectory', async (event, currentPath) => {
    const defaultPath = currentPath || app.getPath('home')
    const { canceled, filePaths } = await dialog.showOpenDialog({
      defaultPath,
      properties: ['openDirectory']
    })
    if (canceled || filePaths.length === 0) {
      return { success: false }
    }
    return { success: true, path: filePaths[0] }
  })

  ipcMain.handle('cache:openFiles', async (event, options = {}) => {
    const { filters, multiple = true } = options
    const dialogOptions = {
      properties: multiple ? ['openFile', 'multiSelections'] : ['openFile']
    }
    if (filters) {
      dialogOptions.filters = filters
    }
    const { canceled, filePaths } = await dialog.showOpenDialog(dialogOptions)
    if (canceled || filePaths.length === 0) {
      return { success: false, paths: [] }
    }
    return { success: true, paths: filePaths }
  })

  ipcMain.handle('cache:ping', () => {
    return {
      status: 'ok',
      image_save_path: currentConfig.image_save_path,
      video_save_path: currentConfig.video_save_path,
      convert_png_to_jpg: currentConfig.convert_png_to_jpg,
      pil_available: false
    }
  })

  ipcMain.handle('cache:config', (event, newConfig) => {
    try {
      if (newConfig.imageSavePath) currentConfig.image_save_path = newConfig.imageSavePath
      if (newConfig.videoSavePath) currentConfig.video_save_path = newConfig.videoSavePath
      if (typeof newConfig.convertPngToJpg === 'boolean') {
        currentConfig.convert_png_to_jpg = newConfig.convertPngToJpg
      }
      if (newConfig.jpgQuality) currentConfig.jpg_quality = newConfig.jpgQuality

      ensureDirs()
      return { success: true, config: currentConfig }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('cache:save-thumbnail', (event, { id, content, category }) => {
    try {
      if (!id || !content) return { success: false, error: '缺少必要参数' }
      const base64Data = content.replace(/^data:([A-Za-z-+/]+);base64,/, '')
      const fileName = `${category}_thumb_${id.replace(/[^a-zA-Z0-9_-]/g, '')}.jpg`
      const filePath = path.join(currentConfig.image_save_path, fileName)
      fs.writeFileSync(filePath, base64Data, 'base64')
      return { success: true, url: filePath, path: filePath }
    } catch (e) {
      console.error(e)
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('cache:save-cache', (event, { id, content, category, ext, type }) => {
    try {
      if (!id || !content) return { success: false, error: '缺少必要参数' }
      const isVideo = type === 'video'
      const targetDir = isVideo ? currentConfig.video_save_path : currentConfig.image_save_path
      const writeExt = ext || (isVideo ? '.mp4' : '.jpg')
      const fileName = `${category}_${id.replace(/[^a-zA-Z0-9_-]/g, '')}${writeExt}`
      const filePath = path.join(targetDir, fileName)
      const base64Data = content.replace(/^data:([A-Za-z-+/]+);base64,/, '')
      fs.writeFileSync(filePath, base64Data, 'base64')
      return { success: true, url: filePath, path: filePath }
    } catch (e) {
      console.error(e)
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('cache:download-url', async (event, { url, id, type }) => {
    console.log('[cache:download-url] Called with:', { url: url?.substring(0, 50), id, type })
    try {
      if (!url || !id) {
        console.error('[cache:download-url] Missing params')
        return { success: false, error: '缺少必要参数' }
      }
      const isVideo = type === 'video'
      const targetDir = isVideo ? currentConfig.video_save_path : currentConfig.image_save_path
      console.log('[cache:download-url] Target dir:', targetDir)

      let ext = isVideo ? '.mp4' : '.jpg'
      try {
        const urlObj = new URL(url)
        const pathExt = path.extname(urlObj.pathname)
        if (pathExt) ext = pathExt
      } catch {
        // Ignore extension parse error
      }

      const fileName = `gen_${id.replace(/[^a-zA-Z0-9_-]/g, '')}${ext}`
      const filePath = path.join(targetDir, fileName)

      const res = await fetch(url)
      if (!res.ok) throw new Error(`Download failed: ${res.statusText}`)

      const buffer = await res.arrayBuffer()
      fs.writeFileSync(filePath, Buffer.from(buffer))

      const xingheUrl = `xinghe://local/?path=${encodeURIComponent(filePath)}`

      // 图片类型自动生成缩略图
      let thumbPath = null
      if (!isVideo) {
        try {
          const thumbResult = generateThumbnail(filePath)
          if (thumbResult.success && thumbResult.thumbPath !== filePath) {
            thumbPath = thumbResult.thumbPath
          }
        } catch (e) {
          console.warn('[cache:download-url] Thumbnail generation failed:', e.message)
        }
      }

      return { success: true, url: xingheUrl, path: filePath, thumbPath }
    } catch (e) {
      console.error('Download error:', e)
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('system:show-item-in-folder', (event, absolutePath) => {
    try {
      shell.showItemInFolder(absolutePath)
      return { success: true }
    } catch (e) {
      console.error('Failed to show item in folder:', e)
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('cache:check', (event, { basePath }) => {
    try {
      const fullPath = path.join(app.getPath('userData'), 'LocalCache', basePath)
      if (fs.existsSync(fullPath)) {
        const xingheUrl = `xinghe://local/?path=${encodeURIComponent(fullPath)}`
        return { exists: true, url: xingheUrl, path: fullPath }
      }
      return { exists: false }
    } catch {
      return { exists: false }
    }
  })

  ipcMain.handle('cache:delete-batch', (event, { files }) => {
    try {
      const results = files.map((f) => {
        try {
          if (f.path) {
            const fullPath = path.join(app.getPath('userData'), 'LocalCache', f.path)
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
          }
          return { success: true }
        } catch (e) {
          return { success: false, error: e.message }
        }
      })
      return { success: true, results }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('cache:clear-generated', async () => {
    try {
      const dirs = [
        currentConfig.image_save_path,
        currentConfig.video_save_path,
        path.join(app.getPath('userData'), 'thumbnail_cache')
      ]
      let totalFiles = 0
      let totalBytes = 0
      for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue
        const files = fs.readdirSync(dir)
        for (const file of files) {
          const filePath = path.join(dir, file)
          try {
            const stat = fs.statSync(filePath)
            if (stat.isFile()) {
              totalBytes += stat.size
              fs.unlinkSync(filePath)
              totalFiles++
            }
          } catch (e) {
            console.warn('[cache:clear-generated] Failed to delete:', filePath, e.message)
          }
        }
      }
      return { success: true, deletedFiles: totalFiles, freedBytes: totalBytes }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('cache:clear-history', async () => {
    try {
      const result = clearAllHistory()
      return { success: true, changes: result.changes }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
  // ==========================================
  // Task Queue Engine IPC Endpoints
  // ==========================================

  ipcMain.handle('engine:submit-task', (event, payload) => {
    try {
      const taskId = globalTaskQueue.submitTask(payload)
      return { success: true, taskId }
    } catch (e) {
      console.error('Task Submission Error:', e)
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('engine:cancel-task', (event, taskId) => {
    const success = globalTaskQueue.cancelTask(taskId)
    return { success }
  })

  ipcMain.handle('engine:get-status', () => {
    return { success: true, status: globalTaskQueue.getStatus() }
  })

  // Broadcast task updates to all renderer windows
  globalTaskQueue.on('task-updated', (task) => {
    console.log('[ipcHandlers] Broadcasting task-updated:', {
      id: task.id,
      status: task.status,
      progress: task.progress,
      resultUrl: task.resultUrl?.substring(0, 50),
      error: task.error
    })
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('engine:task-update', task)
    })
  })

  // ============================
  // Database IPC Handlers
  // ============================

  // --- 项目 ---
  ipcMain.handle('db:projects:list', () => getAllProjects())
  ipcMain.handle('db:projects:get', (_, id) => getProject(id))
  ipcMain.handle('db:projects:save', (_, project) => saveProject(project))
  ipcMain.handle('db:projects:delete', (_, id) => deleteProject(id))

  // --- 节点 ---
  ipcMain.handle('db:nodes:list', (_, projectId) => getNodesByProject(projectId))
  ipcMain.handle('db:nodes:save', (_, { node, projectId }) => saveNode(node, projectId))
  ipcMain.handle('db:nodes:saveBatch', (_, { nodes, projectId }) =>
    saveNodesBatch(nodes, projectId)
  )
  ipcMain.handle('db:nodes:delete', (_, id) => deleteNode(id))
  ipcMain.handle('db:nodes:deleteByProject', (_, projectId) => deleteNodesByProject(projectId))

  // --- 连接 ---
  ipcMain.handle('db:connections:list', (_, projectId) => getConnectionsByProject(projectId))
  ipcMain.handle('db:connections:save', (_, { connection, projectId }) =>
    saveConnection(connection, projectId)
  )
  ipcMain.handle('db:connections:saveBatch', (_, { connections, projectId }) =>
    saveConnectionsBatch(connections, projectId)
  )
  ipcMain.handle('db:connections:delete', (_, id) => deleteConnection(id))
  ipcMain.handle('db:connections:deleteByProject', (_, projectId) =>
    deleteConnectionsByProject(projectId)
  )

  // --- 历史 ---
  ipcMain.handle('db:history:list', (_, { projectId, limit }) =>
    getHistoryByProject(projectId, limit)
  )
  ipcMain.handle('db:history:listAll', (_, limit) => getAllHistory(limit))
  ipcMain.handle('db:history:save', (_, { item, projectId }) => saveHistoryItem(item, projectId))
  ipcMain.handle('db:history:saveBatch', (_, { items, projectId }) =>
    saveHistoryBatch(items, projectId)
  )
  ipcMain.handle('db:history:delete', (_, id) => deleteHistoryItem(id))

  // --- 设置 KV ---
  ipcMain.handle('db:settings:get', (_, key) => getSetting(key))
  ipcMain.handle('db:settings:set', (_, { key, value }) => setSetting(key, value))
  ipcMain.handle('db:settings:delete', (_, key) => deleteSetting(key))
  ipcMain.handle('db:settings:getAll', () => getAllSettings())
  ipcMain.handle('db:settings:setBatch', (_, entries) => setSettingsBatch(entries))

  // --- 安全存储 (OS 级加密) ---
  ipcMain.handle('safeStorage:isAvailable', () => safeStorage.isEncryptionAvailable())

  ipcMain.handle('safeStorage:encrypt', (_, plainText) => {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('safeStorage 加密不可用')
    }
    const encrypted = safeStorage.encryptString(plainText)
    return encrypted.toString('base64')
  })

  ipcMain.handle('safeStorage:decrypt', (_, base64Cipher) => {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('safeStorage 解密不可用')
    }
    const buffer = Buffer.from(base64Cipher, 'base64')
    return safeStorage.decryptString(buffer)
  })

  // ============================
  // 系统监控 IPC Endpoint
  // ============================
  ipcMain.handle('monitor:get-stats', () => {
    return collectStats()
  })

  // ============================
  // 缩略图服务
  // ============================
  ipcMain.handle('thumbnail:generate', (_, { filePath, size }) => {
    return generateThumbnail(filePath, size)
  })
}
