const ACTIVE_HISTORY_STATUSES = new Set(['generating', 'waiting', 'processing', 'running', 'pending'])
const TERMINAL_HISTORY_STATUSES = new Set(['completed', 'failed', 'cancelled'])
const GENERATION_NODE_TYPES = new Set(['gen-image', 'gen-video'])

function getHistorySourceNodeId(item: any) {
  return (
    item?.sourceNodeId ||
    item?.nodeId ||
    item?.payload?.nodeId ||
    item?.originalPayload?.nodeId ||
    null
  )
}

function getHistoryError(item: any) {
  return item?.errorMsg || item?.rawErrorMsg || item?.error || null
}

function buildLatestHistoryByNode(history: any[] = []) {
  const latestByNode = new Map()
  for (const item of Array.isArray(history) ? history : []) {
    const nodeId = getHistorySourceNodeId(item)
    if (!nodeId || latestByNode.has(nodeId)) continue
    latestByNode.set(nodeId, item)
  }
  return latestByNode
}

function isGeneratingNodeState(settings: any = {}) {
  return (
    settings?.isGenerating === true ||
    ACTIVE_HISTORY_STATUSES.has(settings?.status) ||
    settings?.status === 'generating'
  )
}

function getStatusPatchFromHistory(settings: any = {}, latestHistory: any) {
  if (!latestHistory) {
    if (!isGeneratingNodeState(settings)) return null
    return {
      isGenerating: false,
      status: settings?.error ? 'failed' : 'idle',
      progress: settings?.error ? settings?.progress || 0 : 0
    }
  }

  const status = latestHistory.status
  if (ACTIVE_HISTORY_STATUSES.has(status)) {
    return {
      isGenerating: true,
      status,
      progress: latestHistory.progress || 0,
      error: null
    }
  }

  if (status === 'completed') {
    return {
      isGenerating: false,
      status: 'completed',
      progress: 100,
      error: null
    }
  }

  if (status === 'failed' || status === 'cancelled') {
    return {
      isGenerating: false,
      status,
      progress: latestHistory.progress || settings?.progress || 0,
      error: getHistoryError(latestHistory) || settings?.error || null
    }
  }

  if (isGeneratingNodeState(settings) && !TERMINAL_HISTORY_STATUSES.has(status)) {
    return {
      isGenerating: false,
      status: settings?.error ? 'failed' : 'idle',
      progress: settings?.error ? settings?.progress || 0 : 0
    }
  }

  return null
}

function doesPatchChange(settings: any = {}, patch: any = {}) {
  return Object.keys(patch).some((key) => settings?.[key] !== patch[key])
}

export function reconcileGenerationNodeStatus(nodes: any[] = [], history: any[] = []) {
  if (!Array.isArray(nodes) || nodes.length === 0) return nodes

  const latestByNode = buildLatestHistoryByNode(history)
  let changed = false
  const nextNodes = nodes.map((node) => {
    if (!GENERATION_NODE_TYPES.has(node?.type)) return node

    const settings = node?.settings || {}
    const patch = getStatusPatchFromHistory(settings, latestByNode.get(node.id))
    if (!patch || !doesPatchChange(settings, patch)) return node

    changed = true
    return {
      ...node,
      settings: {
        ...settings,
        ...patch
      }
    }
  })

  return changed ? nextNodes : nodes
}

export function isActiveGenerationStatus(status: any) {
  return ACTIVE_HISTORY_STATUSES.has(status)
}
