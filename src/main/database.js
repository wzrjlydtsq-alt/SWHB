import { app } from 'electron'
import { join } from 'path'

let db = null

try {
  const Database = require('better-sqlite3')
  const dbPath = !app.isPackaged
    ? join(process.cwd(), 'canvas_data.db')
    : join(app.getPath('userData'), 'canvas_data.db')
  db = new Database(dbPath)

  // 启用 WAL 模式提升并发读写性能
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')

  // 启用外键约束（SQLite 默认关闭，需显式开启以使 ON DELETE CASCADE 生效）
  db.pragma('foreign_keys = ON')

  // 初始化完整 Schema
  db.exec(`
    -- 项目表
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '未命名项目',
      thumbnail TEXT,
      folder_id TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    -- 节点表（完整属性）
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      type TEXT NOT NULL,
      x REAL DEFAULT 0,
      y REAL DEFAULT 0,
      width REAL,
      height REAL,
      content TEXT,
      settings TEXT,
      data TEXT,
      frames TEXT,
      selected_keyframes TEXT,
      video_meta TEXT,
      created_at INTEGER,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- 连接表
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      source TEXT,
      target TEXT,
      source_handle TEXT DEFAULT 'default',
      target_handle TEXT DEFAULT 'default',
      input_type TEXT DEFAULT 'default',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- 生成历史表
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      type TEXT,
      url TEXT,
      prompt TEXT,
      status TEXT,
      model_id TEXT,
      model_name TEXT,
      source_node_id TEXT,
      duration_ms INTEGER,
      error_msg TEXT,
      original_payload TEXT,
      created_at INTEGER,
      metadata TEXT
    );

    -- 资源缓存表
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      file_path TEXT,
      ai_prompt TEXT,
      type TEXT,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS cache_files (
      file_path TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      category TEXT,
      source_id TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    -- 键值设置表（用于迁移 localStorage）
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER
    );
  `)

  // ========== 数据库版本管理（PRAGMA user_version）==========
  const DB_VERSION = 4
  const currentVersion = db.pragma('user_version', { simple: true })

  function runMigrations() {
    const migrateColumn = (table, column, type, defaultVal) => {
      try {
        const cols = db.prepare(`PRAGMA table_info(${table})`).all()
        if (!cols.find((c) => c.name === column)) {
          const def = defaultVal !== undefined ? ` DEFAULT ${defaultVal}` : ''
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}${def}`)
          console.log(`[Database] 迁移: ${table} 添加列 ${column}`)
        }
      } catch (e) {
        console.warn(`[Database] 迁移列 ${table}.${column} 失败:`, e.message)
      }
    }

    if (currentVersion < 1) {
      // v0 → v1: 为旧数据库补充缺失的列
      migrateColumn('nodes', 'project_id', 'TEXT')
      migrateColumn('nodes', 'settings', 'TEXT')
      migrateColumn('nodes', 'data', 'TEXT')
      migrateColumn('nodes', 'frames', 'TEXT')
      migrateColumn('nodes', 'selected_keyframes', 'TEXT')
      migrateColumn('nodes', 'video_meta', 'TEXT')
      migrateColumn('nodes', 'width', 'REAL')
      migrateColumn('nodes', 'height', 'REAL')
      migrateColumn('nodes', 'created_at', 'INTEGER')

      migrateColumn('connections', 'project_id', 'TEXT')
      migrateColumn('connections', 'source_handle', 'TEXT', "'default'")
      migrateColumn('connections', 'target_handle', 'TEXT', "'default'")
      migrateColumn('connections', 'input_type', 'TEXT', "'default'")

      migrateColumn('history', 'project_id', 'TEXT')
      migrateColumn('history', 'source_node_id', 'TEXT')
      migrateColumn('history', 'duration_ms', 'INTEGER')
      migrateColumn('history', 'error_msg', 'TEXT')
      migrateColumn('history', 'original_payload', 'TEXT')
      migrateColumn('history', 'metadata', 'TEXT')
    }

    if (currentVersion < 2) {
      migrateColumn('projects', 'thumbnail', 'TEXT')
    }

    if (currentVersion < 3) {
      migrateColumn('projects', 'folder_id', 'TEXT')
    }

    if (currentVersion < 4) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS cache_files (
          file_path TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          size INTEGER NOT NULL DEFAULT 0,
          category TEXT,
          source_id TEXT,
          created_at INTEGER,
          updated_at INTEGER
        );
      `)
    }

    // 更新版本号
    if (currentVersion < DB_VERSION) {
      db.pragma(`user_version = ${DB_VERSION}`)
      console.log(`[Database] 版本迁移: ${currentVersion} → ${DB_VERSION}`)
    }
  }

  runMigrations()

  // 创建索引（在列迁移之后，确保列已存在）
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_nodes_project ON nodes(project_id);
    CREATE INDEX IF NOT EXISTS idx_connections_project ON connections(project_id);
    CREATE INDEX IF NOT EXISTS idx_connections_source ON connections(source);
    CREATE INDEX IF NOT EXISTS idx_connections_target ON connections(target);
    CREATE INDEX IF NOT EXISTS idx_history_project ON history(project_id);
    CREATE INDEX IF NOT EXISTS idx_history_status ON history(status);
    CREATE INDEX IF NOT EXISTS idx_history_source_node ON history(source_node_id);
    CREATE INDEX IF NOT EXISTS idx_cache_files_type ON cache_files(type);
    CREATE INDEX IF NOT EXISTS idx_cache_files_created ON cache_files(created_at);
  `)

  // 定期执行 WAL checkpoint（防止 WAL 文件无限增长）
  setInterval(
    () => {
      try {
        db.pragma('wal_checkpoint(PASSIVE)')
      } catch (e) {
        console.warn('[Database] WAL checkpoint 失败:', e.message)
      }
    },
    10 * 60 * 1000
  ) // 每 5 分钟

  console.log(`SQLite Database initialized at: ${dbPath} (version: ${DB_VERSION})`)
} catch (err) {
  console.error('[Database] better-sqlite3 加载失败，使用内存模式:', err.message)
  try {
    const Database = require('better-sqlite3')
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '未命名项目',
        thumbnail TEXT,
        folder_id TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        type TEXT NOT NULL,
        x REAL DEFAULT 0, y REAL DEFAULT 0,
        width REAL, height REAL,
        content TEXT, settings TEXT, data TEXT,
        frames TEXT, selected_keyframes TEXT, video_meta TEXT,
        created_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS connections (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        source TEXT, target TEXT,
        source_handle TEXT DEFAULT 'default',
        target_handle TEXT DEFAULT 'default',
        input_type TEXT DEFAULT 'default'
      );
      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        type TEXT, url TEXT, prompt TEXT, status TEXT,
        model_id TEXT, model_name TEXT, source_node_id TEXT,
        duration_ms INTEGER, error_msg TEXT,
        original_payload TEXT, created_at INTEGER, metadata TEXT
      );
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        file_path TEXT, ai_prompt TEXT, type TEXT, created_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS cache_files (
        file_path TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        category TEXT,
        source_id TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER
      );
    `)
    console.log('SQLite Database initialized in memory mode (fallback)')
  } catch (err2) {
    console.error('[Database] better-sqlite3 完全不可用，数据库功能将被禁用:', err2.message)
  }
}

