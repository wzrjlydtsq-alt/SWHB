/**
 * 星河智绘 — 渲染进程入口
 *
 * 三层错误处理集成点：
 * 1. 全局 window.onerror + unhandledrejection 捕获
 * 2. ErrorBoundary 包裹 React 树
 * 3. 各组件/服务内部使用 safeAsync 等工具
 */

// 轻量级 passive event listener 错误过滤
;(function () {
  const originalError = console.error
  console.error = function (...args) {
    if (typeof args[0] === 'string' && args[0].includes('passive event listener')) return
    originalError.apply(console, args)
  }
})()

import { createRoot } from 'react-dom/client'
import { createLogger } from './utils/logger.ts'
import toast from './utils/toast.ts'

import './styles/global.css'
import './styles/CanvasBoard.css'

import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import App from './App.tsx'
import { initDiagnostics, reportDiagnosticError, reportDiagnosticEvent } from './services/diagnostics.ts'

// ========== 全局异常捕获（第三层 - 系统级） ==========
const sysLog = createLogger('System')
initDiagnostics()

/** 全局未捕获错误 */
window.onerror = (message, source, lineno, colno, error) => {
  sysLog.error('未捕获错误:', message, `at ${source}:${lineno}:${colno}`)
  reportDiagnosticEvent({
    severity: 'error',
    event_type: 'renderer_window_error',
    source: 'window.onerror',
    message: typeof message === 'string' ? message : String(message),
    stack: error?.stack,
    context: { source, lineno, colno }
  })
  // 仅对非 React 渲染错误弹 toast（React 错误由 ErrorBoundary 处理）
  if (!(error as any)?.__reactError) {
    toast.error(`系统错误: ${typeof message === 'string' ? message.slice(0, 80) : '未知错误'}`)
  }
  return false // 不阻止原生错误输出
}

/** 未处理的 Promise rejection */
window.onunhandledrejection = (event) => {
  const reason = event.reason
  const message = reason?.message || String(reason)
  sysLog.error('未处理的 Promise 拒绝:', message)

  // 过滤已知的无害 rejection（如 ResizeObserver、AbortError）
  if (
    message.includes('ResizeObserver') ||
    message.includes('AbortError') ||
    message.includes('The user aborted')
  ) {
    return
  }

  reportDiagnosticError(reason, 'renderer_unhandled_rejection')
  toast.warn(`异步操作失败: ${message.slice(0, 80)}`)
}

/** 资源加载错误（图片、脚本等） */
const loggedResourceFailures = new Set<string>()
window.addEventListener(
  'error',
  (event) => {
    if (event.target && event.target !== window) {
      const el = event.target as HTMLImageElement | HTMLVideoElement | HTMLAudioElement
      const tag = el.tagName?.toLowerCase()
      if (tag === 'img' || tag === 'video' || tag === 'audio') {
        const src = el.src || el.currentSrc || ''
        const key = `${tag}:${src}`
        if (!loggedResourceFailures.has(key)) {
          loggedResourceFailures.add(key)
          if (loggedResourceFailures.size > 300) {
            loggedResourceFailures.clear()
          }
          // 媒体资源加载失败只记录一次，不弹 toast，避免失效缓存刷屏拖慢渲染。
          sysLog.warn(`资源加载失败: <${tag}> ${src || '(unknown)'}`)
        }
      }
    }
  },
  true // capture phase
)

// ========== React 渲染 ==========
const container = document.getElementById('root')
if (!window.__react_root) {
  window.__react_root = createRoot(container)
}
window.__react_root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)

export default App
