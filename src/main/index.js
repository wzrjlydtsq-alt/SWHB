/**
 * 星河智绘 (Xinghe Zhihui)
 * 开发者: 郭瑞凡 (Guo Ruifan)
 * 最早开发时间: 2026-03-20
 */
import { app, shell, BrowserWindow, ipcMain, protocol, net, session, crashReporter, dialog } from 'electron'
import { join } from 'path'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.ico?asset'
import { setupUpdater } from './updater.js'
import { createLogger, electronLog } from './logger.ts'
import { startUploadPrefixCleanupSchedule } from './engine/ossUploader.js'

let deleteCacheFile = () => ({ changes: 0 })
let getSetting = () => null
let setSetting = () => ({ changes: 0 })
let enableGpu = true

const databaseReady = import('./database.js').then((databaseModule) => {
  deleteCacheFile = databaseModule.deleteCacheFile
  getSetting = databaseModule.getSetting
  setSetting = databaseModule.setSetting
  configureGpuPreference()
})

const AUTH_DEEP_LINK_SCHEME = 'xinghe-zhihui'
const APP_USER_MODEL_ID = 'cn.lingjingxinghe.xinghezhihui'
const DEVTOOLS_PASSWORD_HASH_ENV = 'XINGHE_DEVTOOLS_PASSWORD_SHA256'
const DEVTOOLS_PASSWORD_ENV = 'XINGHE_DEVTOOLS_PASSWORD'
const DEVTOOLS_PASSWORD_FILE = 'devtools-password.sha256'
const DEVTOOLS_UNLOCK_TTL_MS = 30 * 60 * 1000
let mainWindowRef = null
let pendingAuthCallbackUrl = null
let appIsQuitting = false
let gpuFallbackQueued = false
let devToolsUnlockUntil = 0
let devToolsPasswordWindow = null
const RESPONSIVE_CLOSE_TIMEOUT_MS = 5000
const UNRESPONSIVE_CLOSE_TIMEOUT_MS = 1500

function sendAuthCallbackToRenderer(url) {
  pendingAuthCallbackUrl = url
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return

  if (mainWindowRef.isMinimized()) mainWindowRef.restore()
  mainWindowRef.focus()

  if (mainWindowRef.webContents.isLoading()) {
    mainWindowRef.webContents.once('did-finish-load', () => {
      mainWindowRef?.webContents.send('auth:platform-callback', url)
    })
    return
  }

  mainWindowRef.webContents.send('auth:platform-callback', url)
}

function pickAuthDeepLink(argv = []) {
  return argv.find((arg) => typeof arg === 'string' && arg.startsWith(`${AUTH_DEEP_LINK_SCHEME}://`))
}

function registerAuthDeepLinkProtocol() {
  try {
    if (app.isPackaged) {
      app.setAsDefaultProtocolClient(AUTH_DEEP_LINK_SCHEME)
      return
    }

    if (process.env.XINGHE_REGISTER_DEV_PROTOCOL === '1') {
      const appEntry = process.argv[1]
      const args = appEntry ? [path.resolve(appEntry)] : []
      app.setAsDefaultProtocolClient(AUTH_DEEP_LINK_SCHEME, process.execPath, args)
      console.warn('[main] Registered development deep link protocol handler')
      return
    }

    console.log('[main] Skipped development deep link protocol registration')
  } catch (error) {
    reportMainStartupError('protocol.register.failed', error, 'error')
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const callbackUrl = pickAuthDeepLink(argv)
    if (callbackUrl) sendAuthCallbackToRenderer(callbackUrl)
    else if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      if (mainWindowRef.isMinimized()) mainWindowRef.restore()
      mainWindowRef.focus()
    }
  })
}

app.on('open-url', (event, url) => {
  event.preventDefault()
  if (url?.startsWith(`${AUTH_DEEP_LINK_SCHEME}://`)) {
    sendAuthCallbackToRenderer(url)
  }
})

// ========== 主进程全局异常保护 ==========
const crashLogPath = (() => {
  try {
    const p = require('path')
    return p.join(app.getPath('userData'), 'crash.log')
  } catch {
    return null
  }
})()

const diagnosticQueuePath = (() => {
  try {
    const p = require('path')
    return p.join(app.getPath('userData'), 'diagnostics-pending.jsonl')
  } catch {
    return null
  }
})()

const writeCrashLog = (label, error) => {
  try {
    if (!crashLogPath) return
    const fs = require('fs')
    const entry = `[${new Date().toISOString()}] ${label}: ${error?.stack || error}\n`
    fs.appendFileSync(crashLogPath, entry, 'utf-8')
  } catch {
    /* ignore */
  }
}

const toHeaderByteString = (value) => {
  if (value == null) return ''
  return String(value)
    .replace(/[\r\n]/g, ' ')
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code === 9 || (code >= 32 && code <= 126) || (code >= 128 && code <= 255)
    })
    .join('')
}

