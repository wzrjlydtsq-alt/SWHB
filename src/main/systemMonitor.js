import os from 'os'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { globalTaskQueue } from './engine/TaskQueue.js'
import db from './database.js'

// IPC 调用计数器
let ipcCallCount = 0
export function incrementIpcCount() {
  ipcCallCount++
}

// 应用启动时间
const appStartTime = Date.now()

/**
 * 采集系统监控数据（主进程调用）
 */
export function collectStats() {
  const memUsage = process.memoryUsage()
  const cpuUsage = process.cpuUsage()

  // 数据库统计
  let dbStats = null
  try {
    if (!db) throw new Error('db not initialized')

    const tables = ['projects', 'nodes', 'connections', 'history', 'assets', 'settings']
    const tableCounts = {}
    for (const table of tables) {
      try {
        const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get()
        tableCounts[table] = row.count
      } catch {
        tableCounts[table] = -1
      }
    }

    // DB 文件大小
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

  // 任务引擎状态
  let engineStats = { active: 0, waiting: 0, completed: 0, failed: 0 }
  try {
    const status = globalTaskQueue.getStatus()
    engineStats = {
      active: status.active?.length || 0,
      waiting: status.waiting?.length || 0,
      completed: status.completed?.length || 0,
      failed: status.failed?.length || 0
    }
  } catch {
    // ignore
  }

  // 磁盘缓存统计
  let cacheStats = { images: { count: 0, size: 0 }, videos: { count: 0, size: 0 } }
  try {
    const cacheBase = path.join(app.getPath('userData'), 'LocalCache')
    const scanDir = (dirPath) => {
      let count = 0
      let size = 0
      try {
        if (fs.existsSync(dirPath)) {
          const files = fs.readdirSync(dirPath)
          for (const file of files) {
            try {
              const stat = fs.statSync(path.join(dirPath, file))
              if (stat.isFile()) {
                count++
                size += stat.size
              }
            } catch {
              // skip inaccessible files
            }
          }
        }
      } catch {
        // ignore
      }
      return { count, size }
    }
    cacheStats.images = scanDir(path.join(cacheBase, 'images'))
    cacheStats.videos = scanDir(path.join(cacheBase, 'videos'))
  } catch {
    // ignore
  }

  // CPU 核心数
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
    database: dbStats,
    engine: engineStats,
    ipc: {
      registeredChannels: 38,
      totalCalls: ipcCallCount
    },
    cache: cacheStats,
    timestamp: Date.now()
  }
}
