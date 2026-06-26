import { useEffect, useMemo, useRef, useState } from 'react'

import { useAppStore } from '../../../store/useAppStore'
import { PET_STATES, type PetState } from './petConfig'

export const PET_RADAR_EVENT = 'pet-task-radar:event'

const ACTIVE_STATUSES = new Set([
  'generating',
  'processing',
  'waiting',
  'pending',
  'queued',
  'running',
  'submitted'
])

const FAILED_STATUSES = new Set(['failed', 'cancelled', 'canceled'])

function normalizeStatus(status?: string) {
  return String(status || '').toLowerCase()
}

function getNodeId(item: any) {
  return item?.sourceNodeId || item?.nodeId || item?.payload?.nodeId || null
}

function getItemId(item: any) {
  return item?.id || item?.taskId || item?.remoteTaskId || item?.requestId || null
}

function isActiveOutputResult(result: any) {
  if (!result) return false
  const status = normalizeStatus(result.status)
  if (status === 'completed' || FAILED_STATUSES.has(status)) return false
  if (ACTIVE_STATUSES.has(status)) return true
  if (result.isGenerating === true) return true

  const progress = Number(result.progress)
  if (Number.isFinite(progress) && progress > 0 && progress < 100) return true

  return !result.url && !result.error && !result.errorMsg && (status || Number.isFinite(progress))
}

function getSelectedNodeIds(state: any) {
  const selected = state.selectedNodeIds
  if (selected instanceof Set) return Array.from(selected)
  if (Array.isArray(selected)) return selected
  return state.selectedNodeId ? [state.selectedNodeId] : []
}

function incMap(map: Map<string, number>, key: string, value = 1) {
  map.set(key, (map.get(key) || 0) + value)
}

function summarizeRadarState(state: any) {
  const activeIds = new Set<string>()
  const activeByNode = new Map<string, number>()
  const completedByNode = new Map<string, number>()
  const activeNodeIds = new Set<string>()
  let activeCount = 0
  let latestCompleted: any = null
  let latestFailed: any = null

  const history = Array.isArray(state.history) ? state.history.slice(0, 240) : []
  for (const item of history) {
    const nodeId = getNodeId(item)
    const status = normalizeStatus(item.status)
    if (!nodeId) continue

    if (ACTIVE_STATUSES.has(status)) {
      const id = getItemId(item)
      if (id) activeIds.add(String(id))
      activeCount += 1
      activeNodeIds.add(nodeId)
      incMap(activeByNode, nodeId)
      continue
    }

    if (status === 'completed') {
      incMap(completedByNode, nodeId)
      if (!latestCompleted) latestCompleted = item
      continue
    }

    if (FAILED_STATUSES.has(status) && !latestFailed) {
      latestFailed = item
    }
  }

  state.nodesMap?.forEach?.((node: any, nodeId: string) => {
    const results = Array.isArray(node?.settings?.outputResults)
      ? node.settings.outputResults.slice(0, 60)
      : []
    for (const result of results) {
      if (!isActiveOutputResult(result)) continue
      const id = getItemId(result)
      if (id && activeIds.has(String(id))) continue
      activeCount += 1
      activeNodeIds.add(nodeId)
      incMap(activeByNode, nodeId)
    }

    if (node?.settings?.isGenerating && !activeByNode.has(nodeId)) {
      activeCount += 1
      activeNodeIds.add(nodeId)
      incMap(activeByNode, nodeId)
    }
  })

  const selectedNodeIds = getSelectedNodeIds(state)
  const selectedActiveCount = selectedNodeIds.reduce(
    (sum, nodeId) => sum + (activeByNode.get(nodeId) || 0),
    0
  )

  const latestCompletedNodeId = getNodeId(latestCompleted)
  const latestCompletedCount = latestCompletedNodeId
    ? completedByNode.get(latestCompletedNodeId) || 1
    : 1

  return {
    activeCount,
    activeNodeIds: Array.from(activeNodeIds),
    selectedActiveCount,
    latestCompletedId: latestCompleted ? String(getItemId(latestCompleted) || '') : '',
    latestCompletedType: latestCompleted?.type || '',
    latestCompletedCount,
    latestFailedId: latestFailed ? String(getItemId(latestFailed) || '') : '',
    latestFailedError: latestFailed?.errorMsg || latestFailed?.error || ''
  }
}

function formatActiveMessage(stats: any) {
  const count = stats.selectedActiveCount || stats.activeCount
  if (stats.selectedActiveCount > 0 || stats.activeNodeIds.length === 1) {
    return `当前节点有 ${count} 个任务在跑`
  }
  return `画布上有 ${count} 个任务在跑`
}