const sanitizeResponseHeaders = (headers = {}) => {
  const sanitized = {}
  for (const [key, value] of Object.entries(headers || {})) {
    const safeKey = String(key || '')
      .replace(/[^!#$%&'*+\-.^_`|~0-9A-Za-z]/g, '')
      .toLowerCase()
    if (!safeKey) continue
    sanitized[safeKey] = Array.isArray(value)
      ? value.map(toHeaderByteString)
      : [toHeaderByteString(value)]
  }
  return sanitized
}

const sanitizeRequestHeaders = (headers = {}) => {
  const sanitized = {}
  const entries =
    headers && typeof headers.entries === 'function'
      ? Array.from(headers.entries())
      : Object.entries(headers || {})

  for (const [key, value] of entries) {
    const safeKey = String(key || '')
      .replace(/[^!#$%&'*+\-.^_`|~0-9A-Za-z]/g, '')
      .toLowerCase()
    if (!safeKey) continue
    sanitized[safeKey] = toHeaderByteString(value)
  }
  return sanitized
}

const toCrashDetail = (details) => {
  try {
    return JSON.stringify(details, null, 2)
  } catch {
    return String(details)
  }
}

const getProcessReason = (details) => String(details?.reason || '').toLowerCase()

const isGpuProcessGone = (details) => {
  const type = String(details?.type || '').toLowerCase()
  return type === 'gpu' || type.includes('gpu process')
}

const isExpectedProcessExit = (details, windowCloseRequested = false) => {
  const reason = getProcessReason(details)
  if (reason === 'clean-exit') return true
  return reason === 'killed' && (appIsQuitting || windowCloseRequested)
}

const getProcessGoneSeverity = (details) => {
  const reason = getProcessReason(details)
  if (reason === 'clean-exit') return 'info'
  if (isGpuProcessGone(details)) return 'fatal'
  if (['crashed', 'oom', 'launch-failed', 'integrity-failure'].includes(reason)) return 'fatal'
  if (reason === 'killed') return 'warn'
  return 'error'
}

const queueMainDiagnosticEvent = (event) => {
  try {
    if (!diagnosticQueuePath) return
    const fs = require('fs')
    const payload = {
      severity: event.severity || 'fatal',
      event_type: event.event_type || 'main_process_error',
      source: 'electron-main',
      message: String(event.message || ''),
      stack: event.stack ? String(event.stack) : undefined,
      context: event.context || {},
      created_at: new Date().toISOString()
    }
    fs.appendFileSync(diagnosticQueuePath, `${JSON.stringify(payload)}\n`, 'utf-8')
  } catch {
    /* ignore */
  }
}

const redactDiagnosticText = (value) =>
  String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(
      /(api[_-]?key|access[_-]?key|secret|token|password|authorization)(["'=:\s]+)[^"',\s}]+/gi,
      '$1$2[redacted]'
    )
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, 'sk-[redacted]')
    .replace(/AKIA[A-Z0-9]{16}/g, 'AKIA[redacted]')

const readTextTail = (filePath, maxChars = 12000) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return ''
    const content = fs.readFileSync(filePath, 'utf-8')
    return redactDiagnosticText(content.slice(-maxChars))
  } catch (error) {
    return `[read failed: ${error?.message || error}]`
  }
}

const formatDiagnosticSection = (title, content) => {
  const body = String(content || '').trim()
  return `\n## ${title}\n${body || '(empty)'}\n`
}

const createCopyableDiagnosticReport = () => {
  const logDir = app.getPath('logs')
  const windowUrl = (() => {
    try {
      return mainWindowRef?.webContents?.getURL?.() || ''
    } catch {
      return ''
    }
  })()
  const protocolCommand = (() => {
    if (process.platform !== 'win32') return null
    try {
      const { execFileSync } = require('child_process')
      return execFileSync(
        'reg.exe',
        ['query', `HKCU\\Software\\Classes\\${AUTH_DEEP_LINK_SCHEME}\\shell\\open\\command`, '/ve'],
        { encoding: 'utf-8', windowsHide: true }
      ).trim()
    } catch {
      return null
    }
  })()

  const summary = {
    createdAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    execPath: process.execPath,
    userDataPath: app.getPath('userData'),
    logsPath: logDir,
    windowUrl,
    protocolCommand
  }

  return [
    '# Xinghe Zhihui Diagnostic Report',
    'This text is safe to paste into a support chat. Common tokens, API keys, and passwords are redacted.',
    formatDiagnosticSection('Summary', redactDiagnosticText(JSON.stringify(summary, null, 2))),
    formatDiagnosticSection('Crash Log Tail', readTextTail(crashLogPath)),
    formatDiagnosticSection('Pending Main Diagnostics Tail', readTextTail(diagnosticQueuePath)),
    formatDiagnosticSection('App Log Tail', readTextTail(path.join(logDir, 'xinghe-zhihui.log'))),
    formatDiagnosticSection('Main Log Tail', readTextTail(path.join(logDir, 'main.log')))
  ].join('\n')
}

const reportMainStartupError = (label, error, severity = 'fatal') => {
  console.error(`[main] ${label}:`, error)
  writeCrashLog(label, error)
  queueMainDiagnosticEvent({
    severity,
    event_type: label,
    message: error?.message || error,
    stack: error?.stack,
    context: { name: error?.name }
  })
}

function normalizeDevToolsPasswordHash(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null
}

function hashDevToolsPassword(password) {
  return crypto.createHash('sha256').update(String(password || ''), 'utf8').digest('hex')
}

function readDevToolsPasswordHashFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null
    return normalizeDevToolsPasswordHash(fs.readFileSync(filePath, 'utf8').split(/\r?\n/)[0])
  } catch (error) {
    console.warn('[devtools] Failed to read password hash file:', error?.message || error)
    return null
  }
}

function getDevToolsPasswordHash() {
  const envHash = normalizeDevToolsPasswordHash(process.env[DEVTOOLS_PASSWORD_HASH_ENV])
  if (envHash) return envHash

  const envPassword = String(process.env[DEVTOOLS_PASSWORD_ENV] || '')
  if (envPassword) return hashDevToolsPassword(envPassword)

  const candidates = []
  try {
    candidates.push(path.join(app.getPath('userData'), DEVTOOLS_PASSWORD_FILE))
  } catch {
    /* ignore */
  }

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, DEVTOOLS_PASSWORD_FILE))
  }

  candidates.push(path.join(process.cwd(), 'resources', DEVTOOLS_PASSWORD_FILE))

  for (const candidate of candidates) {
    const fileHash = readDevToolsPasswordHashFile(candidate)
    if (fileHash) return fileHash
  }

  return null
}

