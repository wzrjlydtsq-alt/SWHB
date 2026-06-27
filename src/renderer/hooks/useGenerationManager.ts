import React, { useCallback, useRef } from 'react'

import {
  DEFAULT_BASE_URL,
  DEFAULT_GROUP_API_URLS,
  getModelParams,
  calculateResolution,
  normalizeSeedanceVideoRatio,
  normalizeSeedanceVideoResolution
} from '../utils/constants.ts'
import { friendlyError } from '../utils/friendlyError.ts'
import { withCurrentProjectTaskPayload } from '../utils/engineTaskPayload.ts'
import { withProjectCacheContext } from '../utils/projectCache.ts'
import { useAppStore } from '../store/useAppStore.ts'
import { isActiveGenerationStatus } from '../utils/generationStatus.ts'

const TASK_SUBMIT_TIMEOUT_MS = 30000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs)
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

function resolveGenerationSourceMeta(node: any, options: any = {}) {
  if (options?.sourceMeta && typeof options.sourceMeta === 'object') {
    return options.sourceMeta
  }

  const settings = node?.settings || {}
  if (settings.sourceMeta && typeof settings.sourceMeta === 'object') {
    return {
      ...settings.sourceMeta,
      cloudProjectId: settings.sourceMeta.cloudProjectId || settings.cloudProjectId || null,
      cloudEpisodeId: settings.sourceMeta.cloudEpisodeId || settings.cloudEpisodeId || null,
      cloudShotId:
        settings.sourceMeta.cloudShotId ||
        settings.cloudShotId ||
        settings.sourceMeta.shotId ||
        null,
      cloudAssignmentId: settings.sourceMeta.cloudAssignmentId || settings.cloudAssignmentId || null
    }
  }

  if (
    settings.cloudProjectId ||
    settings.cloudEpisodeId ||
    settings.cloudShotId ||
    settings.cloudAssignmentId
  ) {
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

  if (settings.source === 'writing-studio' && settings.sourceType === 'storyboard-shot') {
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

  return null
}

function isHttpBaseUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim())
}

function resolveBaseUrl(configUrl, groupApiUrl, type) {
  const fallback = DEFAULT_GROUP_API_URLS[type === 'image' ? 'Image' : 'Chat'] || DEFAULT_BASE_URL
  const candidates =
    type === 'video'
      ? [configUrl, groupApiUrl]
      : [configUrl, groupApiUrl, fallback, DEFAULT_BASE_URL]
  const selected = candidates.find(isHttpBaseUrl) || ''
  return selected.replace(/\/+$/, '')
}

function getTaskHistoryId(task) {
  return task?.payload?.historyTaskId || task?.id || task?.taskId || null
}

function flattenEngineStatus(status) {
  const state = status?.status || status
  return [
    ...(Array.isArray(state?.active) ? state.active : []),
    ...(Array.isArray(state?.waiting) ? state.waiting : []),
    ...(Array.isArray(state?.completed) ? state.completed : []),
    ...(Array.isArray(state?.failed) ? state.failed : [])
  ].filter(Boolean)
}

function getTaskIdentitySet(task) {
  return new Set(
    [getTaskHistoryId(task), task?.id, task?.taskId, task?.remoteTaskId]
      .filter(Boolean)
      .map((id) => String(id))
  )
}

function matchesTask(hItem, ids) {
  return [hItem?.id, hItem?.taskId, hItem?.remoteTaskId, hItem?.localTaskId]
    .filter(Boolean)
    .some((id) => ids.has(String(id)))
}

function shouldIgnoreTaskForProject(task, currentProjectId) {
  const taskProjectId = task?.payload?.projectId || task?.projectId || null
  return Boolean(taskProjectId && taskProjectId !== currentProjectId)
}

function getTaskCanvasMatch(state, task, ids) {
  const matchedHistory = state.history?.find((hItem) => matchesTask(hItem, ids))
  const nodeId =
    task?.payload?.nodeId ||
    matchedHistory?.sourceNodeId ||
    matchedHistory?.nodeId ||
    matchedHistory?.originalPayload?.nodeId ||
    null
  const nodeExists = !nodeId || Boolean(state.nodesMap?.has(nodeId))
  return { nodeId, nodeExists, matchedHistory }
}

