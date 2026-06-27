import os from 'os'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { globalTaskQueue } from './engine/TaskQueue.js'
import db, { getCacheStats } from './database.js'

let ipcCallCount = 0
let cachedStats = null
let cachedStatsAt = 0
let cachedHeavyStats = null
let cachedHeavyStatsAt = 0
const STATS_CACHE_TTL_MS = 500
const HEAVY_STATS_TTL_MS = 30 * 1000
const SLOW_STATS_WARN_MS = 150

export function incrementIpcCount() {
  ipcCallCount++
}

const appStartTime = Date.now()

function collectHeavyStats() {
  let dbStats = null
  try {
    if (!db) throw new Error('db not initialized')

    const tables = ['projects', 'nodes', 'connections', 'history', 'assets', 'settings', 'cache_files']
    const tableCounts = {}
    for (const table of tables) {
      try {
        const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get()
        tableCounts[table] = row.count
      } catch {
        tableCounts[table] = -1
      }
    }

    const dbPath = !app.isPackaged
      ? path.join(process.cwd(), 'canvas_data.db')
      : path.join(app.getPath('userData'), 'canvas_data.db')
    let dbFileSize = 0
    let walFileSize = 0
    try {
      if (fs.existsSync(dbPath)) dbFileSize = fs.statSync(dbPath).size
      const walPath = dbPath + '-wal'
      if (fs.existsSync(walPath)) walFileSize = fs.statSync(walPath).size
    } catch {
      // ignore
    }

    dbStats = { tableCounts, dbFileSize, walFileSize }
  } catch (e) {
    dbStats = { error: e.message }
  }

  let cacheStats = { images: { count: 0, size: 0 }, videos: { count: 0, size: 0 } }
  try {
    cacheStats = getCacheStats()
  } catch {
    // ignore
  }

  return { database: dbStats, cache: cacheStats, timestamp: Date.now() }
}

function getHeavyStatsCached() {
  const now = Date.now()
  if (!cachedHeavyStats || now - cachedHeavyStatsAt > HEAVY_STATS_TTL_MS) {
    const startedAt = Date.now()
    cachedHeavyStats = collectHeavyStats()
    cachedHeavyStatsAt = Date.now()
    const durationMs = cachedHeavyStatsAt - startedAt
    if (durationMs > SLOW_STATS_WARN_MS) {
      console.warn(`[systemMonitor] heavy stats took ${durationMs}ms`)
    }
  }

  return {
    ...cachedHeavyStats,
    heavyStatsAgeMs: now - cachedHeavyStatsAt
  }
}

export function collectStatsCached() {
  const now = Date.now()
  if (cachedStats && now - cachedStatsAt < STATS_CACHE_TTL_MS) {
    return {
      ...cachedStats,
      cached: true,
      cacheAgeMs: now - cachedStatsAt
    }
  }

  const startedAt = Date.now()
  const stats = collectStats()
  const durationMs = Date.now() - startedAt
  cachedStats = {
    ...stats,
    cached: false,
    collectionDurationMs: durationMs
  }
  cachedStatsAt = Date.now()

  if (durationMs > SLOW_STATS_WARN_MS) {
    console.warn(`[systemMonitor] collectStats took ${durationMs}ms`)
  }

  return cachedStats
}

export function collectStats() {
  const memUsage = process.memoryUsage()
  const cpuUsage = process.cpuUsage()
  const heavyStats = getHeavyStatsCached()

  let engineStats = { active: 0, waiting: 0, completed: 0, failed: 0 }
  try {
    const status = globalTaskQueue.getStatus()
    engineStats = {
      active: status.active?.length || 0,
      waiting: status.waiting?.length || 0,
      completed: status.completed?.length || status.completed || 0,
      failed: status.failed?.length || status.failed || 0
    }
  } catch {
    // ignore
  }

  const cpus = os.cpus()

  return {
    system: {
      platform: process.platform,
      osVersion: os.release(),
      arch: os.arch(),
      cpuModel: cpus[0]?.model || 'Unknown',
      cpuCores: cpus.length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome,
      v8Version: process.versions.v8
    },
    process: {
      uptime: Date.now() - appStartTime,
      pid: process.pid,
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      cpuUser: cpuUsage.user,
      cpuSystem: cpuUsage.system
    },
    database: heavyStats.database,
    engine: engineStats,
    ipc: {
      registeredChannels: 38,
      totalCalls: ipcCallCount
    },
    cache: heavyStats.cache,
    heavyStatsAgeMs: heavyStats.heavyStatsAgeMs,
    timestamp: Date.now()
  }
}
