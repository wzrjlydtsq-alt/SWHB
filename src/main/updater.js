import { autoUpdater } from 'electron-updater'
import { app, ipcMain, session } from 'electron'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { prepareUpgradeCompatibilityReset } from './upgradeReset.js'

const UPDATE_FEEDS = [
  'https://image.lingjingxinghe.cn/app-updates/',
  'https://ljxhimage2.oss-cn-chengdu.aliyuncs.com/app-updates/'
]

let updaterWindow = null
let activeCheckOptions = { manual: false }
let updaterEventsRegistered = false
let updaterIpcRegistered = false
let downloadedUpdateInfo = null

const sendStatusToWindow = (text, type = 'info', data = null) => {
  if (updaterWindow && !updaterWindow.isDestroyed()) {
    updaterWindow.webContents.send('updater-message', {
      text,
      type,
      data,
      manual: Boolean(activeCheckOptions.manual)
    })
  }
}

const AUTH_DEEP_LINK_SCHEME = 'xinghe-zhihui'

function getUpdaterCacheDir() {
  if (process.platform === 'win32') {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local')
    return path.join(localAppData, 'xinghe-zhihui-updater')
  }
  return path.join(path.dirname(app.getPath('userData')), 'xinghe-zhihui-updater')
}

function getExpectedProtocolCommand() {
  return `"${process.execPath}" "%1"`
}

function readProtocolCommand() {
  if (process.platform !== 'win32') return null
  try {
    const output = execFileSync(
      'reg.exe',
      ['query', `HKCU\\Software\\Classes\\${AUTH_DEEP_LINK_SCHEME}\\shell\\open\\command`, '/ve'],
      { encoding: 'utf-8', windowsHide: true }
    )
    const line = output
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find((item) => item.includes('REG_SZ'))
    return line ? line.replace(/^.*REG_SZ\s+/i, '').trim() : null
  } catch {
    return null
  }
}

function writeProtocolCommand() {
  if (process.platform !== 'win32' || !app.isPackaged) return { skipped: true }
  app.setAsDefaultProtocolClient(AUTH_DEEP_LINK_SCHEME)
  return { command: readProtocolCommand() }
}

function listRelevantProcesses() {
  if (process.platform !== 'win32') return []
  const installDir = app.isPackaged ? path.dirname(process.execPath).toLowerCase() : ''
  const devElectronHint = path.join('node_modules', 'electron', 'dist', 'electron.exe').toLowerCase()
  const script = `
    Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(XingheZhihui|electron)\\.exe$' } |
      ForEach-Object {
        [pscustomobject]@{
          Id = $_.ProcessId;
          ParentProcessId = $_.ParentProcessId;
          Name = $_.Name;
          Path = $_.ExecutablePath;
          CommandLine = $_.CommandLine
        }
      } | ConvertTo-Json -Compress
  `
  try {
    const raw = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
      encoding: 'utf-8',
      windowsHide: true
    }).trim()
    if (!raw) return []
    const parsed = JSON.parse(raw)
    const rows = Array.isArray(parsed) ? parsed : [parsed]
    const parentByPid = new Map(
      rows.map((item) => [Number(item.Id), Number(item.ParentProcessId || 0)])
    )
    const isCurrentAppChildProcess = (id) => {
      let cursor = Number(id)
      const seen = new Set()
      while (cursor && !seen.has(cursor)) {
        seen.add(cursor)
        const parent = parentByPid.get(cursor)
        if (!parent) return false
        if (parent === process.pid) return true
        cursor = parent
      }
      return false
    }
    return rows.filter((item) => {
      const procId = Number(item.Id)
      const procPath = String(item.Path || '').toLowerCase()
      if (!procPath) return false
      if (process.pid === procId || isCurrentAppChildProcess(procId)) return false
      return (installDir && procPath.startsWith(installDir)) || procPath.includes(devElectronHint)
    })
  } catch {
    return []
  }
}

