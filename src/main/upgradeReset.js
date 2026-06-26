import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

export const UPGRADE_RESET_TARGET_VERSION = '2.0.26'

const require = createRequire(import.meta.url)
const RESET_MARKER_NAME = `.upgrade-reset-${UPGRADE_RESET_TARGET_VERSION}.json`
const LOCKFILE_NAMES = new Set([
  'lockfile',
  'SingletonLock',
  'SingletonSocket',
  'SingletonCookie'
])

function compareVersion(a, b) {
  const left = String(a || '0.0.0').split('.').map((item) => Number(item) || 0)
  const right = String(b || '0.0.0').split('.').map((item) => Number(item) || 0)
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function getTimestampId() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function atomicWriteJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  fs.renameSync(tmpPath, filePath)
}

function sanitizeFileName(value, fallback = 'project') {
  const clean = String(value || '')
    .trim()
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0)
      return code < 32 || /[<>:"/\\|?*]/.test(char) ? '_' : char
    })
    .join('')
    .slice(0, 160)
  return clean || fallback
}

function safeJsonParse(value) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function toIsoTimestamp(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  const millis = numeric < 10_000_000_000 ? numeric * 1000 : numeric
  const date = new Date(millis)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function assertSafeUserDataPath(userDataPath) {
  const resolvedUserData = path.resolve(userDataPath)
  const resolvedAppData = path.resolve(app.getPath('appData'))
  const expectedName = 'xinghe-zhihui'

  if (path.basename(resolvedUserData).toLowerCase() !== expectedName) {
    throw new Error(`Refusing to reset unexpected userData directory: ${resolvedUserData}`)
  }

  if (
    resolvedUserData === resolvedAppData ||
    !resolvedUserData.startsWith(`${resolvedAppData}${path.sep}`)
  ) {
    throw new Error(`Refusing to reset path outside appData: ${resolvedUserData}`)
  }
}

function getProjectIdsFromExport(exportDir) {
  const ids = new Set()
  if (!fs.existsSync(exportDir)) return ids
  for (const file of fs.readdirSync(exportDir)) {
    if (!file.endsWith('.json')) continue
    const raw = fs.readFileSync(path.join(exportDir, file), 'utf-8')
    const parsed = safeJsonParse(raw)
    if (parsed?.id) ids.add(String(parsed.id))
    else ids.add(file.replace(/\.json$/i, ''))
  }
  return ids
}

function exportProjectJsonFiles(userDataPath, backupDir) {
  const sourceDir = path.join(userDataPath, 'projects')
  const targetDir = path.join(backupDir, 'projects')
  const exported = []

  if (!fs.existsSync(sourceDir)) return exported
  fs.mkdirSync(targetDir, { recursive: true })

  for (const file of fs.readdirSync(sourceDir)) {
    if (!file.endsWith('.json') || file.endsWith('.tmp')) continue
    const source = path.join(sourceDir, file)
    const stat = fs.statSync(source)
    if (!stat.isFile()) continue

    const target = path.join(targetDir, file)
    fs.copyFileSync(source, target)
    exported.push({ file, source, target, size: stat.size })
  }

  return exported
}

function tableExists(db, tableName) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName)
  return Boolean(row)
}

function deserializeNode(row) {
  return {
    id: row.id,
    type: row.type || 'unknown',
    position: { x: row.x || 0, y: row.y || 0 },
    x: row.x || 0,
    y: row.y || 0,
    width: row.width ?? null,
    height: row.height ?? null,
    content: row.content ?? null,
    settings: safeJsonParse(row.settings),
    data: safeJsonParse(row.data) || {},
    frames: safeJsonParse(row.frames),
    selectedKeyframes: safeJsonParse(row.selected_keyframes),
    videoMeta: safeJsonParse(row.video_meta)
  }
}

function deserializeConnection(row) {
  return {
    id: row.id,
    from: row.source || '',
    to: row.target || '',
    source: row.source || '',
    target: row.target || '',
    sourceHandle: row.source_handle || 'default',
    targetHandle: row.target_handle || 'default',
    inputType: row.input_type || 'default'
  }
}

