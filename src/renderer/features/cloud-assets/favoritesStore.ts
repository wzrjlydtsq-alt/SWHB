import { getUserInfo } from '../../services/cloud'

export const PERSONAL_FAVORITES_EVENT = 'personal-favorites:updated'

const FAVORITES_KEY_PREFIX = 'xinghe_personal_favorites_v1'
const DEFAULT_FOLDER = { id: 'root', name: '默认收藏', createdAt: Date.now() }

type FavoriteItemInput = {
  url?: string
  originalUrl?: string
  type?: 'image' | 'video' | 'audio' | string
  name?: string
  prompt?: string
  modelName?: string
  objectKey?: string
  ossKey?: string
  cloudFavoriteId?: number
  requestId?: string
  taskId?: string
  remoteTaskId?: string
  durationMs?: number
  width?: number
  height?: number
  sourceMeta?: Record<string, unknown>
}

function getFavoritesKey() {
  const userId = getUserInfo()?.id || 'guest'
  return `${FAVORITES_KEY_PREFIX}_${userId}`
}

function normalizeFavoritesState(parsed: any) {
  const folders = Array.isArray(parsed?.folders) && parsed.folders.length
    ? parsed.folders
    : [DEFAULT_FOLDER]
  const hasRoot = folders.some((folder: any) => folder.id === 'root')
  return {
    folders: hasRoot ? folders : [DEFAULT_FOLDER, ...folders],
    items: Array.isArray(parsed?.items) ? parsed.items : []
  }
}

export function readFavoritesState() {
  try {
    return normalizeFavoritesState(JSON.parse(localStorage.getItem(getFavoritesKey()) || '{}'))
  } catch {
    return {
      folders: [DEFAULT_FOLDER],
      items: []
    }
  }
}

export function saveFavoritesState(state: { folders: unknown[]; items: unknown[] }) {
  localStorage.setItem(getFavoritesKey(), JSON.stringify(state))
  window.dispatchEvent(new CustomEvent(PERSONAL_FAVORITES_EVENT))
}

function getBaseName(input = '') {
  const clean = input.split('?')[0]
  return clean.split(/[/\\]/).pop() || clean
}

export function addGeneratedResultToFavorites(result: FavoriteItemInput) {
  const url = result?.url || result?.originalUrl
  if (!url) return { success: false, error: '素材地址为空' }

  const state = readFavoritesState()
  const id = `fav_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const name = result.name || getBaseName(url) || `收藏素材-${state.items.length + 1}`

  state.items = [
    {
      id,
      folderId: 'root',
      name,
      url,
      objectKey: result.objectKey || result.ossKey || (result.sourceMeta?.objectKey as string) || '',
      cloudFavoriteId: result.cloudFavoriteId || null,
      type: result.type || 'image',
      prompt: result.prompt || '',
      modelName: result.modelName || '',
      requestId: result.requestId || '',
      taskId: result.taskId || '',
      remoteTaskId: result.remoteTaskId || '',
      durationMs: result.durationMs || null,
      width: result.width || null,
      height: result.height || null,
      sourceMeta: result.sourceMeta || null,
      createdAt: Date.now()
    },
    ...state.items
  ]

  saveFavoritesState(state)
  return { success: true, id }
}

export function createFavoriteFolder(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return { success: false, error: '文件夹名称不能为空' }
  const state = readFavoritesState()
  const folder = {
    id: `fav_folder_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: trimmed,
    createdAt: Date.now()
  }
  state.folders = [...state.folders, folder]
  saveFavoritesState(state)
  return { success: true, folder }
}

export function renameFavoriteFolder(folderId: string, name: string) {
  if (folderId === 'root') return { success: false, error: '默认收藏不能重命名' }
  const trimmed = name.trim()
  if (!trimmed) return { success: false, error: '文件夹名称不能为空' }
  const state = readFavoritesState()
  state.folders = state.folders.map((folder: any) =>
    folder.id === folderId ? { ...folder, name: trimmed } : folder
  )
  saveFavoritesState(state)
  return { success: true }
}

export function deleteFavoriteFolder(folderId: string) {
  if (folderId === 'root') return { success: false, error: '默认收藏不能删除' }
  const state = readFavoritesState()
  state.folders = state.folders.filter((folder: any) => folder.id !== folderId)
  state.items = state.items.map((item: any) =>
    item.folderId === folderId ? { ...item, folderId: 'root' } : item
  )
  saveFavoritesState(state)
  return { success: true }
}

export function renameFavoriteItem(itemId: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) return { success: false, error: '素材名称不能为空' }
  const state = readFavoritesState()
  state.items = state.items.map((item: any) => (item.id === itemId ? { ...item, name: trimmed } : item))
  saveFavoritesState(state)
  return { success: true }
}

export function moveFavoriteItem(itemId: string, folderId: string) {
  const state = readFavoritesState()
  state.items = state.items.map((item: any) => (item.id === itemId ? { ...item, folderId } : item))
  saveFavoritesState(state)
  return { success: true }
}

export function deleteFavoriteItem(itemId: string) {
  const state = readFavoritesState()
  state.items = state.items.filter((item: any) => item.id !== itemId)
  saveFavoritesState(state)
  return { success: true }
}
