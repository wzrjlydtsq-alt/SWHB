import { useAppStore } from '../store/useAppStore.ts'

const DEFAULT_CATEGORIES = ['characters', 'materials', 'videos', 'audio', 'props', 'documents']
const CATEGORY_ALIASES = {
  scenes: 'materials',
  video: 'videos'
}

function createEmptyCategory() {
  return { folders: [], items: [] }
}

function normalizeFolder(folder) {
  if (!folder || typeof folder !== 'object') return null
  return {
    ...folder,
    items: Array.isArray(folder.items) ? folder.items : []
  }
}

function normalizeCategory(category) {
  if (Array.isArray(category)) {
    return { folders: [], items: category }
  }

  if (category && typeof category === 'object') {
    return {
      folders: Array.isArray(category.folders)
        ? category.folders.map(normalizeFolder).filter(Boolean)
        : [],
      items: Array.isArray(category.items) ? category.items : []
    }
  }

  return createEmptyCategory()
}

function resolveCategoryId(category) {
  if (DEFAULT_CATEGORIES.includes(category)) return category
  return CATEGORY_ALIASES[category] || 'materials'
}

function mergeCategory(target, source) {
  if (!source.items.length && !source.folders.length) return target
  return {
    folders: [...target.folders, ...source.folders],
    items: [...target.items, ...source.items]
  }
}

function normalizeAssetLibraryData(input) {
  const parsed = input && typeof input === 'object' ? input : {}
  const migrated = Object.fromEntries(
    DEFAULT_CATEGORIES.map((id) => [id, createEmptyCategory()])
  )

  for (const categoryId of DEFAULT_CATEGORIES) {
    migrated[categoryId] = normalizeCategory(parsed[categoryId])
  }

  for (const [legacyId, targetId] of Object.entries(CATEGORY_ALIASES)) {
    migrated[targetId] = mergeCategory(migrated[targetId], normalizeCategory(parsed[legacyId]))
  }

  return migrated
}

function getProjectScopedStorageKey(projectId = useAppStore.getState().currentProject?.id) {
  return projectId ? `tapnow_asset_library_${projectId}` : 'tapnow_asset_library'
}

function getBaseName(input = '') {
  if (!input) return ''

  try {
    if (input.startsWith('xinghe://local')) {
      const url = new URL(input)
      const decodedPath = decodeURIComponent(url.searchParams.get('path') || '')
      if (decodedPath) return decodedPath.split(/[/\\]/).pop() || decodedPath
    }
  } catch {
    // Ignore URL parsing issues and continue with plain string parsing.
  }

  const cleaned = input.split('?')[0]
  return cleaned.split(/[/\\]/).pop() || cleaned
}

function inferAssetType(pathOrUrl = '', explicitName = '') {
  const fileName = explicitName || getBaseName(pathOrUrl)
  const ext = fileName.split('.').pop()?.toLowerCase() || ''

  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
    return `image/${ext === 'jpg' ? 'jpeg' : ext}`
  }
  if (['mp4', 'webm', 'mov', 'ogg'].includes(ext)) {
    return `video/${ext}`
  }
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) {
    return `audio/${ext}`
  }

  return 'application/octet-stream'
}

export function loadAssetLibrary(projectId = useAppStore.getState().currentProject?.id) {
  try {
    const raw = localStorage.getItem(getProjectScopedStorageKey(projectId))
    if (!raw) {
      return normalizeAssetLibraryData(null)
    }

    const parsed = JSON.parse(raw)
    return normalizeAssetLibraryData(parsed)
  } catch {
    return normalizeAssetLibraryData(null)
  }
}

export function saveAssetLibrary(data, projectId = useAppStore.getState().currentProject?.id) {
  localStorage.setItem(getProjectScopedStorageKey(projectId), JSON.stringify(normalizeAssetLibraryData(data)))
  window.dispatchEvent(new CustomEvent('asset-library-updated'))
}

export function addAssetToLibrary({ category = 'materials', path, name, type = undefined, cloudAssetId = undefined, teamId = undefined, source = undefined }) {
  if (!path) {
    return { success: false, error: 'Missing asset path' }
  }

  const safeCategory = resolveCategoryId(category)
  const data = loadAssetLibrary()
  const categoryData = normalizeCategory(data[safeCategory])

  const assetName = name || getBaseName(path) || `asset-${Date.now()}`
  const assetType = type || inferAssetType(path, assetName)
  const assetId = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  categoryData.items = [
    ...categoryData.items,
    {
      id: assetId,
      name: assetName,
      type: assetType,
      path,
      addedAt: Date.now(),
      ...(cloudAssetId ? { cloudAssetId } : {}),
      ...(teamId ? { teamId } : {}),
      ...(source ? { source } : {})
    }
  ]

  data[safeCategory] = categoryData
  saveAssetLibrary(data)

  return { success: true, assetId }
}