// ==========================================
// 项目 CRUD
// ==========================================

export function getAllProjects() {
  if (!db) return []
  return db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all()
}

export function getProject(id) {
  if (!db) return null
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
}

export function saveProject(project) {
  if (!db) return { changes: 0 }

  // 处理可能来自前端的驼峰命名
  const createdAt = project.created_at || project.createdAt || Date.now()
  const updatedAt = project.updated_at || project.updatedAt || Date.now()

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO projects (id, name, thumbnail, folder_id, created_at, updated_at)
    VALUES (@id, @name, @thumbnail, @folder_id, @created_at, @updated_at)
  `)
  return stmt.run({
    id: project.id,
    name: project.name || '未命名项目',
    thumbnail: project.thumbnail || null,
    folder_id: project.folderId || project.folder_id || null,
    created_at: createdAt,
    updated_at: updatedAt
  })
}

export function deleteProject(id) {
  if (!db) return { changes: 0 }
  // CASCADE 会自动删除关联的 nodes 和 connections
  return db.prepare('DELETE FROM projects WHERE id = ?').run(id)
}

// ==========================================
// 节点 CRUD
// ==========================================

export function getNodesByProject(projectId) {
  if (!db) return []
  const rows = db.prepare('SELECT * FROM nodes WHERE project_id = ?').all(projectId)
  return rows.map(deserializeNode)
}

export function saveNode(node, projectId) {
  if (!db) return { changes: 0 }
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO nodes (id, project_id, type, x, y, width, height, content, settings, data, frames, selected_keyframes, video_meta, created_at)
    VALUES (@id, @project_id, @type, @x, @y, @width, @height, @content, @settings, @data, @frames, @selected_keyframes, @video_meta, @created_at)
  `)
  return stmt.run(serializeNode(node, projectId))
}

