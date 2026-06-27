import {
  ipcMain,
  app,
  dialog,
  BrowserWindow,
  session,
  shell,
  safeStorage,
  clipboard,
  nativeImage
} from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import Database from 'better-sqlite3'
import { exec, spawn, execFileSync } from 'child_process'
import ffmpegStaticPath from 'ffmpeg-static'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { globalTaskQueue, sanitizeTaskForRenderer } from './engine/TaskQueue.js'
import { TaskExecutor } from './engine/TaskExecutor.js'
import {
  uploadFileToOSS,
  uploadBufferToOSS,
  setRuntimeOssConfig,
  getRuntimeOssStatus
} from './engine/ossUploader.js'
import {
  callVodOpenApi,
  clearVodCredentialConfig,
  getVodCredentialStatus,
  hasVodCredentials,
  saveVodCredentialConfig,
  vodAiTranslationActions
} from './engine/volcVodAiTranslation.js'
import {
  createAssetGroup,
  getOrCreateDefaultGroup,
  getAssetGroup,
  listAssetGroups,
  updateAssetGroup,
  createAsset,
  getAsset,
  pollAssetUntilReady,
  listAssets,
  updateAsset,
  setRuntimeArkConfig,
  getRuntimeArkStatus
} from './engine/arkAssetApi.js'
import { collectStatsCached, incrementIpcCount } from './systemMonitor.js'
import mainDb, {
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
  cleanupOrphanData,
  upsertCacheFile,
  deleteCacheFile,
  deleteCacheFiles
} from './database.js'
import {
  generateThumbnail,
  getCachedVideoThumbnail,
  saveVideoThumbnail
} from './thumbnailService.js'
import {
  saveProjectJSON,
  saveProjectJSONSync,
  loadProjectJSON,
  listProjectsJSON,
  deleteProjectJSON,
  repairProjectJSON,
  getProjectsDir
} from './projectFileService.js'
import { DATA_SCHEMA_VERSION } from './migrationRunner.js'
import { PROJECT_SCHEMA_VERSION } from './projectDataRepair.js'

export let currentConfig = null
let ipcHandlersInstalled = false
const terminalSessions = new Map()
const workspaceBrowserSessions = new Map()
let nativeFileDialogOpen = false
const pendingShellOpenPaths = new Set()
const thumbnailJobQueue = []
let thumbnailJobRunning = false

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif'])
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'])

const PROMPTPILOT_MODES = new Set(['generate', 'optimize', 'check'])
const AGENTPILOT_MODEL = 'doubao-seed-1.6-250615'
const AGENTPILOT_API_URL = 'https://prompt-pilot.cn-beijing.volces.com'
const AGENTPILOT_API_KEY = 'cfd397b3-5592-4494-931c-3cc2150f0f2b'
const AGENTPILOT_WORKSPACE_ID = 'ws-20260407032632-NtoRg'

function buildPromptPilotTask({ mode, text, context }) {
  const target = context?.target === 'video' ? 'AI 视频生成' : 'AI 绘图生成'
  if (mode === 'generate') {
    return {
      rule: [
        `请根据下面的用户需求生成一段可直接用于${target}的高质量 Prompt。`,
        '要求：明确主体、场景、动作、风格、镜头/构图、光影、质感和必要限制；保留用户明确给出的变量或 @ 引用。',
        '只输出最终 Prompt 文本，不要寒暄、免责声明或 Markdown 代码块。',
        '',
        text
      ].join('\n')
    }
  }

  if (mode === 'optimize') {
    return {
      rule: [
        `请优化当前用于${target}的 Prompt，让模型更容易理解并稳定生成。`,
        '要求：补足缺失信息、消除歧义、整理顺序、强化画面描述；保留原意、变量、@ 引用和关键限制。',
        '只输出优化后的 Prompt 文本，不要寒暄、免责声明或 Markdown 代码块。'
      ].join('\n'),
      currentPrompt: text,
      feedback: '保留原意、变量、@ 引用和用户已有的限制条件。'
    }
  }

  return {
    rule: [
      `请检查并修订当前用于${target}的 Prompt，让它更清晰、完整、可执行。`,
      '要求：补足必要信息、消除歧义、删掉冗余或冲突描述；保留原意、变量、@ 引用和关键限制。',
      '只输出修订后的完整 Prompt 文本，不要输出检查报告、解释、寒暄、免责声明或 Markdown 代码块。'
    ].join('\n'),
    currentPrompt: text,
    feedback: '重点修订描述缺口、歧义、画面信息不足和生成约束不清的问题。'
  }
}

function parseAgentPilotStream(raw) {
  const pieces = []
  const errors = []
  let eventName = ''

  for (const line of String(raw || '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) {
      eventName = ''
      continue
    }
    if (trimmed.startsWith('event:')) {
      eventName = trimmed.slice('event:'.length).trim()
      continue
    }
    if (!trimmed.startsWith('data:')) continue

    const dataText = trimmed.slice('data:'.length).trim()
    let data = dataText
    try {
      data = JSON.parse(dataText)
    } catch {
      data = dataText.replace(/^"|"$/g, '')
    }

    if (eventName === 'error') {
      errors.push(
        typeof data === 'string' ? data : data?.message || data?.error?.message || JSON.stringify(data)
      )
      continue
    }
    if (eventName && eventName !== 'message') continue

    if (typeof data === 'string') {
      pieces.push(data)
    } else if (typeof data?.content === 'string') {
      pieces.push(data.content)
    } else if (typeof data?.text === 'string') {
      pieces.push(data.text)
    } else if (typeof data?.delta === 'string') {
      pieces.push(data.delta)
    }
  }

  return { text: pieces.join('').trim(), error: errors.filter(Boolean).join('\n') }
}

async function runAgentPilotPromptText({ mode, text, context }) {
  const apiUrl = AGENTPILOT_API_URL.replace(/\/+$/, '')
  const model = AGENTPILOT_MODEL
  const endpoint = `${apiUrl}/agent-pilot?Version=2024-01-01&Action=GeneratePromptStream`
  const task = buildPromptPilotTask({ mode, text, context })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AGENTPILOT_API_KEY}`
      },
      body: JSON.stringify({
        Rule: task.rule,
        CurrentPrompt: task.currentPrompt,
        Feedback: task.feedback,
        Temperature: mode === 'check' ? 0.2 : 0.7,
        TopP: 0.7,
        ModelName: model,
        TaskType: 'DEFAULT',
        RequestId: crypto.randomUUID(),
        workspace_id: AGENTPILOT_WORKSPACE_ID
      })
    })

    const raw = await response.text()
    if (!response.ok) {
      let data = null
      try {
        data = raw ? JSON.parse(raw) : null
      } catch {
        data = null
      }
      const message = data?.error?.message || data?.message || raw || response.statusText
      return { success: false, error: `PromptPilot 调用失败：${message}` }
    }

    const parsed = parseAgentPilotStream(raw)
    if (parsed.error) {
      return { success: false, error: `PromptPilot 调用失败：${parsed.error}` }
    }
    if (!parsed.text) {
      return { success: false, error: 'PromptPilot 没有返回文本结果' }
    }

    return {
      success: true,
      mode,
      text: parsed.text,
      model,
      provider: 'agentpilot'
    }
  } catch (err) {
    const isAbort = err?.name === 'AbortError'
    return {
      success: false,
      error: isAbort ? 'PromptPilot 调用超时' : err?.message || String(err)
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function runPromptPilotText(payload = {}) {
  const mode = String(payload.mode || '').trim()
  if (!PROMPTPILOT_MODES.has(mode)) {
    return { success: false, error: '不支持的 PromptPilot 操作' }
  }

  const text = String(payload.text || '').trim()
  if (!text) {
    return { success: false, error: '请先输入文本' }
  }

  return runAgentPilotPromptText({
    mode,
    text,
    context: payload.context || {}
  })
}

const ALLOWED_CLOUD_API_HOSTS = new Set([
  '47.109.138.168',
  'www.lingjingxinghe.cn',
  'lingjingxinghe.cn',
  'www.lingjingxinghe.top',
  'lingjingxinghe.top',
  'new.lingjingxinghe.cn',
  'prod.lingjingxinghe.cn',
  '127.0.0.1',
  'localhost'
])

function hasArrayItems(value) {
  return Array.isArray(value) && value.length > 0
}

function readProjectSettingsHistory(projectId) {
  try {
    const raw = getSetting(`tapnow_history_v2_${projectId}`)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.warn('[project:load] Failed to read project settings history:', error.message)
    return []
  }
}

function getFallbackHistoryByProject(projectId) {
  const settingsHistory = readProjectSettingsHistory(projectId)
  if (hasArrayItems(settingsHistory)) return settingsHistory
  return getHistoryByProject(projectId, 10000)
}

function loadProjectWithLegacySqliteFallback(id, options = {}) {
  const persist = options.persist !== false
  const data = loadProjectJSON(id)
  const hasJsonNodes = hasArrayItems(data?.nodes)
  const fallbackHistory = !hasArrayItems(data?.history) ? getFallbackHistoryByProject(id) : []

  if (hasJsonNodes) {
    if (!hasArrayItems(fallbackHistory)) return data

    const restored = {
      ...data,
      history: fallbackHistory,
      lastLegacySqliteRestore: {
        ...(data?.lastLegacySqliteRestore || {}),
        restoredAt: new Date().toISOString(),
        historyCount: fallbackHistory.length
      }
    }
    if (persist) {
      saveProjectJSON(id, restored)
      return loadProjectJSON(id) || restored
    }
    return restored
  }

  const legacyNodes = getNodesByProject(id)
  if (!hasArrayItems(legacyNodes)) {
    if (data && hasArrayItems(fallbackHistory)) {
      const restored = {
        ...data,
        history: fallbackHistory,
        lastLegacySqliteRestore: {
          ...(data?.lastLegacySqliteRestore || {}),
          restoredAt: new Date().toISOString(),
          historyCount: fallbackHistory.length
        }
      }
      if (persist) {
        saveProjectJSON(id, restored)
        return loadProjectJSON(id) || restored
      }
      return restored
    }
    return data
  }

  const legacyProject = getProject(id) || {}
  const legacyConnections = getConnectionsByProject(id)
  const restored = {
    ...(data || {}),
    id,
    name: data?.name || legacyProject.name || '未命名项目',
    folderId: data?.folderId || legacyProject.folder_id || null,
    nodes: legacyNodes,
    connections: hasArrayItems(data?.connections) ? data.connections : legacyConnections,
    history: hasArrayItems(data?.history) ? data.history : fallbackHistory,
    lastLegacySqliteRestore: {
      restoredAt: new Date().toISOString(),
      nodesCount: legacyNodes.length,
      connectionsCount: legacyConnections.length,
      historyCount: fallbackHistory.length
    }
  }

  if (!data && legacyProject.created_at) {
    restored.createdAt = new Date(legacyProject.created_at).toISOString()
  }
  if (legacyProject.updated_at) {
    restored.updatedAt = new Date(legacyProject.updated_at).toISOString()
  }

  if (persist) {
    saveProjectJSON(id, restored)
    return loadProjectJSON(id) || restored
  }
  return restored
}

const OSS_CONFIG_SETTING_KEY = 'xinghe_oss_runtime_config_v1'
const ARK_ASSET_CONFIG_SETTING_KEY = 'xinghe_ark_asset_runtime_config_v1'

function encryptSecretText(value) {
  if (!value) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统安全存储不可用，无法保存服务密钥')
  }
  return safeStorage.encryptString(String(value)).toString('base64')
}

function decryptSecretText(value) {
  if (!value) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统安全存储不可用，无法读取服务密钥')
  }
  return safeStorage.decryptString(Buffer.from(String(value), 'base64'))
}

function readStoredOssConfig({ includeSecrets = false } = {}) {
  const raw = getSetting(OSS_CONFIG_SETTING_KEY)
  if (!raw) return null
  const data = JSON.parse(raw)
  const config = {
    region: data.region || '',
    bucket: data.bucket || '',
    endpoint: data.endpoint || '',
    publicUrl: data.publicUrl || '',
    updatedAt: data.updatedAt || null,
    hasStoredAccessKeyId: Boolean(data.accessKeyIdEncrypted),
    hasStoredAccessKeySecret: Boolean(data.accessKeySecretEncrypted)
  }
  if (includeSecrets) {
    config.accessKeyId = decryptSecretText(data.accessKeyIdEncrypted)
    config.accessKeySecret = decryptSecretText(data.accessKeySecretEncrypted)
  }
  return config
}

function applyStoredOssConfig() {
  try {
    const stored = readStoredOssConfig({ includeSecrets: true })
    if (stored?.accessKeyId && stored?.accessKeySecret) {
      setRuntimeOssConfig(stored)
    }
    return stored
  } catch (error) {
    console.warn('[oss:config] Failed to apply stored config:', error.message || error)
    return null
  }
}

function getOssConfigStatus() {
  const stored = readStoredOssConfig()
  const runtime = getRuntimeOssStatus()
  return {
    success: true,
    ...runtime,
    storedConfigured: Boolean(stored?.hasStoredAccessKeyId && stored?.hasStoredAccessKeySecret),
    safeStorageAvailable: safeStorage.isEncryptionAvailable(),
    source: stored?.hasStoredAccessKeyId && stored?.hasStoredAccessKeySecret
      ? 'settings'
      : runtime.envConfigured
        ? 'environment'
        : 'none',
    region: stored?.region || runtime.region,
    bucket: stored?.bucket || runtime.bucket,
    endpoint: stored?.endpoint || runtime.endpoint,
    publicUrl: stored?.publicUrl || runtime.publicUrl,
    updatedAt: stored?.updatedAt || null
  }
}

function saveOssConfig(payload = {}) {
  if (!safeStorage.isEncryptionAvailable()) {
    return { success: false, error: '系统安全存储不可用，无法保存 OSS 密钥' }
  }

  const existingRaw = getSetting(OSS_CONFIG_SETTING_KEY)
  const existing = existingRaw ? JSON.parse(existingRaw) : {}
  const accessKeyId = String(payload.accessKeyId || '').trim()
  const accessKeySecret = String(payload.accessKeySecret || '').trim()
  const next = {
    accessKeyIdEncrypted: accessKeyId
      ? encryptSecretText(accessKeyId)
      : existing.accessKeyIdEncrypted || '',
    accessKeySecretEncrypted: accessKeySecret
      ? encryptSecretText(accessKeySecret)
      : existing.accessKeySecretEncrypted || '',
    region: String(payload.region || existing.region || 'oss-cn-chengdu').trim(),
    bucket: String(payload.bucket || existing.bucket || 'ljxhimage2').trim(),
    endpoint: String(
      payload.endpoint || existing.endpoint || 'https://oss-cn-chengdu.aliyuncs.com'
    ).trim(),
    publicUrl: String(payload.publicUrl || existing.publicUrl || 'https://image.lingjingxinghe.cn').trim(),
    updatedAt: new Date().toISOString()
  }

  if (!next.accessKeyIdEncrypted || !next.accessKeySecretEncrypted) {
    return { success: false, error: '请填写 OSS AccessKey ID 和 AccessKey Secret' }
  }

  setSetting(OSS_CONFIG_SETTING_KEY, JSON.stringify(next))
  applyStoredOssConfig()
  return getOssConfigStatus()
}

function clearOssConfig() {
  deleteSetting(OSS_CONFIG_SETTING_KEY)
  setRuntimeOssConfig({})
  return getOssConfigStatus()
}

function readStoredArkAssetConfig({ includeSecrets = false } = {}) {
  const raw = getSetting(ARK_ASSET_CONFIG_SETTING_KEY)
  if (!raw) return null
  const data = JSON.parse(raw)
  const config = {
    updatedAt: data.updatedAt || null,
    hasStoredAccessKeyId: Boolean(data.accessKeyIdEncrypted),
    hasStoredAccessKeySecret: Boolean(data.accessKeySecretEncrypted)
  }
  if (includeSecrets) {
    config.accessKeyId = decryptSecretText(data.accessKeyIdEncrypted)
    config.accessKeySecret = decryptSecretText(data.accessKeySecretEncrypted)
  }
  return config
}

function applyStoredArkAssetConfig() {
  try {
    const stored = readStoredArkAssetConfig({ includeSecrets: true })
    if (stored?.accessKeyId && stored?.accessKeySecret) {
      setRuntimeArkConfig(stored)
    } else {
      setRuntimeArkConfig({})
    }
    return stored
  } catch (error) {
    console.warn('[asset:config] Failed to apply stored config:', error.message || error)
    return null
  }
}

function getArkAssetConfigStatus() {
  const stored = readStoredArkAssetConfig()
  const runtime = getRuntimeArkStatus()
  return {
    success: true,
    ...runtime,
    storedConfigured: Boolean(stored?.hasStoredAccessKeyId && stored?.hasStoredAccessKeySecret),
    safeStorageAvailable: safeStorage.isEncryptionAvailable(),
    source: stored?.hasStoredAccessKeyId && stored?.hasStoredAccessKeySecret ? 'settings' : 'none',
    updatedAt: stored?.updatedAt || null
  }
}

function saveArkAssetConfig(payload = {}) {
  if (!safeStorage.isEncryptionAvailable()) {
    return { success: false, error: '系统安全存储不可用，无法保存方舟 AK/SK' }
  }

  const existingRaw = getSetting(ARK_ASSET_CONFIG_SETTING_KEY)
  const existing = existingRaw ? JSON.parse(existingRaw) : {}
  const accessKeyId = String(payload.accessKeyId || '').trim()
  const accessKeySecret = String(payload.accessKeySecret || '').trim()
  const next = {
    accessKeyIdEncrypted: accessKeyId
      ? encryptSecretText(accessKeyId)
      : existing.accessKeyIdEncrypted || '',
    accessKeySecretEncrypted: accessKeySecret
      ? encryptSecretText(accessKeySecret)
      : existing.accessKeySecretEncrypted || '',
    updatedAt: new Date().toISOString()
  }

  if (!next.accessKeyIdEncrypted || !next.accessKeySecretEncrypted) {
    return { success: false, error: '请填写方舟 AccessKey ID 和 Secret AccessKey' }
  }

  setSetting(ARK_ASSET_CONFIG_SETTING_KEY, JSON.stringify(next))
  applyStoredArkAssetConfig()
  return getArkAssetConfigStatus()
}

function clearArkAssetConfig() {
  deleteSetting(ARK_ASSET_CONFIG_SETTING_KEY)
  setRuntimeArkConfig({})
  return getArkAssetConfigStatus()
}

function assertAllowedCloudApiUrl(rawUrl) {
  const url = new URL(rawUrl)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Unsupported cloud API protocol')
  }
  if (!ALLOWED_CLOUD_API_HOSTS.has(url.hostname)) {
    throw new Error(`Cloud API host is not allowed: ${url.hostname}`)
  }
  return url
}

function indexCacheFile(filePath, type, category, sourceId) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return
    const normalizedType = ['image', 'video', 'audio', 'thumbnail', 'other'].includes(type)
      ? type
      : 'other'
    upsertCacheFile({
      filePath,
      type: normalizedType,
      size: stat.size,
      category,
      sourceId
    })
  } catch (e) {
    console.warn('[cache:index] Failed:', e.message)
  }
}

function removeCacheFileIndex(filePath) {
  try {
    deleteCacheFile(filePath)
  } catch (e) {
    console.warn('[cache:index-delete] Failed:', e.message)
  }
}

function toXingheLocalUrl(filePath) {
  return `xinghe://local/?path=${encodeURIComponent(filePath)}`
}