function hasGeneratingHistoryForNode(state, nodeId) {
  if (!nodeId) return false
  const items = state.history || []
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    const sourceNodeId =
      item?.sourceNodeId || item?.nodeId || item?.payload?.nodeId || item?.originalPayload?.nodeId
    if (sourceNodeId !== nodeId) continue
    if (isActiveGenerationStatus(item.status)) return true
    if (item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled') {
      return false
    }
  }
  return false
}

function rememberCompletedCacheId(cacheIdsRef, id, maxSize = 500) {
  const key = String(id || '')
  if (!key) return
  cacheIdsRef.current.add(key)
  while (cacheIdsRef.current.size > maxSize) {
    const first = cacheIdsRef.current.values().next().value
    if (!first) break
    cacheIdsRef.current.delete(first)
  }
}

function cacheCompletedTaskResult(
  completedTargetId,
  resultUrl,
  type,
  nodeId,
  updatePreviewFromTask
) {
  const payload = withProjectCacheContext({
    url: resultUrl,
    id: completedTargetId,
    type
  })

  const downloadPromise =
    window.api?.localCacheAPI?.downloadUrl?.(payload) ||
    window.api?.invoke?.('cache:download-url', payload)

  if (!downloadPromise) return

  useAppStore
    .getState()
    .setHistory((prev) =>
      prev.map((hItem) =>
        hItem.id === completedTargetId
          ? { ...hItem, cacheStatus: 'pending', cacheError: null }
          : hItem
      )
    )

  downloadPromise
    .then((res) => {
      if (res?.success && res.url) {
        const state = useAppStore.getState()
        state.setHistory((prev) =>
          prev.map((hItem) =>
            hItem.id === completedTargetId
              ? {
                  ...hItem,
                  localCacheUrl: res.url,
                  localFilePath: res.path || res.filePath || hItem.localFilePath || null,
                  cacheStatus: 'completed',
                  cacheError: null
                }
              : hItem
          )
        )
        const thumbUrl = res.thumbPath
          ? `xinghe://local/?path=${encodeURIComponent(res.thumbPath)}`
          : null
        updatePreviewFromTask(completedTargetId, resultUrl, type, nodeId, null, thumbUrl, {
          localCacheUrl: res.url,
          localFilePath: res.path || res.filePath || null
        })
      } else {
        const rawError = res?.error || 'cache download failed'
        useAppStore
          .getState()
          .setHistory((prev) =>
            prev.map((hItem) =>
              hItem.id === completedTargetId
                ? { ...hItem, cacheStatus: 'failed', cacheError: rawError }
                : hItem
            )
          )
      }
    })
    .catch((err) => {
      console.warn('[Generation] Failed to cache completed result:', err)
      const rawError = err?.message || String(err)
      useAppStore
        .getState()
        .setHistory((prev) =>
          prev.map((hItem) =>
            hItem.id === completedTargetId
              ? { ...hItem, cacheStatus: 'failed', cacheError: rawError }
              : hItem
          )
        )
    })
}

