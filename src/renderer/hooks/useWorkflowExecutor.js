import { useCallback } from 'react'
import { useAppStore } from '../store/useAppStore.js'

export const useWorkflowExecutor = ({ historyMap }) => {
  const updatePreviewFromTask = useCallback(
    (taskId, url, contentType = 'image', sourceNodeIdOverride = null, mjImages = null, thumbUrl = null) => {
      if (!url && (!mjImages || mjImages.length === 0)) return

      // Find the source node ID
      let sourceNodeId = sourceNodeIdOverride
      if (!sourceNodeId) {
        const historyItem = historyMap.get(taskId)
        sourceNodeId = historyItem?.sourceNodeId
      }
      if (!sourceNodeId) {
        console.warn('[updatePreviewFromTask] sourceNodeId not found for taskId:', taskId)
        return
      }

      const finalContent = url || (mjImages && mjImages.length > 0 ? mjImages[0] : url)

      // Always read the LATEST state from the store (avoid stale closure)
      const state = useAppStore.getState()
      const sourceNode = state.nodesMap.get(sourceNodeId)
      if (!sourceNode) {
        console.warn('[updatePreviewFromTask] node not in nodesMap:', sourceNodeId)
        return
      }

      // Only gen-image / gen-video nodes get outputResults
      if (sourceNode.type !== 'gen-image' && sourceNode.type !== 'gen-video') return

      const prevResults = sourceNode.settings?.outputResults || []
      const existingIdx = prevResults.findIndex((r) => r.id === taskId)

      let updatedResults
      if (existingIdx >= 0) {
        updatedResults = prevResults.map((r, i) =>
          i === existingIdx ? { ...r, url: finalContent, thumbUrl: thumbUrl || r.thumbUrl } : r
        )
      } else {
        updatedResults = [
          ...prevResults,
          {
            id: taskId,
            url: finalContent,
            thumbUrl: thumbUrl || null,
            type: contentType,
            mjImages: mjImages || null,
            time: Date.now()
          }
        ]
      }

      console.log('[updatePreviewFromTask] updating node', sourceNodeId, 'with', updatedResults.length, 'results')
      state.updateNodeSettingsById(sourceNodeId, { outputResults: updatedResults })
    },
    [historyMap]
  )

  return { updatePreviewFromTask }
}