export function saveNodesBatch(nodes, projectId) {
  if (!db) return { changes: 0 }
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO nodes (id, project_id, type, x, y, width, height, content, settings, data, frames, selected_keyframes, video_meta, created_at)
    VALUES (@id, @project_id, @type, @x, @y, @width, @height, @content, @settings, @data, @frames, @selected_keyframes, @video_meta, @created_at)
  `)
  const transaction = db.transaction((items) => {
    for (const node of items) {
      stmt.run(serializeNode(node, projectId))
    }
  })
  transaction(nodes)
  return { changes: nodes.length }
}

export function deleteNode(id) {
  if (!db) return { changes: 0 }
  return db.prepare('DELETE FROM nodes WHERE id = ?').run(id)
}

export function deleteNodesByProject(projectId) {
  if (!db) return { changes: 0 }
  return db.prepare('DELETE FROM nodes WHERE project_id = ?').run(projectId)
}

// ==========================================
// 连接 CRUD
// ==========================================

export function getConnectionsByProject(projectId) {
  if (!db) return []
  const rows = db.prepare('SELECT * FROM connections WHERE project_id = ?').all(projectId)
  // 映射 SQLite 列名 (source/target) 到前端字段名 (from/to)
  // 同时保留 source/target 以兼容两种访问模式
  return rows.map((row) => ({
    id: row.id,
    from: row.source || '',
    to: row.target || '',
    source: row.source || '',
    target: row.target || '',
    sourceHandle: row.source_handle || 'default',
    targetHandle: row.target_handle || 'default',
    inputType: row.input_type || 'default'
  }))
}

export function saveConnection(conn, projectId) {
  if (!db) return { changes: 0 }
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO connections (id, project_id, source, target, source_handle, target_handle, input_type)
    VALUES (@id, @project_id, @source, @target, @source_handle, @target_handle, @input_type)
  `)
  return stmt.run({
    id: conn.id,
    project_id: projectId,
    source: conn.source || conn.from || '',
    target: conn.target || conn.to || '',
    source_handle: conn.sourceHandle || conn.source_handle || 'default',
    target_handle: conn.targetHandle || conn.target_handle || 'default',
    input_type: conn.inputType || conn.input_type || 'default'
  })
}

export function saveConnectionsBatch(connections, projectId) {
  if (!db) return { changes: 0 }
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO connections (id, project_id, source, target, source_handle, target_handle, input_type)
    VALUES (@id, @project_id, @source, @target, @source_handle, @target_handle, @input_type)
  `)
  const transaction = db.transaction((items) => {
    for (const conn of items) {
      stmt.run({
        id: conn.id,
        project_id: projectId,
        source: conn.source || conn.from || '',
        target: conn.target || conn.to || '',
        source_handle: conn.sourceHandle || conn.source_handle || 'default',
        target_handle: conn.targetHandle || conn.target_handle || 'default',
        input_type: conn.inputType || conn.input_type || 'default'
      })
    }
  })
  transaction(connections)
  return { changes: connections.length }
}

export function deleteConnection(id) {
  if (!db) return { changes: 0 }
  return db.prepare('DELETE FROM connections WHERE id = ?').run(id)
}

export function deleteConnectionsByProject(projectId) {
  if (!db) return { changes: 0 }
  return db.prepare('DELETE FROM connections WHERE project_id = ?').run(projectId)
}

// ==========================================
// 历史记录 CRUD
// ==========================================

export function getHistoryByProject(projectId, limit = 200) {
  if (!db) return []
  const rows = db
    .prepare('SELECT * FROM history WHERE project_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(projectId, limit)
  return rows.map(deserializeHistory)
}

export function getAllHistory(limit = 500) {
  if (!db) return []
  const rows = db.prepare('SELECT * FROM history ORDER BY created_at DESC LIMIT ?').all(limit)
  return rows.map(deserializeHistory)
}

export function saveHistoryItem(item, projectId) {
  if (!db) return { changes: 0 }
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO history (id, project_id, type, url, prompt, status, model_id, model_name, source_node_id, duration_ms, error_msg, original_payload, created_at, metadata)
    VALUES (@id, @project_id, @type, @url, @prompt, @status, @model_id, @model_name, @source_node_id, @duration_ms, @error_msg, @original_payload, @created_at, @metadata)
  `)
  return stmt.run(serializeHistory(item, projectId))
}

