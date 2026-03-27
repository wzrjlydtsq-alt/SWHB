import { autoUpdater } from 'electron-updater'
import { ipcMain } from 'electron'

export function setupUpdater(mainWindow) {
  // Disable automatic downloading so we can offer the user a choice/progress UI
  autoUpdater.autoDownload = false

  // Inform the frontend of update events
  const sendStatusToWindow = (text, type = 'info', data = null) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-message', { text, type, data })
    }
  }

  autoUpdater.on('checking-for-update', () => {
    sendStatusToWindow('正在检查更新...', 'checking')
  })

  autoUpdater.on('update-available', (info) => {
    sendStatusToWindow('检测到新版本，可以开始下载。', 'update-available', info)
  })

  autoUpdater.on('update-not-available', (info) => {
    sendStatusToWindow('当前已经是最新版本。', 'update-not-available', info)
  })

  autoUpdater.on('error', (err) => {
    console.error('更新发生错误:', err)
    sendStatusToWindow('检查更新出错。', 'error', err)
  })

  autoUpdater.on('download-progress', (progressObj) => {
    let log_message = `下载速度: ${(progressObj.bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s`
    log_message = log_message + ' - 已下载 ' + progressObj.percent.toFixed(1) + '%'
    log_message =
      log_message +
      ' (' +
      (progressObj.transferred / 1024 / 1024).toFixed(2) +
      '/' +
      (progressObj.total / 1024 / 1024).toFixed(2) +
      ' MB)'

    sendStatusToWindow(log_message, 'download-progress', progressObj)
  })

  autoUpdater.on('update-downloaded', (info) => {
    sendStatusToWindow('更新下载完毕，请重启应用以应用更新。', 'update-downloaded', info)
  })

  // IPC Handlers sent from the frontend
  ipcMain.handle('updater-check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return { success: true, result }
    } catch (error) {
      console.error('updater-check failure:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('updater-download', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) {
      console.error('updater-download failure:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('updater-quit-install', () => {
    autoUpdater.quitAndInstall()
  })

  // 清除 userData 目录内容后再安装更新
  ipcMain.handle('updater-clear-and-install', async () => {
    const { app } = require('electron')
    const fs = require('fs')
    const path = require('path')
    const userDataPath = app.getPath('userData')

    try {
      const entries = fs.readdirSync(userDataPath)
      for (const entry of entries) {
        // 跳过正在使用的锁文件
        if (
          entry === 'lockfile' ||
          entry === 'SingletonLock' ||
          entry === 'SingletonSocket' ||
          entry === 'SingletonCookie'
        )
          continue
        const fullPath = path.join(userDataPath, entry)
        try {
          fs.rmSync(fullPath, { recursive: true, force: true })
        } catch (e) {
          console.warn(`[Updater] 无法删除 ${entry}:`, e.message)
        }
      }
      console.log('[Updater] userData 已清除，开始安装更新')
    } catch (e) {
      console.error('[Updater] 清除 userData 失败:', e)
    }
    autoUpdater.quitAndInstall()
  })
}
