import { useCallback } from 'react'
import { useAppStore } from '../store/useAppStore.ts'

const RECENT_PREVIEW_EVENT_TTL_MS = 2500
const MAX_OUTPUT_RESULTS_PER_NODE = 40
const recentPreviewEvents = new Map<string, number>()

export const useWorkflowExecutor = () => {
  const updatePreviewFromTask = useCallback(
    (
      taskId,
      url,
      contentType = 'image',
      sourceNodeIdOverride = null,
      mjImages = null,
      thumbUrl = null,
      localCacheMeta = null
    ) => {
      if (!url && (!mjImages || mjImages.length === 0)) return

      // Find the source node ID
      let sourceNodeId = sourceNodeIdOverride
      const historyItem = useAppStore.getState().history?.find((item) =>
        [item?.id, item?.taskId, item?.remoteTaskId, item?.localTaskId, item?.requestId]
          .filter(Boolean)
          .some((id) => String(id) === String(taskId))
      )
      if (!sourceNodeId) {
        sourceNodeId = historyItem?.sourceNodeId
      }
      if (!sourceNodeId) {
        console.warn('[updatePreviewFromTask] sourceNodeId not found for taskId:', taskId)
        return
      }

      const finalContent = url || (mjImages && mjImages.length > 0 ? mjImages[0] : url)
      const localCacheUrl =
        typeof localCacheMeta?.localCacheUrl === 'string' && localCacheMeta.localCacheUrl.trim()
          ? localCacheMeta.localCacheUrl.trim()
          : typeof localCacheMeta?.url === 'string' && localCacheMeta.url.trim()
            ? localCacheMeta.url.trim()
            : ''
      const localFilePath =
        typeof localCacheMeta?.localFilePath === 'string' && localCacheMeta.localFilePath.trim()
          ? localCacheMeta.localFilePath.trim()
          : typeof localCacheMeta?.path === 'string' && localCacheMeta.path.trim()
            ? localCacheMeta.path.trim()
            : ''
      const eventKey = `${sourceNodeId || ''}|${taskId || ''}|${contentType || ''}|${finalContent || ''}|${thumbUrl || ''}|${localCacheUrl || ''}|${localFilePath || ''}`
      const eventNow = Date.now()
      const previousEventAt = recentPreviewEvents.get(eventKey) || 0
      if (eventNow - previousEventAt < RECENT_PREVIEW_EVENT_TTL_MS) return
      recentPreviewEvents.set(eventKey, eventNow)
      for (const [key, timestamp] of recentPreviewEvents) {
        if (eventNow - timestamp > RECENT_PREVIEW_EVENT_TTL_MS) recentPreviewEvents.delete(key)
      }

      // Always read the LATEST state from the store (avoid stale closure)
      const state = useAppStore.getState()
      const sourceNode = state.nodesMap.get(sourceNodeId)
      if (!sourceNode) {
        return
      }

      // Only gen-image / gen-video nodes get outputResults
      if (sourceNode.type !== 'gen-image' && sourceNode.type !== 'gen-video') return

      const prevResults = sourceNode.settings?.outputResults || []
      const isPanorama =
        sourceNode.type === 'gen-image' && Boolean(sourceNode.settings?._isPanorama)

      const sourceMeta =
        historyItem?.sourceMeta || buildGenerationSourceMeta(sourceNode.settings) || null
      const resultMeta = {
        prompt: historyItem?.prompt || null,
        modelName: historyItem?.modelName || (historyItem?.apiConfig as any)?.modelName || null,
        apiConfig: historyItem?.apiConfig || null,
        width: historyItem?.width || null,
        height: historyItem?.height || null,
        durationMs: historyItem?.durationMs || null,
        requestId: historyItem?.requestId || historyItem?.id || taskId,
        taskId: historyItem?.taskId || historyItem?.remoteTaskId || taskId,
        remoteTaskId: historyItem?.remoteTaskId || null
      }
      const resultIds = new Set(
        [taskId, resultMeta.requestId, resultMeta.taskId, resultMeta.remoteTaskId]
          .filter(Boolean)
          .map(String)
      )
      const existingIdx = prevResults.findIndex((r) =>
        [r?.id, r?.taskId, r?.remoteTaskId, r?.requestId].some((id) => id && resultIds.has(String(id)))
      )

      let updatedResults
      let resultsChanged = false
      if (existingIdx >= 0) {
        updatedResults = prevResults.map((r, i) => {
          if (i !== existingIdx) return r
          const nextResult = {
            ...r,
            url: finalContent,
            thumbUrl: thumbUrl || r.thumbUrl,
            localCacheUrl: localCacheUrl || r.localCacheUrl,
            localFilePath: localFilePath || r.localFilePath,
            status: 'completed',
            progress: 100,
            isGenerating: false,
            error: null,
            errorMsg: null,
            isPanorama: r.isPanorama ?? isPanorama,
            sourceNodeId,
            sourceMeta: r.sourceMeta || sourceMeta,
            ...resultMeta
          }
          if (isSamePreviewResult(r, nextResult)) return r
          resultsChanged = true
          return nextResult
        })
      } else {
        resultsChanged = true
        updatedResults = [
          ...prevResults,
          {
            id: taskId,
            url: finalContent,
            thumbUrl: thumbUrl || null,
            localCacheUrl: localCacheUrl || null,
            localFilePath: localFilePath || null,
            type: contentType,
            status: 'completed',
            progress: 100,
            isGenerating: false,
            mjImages: mjImages || null,
            time: Date.now(),
            isPanorama,
            sourceNodeId,
            sourceMeta,
            ...resultMeta
          }
        ]
      }

      if (!resultsChanged) return

      if (updatedResults.length > MAX_OUTPUT_RESULTS_PER_NODE) {
        updatedResults = updatedResults.slice(-MAX_OUTPUT_RESULTS_PER_NODE)
      }

      console.log(
        '[updatePreviewFromTask] updating node',
        sourceNodeId,
        'with',
        updatedResults.length,
        'results'
      )
      state.updateNodeSettingsById(sourceNodeId, { outputResults: updatedResults })
    },
    []
  )

  return { updatePreviewFromTask }
}