function formatCompletedMessage(stats: any) {
  const unit = stats.latestCompletedType === 'video' ? '条' : '张'
  return `第 ${stats.latestCompletedCount || 1} ${unit}好了`
}

function getRadarSignature(stats: any) {
  return [
    stats.activeCount,
    stats.selectedActiveCount,
    stats.activeNodeIds.join(','),
    stats.latestCompletedId,
    stats.latestFailedId
  ].join('|')
}

export function usePetTaskRadar({ disabled = false } = {}) {
  const [notice, setNotice] = useState<any>(null)
  const timeoutRef = useRef<number | null>(null)
  const previousStatsRef = useRef<any>(null)

  const statsText = useAppStore((state) => JSON.stringify(summarizeRadarState(state)))
  const stats = useMemo(() => {
    try {
      return JSON.parse(statsText)
    } catch {
      return summarizeRadarState({})
    }
  }, [statsText])

  const pushNotice = (nextNotice: any, ttl = 4200) => {
    if (disabled) return
    setNotice({ id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, ...nextNotice })
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => setNotice(null), ttl)
  }

  useEffect(() => {
    const previous = previousStatsRef.current
    const signature = getRadarSignature(stats)
    const previousSignature = previous ? getRadarSignature(previous) : ''
    previousStatsRef.current = stats

    if (disabled || signature === previousSignature) return

    if (!previous) {
      if (stats.activeCount > 0) {
        pushNotice({ text: formatActiveMessage(stats), tone: 'generating', state: PET_STATES.GENERATING })
      }
      return
    }

    if (stats.latestFailedId && stats.latestFailedId !== previous.latestFailedId) {
      pushNotice({
        text: '这次失败了，点我看原因',
        detail: stats.latestFailedError,
        tone: 'error',
        state: PET_STATES.ERROR,
        action: 'openChat'
      }, 6200)
      return
    }

    if (stats.latestCompletedId && stats.latestCompletedId !== previous.latestCompletedId) {
      pushNotice({ text: formatCompletedMessage(stats), tone: 'success', state: PET_STATES.SUCCESS }, 3800)
      return
    }

    if (stats.activeCount > 0 && stats.activeCount !== previous.activeCount) {
      pushNotice({ text: formatActiveMessage(stats), tone: 'generating', state: PET_STATES.GENERATING })
    }
  }, [disabled, statsText])

  useEffect(() => {
    const handleRadarEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail || {}
      if (detail.type === 'cloudUploadStart') {
        pushNotice({ text: '正在上传云素材库', tone: 'cloud', state: PET_STATES.CLOUD_NOTICE })
      } else if (detail.type === 'cloudUploadSuccess') {
        pushNotice({ text: '云素材上传成功', tone: 'success', state: PET_STATES.SUCCESS })
      } else if (detail.type === 'cloudUploadFailed') {
        pushNotice({ text: '云素材上传失败，点我看原因', detail: detail.error, tone: 'error', state: PET_STATES.ERROR, action: 'openChat' }, 6200)
      } else if (detail.type === 'cloudSync') {
        pushNotice({ text: detail.message || '云同步有新内容', tone: 'cloud', state: PET_STATES.CLOUD_NOTICE })
      }
    }

    const handleDirectorNotice = (event: Event) => {
      const detail = (event as CustomEvent).detail || {}
      pushNotice({
        text: detail.message || '导演有新的审核通知',
        tone: 'cloud',
        state: PET_STATES.CLOUD_NOTICE,
        action: 'openCloud'
      }, 6200)
    }

    const handleCloudSync = () => {
      pushNotice({ text: '云同步文件夹有更新', tone: 'cloud', state: PET_STATES.CLOUD_NOTICE })
    }

    window.addEventListener(PET_RADAR_EVENT, handleRadarEvent)
    window.addEventListener('series-director-notification:created', handleDirectorNotice)
    window.addEventListener('cloud-writing:sync', handleCloudSync)
    return () => {
      window.removeEventListener(PET_RADAR_EVENT, handleRadarEvent)
      window.removeEventListener('series-director-notification:created', handleDirectorNotice)
      window.removeEventListener('cloud-writing:sync', handleCloudSync)
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    }
  }, [disabled])

  const stateOverride: PetState | null = notice?.state || (stats.activeCount > 0 ? PET_STATES.GENERATING : null)
  const badgeCount = stats.activeCount > 0 ? stats.activeCount : 0

  return {
    badgeCount,
    notice,
    stateOverride,
    clearNotice: () => setNotice(null),
    pushNotice
  }
}
