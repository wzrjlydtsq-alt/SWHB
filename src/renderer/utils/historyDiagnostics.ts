import { friendlyError } from './friendlyError.ts'

export function sanitizeDiagnosticValue(value, key = '') {
  const lowerKey = String(key || '').toLowerCase()
  if (lowerKey.includes('apikey') || lowerKey === 'api_key' || lowerKey === 'authorization') {
    return value ? '[REDACTED]' : value
  }

  if (typeof value === 'string') {
    if (value.startsWith('data:')) {
      const separatorIndex = value.indexOf(';')
      const mime = separatorIndex > 5 ? value.slice(5, separatorIndex) : 'unknown'
      return `[DATA_URL ${mime} length=${value.length}]`
    }
    return value
  }

  if (Array.isArray(value)) return value.map((item) => sanitizeDiagnosticValue(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        sanitizeDiagnosticValue(childValue, childKey)
      ])
    )
  }

  return value
}

const promptSummary = (value: any) => {
  const text = String(value || '')
  return {
    preview: text.length > 160 ? `${text.slice(0, 160)}...` : text,
    length: text.length
  }
}

const summarizeDiagnosticPayload = (payload: any = {}) => {
  const sanitized = sanitizeDiagnosticValue(payload || {})
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) return sanitized
  const { prompt, ...rest } = sanitized as Record<string, any>
  return {
    ...rest,
    prompt: promptSummary(prompt)
  }
}

const getDiagnosticKind = (item: any) => {
  if (item?.status === 'completed') return 'xinghe_completed_generation_task'
  if (item?.status === 'generating') return 'xinghe_running_generation_task'
  if (item?.status === 'cancelled') return 'xinghe_cancelled_generation_task'
  return 'xinghe_failed_generation_task'
}

export function buildGenerationTaskDebugCode(item: any) {
  const rawError = item.rawErrorMsg || item.error || item.errorMsg || null
  const baseUrl = item.apiConfig?.baseUrl || item.originalPayload?.baseUrl || ''
  const requestPath = item.type === 'video' ? '/v1/videos/generations' : '/v1/images/generations'
  const endpoint = baseUrl ? `${String(baseUrl).replace(/\/+$/, '')}${requestPath}` : null
  const submittedPayload = sanitizeDiagnosticValue(item.originalPayload || {})
  const prompt = item.prompt || item.originalPayload?.prompt || ''

  return JSON.stringify(
    {
      kind: getDiagnosticKind(item),
      diagnosticVersion: 2,
      copiedAt: new Date().toISOString(),
      ids: {
        historyId: item.id || null,
        requestId: item.requestId || null,
        taskId: item.taskId || null,
        localTaskId: item.localTaskId || null,
        remoteTaskId: item.remoteTaskId || null
      },
      status: item.status || null,
      type: item.type || null,
      model: {
        displayName: item.modelName || null,
        modelId: item.apiConfig?.modelId || item.originalPayload?.modelId || null,
        configName: item.originalPayload?.configName || null,
        baseUrl: baseUrl || null
      },
      request: {
        endpoint,
        method: 'POST',
        submittedPayload,
        actualPayload: sanitizeDiagnosticValue(item.requestDebug || null)
      },
      generation: {
        prompt: promptSummary(prompt),
        ratio: item.ratio || item.originalPayload?.ratio || null,
        resolution: item.resolution || item.originalPayload?.resolution || null,
        width: item.width || item.originalPayload?.w || null,
        height: item.height || item.originalPayload?.h || null,
        duration: item.originalPayload?.duration || null,
        durationMs: item.durationMs || null,
        progress: item.progress ?? null,
        time: item.time || null,
        startTime: item.startTime || null
      },
      error: {
        raw: rawError,
        friendly: friendlyError(rawError || item.errorMsg || '生成失败'),
        display: item.errorMsg || null
      },
      source: {
        sourceNodeId: item.sourceNodeId || item.originalPayload?.nodeId || null,
        sourceMeta: sanitizeDiagnosticValue(item.sourceMeta || null)
      },
      cache: {
        status: item.cacheStatus || null,
        localCacheUrl: item.localCacheUrl || null,
        localFilePath: item.localFilePath || null,
        error: item.cacheError || null
      },
      apiConfig: sanitizeDiagnosticValue(item.apiConfig || {}),
      originalPayload: summarizeDiagnosticPayload(item.originalPayload || {})
    },
    null,
    2
  )
}

export function buildFailedTaskDebugCode(item: any) {
  return buildGenerationTaskDebugCode(item)
}