function verifyDevToolsPassword(password, expectedHash) {
  const actualHash = normalizeDevToolsPasswordHash(hashDevToolsPassword(password))
  const normalizedExpectedHash = normalizeDevToolsPasswordHash(expectedHash)
  if (!actualHash || !normalizedExpectedHash) return false

  const actual = Buffer.from(actualHash, 'hex')
  const expected = Buffer.from(normalizedExpectedHash, 'hex')
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

function isProtectedDevToolsShortcut(input) {
  if (!input || input.type !== 'keyDown') return false
  if (input.code === 'F12') return true
  return input.code === 'KeyI' && ((input.control && input.shift) || (input.meta && input.alt))
}

function createDevToolsPasswordPromptHtml(nonce) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' data:; script-src 'unsafe-inline';" />
  <title>开发者模式验证</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
      color: #1f2937;
      background: #f7f8fb;
    }
    main {
      width: 100%;
      padding: 22px;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 17px;
      font-weight: 650;
    }
    label {
      display: block;
      margin-bottom: 8px;
      font-size: 13px;
      color: #4b5563;
    }
    input {
      width: 100%;
      height: 38px;
      padding: 0 11px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 14px;
      outline: none;
      background: #fff;
    }
    input:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 18px;
    }
    button {
      min-width: 74px;
      height: 34px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 13px;
      background: #fff;
      color: #1f2937;
      cursor: pointer;
    }
    button.primary {
      border-color: #2563eb;
      background: #2563eb;
      color: #fff;
    }
  </style>
</head>
<body>
  <main>
    <h1>开发者模式验证</h1>
    <form>
      <label for="password">请输入开发者密码</label>
      <input id="password" type="password" autocomplete="off" autofocus />
      <div class="actions">
        <button type="button" id="cancel">取消</button>
        <button type="submit" class="primary">打开</button>
      </div>
    </form>
  </main>
  <script>
    const { ipcRenderer } = require('electron')
    const nonce = ${JSON.stringify(nonce)}
    const passwordInput = document.getElementById('password')
    document.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault()
      ipcRenderer.send('devtools-password:submit', { nonce, password: passwordInput.value })
    })
    document.getElementById('cancel').addEventListener('click', () => {
      ipcRenderer.send('devtools-password:cancel', { nonce })
    })
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') ipcRenderer.send('devtools-password:cancel', { nonce })
    })
  </script>