function getPathIssue(filePath, type = 'file') {
  const exists = fs.existsSync(filePath)
  return {
    path: filePath,
    exists,
    type,
    modifiedAt: exists ? fs.statSync(filePath).mtime.toISOString() : null
  }
}

function removePathIfExists(filePath) {
  if (!fs.existsSync(filePath)) return false
  fs.rmSync(filePath, { recursive: true, force: true })
  return true
}

function listExeFiles(dir, depth = 2) {
  if (!dir || depth < 0 || !fs.existsSync(dir)) return []
  const entries = []
  try {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const itemPath = path.join(dir, item.name)
      if (item.isDirectory()) {
        entries.push(...listExeFiles(itemPath, depth - 1))
      } else if (item.isFile() && /\.exe$/i.test(item.name)) {
        entries.push(itemPath)
      }
    }
  } catch {
    return entries
  }
  return entries
}

function getPendingInstallerCandidates() {
  const updateCacheDir = getUpdaterCacheDir()
  return [
    ...listExeFiles(path.join(updateCacheDir, 'pending'), 2),
    ...listExeFiles(updateCacheDir, 1)
  ].filter((filePath, index, array) => array.indexOf(filePath) === index)
}

function validatePendingInstaller() {
  const candidates = getPendingInstallerCandidates()
    .map((filePath) => {
      try {
        const stat = fs.statSync(filePath)
        return {
          path: filePath,
          name: path.basename(filePath),
          size: stat.size,
          modifiedAt: stat.mtime.toISOString()
        }
      } catch {
        return null
      }
    })
    .filter(Boolean)

  const expectedVersion = String(downloadedUpdateInfo?.version || '').trim()
  const matching = expectedVersion
    ? candidates.find((item) => item.name.includes(expectedVersion))
    : candidates[0]
  const candidate = matching || candidates[0] || null
  const ok = Boolean(candidate && candidate.size > 1024 * 1024)
  return {
    ok,
    expectedVersion: expectedVersion || null,
    installer: candidate,
    candidates,
    cacheDir: getUpdaterCacheDir(),
    error: ok ? null : 'Downloaded update installer is missing from updater cache.'
  }
}

function getFreeDiskBytes(targetPath) {
  if (process.platform !== 'win32') return null
  const root = path.parse(path.resolve(targetPath)).root.replace(/\\$/, '')
  try {
    const raw = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `(Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${root}'").FreeSpace`
      ],
      { encoding: 'utf-8', windowsHide: true }
    ).trim()
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

