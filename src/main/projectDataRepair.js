import path from 'path'
import fs from 'fs'

export const PROJECT_SCHEMA_VERSION = '2.0.25'

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif'])
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'])
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'])

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function firstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value)) return value
  }
  return null
}

function valuesArray(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return null
  return Object.values(value).filter((item) => item && typeof item === 'object')
}

function pickLegacyNodes(source, existing) {
  return (
    firstArray(
      source.nodes,
      source.canvas?.nodes,
      source.workflow?.nodes,
      source.project?.nodes,
      source.data?.nodes,
      existing.nodes
    ) ||
    valuesArray(source.nodesMap) ||
    valuesArray(source.canvas?.nodesMap) ||
    valuesArray(source.workflow?.nodesMap) ||
    []
  )
}

function pickLegacyConnections(source, existing) {
  return (
    firstArray(
      source.connections,
      source.edges,
      source.links,
      source.canvas?.connections,
      source.canvas?.edges,
      source.workflow?.connections,
      source.workflow?.edges,
      source.project?.connections,
      source.data?.connections,
      existing.connections
    ) || []
  )
}

function pickLegacyHistory(source, existing) {
  return (
    firstArray(
      source.history,
      source.histories,
      source.generationHistory,
      source.canvas?.history,
      source.workflow?.history,
      source.project?.history,
      source.data?.history,
      existing.history
    ) || []
  )
}

export function normalizeProjectData(id, data = {}, existingData = null) {
  const source = asObject(data)
  const existing = asObject(existingData)
  const projectId = source.id || id
  const nodes = pickLegacyNodes(source, existing)
  const connections = pickLegacyConnections(source, existing)
  const history = pickLegacyHistory(source, existing)
  const nodeGroups =
    firstArray(
      source.nodeGroups,
      source.groups,
      source.canvas?.nodeGroups,
      source.workflow?.nodeGroups,
      source.project?.nodeGroups,
      source.data?.nodeGroups,
      existing.nodeGroups
    ) || []

  return {
    ...existing,
    ...source,
    version: source.version || existing.version || '4.0',
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: projectId,
    name: source.name || source.projectName || existing.name || existing.projectName || '未命名项目',
    folderId: source.folderId || existing.folderId || null,
    cloudSync: source.cloudSync ?? existing.cloudSync ?? false,
    cloudType: source.cloudType || existing.cloudType || null,
    cloudProjectId: source.cloudProjectId || existing.cloudProjectId || null,
    cloudProjectTitle: source.cloudProjectTitle || existing.cloudProjectTitle || null,
    cloudEpisodeId: source.cloudEpisodeId || existing.cloudEpisodeId || null,
    cloudEpisodeNumber: source.cloudEpisodeNumber || existing.cloudEpisodeNumber || null,
    cloudEpisodeStatus: source.cloudEpisodeStatus || existing.cloudEpisodeStatus || null,
    cloudAssignmentId: source.cloudAssignmentId || existing.cloudAssignmentId || null,
    cloudAssignmentTitle: source.cloudAssignmentTitle || existing.cloudAssignmentTitle || null,
    cloudAssignmentStatus: source.cloudAssignmentStatus || existing.cloudAssignmentStatus || null,
    cloudReviewStatus: source.cloudReviewStatus || existing.cloudReviewStatus || null,
    cloudTeamId: source.cloudTeamId || existing.cloudTeamId || null,
    cloudRole: source.cloudRole || existing.cloudRole || null,
    cacheRoot: source.cacheRoot ?? existing.cacheRoot ?? null,
    createdAt: source.createdAt || existing.createdAt || new Date().toISOString(),
    updatedAt: source.updatedAt || existing.updatedAt || new Date().toISOString(),
    view:
      source.view ??
      source.canvas?.view ??
      source.workflow?.view ??
      source.project?.view ??
      source.data?.view ??
      existing.view ??
      null,
    thumbnail: source.thumbnail ?? existing.thumbnail ?? null,
    nodes,
    nodeGroups,
    connections,
    history,
    assetLibrary: source.assetLibrary ?? existing.assetLibrary ?? null,
    productionBoard: source.productionBoard ?? existing.productionBoard ?? null
  }
}

export function toXingheLocalUrl(filePath) {
  return `xinghe://local/?path=${encodeURIComponent(filePath)}`
}

export function resolveXingheLocalPath(value) {
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

export function isPathInside(childPath, parentPath) {
  if (!childPath || !parentPath) return false
  const child = path.resolve(childPath)
  const parent = path.resolve(parentPath)
  return child === parent || child.startsWith(`${parent}${path.sep}`)
}

function classifyCacheType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (VIDEO_EXTS.has(ext)) return 'videos'
  if (AUDIO_EXTS.has(ext)) return 'audio'
  if (IMAGE_EXTS.has(ext)) return 'images'
  return 'temp'
}

function normalizeLegacyRelativePath(value) {
  const raw = String(value || '').replace(/^[/\\]+/, '')
  if (!raw) return ''
  if (/^LocalCache[/\\]/i.test(raw)) return raw.replace(/^LocalCache[/\\]/i, '')
  if (/^(images|videos|audio|thumbs|temp)[/\\]/i.test(raw)) return raw
  return ''
}

