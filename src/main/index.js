import { app, shell, BrowserWindow, ipcMain, protocol, net, session } from 'electron'
import { join } from 'path'
import path from 'path'
import fs from 'fs'
import { pathToFileURL } from 'url'
import './database.js'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.ico?asset'
import { setupIpcHandlers } from './ipcHandlers.js'
import { setupUpdater } from './updater.js'

// ========== 主进程全局异常保护 ==========
process.on('uncaughtException', (error) => {
  console.error('[主进程] 未捕获异常:', error)
})
process.on('unhandledRejection', (reason) => {
  console.error('[主进程] 未处理的 Promise 拒绝:', reason)
})

// ========== GPU 渲染加速 ==========
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  let crashCount = 0
  const MAX_CRASH_RELOADS = 3

  // 渲染进程崩溃保护：自动重新加载（限制次数）
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[主进程] 渲染进程崩溃:', details.reason)
    if (details.reason !== 'clean-exit' && crashCount < MAX_CRASH_RELOADS) {
      crashCount++
      console.warn(`[主进程] 尝试重载 (${crashCount}/${MAX_CRASH_RELOADS})`)
      setTimeout(() => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.reload()
        }
      }, 1000)
    } else if (crashCount >= MAX_CRASH_RELOADS) {
      console.error('[主进程] 渲染进程连续崩溃超过限制，停止重载')
    }
  })

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[主进程] 页面加载失败:', errorCode, errorDescription)
    setTimeout(() => {
      if (!mainWindow.isDestroyed()) {
        if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
          mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
        } else {
          mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
        }
      }
    }, 2000)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 仅开发模式下打开开发者工具
  if (is.dev) {
    mainWindow.webContents.openDevTools()
  }

  // Hook up the auto updater
  setupUpdater(mainWindow)
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'xinghe',
    privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true }
  }
])

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron.xinghezhihui')

  // 允许跨域资源加载（AI 生成的图片/视频 URL），仅限外部 API 请求
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders }

    // 仅对外部 HTTP/HTTPS 请求添加 CORS 头（排除 file://, xinghe://, devtools://, chrome:// 等）
    const url = details.url || ''
    const isExternalHttp = url.startsWith('http://') || url.startsWith('https://')
    // 排除本地开发服务器和 Electron 内部请求
    const isLocalDev =
      url.includes('localhost') || url.includes('127.0.0.1') || url.includes('://0.0.0.0')

    if (isExternalHttp && !isLocalDev) {
      const hasACAO = Object.keys(responseHeaders).some(
        (key) => key.toLowerCase() === 'access-control-allow-origin'
      )
      if (!hasACAO) {
        responseHeaders['Access-Control-Allow-Origin'] = ['*']
      }
    }

    callback({ responseHeaders })
  })

  protocol.handle('xinghe', (request) => {
    try {
      const requestUrl = new URL(request.url)
      // 安全提取我们编码过的路径，浏览器绝对不会修改 Query 里的内容
      let filePath = requestUrl.searchParams.get('path')

      if (!filePath) {
        // Fallback for extreme legacy cache formats where ?path= is missing
        filePath = request.url.replace(/^xinghe:\/\/\/?/i, '')
        try {
          filePath = decodeURIComponent(filePath)
          if (filePath.startsWith('local/')) {
            filePath = filePath.replace('local/', '')
          }
        } catch {
          // Fallback if malformed
        }
      }

      // 修复 Windows 下拖拽文件可能产生的路径问题 (例如 'xinghe://d/KF/...' 变成 'd/KF/...')
      // 实际上 Windows 绝对路径应该是 'D:\KF\...' 或 'D:/KF/...'
      if (process.platform === 'win32') {
        // 如果是以 / 开头（例如 /D:/xxx），去掉前导斜杠
        if (filePath.startsWith('/')) {
          filePath = filePath.slice(1)
        }

        // 如果是类似于 'd/KF/' 或 'd:\KF' 这种缺少冒号的形式，且第一个字符是字母，第二个是斜杠，补充冒号。
        // 例如 'd/KF/' -> 'd:/KF/'
        if (/^[a-zA-Z][/\\]/.test(filePath)) {
          filePath = filePath[0] + ':' + filePath.slice(1)
        }
      }

      // macOS / Linux 路径规范化
      if (process.platform === 'darwin' || process.platform === 'linux') {
        // 确保 URL 编码的路径被正确解码（空格 %20 等）
        try {
          filePath = decodeURIComponent(filePath)
        } catch {
          // 已经是解码状态，忽略
        }
        // macOS 绝对路径以 / 开头，无需额外处理
      }

      // Check if file physically exists before returning net.fetch to avoid ERR_UNEXPECTED

      if (!fs.existsSync(filePath)) {
        // Fallback for historical videos/images that were stored in the default appData/ljxh.1 folder
        // before the user modified videoSavePath, making the frontend reconstruct wrong absolute paths.
        let filename = path.basename(filePath)
        try {
          filename = decodeURIComponent(filename)
        } catch {
          /* ignore */
        } // ensure decoded

        const isVideo =
          filename.toLowerCase().endsWith('.mp4') ||
          filename.toLowerCase().endsWith('.webm') ||
          filename.toLowerCase().endsWith('.mov')
        const fallbackSubdir = isVideo
          ? path.join('LocalCache', 'videos')
          : path.join('LocalCache', 'images')

        const possibleDirs = [
          path.join(app.getPath('userData'), fallbackSubdir),
          path.join(app.getPath('appData'), 'ljxh.1', fallbackSubdir),
          path.join(app.getPath('appData'), 'xinghe-zhihui', fallbackSubdir),
          path.join(app.getPath('appData'), 'Electron', fallbackSubdir)
        ]

        let foundFallback = null
        for (const dir of possibleDirs) {
          const attempt = path.join(dir, filename)
          // 容错处理：空格有时会变成类似 %20 等难以识别的问题，或者被 Chromium 当作其他字符截断
          if (fs.existsSync(attempt)) {
            foundFallback = attempt
            break
          }
          // 特殊兼容：如果在旧缓存库存在带有下划线版本的文件名（因为前端去掉了旧的前缀）
          const attemptWithUnder = path.join(dir, filename.replace(/ /g, '_'))
          if (fs.existsSync(attemptWithUnder)) {
            foundFallback = attemptWithUnder
            break
          }
        }

        if (foundFallback) {
          console.log(`[Xinghe Protocol] Fallback resolved to: ${foundFallback}`)
          return serveFileWithRange(request, foundFallback)
        }

        console.warn(`[Xinghe Protocol] File not found: ${filePath}`)
        return new Response('File not found', { status: 404 })
      }

      return serveFileWithRange(request, filePath)
    } catch (err) {
      console.error('[Xinghe Protocol] Error:', err)
      return new Response('Internal Server Error', { status: 500 })
    }
  })

  // 抽出一个独立函数处理包含 Range 头的文件流
  function serveFileWithRange(request, targetPath) {
    // 只对视频启用流式分片，其它直接读（防卡死和小文件没必要）
    const ext = path.extname(targetPath).toLowerCase()
    const isVideo = ['.mp4', '.webm', '.mov', '.ogg'].includes(ext)

    if (!isVideo) {
      return net.fetch(pathToFileURL(targetPath).toString())
    }

    try {
      const stat = fs.statSync(targetPath)
      const fileSize = stat.size
      const range = request.headers.get('range')

      // MIME 类型简单映射
      const mimeTypes = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.ogg': 'video/ogg'
      }
      const contentType = mimeTypes[ext] || 'video/mp4'

      if (range) {
        // 请求中包含 Range 头 (形如 bytes=0-1000)
        const parts = range.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1

        if (start >= fileSize || start < 0) {
          return new Response('Requested range not satisfiable', {
            status: 416,
            headers: { 'Content-Range': `bytes */${fileSize}` }
          })
        }

        const chunksize = end - start + 1
        // Node 16+ 的 ReadableStream Web API (可被 Response 接收)
        const fileStream = fs.createReadStream(targetPath, { start, end })
        const readableStream = new ReadableStream({
          start(controller) {
            fileStream.pause()
            fileStream.on('data', (chunk) => {
              controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength))
              if (controller.desiredSize <= 0) fileStream.pause()
            })
            fileStream.on('end', () => controller.close())
            fileStream.on('error', (err) => controller.error(err))
          },
          pull() {
            fileStream.resume()
          },
          cancel() {
            fileStream.destroy()
          }
        })

        return new Response(readableStream, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Timing-Allow-Origin': '*'
          }
        })
      } else {
        // 没有 Range, 返回整个视频流
        const fileStream = fs.createReadStream(targetPath)
        const readableStream = new ReadableStream({
          start(controller) {
            fileStream.pause()
            fileStream.on('data', (chunk) => {
              controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength))
              if (controller.desiredSize <= 0) fileStream.pause()
            })
            fileStream.on('end', () => controller.close())
            fileStream.on('error', (err) => controller.error(err))
          },
          pull() {
            fileStream.resume()
          },
          cancel() {
            fileStream.destroy()
          }
        })

        return new Response(readableStream, {
          status: 200,
          headers: {
            'Content-Length': fileSize,
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Timing-Allow-Origin': '*'
          }
        })
      }
    } catch (e) {
      console.error(`[Xinghe Protocol Stream Error] ${targetPath}:`, e)
      return new Response('Error reading file', { status: 500 })
    }
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  setupIpcHandlers()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