function deserializeHistory(row) {
  const metadata = safeJsonParse(row.metadata) || {}
  return {
    id: row.id,
    type: row.type,
    url: row.url,
    prompt: row.prompt,
    status: row.status,
    sourceNodeId: row.source_node_id,
    durationMs: row.duration_ms,
    errorMsg: row.error_msg,
    originalPayload: safeJsonParse(row.original_payload),
    startTime: row.created_at,
    ...metadata
  }
}

function exportProjectsFromLegacyDb(userDataPath, backupDir, existingProjectIds) {
  const dbPath = path.join(userDataPath, 'canvas_data.db')
  const exported = []
  if (!fs.existsSync(dbPath)) return exported

  let db = null
  try {
    const Database = require('better-sqlite3')
    db = new Database(dbPath, { readonly: true, fileMustExist: true })
    if (!tableExists(db, 'projects')) return exported

    const targetDir = path.join(backupDir, 'db-projects')
    const projects = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all()
    const hasNodes = tableExists(db, 'nodes')
    const hasConnections = tableExists(db, 'connections')
    const hasHistory = tableExists(db, 'history')
    fs.mkdirSync(targetDir, { recursive: true })

    for (const project of projects) {
      const projectId = String(project.id || '').trim()
      if (!projectId || existingProjectIds.has(projectId)) continue

      const nodes = hasNodes
        ? db.prepare('SELECT * FROM nodes WHERE project_id = ?').all(projectId).map(deserializeNode)
        : []
      const connections = hasConnections
        ? db
            .prepare('SELECT * FROM connections WHERE project_id = ?')
            .all(projectId)
            .map(deserializeConnection)
        : []
      const history = hasHistory
        ? db
            .prepare('SELECT * FROM history WHERE project_id = ? ORDER BY created_at DESC')
            .all(projectId)
            .map(deserializeHistory)
        : []

      const file = `${sanitizeFileName(projectId)}.json`
      const target = path.join(targetDir, file)
      atomicWriteJson(target, {
        id: projectId,
        name: project.name || 'Untitled Project',
        folderId: project.folder_id || null,
        thumbnail: project.thumbnail || null,
        nodes,
        connections,
        history,
        view: null,
        schemaVersion: UPGRADE_RESET_TARGET_VERSION,
        createdAt: toIsoTimestamp(project.created_at),
        updatedAt: toIsoTimestamp(project.updated_at),
        exportedFromLegacyDb: true,
        exportedAt: new Date().toISOString()
      })
      exported.push({ id: projectId, file, target, source: dbPath })
    }
  } finally {
    if (db) db.close()
  }

  return exported
}

function getUniqueArchiveTarget(parentDir, entry) {
  let target = path.join(parentDir, entry)
  if (!fs.existsSync(target)) return target

  const parsed = path.parse(entry)
  for (let index = 1; index < 1000; index += 1) {
    target = path.join(parentDir, `${parsed.name}-${index}${parsed.ext}`)
    if (!fs.existsSync(target)) return target
  }

  return path.join(parentDir, `${entry}-${Date.now()}`)
}

function clearUserDataDirectory(userDataPath, backupDir) {
  const removed = []
  const skipped = []
  const archivedDir = path.join(backupDir, 'archived-user-data')

  if (!fs.existsSync(userDataPath)) return { removed, skipped }
  fs.mkdirSync(archivedDir, { recursive: true })

  for (const entry of fs.readdirSync(userDataPath)) {
    if (LOCKFILE_NAMES.has(entry)) {
      skipped.push({ entry, reason: 'runtime-lock' })
      continue
    }

    const target = path.join(userDataPath, entry)
    const archiveTarget = getUniqueArchiveTarget(archivedDir, entry)
    try {
      fs.renameSync(target, archiveTarget)
    } catch (error) {
      skipped.push({
        entry,
        reason: 'archive-failed',
        error: error?.message || String(error)
      })
      continue
    }
    removed.push(entry)
  }

  return { removed, skipped }
}