</body>
</html>`
}

function promptForDevToolsPassword(parentWindow) {
  if (devToolsPasswordWindow && !devToolsPasswordWindow.isDestroyed()) {
    devToolsPasswordWindow.focus()
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    const nonce = crypto.randomBytes(16).toString('hex')
    let settled = false

    const finish = (password) => {
      if (settled) return
      settled = true
      ipcMain.removeListener('devtools-password:submit', onSubmit)
      ipcMain.removeListener('devtools-password:cancel', onCancel)
      const promptWindow = devToolsPasswordWindow
      devToolsPasswordWindow = null
      if (promptWindow && !promptWindow.isDestroyed()) promptWindow.close()
      resolve(password)
    }

    const onSubmit = (_event, payload) => {
      if (payload?.nonce !== nonce) return
      finish(String(payload.password || ''))
    }

    const onCancel = (_event, payload) => {
      if (payload?.nonce !== nonce) return
      finish(null)
    }

    ipcMain.on('devtools-password:submit', onSubmit)
    ipcMain.on('devtools-password:cancel', onCancel)

    devToolsPasswordWindow = new BrowserWindow({
      width: 380,
      height: 218,
      parent: parentWindow,
      modal: Boolean(parentWindow && !parentWindow.isDestroyed()),
      show: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      autoHideMenuBar: true,
      title: '开发者模式验证',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false
      }
    })

    devToolsPasswordWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    devToolsPasswordWindow.webContents.on('will-navigate', (event, url) => {
      if (!String(url || '').startsWith('data:text/html')) event.preventDefault()
    })
    devToolsPasswordWindow.on('ready-to-show', () => {
      if (devToolsPasswordWindow && !devToolsPasswordWindow.isDestroyed()) {
        devToolsPasswordWindow.show()
      }
    })
    devToolsPasswordWindow.on('closed', () => finish(null))
    devToolsPasswordWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(createDevToolsPasswordPromptHtml(nonce))}`
    )
  })
}

async function toggleDevToolsWithPassword(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) return

  const { webContents } = targetWindow
  if (webContents.isDevToolsOpened()) {
    webContents.closeDevTools()
    return
  }

  const configuredHash = getDevToolsPasswordHash()
  if (!configuredHash) {
    await dialog.showMessageBox(targetWindow, {
      type: 'warning',
      title: '开发者模式未配置',
      message: '尚未配置开发者密码，无法打开开发者模式。',
      detail: `请设置 ${DEVTOOLS_PASSWORD_HASH_ENV}，或放置 ${DEVTOOLS_PASSWORD_FILE} 后重启应用。`,
      buttons: ['知道了']
    })
    return
  }

  if (Date.now() > devToolsUnlockUntil) {
    const password = await promptForDevToolsPassword(targetWindow)
    if (password === null) return

    if (!verifyDevToolsPassword(password, configuredHash)) {
      await dialog.showMessageBox(targetWindow, {
        type: 'error',
        title: '密码错误',
        message: '开发者密码不正确。',
        buttons: ['知道了']
      })
      return
    }

    devToolsUnlockUntil = Date.now() + DEVTOOLS_UNLOCK_TTL_MS
  }

  webContents.openDevTools({ mode: 'undocked' })
}

function setupProtectedDevToolsShortcut(targetWindow) {
  if (is.dev || !targetWindow || targetWindow.isDestroyed()) return

  targetWindow.webContents.on('before-input-event', (event, input) => {
    if (!isProtectedDevToolsShortcut(input)) return
    event.preventDefault()
    toggleDevToolsWithPassword(targetWindow).catch((error) => {
      reportMainStartupError('devtools.unlock.failed', error, 'error')
    })
  })
}

function isTrustedRendererUrl(url = '') {
  if (!url) return true
  if (url.startsWith('file://')) return true
  if (url.startsWith('xinghe://')) return true
  if (!is.dev) return false

  try {
    const parsed = new URL(url)
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(parsed.hostname)
  } catch {
    return false
  }
}

function setupRendererMediaPermissions() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details = {}) => {
    const mediaTypes = Array.isArray(details.mediaTypes) ? details.mediaTypes : []
    const wantsAudio =
      permission === 'media' && (mediaTypes.length === 0 || mediaTypes.includes('audio'))
    const requestUrl = details.requestingUrl || webContents?.getURL?.() || ''

    callback(Boolean(wantsAudio && isTrustedRendererUrl(requestUrl)))
  })

  session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details = {}) => {
    const mediaTypes = Array.isArray(details.mediaTypes) ? details.mediaTypes : []
    const wantsAudio =
      permission === 'media' && (mediaTypes.length === 0 || mediaTypes.includes('audio'))

    return Boolean(wantsAudio && isTrustedRendererUrl(requestingOrigin))
  })
}

try {
  crashReporter.start({ uploadToServer: false })
} catch (error) {
  writeCrashLog('crashReporter.start.failed', error)
}