export function runUpdaterPreflight(options = {}) {
  const repair = Boolean(options.repair)
  const installing = Boolean(options.installing)
  const userDataPath = app.getPath('userData')
  const installDir = app.isPackaged ? path.dirname(process.execPath) : process.cwd()
  const checks = []
  const repairs = []

  const protocolCommand = readProtocolCommand()
  const expectedProtocolCommand = getExpectedProtocolCommand()
  const protocolOk =
    process.platform !== 'win32' ||
    !app.isPackaged ||
    String(protocolCommand || '').toLowerCase() === expectedProtocolCommand.toLowerCase()
  if (!protocolOk && repair) {
    repairs.push({ id: 'protocol-command', result: writeProtocolCommand() })
  }
  checks.push({
    id: 'protocol-command',
    label: 'URL protocol registration',
    ok: repair ? String(readProtocolCommand() || '').toLowerCase() === expectedProtocolCommand.toLowerCase() : protocolOk,
    severity: protocolOk ? 'info' : 'warning',
    current: protocolCommand,
    expected: expectedProtocolCommand
  })

  const processes = listRelevantProcesses()
  checks.push({
    id: 'running-processes',
    label: 'Other Xinghe/Electron processes',
    ok: processes.length === 0,
    severity: processes.length === 0 ? 'info' : 'error',
    processes
  })

  const lockNames = ['lockfile', 'SingletonLock', 'SingletonSocket', 'SingletonCookie']
  const locksAfter = lockNames
    .map((name) => getPathIssue(path.join(userDataPath, name)))
    .filter((item) => item.exists)
  checks.push({
    id: 'runtime-locks',
    label: 'Runtime lock files',
    ok: true,
    severity: locksAfter.length === 0 ? 'info' : 'info',
    active: locksAfter.length > 0,
    note: locksAfter.length > 0 ? 'Active runtime locks are expected before quitAndInstall.' : null,
    locks: locksAfter
  })

  const updateCacheDir = getUpdaterCacheDir()
  const updateCache = getPathIssue(updateCacheDir, 'directory')
  const pendingInstaller = validatePendingInstaller()
  const shouldClearUpdaterCache =
    repair && updateCache.exists && !installing && !pendingInstaller.ok
  if (shouldClearUpdaterCache) {
    removePathIfExists(updateCacheDir)
    repairs.push({ id: 'updater-cache', path: updateCacheDir })
  }
  checks.push({
    id: 'updater-cache',
    label: 'Updater cache',
    ok: true,
    severity: fs.existsSync(updateCacheDir) && !pendingInstaller.ok ? 'warning' : 'info',
    cache: getPathIssue(updateCacheDir, 'directory'),
    pendingInstaller
  })

  let installWritable = false
  try {
    const probePath = path.join(installDir, `.write-probe-${Date.now()}.tmp`)
    fs.writeFileSync(probePath, 'ok')
    fs.rmSync(probePath, { force: true })
    installWritable = true
  } catch {
    installWritable = false
  }
  checks.push({
    id: 'install-dir-writable',
    label: 'Install directory writable',
    ok: true,
    severity: installWritable ? 'info' : 'warning',
    writable: installWritable,
    note: installWritable ? null : 'Installer can continue and may request elevation.',
    path: installDir
  })

  const freeDiskBytes = getFreeDiskBytes(installDir)
  checks.push({
    id: 'disk-space',
    label: 'Free disk space',
    ok: freeDiskBytes == null || freeDiskBytes > 1024 * 1024 * 1024,
    severity: freeDiskBytes == null || freeDiskBytes > 1024 * 1024 * 1024 ? 'info' : 'warning',
    freeDiskBytes
  })

  const failed = checks.filter((item) => !item.ok)
  return {
    success: true,
    ok: failed.length === 0,
    checkedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    appId: 'cn.lingjingxinghe.xinghezhihui',
    isPackaged: app.isPackaged,
    userDataPath,
    installDir,
    checks,
    repairs
  }
}

export function setupUpdater(mainWindow) {
  updaterWindow = mainWindow

  // Disable automatic downloading so we can offer the user a choice/progress UI
  autoUpdater.autoDownload = false
  autoUpdater.autoRunAppAfterInstall = true
  autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_FEEDS[0] })

  if (!updaterEventsRegistered) {
    registerUpdaterEvents()
    updaterEventsRegistered = true
  }

  if (!updaterIpcRegistered) {
    registerUpdaterIpc()
    updaterIpcRegistered = true
  }
}

function registerUpdaterEvents() {
  // Inform the frontend of update events
  autoUpdater.on('checking-for-update', () => {
    sendStatusToWindow('正在检查更新...', 'checking')
  })

  autoUpdater.on('update-available', (info) => {
    downloadedUpdateInfo = null
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
    downloadedUpdateInfo = info || null
    sendStatusToWindow('更新下载完毕，请重启应用以应用更新。', 'update-downloaded', info)
  })
}

