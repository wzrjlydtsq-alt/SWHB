/**
 * 云素材拖拽协议 — 统一类型和工具函数
 *
 * 云素材卡片拖拽时写入 DataTransfer，
 * 画布/资产库/批量生产板读取后处理。
 */
import { assetsApi } from '../services/cloud'

// ═══════════════════════════════════
//  类型定义
// ═══════════════════════════════════

export type CloudAssetDragPayload = {
  source: 'cloud-assets'
  assetId: number
  teamId: number
  name: string
  assetType: 'image' | 'video' | 'audio' | 'document' | 'project' | 'other'
  mimeType: string
  fileSize: number
  tags: string[]
  thumbUrl?: string
  downloadUrl?: string
  ossKey?: string
  seedanceId?: string
  providerAssetId?: string
  externalAssetId?: string
  asset_id?: string
}

export type SeriesAssetDragPayload = {
  source: 'series-asset-library'
  projectId: string
  categoryId: string
  categoryName: string
  name: string
  prompt: string
  imageUrl?: string
}

/** DataTransfer key */
export const CLOUD_ASSET_MIME = 'application/x-xinghe-cloud-asset'
export const SERIES_ASSET_MIME = 'application/x-xinghe-series-asset'

// ═══════════════════════════════════
//  写入 / 读取
// ═══════════════════════════════════

/** 从 DataTransfer 中读取云素材拖拽数据，不存在时返回 null */
export function readCloudAssetDrag(dataTransfer: DataTransfer): CloudAssetDragPayload | null {
  try {
    const raw = dataTransfer.getData(CLOUD_ASSET_MIME)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CloudAssetDragPayload
    if (parsed.source !== 'cloud-assets') return null
    return parsed
  } catch {
    return null
  }
}

/** 检查 DataTransfer 中是否含有云素材数据（用于 dragOver 判断） */
export function hasCloudAssetDrag(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(CLOUD_ASSET_MIME)
}

export function readSeriesAssetDrag(dataTransfer: DataTransfer): SeriesAssetDragPayload | null {
  try {
    const raw = dataTransfer.getData(SERIES_ASSET_MIME)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SeriesAssetDragPayload
    if (parsed.source !== 'series-asset-library') return null
    return parsed
  } catch {
    return null
  }
}

export function hasSeriesAssetDrag(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(SERIES_ASSET_MIME)
}

// ═══════════════════════════════════
//  下载地址解析
// ═══════════════════════════════════

/** 异步获取下载地址，拖拽落点使用 */
export async function resolveCloudAssetForDrop(
  payload: CloudAssetDragPayload
): Promise<{ downloadUrl: string; payload: CloudAssetDragPayload }> {
  if (payload.downloadUrl) {
    return { downloadUrl: payload.downloadUrl, payload }
  }
  const data = await assetsApi.getDownloadUrl(payload.teamId, payload.assetId)
  return {
    downloadUrl: data.download_url,
    payload: { ...payload, downloadUrl: data.download_url }
  }
}

// ═══════════════════════════════════
//  默认节点映射
// ═══════════════════════════════════

/** 根据云素材类型返回画布默认节点类型（必须与 NodeRegistry 已注册类型对齐） */
export function getDefaultNodeType(assetType: CloudAssetDragPayload['assetType']): string {
  switch (assetType) {
    case 'image':
      return 'gen-image'      // NodeRegistry 注册类型
    case 'video':
      return 'gen-video'      // NodeRegistry 注册类型
    case 'audio':
      return 'gen-video'      // 暂无独立 audio 节点，用 gen-video 承载
    case 'document':
      return 'novel-input'    // NodeRegistry 注册类型
    default:
      return 'sticky-note'    // 通用便签节点
  }
}

/** 根据素材类型推断资产库分类（与 assetLibrary.ts DEFAULT_CATEGORIES 对齐） */
export function inferAssetLibraryCategory(
  assetType: CloudAssetDragPayload['assetType']
): string {
  switch (assetType) {
    case 'image':
      return 'materials'
    case 'video':
      return 'videos'
    case 'audio':
      return 'audio'
    case 'document':
      return 'documents'
    default:
      return 'materials'
  }
}

/** 根据云素材类型推断批量生产板字段 */
export function inferProductionField(
  assetType: CloudAssetDragPayload['assetType']
): string {
  switch (assetType) {
    case 'image':
      return 'refImages'
    case 'audio':
      return 'refAudios'
    case 'video':
      return 'refVideos'
    default:
      return 'refImages'
  }
}