function restoreProjectsFromBackup(backupDir, userDataPath) {
  const projectsDir = path.join(userDataPath, 'projects')
  const restored = []
  fs.mkdirSync(projectsDir, { recursive: true })

  for (const sourceDirName of ['projects', 'db-projects']) {
    const sourceDir = path.join(backupDir, sourceDirName)
    if (!fs.existsSync(sourceDir)) continue

    for (const file of fs.readdirSync(sourceDir)) {
      if (!file.endsWith('.json')) continue
      const source = path.join(sourceDir, file)
      const target = path.join(projectsDir, file)
      if (sourceDirName === 'db-projects' && fs.existsSync(target)) continue
      fs.copyFileSync(source, target)
      restored.push({ file, source, target, sourceType: sourceDirName })
    }
  }

  return restored
}

export function prepareUpgradeCompatibilityReset(options = {}) {
  const targetVersion = options.targetVersion || app.getVersion()
  const force = Boolean(options.force || process.env.XINGHE_FORCE_UPGRADE_RESET === '1')
  const reason = options.reason || 'first-launch'
  const result = {
    success: false,
    skipped: false,
    reason,
    targetVersion,
    resetVersion: UPGRADE_RESET_TARGET_VERSION,
    userDataPath: null,
    backupDir: null,
    exportedProjectJsons: 0,
    exportedDbProjects: 0,
    restoredProjects: 0,
    removedEntries: [],
    skippedEntries: []
  }

  try {
    if (!force && !app.isPackaged) {
      return { ...result, success: true, skipped: true, reason: 'development-mode' }
    }

    const automaticResetEnabled =
      options.allowAutomatic === true || process.env.XINGHE_AUTO_UPGRADE_RESET === '1'
    if (!force && !automaticResetEnabled) {
      return { ...result, success: true, skipped: true, reason: 'automatic-reset-disabled' }
    }

    if (!force && compareVersion(targetVersion, UPGRADE_RESET_TARGET_VERSION) < 0) {
      return { ...result, success: true, skipped: true, reason: 'target-version-not-reached' }
    }

    const userDataPath = app.getPath('userData')
    const appDataPath = app.getPath('appData')
    const markerPath = path.join(userDataPath, RESET_MARKER_NAME)
    result.userDataPath = userDataPath

    if (!force && fs.existsSync(markerPath)) {
      return { ...result, success: true, skipped: true, reason: 'already-reset' }
    }

    assertSafeUserDataPath(userDataPath)

    const backupDir = path.join(
      appDataPath,
      'xinghe-zhihui-upgrade-backups',
      `${getTimestampId()}-${reason}-${UPGRADE_RESET_TARGET_VERSION}`
    )
    result.backupDir = backupDir
    fs.mkdirSync(backupDir, { recursive: true })

    const exportedProjectJsons = exportProjectJsonFiles(userDataPath, backupDir)
    const existingProjectIds = getProjectIdsFromExport(path.join(backupDir, 'projects'))
    const exportedDbProjects = exportProjectsFromLegacyDb(userDataPath, backupDir, existingProjectIds)

    result.exportedProjectJsons = exportedProjectJsons.length
    result.exportedDbProjects = exportedDbProjects.length

    atomicWriteJson(path.join(backupDir, 'manifest.json'), {
      ...result,
      appVersion: app.getVersion(),
      createdAt: new Date().toISOString(),
      exportedProjectJsons,
      exportedDbProjects
    })

    const clearResult = clearUserDataDirectory(userDataPath, backupDir)
    result.removedEntries = clearResult.removed
    result.skippedEntries = clearResult.skipped

    const restoredProjects = restoreProjectsFromBackup(backupDir, userDataPath)
    result.restoredProjects = restoredProjects.length
    result.success = true
    result.finishedAt = new Date().toISOString()

    atomicWriteJson(markerPath, {
      ...result,
      restoredProjects,
      completedAt: result.finishedAt
    })
    return result
  } catch (error) {
    result.error = error?.stack || error?.message || String(error)
    result.finishedAt = new Date().toISOString()
    try {
      if (result.backupDir) {
        atomicWriteJson(path.join(result.backupDir, 'reset-error.json'), result)
      }
    } catch {
      // Ignore secondary reporting failures.
    }
    return result
  }
}
