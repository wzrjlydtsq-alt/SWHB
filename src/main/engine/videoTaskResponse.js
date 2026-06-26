const SUCCESS_STATUSES = new Set(['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'FINISHED', 'DONE', 'COMPLETE'])
const FAILURE_STATUSES = new Set(['FAILED', 'FAILURE', 'ERROR', 'CANCELLED', 'CANCELED'])

function getPath(source, path) {
  return path.reduce((value, key) => (value == null ? undefined : value[key]), source)
}

function normalizeStatusValue(value) {
  return String(value || '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase()
}

function valueToUrl(value) {
  if (!value) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return /^https?:\/\//i.test(trimmed) ? trimmed : null
  }
  if (typeof value === 'object') {
    return valueToUrl(value.url || value.video_url || value.download_url || value.result_url)
  }
  return null
}

export function extractVideoTaskStatus(data) {
  const candidates = [
    ['data', 'status'],
    ['data', 'data', 'status'],
    ['status'],
    ['task_status'],
    ['data', 'task_status'],
    ['data', 'data', 'task_status'],
    ['output', 'task_status'],
    ['data', 'output', 'task_status'],
    ['result', 'status'],
    ['data', 'result', 'status'],
    ['metadata', 'status'],
    ['data', 'metadata', 'status']
  ]

  for (const path of candidates) {
    const normalized = normalizeStatusValue(getPath(data, path))
    if (normalized) return normalized
  }

  return ''
}

export function isVideoTaskSuccess(status) {
  return SUCCESS_STATUSES.has(normalizeStatusValue(status))
}

export function isVideoTaskFailure(status) {
  return FAILURE_STATUSES.has(normalizeStatusValue(status))
}

function valueToMessage(value) {
  if (!value) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed && !/^https?:\/\//i.test(trimmed) ? trimmed : null
  }
  if (typeof value === 'object') {
    return valueToMessage(value.message || value.msg || value.code || value.error)
  }
  return String(value)
}

export function extractVideoTaskError(data) {
  const candidates = [
    ['data', 'fail_reason'],
    ['data', 'data', 'fail_reason'],
    ['fail_reason'],
    ['error', 'message'],
    ['error', 'code'],
    ['data', 'error', 'message'],
    ['data', 'error', 'code'],
    ['data', 'data', 'error', 'message'],
    ['data', 'data', 'error', 'code'],
    ['message'],
    ['msg'],
    ['data', 'message'],
    ['data', 'msg'],
    ['data', 'data', 'message'],
    ['data', 'data', 'msg'],
    ['output', 'message'],
    ['output', 'error'],
    ['data', 'output', 'message'],
    ['data', 'output', 'error']
  ]

  for (const path of candidates) {
    const message = valueToMessage(getPath(data, path))
    if (message) return message
  }

  return ''
}

export function isFatalVideoTaskErrorMessage(message) {
  return /quota|exhausted|insufficient|balance|billing|invalid.?api.?key|unauthori[sz]ed|forbidden|permission|invalid.?parameter|bad.?request|content.?policy|safety/i.test(
    String(message || '')
  )
}

export function extractVideoResultUrl(data) {
  const candidates = [
    ['metadata', 'url'],
    ['metadata', 'video_url'],
    ['content', 'video_url'],
    ['content', 'url'],
    ['data', 'content', 'video_url'],
    ['data', 'content', 'url'],
    ['data', 'data', 'content', 'video_url'],
    ['data', 'data', 'content', 'url'],
    ['data', 'video_url'],
    ['data', 'url'],
    ['data', 'download_url'],
    ['data', 'result_url'],
    ['data', 'output', 'video_url'],
    ['data', 'output', 'url'],
    ['data', 'output', 'download_url'],
    ['data', 'output'],
    ['result', 'video_url'],
    ['result', 'url'],
    ['result', 'download_url'],
    ['data', 'result', 'video_url'],
    ['data', 'result', 'url'],
    ['data', 'result', 'download_url'],
    ['data', 'data', 'result', 'video_url'],
    ['data', 'data', 'result', 'url'],
    ['data', 'data', 'result', 'download_url'],
    ['video_url'],
    ['url'],
    ['download_url'],
    ['result_url'],
    ['output', 'video_url'],
    ['output', 'url'],
    ['output', 'download_url'],
    ['output'],
    ['data', 'videos', 0, 'url'],
    ['data', 'videos', 0],
    ['videos', 0, 'url'],
    ['videos', 0],
    // Some legacy proxy records store the generated video URL in fail_reason on success.
    ['fail_reason'],
    ['data', 'fail_reason']
  ]

  for (const path of candidates) {
    const url = valueToUrl(getPath(data, path))
    if (url) return url
  }

  return null
}
