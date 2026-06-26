export const CLOUD_WRITING_SYNC_EVENT = 'cloud-writing:sync'

export type CloudWritingSyncDetail = {
  episodeId?: string
  assetId?: number
}

export function notifyCloudWritingSynced(detail: CloudWritingSyncDetail = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CLOUD_WRITING_SYNC_EVENT, { detail }))
}