export function useGenerationManager({
  storyboardTaskMapRef,
  updateShot,
  updatePreviewFromTask,
  chatApiKey,
  chatApiUrl,
  imageApiKey,
  imageApiUrl,
  videoApiKey,
  videoApiUrl,
  apiConfigsMap,
  setSettingsOpen,
  getConnectedImageForInput
}) {
  const startGenerationInternal = async (prompt, type, sourceImages, nodeId, options: any = {}) => {
    const batchSize = options.batchSize || 1
    if (batchSize > 1) {
      console.log(`[Batch Generation] Starting batch of ${batchSize} tasks`)
      for (let i = 0; i < batchSize; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 1000))
        await startGenerationInternal(prompt, type, sourceImages, nodeId, {
          ...options,
          batchSize: 1,
          allowNodeConcurrency: true
        })
      }
      return
    }

    const connectedImages = Array.isArray(sourceImages)
      ? sourceImages
      : sourceImages
        ? [sourceImages]
        : []
    const sourceImage = connectedImages.length > 0 ? connectedImages[0] : undefined

    const connectedVideos = Array.isArray(options.sourceVideos)
      ? options.sourceVideos
      : options.sourceVideos
        ? [options.sourceVideos]
        : []

    const connectedAudios = Array.isArray(options.sourceAudios)
      ? options.sourceAudios
      : options.sourceAudios
        ? [options.sourceAudios]
        : []

    if (!prompt && !sourceImage && connectedVideos.length === 0) {
      alert('请输入提示词，或连接参考图片/视频')
      return
    }

    let node = null
    if (nodeId && !nodeId.startsWith('storyboard-')) {
      const state = useAppStore.getState()
      node = state.nodesMap.get(nodeId) || null
    }

    // Resolve API Configs
    let modelId =
      options.model || node?.settings?.model || (type === 'image' ? 'nano-banana' : 'sora-2')

    // Handle legacy saved model IDs
    if (modelId === 'google-veo3.1') modelId = 'veo3.1'
    if (modelId === 'google-veo3') modelId = 'veo3.1-components'

    const setSubmitError = (message) => {
      if (node?.id || nodeId) {
        useAppStore.getState().updateNodeSettingsById(node?.id || nodeId, {
          isGenerating: false,
          status: 'failed',
          progress: 0,
          error: message
        })
      }
    }

    const config = apiConfigsMap.get(modelId)
    // ⚡ 优先级：模型自身 key/url → 分组默认 key/url → 全局兜底
    const groupApiKey = type === 'video' ? videoApiKey : type === 'image' ? imageApiKey : chatApiKey
    const groupApiUrl = type === 'video' ? videoApiUrl : type === 'image' ? imageApiUrl : chatApiUrl
    const apiKey = config?.key || groupApiKey
    const baseUrl = resolveBaseUrl(config?.url, groupApiUrl, type)

    if (!apiKey) {
      const message = '请先在设置中配置 API Key'
      setSubmitError(message)
      alert(message)
      setSettingsOpen(true)
      return
    }

    if (!baseUrl) {
      const message = '请先在设置中为当前视频模型填写 Base URL'
      setSubmitError(message)
      alert(message)
      setSettingsOpen(true)
      return
    }

    // Calculate dimensions
    let ratio = options.ratio || node?.settings?.ratio || (modelId.includes('grok') ? '3:2' : '1:1')
    let resolution =
      options.resolution ||
      node?.settings?.resolution ||
      (modelId.includes('grok') ? '1080P' : 'Auto')
    let duration = options.duration
      ? String(options.duration).replace('s', '')
      : node?.settings?.duration?.replace('s', '') || '5'
    const lowerModelId = String(modelId || '').toLowerCase()
    if (type === 'video' && lowerModelId.includes('seedance')) {
      ratio = normalizeSeedanceVideoRatio(ratio)
      resolution = normalizeSeedanceVideoResolution(resolution)
    }

    let { sizeStr, w, h } = getModelParams(modelId, ratio, resolution) || {}
    if (!w || !h) {
      const def = calculateResolution(ratio, resolution)
      w = def.w
      h = def.h
      sizeStr = def.str
    }

    const actualSourceNodeId = node?.id || nodeId || null
    if (
      actualSourceNodeId &&
      !options.allowNodeConcurrency &&
      hasGeneratingHistoryForNode(useAppStore.getState(), actualSourceNodeId)
    ) {
      console.warn('[Generation] Skipped duplicate generation for active node:', actualSourceNodeId)
      return
    }

    const getModelDisplayName = () => {
      return config?.modelName || config?.id || modelId
    }

    // Capture exact time for history
    const historyTaskId = `hist_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    const startedAt = Date.now()

    const sourceMeta = resolveGenerationSourceMeta(node, options)
    const payloadConnectedImages = connectedImages.filter(Boolean)
    const payloadConnectedVideos = connectedVideos.filter(Boolean)
    const payloadConnectedAudios = connectedAudios.filter(Boolean)
    const taskPayload = withCurrentProjectTaskPayload({
      nodeId: actualSourceNodeId,
      historyTaskId: historyTaskId,
      type,
      prompt,
      modelId,
      configName: config?.modelName || modelId,
      baseUrl,
      apiKey,
      ratio,
      resolution,
      sizeStr,
      w,
      h,
      duration,
      sourceImages: payloadConnectedImages,
      sourceVideos: payloadConnectedVideos,
      sourceAudios: payloadConnectedAudios,
      imageRoles: options.imageRoles,
      enableWebSearch: options.enableWebSearch,
      generateAudio: options.generateAudio,
      sourceMeta
    })

    // Seed history state immediately
    const state = useAppStore.getState()
    const setHistory = state.setHistory
    setHistory((prev) => [
      {
        id: historyTaskId,
        type,
        url: '',
        prompt: prompt || (sourceImage ? `Img2${type === 'image' ? 'Img' : 'Vid'}` : 'Untitled'),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'generating',
        progress: 0,
        modelName: getModelDisplayName(),
        width: w,
        height: h,
        requestId: historyTaskId,
        taskId: null,
        remoteTaskId: null,
        cacheStatus: 'idle',
        cacheError: null,
        apiConfig: { modelId, baseUrl, apiKey },
        originalPayload: taskPayload,
        sourceNodeId: actualSourceNodeId,
        sourceMeta,
        startTime: startedAt,
        submittedAt: startedAt,
        submitStatus: 'pending',
        durationMs: null,
        ratio: ratio
      },
      ...prev
    ])

    if (actualSourceNodeId && !actualSourceNodeId.startsWith('storyboard-')) {
      state.updateNodeSettingsById(actualSourceNodeId, {
        isGenerating: true,
        status: 'generating',
        progress: 0,
        error: null
      })
    }

    if (
      actualSourceNodeId &&
      actualSourceNodeId.startsWith('storyboard-') &&
      actualSourceNodeId.includes('-shot-')
    ) {
      const parts = actualSourceNodeId.split('-shot-')
      if (parts.length === 2) {
        storyboardTaskMapRef.current.set(historyTaskId, {
          nodeId: parts[0].replace('storyboard-', ''),
          shotId: parts[1]
        })
      }
    }

    try {
      // Submit execution to Main Process
      const response = await withTimeout(
        window.api.engineAPI.submitTask(taskPayload as any),
        TASK_SUBMIT_TIMEOUT_MS,
        '提交生成任务超时，请稍后重试'
      )

      if (!response || !response.success) {
        throw new Error(response?.error || 'IPC Engine Submit Failed')
      }

      const state = useAppStore.getState()
      state.setHistory((prev) =>
        prev.map((hItem) =>
          hItem.id === historyTaskId
            ? {
                ...hItem,
                taskId: response.taskId || hItem.taskId,
                localTaskId: response.taskId || hItem.localTaskId,
                submitStatus: 'submitted'
              }
            : hItem
        )
      )
    } catch (err) {
      const state = useAppStore.getState()
      const rawError = err?.message || String(err)
      const displayError = friendlyError(rawError)
      state.setHistory((p) =>
        p.map((hItem) =>
          hItem.id === historyTaskId
            ? {
                ...hItem,
                status: 'failed',
                submitStatus: 'failed',
                errorMsg: displayError,
                rawErrorMsg: rawError
              }
            : hItem
        )
      )
      if (actualSourceNodeId && !actualSourceNodeId.startsWith('storyboard-')) {
        state.updateNodeSettingsById(actualSourceNodeId, {
          isGenerating: false,
          status: 'failed',
          progress: 0,
          error: displayError
        })
      }
      const storyboardTask = storyboardTaskMapRef.current.get(historyTaskId)
      if (storyboardTask) {
        updateShot(storyboardTask.nodeId, storyboardTask.shotId, { status: 'draft' })
        storyboardTaskMapRef.current.delete(historyTaskId)
      }
    }
  }

  const startGeneration = useCallback(startGenerationInternal, [
    chatApiKey,
    chatApiUrl,
    imageApiKey,
    imageApiUrl,
    videoApiKey,
    videoApiUrl,
    apiConfigsMap,
    updateShot,
    updatePreviewFromTask,
    getConnectedImageForInput,
    storyboardTaskMapRef,
    setSettingsOpen
  ])

  // --- Throttle refs for progress updates ---
  const historyProgressThrottle = useRef(new Map())
  const completedCacheIdsRef = useRef(new Set())

  // --- Engine UI Listener ---
  React.useEffect(() => {
    if (!window.api?.engineAPI?.onTaskUpdated) return
    const cleanup = window.api.engineAPI.onTaskUpdated((task) => {
      const taskAny = task as any
      const targetId = task.payload?.historyTaskId || task.id
      const ids = getTaskIdentitySet(task)
      const state = useAppStore.getState()
      if (shouldIgnoreTaskForProject(task, state.currentProject?.id || null)) return
      const { nodeId, nodeExists, matchedHistory } = getTaskCanvasMatch(state, task, ids)
      if (!matchedHistory && !nodeExists) return

      const isTaskTerminal =
        task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled'
      const hasResult = !!task.resultUrl
      const taskDisplayError = task.error ? friendlyError(task.error) : null
      if (nodeId && nodeExists && !String(nodeId).startsWith('storyboard-')) {
        state.updateNodeSettingsById(nodeId, {
          isGenerating: !isTaskTerminal,
          status: task.status,
          progress: task.progress || 0,
          ...(taskDisplayError ? { error: taskDisplayError } : isTaskTerminal ? { error: null } : {})
        })
      }

      // Throttle history updates: only every 500ms + progress change >=5% unless terminal/has result
      const lastHU = historyProgressThrottle.current.get(targetId) || 0
      const lastHP = historyProgressThrottle.current.get(`${targetId}_p`) || 0
      const nowH = Date.now()
      const progressChanged = Math.abs((task.progress || 0) - lastHP) >= 5
      if (isTaskTerminal || hasResult || (nowH - lastHU > 500 && progressChanged)) {
        historyProgressThrottle.current.set(targetId, nowH)
        historyProgressThrottle.current.set(`${targetId}_p`, task.progress || 0)
        if (isTaskTerminal) {
          historyProgressThrottle.current.delete(targetId)
          historyProgressThrottle.current.delete(`${targetId}_p`)
        }

        ;(state.setHistory as any)((prev: any[]) =>
          prev.map((hItem: any) => {
            if (matchesTask(hItem, ids) || hItem.id === targetId) {
              const updated: any = { ...hItem, status: task.status, progress: task.progress }
              if (task.payload && !updated.originalPayload) {
                updated.originalPayload = task.payload
              }
              if (task.error) {
                updated.rawErrorMsg = task.error
                updated.errorMsg = taskDisplayError
              }
              if (task.resultUrl) {
                updated.url = task.resultUrl
                updated.resultUrl = task.resultUrl
              }
              if (isTaskTerminal && hItem.startTime && !updated.durationMs) {
                updated.durationMs = Date.now() - hItem.startTime
              }
              updated.requestId = taskAny.requestId || updated.requestId || task.id || targetId
              updated.taskId =
                task.taskId || taskAny.remoteTaskId || updated.taskId || task.id || targetId
              if (taskAny.remoteTaskId) updated.remoteTaskId = taskAny.remoteTaskId
              if (taskAny.requestDebug) updated.requestDebug = taskAny.requestDebug
              return isSameTaskHistoryItem(hItem, updated) ? hItem : updated
            }
            return hItem
          })
        )
      }

      // Automatically pop images into React Flow preview when completed
      if (task.status === 'completed' && task.resultUrl && nodeId && nodeExists) {
        const completedTargetId = matchedHistory?.id || task.payload?.historyTaskId || task.id
        const resultType = task.payload?.type || task.type

        // Immediately show the remote URL so the user isn't kept waiting
        updatePreviewFromTask(completedTargetId, task.resultUrl, resultType, nodeId)

        if (!completedCacheIdsRef.current.has(String(completedTargetId))) {
          rememberCompletedCacheId(completedCacheIdsRef, completedTargetId)
          cacheCompletedTaskResult(
            completedTargetId,
            task.resultUrl,
            resultType,
            nodeId,
            updatePreviewFromTask
          )
        }
      }
    })
    return cleanup
  }, [updatePreviewFromTask])

  React.useEffect(() => {
    if (!window.api?.engineAPI?.getStatus) return

    let stopped = false

    const syncEngineStatus = async () => {
      try {
        const response = await window.api.engineAPI.getStatus()
        if (stopped || !response?.success) return

        const tasks = flattenEngineStatus(response)
        if (tasks.length === 0) return

        for (const task of tasks) {
          const targetId = getTaskHistoryId(task)
          const ids = getTaskIdentitySet(task)
          if (ids.size === 0) continue

          const currentState = useAppStore.getState()
          if (shouldIgnoreTaskForProject(task, currentState.currentProject?.id || null)) continue
          const { nodeId, nodeExists, matchedHistory } = getTaskCanvasMatch(currentState, task, ids)
          if (!matchedHistory && !nodeExists) continue

          const historyId = matchedHistory?.id || task?.payload?.historyTaskId || targetId
          if (!historyId) continue

          const isTaskTerminal =
            task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled'
          const isFailed = task.status === 'failed' || task.status === 'cancelled'
          const taskDisplayError = task.error ? friendlyError(task.error) : null
          if (nodeId && nodeExists && !String(nodeId).startsWith('storyboard-')) {
            currentState.updateNodeSettingsById(nodeId, {
              isGenerating: !isTaskTerminal,
              status: task.status,
              progress: task.progress || 0,
              ...(taskDisplayError
                ? { error: taskDisplayError }
                : isTaskTerminal
                  ? { error: null }
                  : {})
            })
          }

          ;(currentState.setHistory as any)((prev: any[]) =>
            prev.map((hItem: any) => {
              if (!matchesTask(hItem, ids) && hItem.id !== historyId) return hItem
              const updated: any = {
                ...hItem,
                status: task.status,
                progress: task.progress
              }
              if (task.payload && !updated.originalPayload) updated.originalPayload = task.payload
              if (task.error) {
                updated.rawErrorMsg = task.error
                updated.errorMsg = taskDisplayError
              }
              if (task.resultUrl) {
                updated.url = task.resultUrl
                updated.resultUrl = task.resultUrl
              }
              if (isTaskTerminal && hItem.startTime && !updated.durationMs) {
                updated.durationMs = Date.now() - hItem.startTime
              }
              updated.requestId = task.requestId || updated.requestId || task.id || historyId
              updated.taskId =
                task.taskId || task.remoteTaskId || updated.taskId || task.id || historyId
              updated.localTaskId = task.id || updated.localTaskId
              if (task.remoteTaskId) updated.remoteTaskId = task.remoteTaskId
              if (task.requestDebug) updated.requestDebug = task.requestDebug
              return isSameTaskHistoryItem(hItem, updated) ? hItem : updated
            })
          )

          if (task.status === 'completed' && task.resultUrl && nodeId && nodeExists) {
            const resultType = task.payload?.type || task.type
            updatePreviewFromTask(historyId, task.resultUrl, resultType, nodeId)

            if (!completedCacheIdsRef.current.has(String(historyId))) {
              rememberCompletedCacheId(completedCacheIdsRef, historyId)
              cacheCompletedTaskResult(
                historyId,
                task.resultUrl,
                resultType,
                nodeId,
                updatePreviewFromTask
              )
            }
          }
        }
      } catch (err) {
        console.warn('[Generation] Failed to sync engine status:', err)
      }
    }

    syncEngineStatus()
    const timer = window.setInterval(syncEngineStatus, 10000)

    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [updatePreviewFromTask])

  return {
    startGeneration
  }
}

function isSameTaskHistoryItem(prev: any, next: any) {
  const keys = [
    'status',
    'progress',
    'url',
    'rawErrorMsg',
    'errorMsg',
    'durationMs',
    'requestId',
    'taskId',
    'localTaskId',
    'remoteTaskId',
    'resultUrl',
    'localCacheUrl',
    'localFilePath',
    'cacheStatus',
    'cacheError',
    'originalPayload',
    'requestDebug',
    'submittedAt',
    'submitStatus'
  ]
  return keys.every((key) => prev?.[key] === next?.[key])
}
