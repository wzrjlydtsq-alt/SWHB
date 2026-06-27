/**
 * 星河智绘 — 全局 Toast 通知系统
 *
 * 第一层错误处理：用户可见的即时反馈
 *
 * 使用方式：
 *   import { toast } from '../utils/toast'
 *   toast.success('保存成功')
 *   toast.error('API 请求失败')
 *   toast.warn('网络连接不稳定')
 *   toast.info('正在生成中...')
 */

/** Toast 类型 */
const TOAST_TYPES = {
  success: {
    icon: '✅',
    bg: 'linear-gradient(135deg, hsla(155, 45%, 18%, 0.92), hsla(160, 40%, 14%, 0.95))',
    border: 'hsla(155, 60%, 45%, 0.4)',
    color: 'hsla(155, 55%, 75%, 0.95)',
    glow: '0 0 20px hsla(155, 60%, 45%, 0.15)'
  },
  error: {
    icon: '❌',
    bg: 'linear-gradient(135deg, hsla(0, 45%, 18%, 0.92), hsla(0, 40%, 14%, 0.95))',
    border: 'hsla(0, 60%, 50%, 0.4)',
    color: 'hsla(0, 55%, 78%, 0.95)',
    glow: '0 0 20px hsla(0, 60%, 45%, 0.15)'
  },
  warn: {
    icon: '⚠️',
    bg: 'linear-gradient(135deg, hsla(40, 50%, 18%, 0.92), hsla(35, 45%, 14%, 0.95))',
    border: 'hsla(40, 65%, 50%, 0.4)',
    color: 'hsla(40, 55%, 78%, 0.95)',
    glow: '0 0 20px hsla(40, 60%, 45%, 0.15)'
  },
  info: {
    icon: 'ℹ️',
    bg: 'linear-gradient(135deg, hsla(210, 45%, 18%, 0.92), hsla(215, 40%, 14%, 0.95))',
    border: 'hsla(210, 60%, 50%, 0.4)',
    color: 'hsla(210, 55%, 78%, 0.95)',
    glow: '0 0 20px hsla(210, 60%, 45%, 0.15)'
  }
}

type ToastType = keyof typeof TOAST_TYPES

interface ToastData {
  el: HTMLDivElement
  progressBar: HTMLDivElement
  timer: ReturnType<typeof setTimeout> | null
}

/** 最大同时显示数 */
const MAX_TOASTS = 5
/** 默认持续时间 (ms) */
const DEFAULT_DURATION = 3500

/** 活跃的 toast 列表 */
let activeToasts: ToastData[] = []
/** 容器 DOM 元素 */
let containerEl: HTMLDivElement | null = null

/** 确保容器存在 */
function ensureContainer(): HTMLDivElement {
  if (containerEl && document.body.contains(containerEl)) return containerEl
  containerEl = document.createElement('div')
  containerEl.id = 'xh-toast-container'
  Object.assign(containerEl.style, {
    position: 'fixed',
    top: '16px',
    right: '16px',
    zIndex: '99999',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    pointerEvents: 'none',
    maxWidth: '380px',
    width: '100%'
  })
  document.body.appendChild(containerEl)
  return containerEl
}

/** 创建单个 toast DOM */
function createToastElement(type: ToastType, message: string, duration: number) {
  const config = TOAST_TYPES[type] || TOAST_TYPES.info

  const el = document.createElement('div')
  el.setAttribute('role', 'alert')
  el.setAttribute('aria-live', 'polite')
  Object.assign(el.style, {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px 16px',
    borderRadius: '10px',
    background: config.bg,
    border: `1px solid ${config.border}`,
    color: config.color,
    fontSize: '13px',
    fontFamily: "'Inter', 'Noto Sans SC', system-ui, sans-serif",
    lineHeight: '1.5',
    boxShadow: `${config.glow}, 0 8px 32px hsla(0, 0%, 0%, 0.4)`,
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    transform: 'translateX(120%)',
    opacity: '0',
    transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.35s ease',
    pointerEvents: 'auto',
    cursor: 'pointer',
    maxWidth: '100%',
    wordBreak: 'break-word'
  })

  // 图标
  const iconSpan = document.createElement('span')
  iconSpan.textContent = config.icon
  iconSpan.style.flexShrink = '0'
  iconSpan.style.fontSize = '15px'
  iconSpan.style.lineHeight = '1.4'
  el.appendChild(iconSpan)

  // 文本
  const textSpan = document.createElement('span')
  textSpan.textContent = message
  textSpan.style.flex = '1'
  el.appendChild(textSpan)

  // 进度条
  const progressBar = document.createElement('div')
  Object.assign(progressBar.style, {
    position: 'absolute',
    bottom: '0',
    left: '8px',
    right: '8px',
    height: '2px',
    borderRadius: '1px',
    background: config.border,
    transformOrigin: 'left',
    transform: 'scaleX(1)',
    transition: `transform ${duration}ms linear`,
    opacity: '0.6'
  })
  el.style.position = 'relative'
  el.appendChild(progressBar)

  return { el, progressBar }
}

/**
 * 显示 toast 通知
 * @param {'success'|'error'|'warn'|'info'} type
 * @param {string} message
 * @param {number} [duration=3500]
 */
function showToast(type: ToastType, message: string, duration = DEFAULT_DURATION) {
  const container = ensureContainer()

  // 超出上限时移除最早的
  while (activeToasts.length >= MAX_TOASTS) {
    const oldest = activeToasts.shift()
    if (oldest) dismissToast(oldest)
  }

  const { el, progressBar } = createToastElement(type, message, duration)
  container.appendChild(el)

  const toastData = { el, progressBar, timer: null }
  activeToasts.push(toastData)

  // 点击关闭
  el.addEventListener('click', () => dismissToast(toastData))

  // 入场动画
  requestAnimationFrame(() => {
    el.style.transform = 'translateX(0)'
    el.style.opacity = '1'
    // 启动进度条
    requestAnimationFrame(() => {
      progressBar.style.transform = 'scaleX(0)'
    })
  })

  // 自动消失
  toastData.timer = setTimeout(() => {
    dismissToast(toastData)
  }, duration)
}

/** 移除一个 toast */
function dismissToast(toastData: ToastData | undefined) {
  if (!toastData || !toastData.el) return
  clearTimeout(toastData.timer)

  toastData.el.style.transform = 'translateX(120%)'
  toastData.el.style.opacity = '0'

  setTimeout(() => {
    toastData.el.remove()
    activeToasts = activeToasts.filter((t) => t !== toastData)
  }, 350)
}

/** 清除所有 toast */
function clearAll() {
  ;[...activeToasts].forEach(dismissToast)
}

// ========== 导出 API ==========

export const toast = {
  success: (message: string, duration?: number) => showToast('success', message, duration),
  error: (message: string, duration?: number) => showToast('error', message, duration ?? 5000),
  warn: (message: string, duration?: number) => showToast('warn', message, duration),
  info: (message: string, duration?: number) => showToast('info', message, duration),
  clearAll
}

export default toast