export function saveHistoryBatch(items, projectId) {
  if (!db) return { changes: 0 }
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO history (id, project_id, type, url, prompt, status, model_id, model_name, source_node_id, duration_ms, error_msg, original_payload, created_at, metadata)
    VALUES (@id, @project_id, @type, @url, @prompt, @status, @model_id, @model_name, @source_node_id, @duration_ms, @error_msg, @original_payload, @created_at, @metadata)
  `)
  const transaction = db.transaction((rows) => {
    for (const item of rows) {
      stmt.run(serializeHistory(item, projectId))
    }
  })
  transaction(items)
  return { changes: items.length }
}

export function deleteHistoryItem(id) {
  if (!db) return { changes: 0 }
  return db.prepare('DELETE FROM history WHERE id = ?').run(id)
}

export function clearAllHistory() {
  if (!db) return { changes: 0 }
  return db.prepare('DELETE FROM history').run()
}

// ==========================================
// 序列化/反序列化辅助函数
// ==========================================

function sanitizeNodeForDatabase(node = {}) {
  const settings = node.settings || {}
  return {
    ...node,
    content: sanitizePersistentValue(node.content),
    settings: {
      ...settings,
      outputResults: sanitizePersistentValue(settings.outputResults || [])
    }
  }
}

function serializeNode(node, projectId) {
  node = sanitizeNodeForDatabase(node || {})
  const pos = node.position || { x: node.x || 0, y: node.y || 0 }
  // better-sqlite3 不接受 undefined/object，所有字段必须是 null/number/string/bigint/buffer
  // safeStringify: 如果已经是字符串则直接使用（防止双重序列化），否则 JSON.stringify
  const safeStringify = (v) => {
    if (v === undefined || v === null) return null
    if (typeof v === 'string') return v // 已经序列化过的字符串，直接保留
    return JSON.stringify(v)
  }
  const safeStr = (v) =>
    v === undefined || v === null ? null : typeof v === 'object' ? JSON.stringify(v) : v
  // projectId 可能是对象 { id, name, ... }，需要提取 .id
  const pid = projectId && typeof projectId === 'object' ? projectId.id : (projectId ?? null)
  return {
    id: node.id,
    project_id: pid ?? null,
    type: node.type || 'unknown',
    x: pos.x ?? 0,
    y: pos.y ?? 0,
    width: node.width ?? null,
    height: node.height ?? null,
    content: safeStr(node.content) || null,
    settings: safeStringify(node.settings),
    data: safeStringify(node.data),
    frames: safeStringify(node.frames),
    selected_keyframes: safeStringify(node.selectedKeyframes ?? node.selected_keyframes),
    video_meta: safeStringify(node.videoMeta ?? node.video_meta),
    created_at: node.created_at || Date.now()
  }
}

function deserializeNode(row) {
  return {
    id: row.id,
    type: row.type,
    position: { x: row.x || 0, y: row.y || 0 },
    x: row.x || 0,
    y: row.y || 0,
    width: row.width,
    height: row.height,
    content: row.content,
    settings: safeJsonParse(row.settings),
    data: safeJsonParse(row.data) || {},
    frames: safeJsonParse(row.frames),
    selectedKeyframes: safeJsonParse(row.selected_keyframes),
    videoMeta: safeJsonParse(row.video_meta)
  }
}

const MAX_PERSISTENT_STRING_LENGTH = 8000
const MAX_PERSISTENT_ARRAY_ITEMS = 20

function sanitizePersistentUrl(value) {
  if (typeof value !== 'string') return value
  if (value.startsWith('blob:')) return ''
  if (value.startsWith('data:')) {
    const separatorIndex = value.indexOf(';')
    const mime = separatorIndex > 5 ? value.slice(5, separatorIndex) : 'unknown'
    return `[DATA_URL ${mime} length=${value.length}]`
  }
  if (value.length > MAX_PERSISTENT_STRING_LENGTH) {
    return `${value.substring(0, 400)}...[truncated length=${value.length}]`
  }
  return value
}

function sanitizePersistentValue(value, key = '') {
  const lowerKey = String(key || '').toLowerCase()
  if (lowerKey.includes('apikey') || lowerKey === 'api_key' || lowerKey === 'authorization') {
    return value ? '[REDACTED]' : value
  }
  if (typeof value === 'string') return sanitizePersistentUrl(value)
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_PERSISTENT_ARRAY_ITEMS)
      .map((item) => sanitizePersistentValue(item, key))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        sanitizePersistentValue(childValue, childKey)
      ])
    )
  }
  return value
}

function serializeHistory(item, projectId) {
  const apiConfig = sanitizePersistentValue(item.apiConfig || null)
  const originalPayload = sanitizePersistentValue(item.originalPayload || null)
  return {
    id: item.id,
    project_id: projectId || null,
    type: item.type || null,
    url: sanitizePersistentUrl(item.url) || null,
    prompt: sanitizePersistentValue(item.prompt) || null,
    status: item.status || null,
    model_id: item.apiConfig?.modelId || item.model_id || null,
    model_name: item.apiConfig?.modelName || item.model_name || null,
    source_node_id: item.sourceNodeId || item.source_node_id || null,
    duration_ms: item.durationMs || item.duration_ms || null,
    error_msg: sanitizePersistentValue(item.errorMsg || item.error_msg) || null,
    original_payload: originalPayload ? JSON.stringify(originalPayload) : null,
    created_at: item.startTime || item.created_at || Date.now(),
    metadata: JSON.stringify(sanitizePersistentValue({
      ratio: item.ratio,
      mjImages: item.mjImages,
      mjOriginalUrl: item.mjOriginalUrl,
      mjRatio: item.mjRatio,
      selectedMjImageIndex: item.selectedMjImageIndex,
      width: item.width,
      height: item.height,
      resultUrl: item.resultUrl,
      localCacheUrl: item.localCacheUrl,
      localFilePath: item.localFilePath,
      cacheStatus: item.cacheStatus,
      cacheError: item.cacheError,
      resultUrls: item.resultUrls,
      rawErrorMsg: item.rawErrorMsg,
      sourceMeta: item.sourceMeta,
      apiConfig,
      requestId: item.requestId,
      taskId: item.taskId,
      remoteTaskId: item.remoteTaskId,
      submittedAt: item.submittedAt,
      submitStatus: item.submitStatus,
      resubmittedFrom: item.resubmittedFrom
    }))
  }
}

function deserializeHistory(row) {
  const meta = safeJsonParse(row.metadata) || {}
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
    ratio: meta.ratio,
    mjImages: meta.mjImages,
    mjOriginalUrl: meta.mjOriginalUrl,
    mjRatio: meta.mjRatio,
    selectedMjImageIndex: meta.selectedMjImageIndex,
    width: meta.width,
    height: meta.height,
    resultUrl: meta.resultUrl,
    localCacheUrl: meta.localCacheUrl,
    localFilePath: meta.localFilePath,
    cacheStatus: meta.cacheStatus,
    cacheError: meta.cacheError,
    resultUrls: meta.resultUrls,
    rawErrorMsg: meta.rawErrorMsg,
    sourceMeta: meta.sourceMeta,
    apiConfig: meta.apiConfig || { modelId: row.model_id, modelName: row.model_name },
    requestId: meta.requestId,
    taskId: meta.taskId,
    remoteTaskId: meta.remoteTaskId,
    submittedAt: meta.submittedAt,
    submitStatus: meta.submitStatus,
    resubmittedFrom: meta.resubmittedFrom
  }
}

function safeJsonParse(str) {
  if (!str) return null
  try {
    let result = JSON.parse(str)
    // 修复双重序列化: 如果 parse 出来仍是字符串且看起来像 JSON，再 parse 一次
    if (typeof result === 'string' && (result.startsWith('{') || result.startsWith('['))) {
      try {
        result = JSON.parse(result)
      } catch {
        /* 保留原字符串 */
      }
    }
    return result
  } catch {
    return null
  }
}

// ==========================================
// 设置 KV 存储（迁移 localStorage）
// ==========================================

export function getSetting(key) {
  if (!db) return null
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row ? row.value : null
}

export function setSetting(key, value) {
  if (!db) return { changes: 0 }
  return db
    .prepare(
      `
    INSERT OR REPLACE INTO settings (key, value, updated_at)
    VALUES (@key, @value, @updated_at)
  `
    )
    .run({ key, value: String(value), updated_at: Date.now() })
}

export function deleteSetting(key) {
  if (!db) return { changes: 0 }
  return db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}

export function getAllSettings() {
  if (!db) return {}
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const result = {}
  for (const row of rows) {
    result[row.key] = row.value
  }
  return result
}

export function setSettingsBatch(entries) {
  if (!db) return { changes: 0 }
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO settings (key, value, updated_at)
    VALUES (@key, @value, @updated_at)
  `)
  const now = Date.now()
  const transaction = db.transaction((items) => {
    for (const { key, value } of items) {
      stmt.run({ key, value: String(value), updated_at: now })
    }
  })
  transaction(entries)
  return { changes: entries.length }
}

