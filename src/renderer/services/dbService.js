/**
 * dbService — 统一数据存储服务
 *
 * 策略：SQLite 优先读取 → localStorage 回退 → 双写渐进迁移
 *
 * 启动时自动将 localStorage 中的 tapnow_* 数据迁移到 SQLite，
 * 之后所有读取优先从 SQLite 获取，写入时同时写两边（双写）。
 *
 * 注意：所有 dbAPI 调用都是异步的（IPC invoke），所以本服务
 * 在应用初始化时异步加载一份缓存，此后同步读取缓存。
 */

// 内存缓存，初始化时从 SQLite 加载
let _cache = null
let _initPromise = null

/**
 * 初始化：从 SQLite 加载所有设置到内存缓存
 * 如果 SQLite 为空，自动执行一次性 localStorage → SQLite 迁移
 */
export async function initSettings() {
  if (_initPromise) return _initPromise
  _initPromise = _doInit()
  return _initPromise
}

async function _doInit() {
  try {
    if (!window.dbAPI?.settings) {
      console.warn('[dbService] dbAPI.settings 不可用，退回 localStorage 模式')
      _cache = {}
      return
    }

    // 从 SQLite 加载
    const all = await window.dbAPI.settings.getAll()
    _cache = all || {}

    // 如果 SQLite 为空，执行一次性迁移
    if (Object.keys(_cache).length === 0) {
      await _migrateFromLocalStorage()
    }
  } catch (err) {
    console.error('[dbService] 初始化失败:', err)
    _cache = {}
  }
}

/**
 * 一次性迁移：将 localStorage 中的 tapnow_* 键全部写入 SQLite
 */
async function _migrateFromLocalStorage() {
  const keysToMigrate = [
    'tapnow_theme',
    'tapnow_performance_mode',
    'tapnow_api_configs',
    'tapnow_global_key',
    'tapnow_global_url',
    'tapnow_jimeng_session_id',
    'tapnow_jimeng_use_local_file',
    'tapnow_history_performance_mode',
    'tapnow_image_save_path',
    'tapnow_video_save_path',
    'tapnow_project_name',
    'tapnow_projects',
    'tapnow_chat_sessions',
    'tapnow_current_chat_id',
    'tapnow_characters',
    'tapnow_history'
  ]

  const entries = []
  for (const key of keysToMigrate) {
    const value = localStorage.getItem(key)
    if (value !== null) {
      entries.push({ key, value })
      _cache[key] = value
    }
  }

  if (entries.length > 0 && window.dbAPI?.settings) {
    try {
      await window.dbAPI.settings.setBatch(entries)
      console.log(`[dbService] 迁移完成: ${entries.length} 个键从 localStorage → SQLite`)
    } catch (err) {
      console.error('[dbService] 迁移写入 SQLite 失败:', err)
    }
  }
}

/**
 * 同步读取设置值（从内存缓存）
 * 必须在 initSettings() 完成后调用
 */
export function getSetting(key, defaultValue = null) {
  // 优先缓存
  if (_cache && key in _cache) {
    return _cache[key]
  }
  // 回退 localStorage
  const val = localStorage.getItem(key)
  return val !== null ? val : defaultValue
}

/**
 * 同步读取 JSON 设置值
 */
export function getSettingJSON(key, defaultValue = null) {
  const raw = getSetting(key)
  if (raw === null) return defaultValue
  try {
    return JSON.parse(raw)
  } catch {
    return defaultValue
  }
}

/**
 * 写入设置（双写：同步写 localStorage + cache，异步写 SQLite）
 */
export function setSetting(key, value) {
  const strValue = typeof value === 'string' ? value : JSON.stringify(value)

  // 同步更新缓存和 localStorage
  if (_cache) _cache[key] = strValue
  localStorage.setItem(key, strValue)

  // 异步写 SQLite（fire and forget）
  if (window.dbAPI?.settings) {
    window.dbAPI.settings.set(key, strValue).catch((err) => {
      console.error(`[dbService] 写入 SQLite 失败 (${key}):`, err)
    })
  }
}

/**
 * 写入 JSON 设置
 */
export function setSettingJSON(key, value) {
  setSetting(key, JSON.stringify(value))
}

/**
 * 删除设置
 */
export function removeSetting(key) {
  if (_cache) delete _cache[key]
  localStorage.removeItem(key)

  if (window.dbAPI?.settings) {
    window.dbAPI.settings.delete(key).catch((err) => {
      console.error(`[dbService] 删除 SQLite 失败 (${key}):`, err)
    })
  }
}