function resolveXingheLocalPath(value) {
  if (!value || typeof value !== 'string') return ''
  if (!value.startsWith('xinghe://local')) return value
  try {
    const parsed = new URL(value)
    const encodedPath = parsed.searchParams.get('path')
    return encodedPath ? decodeURIComponent(encodedPath) : value
  } catch {
    const match = value.match(/[?&]path=([^&]+)/)
    return match ? decodeURIComponent(match[1]) : value
  }
}

function isPathInside(childPath, parentPath) {
  if (!childPath || !parentPath) return false
  const child = path.resolve(childPath)
  const parent = path.resolve(parentPath)
  return child === parent || child.startsWith(`${parent}${path.sep}`)
}

function sanitizeCacheId(value, fallback = 'unassigned') {
  const clean = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120)
  return clean || fallback
}

function getDefaultProjectCacheRoot(projectId) {
  return path.join(app.getPath('userData'), 'ProjectCache', sanitizeCacheId(projectId))
}

function resolveUsableProjectCacheRoot(configuredRoot, projectId) {
  const fallback = getDefaultProjectCacheRoot(projectId || 'unassigned')
  if (!configuredRoot || !path.isAbsolute(configuredRoot)) {
    return { root: fallback, rejectedRoot: configuredRoot || null }
  }

  const resolved = path.resolve(configuredRoot)
  if (resolved.startsWith('\\\\')) {
    return { root: fallback, rejectedRoot: resolved }
  }

  try {
    const anchor = path.parse(resolved).root || resolved
    if (anchor && !fs.existsSync(anchor)) {
      return { root: fallback, rejectedRoot: resolved }
    }
  } catch {
    return { root: fallback, rejectedRoot: resolved }
  }

  return { root: resolved, rejectedRoot: null }
}

function getConfiguredProjectCacheRoot(projectId) {
  if (!projectId) return null
  try {
    const stored = getSetting(`tapnow_project_cache_root_${projectId}`)
    if (stored) return stored
  } catch {
    // Ignore settings lookup failures.
  }
  try {
    const projectData = loadProjectJSON(projectId)
    if (projectData?.cacheRoot) return projectData.cacheRoot
  } catch {
    // Ignore project JSON lookup failures.
  }
  return null
}

function resolveProjectCacheContext(input = {}) {
  const projectId = input?.projectId || input?.project_id || null
  const hasExplicitRoot =
    Object.prototype.hasOwnProperty.call(input || {}, 'cacheRoot') ||
    Object.prototype.hasOwnProperty.call(input || {}, 'cache_root')
  const explicitRoot = input?.cacheRoot || input?.cache_root || null
  const configuredRoot = hasExplicitRoot ? explicitRoot : getConfiguredProjectCacheRoot(projectId)
  const { root, rejectedRoot } = resolveUsableProjectCacheRoot(configuredRoot, projectId)
  const dirs = {
    root,
    image: path.join(root, 'images'),
    video: path.join(root, 'videos'),
    thumbnail: path.join(root, 'thumbs'),
    audio: path.join(root, 'audio'),
    temp: path.join(root, 'temp')
  }
  return { projectId, root, dirs, rejectedRoot }
}

function ensureProjectCacheDirs(context) {
  for (const dir of Object.values(context.dirs)) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }
}

async function ensureProjectCacheDirsAsync(context) {
  for (const dir of Object.values(context.dirs)) {
    await fs.promises.mkdir(dir, { recursive: true })
  }
}

function getSafeDialogDefaultPath(candidatePath) {
  const fallback = app.getPath('home') || app.getPath('userData')
  const rawPath = typeof candidatePath === 'string' ? candidatePath.trim() : ''
  if (!rawPath) return fallback

  const candidates = []
  try {
    candidates.push(path.resolve(rawPath))
    candidates.push(path.dirname(path.resolve(rawPath)))
  } catch {
    return fallback
  }

  for (const candidate of candidates) {
    try {
      if (!candidate || !fs.existsSync(candidate)) continue
      const stat = fs.statSync(candidate)
      if (stat.isDirectory()) return candidate
    } catch {
      // Try the next fallback path.
    }
  }

  return fallback
}

function getKnownFolderPath(name) {
  try {
    const folder = app.getPath(name)
    if (folder && fs.existsSync(folder)) return folder
  } catch {
    // Fall through to the next stable folder.
  }
  return ''
}

function getOpenFilesDefaultPath(options = {}) {
  const explicitPath =
    typeof options.defaultPath === 'string' ? options.defaultPath : options.currentPath
  if (explicitPath) return getSafeDialogDefaultPath(explicitPath)

  const extensions = new Set()
  const filters = Array.isArray(options.filters) ? options.filters : []
  filters.forEach((filter) => {
    const values = Array.isArray(filter?.extensions) ? filter.extensions : []
    values.forEach((extension) => {
      if (typeof extension === 'string') extensions.add(extension.toLowerCase())
    })
  })

  const hasAny = (items) => items.some((item) => extensions.has(item))
  const candidates = []
  if (hasAny(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'])) {
    candidates.push(getKnownFolderPath('pictures'))
  }
  if (hasAny(['mp4', 'mov', 'avi', 'webm', 'mkv'])) {
    candidates.push(getKnownFolderPath('videos'))
  }
  if (hasAny(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'])) {
    candidates.push(getKnownFolderPath('music'))
  }
  candidates.push(getKnownFolderPath('downloads'), getKnownFolderPath('desktop'), app.getPath('home'))

  return candidates.find(Boolean) || app.getPath('userData')
}

function persistProjectCacheRoot(projectId, cacheRoot) {
  if (!projectId) return
  const key = `tapnow_project_cache_root_${projectId}`
  if (cacheRoot) {
    setSetting(key, cacheRoot)
  } else {
    deleteSetting(key)
  }

  try {
    const existing = loadProjectJSON(projectId)
    if (existing) {
      saveProjectJSON(projectId, {
        ...existing,
        cacheRoot: cacheRoot || null
      })
    }
  } catch (error) {
    console.warn('[cache:config] Failed to persist cacheRoot into project JSON:', error.message)
  }

  try {
    const project = getProject(projectId)
    if (project) {
      saveProject({
        ...project,
        cacheRoot: cacheRoot || null
      })
    }
  } catch (error) {
    console.warn('[cache:config] Failed to persist cacheRoot into project index:', error.message)
  }
}

function getTargetCacheDir(type, context) {
  if (type === 'video') return context.dirs.video
  if (type === 'audio') return context.dirs.audio
  if (type === 'thumbnail') return context.dirs.thumbnail
  return context.dirs.image
}

function resolvePackagedExecutable(candidatePath, fallbackName) {
  if (candidatePath && fs.existsSync(candidatePath)) return candidatePath
  const unpackedPath = candidatePath
    ? candidatePath.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)
    : ''
  if (unpackedPath && fs.existsSync(unpackedPath)) return unpackedPath
  return fallbackName
}

async function showNativeOpenDialog(event, options) {
  if (nativeFileDialogOpen) {
    return { canceled: true, filePaths: [], busy: true }
  }

  nativeFileDialogOpen = true
  try {
    const parentWindow =
      BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
    if (parentWindow && !parentWindow.isDestroyed()) {
      if (parentWindow.isMinimized()) parentWindow.restore()
      parentWindow.focus()
      return await dialog.showOpenDialog(parentWindow, options)
    }
    return await dialog.showOpenDialog(options)
  } finally {
    nativeFileDialogOpen = false
  }
}

function enqueueThumbnailJob(task) {
  return new Promise((resolve) => {
    thumbnailJobQueue.push({ task, resolve })
    runNextThumbnailJob()
  })
}

function runNextThumbnailJob() {
  if (thumbnailJobRunning) return
  const next = thumbnailJobQueue.shift()
  if (!next) return

  thumbnailJobRunning = true
  setTimeout(() => {
    try {
      next.resolve(next.task())
    } catch (error) {
      next.resolve({ success: false, error: error?.message || String(error) })
    } finally {
      thumbnailJobRunning = false
      setTimeout(runNextThumbnailJob, 80)
    }
  }, 80)
}

function resolveExistingLocalPath(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') {
    return { success: false, error: '缺少路径' }
  }

  const resolvedPath = path.resolve(resolveXingheLocalPath(targetPath))
  try {
    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: `路径不存在: ${resolvedPath}` }
    }
    return { success: true, path: resolvedPath }
  } catch (error) {
    return { success: false, error: `路径不可访问: ${error.message}` }
  }
}

function openLocalPathDetached(targetPath, { showItem = false } = {}) {
  const resolved = resolveExistingLocalPath(targetPath)
  if (!resolved.success) return resolved

  const requestKey = `${showItem ? 'show' : 'open'}:${resolved.path}`
  if (pendingShellOpenPaths.has(requestKey)) {
    return { success: true, path: resolved.path, pending: true }
  }

  pendingShellOpenPaths.add(requestKey)
  setImmediate(() => {
    try {
      const result = showItem ? shell.showItemInFolder(resolved.path) : shell.openPath(resolved.path)
      if (result && typeof result.then === 'function') {
        result.catch((error) => {
          console.warn('[shell:open-path] Failed:', error?.message || error)
        })
      }
    } catch (error) {
      console.warn('[shell:open-path] Failed:', error.message)
    } finally {
      setTimeout(() => pendingShellOpenPaths.delete(requestKey), 1500)
    }
  })

  return { success: true, path: resolved.path }
}

async function writeFetchBodyToFile(response, filePath) {
  const tempPath = `${filePath}.download`
  try {
    if (response.body) {
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(tempPath))
    } else {
      const buffer = Buffer.from(await response.arrayBuffer())
      fs.writeFileSync(tempPath, buffer)
    }
    fs.renameSync(tempPath, filePath)
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
    } catch {
      // Ignore cleanup failures.
    }
    throw error
  }
}

function assertDownloadLooksLikeMedia(response, type) {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType) return

  const isLikelyErrorDocument = /text\/html|application\/json|application\/xml|text\/xml/i.test(
    contentType
  )
  if (isLikelyErrorDocument) {
    throw new Error(`Download returned ${contentType}, not ${type || 'media'}`)
  }
}

function stripDataUrlPrefix(content) {
  return String(content || '').replace(/^data:[^;]+;base64,/i, '')
}

function looksLikePlayableVideoFile(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase()
    if (!VIDEO_EXTS.has(ext)) return true
    const fd = fs.openSync(filePath, 'r')
    try {
      const buffer = Buffer.alloc(64)
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0)
      const head = buffer.subarray(0, bytesRead)
      if (ext === '.webm' || ext === '.mkv') {
        return head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3
      }
      if (ext === '.avi') {
        return head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'AVI '
      }
      return head.includes(Buffer.from('ftyp'))
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return false
  }
}

function getKnownProjectCacheRoots(projectId = null) {
  if (projectId) return [resolveProjectCacheContext({ projectId }).root]

  const roots = new Set()
  try {
    for (const project of listProjectsJSON()) {
      if (project?.id)
        roots.add(
          resolveProjectCacheContext({
            projectId: project.id,
            cacheRoot: project.cacheRoot
          }).root
        )
    }
  } catch {
    // Ignore project list lookup failures.
  }
  try {
    const settings = getAllSettings()
    for (const [key, value] of Object.entries(settings || {})) {
      if (key.startsWith('tapnow_project_cache_root_') && value && path.isAbsolute(value)) {
        roots.add(path.resolve(value))
      }
    }
  } catch {
    // Ignore settings lookup failures.
  }
  roots.add(getDefaultProjectCacheRoot('unassigned'))
  return Array.from(roots)
}

function getCacheRoots(projectId = null) {
  return [
    ...getKnownProjectCacheRoots(projectId),
    // Legacy roots stay readable/cleanable for old projects, but new writes use project roots.
    currentConfig?.image_save_path,
    currentConfig?.video_save_path,
    path.join(app.getPath('userData'), 'LocalCache'),
    path.join(app.getPath('userData'), 'thumbnail_cache')
  ].filter(Boolean)
}

function isManagedCachePath(filePath, projectId = null) {
  const realPath = resolveXingheLocalPath(filePath)
  if (!realPath || !path.isAbsolute(realPath)) return false
  return getCacheRoots(projectId).some((root) => isPathInside(realPath, root))
}

function collectManagedCachePaths(value, out = new Set(), projectId = null) {
  if (!value) return out
  if (typeof value === 'string') {
    const realPath = resolveXingheLocalPath(value)
    if (isManagedCachePath(realPath, projectId)) out.add(path.resolve(realPath))
    return out
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectManagedCachePaths(item, out, projectId))
    return out
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((item) => collectManagedCachePaths(item, out, projectId))
  }
  return out
}

function deleteManagedCachePaths(filePaths = [], projectId = null) {
  const results = []
  for (const filePath of filePaths) {
    const realPath = resolveXingheLocalPath(filePath)
    if (!isManagedCachePath(realPath, projectId)) {
      results.push({
        path: realPath,
        deleted: false,
        skipped: true,
        reason: 'outside managed cache'
      })
      continue
    }
    try {
      if (fs.existsSync(realPath) && fs.statSync(realPath).isFile()) {
        const size = fs.statSync(realPath).size
        fs.unlinkSync(realPath)
        results.push({ path: realPath, deleted: true, size })
      } else {
        results.push({ path: realPath, deleted: false, missing: true })
      }
      removeCacheFileIndex(realPath)
    } catch (e) {
      results.push({ path: realPath, deleted: false, error: e.message })
    }
  }
  return results
}

function uniqueResolvedPaths(paths) {
  const seen = new Set()
  const result = []
  for (const item of paths || []) {
    if (!item) continue
    const resolved = path.resolve(item)
    if (seen.has(resolved)) continue
    seen.add(resolved)
    result.push(resolved)
  }
  return result
}

function getThumbnailRoot() {
  return resolveProjectCacheContext({ projectId: 'unassigned' }).dirs.thumbnail
}

function getManagedCacheRoots(projectId = null) {
  return uniqueResolvedPaths(getCacheRoots(projectId)).filter((root) => fs.existsSync(root))
}

function walkFiles(root, out = []) {
  if (!root || !fs.existsSync(root)) return out
  let entries = []
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)
    try {
      if (entry.isDirectory()) {
        walkFiles(fullPath, out)
      } else if (entry.isFile()) {
        out.push(fullPath)
      }
    } catch {
      // Ignore unreadable cache entries.
    }
  }
  return out
}

function classifyCacheFile(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (filePath.split(path.sep).includes('thumbs') || isPathInside(filePath, getThumbnailRoot()))
    return 'thumbnail'
  if (currentConfig?.video_save_path && isPathInside(filePath, currentConfig.video_save_path)) {
    return 'video'
  }
  if (VIDEO_EXTS.has(ext)) return 'video'
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'].includes(ext)) return 'audio'
  return 'other'
}

function getManagedCacheFiles(projectId = null) {
  const roots = getManagedCacheRoots(projectId)
  const paths = uniqueResolvedPaths(roots.flatMap((root) => walkFiles(root)))
  const files = []
  for (const filePath of paths) {
    try {
      const stat = fs.statSync(filePath)
      if (!stat.isFile()) continue
      files.push({
        path: filePath,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        type: classifyCacheFile(filePath)
      })
    } catch {
      // Ignore files removed during scan.
    }
  }
  return files
}

function safeParseJson(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || !['{', '['].includes(trimmed[0])) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

function collectProjectManagedCachePaths(projectId) {
  const paths = new Set()
  if (!projectId) return paths
  collectManagedCachePaths(getNodesByProject(projectId), paths, projectId)
  collectManagedCachePaths(getHistoryByProject(projectId, 100000), paths, projectId)
  collectManagedCachePaths(getProject(projectId), paths, projectId)
  collectManagedCachePaths(loadProjectJSON(projectId), paths, projectId)
  try {
    const savedHistory = getSetting(`tapnow_history_v2_${projectId}`)
    if (savedHistory) collectManagedCachePaths(JSON.parse(savedHistory), paths, projectId)
  } catch (e) {
    console.warn('[cache:project-paths] Failed to parse saved history:', e.message)
  }
  return paths
}

