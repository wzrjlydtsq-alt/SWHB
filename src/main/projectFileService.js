/**
 * projectFileService.js — 基于 JSON 文件的项目持久化服务
 *
 * 每个项目保存为 {userData}/projects/{projId}.json
 * 使用原子写入（先写 .tmp 再 rename）防止崩溃导致文件损坏
 */
import { app } from 'electron'
import { join } from 'path'
import {
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  readdirSync,
  existsSync,
  mkdirSync
} from 'fs'
import {
  PROJECT_SCHEMA_VERSION,
  normalizeProjectData,
  migrateLegacyLocalCacheReferences
} from './projectDataRepair.js'

let _projectsDir = null

/** 获取项目目录路径 */
export function getProjectsDir() {
  if (_projectsDir) return _projectsDir
  _projectsDir = join(app.getPath('userData'), 'projects')
  if (!existsSync(_projectsDir)) {
    mkdirSync(_projectsDir, { recursive: true })
  }
  return _projectsDir
}

/**
 * 原子写入 JSON 文件
 * @param {string} filePath 目标文件路径
 * @param {object} data     要写入的数据
 */
function atomicWriteJSON(filePath, data) {
  const tmpPath = filePath + '.tmp'
  const jsonStr = JSON.stringify(data, null, 2)
  writeFileSync(tmpPath, jsonStr, 'utf-8')
  renameSync(tmpPath, filePath)
}

function sanitizeCacheId(value, fallback = 'unassigned') {
  const clean = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120)
  return clean || fallback
}

function getDefaultProjectCacheRoot(projectId) {
  return join(app.getPath('userData'), 'ProjectCache', sanitizeCacheId(projectId))
}

function getProjectCacheRoot(projectId, projectData) {
  return projectData?.cacheRoot || getDefaultProjectCacheRoot(projectId)
}

function getLegacyLocalCacheRoots() {
  return [
    join(app.getPath('userData'), 'LocalCache'),
    join(app.getPath('appData'), 'ljxh.1', 'LocalCache'),
    join(app.getPath('appData'), 'xinghe-zhihui', 'LocalCache'),
    join(app.getPath('appData'), 'Electron', 'LocalCache')
  ]
}

function migrateProjectManagedReferences(id, projectData) {
  return migrateLegacyLocalCacheReferences(projectData, {
    projectCacheRoot: getProjectCacheRoot(id, projectData),
    legacyRoots: getLegacyLocalCacheRoots()
  })
}

function shouldPreserveExistingCanvas(data, existingData) {
  if (data?.allowEmptyCanvasOverwrite === true) return false
  const incomingNodes = Array.isArray(data?.nodes) ? data.nodes : null
  const existingNodes = Array.isArray(existingData?.nodes) ? existingData.nodes : []
  return Boolean(incomingNodes && incomingNodes.length === 0 && existingNodes.length > 0)
}

function shouldPreserveExistingHistory(data, existingData) {
  if (data?.allowEmptyHistoryOverwrite === true) return false
  const incomingHistory = Array.isArray(data?.history) ? data.history : []
  const existingHistory = Array.isArray(existingData?.history) ? existingData.history : []
  return incomingHistory.length === 0 && existingHistory.length > 0
}

function preserveExistingCanvasIfNeeded(id, data, existingData) {
  const preserveCanvas = shouldPreserveExistingCanvas(data, existingData)
  const preserveHistory = shouldPreserveExistingHistory(data, existingData)
  if (!preserveCanvas && !preserveHistory) return data

  console.warn(
    `[projectFileService] Refusing to overwrite non-empty project ${id} with empty data; preserving existing ${preserveCanvas ? 'canvas' : ''}${preserveCanvas && preserveHistory ? ' and ' : ''}${preserveHistory ? 'history' : ''}.`
  )
  return {
    ...data,
    ...(preserveCanvas
      ? {
          nodes: existingData.nodes,
          connections:
            Array.isArray(data?.connections) && data.connections.length > 0
              ? data.connections
              : existingData.connections,
          nodeGroups:
            Array.isArray(data?.nodeGroups) && data.nodeGroups.length > 0
              ? data.nodeGroups
              : existingData.nodeGroups,
          view: data?.view || existingData.view
        }
      : {}),
    ...(preserveHistory ? { history: existingData.history } : {})
  }
}

export function normalizeProjectJSON(id, data = {}, existingData = null) {
  return normalizeProjectData(id, data, existingData)
}

/**
 * 保存项目数据到 JSON 文件
 * @param {string} id   项目 ID
 * @param {object} data 完整项目数据 { name, nodes, connections, history, view, ... }
 */
