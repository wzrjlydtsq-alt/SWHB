import { ipcMain, app, dialog, BrowserWindow, shell, safeStorage, clipboard, nativeImage } from 'electron'
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
  setSettingsBatch,
  cleanupOrphanData
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
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('cache:copy-file', (event, { id, sourcePath, category, type }) => {
    try {
      if (!id || !sourcePath) return { success: false, error: '缺少必要参数' }
      if (!fs.existsSync(sourcePath)) return { success: false, error: '源文件不存在' }

      const isVideo = type === 'video'
      const targetDir = isVideo ? currentConfig.video_save_path : currentConfig.image_save_path
      const ext = path.extname(sourcePath) || (isVideo ? '.mp4' : '.jpg')
      const fileName = `${category}_${id.replace(/[^a-zA-Z0-9_-]/g, '')}${ext}`
      const filePath = path.join(targetDir, fileName)

      fs.copyFileSync(sourcePath, filePath)
      const xingheUrl = `xinghe://local/?path=${encodeURIComponent(filePath)}`

      // 对于图片类也可以尝试生成缩略图，这里简化直接返回
      return { success: true, url: xingheUrl, path: filePath }
    } catch (e) {
      console.error(e)
      return { success: false, error: e.message }
    }
  })

  // 复制图片到系统剪贴板（支持本地路径、xinghe:// 协议、远程 URL）
  ipcMain.handle('clipboard:copy-image', async (event, { filePath }) => {
    try {
      if (!filePath) return { success: false, error: '缺少文件路径' }

      // 远程 URL：直接下载到内存并写入剪贴板
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        const res = await fetch(filePath)
        if (!res.ok) return { success: false, error: `下载失败: ${res.statusText}` }
        const buffer = Buffer.from(await res.arrayBuffer())
        const img = nativeImage.createFromBuffer(buffer)
        if (img.isEmpty()) return { success: false, error: '无法解析远程图片' }
        clipboard.writeImage(img)
        return { success: true }
      }

      // 解析路径：支持 xinghe://local/?path=... 协议
      let realPath = filePath
      if (realPath.startsWith('xinghe://local')) {
        const match = realPath.match(/[?&]path=([^&]+)/)
        if (match) realPath = decodeURIComponent(match[1])
      }
      if (realPath.startsWith('xinghe://')) {
        realPath = realPath.replace(/^xinghe:\/\//, '')
      }

      // 尝试多种路径策略定位文件
      let absPath = null
      if (path.isAbsolute(realPath) && fs.existsSync(realPath)) {
        absPath = realPath
      }
      if (!absPath) {
        const userDataPath = path.join(app.getPath('userData'), 'LocalCache', realPath)
        if (fs.existsSync(userDataPath)) absPath = userDataPath
      }
      if (!absPath) {
        const fname = realPath.split(/[/\\]/).pop()
        for (const sub of ['images', 'videos', '']) {
          const tryPath = path.join(app.getPath('userData'), 'LocalCache', sub, fname)
          if (fs.existsSync(tryPath)) { absPath = tryPath; break }
        }
      }

      if (!absPath) return { success: false, error: `文件不存在: ${realPath}` }

      const img = nativeImage.createFromPath(absPath)
      if (img.isEmpty()) return { success: false, error: '无法读取图片（格式不支持或文件损坏）' }

      clipboard.writeImage(img)
      return { success: true }
    } catch (e) {
      console.error('[clipboard:copy-image] Error:', e)
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

  // 另存为：弹出系统对话框，将文件复制到用户选择的位置
  ipcMain.handle('system:save-file-as', async (event, { sourcePath, defaultName }) => {
    try {
      // 解析真实的文件路径
      let realPath = sourcePath

      // 处理 xinghe://local/?path=... 协议
      if (realPath.startsWith('xinghe://local')) {
        const match = realPath.match(/[?&]path=([^&]+)/)
        if (match) {
          realPath = decodeURIComponent(match[1])
        }
      }

      // 处理 xinghe:// 其他形式
      if (realPath.startsWith('xinghe://')) {
        realPath = realPath.replace(/^xinghe:\/\//, '')
      }

      // 提取纯文件名作为默认保存名称
      const pureFileName = (defaultName || realPath).split(/[/\\]/).pop().split('?')[0]
      // 处理 URL 编码的文件名
      const decodedFileName = decodeURIComponent(pureFileName)

      const ext = path.extname(decodedFileName).toLowerCase()
      const filters = []
      const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
      const videoExts = ['.mp4', '.webm', '.mov']
      if (imageExts.includes(ext)) {
        filters.push({ name: '图片文件', extensions: [ext.slice(1)] })
      } else if (videoExts.includes(ext)) {
        filters.push({ name: '视频文件', extensions: [ext.slice(1)] })
      }
      filters.push({ name: '所有文件', extensions: ['*'] })

      const { dialog } = require('electron')
      const result = await dialog.showSaveDialog({
        title: '另存为',
        defaultPath: decodedFileName,
        filters
      })
      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true }
      }

      // 尝试多种路径策略定位源文件
      let absSource = null

      // 策略 1: realPath 已是有效的绝对路径
      if (path.isAbsolute(realPath) && fs.existsSync(realPath)) {
        absSource = realPath
      }

      // 策略 2: 拼接 userData 目录
      if (!absSource) {
        const userDataPath = path.join(app.getPath('userData'), realPath)
        if (fs.existsSync(userDataPath)) {
          absSource = userDataPath
        }
      }

      // 策略 3: 在 LocalCache 子目录下查找
      if (!absSource) {
        const localCachePath = path.join(app.getPath('userData'), 'LocalCache', realPath)
        if (fs.existsSync(localCachePath)) {
          absSource = localCachePath
        }
      }

      // 策略 4: 只用文件名在 LocalCache/images 和 LocalCache/videos 下查找
      if (!absSource) {
        const fname = realPath.split(/[/\\]/).pop()
        for (const sub of ['images', 'videos', '']) {
          const tryPath = path.join(app.getPath('userData'), 'LocalCache', sub, fname)
          if (fs.existsSync(tryPath)) {
            absSource = tryPath
            break
          }
        }
      }

      // 策略 5: 对于远程 URL，下载内容
      if (!absSource && (sourcePath.startsWith('http') || sourcePath.startsWith('xinghe://'))) {
        const { net } = require('electron')
        const url = sourcePath.startsWith('xinghe://')
          ? sourcePath.replace('xinghe://', 'http://localhost:7860/')
          : sourcePath
        const response = await net.fetch(url)
        const arrayBuf = await response.arrayBuffer()
        fs.writeFileSync(result.filePath, Buffer.from(arrayBuf))
        return { success: true, path: result.filePath }
      }

      if (absSource) {
        fs.copyFileSync(absSource, result.filePath)
        return { success: true, path: result.filePath }
      }

      console.error('[save-file-as] 无法定位源文件:', { sourcePath, realPath })
      return { success: false, error: `源文件不存在: ${realPath}` }
    } catch (e) {
      console.error('Save file as failed:', e)
      return { success: false, error: e.message }
    }
  })

  // 视频拼接：使用 FFmpeg 将多个视频合并为一个
  ipcMain.handle('system:concat-videos', async (event, { videoPaths, outputName }) => {
    const { execFile } = require('child_process')
    const os = require('os')

    try {
      // 解析所有视频的真实路径
      const resolvedPaths = videoPaths.map((vp) => {
        let rp = vp
        if (rp.startsWith('xinghe://local')) {
          const match = rp.match(/[?&]path=([^&]+)/)
          if (match) rp = decodeURIComponent(match[1])
        }
        if (rp.startsWith('xinghe://')) rp = rp.replace(/^xinghe:\/\//, '')

        // 在 LocalCache 中查找
        if (!fs.existsSync(rp)) {
          const fname = rp.split(/[/\\]/).pop()
          for (const sub of ['videos', 'images', '']) {
            const tryP = path.join(app.getPath('userData'), 'LocalCache', sub, fname)
            if (fs.existsSync(tryP)) { rp = tryP; break }
          }
        }
        return rp
      })

      // 检查所有文件是否存在
      for (const p of resolvedPaths) {
        if (!fs.existsSync(p)) {
          return { success: false, error: `文件不存在: ${p}` }
        }
      }

      // 创建 concat 列表文件
      const tmpDir = os.tmpdir()
      const listFile = path.join(tmpDir, `concat_${Date.now()}.txt`)
      const listContent = resolvedPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
      fs.writeFileSync(listFile, listContent, 'utf-8')

      // 输出路径
      const outputDir = path.join(app.getPath('userData'), 'LocalCache', 'videos')
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
      const outputPath = path.join(outputDir, outputName || `concat_${Date.now()}.mp4`)

      // 调用 FFmpeg
      const ffmpegBin = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
      return new Promise((resolve) => {
        execFile(
          ffmpegBin,
          ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outputPath],
          { timeout: 120000 },
          (err, stdout, stderr) => {
            // 清理临时文件
            try { fs.unlinkSync(listFile) } catch (_e) { /* ignore */ }

            if (err) {
              console.error('[concat-videos] FFmpeg error:', err.message, stderr)
              // 检查是否 FFmpeg 未安装
              if (err.code === 'ENOENT') {
                return resolve({
                  success: false,
                  error: '未检测到 FFmpeg，请先安装 FFmpeg 并确保已添加到系统 PATH'
                })
              }
              return resolve({ success: false, error: `拼接失败: ${err.message}` })
            }

            // 弹出另存为对话框
            const win = BrowserWindow.getFocusedWindow()
            dialog
              .showSaveDialog(win, {
                title: '导出拼接视频',
                defaultPath: path.join(app.getPath('downloads'), outputName || 'director_output.mp4'),
                filters: [{ name: '视频文件', extensions: ['mp4'] }]
              })
              .then((result) => {
                if (!result.canceled && result.filePath) {
                  fs.copyFileSync(outputPath, result.filePath)
                  resolve({ success: true, path: result.filePath })
                } else {
                  resolve({ success: true, path: outputPath, exported: false })
                }
              })
              .catch((e) => resolve({ success: false, error: e.message }))
          }
        )
      })
    } catch (e) {
      console.error('[concat-videos] Error:', e)
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

  // 数据库维护
  ipcMain.handle('db:maintenance:cleanup', () => cleanupOrphanData())

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