process.on('uncaughtException', (error) => {
  console.error('[主进程] 未捕获异常:', error)
  writeCrashLog('uncaughtException', error)
  queueMainDiagnosticEvent({
    event_type: 'main_uncaught_exception',
    message: error?.message || error,
    stack: error?.stack,
    context: { name: error?.name }
  })
  try {
    const { dialog: d } = require('electron')
    d.showErrorBox(
      '星河智绘 - 启动错误',
      `应用遇到错误:\n${error?.message || error}\n\n日志已写入: ${crashLogPath}`
    )
  } catch {
    /* ignore */
  }
})
process.on('unhandledRejection', (reason) => {
  console.error('[主进程] 未处理的 Promise 拒绝:', reason)
  writeCrashLog('unhandledRejection', reason)
  queueMainDiagnosticEvent({
    event_type: 'main_unhandled_rejection',
    message: reason?.message || reason,
    stack: reason?.stack,
    context: { name: reason?.name }
  })
})

// ========== GPU rendering control ==========
function configureGpuPreference() {
  enableGpu = getSetting('tapnow_enableGpu') !== 'false'
  if (!enableGpu) {
    if (!app.isReady()) {
      app.disableHardwareAcceleration()
      app.commandLine.appendSwitch('disable-gpu')
    }
    console.log('[main] Hardware acceleration disabled by user setting')
  } else {
    console.log('[main] Hardware acceleration enabled')
  }
}

const disableGpuForNextLaunch = (source, context = {}) => {
  if (!enableGpu || gpuFallbackQueued) return
  gpuFallbackQueued = true

  try {
    const disabledAt = new Date().toISOString()
    setSetting('tapnow_enableGpu', 'false')
    setSetting('tapnow_gpu_auto_disabled_at', disabledAt)
    setSetting('tapnow_gpu_auto_disabled_reason', source)
    writeCrashLog('gpu-auto-disabled-next-launch', toCrashDetail({ source, disabledAt, context }))
    queueMainDiagnosticEvent({
      severity: 'warn',
      event_type: 'electron_gpu_auto_disabled',
      message: 'GPU hardware acceleration disabled for next launch',
      context: { source, disabled_at: disabledAt, ...context }
    })
  } catch (error) {
    writeCrashLog('gpu-auto-disable.failed', error)
  }
}

app.on('child-process-gone', (_event, details) => {
  writeCrashLog('child-process-gone', toCrashDetail(details))
  if (isExpectedProcessExit(details)) {
    writeCrashLog('child-process-gone.expected', toCrashDetail(details))
    return
  }

  const severity = getProcessGoneSeverity(details)
  queueMainDiagnosticEvent({
    severity,
    event_type: 'electron_child_process_gone',
    message: `${details?.type || 'child'} ${details?.reason || 'gone'}`,
    context: details
  })
  if (isGpuProcessGone(details)) {
    disableGpuForNextLaunch('child-process-gone', { details })
    console.error('[main] GPU process gone:', details)
  }
})

app.on('gpu-process-crashed', (_event, killed) => {
  writeCrashLog('gpu-process-crashed', toCrashDetail({ killed }))
  if (appIsQuitting && killed) {
    writeCrashLog('gpu-process-crashed.expected', toCrashDetail({ killed }))
    return
  }

  disableGpuForNextLaunch('gpu-process-crashed', { killed })
  queueMainDiagnosticEvent({
    event_type: 'electron_gpu_process_crashed',
    message: 'GPU process crashed',
    context: { killed }
  })
  console.error('[main] GPU process crashed:', { killed })
})

app.on('before-quit', () => {
  appIsQuitting = true
  writeCrashLog('before-quit', 'Application is preparing to quit')
})

app.on('will-quit', () => {
  appIsQuitting = true
  writeCrashLog('will-quit', 'Application will quit')
})

app.on('quit', (_event, exitCode) => {
  writeCrashLog('quit', toCrashDetail({ exitCode }))
})