function getReferencedManagedPaths(projectId = null) {
  if (projectId) return collectProjectManagedCachePaths(projectId)

  const paths = new Set()
  const projects = getAllProjects()
  for (const project of projects) {
    collectProjectManagedCachePaths(project.id).forEach((item) => paths.add(item))
  }
  collectManagedCachePaths(getAllHistory(100000), paths)

  const settings = getAllSettings()
  for (const value of Object.values(settings || {})) {
    collectManagedCachePaths(value, paths)
    const parsed = safeParseJson(value)
    if (parsed) collectManagedCachePaths(parsed, paths)
  }
  return paths
}

function isMediaPathLike(value) {
  if (!value || typeof value !== 'string') return false
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')) {
    return false
  }
  const realPath = resolveXingheLocalPath(value)
  const ext = path.extname(realPath).toLowerCase()
  return (
    (value.startsWith('xinghe://local') || path.isAbsolute(realPath)) &&
    (IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext))
  )
}

function collectLocalMediaReferences(value, out = new Set()) {
  if (!value) return out
  if (typeof value === 'string') {
    if (isMediaPathLike(value)) out.add(path.resolve(resolveXingheLocalPath(value)))
    const parsed = safeParseJson(value)
    if (parsed) collectLocalMediaReferences(parsed, out)
    return out
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectLocalMediaReferences(item, out))
    return out
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((item) => collectLocalMediaReferences(item, out))
  }
  return out
}

function getAllLocalMediaReferences() {
  const refs = new Set()
  const projects = getAllProjects()
  for (const project of projects) {
    collectLocalMediaReferences(getNodesByProject(project.id), refs)
    collectLocalMediaReferences(getHistoryByProject(project.id, 100000), refs)
    collectLocalMediaReferences(getProject(project.id), refs)
    const savedHistory = getSetting(`tapnow_history_v2_${project.id}`)
    if (savedHistory) collectLocalMediaReferences(savedHistory, refs)
  }
  collectLocalMediaReferences(getAllHistory(100000), refs)
  const settings = getAllSettings()
  for (const value of Object.values(settings || {})) {
    collectLocalMediaReferences(value, refs)
  }
  return refs
}

function summarizeCache(projectId = null) {
  const files = getManagedCacheFiles(projectId)
  const totals = {
    total: { count: files.length, size: 0 },
    image: { count: 0, size: 0 },
    video: { count: 0, size: 0 },
    thumbnail: { count: 0, size: 0 },
    other: { count: 0, size: 0 }
  }
  for (const file of files) {
    totals.total.size += file.size
    const bucket = totals[file.type] || totals.other
    bucket.count += 1
    bucket.size += file.size
  }

  const currentProject = projectId
    ? {
        id: projectId,
        size: totals.total.size,
        count: totals.total.count,
        cacheRoot: resolveProjectCacheContext({ projectId }).root
      }
    : null

  const referenced = getReferencedManagedPaths(projectId)
  const orphanFiles = files.filter((file) => !referenced.has(path.resolve(file.path)))
  return {
    success: true,
    totals,
    projectSizes: currentProject ? [currentProject] : [],
    currentProject,
    orphan: {
      count: orphanFiles.length,
      size: orphanFiles.reduce((sum, file) => sum + file.size, 0)
    },
    policy: null
  }
}

function diagnoseCache(projectId = null) {
  const files = getManagedCacheFiles(projectId)
  const referenced = getReferencedManagedPaths(projectId)
  const localRefs = projectId
    ? collectLocalMediaReferences([
        getNodesByProject(projectId),
        getHistoryByProject(projectId, 100000),
        getProject(projectId),
        getSetting(`tapnow_history_v2_${projectId}`)
      ])
    : getAllLocalMediaReferences()

  const orphanFiles = files.filter((file) => !referenced.has(path.resolve(file.path)))
  const missingCacheRefs = []
  const missingLocalRefs = []
  for (const ref of localRefs) {
    if (fs.existsSync(ref)) continue
    if (isManagedCachePath(ref)) missingCacheRefs.push(ref)
    else missingLocalRefs.push(ref)
  }

  return {
    success: true,
    orphan: {
      count: orphanFiles.length,
      size: orphanFiles.reduce((sum, file) => sum + file.size, 0)
    },
    missingCacheRefs: missingCacheRefs.slice(0, 100),
    missingLocalRefs: missingLocalRefs.slice(0, 100),
    missingCacheRefCount: missingCacheRefs.length,
    missingLocalRefCount: missingLocalRefs.length
  }
}

function cleanupCache(options = {}) {
  const projectId = options.projectId || null
  const files = getManagedCacheFiles(projectId)
  const referenced = getReferencedManagedPaths(projectId)
  const referencedOnly = options.referencedOnly !== false
  const now = Date.now()
  let candidates = []

  if (options.mode === 'orphan') {
    candidates = files.filter((file) => !referenced.has(path.resolve(file.path)))
  } else if (options.mode === 'older-than-days') {
    const days = Number(options.olderThanDays || 30)
    const cutoff = now - days * 24 * 60 * 60 * 1000
    candidates = files.filter((file) => {
      if (file.mtimeMs > cutoff) return false
      return referencedOnly ? !referenced.has(path.resolve(file.path)) : true
    })
  } else if (options.mode === 'type') {
    const type = options.type || 'thumbnail'
    candidates = files.filter((file) => {
      if (file.type !== type) return false
      if (type === 'thumbnail') return true
      return referencedOnly ? !referenced.has(path.resolve(file.path)) : true
    })
  }

  const results = deleteManagedCachePaths(
    candidates.map((file) => file.path),
    projectId
  )
  const deletedFiles = results.filter((item) => item.deleted).length
  const freedBytes = results.reduce((sum, item) => sum + (item.deleted ? item.size || 0 : 0), 0)
  return { success: true, deletedFiles, freedBytes, results }
}

const HEALTH_LAST_RESULT_KEY = 'tapnow_health_check_last_result'
const HEALTH_PENDING_UPDATE_KEY = 'tapnow_pending_update_health_check'

function readJsonSetting(key) {
  try {
    const raw = getSetting(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function addHealthIssue(issues, severity, code, title, detail, fixable = false) {
  issues.push({ severity, code, title, detail, fixable })
}

function addHealthRepair(repairs, code, title, detail) {
  repairs.push({ code, title, detail })
}

function listProjectFilesForHealth(projectId = null) {
  const dir = getProjectsDir()
  const valid = []
  const invalid = []

  let files = []
  try {
    files = fs.readdirSync(dir).filter((file) => file.endsWith('.json') && !file.endsWith('.tmp'))
  } catch (error) {
    return {
      valid,
      invalid: [{ file: dir, error: error?.message || String(error) }]
    }
  }

  for (const file of files) {
    const id = file.replace(/\.json$/i, '')
    if (projectId && id !== projectId) continue
    const filePath = path.join(dir, file)
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      valid.push({ id: data?.id || id, fileId: id, filePath, data })
    } catch (error) {
      invalid.push({ file, filePath, error: error?.message || String(error) })
    }
  }

  return { valid, invalid }
}

function inspectDatabaseIntegrity() {
  if (!mainDb) {
    return { ok: false, details: ['database-not-initialized'] }
  }

  const rows = mainDb.pragma('integrity_check')
  const details = Array.isArray(rows)
    ? rows.map((row) => Object.values(row || {})[0]).filter(Boolean)
    : [rows].filter(Boolean)
  return {
    ok: details.length === 0 || (details.length === 1 && String(details[0]).toLowerCase() === 'ok'),
    details: details.length ? details : ['ok']
  }
}

function computeHealthStatus(issues) {
  if (issues.some((issue) => issue.severity === 'error')) return 'error'
  if (issues.some((issue) => issue.severity === 'warn')) return 'warn'
  return 'ok'
}

function runSoftwareHealthCheck(options = {}) {
  const repair = options.repair === true
  const projectId = options.projectId || null
  const issues = []
  const repairs = []
  const pendingUpdate = readJsonSetting(HEALTH_PENDING_UPDATE_KEY)
  const result = {
    success: true,
    mode: repair ? 'repair' : 'check',
    appVersion: app.getVersion(),
    pendingUpdate,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: 0,
    status: 'ok',
    issues,
    repairs,
    summary: {
      checkedProjects: 0,
      invalidProjectFiles: 0,
      repairedProjects: 0,
      copiedLegacyCacheFiles: 0,
      rewrittenLegacyCacheRefs: 0,
      missingLegacyCacheFiles: 0,
      deletedOrphanCacheFiles: 0,
      freedOrphanCacheBytes: 0,
      databaseCleanupChanges: 0,
      missingCacheRefCount: 0,
      missingLocalRefCount: 0
    }
  }

  const startedMs = Date.now()

  try {
    const integrity = inspectDatabaseIntegrity()
    result.database = integrity
    if (!integrity.ok) {
      addHealthIssue(
        issues,
        'error',
        'database-integrity',
        '数据库完整性异常',
        integrity.details.join('; '),
        false
      )
    }
  } catch (error) {
    addHealthIssue(
      issues,
      'error',
      'database-integrity-check-failed',
      '数据库体检失败',
      error?.message || String(error),
      false
    )
  }

  if (repair) {
    try {
      const cleaned = cleanupOrphanData()
      const changes = Number(cleaned?.deletedNodes || 0) + Number(cleaned?.deletedConnections || 0)
      result.summary.databaseCleanupChanges = changes
      if (changes > 0) {
        addHealthRepair(
          repairs,
          'database-orphan-cleanup',
          '清理数据库孤儿记录',
          `已清理 ${changes} 条无项目归属的数据`
        )
      }
      try {
        mainDb?.pragma('wal_checkpoint(PASSIVE)')
      } catch {
        // Best effort only.
      }
    } catch (error) {
      addHealthIssue(
        issues,
        'warn',
        'database-cleanup-failed',
        '数据库孤儿记录清理失败',
        error?.message || String(error),
        true
      )
    }
  }

  const currentDataVersion = getSetting('tapnow_data_version') || null
  result.migration = {
    currentDataVersion,
    targetDataVersion: DATA_SCHEMA_VERSION,
    lastResult: readJsonSetting('tapnow_migration_last_result'),
    latestBackupDir: getSetting('tapnow_migration_backup_latest') || null
  }
  if (currentDataVersion !== DATA_SCHEMA_VERSION) {
    addHealthIssue(
      issues,
      'warn',
      'data-version-mismatch',
      '数据版本未对齐',
      `当前数据版本 ${currentDataVersion || 'unknown'}，目标版本 ${DATA_SCHEMA_VERSION}`,
      false
    )
  }

  const projectFiles = listProjectFilesForHealth(projectId)
  result.summary.checkedProjects = projectFiles.valid.length
  result.summary.invalidProjectFiles = projectFiles.invalid.length
  for (const item of projectFiles.invalid) {
    addHealthIssue(
      issues,
      'error',
      'project-json-invalid',
      '项目文件无法读取',
      `${item.file}: ${item.error}`,
      false
    )
  }

  for (const item of projectFiles.valid) {
    const data = item.data || {}
    let needsProjectRepair = false
    if (data.schemaVersion !== PROJECT_SCHEMA_VERSION) {
      needsProjectRepair = true
      addHealthIssue(
        issues,
        'warn',
        'project-schema-outdated',
        '项目结构需要升级',
        `${data.name || item.id} 的项目结构版本为 ${data.schemaVersion || 'unknown'}`,
        true
      )
    }
    for (const key of ['nodes', 'connections', 'history']) {
      if (!Array.isArray(data[key])) {
        needsProjectRepair = true
        addHealthIssue(
          issues,
          'warn',
          'project-array-field-missing',
          '项目字段需要补齐',
          `${data.name || item.id} 缺少 ${key} 数组`,
          true
        )
      }
    }

    if (!repair || (!projectId && !needsProjectRepair)) continue

    try {
      const repairResult = repairProjectJSON(item.fileId)
      const restoredProject = loadProjectWithLegacySqliteFallback(item.fileId)
      if (!repairResult?.success && !restoredProject) {
        throw new Error(repairResult?.error || '项目修复失败')
      }
      result.summary.repairedProjects += 1
      result.summary.copiedLegacyCacheFiles += Number(repairResult.copiedLegacyCacheFiles || 0)
      result.summary.rewrittenLegacyCacheRefs += Number(repairResult.rewrittenLegacyCacheRefs || 0)
      result.summary.missingLegacyCacheFiles += Number(repairResult.missingLegacyCacheFiles || 0)
    } catch (error) {
      addHealthIssue(
        issues,
        'error',
        'project-repair-failed',
        '项目自动修复失败',
        `${data.name || item.id}: ${error?.message || error}`,
        true
      )
    }
  }

  if (repair && result.summary.repairedProjects > 0) {
    addHealthRepair(
      repairs,
      'project-json-repair',
      '规范化项目文件',
      `已检查并重写 ${result.summary.repairedProjects} 个项目文件`
    )
  }
  if (repair && result.summary.rewrittenLegacyCacheRefs > 0) {
    addHealthRepair(
      repairs,
      'legacy-cache-reference-migration',
      '迁移旧缓存引用',
      `已改写 ${result.summary.rewrittenLegacyCacheRefs} 个旧缓存引用，复制 ${result.summary.copiedLegacyCacheFiles} 个文件`
    )
  }

  try {
    const cacheDiagnosis = diagnoseCache(projectId)
    result.cache = cacheDiagnosis
    result.summary.missingCacheRefCount = Number(cacheDiagnosis.missingCacheRefCount || 0)
    result.summary.missingLocalRefCount = Number(cacheDiagnosis.missingLocalRefCount || 0)
    if (cacheDiagnosis.orphan?.count > 0) {
      addHealthIssue(
        issues,
        'warn',
        'orphan-cache',
        '存在未引用的托管缓存',
        `${cacheDiagnosis.orphan.count} 个文件，${cacheDiagnosis.orphan.size || 0} 字节`,
        true
      )
    }
    if (cacheDiagnosis.missingCacheRefCount > 0) {
      addHealthIssue(
        issues,
        'warn',
        'missing-cache-reference',
        '存在缺失的托管缓存引用',
        `${cacheDiagnosis.missingCacheRefCount} 个缓存文件已不存在`,
        false
      )
    }
    if (cacheDiagnosis.missingLocalRefCount > 0) {
      addHealthIssue(
        issues,
        'warn',
        'missing-local-reference',
        '存在失效的本地素材链接',
        `${cacheDiagnosis.missingLocalRefCount} 个用户本地素材路径无法访问`,
        false
      )
    }
  } catch (error) {
    addHealthIssue(
      issues,
      'warn',
      'cache-diagnose-failed',
      '缓存体检失败',
      error?.message || String(error),
      false
    )
  }

  if (repair && result.cache?.orphan?.count > 0) {
    try {
      const cleanup = cleanupCache({ projectId, mode: 'orphan' })
      result.summary.deletedOrphanCacheFiles = Number(cleanup.deletedFiles || 0)
      result.summary.freedOrphanCacheBytes = Number(cleanup.freedBytes || 0)
      if (cleanup.deletedFiles > 0) {
        addHealthRepair(
          repairs,
          'orphan-cache-cleanup',
          '清理未引用托管缓存',
          `已删除 ${cleanup.deletedFiles} 个文件，释放 ${cleanup.freedBytes || 0} 字节`
        )
      }
    } catch (error) {
      addHealthIssue(
        issues,
        'warn',
        'orphan-cache-cleanup-failed',
        '未引用缓存清理失败',
        error?.message || String(error),
        true
      )
    }
  }

  const gpuDisabledAt = getSetting('tapnow_gpu_auto_disabled_at')
  if (gpuDisabledAt) {
    addHealthIssue(
      issues,
      'warn',
      'gpu-auto-disabled',
      'GPU 曾被自动关闭',
      `检测到 ${gpuDisabledAt} 自动关闭过硬件加速，如画布正常可在系统设置中重新开启`,
      false
    )
  }

  try {
    result.system = collectStatsCached()
  } catch (error) {
    addHealthIssue(
      issues,
      'warn',
      'system-stats-failed',
      '系统状态采集失败',
      error?.message || String(error),
      false
    )
  }

  if (repair) {
    for (const issue of issues) {
      if (issue.fixable && !issue.code.endsWith('-failed')) {
        issue.resolved = true
      }
    }
  }

  const unresolvedIssues = issues.filter((issue) => !issue.resolved)
  result.status = computeHealthStatus(unresolvedIssues)
  result.finishedAt = new Date().toISOString()
  result.durationMs = Date.now() - startedMs
  result.summary.issueCount = issues.length
  result.summary.unresolvedIssueCount = unresolvedIssues.length
  result.summary.repairCount = repairs.length
  result.summary.fixableIssueCount = issues.filter((issue) => issue.fixable).length

  try {
    setSetting(HEALTH_LAST_RESULT_KEY, JSON.stringify(result))
    if (repair && result.status !== 'error') {
      deleteSetting(HEALTH_PENDING_UPDATE_KEY)
    }
  } catch {
    // Health check results are useful, but not worth failing the operation for.
  }

  return result
}

function normalizeWorkspaceBrowserUrl(url, { allowFile = false } = {}) {
  if (!url || typeof url !== 'string') throw new Error('缺少 URL')
  const parsed = new URL(url)
  const allowedProtocols = allowFile ? ['http:', 'https:', 'file:'] : ['http:', 'https:']
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(allowFile ? '只允许 http、https 或 file URL' : '只允许 http 或 https URL')
  }
  return parsed
}

function createWorkspaceBrowserPartition(value) {
  const raw = String(value || '').trim()
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)
  return safe ? `persist:xinghe-workspace-browser-${safe}` : undefined
}

