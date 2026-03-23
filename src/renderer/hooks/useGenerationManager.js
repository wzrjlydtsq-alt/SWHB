import React, { useCallback, useRef } from 'react'

import { DEFAULT_BASE_URL, getModelParams, calculateResolution } from '../utils/constants.js'
import { blobToDataURL } from '../utils/dataHelpers.js'
import { getXingheMediaSrc } from '../utils/fileHelpers.js'

export function useGenerationManager({
  nodes,
  setNodes,
  connections,
  nodesMap,
  setHistory,
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
  const startGenerationInternal = async (prompt, type, sourceImages, nodeId, options = {}) => {
    const batchSize = options.batchSize || 1
    if (batchSize > 1) {
      console.log(`[Batch Generation] Starting batch of ${batchSize} tasks`)
      for (let i = 0; i < batchSize; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 1000))
        await startGenerationInternal(prompt, type, sourceImages, nodeId, {
          ...options,
          batchSize: 1
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
      alert('Please enter a prompt or connect a reference image/video')
      return
    }

    let node = null
    if (nodeId && !nodeId.startsWith('storyboard-')) {
      node = nodesMap.get(nodeId) || null
    }

    // Resolve API Configs
    let modelId =
      options.model || node?.settings?.model || (type === 'image' ? 'nano-banana' : 'sora-2')

    // Handle legacy saved model IDs
    if (modelId === 'google-veo3.1') modelId = 'veo3.1'
    if (modelId === 'google-veo3') modelId = 'veo3.1-components'

    const config = apiConfigsMap.get(modelId)
    const globalApiKey =
      type === 'video' ? videoApiKey : type === 'image' ? imageApiKey : chatApiKey
    const globalApiUrl =
      type === 'video' ? videoApiUrl : type === 'image' ? imageApiUrl : chatApiUrl
    const apiKey = config?.key || globalApiKey
    const baseUrl = (config?.url || globalApiUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')

    if (!apiKey) {
      alert('Please configure API Key in settings first')
      setSettingsOpen(true)
      return
    }

    // Calculate dimensions
    let ratio =
      options.ratio || node?.settings?.ratio || (modelId.includes('grok') ? '3:2' : '1:1')
    let resolution =
      options.resolution ||
      node?.settings?.resolution ||
      (modelId.includes('grok') ? '1080P' : 'Auto')
    let duration = options.duration
      ? String(options.duration).replace('s', '')
      : node?.settings?.duration?.replace('s', '') || '5'

    let { sizeStr, w, h } = getModelParams(modelId, ratio, resolution) || {}
    if (!w || !h) {
      const def = calculateResolution(ratio, resolution)
      w = def.w
      h = def.h
      sizeStr = def.str
    }

    const actualSourceNodeId = node?.id || nodeId || null
    const getModelDisplayName = () => {
      if (modelId.includes('jimeng')) return config?.modelName || modelId
      return config?.provider || modelId
    }

    // Capture exact time for history
    const historyTaskId = `hist_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`

    // Seed history state immediately
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
        remoteTaskId: null,
        apiConfig: { modelId, baseUrl, apiKey },
        sourceNodeId: actualSourceNodeId,
        startTime: Date.now(),
        durationMs: null,
        ratio: ratio
      },
      ...prev
    ])

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
      // Bundle images — 串行处理避免大量 base64 同时驻留内存(OOM)
      let payloadConnectedImages = []
      for (const img of connectedImages) {
        if (
          (img.startsWith('http://') || img.startsWith('https://')) &&
          !img.includes('127.0.0.1') &&
          !img.includes('localhost')
        ) {
          payloadConnectedImages.push(img)
        } else if (img.startsWith('data:')) {
          payloadConnectedImages.push(img)
        } else if (img.startsWith('xinghe://') || img.startsWith('file://') || /^[A-Za-z]:[\\/]/.test(img)) {
          // 本地路径直接传给主进程处理,避免渲染进程做 base64
          payloadConnectedImages.push(img)
        } else {
          try {
            const fetchUrl = getXingheMediaSrc(img)
            const res = await fetch(fetchUrl)
            const b64 = await blobToDataURL(await res.blob())
            payloadConnectedImages.push(b64)
          } catch (err) {
            console.warn('[Generation] Failed to fetch and convert local image:', img, err)
            payloadConnectedImages.push(img)
          }
        }
      }

      // Bundle videos
      let payloadConnectedVideos = []
      if (connectedVideos.length > 0) {
        payloadConnectedVideos = await Promise.all(
          connectedVideos.map(async (vid) => {
            if (
              (vid.startsWith('http://') || vid.startsWith('https://')) &&
              !vid.includes('127.0.0.1') &&
              !vid.includes('localhost')
            ) {
              return vid
            }
            return vid
          })
        )
      }

      // Bundle audios
      let payloadConnectedAudios = []
      if (connectedAudios.length > 0) {
        payloadConnectedAudios = await Promise.all(
          connectedAudios.map(async (aud) => {
            if (
              (aud.startsWith('http://') || aud.startsWith('https://')) &&
              !aud.includes('127.0.0.1') &&
              !aud.includes('localhost')
            ) {
              return aud
            }
            return aud
          })
        )
      }

      // Submit execution to Main Process
      const response = await window.api.engineAPI.submitTask({
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
        generateAudio: options.generateAudio
      })

      if (!response || !response.success) {
        throw new Error(response?.error || 'IPC Engine Submit Failed')
      }
    } catch (err) {
      setHistory((p) =>
        p.map((hItem) =>
          hItem.id === historyTaskId
            ? { ...hItem, status: 'failed', errorMsg: err.message }
            : hItem
        )
      )
      const storyboardTask = storyboardTaskMapRef.current.get(historyTaskId)
      if (storyboardTask) {
        updateShot(storyboardTask.nodeId, storyboardTask.shotId, { status: 'draft' })
        storyboardTaskMapRef.current.delete(historyTaskId)
      }
    }
  }

  const startGeneration = useCallback(startGenerationInternal, [
    connections,
    nodesMap,
    chatApiKey,
    imageApiKey,
    videoApiKey,
    apiConfigsMap,
    setHistory,
    setNodes,
    updateShot,
    updatePreviewFromTask,
    getConnectedImageForInput,
    storyboardTaskMapRef,
    setSettingsOpen
  ])

  // --- Throttle refs for progress updates ---
  const nodeProgressThrottle = useRef(new Map())
  const historyProgressThrottle = useRef(new Map())

  // --- Engine UI Listener ---
  React.useEffect(() => {
    if (!window.api?.engineAPI?.onTaskUpdated) return
    const cleanup = window.api.engineAPI.onTaskUpdated((task) => {
      const targetId = task.payload?.historyTaskId || task.id
      const isTaskTerminal =
        task.status === 'completed' ||
        task.status === 'failed' ||
        task.status === 'cancelled'
      const hasResult = !!task.resultUrl

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

        setHistory((prev) =>
          prev.map((hItem) => {
            if (hItem.id === targetId) {
              const updated = { ...hItem, status: task.status, progress: task.progress }
              if (task.payload && !updated.originalPayload) {
                updated.originalPayload = task.payload
              }
              if (task.error) updated.errorMsg = task.error
              if (task.resultUrl) updated.url = task.resultUrl
              return updated
            }
            return hItem
          })
        )
      }

      // Sync progress and errors back to the source node so the canvas UI updates
      // Throttled: 500ms + progress change >=5%, uses findIndex for precise update
      if (task.payload?.nodeId) {
        const nid = task.payload.nodeId
        const isDone = task.status === 'completed'
        const isFailed = task.status === 'failed' || task.status === 'cancelled'
        const isTerminal = isDone || isFailed

        const lastUpdate = nodeProgressThrottle.current.get(nid) || 0
        const lastNodeProgress = nodeProgressThrottle.current.get(`${nid}_p`) || 0
        const now = Date.now()
        const nodeProgressChanged = Math.abs((task.progress || 0) - lastNodeProgress) >= 5

        if (isTerminal || (now - lastUpdate > 500 && nodeProgressChanged)) {
          nodeProgressThrottle.current.set(nid, now)
          nodeProgressThrottle.current.set(`${nid}_p`, task.progress || 0)
          setNodes((prevNodes) => {
            const idx = prevNodes.findIndex((n) => n.id === nid)
            if (idx === -1) return prevNodes
            const node = prevNodes[idx]
            const prevSett = node.settings || {}
            const updated = [...prevNodes]
            updated[idx] = {
              ...node,
              settings: {
                ...prevSett,
                progress: task.progress || prevSett.progress,
                isGenerating: !isTerminal,
                error: isFailed ? task.error || 'Task failed' : null
              }
            }
            return updated
          })
          if (isTerminal) {
            nodeProgressThrottle.current.delete(nid)
            nodeProgressThrottle.current.delete(`${nid}_p`)
          }
        }
      }

      // Automatically pop images into React Flow preview when completed
      if (task.status === 'completed' && task.resultUrl && task.payload?.nodeId) {
        const completedTargetId = task.payload?.historyTaskId || task.id

        // Immediately show the remote URL so the user isn't kept waiting
        updatePreviewFromTask(
          completedTargetId,
          task.resultUrl,
          task.payload.type,
          task.payload.nodeId
        )

        // Then silently download to local cache
        if (window.api?.invoke) {
          window.api
            .invoke('cache:download-url', {
              url: task.resultUrl,
              id: completedTargetId,
              type: task.payload.type
            })
            .then((res) => {
              if (res?.success && res.url) {
                setHistory((prev) =>
                  prev.map((hItem) =>
                    hItem.id === completedTargetId ? { ...hItem, url: res.url } : hItem
                  )
                )
                const thumbUrl = res.thumbPath
                  ? `xinghe://local/?path=${encodeURIComponent(res.thumbPath)}`
                  : null
                updatePreviewFromTask(
                  completedTargetId,
                  res.url,
                  task.payload.type,
                  task.payload.nodeId,
                  null,
                  thumbUrl
                )
              }
            })
            .catch((err) => {
              console.error('[Download cache] Failed to auto-download result:', err)
            })
        }
      }
    })
    return cleanup
  }, [setHistory, updatePreviewFromTask])

  return {
    startGeneration
  }
}
