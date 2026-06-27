import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { getAllSettings, getSetting, setSetting } from './database.js'
import {
  getProjectsDir,
  normalizeProjectJSON
} from './projectFileService.js'
import { PROJECT_SCHEMA_VERSION } from './projectDataRepair.js'

export const DATA_SCHEMA_VERSION = '2.0.25'
const DATA_VERSION_KEY = 'tapnow_data_version'
const MIGRATION_RESULT_KEY = 'tapnow_migration_last_result'
const MIGRATION_BACKUP_KEY = 'tapnow_migration_backup_latest'

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

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function atomicWriteJson(filePath, data) {
  const tmpPath = `${filePath}.migration.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  fs.renameSync(tmpPath, filePath)
}

function getDbBasePath() {
  return !app.isPackaged
    ? path.join(process.cwd(), 'canvas_data.db')
    : path.join(app.getPath('userData'), 'canvas_data.db')
}

function copyIfExists(source, target) {
  if (!fs.existsSync(source)) return false
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const stat = fs.statSync(source)
  if (stat.isDirectory()) {
    fs.cpSync(source, target, { recursive: true })
  } else {
    fs.copyFileSync(source, target)
  }
  return true
}

function createMigrationBackup(fromVersion, toVersion) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = path.join(
    app.getPath('userData'),
    'migration-backups',
    `${timestamp}-from-${fromVersion || 'unknown'}-to-${toVersion}`
  )
  fs.mkdirSync(backupDir, { recursive: true })

  const dbBase = getDbBasePath()
  const copied = []
  for (const suffix of ['', '-wal', '-shm']) {
    const source = `${dbBase}${suffix}`
    if (copyIfExists(source, path.join(backupDir, path.basename(source)))) {
      copied.push(path.basename(source))
    }
  }

  const projectsDir = getProjectsDir()
  if (copyIfExists(projectsDir, path.join(backupDir, 'projects'))) {
    copied.push('projects')
  }

  const settings = getAllSettings()
  atomicWriteJson(path.join(backupDir, 'settings.snapshot.json'), settings)
  copied.push('settings.snapshot.json')

  atomicWriteJson(path.join(backupDir, 'manifest.json'), {
    fromVersion,
    toVersion,
    appVersion: app.getVersion(),
    createdAt: new Date().toISOString(),
    copied
  })

  setSetting(MIGRATION_BACKUP_KEY, backupDir)
  return backupDir
}

function inferCurrentDataVersion() {
  const stored = getSetting(DATA_VERSION_KEY)
  if (stored) return stored
  return '0.0.0'
}

function normalizeCurrentProjectSetting() {
  const raw = getSetting('tapnow_current_project')
  if (!raw) return { changed: false }

  const currentProject = safeParseJson(raw)
  if (!currentProject || typeof currentProject !== 'object') return { changed: false }

  const nextProject = {
    ...currentProject,
    cacheRoot: currentProject.cacheRoot ?? null,
    schemaVersion: currentProject.schemaVersion || PROJECT_SCHEMA_VERSION
  }

  if (JSON.stringify(nextProject) === JSON.stringify(currentProject)) {
    return { changed: false }
  }

  setSetting('tapnow_current_project', JSON.stringify(nextProject))
  return { changed: true }
}

function safeParseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function migrateProjectFiles() {
  const projectsDir = getProjectsDir()
  const files = fs
    .readdirSync(projectsDir)
    .filter((file) => file.endsWith('.json') && !file.endsWith('.tmp'))

  let migrated = 0
  let skipped = 0
  const errors = []

  for (const file of files) {
    const filePath = path.join(projectsDir, file)
    const projectId = file.replace(/\.json$/i, '')
    const original = safeReadJson(filePath)
    if (!original) {
      skipped += 1
      errors.push({ file, error: 'invalid-json' })
      continue
    }

    const normalized = normalizeProjectJSON(projectId, original)
    const originalText = JSON.stringify(original, null, 2)
    const normalizedText = JSON.stringify(normalized, null, 2)
    if (originalText === normalizedText) {
      skipped += 1
      continue
    }

    atomicWriteJson(filePath, normalized)
    migrated += 1
  }

  return { migrated, skipped, errors }
}

function preserveLegacyCacheSettings() {
  const settings = getAllSettings()
  const legacy = {}
  for (const key of [
    'tapnow_image_save_path',
    'tapnow_video_save_path',
    'tapnow_local_cache_config'
  ]) {
    if (settings[key]) legacy[key] = settings[key]
  }

  if (Object.keys(legacy).length === 0) return { changed: false }

  setSetting(
    'tapnow_legacy_global_cache_settings',
    JSON.stringify({
      capturedAt: new Date().toISOString(),
      note: 'Read-only compatibility snapshot. New cache writes are project-scoped.',
      values: legacy
    })
  )
  return { changed: true, keys: Object.keys(legacy) }
}

const MIGRATIONS = [
  {
    id: 'baseline-current-project-shape',
    toVersion: '2.0.10',
    run: () => ({
      currentProject: normalizeCurrentProjectSetting()
    })
  },
  {
    id: 'project-cache-schema-2.0.25',
    toVersion: DATA_SCHEMA_VERSION,
    run: () => ({
      projects: migrateProjectFiles(),
      legacyCache: preserveLegacyCacheSettings()
    })
  }
]

export function runAppMigrations() {
  const fromVersion = inferCurrentDataVersion()
  if (compareVersion(fromVersion, DATA_SCHEMA_VERSION) >= 0) {
    return {
      success: true,
      skipped: true,
      fromVersion,
      toVersion: DATA_SCHEMA_VERSION,
      steps: []
    }
  }

  const result = {
    success: false,
    fromVersion,
    toVersion: DATA_SCHEMA_VERSION,
    appVersion: app.getVersion(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    backupDir: null,
    steps: []
  }

  try {
    result.backupDir = createMigrationBackup(fromVersion, DATA_SCHEMA_VERSION)

    for (const migration of MIGRATIONS) {
      if (compareVersion(fromVersion, migration.toVersion) >= 0) continue
      const stepStartedAt = new Date().toISOString()
      const detail = migration.run()
      result.steps.push({
        id: migration.id,
        toVersion: migration.toVersion,
        startedAt: stepStartedAt,
        finishedAt: new Date().toISOString(),
        detail
      })
    }

    setSetting(DATA_VERSION_KEY, DATA_SCHEMA_VERSION)
    result.success = true
    result.finishedAt = new Date().toISOString()
    setSetting(MIGRATION_RESULT_KEY, JSON.stringify(result))
    return result
  } catch (error) {
    result.error = error?.stack || error?.message || String(error)
    result.finishedAt = new Date().toISOString()
    setSetting(MIGRATION_RESULT_KEY, JSON.stringify(result))
    throw error
  }
}