function createWindow() {
  let windowCloseRequested = false
  let rendererUnresponsive = false
  let closeForceTimer = null

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
  setupProtectedDevToolsShortcut(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('close', () => {
    windowCloseRequested = true
    writeCrashLog('main-window-close', 'Main window close requested')
    if (closeForceTimer) clearTimeout(closeForceTimer)
    const timeoutMs = rendererUnresponsive ? UNRESPONSIVE_CLOSE_TIMEOUT_MS : RESPONSIVE_CLOSE_TIMEOUT_MS
    closeForceTimer = setTimeout(() => {
      if (!mainWindow.isDestroyed()) {
        writeCrashLog(
          'main-window-close-force-destroy',
          toCrashDetail({ timeoutMs, rendererUnresponsive })
        )
        mainWindow.destroy()
      }
    }, timeoutMs)
    closeForceTimer.unref?.()
  })

  mainWindow.on('closed', () => {
    windowCloseRequested = true
    if (closeForceTimer) {
      clearTimeout(closeForceTimer)
      closeForceTimer = null
    }
    writeCrashLog('main-window-closed', 'Main window closed')
  })

  mainWindow.on('unresponsive', () => {
    rendererUnresponsive = true
    writeCrashLog('main-window-unresponsive', 'Renderer became unresponsive')
    queueMainDiagnosticEvent({
      severity: 'error',
      event_type: 'electron_window_unresponsive',
      message: 'main window renderer became unresponsive'
    })
  })

  mainWindow.on('responsive', () => {
    rendererUnresponsive = false
    writeCrashLog('main-window-responsive', 'Renderer became responsive')
  })

  let crashCount = 0
  const MAX_CRASH_RELOADS = 3

  // 渲染进程崩溃保护：自动重新加载（限制次数）
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[main] renderer process gone:', details)
    writeCrashLog('render-process-gone', toCrashDetail(details))
    if (isExpectedProcessExit(details, windowCloseRequested)) {
      writeCrashLog('render-process-gone.expected', toCrashDetail(details))
      return
    }

    queueMainDiagnosticEvent({
      severity: getProcessGoneSeverity(details),
      event_type: 'electron_render_process_gone',
      message: `renderer ${details?.reason || 'gone'}`,
      context: details
    })
    if (details.reason !== 'clean-exit' && crashCount < MAX_CRASH_RELOADS) {
      crashCount++
      console.warn(`[main] reloading renderer after crash (${crashCount}/${MAX_CRASH_RELOADS})`)
      setTimeout(() => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.reload()
        }
      }, 1000)
    } else if (crashCount >= MAX_CRASH_RELOADS) {
      console.error('[main] renderer crashed too many times; stop automatic reload')
      writeCrashLog('render-process-gone.reload-limit', toCrashDetail({ crashCount, details }))
    }
  })

  mainWindow.webContents.on('did-finish-load', () => {
    if (crashCount > 0) {
      setTimeout(() => {
        if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
          crashCount = 0
        }
      }, 30_000)
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

  // Hook up the updater IPC. The renderer decides whether startup checks are enabled.
  try {
    setupUpdater(mainWindow)
  } catch (error) {
    reportMainStartupError('updater.setup.failed', error, 'error')
  }

  return mainWindow
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'xinghe',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true
    }
  }
])

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  try {
    await databaseReady
  } catch (error) {
    reportMainStartupError('database.init.failed', error)
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId(APP_USER_MODEL_ID)
  registerAuthDeepLinkProtocol()
  setupRendererMediaPermissions()

  // 允许跨域资源加载（AI 生成的图片/视频 URL），仅限外部 API 请求
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = sanitizeResponseHeaders(details.responseHeaders)

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
        responseHeaders['access-control-allow-origin'] = ['*']
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
      if (!filePath) {
        console.warn(`[Xinghe Protocol] Missing file path in URL: ${request.url}`)
        return new Response('Missing file path', { status: 400 })
      }

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

        markMissingLocalCacheFile(filePath)
        console.warn(`[Xinghe Protocol] File not found: ${filePath}`)
        return createMissingMediaResponse(filename)
      }

      return serveFileWithRange(request, filePath)
    } catch (err) {
      console.error('[Xinghe Protocol] Error:', err)
      return new Response('Internal Server Error', { status: 500 })
    }
  })

  function markMissingLocalCacheFile(filePath) {
    try {
      deleteCacheFile(filePath)
    } catch (e) {
      console.warn('[Xinghe Protocol] Failed to remove missing cache index:', e.message)
    }
  }

  function createMissingMediaResponse(filename = '') {
    const ext = path.extname(filename).toLowerCase()
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'].includes(ext)
    if (!isImage) {
      return new Response('File not found', { status: 404 })
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100" viewBox="0 0 160 100">
      <rect width="160" height="100" rx="10" fill="#202433"/>
      <path d="M54 62l16-18 14 14 8-9 18 22H44z" fill="#3b4257"/>
      <circle cx="104" cy="34" r="8" fill="#4b5568"/>
      <text x="80" y="86" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#9ca3af">Missing file</text>
    </svg>`
    return new Response(Buffer.from(svg, 'utf-8'), {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    })
  }

  // 抽出一个独立函数处理包含 Range 头的文件流
  async function serveFileWithRange(request, targetPath) {
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
      const isHead = String(request.method || '').toUpperCase() === 'HEAD'

      // MIME 类型简单映射
      const mimeTypes = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.ogg': 'video/ogg'
      }
      const contentType = mimeTypes[ext] || 'video/mp4'
      const baseHeaders = {
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Timing-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      }

      const createFileResponseStream = (options = {}) => {
        const fileStream = fs.createReadStream(targetPath, options)
        return new ReadableStream({
          start(controller) {
            fileStream.on('data', (chunk) => controller.enqueue(chunk))
            fileStream.on('end', () => controller.close())
            fileStream.on('error', (error) => controller.error(error))
          },
          cancel() {
            fileStream.destroy()
          }
        })
      }

      if (isHead) {
        return new Response(null, {
          status: 200,
          headers: {
            ...baseHeaders,
            'Content-Length': String(fileSize)
          }
        })
      }

      if (range) {
        // 请求中包含 Range 头 (形如 bytes=0-1000)
        const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim())
        if (!match) {
          return new Response('Requested range not satisfiable', {
            status: 416,
            headers: { ...baseHeaders, 'Content-Range': `bytes */${fileSize}` }
          })
        }

        let start
        let end
        if (match[1] === '' && match[2] !== '') {
          const suffixLength = Number.parseInt(match[2], 10)
          start = Math.max(fileSize - suffixLength, 0)
          end = fileSize - 1
        } else {
          start = Number.parseInt(match[1], 10)
          end = match[2] ? Number.parseInt(match[2], 10) : fileSize - 1
        }

        if (!Number.isFinite(start) || !Number.isFinite(end)) {
          return new Response('Requested range not satisfiable', {
            status: 416,
            headers: { ...baseHeaders, 'Content-Range': `bytes */${fileSize}` }
          })
        }

        end = Math.min(end, fileSize - 1)

        if (fileSize <= 0 || start >= fileSize || start < 0 || end < start) {
          return new Response('Requested range not satisfiable', {
            status: 416,
            headers: { ...baseHeaders, 'Content-Range': `bytes */${fileSize}` }
          })
        }

        const chunkSize = end - start + 1

        return new Response(createFileResponseStream({ start, end }), {
          status: 206,
          headers: {
            ...baseHeaders,
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Content-Length': String(chunkSize)
          }
        })
      } else {
        // 没有 Range, 返回整个视频流
        return new Response(createFileResponseStream(), {
          status: 200,
          headers: {
            ...baseHeaders,
            'Content-Length': String(fileSize)
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

  ipcMain.handle('auth:open-platform-login', async () => {
    const loginUrl = new URL(process.env.PLATFORM_LOGIN_URL || 'https://www.lingjingxinghe.cn/login')
    loginUrl.searchParams.set('client', 'xinghe-zhihui-desktop')
    loginUrl.searchParams.set('redirect_uri', `${AUTH_DEEP_LINK_SCHEME}://auth/callback`)
    loginUrl.searchParams.set('state', `${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await shell.openExternal(loginUrl.toString())
    return { success: true, url: loginUrl.toString() }
  })

  try {
    const { runAppMigrations } = await import('./migrationRunner.js')
    const migrationResult = runAppMigrations()
    if (migrationResult?.skipped) {
      console.log(`[migration] Data schema already current: ${migrationResult.toVersion}`)
    } else {
      console.log(
        `[migration] Data schema migrated: ${migrationResult.fromVersion} -> ${migrationResult.toVersion}`
      )
    }
  } catch (error) {
    console.error('[migration] Data migration failed:', error)
    writeCrashLog('migration.failed', error)
    queueMainDiagnosticEvent({
      severity: 'error',
      event_type: 'data_migration_failed',
      message: error?.message || error,
      stack: error?.stack
    })
  }

  try {
    const { setupIpcHandlers } = await import('./ipcHandlers.js')
    setupIpcHandlers()
  } catch (error) {
    reportMainStartupError('ipc.setup.failed', error)
  }

  try {
    startUploadPrefixCleanupSchedule({
      prefix: 'uploads/',
      olderThanMs: 60 * 60 * 1000,
      intervalMs: 60 * 60 * 1000
    })
  } catch (error) {
    reportMainStartupError('upload-cleanup-schedule.setup.failed', error, 'error')
  }

  // ========== 飞书机器人集成 ==========
  try {
    const { FeishuBridge } = await import('./feishu/FeishuBridge.js')
    const feishuBridge = new FeishuBridge()
    const feishuEnabled = getSetting('feishu_enabled')
    if (feishuEnabled === 'true') {
      feishuBridge.start()
      console.log('[主进程] 飞书机器人网关已启动')
    } else {
      console.log('[主进程] 飞书机器人未启用')
    }
  } catch (err) {
    console.error('[主进程] 飞书模块初始化失败（非致命）:', err.message)
  }

  // ========== 渲染进程日志转发 ==========
  const rendererLog = createLogger('Renderer')
  ipcMain.handle('renderer-log', (_event, { level, message }) => {
    if (level === 'error') rendererLog.error(message)
    else if (level === 'warn') rendererLog.warn(message)
    else rendererLog.info(message)
  })

  ipcMain.handle('diagnostics:drain-main-events', () => {
    try {
      if (!diagnosticQueuePath || !fs.existsSync(diagnosticQueuePath)) return []
      const raw = fs.readFileSync(diagnosticQueuePath, 'utf-8')
      fs.writeFileSync(diagnosticQueuePath, '', 'utf-8')
      return raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(-50)
        .map((line) => {
          try {
            return JSON.parse(line)
          } catch {
            return null
          }
        })
        .filter(Boolean)
    } catch (error) {
      writeCrashLog('diagnostics.drain.failed', error)
      return []
    }
  })

  // 将 electron-log 初始化为 console 替代（使得 console.log 也写入文件）
  ipcMain.handle('diagnostics:create-report', () => {
    try {
      return { success: true, text: createCopyableDiagnosticReport() }
    } catch (error) {
      writeCrashLog('diagnostics.create-report.failed', error)
      return { success: false, error: error?.message || String(error) }
    }
  })

  ipcMain.handle('diagnostics:export-package', async () => {
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const targetDir = path.join(app.getPath('downloads'), `xinghe-diagnostics-${stamp}`)
      fs.mkdirSync(targetDir, { recursive: true })
      const files = [
        { name: 'crash.log', path: crashLogPath },
        { name: 'diagnostics-pending.jsonl', path: diagnosticQueuePath },
        { name: 'main.log', path: path.join(app.getPath('logs'), 'main.log') },
        { name: 'xinghe-zhihui.log', path: path.join(app.getPath('logs'), 'xinghe-zhihui.log') },
        { name: 'release-notes.md', path: path.join(process.cwd(), 'release-notes.md') }
      ]
      const copied = []
      for (const item of files) {
        try {
          if (item.path && fs.existsSync(item.path)) {
            fs.copyFileSync(item.path, path.join(targetDir, item.name))
            copied.push({ name: item.name, source: item.path })
          }
        } catch (error) {
          copied.push({ name: item.name, error: error?.message || String(error) })
        }
      }
      let protocolCommand = null
      if (process.platform === 'win32') {
        try {
          const { execFileSync } = await import('child_process')
          protocolCommand = execFileSync(
            'reg.exe',
            ['query', `HKCU\\Software\\Classes\\${AUTH_DEEP_LINK_SCHEME}\\shell\\open\\command`, '/ve'],
            { encoding: 'utf-8', windowsHide: true }
          )
        } catch {
          protocolCommand = null
        }
      }
      const manifestPath = path.join(targetDir, 'manifest.json')
      fs.writeFileSync(
        manifestPath,
        JSON.stringify(
          {
            createdAt: new Date().toISOString(),
            appVersion: app.getVersion(),
            isPackaged: app.isPackaged,
            platform: process.platform,
            arch: process.arch,
            execPath: process.execPath,
            userDataPath: app.getPath('userData'),
            logsPath: app.getPath('logs'),
            protocolCommand,
            copied
          },
          null,
          2
        ),
        'utf-8'
      )
      shell.showItemInFolder(manifestPath)
      return { success: true, path: targetDir, copied }
    } catch (error) {
      writeCrashLog('diagnostics.export.failed', error)
      return { success: false, error: error?.message || String(error) }
    }
  })

  try {
    electronLog.initialize()
  } catch (error) {
    reportMainStartupError('logger.initialize.failed', error, 'error')
  }

  // ========== Version marker ==========
  const versionFilePath = path.join(app.getPath('userData'), '.app_version')
  const currentVersion = app.getVersion()
  let previousVersion = null
  try {
    if (fs.existsSync(versionFilePath)) {
      previousVersion = fs.readFileSync(versionFilePath, 'utf-8').trim()
    }
  } catch (e) {
    console.warn('[版本检测] 读取旧版本号失败:', e.message)
  }

  if (previousVersion && previousVersion !== currentVersion) {
    try {
      setSetting(
        'tapnow_pending_update_health_check',
        JSON.stringify({
          fromVersion: previousVersion,
          toVersion: currentVersion,
          detectedAt: new Date().toISOString()
        })
      )
    } catch (e) {
      console.warn('[version] Failed to mark pending health check:', e.message)
    }
    console.log(`[版本检测] 检测到版本变更: ${previousVersion} → ${currentVersion}`)
  }

  try {
    fs.writeFileSync(versionFilePath, currentVersion, 'utf-8')
  } catch (e) {
    console.warn('[版本检测] 写入版本号失败:', e.message)
  }

  try {
    mainWindowRef = createWindow()
  } catch (error) {
    reportMainStartupError('main-window.create.failed', error)
    try {
      const { dialog } = await import('electron')
      dialog.showErrorBox(
        '星河智绘 - 启动失败',
        `主窗口创建失败：\n${error?.message || error}\n\n日志已写入：${crashLogPath || app.getPath('userData')}`
      )
    } catch {
      /* ignore */
    }
  }
  if (pendingAuthCallbackUrl) {
    sendAuthCallbackToRenderer(pendingAuthCallbackUrl)
  }

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      try {
        mainWindowRef = createWindow()
      } catch (error) {
        reportMainStartupError('main-window.recreate.failed', error)
      }
    }
  })
}).catch((error) => {
  reportMainStartupError('app.whenReady.failed', error)
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    appIsQuitting = true
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