function normalizeImportedCookieSameSite(value) {
  const raw = String(value || '')
    .toLowerCase()
    .replace(/[_\s-]/g, '')
  if (raw === 'strict') return 'strict'
  if (raw === 'lax') return 'lax'
  if (raw === 'none' || raw === 'norestriction') return 'no_restriction'
  return undefined
}

function normalizeImportedBrowserCookies(input) {
  if (Array.isArray(input)) return input
  if (Array.isArray(input?.cookies)) return input.cookies
  if (Array.isArray(input?.data)) return input.data
  return []
}

function toElectronCookieDetails(cookie) {
  const name = String(cookie?.name || '').trim()
  const value = cookie?.value == null ? '' : String(cookie.value)
  const domain = String(cookie?.domain || cookie?.host || '').trim()
  if (!name || !domain) throw new Error('Cookie 缺少 name 或 domain')

  const cleanDomain = domain.replace(/^\./, '')
  const pathValue = String(cookie?.path || '/')
  const pathName = pathValue.startsWith('/') ? pathValue : `/${pathValue}`
  const secure = Boolean(cookie?.secure)
  const url = cookie?.url || `${secure ? 'https' : 'http'}://${cleanDomain}${pathName}`
  const details = {
    url,
    name,
    value,
    domain,
    path: pathName,
    secure,
    httpOnly: Boolean(cookie?.httpOnly)
  }
  const sameSite = normalizeImportedCookieSameSite(cookie?.sameSite)
  if (sameSite) details.sameSite = sameSite
  const expirationDate = Number(cookie?.expirationDate || cookie?.expires || cookie?.expiry || 0)
  if (Number.isFinite(expirationDate) && expirationDate > 0) details.expirationDate = expirationDate
  return details
}

function listBrowserProfileCandidates() {
  const localAppData = process.env.LOCALAPPDATA || ''
  const appData = process.env.APPDATA || ''
  const home = app.getPath('home')
  const roots = [
    { browser: 'Chrome', root: path.join(localAppData, 'Google', 'Chrome', 'User Data') },
    { browser: 'Edge', root: path.join(localAppData, 'Microsoft', 'Edge', 'User Data') },
    {
      browser: 'Brave',
      root: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data')
    },
    { browser: 'Chrome Beta', root: path.join(localAppData, 'Google', 'Chrome Beta', 'User Data') },
    {
      browser: 'Chrome',
      root: path.join(home, 'Library', 'Application Support', 'Google', 'Chrome')
    },
    { browser: 'Edge', root: path.join(home, 'Library', 'Application Support', 'Microsoft Edge') },
    { browser: 'Chrome', root: path.join(home, '.config', 'google-chrome') },
    { browser: 'Edge', root: path.join(home, '.config', 'microsoft-edge') },
    { browser: 'Firefox', root: path.join(appData, 'Mozilla', 'Firefox', 'Profiles') }
  ]
  const candidates = []
  for (const item of roots) {
    try {
      if (!item.root || !fs.existsSync(item.root)) continue
      const entries = fs.readdirSync(item.root, { withFileTypes: true })
      const profileEntries = entries.filter((entry) => {
        if (!entry.isDirectory()) return false
        return /^(Default|Profile \d+|Guest Profile|.*\.default.*|.*\.default-release.*)$/i.test(
          entry.name
        )
      })
      for (const entry of profileEntries) {
        const profilePath = path.join(item.root, entry.name)
        candidates.push({
          browser: item.browser,
          name: entry.name,
          profilePath,
          rootPath: item.root,
          hasCookiesDb:
            fs.existsSync(path.join(profilePath, 'Network', 'Cookies')) ||
            fs.existsSync(path.join(profilePath, 'Cookies')),
          hasLocalStorage: fs.existsSync(path.join(profilePath, 'Local Storage')),
          hasExtensions: fs.existsSync(path.join(profilePath, 'Extensions'))
        })
      }
    } catch {
      // Ignore unreadable browser profile folders; they can be locked while browsers are open.
    }
  }
  return candidates.slice(0, 80)
}

function findBrowserProfileByPath(profilePath) {
  const normalized = path.resolve(String(profilePath || ''))
  return listBrowserProfileCandidates().find(
    (candidate) => path.resolve(candidate.profilePath) === normalized
  )
}

function getChromiumLocalStatePath(profilePath) {
  const profile = path.resolve(String(profilePath || ''))
  return path.join(path.dirname(profile), 'Local State')
}

function getChromiumCookiesDbPath(profilePath) {
  const networkPath = path.join(profilePath, 'Network', 'Cookies')
  if (fs.existsSync(networkPath)) return networkPath
  const legacyPath = path.join(profilePath, 'Cookies')
  if (fs.existsSync(legacyPath)) return legacyPath
  return ''
}

function decryptWindowsDpapiBuffer(buffer) {
  const script = [
    'Add-Type -AssemblyName System.Security;',
    '$bytes=[Convert]::FromBase64String($env:XINGHE_DPAPI_B64);',
    '$plain=[System.Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);',
    '[Convert]::ToBase64String($plain)'
  ].join(' ')
  const stdout = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      encoding: 'utf8',
      env: { ...process.env, XINGHE_DPAPI_B64: buffer.toString('base64') },
      windowsHide: true,
      timeout: 10000
    }
  )
  return Buffer.from(String(stdout || '').trim(), 'base64')
}

function decryptChromiumMasterKey(profilePath) {
  const localStatePath = getChromiumLocalStatePath(profilePath)
  if (!fs.existsSync(localStatePath)) throw new Error('未找到 Chromium Local State')
  const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'))
  const encryptedKeyBase64 = localState?.os_crypt?.encrypted_key
  if (!encryptedKeyBase64) throw new Error('Local State 缺少 os_crypt.encrypted_key')
  let encryptedKey = Buffer.from(encryptedKeyBase64, 'base64')
  if (encryptedKey.slice(0, 5).toString() === 'DPAPI') {
    encryptedKey = encryptedKey.slice(5)
  }
  if (process.platform === 'win32') {
    return decryptWindowsDpapiBuffer(encryptedKey)
  }
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('系统安全存储不可用，无法解密浏览器密钥')
  return Buffer.from(safeStorage.decryptString(encryptedKey), 'binary')
}

function decryptChromiumCookieValue(encryptedValue, plainValue, masterKey) {
  if (plainValue) return String(plainValue)
  const buffer = Buffer.isBuffer(encryptedValue)
    ? encryptedValue
    : Buffer.from(encryptedValue || [])
  if (!buffer.length) return ''
  const version = buffer.slice(0, 3).toString()
  if ((version === 'v10' || version === 'v11') && masterKey?.length) {
    const iv = buffer.slice(3, 15)
    const tag = buffer.slice(buffer.length - 16)
    const encrypted = buffer.slice(15, buffer.length - 16)
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  }
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(buffer)
  }
  throw new Error(`不支持的 cookie 加密格式：${version || 'unknown'}`)
}

function chromeTimeToUnixSeconds(value) {
  const raw = Number(value || 0)
  if (!Number.isFinite(raw) || raw <= 0) return undefined
  const unixSeconds = Math.floor(raw / 1000000 - 11644473600)
  return unixSeconds > 0 ? unixSeconds : undefined
}

function readChromiumCookiesFromProfile(profilePath, options = {}) {
  const cookiesDbPath = getChromiumCookiesDbPath(profilePath)
  if (!cookiesDbPath) throw new Error('未找到 Cookies 数据库')
  const tempDbPath = path.join(
    app.getPath('temp'),
    `xinghe-chromium-cookies-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`
  )
  let dbPath = tempDbPath
  let copied = false
  try {
    fs.copyFileSync(cookiesDbPath, tempDbPath)
    copied = true
  } catch (error) {
    dbPath = cookiesDbPath
  }
  let db
  try {
    const domainFilter = String(options.domain || '')
      .replace(/^\./, '')
      .toLowerCase()
      .trim()
    const limit = Math.max(1, Math.min(Number(options.limit) || 1200, 5000))
    const masterKey = decryptChromiumMasterKey(profilePath)
    try {
      db = new Database(dbPath, { readonly: true, fileMustExist: true })
    } catch (error) {
      if (!copied) {
        throw new Error(`Cookies 数据库被浏览器锁定，请关闭对应浏览器后再直读：${error.message}`)
      }
      throw error
    }
    const rows = db
      .prepare(
        `SELECT host_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly, samesite
         FROM cookies
         ORDER BY last_access_utc DESC
         LIMIT ?`
      )
      .all(Math.max(limit * 3, limit))
    const cookies = []
    const failures = []
    for (const row of rows) {
      if (
        domainFilter &&
        !String(row.host_key || '')
          .toLowerCase()
          .includes(domainFilter)
      )
        continue
      try {
        const value = decryptChromiumCookieValue(row.encrypted_value, row.value, masterKey)
        cookies.push({
          name: row.name,
          value,
          domain: row.host_key,
          path: row.path || '/',
          secure: !!row.is_secure,
          httpOnly: !!row.is_httponly,
          sameSite: row.samesite === 1 ? 'lax' : row.samesite === 2 ? 'strict' : undefined,
          expirationDate: chromeTimeToUnixSeconds(row.expires_utc)
        })
        if (cookies.length >= limit) break
      } catch (error) {
        failures.push({
          name: row.name,
          domain: row.host_key,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
    return { cookies, failures }
  } finally {
    if (db) db.close()
    if (copied) {
      try {
        fs.unlinkSync(tempDbPath)
      } catch {
        // Best-effort cleanup; the temporary cookie database can be removed by the OS later.
      }
    }
  }
}

function createWorkspaceBrowserWindow({ width = 1280, height = 900, partition } = {}) {
  const webPreferences = {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false
  }
  if (partition) webPreferences.partition = partition
  return new BrowserWindow({
    show: false,
    width,
    height,
    webPreferences
  })
}

async function loadWorkspaceBrowserPage(win, url, timeoutMs = 18000) {
  const loadPromise = win.webContents.loadURL(url)
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('页面加载超时')), timeoutMs)
  })
  await Promise.race([loadPromise, timeoutPromise])
  await new Promise((resolve) => setTimeout(resolve, 700))
}

function saveWorkspaceBrowserScreenshot(image, url) {
  const parsed = new URL(url)
  const png = image.toPNG()
  const dir = path.join(app.getPath('userData'), 'workspace-browser-screenshots')
  fs.mkdirSync(dir, { recursive: true })
  const safeHost = (parsed.hostname || 'local').replace(/[^a-z0-9.-]/gi, '_').slice(0, 80)
  const filePath = path.join(dir, `${Date.now()}-${safeHost}.png`)
  fs.writeFileSync(filePath, png)
  return filePath
}