function resolveLegacyReferencePath(value, context) {
  const resolvedValue = resolveXingheLocalPath(value)
  if (!resolvedValue) return ''
  if (path.isAbsolute(resolvedValue)) return resolvedValue

  const relativePath = normalizeLegacyRelativePath(resolvedValue)
  if (!relativePath) return ''

  for (const root of context.legacyRoots) {
    const candidate = path.join(root, relativePath)
    if (context.existsSync(candidate)) return candidate
  }

  return path.join(context.legacyRoots[0] || '', relativePath)
}

function makeTargetPath(sourcePath, projectCacheRoot, seenTargets) {
  const bucket = classifyCacheType(sourcePath)
  const parsed = path.parse(sourcePath)
  const baseName = parsed.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'legacy_cache'
  const ext = parsed.ext || ''
  let candidate = path.join(projectCacheRoot, bucket, `${baseName}${ext}`)
  let index = 1
  while (seenTargets.has(path.resolve(candidate))) {
    candidate = path.join(projectCacheRoot, bucket, `${baseName}_${index}${ext}`)
    index += 1
  }
  seenTargets.add(path.resolve(candidate))
  return candidate
}

function migrateStringReference(value, context) {
  const sourcePath = resolveLegacyReferencePath(value, context)
  if (!sourcePath || !path.isAbsolute(sourcePath)) return { value, changed: false }

  if (isPathInside(sourcePath, context.projectCacheRoot)) {
    return { value, changed: false }
  }

  const isLegacyCache = context.legacyRoots.some((root) => isPathInside(sourcePath, root))
  if (!isLegacyCache) return { value, changed: false }

  if (!context.existsSync(sourcePath)) {
    context.report.missing.push(sourcePath)
    return { value, changed: false }
  }

  const bucket = classifyCacheType(sourcePath)
  if (bucket === 'videos' && context.preserveLegacyVideos) {
    context.report.rewritten += 1
    context.report.preserved += 1
    context.report.files.push({ from: sourcePath, to: sourcePath, preserved: true })
    return { value: toXingheLocalUrl(sourcePath), changed: true }
  }

  try {
    const sourceKey = path.resolve(sourcePath)
    let targetPath = context.sourceMap.get(sourceKey)
    if (!targetPath) {
      targetPath = makeTargetPath(sourcePath, context.projectCacheRoot, context.seenTargets)
      context.sourceMap.set(sourceKey, targetPath)
      context.mkdirSync(path.dirname(targetPath), { recursive: true })
      if (!context.existsSync(targetPath)) {
        context.copyFileSync(sourcePath, targetPath)
        context.report.copied += 1
      }
    }
    context.report.rewritten += 1
    context.report.files.push({ from: sourcePath, to: targetPath })
    return { value: toXingheLocalUrl(targetPath), changed: true }
  } catch (error) {
    context.report.errors.push({ path: sourcePath, error: error?.message || String(error) })
    return { value, changed: false }
  }
}

function walkAndMigrate(value, context, seenObjects) {
  if (typeof value === 'string') {
    return migrateStringReference(value, context)
  }

  if (!value || typeof value !== 'object') {
    return { value, changed: false }
  }

  if (seenObjects.has(value)) {
    return { value, changed: false }
  }
  seenObjects.add(value)

  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const result = walkAndMigrate(item, context, seenObjects)
      changed ||= result.changed
      return result.value
    })
    return { value: changed ? next : value, changed }
  }

  let changed = false
  const next = {}
  for (const [key, item] of Object.entries(value)) {
    const result = walkAndMigrate(item, context, seenObjects)
    changed ||= result.changed
    next[key] = result.value
  }
  return { value: changed ? next : value, changed }
}

export function migrateLegacyLocalCacheReferences(data, options = {}) {
  const projectCacheRoot = options.projectCacheRoot
  const legacyRoots = (options.legacyRoots || []).filter(Boolean).map((item) => path.resolve(item))
  if (!projectCacheRoot || legacyRoots.length === 0) {
    return {
      data,
      changed: false,
      copied: 0,
      rewritten: 0,
      preserved: 0,
      missing: [],
      errors: [],
      files: []
    }
  }

  const report = {
    copied: 0,
    rewritten: 0,
    preserved: 0,
    missing: [],
    errors: [],
    files: []
  }

  const context = {
    projectCacheRoot: path.resolve(projectCacheRoot),
    legacyRoots,
    report,
    seenTargets: new Set(),
    sourceMap: new Map(),
    existsSync: options.existsSync || fs.existsSync,
    mkdirSync: options.mkdirSync || fs.mkdirSync,
    copyFileSync: options.copyFileSync || fs.copyFileSync,
    preserveLegacyVideos: options.preserveLegacyVideos !== false
  }

  const result = walkAndMigrate(data, context, new WeakSet())
  return {
    data: result.value,
    changed: result.changed,
    ...report
  }
}