// ==========================================
// 数据库维护
// ==========================================

// ==========================================
// Cache file index
// ==========================================

export function upsertCacheFile(entry) {
  if (!db) return { changes: 0 }

  const filePath = entry?.filePath || entry?.file_path || entry?.path
  if (!filePath) return { changes: 0 }

  const now = Date.now()
  const type = entry.type === 'video' ? 'video' : 'image'
  const createdAt = entry.created_at || entry.createdAt || now

  return db
    .prepare(
      `
    INSERT INTO cache_files (file_path, type, size, category, source_id, created_at, updated_at)
    VALUES (@file_path, @type, @size, @category, @source_id, @created_at, @updated_at)
    ON CONFLICT(file_path) DO UPDATE SET
      type = excluded.type,
      size = excluded.size,
      category = excluded.category,
      source_id = excluded.source_id,
      updated_at = excluded.updated_at
  `
    )
    .run({
      file_path: filePath,
      type,
      size: Number(entry.size || 0),
      category: entry.category || null,
      source_id: entry.sourceId || entry.source_id || null,
      created_at: createdAt,
      updated_at: now
    })
}

export function deleteCacheFile(filePath) {
  if (!db || !filePath) return { changes: 0 }
  return db.prepare('DELETE FROM cache_files WHERE file_path = ?').run(filePath)
}