async function prepareForUpdateInstall() {
  const result = {}

  const preflight = runUpdaterPreflight({ repair: true, installing: true })
  result.preflight = preflight
  const blocking = preflight.checks?.filter((item) => !item.ok && item.severity === 'error') || []
  if (blocking.length > 0) {
    return {
      success: false,
      error: `Update preflight failed: ${blocking.map((item) => item.id).join(', ')}`,
      result
    }
  }

  const pendingInstaller = validatePendingInstaller()
  result.pendingInstaller = pendingInstaller
  if (!pendingInstaller.ok) {
    removePathIfExists(getUpdaterCacheDir())
    const error = '更新安装包缓存不完整，请重新下载更新后再安装。'
    sendStatusToWindow(error, 'error', {
      message: error,
      pendingInstaller
    })
    return {
      success: false,
      error,
      result
    }
  }

  try {
    const { cleanupMainRuntimeResources } = await import('./ipcHandlers.js')
    if (typeof cleanupMainRuntimeResources === 'function') {
      result.runtime = await cleanupMainRuntimeResources()
    }
  } catch (error) {
    result.runtime = { error: error?.message || String(error) }
    console.warn('[Updater] runtime cleanup failed before install:', error)
  }

  try {
    if (typeof session.defaultSession.flushStorageData === 'function') {
      await session.defaultSession.flushStorageData()
      result.sessionFlushed = true
    }
  } catch (error) {
    result.sessionFlushed = false
    result.sessionFlushError = error?.message || String(error)
    console.warn('[Updater] session flush failed before install:', error)
  }

  try {
    const { closeDatabase } = await import('./database.js')
    const closeResult = closeDatabase()
    result.database = closeResult
    if (!closeResult?.success) {
      return { success: false, error: closeResult?.error || 'database close failed', result }
    }
  } catch (error) {
    result.database = { error: error?.message || String(error) }
    return { success: false, error: error?.message || 'database close failed', result }
  }

  return { success: true, result }
}

function registerUpdaterIpc() {
  // IPC Handlers sent from the frontend
  async function checkForUpdatesWithFallback() {
    let lastError = null
    for (let index = 0; index < UPDATE_FEEDS.length; index++) {
      const feedUrl = UPDATE_FEEDS[index]
      try {
        autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl })
        if (index > 0) {
          sendStatusToWindow('主更新线路不可用，正在尝试备用线路...', 'checking', { feedUrl })
        }
        return await autoUpdater.checkForUpdates()
      } catch (error) {
        lastError = error
        console.error(`[Updater] check failed for ${feedUrl}:`, error)
      }
    }
    throw lastError || new Error('All update feeds failed')
  }

  ipcMain.handle('updater-check', async (_, options = {}) => {
    activeCheckOptions = { manual: Boolean(options && options.manual) }
    try {
      const result = await checkForUpdatesWithFallback()
      return { success: true, result }
    } catch (error) {
      console.error('updater-check failure:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('updater-download', async () => {
    try {
      removePathIfExists(getUpdaterCacheDir())
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) {
      console.error('updater-download failure:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('updater-preflight-check', async (_, options = {}) => {
    try {
      return runUpdaterPreflight(options)
    } catch (error) {
      return { success: false, ok: false, error: error?.message || String(error) }
    }
  })

  ipcMain.handle('updater-quit-install', async () => {
    const prepareResult = await prepareForUpdateInstall()
    if (!prepareResult.success) {
      return prepareResult
    }
    autoUpdater.quitAndInstall(false, true)
    return { success: true, prepareResult: prepareResult.result }
  })

  // Export projects, reset userData, then install the downloaded update.
  ipcMain.handle('updater-clear-and-install', async () => {
    const prepareResult = await prepareForUpdateInstall()
    if (!prepareResult.success) {
      return prepareResult
    }

    const resetResult = prepareUpgradeCompatibilityReset({
      force: true,
      reason: 'updater-clear-and-install'
    })
    if (!resetResult?.success) {
      console.error('[Updater] userData reset failed before install:', resetResult?.error)
      return { success: false, error: resetResult?.error || 'userData reset failed' }
    }

    console.log('[Updater] userData reset completed before install:', resetResult)
    autoUpdater.quitAndInstall(false, true)
    return { success: true, resetResult, prepareResult: prepareResult.result }
  })
}