function isSamePreviewResult(prev: any, next: any) {
  const keys = [
    'url',
    'thumbUrl',
    'localCacheUrl',
    'localFilePath',
    'type',
    'status',
    'progress',
    'isGenerating',
    'error',
    'errorMsg',
    'isPanorama',
    'sourceNodeId',
    'id',
    'requestId',
    'taskId',
    'remoteTaskId'
  ]
  return keys.every((key) => prev?.[key] === next?.[key])
}

function buildGenerationSourceMeta(settings: any = {}) {
  if (settings.sourceMeta && typeof settings.sourceMeta === 'object') {
    return {
      ...settings.sourceMeta,
      cloudProjectId: settings.sourceMeta.cloudProjectId || settings.cloudProjectId || null,
      cloudEpisodeId: settings.sourceMeta.cloudEpisodeId || settings.cloudEpisodeId || null,
      cloudShotId: settings.sourceMeta.cloudShotId || settings.cloudShotId || settings.sourceMeta.shotId || null,
      cloudAssignmentId: settings.sourceMeta.cloudAssignmentId || settings.cloudAssignmentId || null
    }
  }

  if (settings.cloudProjectId || settings.cloudEpisodeId || settings.cloudShotId || settings.cloudAssignmentId) {
    return {
      source: settings.source || 'cloud-assets',
      sourceType: settings.sourceType || 'storyboard-shot',
      projectId: settings.projectId || settings.cloudProjectId || null,
      episodeId: settings.episodeId || settings.cloudEpisodeId || null,
      shotId: settings.shotId || settings.cloudShotId || null,
      shotNumber: settings.shotNumber || null,
      episodeTitle: settings.episodeTitle || null,
      sceneTitle: settings.sceneTitle || null,
      characters: settings.characters || [],
      props: settings.props || [],
      cameraAngle: settings.cameraAngle || null,
      cameraMovement: settings.cameraMovement || null,
      cloudProjectId: settings.cloudProjectId || null,
      cloudEpisodeId: settings.cloudEpisodeId || null,
      cloudShotId: settings.cloudShotId || settings.shotId || null,
      cloudAssignmentId: settings.cloudAssignmentId || null
    }
  }

  if (settings.source !== 'writing-studio' || settings.sourceType !== 'storyboard-shot') {
    return null
  }

  return {
    source: settings.source,
    sourceType: settings.sourceType,
    projectId: settings.projectId,
    episodeId: settings.episodeId,
    sceneId: settings.sceneId,
    shotId: settings.shotId,
    shotNumber: settings.shotNumber,
    episodeTitle: settings.episodeTitle,
    sceneTitle: settings.sceneTitle,
    characters: settings.characters,
    props: settings.props,
    cameraAngle: settings.cameraAngle,
    cameraMovement: settings.cameraMovement
  }
}