export function deleteCacheFiles(filePaths = []) {
  if (!db || !Array.isArray(filePaths) || filePaths.length === 0) return { changes: 0 }
  const stmt = db.prepare('DELETE FROM cache_files WHERE file_path = ?')
  let changes = 0
  const transaction = db.transaction((paths) => {
    for (const filePath of paths) {
      if (!filePath) continue
      changes += stmt.run(filePath).changes
    }
  })
  transaction(filePaths)
  return { changes }
}

export function getCacheStats() {
  const stats = { images: { count: 0, size: 0 }, videos: { count: 0, size: 0 } }
  if (!db) return stats

  const rows = db
    .prepare(
      `
    SELECT type, COUNT(*) AS count, COALESCE(SUM(size), 0) AS size
    FROM cache_files
    GROUP BY type
  `
    )
    .all()

  for (const row of rows) {
    if (row.type === 'video') {
      stats.videos = { count: row.count, size: row.size }
    } else if (row.type === 'image') {
      stats.images = { count: row.count, size: row.size }
    }
  }

  return stats
}

export function cleanupOrphanData() {
  if (!db) return { deletedNodes: 0, deletedConnections: 0 }
  const delNodes = db
    .prepare(
      "DELETE FROM nodes WHERE project_id IS NULL OR project_id = '' OR project_id = 'undefined'"
    )
    .run()
  const delConns = db
    .prepare(
      "DELETE FROM connections WHERE project_id IS NULL OR project_id = '' OR project_id = 'undefined'"
    )
    .run()
  try {
    db.pragma('wal_checkpoint(PASSIVE)')
  } catch (e) {
    console.warn('[DB] cleanup checkpoint failed:', e.message)
  }
  return { deletedNodes: delNodes.changes, deletedConnections: delConns.changes }
}

export function closeDatabase() {
  if (!db) return { success: true, skipped: true }
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
  } catch (e) {
    console.warn('[DB] checkpoint before close failed:', e.message)
  }
  try {
    db.close()
    db = null
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export default db