function createWorkspaceBrowserSessionId(value) {
  const raw = String(value || '').trim()
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
  return safe || `browser-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function rememberWorkspaceBrowserSession(sessionId, win) {
  const entry = {
    id: sessionId,
    win,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    consoleMessages: [],
    loadFailures: [],
    crashes: []
  }
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    entry.consoleMessages.push({
      level,
      message: String(message || '').slice(0, 1000),
      line,
      sourceId: String(sourceId || '').slice(0, 400),
      at: new Date().toISOString()
    })
    if (entry.consoleMessages.length > 300) entry.consoleMessages.shift()
  })
  win.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      entry.loadFailures.push({
        errorCode,
        errorDescription,
        url: validatedURL,
        isMainFrame,
        at: new Date().toISOString()
      })
      if (entry.loadFailures.length > 80) entry.loadFailures.shift()
    }
  )
  win.webContents.on('render-process-gone', (_event, details) => {
    entry.crashes.push({ ...details, at: new Date().toISOString() })
    if (entry.crashes.length > 30) entry.crashes.shift()
  })
  workspaceBrowserSessions.set(sessionId, entry)
  win.on('closed', () => {
    workspaceBrowserSessions.delete(sessionId)
  })
}

function getWorkspaceBrowserSession(sessionId) {
  const id = createWorkspaceBrowserSessionId(sessionId)
  const entry = workspaceBrowserSessions.get(id)
  if (!entry || !entry.win || entry.win.isDestroyed()) {
    workspaceBrowserSessions.delete(id)
    throw new Error(`浏览器会话不存在或已关闭: ${id}`)
  }
  entry.updatedAt = Date.now()
  return entry
}

export async function cleanupMainRuntimeResources() {
  const result = {
    terminalSessions: 0,
    workspaceBrowserSessions: 0,
    errors: []
  }

  for (const [id, entry] of terminalSessions.entries()) {
    try {
      const child = entry?.child
      if (child && !child.killed) {
        if (process.platform === 'win32' && child.pid) {
          try {
            execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
          } catch {
            child.kill()
          }
        } else {
          child.kill()
        }
        result.terminalSessions += 1
      }
      entry.status = 'stopped'
    } catch (error) {
      result.errors.push({ scope: 'terminal', id, error: error?.message || String(error) })
    }
  }

  for (const [id, entry] of workspaceBrowserSessions.entries()) {
    try {
      const win = entry?.win
      if (win && !win.isDestroyed()) {
        win.destroy()
        result.workspaceBrowserSessions += 1
      }
      workspaceBrowserSessions.delete(id)
    } catch (error) {
      result.errors.push({ scope: 'workspace-browser', id, error: error?.message || String(error) })
    }
  }

  return result
}

function browserDomSummaryScript(limit = 80) {
  return `(() => {
    const limit = ${Number(limit) || 80}
    const esc = (value) => {
      if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value)
      return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&')
    }
    const trim = (value, max = 120) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, max)
    const cssPath = (el) => {
      if (!el || el.nodeType !== 1) return ''
      if (el.id) return '#' + esc(el.id)
      const parts = []
      let node = el
      while (node && node.nodeType === 1 && parts.length < 6) {
        let part = node.tagName.toLowerCase()
        const parent = node.parentElement
        if (parent) {
          const same = Array.from(parent.children).filter((child) => child.tagName === node.tagName)
          if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(node) + 1) + ')'
        }
        parts.unshift(part)
        node = parent
      }
      return parts.join(' > ')
    }
    const describe = (el) => {
      const rect = el.getBoundingClientRect()
      return {
        selector: cssPath(el),
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || '',
        type: el.getAttribute('type') || '',
        text: trim(el.innerText || el.textContent || el.getAttribute('value') || el.getAttribute('placeholder')),
        ariaLabel: trim(el.getAttribute('aria-label')),
        title: trim(el.getAttribute('title')),
        href: el.href || '',
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
      }
    }
    const elements = Array.from(document.querySelectorAll('a, button, input, textarea, select, summary, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])'))
      .filter((el) => {
        const style = window.getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
      })
      .slice(0, limit)
      .map(describe)
    return {
      url: window.location.href,
      title: document.title || '',
      heading: trim(document.querySelector('h1,h2,h3')?.innerText, 160),
      textSnippet: trim(document.body?.innerText, 1200),
      elements
    }
  })()`
}

export function setupIpcHandlers() {
  if (ipcHandlersInstalled) {
    console.warn('[IPC Guard] setupIpcHandlers already installed; skipping duplicate setup')
    return
  }
  ipcHandlersInstalled = true

  // 包装 ipcMain.handle 以统计 IPC 调用次数 + 全局异常保护
  const originalHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (channel, handler) => {
    return originalHandle(channel, async (...args) => {
      incrementIpcCount()
      try {
        return await handler(...args)
      } catch (err) {
        console.error(`[IPC Guard] ${channel} 异常:`, err?.message || err)
        // 返回标准错误格式，而不是让异常逃逸导致进程崩溃
        return { success: false, error: err?.message || String(err), __ipcError: true }
      }
    })
  }

  const defaultSavePath = path.join(app.getPath('userData'), 'LocalCache')

  currentConfig = {
    image_save_path: path.join(defaultSavePath, 'images'),
    video_save_path: path.join(defaultSavePath, 'videos'),
    convert_png_to_jpg: true,
    jpg_quality: 95
  }

  const toHeaderByteString = (value) =>
    Array.from(String(value ?? '').replace(/[\r\n]/g, ' '))
      .filter((char) => {
        const code = char.charCodeAt(0)
        return code === 9 || (code >= 32 && code <= 126) || (code >= 128 && code <= 255)
      })
      .join('')

  const sanitizeHeaderRecord = (headers = {}) => {
    const sanitized = {}
    for (const [key, value] of Object.entries(headers || {})) {
      const safeKey = String(key || '')
        .replace(/[^!#$%&'*+\-.^_`|~0-9A-Za-z]/g, '')
        .toLowerCase()
      if (!safeKey) continue
      sanitized[safeKey] = toHeaderByteString(value)
    }
    return sanitized
  }

  const handleCloudRequest = async (_event, payload = {}) => {
    const url = assertAllowedCloudApiUrl(payload.url)
    const method = String(payload.method || 'GET').toUpperCase()
    const headers =
      payload.headers && typeof payload.headers === 'object'
        ? sanitizeHeaderRecord(payload.headers)
        : {}
    const body = typeof payload.body === 'string' ? payload.body : undefined

    const response = await fetch(url.toString(), {
      method,
      headers,
      body
    })

    return {
      success: true,
      status: response.status,
      statusText: response.statusText,
      headers: sanitizeHeaderRecord(Object.fromEntries(response.headers.entries())),
      body: await response.text()
    }
  }

  ipcMain.handle('cloud:request', handleCloudRequest)
  ipcMain.handle('cloud-request', handleCloudRequest)
  ipcMain.handle('promptpilot:run', async (_event, payload = {}) => runPromptPilotText(payload))

  const ensureDirs = (context = null) => {
    ensureProjectCacheDirs(context || resolveProjectCacheContext({ projectId: 'unassigned' }))
  }

  ensureDirs()

  ipcMain.handle('cache:openDirectory', async (event, currentPath) => {
    const defaultPath = getSafeDialogDefaultPath(currentPath)
    const { canceled, filePaths, busy } = await showNativeOpenDialog(event, {
      defaultPath,
      properties: ['openDirectory']
    })
    if (busy) {
      return { success: false, busy: true, error: '文件选择器已打开' }
    }
    if (canceled || filePaths.length === 0) {
      return { success: false }
    }
    return { success: true, path: filePaths[0] }
  })

  ipcMain.handle('cache:openFiles', async (event, options = {}) => {
    const { filters, multiple = true } = options
    const dialogOptions = {
      defaultPath: getOpenFilesDefaultPath(options),
      properties: multiple
        ? ['openFile', 'multiSelections', 'dontAddToRecent']
        : ['openFile', 'dontAddToRecent']
    }
    if (filters) {
      dialogOptions.filters = filters
    }
    const { canceled, filePaths, busy } = await showNativeOpenDialog(event, dialogOptions)
    if (busy) {
      return { success: false, paths: [], busy: true, error: '文件选择器已打开' }
    }
    if (canceled || filePaths.length === 0) {
      return { success: false, paths: [] }
    }
    return { success: true, paths: filePaths }
  })

  ipcMain.handle('cache:ping', (event, payload = {}) => {
    const context = resolveProjectCacheContext(payload || {})
    return {
      status: 'ok',
      project_id: context.projectId,
      cache_root: context.root,
      image_save_path: context.dirs.image,
      video_save_path: context.dirs.video,
      thumbnail_save_path: context.dirs.thumbnail,
      convert_png_to_jpg: currentConfig.convert_png_to_jpg,
      pil_available: false
    }
  })

  ipcMain.handle('cache:config', async (event, newConfig = {}) => {
    try {
      const context = resolveProjectCacheContext(newConfig)
      if (typeof newConfig.convertPngToJpg === 'boolean') {
        currentConfig.convert_png_to_jpg = newConfig.convertPngToJpg
      }
      if (newConfig.jpgQuality) currentConfig.jpg_quality = newConfig.jpgQuality

      await ensureProjectCacheDirsAsync(context)

      if (
        newConfig.persist === true &&
        newConfig.projectId &&
        Object.prototype.hasOwnProperty.call(newConfig, 'cacheRoot')
      ) {
        persistProjectCacheRoot(
          newConfig.projectId,
          context.rejectedRoot ? null : newConfig.cacheRoot || null
        )
      }

      return {
        success: true,
        config: {
          ...currentConfig,
          project_id: context.projectId,
          cache_root: context.root,
          image_save_path: context.dirs.image,
          video_save_path: context.dirs.video,
          thumbnail_save_path: context.dirs.thumbnail
        }
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle(
    'cache:save-thumbnail',
    (event, { id, content, category, projectId, cacheRoot } = {}) => {
      try {
        if (!id || !content) return { success: false, error: '缺少必要参数' }
        const context = resolveProjectCacheContext({ projectId, cacheRoot })
        ensureDirs(context)
        const fileName = `${category}_thumb_${id.replace(/[^a-zA-Z0-9_-]/g, '')}.jpg`
        const filePath = path.join(context.dirs.thumbnail, fileName)
        if (content instanceof ArrayBuffer) {
          fs.writeFileSync(filePath, Buffer.from(content))
        } else if (ArrayBuffer.isView(content)) {
          fs.writeFileSync(
            filePath,
            Buffer.from(content.buffer, content.byteOffset, content.byteLength)
          )
        } else {
          const base64Data = stripDataUrlPrefix(content)
          fs.writeFileSync(filePath, base64Data, 'base64')
        }
        indexCacheFile(filePath, 'thumbnail', category || 'thumbnail', id)
        return { success: true, url: toXingheLocalUrl(filePath), path: filePath }
      } catch (e) {
        console.error(e)
        return { success: false, error: e.message }
      }
    }
  )

  ipcMain.handle(
    'cache:save-cache',
    (event, { id, content, category, ext, type, projectId, cacheRoot } = {}) => {
      try {
        if (!id || !content) return { success: false, error: '缺少必要参数' }
        const context = resolveProjectCacheContext({ projectId, cacheRoot })
        ensureDirs(context)
        const isVideo = type === 'video'
        const targetDir = getTargetCacheDir(type, context)
        const writeExt = ext || (isVideo ? '.mp4' : '.jpg')
        const fileName = `${category}_${id.replace(/[^a-zA-Z0-9_-]/g, '')}${writeExt}`
        const filePath = path.join(targetDir, fileName)
        const base64Data = stripDataUrlPrefix(content)
        fs.writeFileSync(filePath, base64Data, 'base64')
        if (isVideo && !looksLikePlayableVideoFile(filePath)) {
          try {
            fs.unlinkSync(filePath)
          } catch {
            // Ignore cleanup failure.
          }
          return { success: false, error: '保存的视频缓存不是有效视频文件' }
        }
        indexCacheFile(filePath, type || (isVideo ? 'video' : 'image'), category, id)
        return { success: true, url: toXingheLocalUrl(filePath), path: filePath }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  )

  ipcMain.handle(
    'cache:copy-file',
    (event, { id, sourcePath, category, type, projectId, cacheRoot, copyToCache = false } = {}) => {
      try {
        if (!id || !sourcePath) return { success: false, error: '缺少必要参数' }
        if (!fs.existsSync(sourcePath)) return { success: false, error: '源文件不存在' }

        if (!copyToCache) {
          return {
            success: true,
            url: toXingheLocalUrl(sourcePath),
            path: sourcePath,
            linked: true
          }
        }

        const context = resolveProjectCacheContext({ projectId, cacheRoot })
        ensureDirs(context)
        const isVideo = type === 'video'
        const targetDir = getTargetCacheDir(type, context)
        const ext = path.extname(sourcePath) || (isVideo ? '.mp4' : '.jpg')
        const fileName = `${category}_${id.replace(/[^a-zA-Z0-9_-]/g, '')}${ext}`
        const filePath = path.join(targetDir, fileName)

        fs.copyFileSync(sourcePath, filePath)
        indexCacheFile(filePath, type || (isVideo ? 'video' : 'image'), category, id)
        const xingheUrl = toXingheLocalUrl(filePath)

        // 对于图片类也可以尝试生成缩略图，这里简化直接返回
        return { success: true, url: xingheUrl, path: filePath }
      } catch (e) {
        console.error(e)
        return { success: false, error: e.message }
      }
    }
  )

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
          if (fs.existsSync(tryPath)) {
            absPath = tryPath
            break
          }
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

  ipcMain.handle(
    'cache:download-url',
    async (event, { url, id, type, projectId, cacheRoot } = {}) => {
      console.log('[cache:download-url] Called with:', { url: url?.substring(0, 50), id, type })
      try {
        if (!url || !id) {
          console.error('[cache:download-url] Missing params')
          return { success: false, error: '缺少必要参数' }
        }
        const context = resolveProjectCacheContext({ projectId, cacheRoot })
        ensureDirs(context)
        const isVideo = type === 'video'
        const targetDir = getTargetCacheDir(type, context)
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
        assertDownloadLooksLikeMedia(res, type)

        await writeFetchBodyToFile(res, filePath)
        indexCacheFile(filePath, isVideo ? 'video' : 'image', 'download', id)

        const xingheUrl = toXingheLocalUrl(filePath)

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
    }
  )

  ipcMain.handle('system:show-item-in-folder', (event, absolutePath) => {
    return openLocalPathDetached(absolutePath, { showItem: true })
  })

  ipcMain.handle('system:clipboard-write-text', (_, text) => {
    try {
      clipboard.writeText(String(text || ''))
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('system:open-external', async (_, url) => {
    try {
      if (!url || typeof url !== 'string') return { success: false, error: '缺少 URL' }
      const parsed = new URL(url)
      if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) {
        return { success: false, error: '只允许打开 http、https 或 file URL' }
      }
      await shell.openExternal(parsed.toString())
      return { success: true, url: parsed.toString() }
    } catch (e) {
      return { success: false, error: `打开 URL 失败: ${e.message}` }
    }
  })

  ipcMain.handle('system:inspect-url', async (_, url) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12000)
    try {
      if (!url || typeof url !== 'string') return { success: false, error: '缺少 URL' }
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { success: false, error: '只允许检查 http 或 https URL' }
      }
      const response = await fetch(parsed.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent': 'XingheZhihui/WorkspaceBrowserCheck'
        }
      })
      const contentType = response.headers.get('content-type') || ''
      let snippet = ''
      let title = ''
      if (/text\/html|text\/plain|application\/json|application\/xml/i.test(contentType)) {
        let text = ''
        const reader = response.body?.getReader?.()
        if (reader) {
          const decoder = new TextDecoder()
          while (text.length < 200000) {
            const { done, value } = await reader.read()
            if (done) break
            text += decoder.decode(value, { stream: true })
          }
          text += decoder.decode()
          try {
            await reader.cancel()
          } catch {
            // Ignore cancellation errors after collecting enough preview text.
          }
        } else {
          text = await response.text()
        }
        snippet = text.replace(/\s+/g, ' ').slice(0, 1000)
        const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
        if (titleMatch) title = titleMatch[1].replace(/\s+/g, ' ').trim().slice(0, 160)
      }
      return {
        success: true,
        url: parsed.toString(),
        finalUrl: response.url,
        status: response.status,
        ok: response.ok,
        contentType,
        title,
        snippet
      }
    } catch (e) {
      return { success: false, url, error: `检查 URL 失败: ${e.message}` }
    } finally {
      clearTimeout(timer)
    }
  })

  ipcMain.handle('system:capture-url-screenshot', async (_, url) => {
    let win = null
    try {
      const parsed = normalizeWorkspaceBrowserUrl(url, { allowFile: true })
      win = createWorkspaceBrowserWindow()
      await loadWorkspaceBrowserPage(win, parsed.toString())
      const image = await win.webContents.capturePage()
      const filePath = saveWorkspaceBrowserScreenshot(image, parsed.toString())
      return {
        success: true,
        url: parsed.toString(),
        screenshotPath: filePath,
        width: 1280,
        height: 900
      }
    } catch (e) {
      return { success: false, url, error: `截图 URL 失败: ${e.message}` }
    } finally {
      if (win && !win.isDestroyed()) win.destroy()
    }
  })

  ipcMain.handle('system:inspect-url-dom', async (_, url) => {
    let win = null
    try {
      const parsed = normalizeWorkspaceBrowserUrl(url, { allowFile: true })
      win = createWorkspaceBrowserWindow()
      await loadWorkspaceBrowserPage(win, parsed.toString())
      const dom = await win.webContents.executeJavaScript(
        `(() => {
          const esc = (value) => {
            if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value)
            return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&')
          }
          const trim = (value, max = 120) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, max)
          const cssPath = (el) => {
            if (!el || el.nodeType !== 1) return ''
            if (el.id) return '#' + esc(el.id)
            const parts = []
            let node = el
            while (node && node.nodeType === 1 && parts.length < 6) {
              let part = node.tagName.toLowerCase()
              const parent = node.parentElement
              if (parent) {
                const same = Array.from(parent.children).filter((child) => child.tagName === node.tagName)
                if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(node) + 1) + ')'
              }
              parts.unshift(part)
              node = parent
            }
            return parts.join(' > ')
          }
          const describe = (el) => {
            const rect = el.getBoundingClientRect()
            return {
              selector: cssPath(el),
              tag: el.tagName.toLowerCase(),
              role: el.getAttribute('role') || '',
              type: el.getAttribute('type') || '',
              text: trim(el.innerText || el.textContent || el.getAttribute('value') || el.getAttribute('placeholder')),
              ariaLabel: trim(el.getAttribute('aria-label')),
              title: trim(el.getAttribute('title')),
              href: el.href || '',
              rect: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              }
            }
          }
          const candidates = Array.from(document.querySelectorAll(
            'a, button, input, textarea, select, summary, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])'
          ))
          const elements = candidates
            .filter((el) => {
              const style = window.getComputedStyle(el)
              const rect = el.getBoundingClientRect()
              return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
            })
            .slice(0, 80)
            .map(describe)
          return {
            url: window.location.href,
            title: document.title || '',
            heading: trim(document.querySelector('h1,h2,h3')?.innerText, 160),
            textSnippet: trim(document.body?.innerText, 1200),
            elements
          }
        })()`,
        true
      )
      return { success: true, ...dom }
    } catch (e) {
      return { success: false, url, error: `检查页面 DOM 失败: ${e.message}` }
    } finally {
      if (win && !win.isDestroyed()) win.destroy()
    }
  })

  ipcMain.handle('system:click-url-selector', async (_, payload = {}) => {
    let win = null
    try {
      const parsed = normalizeWorkspaceBrowserUrl(payload.url, { allowFile: true })
      const selector = String(payload.selector || '')
      const text = String(payload.text || '')
      if (!selector && !text) return { success: false, error: '缺少 selector 或文本' }
      win = createWorkspaceBrowserWindow()
      await loadWorkspaceBrowserPage(win, parsed.toString())
      const clickResult = await win.webContents.executeJavaScript(
        `(() => {
          const selector = ${JSON.stringify(selector)}
          const text = ${JSON.stringify(text)}
          const trim = (value, max = 140) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, max)
          const describe = (el) => {
            const rect = el.getBoundingClientRect()
            return {
              tag: el.tagName.toLowerCase(),
              text: trim(el.innerText || el.textContent || el.getAttribute('value') || el.getAttribute('placeholder')),
              ariaLabel: trim(el.getAttribute('aria-label')),
              href: el.href || '',
              rect: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              }
            }
          }
          let el = null
          if (selector) {
            try {
              el = document.querySelector(selector)
            } catch (err) {
              return { clicked: false, error: 'selector 无效: ' + err.message }
            }
          }
          if (!el && text) {
            const needle = text.toLowerCase()
            el = Array.from(document.querySelectorAll(
              'a, button, input, textarea, select, summary, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])'
            )).find((item) => {
              const label = [
                item.innerText,
                item.textContent,
                item.getAttribute('value'),
                item.getAttribute('placeholder'),
                item.getAttribute('aria-label'),
                item.getAttribute('title')
              ].filter(Boolean).join(' ').toLowerCase()
              return label.includes(needle)
            })
          }
          if (!el) return { clicked: false, error: '未找到元素' }
          el.scrollIntoView({ block: 'center', inline: 'center' })
          el.click()
          return { clicked: true, target: describe(el) }
        })()`,
        true
      )
      if (!clickResult?.clicked) {
        return { success: false, url: parsed.toString(), error: clickResult?.error || '点击失败' }
      }
      await new Promise((resolve) => setTimeout(resolve, 1200))
      const image = await win.webContents.capturePage()
      const screenshotPath = saveWorkspaceBrowserScreenshot(
        image,
        win.webContents.getURL() || parsed.toString()
      )
      return {
        success: true,
        url: parsed.toString(),
        finalUrl: win.webContents.getURL(),
        title: await win.webContents.getTitle(),
        target: clickResult.target,
        screenshotPath
      }
    } catch (e) {
      return { success: false, url: payload?.url, error: `点击页面元素失败: ${e.message}` }
    } finally {
      if (win && !win.isDestroyed()) win.destroy()
    }
  })

  ipcMain.handle('system:capture-url-viewport-matrix', async (_, payload = {}) => {
    const windows = []
    try {
      const parsed = normalizeWorkspaceBrowserUrl(payload.url, { allowFile: true })
      const requested = Array.isArray(payload.viewports) ? payload.viewports : []
      const viewports = (
        requested.length
          ? requested
          : [
              { name: 'desktop', width: 1440, height: 960 },
              { name: 'tablet', width: 834, height: 1112 },
              { name: 'mobile', width: 390, height: 844 }
            ]
      )
        .map((viewport, index) => ({
          name: String(viewport.name || `viewport-${index + 1}`).slice(0, 40),
          width: Math.min(Math.max(Number(viewport.width) || 1280, 240), 2560),
          height: Math.min(Math.max(Number(viewport.height) || 900, 240), 2560)
        }))
        .slice(0, 6)

      const captures = []
      for (const viewport of viewports) {
        const win = createWorkspaceBrowserWindow({
          width: viewport.width,
          height: viewport.height
        })
        windows.push(win)
        await loadWorkspaceBrowserPage(win, parsed.toString())
        const image = await win.webContents.capturePage()
        captures.push({
          ...viewport,
          url: win.webContents.getURL(),
          title: await win.webContents.getTitle(),
          screenshotPath: saveWorkspaceBrowserScreenshot(image, parsed.toString())
        })
      }

      return { success: true, url: parsed.toString(), captures }
    } catch (e) {
      return { success: false, url: payload?.url, error: `生成视口截图矩阵失败: ${e.message}` }
    } finally {
      windows.forEach((win) => {
        if (win && !win.isDestroyed()) win.destroy()
      })
    }
  })

  ipcMain.handle('system:annotate-url-screenshot', async (_, payload = {}) => {
    let win = null
    try {
      const parsed = normalizeWorkspaceBrowserUrl(payload.url, { allowFile: true })
      const selectors = Array.isArray(payload.selectors) ? payload.selectors.slice(0, 12) : []
      const texts = Array.isArray(payload.texts) ? payload.texts.slice(0, 12) : []
      win = createWorkspaceBrowserWindow({
        width: Number(payload.width) || 1280,
        height: Number(payload.height) || 900
      })
      await loadWorkspaceBrowserPage(win, parsed.toString())
      const annotations = await win.webContents.executeJavaScript(
        `(() => {
          const selectors = ${JSON.stringify(selectors)}
          const texts = ${JSON.stringify(texts)}
          const trim = (value, max = 120) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, max)
          const targets = []
          selectors.forEach((selector) => {
            try {
              const el = document.querySelector(selector)
              if (el) targets.push({ el, label: selector })
            } catch {}
          })
          texts.forEach((text) => {
            const needle = String(text || '').toLowerCase()
            if (!needle) return
            const el = Array.from(document.querySelectorAll('a, button, input, textarea, select, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])')).find((item) => {
              const label = [
                item.innerText,
                item.textContent,
                item.getAttribute('value'),
                item.getAttribute('placeholder'),
                item.getAttribute('aria-label'),
                item.getAttribute('title')
              ].filter(Boolean).join(' ').toLowerCase()
              return label.includes(needle)
            })
            if (el) targets.push({ el, label: text })
          })
          const unique = []
          const seen = new Set()
          targets.forEach((target) => {
            if (seen.has(target.el)) return
            seen.add(target.el)
            unique.push(target)
          })
          const annotations = unique.slice(0, 12).map((target, index) => {
            const rect = target.el.getBoundingClientRect()
            const top = rect.top + window.scrollY
            const left = rect.left + window.scrollX
            const box = document.createElement('div')
            box.setAttribute('data-xinghe-browser-annotation', 'true')
            box.style.position = 'absolute'
            box.style.left = left + 'px'
            box.style.top = top + 'px'
            box.style.width = Math.max(rect.width, 1) + 'px'
            box.style.height = Math.max(rect.height, 1) + 'px'
            box.style.border = '3px solid #22d3ee'
            box.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.08), 0 0 18px rgba(34,211,238,0.5)'
            box.style.borderRadius = '6px'
            box.style.pointerEvents = 'none'
            box.style.zIndex = '2147483646'
            const badge = document.createElement('div')
            badge.textContent = String(index + 1)
            badge.style.position = 'absolute'
            badge.style.left = '-3px'
            badge.style.top = '-28px'
            badge.style.minWidth = '24px'
            badge.style.height = '24px'
            badge.style.padding = '0 6px'
            badge.style.borderRadius = '999px'
            badge.style.background = '#22d3ee'
            badge.style.color = '#051014'
            badge.style.font = '700 13px/24px sans-serif'
            badge.style.textAlign = 'center'
            box.appendChild(badge)
            document.body.appendChild(box)
            return {
              index: index + 1,
              label: trim(target.label),
              text: trim(target.el.innerText || target.el.textContent || target.el.getAttribute('aria-label') || target.el.getAttribute('placeholder')),
              rect: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              }
            }
          })
          return {
            url: window.location.href,
            title: document.title || '',
            annotations
          }
        })()`,
        true
      )
      await new Promise((resolve) => setTimeout(resolve, 180))
      const image = await win.webContents.capturePage()
      return {
        success: true,
        url: parsed.toString(),
        finalUrl: win.webContents.getURL(),
        title: annotations?.title || (await win.webContents.getTitle()),
        annotations: annotations?.annotations || [],
        screenshotPath: saveWorkspaceBrowserScreenshot(image, parsed.toString())
      }
    } catch (e) {
      return {
        success: false,
        url: payload?.url,
        error: `Annotate screenshot failed: ${e.message}`
      }
    } finally {
      if (win && !win.isDestroyed()) win.destroy()
    }
  })

  ipcMain.handle('system:inspect-url-console', async (_, payload = {}) => {
    let win = null
    const consoleMessages = []
    const loadFailures = []
    const crashes = []
    try {
      const parsed = normalizeWorkspaceBrowserUrl(payload.url, { allowFile: true })
      win = createWorkspaceBrowserWindow({
        width: Number(payload.width) || 1280,
        height: Number(payload.height) || 900
      })
      const maxMessages = Math.min(Math.max(Number(payload.limit) || 80, 10), 300)
      win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
        consoleMessages.push({
          level,
          message: String(message || '').slice(0, 1000),
          line,
          sourceId: String(sourceId || '').slice(0, 400)
        })
        if (consoleMessages.length > maxMessages) consoleMessages.shift()
      })
      win.webContents.on(
        'did-fail-load',
        (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
          loadFailures.push({
            errorCode,
            errorDescription,
            url: validatedURL,
            isMainFrame
          })
        }
      )
      win.webContents.on('render-process-gone', (_event, details) => {
        crashes.push(details)
      })
      let loadError = null
      try {
        await loadWorkspaceBrowserPage(win, parsed.toString(), Number(payload.timeoutMs) || 18000)
      } catch (e) {
        loadError = e.message
      }
      const pageErrors = await win.webContents
        .executeJavaScript(
          `(() => {
          const errors = []
          window.addEventListener('error', (event) => {
            errors.push({
              message: String(event.message || ''),
              source: String(event.filename || ''),
              line: event.lineno || 0,
              column: event.colno || 0
            })
          })
          window.addEventListener('unhandledrejection', (event) => {
            errors.push({
              message: String(event.reason?.message || event.reason || 'Unhandled rejection'),
              source: 'unhandledrejection',
              line: 0,
              column: 0
            })
          })
          return {
            url: window.location.href,
            title: document.title || '',
            readyState: document.readyState,
            textSnippet: String(document.body?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 600),
            errors
          }
        })()`,
          true
        )
        .catch((e) => ({ errors: [{ message: e.message, source: 'executeJavaScript' }] }))
      const severeMessages = consoleMessages.filter((item) => item.level >= 2)
      return {
        success: !loadError,
        url: parsed.toString(),
        finalUrl: pageErrors?.url || win.webContents.getURL(),
        title: pageErrors?.title || (await win.webContents.getTitle()),
        readyState: pageErrors?.readyState,
        consoleMessages,
        severeMessages,
        loadFailures,
        crashes,
        pageErrors: pageErrors?.errors || [],
        textSnippet: pageErrors?.textSnippet || '',
        error: loadError || undefined
      }
    } catch (e) {
      return { success: false, url: payload?.url, error: `Inspect console failed: ${e.message}` }
    } finally {
      if (win && !win.isDestroyed()) win.destroy()
    }
  })

  ipcMain.handle('system:fill-url-form', async (_, payload = {}) => {
    let win = null
    try {
      const parsed = normalizeWorkspaceBrowserUrl(payload.url, { allowFile: true })
      const fields = Array.isArray(payload.fields) ? payload.fields.slice(0, 30) : []
      if (!fields.length) return { success: false, error: 'Missing form fields' }
      win = createWorkspaceBrowserWindow()
      await loadWorkspaceBrowserPage(win, parsed.toString())
      const fillResult = await win.webContents.executeJavaScript(
        `(() => {
          const fields = ${JSON.stringify(fields)}
          const submit = ${JSON.stringify(!!payload.submit)}
          const submitSelector = ${JSON.stringify(payload.submitSelector || '')}
          const submitText = ${JSON.stringify(payload.submitText || '')}
          const trim = (value, max = 140) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, max)
          const fire = (el) => {
            el.dispatchEvent(new Event('input', { bubbles: true }))
            el.dispatchEvent(new Event('change', { bubbles: true }))
          }
          const findByLabel = (label) => {
            const needle = String(label || '').toLowerCase()
            if (!needle) return null
            const direct = Array.from(document.querySelectorAll('input, textarea, select')).find((el) => {
              const value = [
                el.getAttribute('aria-label'),
                el.getAttribute('placeholder'),
                el.getAttribute('name'),
                el.getAttribute('id'),
                el.getAttribute('title')
              ].filter(Boolean).join(' ').toLowerCase()
              return value.includes(needle)
            })
            if (direct) return direct
            const labelEl = Array.from(document.querySelectorAll('label')).find((item) => item.innerText.toLowerCase().includes(needle))
            if (!labelEl) return null
            const forId = labelEl.getAttribute('for')
            if (forId) return document.getElementById(forId)
            return labelEl.querySelector('input, textarea, select')
          }
          const setValue = (el, value) => {
            if (!el) return false
            el.scrollIntoView({ block: 'center', inline: 'center' })
            if (el.tagName === 'SELECT') {
              const wanted = String(value)
              const option = Array.from(el.options).find((item) => item.value === wanted || item.textContent.trim() === wanted)
              if (option) el.value = option.value
              else el.value = wanted
              fire(el)
              return true
            }
            if (el.type === 'checkbox' || el.type === 'radio') {
              el.checked = Boolean(value)
              fire(el)
              return true
            }
            el.focus()
            el.value = String(value ?? '')
            fire(el)
            return true
          }
          const filled = []
          const missing = []
          fields.forEach((field) => {
            let el = null
            if (field.selector) {
              try {
                el = document.querySelector(field.selector)
              } catch {}
            }
            if (!el) el = findByLabel(field.label || field.name || field.placeholder)
            if (setValue(el, field.value)) {
              filled.push({
                selector: field.selector || '',
                label: field.label || field.name || field.placeholder || '',
                tag: el.tagName.toLowerCase(),
                type: el.getAttribute('type') || ''
              })
            } else {
              missing.push({
                selector: field.selector || '',
                label: field.label || field.name || field.placeholder || ''
              })
            }
          })
          let submitted = false
          let submitTarget = null
          if (submit) {
            if (submitSelector) {
              try {
                submitTarget = document.querySelector(submitSelector)
              } catch {}
            }
            if (!submitTarget && submitText) {
              const needle = submitText.toLowerCase()
              submitTarget = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]')).find((item) => {
                const label = [item.innerText, item.value, item.getAttribute('aria-label'), item.getAttribute('title')].filter(Boolean).join(' ').toLowerCase()
                return label.includes(needle)
              })
            }
            if (submitTarget) {
              submitTarget.scrollIntoView({ block: 'center', inline: 'center' })
              submitTarget.click()
              submitted = true
            }
          }
          return { filled, missing, submitted }
        })()`,
        true
      )
      await new Promise((resolve) => setTimeout(resolve, fillResult?.submitted ? 1200 : 300))
      const image = await win.webContents.capturePage()
      return {
        success: true,
        url: parsed.toString(),
        finalUrl: win.webContents.getURL(),
        title: await win.webContents.getTitle(),
        filled: fillResult?.filled || [],
        missing: fillResult?.missing || [],
        submitted: !!fillResult?.submitted,
        screenshotPath: saveWorkspaceBrowserScreenshot(
          image,
          win.webContents.getURL() || parsed.toString()
        )
      }
    } catch (e) {
      return { success: false, url: payload?.url, error: `Fill form failed: ${e.message}` }
    } finally {
      if (win && !win.isDestroyed()) win.destroy()
    }
  })

  ipcMain.handle('system:start-browser-session', async (_, payload = {}) => {
    try {
      const parsed = normalizeWorkspaceBrowserUrl(payload.url, { allowFile: true })
      const sessionId = createWorkspaceBrowserSessionId(payload.sessionId)
      const old = workspaceBrowserSessions.get(sessionId)
      if (old?.win && !old.win.isDestroyed()) old.win.destroy()
      const partition =
        payload.persistProfile === false ? undefined : createWorkspaceBrowserPartition(sessionId)
      const win = createWorkspaceBrowserWindow({
        width: Number(payload.width) || 1280,
        height: Number(payload.height) || 900,
        partition
      })
      rememberWorkspaceBrowserSession(sessionId, win)
      await loadWorkspaceBrowserPage(win, parsed.toString())
      return {
        success: true,
        sessionId,
        sessionProfile: partition ? sessionId : undefined,
        sessionPersisted: !!partition,
        url: win.webContents.getURL(),
        title: await win.webContents.getTitle()
      }
    } catch (e) {
      return {
        success: false,
        url: payload?.url,
        error: `Start browser session failed: ${e.message}`
      }
    }
  })

  ipcMain.handle('system:import-browser-cookies', async (_, payload = {}) => {
    try {
      const sessionId = createWorkspaceBrowserSessionId(payload.sessionId)
      const partition = createWorkspaceBrowserPartition(sessionId)
      const browserSession = session.fromPartition(partition)
      const cookies = normalizeImportedBrowserCookies(payload.cookies).slice(0, 1200)
      const failures = []
      let imported = 0

      for (const cookie of cookies) {
        try {
          await browserSession.cookies.set(toElectronCookieDetails(cookie))
          imported += 1
        } catch (error) {
          failures.push({
            name: cookie?.name,
            domain: cookie?.domain || cookie?.host,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      return {
        success: imported > 0,
        sessionId,
        sessionProfile: sessionId,
        imported,
        failed: failures.length,
        failures: failures.slice(0, 12),
        error: imported > 0 ? undefined : failures[0]?.error || '没有可导入的 cookie'
      }
    } catch (e) {
      return {
        success: false,
        sessionId: payload?.sessionId,
        imported: 0,
        failed: 0,
        error: `Import browser cookies failed: ${e.message}`
      }
    }
  })

  ipcMain.handle('system:list-browser-profiles', async () => {
    try {
      return { success: true, profiles: listBrowserProfileCandidates() }
    } catch (e) {
      return { success: false, profiles: [], error: `List browser profiles failed: ${e.message}` }
    }
  })

  ipcMain.handle('system:import-browser-profile-cookies', async (_, payload = {}) => {
    try {
      const profilePath = String(payload.profilePath || '').trim()
      const matchedProfile = findBrowserProfileByPath(profilePath)
      if (!matchedProfile) {
        return {
          success: false,
          imported: 0,
          failed: 0,
          error: '请选择系统发现到的 Chrome/Edge/Brave/Firefox Profile 目录'
        }
      }
      if (matchedProfile.browser === 'Firefox') {
        return {
          success: false,
          imported: 0,
          failed: 0,
          error: 'Firefox cookie 解密暂未接入；当前支持 Chromium 系浏览器 Profile'
        }
      }
      const sessionId = createWorkspaceBrowserSessionId(payload.sessionId)
      const partition = createWorkspaceBrowserPartition(sessionId)
      const browserSession = session.fromPartition(partition)
      const { cookies, failures: decryptFailures } = readChromiumCookiesFromProfile(profilePath, {
        domain: payload.domain,
        limit: payload.limit
      })
      const failures = [...decryptFailures]
      let imported = 0
      const now = Date.now() / 1000
      for (const cookie of cookies) {
        try {
          if (cookie.expirationDate && cookie.expirationDate < now) continue
          await browserSession.cookies.set(toElectronCookieDetails(cookie))
          imported += 1
        } catch (error) {
          failures.push({
            name: cookie?.name,
            domain: cookie?.domain || cookie?.host,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }
      return {
        success: imported > 0,
        sessionId,
        sessionProfile: sessionId,
        sourceProfile: matchedProfile,
        imported,
        failed: failures.length,
        failures: failures.slice(0, 12),
        error: imported > 0 ? undefined : failures[0]?.error || '没有可导入的 cookie'
      }
    } catch (e) {
      return {
        success: false,
        sessionId: payload?.sessionId,
        imported: 0,
        failed: 0,
        error: `Import browser profile cookies failed: ${e.message}`
      }
    }
  })

  ipcMain.handle('system:inspect-browser-session-dom', async (_, payload = {}) => {
    try {
      const entry = getWorkspaceBrowserSession(payload.sessionId)
      const dom = await entry.win.webContents.executeJavaScript(
        browserDomSummaryScript(payload.limit || 80),
        true
      )
      return { success: true, sessionId: entry.id, ...dom }
    } catch (e) {
      return {
        success: false,
        sessionId: payload?.sessionId,
        error: `Inspect browser session failed: ${e.message}`
      }
    }
  })

  ipcMain.handle('system:inspect-browser-session-console', async (_, payload = {}) => {
    try {
      const entry = getWorkspaceBrowserSession(payload.sessionId)
      const limit = Math.min(Math.max(Number(payload.limit) || 80, 10), 300)
      const page = await entry.win.webContents.executeJavaScript(
        `(() => ({
          url: window.location.href,
          title: document.title || '',
          readyState: document.readyState,
          textSnippet: String(document.body?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 600)
        }))()`,
        true
      )
      const consoleMessages = (entry.consoleMessages || []).slice(-limit)
      const severeMessages = consoleMessages.filter((item) => Number(item.level) >= 2)
      return {
        success: true,
        sessionId: entry.id,
        url: page?.url || entry.win.webContents.getURL(),
        title: page?.title || (await entry.win.webContents.getTitle()),
        readyState: page?.readyState,
        textSnippet: page?.textSnippet || '',
        consoleMessages,
        severeMessages,
        loadFailures: (entry.loadFailures || []).slice(-limit),
        crashes: (entry.crashes || []).slice(-limit)
      }
    } catch (e) {
      return {
        success: false,
        sessionId: payload?.sessionId,
        error: `Inspect browser session console failed: ${e.message}`
      }
    }
  })

  ipcMain.handle('system:capture-browser-session-screenshot', async (_, payload = {}) => {
    try {
      const entry = getWorkspaceBrowserSession(payload.sessionId)
      const image = await entry.win.webContents.capturePage()
      return {
        success: true,
        sessionId: entry.id,
        url: entry.win.webContents.getURL(),
        title: await entry.win.webContents.getTitle(),
        screenshotPath: saveWorkspaceBrowserScreenshot(
          image,
          entry.win.webContents.getURL() || 'file://browser-session'
        )
      }
    } catch (e) {
      return {
        success: false,
        sessionId: payload?.sessionId,
        error: `Capture browser session failed: ${e.message}`
      }
    }
  })

  ipcMain.handle('system:click-browser-session-element', async (_, payload = {}) => {
    try {
      const entry = getWorkspaceBrowserSession(payload.sessionId)
      const selector = String(payload.selector || '')
      const text = String(payload.text || '')
      if (!selector && !text) return { success: false, error: 'Missing selector or text' }
      const clickResult = await entry.win.webContents.executeJavaScript(
        `(() => {
          const selector = ${JSON.stringify(selector)}
          const text = ${JSON.stringify(text)}
          const trim = (value, max = 140) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, max)
          let el = null
          if (selector) {
            try { el = document.querySelector(selector) } catch (err) { return { clicked: false, error: 'selector invalid: ' + err.message } }
          }
          if (!el && text) {
            const needle = text.toLowerCase()
            el = Array.from(document.querySelectorAll('a, button, input, textarea, select, summary, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])')).find((item) => {
              const label = [item.innerText, item.textContent, item.value, item.getAttribute('placeholder'), item.getAttribute('aria-label'), item.getAttribute('title')].filter(Boolean).join(' ').toLowerCase()
              return label.includes(needle)
            })
          }
          if (!el) return { clicked: false, error: 'element not found' }
          el.scrollIntoView({ block: 'center', inline: 'center' })
          const rect = el.getBoundingClientRect()
          const target = {
            tag: el.tagName.toLowerCase(),
            text: trim(el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder')),
            href: el.href || '',
            rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
          }
          el.click()
          return { clicked: true, target }
        })()`,
        true
      )
      if (!clickResult?.clicked) {
        return { success: false, sessionId: entry.id, error: clickResult?.error || 'Click failed' }
      }
      await new Promise((resolve) => setTimeout(resolve, Number(payload.waitMs) || 900))
      const image = await entry.win.webContents.capturePage()
      return {
        success: true,
        sessionId: entry.id,
        url: entry.win.webContents.getURL(),
        title: await entry.win.webContents.getTitle(),
        target: clickResult.target,
        screenshotPath: saveWorkspaceBrowserScreenshot(
          image,
          entry.win.webContents.getURL() || 'file://browser-session'
        )
      }
    } catch (e) {
      return {
        success: false,
        sessionId: payload?.sessionId,
        error: `Click browser session failed: ${e.message}`
      }
    }
  })

  ipcMain.handle('system:fill-browser-session-form', async (_, payload = {}) => {
    try {
      const entry = getWorkspaceBrowserSession(payload.sessionId)
      const fields = Array.isArray(payload.fields) ? payload.fields.slice(0, 30) : []
      if (!fields.length) return { success: false, error: 'Missing form fields' }
      const fillResult = await entry.win.webContents.executeJavaScript(
        `(() => {
          const fields = ${JSON.stringify(fields)}
          const submit = ${JSON.stringify(!!payload.submit)}
          const submitSelector = ${JSON.stringify(payload.submitSelector || '')}
          const submitText = ${JSON.stringify(payload.submitText || '')}
          const findByLabel = (label) => {
            const needle = String(label || '').toLowerCase()
            if (!needle) return null
            const direct = Array.from(document.querySelectorAll('input, textarea, select')).find((el) => [el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.getAttribute('name'), el.id, el.getAttribute('title')].filter(Boolean).join(' ').toLowerCase().includes(needle))
            if (direct) return direct
            const labelEl = Array.from(document.querySelectorAll('label')).find((item) => item.innerText.toLowerCase().includes(needle))
            if (!labelEl) return null
            const forId = labelEl.getAttribute('for')
            return forId ? document.getElementById(forId) : labelEl.querySelector('input, textarea, select')
          }
          const fire = (el) => {
            el.dispatchEvent(new Event('input', { bubbles: true }))
            el.dispatchEvent(new Event('change', { bubbles: true }))
          }
          const setValue = (el, value) => {
            if (!el) return false
            el.scrollIntoView({ block: 'center', inline: 'center' })
            if (el.tagName === 'SELECT') {
              const wanted = String(value)
              const option = Array.from(el.options).find((item) => item.value === wanted || item.textContent.trim() === wanted)
              el.value = option ? option.value : wanted
              fire(el)
              return true
            }
            if (el.type === 'checkbox' || el.type === 'radio') {
              el.checked = Boolean(value)
              fire(el)
              return true
            }
            el.focus()
            el.value = String(value ?? '')
            fire(el)
            return true
          }
          const filled = []
          const missing = []
          fields.forEach((field) => {
            let el = null
            if (field.selector) {
              try { el = document.querySelector(field.selector) } catch {}
            }
            if (!el) el = findByLabel(field.label || field.name || field.placeholder)
            if (setValue(el, field.value)) filled.push({ selector: field.selector || '', label: field.label || field.name || field.placeholder || '', tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || '' })
            else missing.push({ selector: field.selector || '', label: field.label || field.name || field.placeholder || '' })
          })
          let submitted = false
          if (submit) {
            let submitTarget = null
            if (submitSelector) {
              try { submitTarget = document.querySelector(submitSelector) } catch {}
            }
            if (!submitTarget && submitText) {
              const needle = submitText.toLowerCase()
              submitTarget = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]')).find((item) => [item.innerText, item.value, item.getAttribute('aria-label'), item.getAttribute('title')].filter(Boolean).join(' ').toLowerCase().includes(needle))
            }
            if (submitTarget) {
              submitTarget.scrollIntoView({ block: 'center', inline: 'center' })
              submitTarget.click()
              submitted = true
            }
          }
          return { filled, missing, submitted }
        })()`,
        true
      )
      await new Promise((resolve) => setTimeout(resolve, fillResult?.submitted ? 1200 : 250))
      const image = await entry.win.webContents.capturePage()
      return {
        success: true,
        sessionId: entry.id,
        url: entry.win.webContents.getURL(),
        title: await entry.win.webContents.getTitle(),
        filled: fillResult?.filled || [],
        missing: fillResult?.missing || [],
        submitted: !!fillResult?.submitted,
        screenshotPath: saveWorkspaceBrowserScreenshot(
          image,
          entry.win.webContents.getURL() || 'file://browser-session'
        )
      }
    } catch (e) {
      return {
        success: false,
        sessionId: payload?.sessionId,
        error: `Fill browser session failed: ${e.message}`
      }
    }
  })

  ipcMain.handle('system:close-browser-session', async (_, payload = {}) => {
    try {
      const entry = getWorkspaceBrowserSession(payload.sessionId)
      const url = entry.win.webContents.getURL()
      entry.win.destroy()
      workspaceBrowserSessions.delete(entry.id)
      return { success: true, sessionId: entry.id, url }
    } catch (e) {
      return {
        success: false,
        sessionId: payload?.sessionId,
        error: `Close browser session failed: ${e.message}`
      }
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

  // Save text content through the native save dialog.
  ipcMain.handle(
    'system:save-text-file-as',
    async (event, { content = '', defaultName = 'export.txt', filters } = {}) => {
      try {
        const safeDefaultName = path.basename(String(defaultName || 'export.txt'))
        const dialogResult = await dialog.showSaveDialog({
          title: 'Save As',
          defaultPath: safeDefaultName,
          filters:
            Array.isArray(filters) && filters.length > 0
              ? filters
              : [
                  { name: 'Text Files', extensions: ['txt'] },
                  { name: 'All Files', extensions: ['*'] }
                ]
        })

        if (dialogResult.canceled || !dialogResult.filePath) {
          return { success: false, canceled: true }
        }

        fs.writeFileSync(dialogResult.filePath, String(content), 'utf-8')
        const stat = fs.statSync(dialogResult.filePath)
        return { success: true, path: dialogResult.filePath, size: stat.size }
      } catch (e) {
        console.error('Save text file as failed:', e)
        return { success: false, error: e.message }
      }
    }
  )

  // Video concat: use FFmpeg to merge multiple videos into one file.
  ipcMain.handle(
    'system:concat-videos',
    async (event, { videoPaths, outputName, projectId, cacheRoot } = {}) => {
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
              if (fs.existsSync(tryP)) {
                rp = tryP
                break
              }
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
        const listContent = resolvedPaths
          .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
          .join('\n')
        fs.writeFileSync(listFile, listContent, 'utf-8')

        // 输出路径
        const context = resolveProjectCacheContext({ projectId, cacheRoot })
        ensureDirs(context)
        const outputDir = context.dirs.video
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
        const outputPath = path.join(outputDir, outputName || `concat_${Date.now()}.mp4`)

        // 调用 FFmpeg
        const ffmpegBin = resolvePackagedExecutable(
          ffmpegStaticPath,
          process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
        )
        return new Promise((resolve) => {
          execFile(
            ffmpegBin,
            ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outputPath],
            { timeout: 120000 },
            (err, stdout, stderr) => {
              // 清理临时文件
              try {
                fs.unlinkSync(listFile)
              } catch (_e) {
                /* ignore */
              }

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
              indexCacheFile(outputPath, 'video', 'concat', outputName || null)

              const win = BrowserWindow.getFocusedWindow()
              dialog
                .showSaveDialog(win, {
                  title: '导出拼接视频',
                  defaultPath: path.join(
                    app.getPath('downloads'),
                    outputName || 'director_output.mp4'
                  ),
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
    }
  )

  ipcMain.handle('cache:check', (event, { basePath }) => {
    try {
      if (!basePath) return { exists: false }
      const candidates = []
      if (path.isAbsolute(basePath)) {
        candidates.push(basePath)
      } else {
        candidates.push(path.join(app.getPath('userData'), 'LocalCache', basePath))
        const fname = basePath.split(/[/\\]/).pop()
        if (fname) {
          candidates.push(path.join(currentConfig.image_save_path, fname))
          candidates.push(path.join(currentConfig.video_save_path, fname))
        }
      }

      for (const fullPath of candidates) {
        if (fs.existsSync(fullPath)) {
          if (VIDEO_EXTS.has(path.extname(fullPath).toLowerCase()) && !looksLikePlayableVideoFile(fullPath)) {
            removeCacheFileIndex(fullPath)
            try {
              fs.unlinkSync(fullPath)
            } catch {
              // Ignore best-effort cleanup failure.
            }
            continue
          }
          const xingheUrl = `xinghe://local/?path=${encodeURIComponent(fullPath)}`
          return { exists: true, url: xingheUrl, path: fullPath }
        }
      }
      return { exists: false }
    } catch {
      return { exists: false }
    }
  })

  ipcMain.handle('cache:stats', (event, { projectId } = {}) => {
    try {
      return summarizeCache(projectId || null)
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('cache:diagnose', (event, { projectId } = {}) => {
    try {
      return diagnoseCache(projectId || null)
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('cache:cleanup', (event, options = {}) => {
    try {
      return cleanupCache(options)
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('cache:clear-project-cache', async (event, projectId) => {
    try {
      if (!projectId) return { success: false, error: 'missing projectId' }
      const results = deleteManagedCachePaths(
        Array.from(collectProjectManagedCachePaths(projectId)),
        projectId
      )
      const deletedFiles = results.filter((item) => item.deleted).length
      const freedBytes = results.reduce((sum, item) => sum + (item.deleted ? item.size || 0 : 0), 0)
      return { success: true, deletedFiles, freedBytes, results }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('cache:policy', () => ({ success: true, policy: null, disabled: true }))

  ipcMain.handle('cache:delete-batch', (event, { files }) => {
    try {
      const results = files.map((f) => {
        try {
          let deletedPath = null
          if (f.path) {
            const candidates = []
            if (path.isAbsolute(f.path)) {
              candidates.push(f.path)
            } else {
              candidates.push(path.join(app.getPath('userData'), 'LocalCache', f.path))
              const fname = f.path.split(/[/\\]/).pop()
              if (fname) {
                candidates.push(path.join(currentConfig.image_save_path, fname))
                candidates.push(path.join(currentConfig.video_save_path, fname))
              }
            }
            for (const fullPath of candidates) {
              if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath)
                deletedPath = fullPath
                break
              }
            }
          }
          if (deletedPath) removeCacheFileIndex(deletedPath)
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

  ipcMain.handle('cache:delete-project', async (event, projectId) => {
    try {
      if (!projectId) return { success: false, error: 'missing projectId' }

      const paths = new Set()
      collectManagedCachePaths(getNodesByProject(projectId), paths, projectId)
      collectManagedCachePaths(getHistoryByProject(projectId, 100000), paths, projectId)
      collectManagedCachePaths(getProject(projectId), paths, projectId)
      collectManagedCachePaths(loadProjectJSON(projectId), paths, projectId)

      try {
        const savedHistory = getSetting(`tapnow_history_v2_${projectId}`)
        if (savedHistory) collectManagedCachePaths(JSON.parse(savedHistory), paths, projectId)
      } catch (e) {
        console.warn('[cache:delete-project] Failed to parse saved history:', e.message)
      }

      const results = deleteManagedCachePaths(Array.from(paths), projectId)
      const deletedFiles = results.filter((item) => item.deleted).length
      const freedBytes = results.reduce((sum, item) => sum + (item.deleted ? item.size || 0 : 0), 0)
      return { success: true, deletedFiles, freedBytes, results }
    } catch (e) {
      console.error('[cache:delete-project] Failed:', e)
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('cache:clear-generated', async (event, { projectId, cacheRoot } = {}) => {
    try {
      if (!projectId) return { success: false, error: 'missing projectId' }
      const context = resolveProjectCacheContext({ projectId, cacheRoot })
      const dirs = Object.values(context.dirs)
      let totalFiles = 0
      let totalBytes = 0
      const deletedPaths = []
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
              deletedPaths.push(filePath)
              totalFiles++
            }
          } catch (e) {
            console.warn('[cache:clear-generated] Failed to delete:', filePath, e.message)
          }
        }
      }
      try {
        deleteCacheFiles(deletedPaths)
      } catch (e) {
        console.warn('[cache:clear-generated] Failed to update cache index:', e.message)
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
    const status = globalTaskQueue.getStatus()
    return {
      success: true,
      status: {
        active: status.active.map(sanitizeTaskForRenderer),
        waiting: status.waiting.map(sanitizeTaskForRenderer),
        completed: status.completed.map(sanitizeTaskForRenderer),
        failed: status.failed.map(sanitizeTaskForRenderer)
      }
    }
  })

  ipcMain.handle('video:erase-subtitle', async (event, { videoUrl, apiKey }) => {
    try {
      const result = await TaskExecutor.eraseSubtitle(apiKey, videoUrl)
      return { success: true, resultUrl: result.resultUrl }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('vod:ai-translation:status', async () => ({
    ...getVodCredentialStatus(),
    configured: hasVodCredentials()
  }))

  ipcMain.handle('vod:ai-translation:get-config', async () => getVodCredentialStatus())

  ipcMain.handle('vod:ai-translation:save-config', async (_, payload = {}) =>
    saveVodCredentialConfig(payload)
  )

  ipcMain.handle('vod:ai-translation:clear-config', async () => clearVodCredentialConfig())

  ipcMain.handle('vod:ai-translation:submit-workflow', async (_, payload = {}) =>
    callVodOpenApi({
      action: vodAiTranslationActions.submitWorkflow,
      body: payload
    })
  )

  ipcMain.handle('vod:ai-translation:get-project', async (_, payload = {}) =>
    callVodOpenApi({
      action: vodAiTranslationActions.getProject,
      body: payload
    })
  )

  ipcMain.handle('vod:ai-translation:list-project', async (_, payload = {}) =>
    callVodOpenApi({
      action: vodAiTranslationActions.listProject,
      body: payload
    })
  )

  ipcMain.handle('vod:ai-translation:update-utterances', async (_, payload = {}) =>
    callVodOpenApi({
      action: vodAiTranslationActions.updateUtterances,
      body: payload
    })
  )

  ipcMain.handle('vod:ai-translation:continue-workflow', async (_, payload = {}) =>
    callVodOpenApi({
      action: vodAiTranslationActions.continueWorkflow,
      body: payload
    })
  )

  ipcMain.handle('vod:ai-translation:refresh-project', async (_, payload = {}) =>
    callVodOpenApi({
      action: vodAiTranslationActions.refreshProject,
      body: payload
    })
  )

  ipcMain.handle('vod:ai-translation:upload-media-by-url', async (_, payload = {}) =>
    callVodOpenApi({
      action: vodAiTranslationActions.uploadMediaByUrl,
      version: '2023-01-01',
      body: payload
    })
  )

  ipcMain.handle('vod:ai-translation:query-upload-task', async (_, payload = {}) =>
    callVodOpenApi({
      action: vodAiTranslationActions.queryUploadTaskInfo,
      version: '2023-01-01',
      queryParams: {
        JobIds: payload.JobIds || payload.JobId || payload.jobIds || payload.jobId
      },
      body: {}
    })
  )

  // Broadcast task updates to all renderer windows
  globalTaskQueue.on('task-updated', (task) => {
    const update = sanitizeTaskForRenderer(task)
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('engine:task-update', update)
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

  ipcMain.handle('system:migration-status', () => {
    const parseResult = (value) => {
      if (!value) return null
      try {
        return JSON.parse(value)
      } catch {
        return null
      }
    }

    return {
      success: true,
      currentDataVersion: getSetting('tapnow_data_version') || null,
      targetDataVersion: DATA_SCHEMA_VERSION,
      lastResult: parseResult(getSetting('tapnow_migration_last_result')),
      latestBackupDir: getSetting('tapnow_migration_backup_latest') || null
    }
  })

  // 数据库维护
  ipcMain.handle('db:maintenance:cleanup', () => cleanupOrphanData())

  // --- 安全存储 (OS 级加密) ---
  ipcMain.handle('system:health-check', (_, options = {}) => {
    try {
      return runSoftwareHealthCheck(options)
    } catch (error) {
      return {
        success: false,
        status: 'error',
        error: error?.message || String(error)
      }
    }
  })

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
    return collectStatsCached()
  })

  // ============================
  // 窗口焦点修复
  // ============================
  ipcMain.handle('window:focus-fix', (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) {
        // 强制 webContents 获取键盘输入焦点
        event.sender.focus()
      }
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('window:capture-page', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return null
      const image = await win.webContents.capturePage()
      return image.toDataURL()
    } catch (err) {
      console.error('[capture-page]', err.message)
      return null
    }
  })

  ipcMain.handle('window:capture-thumbnail', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return null
      const image = await win.webContents.capturePage()
      // 缩放为 320px 宽的 JPEG，返回 base64（不带 data:image/ 头部）
      const resized = image.resize({ width: 320, quality: 'good' })
      return resized.toJPEG(75).toString('base64')
    } catch (err) {
      console.error('[capture-thumbnail]', err.message)
      return null
    }
  })

  // ============================
  // 缩略图服务
  // ============================
  ipcMain.handle('thumbnail:generate', async (_, { filePath, size }) => {
    return enqueueThumbnailJob(() => generateThumbnail(filePath, size))
  })

  ipcMain.handle('thumbnail:get-video', (_, { src }) => {
    return getCachedVideoThumbnail(src)
  })

  ipcMain.handle('thumbnail:save-video', (_, { src, content, metadata }) => {
    return saveVideoThumbnail(src, content, metadata)
  })

  // ============================
  // OSS 上传服务
  // ============================
  applyStoredOssConfig()

  ipcMain.handle('oss:get-config', () => {
    try {
      return getOssConfigStatus()
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('oss:save-config', (_, payload) => {
    try {
      return saveOssConfig(payload)
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('oss:clear-config', () => {
    try {
      return clearOssConfig()
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('oss:upload-file', async (_, { localPath }) => {
    try {
      return await uploadFileToOSS(localPath)
    } catch (e) {
      console.error('[oss:upload-file] Error:', e)
      return { success: false, error: e.message }
    }
  })

  // ============================
  // Seedance Asset API
  // ============================
  applyStoredArkAssetConfig()

  ipcMain.handle('asset:get-config', () => {
    try {
      return getArkAssetConfigStatus()
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('asset:save-config', (_, payload) => {
    try {
      return saveArkAssetConfig(payload)
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('asset:clear-config', () => {
    try {
      return clearArkAssetConfig()
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('asset:create-group', async (_, { name, description }) => {
    return await createAssetGroup(name, description)
  })

  ipcMain.handle('asset:get-default-group', async () => {
    const groupId = await getOrCreateDefaultGroup()
    return { id: groupId }
  })

  ipcMain.handle('asset:get-group', async (_, { groupId }) => {
    return await getAssetGroup(groupId)
  })

  ipcMain.handle('asset:list-groups', async (_, { page, pageSize }) => {
    return await listAssetGroups(page, pageSize)
  })

  ipcMain.handle('asset:update-group', async (_, { groupId, name, description }) => {
    return await updateAssetGroup(groupId, name, description)
  })

  ipcMain.handle('asset:create', async (_, { imageUrl, name, groupId, assetType }) => {
    return await createAsset(imageUrl, name, groupId, assetType)
  })

  ipcMain.handle('asset:get', async (_, { assetId }) => {
    return await getAsset(assetId)
  })

  ipcMain.handle('asset:poll', async (_, { assetId, intervalMs, timeoutMs }) => {
    return await pollAssetUntilReady(assetId, intervalMs, timeoutMs)
  })

  ipcMain.handle('asset:list', async (_, { groupId, page, pageSize, statuses }) => {
    return await listAssets(groupId, page, pageSize, statuses)
  })

  ipcMain.handle('asset:update', async (_, { assetId, name }) => {
    return await updateAsset(assetId, name)
  })

  // ============================
  // AI 副驾：本地文件系统 IPC
  // ============================

  ipcMain.handle('fs:read-text-file', async (_, filePath) => {
    const fs = require('fs')
    const path = require('path')
    try {
      if (!fs.existsSync(filePath)) return { error: `文件不存在: ${filePath}` }
      const stat = fs.statSync(filePath)
      if (stat.isDirectory()) return { error: '这是一个文件夹，不是文件' }
      if (stat.size > 5 * 1024 * 1024) return { error: '文件过大(>5MB)，请选择较小的文件' }
      const content = fs.readFileSync(filePath, 'utf-8')
      return {
        name: path.basename(filePath),
        ext: path.extname(filePath).toLowerCase(),
        size: stat.size,
        content
      }
    } catch (err) {
      return { error: `读取失败: ${err.message}` }
    }
  })

  ipcMain.handle('fs:list-directory', async (_, { dirPath, filter }) => {
    const fs = require('fs')
    const path = require('path')
    try {
      if (!fs.existsSync(dirPath)) return { error: `目录不存在: ${dirPath}` }
      if (!fs.statSync(dirPath).isDirectory()) return { error: '这不是一个文件夹' }
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']
      const VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.avi']
      const TEXT_EXTS = ['.txt', '.md', '.json', '.csv', '.srt']
      let files = entries.map((e) => {
        const full = path.join(dirPath, e.name)
        const isDir = e.isDirectory()
        const ext = isDir ? '' : path.extname(e.name).toLowerCase()
        let size = 0
        try {
          if (!isDir) size = fs.statSync(full).size
        } catch (e) {
          /* ignore */
        }
        return { name: e.name, path: full, isDirectory: isDir, ext, size }
      })
      if (filter === 'images') files = files.filter((f) => IMAGE_EXTS.includes(f.ext))
      else if (filter === 'videos') files = files.filter((f) => VIDEO_EXTS.includes(f.ext))
      else if (filter === 'text') files = files.filter((f) => TEXT_EXTS.includes(f.ext))
      return { count: files.length, files }
    } catch (err) {
      return { error: `读取目录失败: ${err.message}` }
    }
  })

  ipcMain.handle('fs:read-images-as-paths', async (_, dirPath) => {
    const fs = require('fs')
    const path = require('path')
    try {
      if (!fs.existsSync(dirPath)) return { error: `目录不存在: ${dirPath}` }
      const entries = fs.readdirSync(dirPath)
      const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']
      const images = entries
        .filter((f) => IMAGE_EXTS.includes(path.extname(f).toLowerCase()))
        .map((f) => ({
          name: f,
          path: path.join(dirPath, f),
          ext: path.extname(f).toLowerCase()
        }))
      return { count: images.length, images }
    } catch (err) {
      return { error: `扫描图片失败: ${err.message}` }
    }
  })

  ipcMain.handle(
    'fs:write-text-file',
    async (_, { filePath, content = '', append = false, createDirs = true } = {}) => {
      try {
        if (!filePath) return { success: false, error: '缺少文件路径' }
        const dir = path.dirname(filePath)
        if (createDirs) fs.mkdirSync(dir, { recursive: true })
        if (append) fs.appendFileSync(filePath, content, 'utf-8')
        else fs.writeFileSync(filePath, content, 'utf-8')
        const stat = fs.statSync(filePath)
        return { success: true, path: filePath, size: stat.size }
      } catch (err) {
        return { success: false, error: `写入失败: ${err.message}` }
      }
    }
  )

  ipcMain.handle('fs:copy-path', async (_, { sourcePath, targetPath, overwrite = false } = {}) => {
    try {
      if (!sourcePath || !targetPath) return { success: false, error: '缺少源路径或目标路径' }
      if (!fs.existsSync(sourcePath))
        return { success: false, error: `源路径不存在: ${sourcePath}` }
      if (fs.existsSync(targetPath) && !overwrite)
        return { success: false, error: `目标已存在: ${targetPath}` }
      fs.mkdirSync(path.dirname(targetPath), { recursive: true })
      const stat = fs.statSync(sourcePath)
      if (stat.isDirectory()) {
        fs.cpSync(sourcePath, targetPath, { recursive: true, force: overwrite })
      } else {
        fs.copyFileSync(sourcePath, targetPath)
      }
      return { success: true, sourcePath, targetPath }
    } catch (err) {
      return { success: false, error: `复制失败: ${err.message}` }
    }
  })

  ipcMain.handle('fs:move-path', async (_, { sourcePath, targetPath, overwrite = false } = {}) => {
    try {
      if (!sourcePath || !targetPath) return { success: false, error: '缺少源路径或目标路径' }
      if (!fs.existsSync(sourcePath))
        return { success: false, error: `源路径不存在: ${sourcePath}` }
      if (fs.existsSync(targetPath)) {
        if (!overwrite) return { success: false, error: `目标已存在: ${targetPath}` }
        fs.rmSync(targetPath, { recursive: true, force: true })
      }
      fs.mkdirSync(path.dirname(targetPath), { recursive: true })
      fs.renameSync(sourcePath, targetPath)
      return { success: true, sourcePath, targetPath }
    } catch (err) {
      return { success: false, error: `移动失败: ${err.message}` }
    }
  })

  ipcMain.handle('fs:delete-path', async (_, { targetPath, recursive = false } = {}) => {
    try {
      if (!targetPath) return { success: false, error: '缺少目标路径' }
      if (!fs.existsSync(targetPath)) return { success: true, missing: true, path: targetPath }
      const stat = fs.statSync(targetPath)
      if (stat.isDirectory() && !recursive) {
        return { success: false, error: '目标是文件夹，删除文件夹需要 recursive=true' }
      }
      fs.rmSync(targetPath, { recursive: true, force: true })
      return { success: true, path: targetPath, deletedDirectory: stat.isDirectory() }
    } catch (err) {
      return { success: false, error: `删除失败: ${err.message}` }
    }
  })

  ipcMain.handle('fs:make-directory', async (_, { dirPath } = {}) => {
    try {
      if (!dirPath) return { success: false, error: '缺少目录路径' }
      fs.mkdirSync(dirPath, { recursive: true })
      return { success: true, path: dirPath }
    } catch (err) {
      return { success: false, error: `创建目录失败: ${err.message}` }
    }
  })

  ipcMain.handle('fs:open-path', async (_, targetPath) => {
    return openLocalPathDetached(targetPath)
  })

  ipcMain.handle('fs:run-command', async (_, { command, cwd, timeoutMs = 30000 } = {}) => {
    if (!command) return { success: false, error: '缺少命令' }
    const safeTimeout = Math.max(1000, Math.min(Number(timeoutMs) || 30000, 120000))
    return await new Promise((resolve) => {
      exec(
        command,
        {
          cwd: cwd || app.getPath('home'),
          windowsHide: true,
          timeout: safeTimeout,
          maxBuffer: 1024 * 1024 * 4
        },
        (error, stdout, stderr) => {
          resolve({
            success: !error,
            code: error?.code ?? 0,
            signal: error?.signal,
            stdout: String(stdout || '').slice(0, 20000),
            stderr: String(stderr || '').slice(0, 20000),
            truncated: String(stdout || '').length > 20000 || String(stderr || '').length > 20000,
            error: error?.message
          })
        }
      )
    })
  })

  ipcMain.handle('terminal:start', async (event, { cwd, shell: preferredShell, command } = {}) => {
    try {
      const id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const isWin = process.platform === 'win32'
      const shellBin = preferredShell || (isWin ? 'powershell.exe' : process.env.SHELL || 'bash')
      const args =
        isWin && shellBin.toLowerCase().includes('powershell') ? ['-NoLogo', '-NoProfile'] : []
      const child = spawn(shellBin, args, {
        cwd: cwd || app.getPath('home'),
        windowsHide: true,
        shell: false,
        env: process.env
      })
      const session = {
        id,
        cwd: cwd || app.getPath('home'),
        shell: shellBin,
        startedAt: new Date().toISOString(),
        status: 'running',
        output: ''
      }
      terminalSessions.set(id, { ...session, child, sender: event.sender })
      const emit = (type, chunk = '') => {
        const current = terminalSessions.get(id)
        if (!current) return
        if (chunk) current.output = `${current.output}${chunk}`.slice(-60000)
        event.sender.send('terminal:update', {
          id,
          type,
          chunk,
          status: current.status,
          cwd: current.cwd,
          shell: current.shell,
          startedAt: current.startedAt,
          output: current.output
        })
      }
      child.stdout.on('data', (data) => emit('stdout', data.toString()))
      child.stderr.on('data', (data) => emit('stderr', data.toString()))
      child.on('exit', (code, signal) => {
        const current = terminalSessions.get(id)
        if (current) current.status = 'exited'
        emit('exit', `\n[exit ${code ?? ''}${signal ? ` ${signal}` : ''}]\n`)
      })
      child.on('error', (error) => {
        const current = terminalSessions.get(id)
        if (current) current.status = 'error'
        emit('error', error.message)
      })
      if (command) {
        child.stdin.write(`${command}\n`)
      }
      emit('start', '')
      return { success: true, session }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('terminal:input', async (_, { id, input } = {}) => {
    const session = terminalSessions.get(id)
    if (!session || !session.child || session.status !== 'running') {
      return { success: false, error: '终端会话不存在或已结束' }
    }
    session.child.stdin.write(input || '')
    return { success: true }
  })

  ipcMain.handle('terminal:stop', async (_, id) => {
    const session = terminalSessions.get(id)
    if (!session || !session.child) return { success: false, error: '终端会话不存在' }
    session.child.kill()
    session.status = 'stopped'
    return { success: true }
  })

  ipcMain.handle('terminal:list', async () => {
    return {
      success: true,
      sessions: Array.from(terminalSessions.values()).map((session) => ({
        id: session.id,
        cwd: session.cwd,
        shell: session.shell,
        startedAt: session.startedAt,
        status: session.status,
        output: session.output
      }))
    }
  })

  // ========== 项目 JSON 文件持久化 ==========

  ipcMain.handle('project:save', (_, { id, data }) => {
    try {
      return saveProjectJSON(id, data)
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('project:load', (_, id) => {
    try {
      return loadProjectWithLegacySqliteFallback(id)
    } catch (err) {
      return null
    }
  })

  ipcMain.handle('project:list', () => {
    try {
      const jsonProjects = listProjectsJSON()
      const seen = new Set(jsonProjects.map((project) => project.id))
      const legacyProjects = getAllProjects()
        .filter((project) => project?.id && !seen.has(project.id))
        .map((project) => ({
          id: project.id,
          schemaVersion: null,
          name: project.name || '未命名项目',
          folderId: project.folder_id || null,
          cacheRoot: null,
          createdAt: project.created_at ? new Date(project.created_at).toISOString() : null,
          updatedAt: project.updated_at ? new Date(project.updated_at).toISOString() : null,
          nodesCount: getNodesByProject(project.id).length,
          thumbnail: project.thumbnail || null,
          legacyStorage: 'sqlite'
        }))
      return [...jsonProjects, ...legacyProjects].sort((a, b) => {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        return tb - ta
      })
    } catch (err) {
      return []
    }
  })

  ipcMain.handle('project:import-local', async (_, options = {}) => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '导入本地项目',
        properties: ['openFile'],
        filters: [
          { name: '星河项目 JSON', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })
      if (canceled || filePaths.length === 0) {
        return { success: false, canceled: true }
      }

      const sourcePath = filePaths[0]
      const raw = fs.readFileSync(sourcePath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { success: false, error: '项目文件格式无效' }
      }

      const originalId = typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id.trim() : ''
      const targetId =
        originalId && !loadProjectJSON(originalId)
          ? originalId
          : `proj-import-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
      const projectName =
        parsed.name || parsed.projectName || path.basename(sourcePath, path.extname(sourcePath))
      const folderId = Object.prototype.hasOwnProperty.call(options || {}, 'folderId')
        ? options.folderId || null
        : parsed.folderId || null

      const projectData = {
        ...parsed,
        id: targetId,
        name: projectName,
        folderId,
        importedFromPath: sourcePath,
        importedAt: new Date().toISOString()
      }
      const saveResult = saveProjectJSON(targetId, projectData)
      const normalized = loadProjectJSON(targetId)
      const project = {
        id: targetId,
        schemaVersion: normalized?.schemaVersion || null,
        name: normalized?.name || projectName,
        folderId: normalized?.folderId || null,
        cloudSync: normalized?.cloudSync || false,
        cloudType: normalized?.cloudType || null,
        cloudProjectId: normalized?.cloudProjectId || null,
        cloudProjectTitle: normalized?.cloudProjectTitle || null,
        cloudEpisodeId: normalized?.cloudEpisodeId || null,
        cloudEpisodeNumber: normalized?.cloudEpisodeNumber || null,
        cloudEpisodeStatus: normalized?.cloudEpisodeStatus || null,
        cloudAssignmentId: normalized?.cloudAssignmentId || null,
        cloudAssignmentTitle: normalized?.cloudAssignmentTitle || null,
        cloudAssignmentStatus: normalized?.cloudAssignmentStatus || null,
        cloudReviewStatus: normalized?.cloudReviewStatus || null,
        cloudTeamId: normalized?.cloudTeamId || null,
        cloudRole: normalized?.cloudRole || null,
        cacheRoot: normalized?.cacheRoot || null,
        createdAt: normalized?.createdAt || null,
        updatedAt: normalized?.updatedAt || null,
        nodesCount: normalized?.nodes?.length || 0,
        thumbnail: normalized?.thumbnail || null,
        importedFromPath: sourcePath
      }

      try {
        saveProject(project)
      } catch (dbErr) {
        console.warn('[project:import-local] 写入项目索引失败:', dbErr.message)
      }

      return {
        success: true,
        project,
        path: saveResult.path,
        sourcePath,
        duplicatedId: Boolean(originalId && originalId !== targetId)
      }
    } catch (err) {
      return { success: false, error: err.message || '导入本地项目失败' }
    }
  })

  ipcMain.handle('project:delete', (_, id) => {
    try {
      return deleteProjectJSON(id)
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('project:repair', (_, id) => {
    try {
      const repaired = repairProjectJSON(id)
      const restored = loadProjectWithLegacySqliteFallback(id)
      const restoredInfo = restored?.lastLegacySqliteRestore || null
      return {
        ...repaired,
        success: Boolean(restored) || repaired?.success !== false,
        legacySqliteRestored: Boolean(restoredInfo),
        legacySqliteRestore: restoredInfo,
        nodesCount: restored?.nodes?.length ?? repaired?.nodesCount ?? 0,
        connectionsCount: restored?.connections?.length ?? repaired?.connectionsCount ?? 0,
        historyCount: restored?.history?.length ?? repaired?.historyCount ?? 0
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // 同步保存（供 beforeunload 使用）
  ipcMain.on('project:save-sync', (event, { id, data }) => {
    try {
      const result = saveProjectJSONSync(id, data)
      event.returnValue = result
    } catch (err) {
      event.returnValue = { success: false, error: err.message }
    }
  })
}
