import { request } from './cloud/cloudClient'
import { CLOUD_AUTH_CHANGE_EVENT, getCloudContext, getUserInfo, isLoggedIn } from './cloud/session'

const APP_VERSION = '2.0.12'
const PENDING_KEY = 'xh_diagnostics_pending_v1'
const DEVICE_KEY = 'xh_diagnostics_device_id'
const MAX_PENDING = 50
const MAX_MESSAGE = 2000
const MAX_STACK = 8000

type DiagnosticSeverity = 'info' | 'warn' | 'error' | 'fatal'

export type DiagnosticEventInput = {
  severity?: DiagnosticSeverity
  event_type: string
  source?: string
  component?: string
  message?: string
  stack?: string
  context?: Record<string, unknown>
}

let initialized = false
let flushing = false
let lastFingerprint = ''
let lastFingerprintAt = 0
let lastLongTaskReportAt = 0

function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return 'device_unknown'
  }
}

function redact(value?: string) {
  if (!value) return value
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/(api[_-]?key|access[_-]?key|secret|token|password)(["'=:\s]+)[^"',\s}]+/gi, '$1$2[redacted]')
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, 'sk-[redacted]')
    .replace(/AKIA[A-Z0-9]{16}/g, 'AKIA[redacted]')
}

function clamp(value: string | undefined, limit: number) {
  if (!value) return undefined
  return value.length > limit ? `${value.slice(0, limit)}...` : value
}

function normalize(input: DiagnosticEventInput) {
  const user = getUserInfo()
  const cloudContext = getCloudContext()
  return {
    severity: input.severity || 'error',
    event_type: input.event_type || 'renderer_error',
    source: input.source || 'renderer',
    component: input.component,
    message: clamp(redact(input.message), MAX_MESSAGE),
    stack: clamp(redact(input.stack), MAX_STACK),
    app_version: APP_VERSION,
    platform: `${navigator.platform || 'unknown'} / ${navigator.userAgent || ''}`.slice(0, 300),
    device_id: getDeviceId(),
    context: {
      route: location.hash || location.pathname,
      user_id: user?.id,
      user_name: user?.nickname || user?.phone || user?.email,
      team_id: cloudContext?.teamId,
      org_id: cloudContext?.orgId,
      ...input.context
    }
  }
}

function getPending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function setPending(items: unknown[]) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(items.slice(-MAX_PENDING)))
  } catch {
    /* ignore */
  }
}

function enqueue(event: unknown) {
  setPending([...getPending(), event])
}

async function postEvent(event: unknown) {
  if (!isLoggedIn()) {
    enqueue(event)
    return
  }
  await request('POST', '/diagnostics/events', event)
}

export async function reportDiagnosticEvent(input: DiagnosticEventInput) {
  const event = normalize(input)
  const fingerprint = `${event.event_type}|${event.component || ''}|${event.message || ''}|${String(event.stack || '').slice(0, 200)}`
  const now = Date.now()
  if (fingerprint === lastFingerprint && now - lastFingerprintAt < 10_000) return
  lastFingerprint = fingerprint
  lastFingerprintAt = now

  try {
    await postEvent(event)
  } catch {
    enqueue(event)
  }
}

export function reportDiagnosticError(
  error: unknown,
  event_type: string,
  context?: Record<string, unknown>
) {
  const err = error instanceof Error ? error : new Error(String(error))
  return reportDiagnosticEvent({
    severity: 'error',
    event_type,
    message: err.message,
    stack: err.stack,
    context
  })
}

export async function flushDiagnosticEvents() {
  if (flushing || !isLoggedIn()) return
  flushing = true
  try {
    const pending = getPending()
    setPending([])
    for (const event of pending) {
      try {
        await postEvent(event)
      } catch {
        enqueue(event)
        break
      }
    }

    let mainEvents: unknown
    try {
      mainEvents = await (window as any).api?.diagnosticsAPI?.drainMainEvents?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes("No handler registered for 'diagnostics:drain-main-events'")) {
        enqueue(
          normalize({
            severity: 'warn',
            event_type: 'diagnostics_drain_main_events_failed',
            source: 'renderer',
            message
          })
        )
      }
      return
    }
    if (Array.isArray(mainEvents)) {
      for (const event of mainEvents) {
        await reportDiagnosticEvent({
          severity: event.severity || 'fatal',
          event_type: event.event_type || 'main_process_error',
          source: event.source || 'electron-main',
          message: event.message,
          stack: event.stack,
          context: { ...(event.context || {}), main_created_at: event.created_at }
        })
      }
    }
  } finally {
    flushing = false
  }
}

export async function copyDiagnosticReportToClipboard() {
  const api = (window as any).api
  if (!api?.diagnosticsAPI?.createReport) {
    throw new Error('当前环境不支持生成诊断信息')
  }

  const report = await api.diagnosticsAPI.createReport()
  if (!report?.success || !report.text) {
    throw new Error(report?.error || '生成诊断信息失败')
  }

  if (api.windowAPI?.writeClipboardText) {
    const copied = await api.windowAPI.writeClipboardText(report.text)
    if (copied?.success === false) {
      throw new Error(copied.error || '复制到剪贴板失败')
    }
  } else if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(report.text)
  } else {
    throw new Error('当前环境不支持写入剪贴板')
  }

  return { length: report.text.length }
}

export function initDiagnostics() {
  if (initialized) return
  initialized = true
  try {
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const worst = entries.reduce((max, entry) => Math.max(max, entry.duration || 0), 0)
        const now = Date.now()
        if (worst < 1000 || now - lastLongTaskReportAt < 30_000) return
        lastLongTaskReportAt = now
        console.warn(`[diagnostics] Renderer long task: ${Math.round(worst)}ms`)
        void reportDiagnosticEvent({
          severity: 'warn',
          event_type: 'renderer_long_task',
          source: 'performance',
          message: `Renderer main thread blocked for ${Math.round(worst)}ms`,
          context: {
            duration_ms: Math.round(worst),
            visibility: document.visibilityState
          }
        })
      })
      observer.observe({ entryTypes: ['longtask'] })
    }
  } catch {
    /* PerformanceObserver longtask is best-effort. */
  }
  window.addEventListener(CLOUD_AUTH_CHANGE_EVENT, () => {
    flushDiagnosticEvents()
  })
  setTimeout(() => flushDiagnosticEvents(), 1500)
}
