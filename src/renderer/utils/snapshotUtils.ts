import { useAppStore } from '../store/useAppStore.ts'
import { addAssetToLibrary } from './assetLibrary.ts'
import { withProjectCacheContext } from './projectCache.ts'

function makeSnapshotId(prefix = 'snapshot') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export async function copyDataUrlToClipboard(dataUrl) {
  const blob = await fetch(dataUrl).then((res) => res.blob())
  await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })])
}

export async function copyImagePathToClipboard(imagePath) {
  if (!imagePath) {
    throw new Error('Missing image path')
  }

  const result = (await window.api.invoke('clipboard:copy-image', {
    filePath: imagePath
  })) as { success?: boolean; error?: string }
  if (!result?.success) {
    throw new Error(result?.error || 'Failed to copy image to clipboard')
  }

  return result
}

export async function saveDataUrlToLocalCache(
  dataUrl,
  { idPrefix = 'snapshot', category = 'snapshot', ext = '.png', type = 'image' } = {}
) {
  const result = await window.api.localCacheAPI.saveCache(withProjectCacheContext({
    id: makeSnapshotId(idPrefix),
    content: dataUrl,
    category,
    ext,
    type
  }))

  if (!result?.success || !result.path) {
    throw new Error(
      (result as { success?: boolean; path?: string; error?: string })?.error ||
        'Failed to save snapshot to local cache'
    )
  }

  return result.path
}

export function findBestReferenceTargetNodeId(sourceNodeId) {
  const state = useAppStore.getState()
  const { connections, nodesMap } = state

  if (!sourceNodeId) return null

  const visited = new Set([sourceNodeId])
  const queue = [sourceNodeId]

  while (queue.length > 0) {
    const currentId = queue.shift()
    const outgoing = connections
      .filter((conn) => (conn.from || conn.source) === currentId)
      .map((conn) => conn.to || conn.target)
      .filter(Boolean)

    for (const nextId of outgoing) {
      if (visited.has(nextId)) continue
      visited.add(nextId)

      const node = nodesMap.get(nextId)
      if (node?.type === 'gen-image') {
        return nextId
      }

      queue.push(nextId)
    }
  }

  const sourceNode = nodesMap.get(sourceNodeId)
  return sourceNode?.type === 'gen-image' ? sourceNodeId : null
}

export async function addImagePathToReferenceNode(nodeId, imagePath) {
  const state = useAppStore.getState()
  const node = state.nodesMap.get(nodeId)

  if (!node) {
    return { success: false, error: `Target node not found: ${nodeId}` }
  }

  const currentManualImages = node.settings?.manualImages || []
  if (currentManualImages.includes(imagePath)) {
    return { success: true, nodeId, path: imagePath, alreadyExists: true }
  }

  const nextManualImages = [...currentManualImages, imagePath]
  const updatedNode = {
    ...node,
    settings: {
      ...node.settings,
      manualImages: nextManualImages
    }
  }

  state.updateNodeSettingsById(nodeId, { manualImages: nextManualImages })

  const projectId = state.currentProject?.id
  if (projectId && window.dbAPI?.nodes?.save) {
    await window.dbAPI.nodes.save(updatedNode, projectId)
  }

  return { success: true, nodeId, path: imagePath }
}

export async function addSnapshotToAssetLibrary({
  dataUrl,
  category = 'scenes',
  namePrefix = 'snapshot'
}) {
  const imagePath = await saveDataUrlToLocalCache(dataUrl, {
    idPrefix: namePrefix,
    category: 'snapshot',
    ext: '.png',
    type: 'image'
  })

  const saveResult = addAssetToLibrary({
    category,
    path: imagePath,
    name: `${namePrefix}_${Date.now()}.png`
  })

  if (saveResult?.success) {
    useAppStore.getState().setAssetLibraryOpen?.(true)
  }

  return {
    ...saveResult,
    path: imagePath
  }
}

export async function addSnapshotToReferenceImages({
  dataUrl,
  sourceNodeId,
  targetNodeId = null,
  namePrefix = 'snapshot'
}) {
  const resolvedTargetId = targetNodeId || findBestReferenceTargetNodeId(sourceNodeId)

  if (!resolvedTargetId) {
    const imagePath = await saveDataUrlToLocalCache(dataUrl, {
      idPrefix: namePrefix,
      category: 'snapshot',
      ext: '.png',
      type: 'image'
    })

    await copyImagePathToClipboard(imagePath)
    return {
      success: true,
      fallback: 'clipboard',
      error: null,
      path: imagePath
    }
  }

  const imagePath = await saveDataUrlToLocalCache(dataUrl, {
    idPrefix: namePrefix,
    category: 'snapshot',
    ext: '.png',
    type: 'image'
  })

  const result = await addImagePathToReferenceNode(resolvedTargetId, imagePath)
  return {
    ...result,
    targetNodeId: resolvedTargetId,
    path: imagePath
  }
}