export function saveProjectJSON(id, data) {
  const dir = getProjectsDir()
  const filePath = join(dir, `${id}.json`)
  let existingData = null
  if (existsSync(filePath)) {
    try {
      existingData = JSON.parse(readFileSync(filePath, 'utf-8'))
    } catch {
      existingData = null
    }
  }

  const guardedData = preserveExistingCanvasIfNeeded(id, data, existingData)
  const projectData = normalizeProjectJSON(id, guardedData, existingData)
  projectData.updatedAt = new Date().toISOString()

  atomicWriteJSON(filePath, projectData)
  return {
    success: true,
    path: filePath,
    nodesCount: projectData.nodes.length,
    connectionsCount: projectData.connections.length,
    historyCount: projectData.history.length
  }
}

/**
 * 同步保存（供 beforeunload / sendSync 使用）
 */
export function saveProjectJSONSync(id, data) {
  return saveProjectJSON(id, data) // 实际已是同步操作
}

/**
 * 读取项目数据
 * @param {string} id 项目 ID
 * @returns {object|null} 项目数据
 */
export function loadProjectJSON(id) {
  const dir = getProjectsDir()
  const filePath = join(dir, `${id}.json`)
  if (!existsSync(filePath)) return null
  try {
    const raw = readFileSync(filePath, 'utf-8')
    return normalizeProjectJSON(id, JSON.parse(raw))
  } catch (err) {
    console.error(`[projectFileService] 读取项目 ${id} 失败:`, err.message)
    return null
  }
}

export function repairProjectJSON(id) {
  const dir = getProjectsDir()
  const filePath = join(dir, `${id}.json`)
  if (!existsSync(filePath)) {
    return { success: false, error: '项目文件不存在' }
  }

  const original = JSON.parse(readFileSync(filePath, 'utf-8'))
  let projectData = normalizeProjectJSON(id, original)
  const referenceMigration = migrateProjectManagedReferences(id, projectData)
  if (referenceMigration.changed) {
    projectData = referenceMigration.data
  }
  projectData.updatedAt = new Date().toISOString()
  projectData.repairedAt = new Date().toISOString()
  projectData.lastRepair = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    copiedLegacyCacheFiles: referenceMigration.copied,
    rewrittenLegacyCacheRefs: referenceMigration.rewritten,
    preservedLegacyVideoRefs: referenceMigration.preserved,
    missingLegacyCacheFiles: referenceMigration.missing.length,
    errors: referenceMigration.errors.length
  }

  atomicWriteJSON(filePath, projectData)
  return {
    success: true,
    projectId: id,
    path: filePath,
    schemaVersion: projectData.schemaVersion,
    copiedLegacyCacheFiles: referenceMigration.copied,
    rewrittenLegacyCacheRefs: referenceMigration.rewritten,
    preservedLegacyVideoRefs: referenceMigration.preserved,
    missingLegacyCacheFiles: referenceMigration.missing.length,
    errors: referenceMigration.errors,
    missing: referenceMigration.missing,
    nodesCount: projectData.nodes.length,
    connectionsCount: projectData.connections.length,
    historyCount: projectData.history.length
  }
}

/**
 * 列出所有项目（扫描目录）
 * 只读取每个文件的 id/name/updatedAt/createdAt 和节点数量，不加载完整数据
 */
export function listProjectsJSON() {
  const dir = getProjectsDir()
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.tmp'))
  const projects = []

  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), 'utf-8')
      const data = JSON.parse(raw)
      projects.push({
        id: data.id || file.replace('.json', ''),
        schemaVersion: data.schemaVersion || null,
        name: data.name || '未命名项目',
        folderId: data.folderId || null,
        cloudSync: data.cloudSync || false,
        cloudType: data.cloudType || null,
        cloudProjectId: data.cloudProjectId || null,
        cloudProjectTitle: data.cloudProjectTitle || null,
        cloudEpisodeId: data.cloudEpisodeId || null,
        cloudEpisodeNumber: data.cloudEpisodeNumber || null,
        cloudEpisodeStatus: data.cloudEpisodeStatus || null,
        cloudAssignmentId: data.cloudAssignmentId || null,
        cloudAssignmentTitle: data.cloudAssignmentTitle || null,
        cloudAssignmentStatus: data.cloudAssignmentStatus || null,
        cloudReviewStatus: data.cloudReviewStatus || null,
        cloudTeamId: data.cloudTeamId || null,
        cloudRole: data.cloudRole || null,
        cacheRoot: data.cacheRoot || null,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
        nodesCount: data.nodes?.length || 0,
        thumbnail: data.thumbnail || null
      })
    } catch (err) {
      console.warn(`[projectFileService] 跳过损坏文件 ${file}:`, err.message)
    }
  }

  // 按更新时间降序
  projects.sort((a, b) => {
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
    return tb - ta
  })

  return projects
}

/**
 * 删除项目文件
 * @param {string} id 项目 ID
 */
export function deleteProjectJSON(id) {
  const dir = getProjectsDir()
  const filePath = join(dir, `${id}.json`)
  if (existsSync(filePath)) {
    unlinkSync(filePath)
    return { success: true }
  }
  return { success: false, error: '文件不存在' }
}
