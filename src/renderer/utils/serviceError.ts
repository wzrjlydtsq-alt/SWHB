/**
 * 星河智绘 — 服务层错误处理
 *
 * 第二层错误处理：API/IPC 调用的统一封装
 *
 * 功能：
 * - 统一 try/catch 包装
 * - 自动重试（可配置次数和延迟）
 * - 错误分类（网络错误、超时、API 错误、IPC 错误）
 * - 结构化错误日志
 * - 自动 toast 通知用户
 */
import { createLogger } from './logger.ts'
import toast from './toast.ts'

const log = createLogger('ServiceError')

// ========== 错误分类 ==========

/** 应用错误基类 */
export class AppError extends Error {
  category: 'network' | 'timeout' | 'api' | 'ipc' | 'validation' | 'unknown'
  statusCode?: number
  originalError?: unknown
  context?: string

  constructor(message: string, options: Record<string, any> = {}) {
    super(message)
    this.name = 'AppError'
    /** @type {'network'|'timeout'|'api'|'ipc'|'validation'|'unknown'} */
    this.category = options.category || 'unknown'
    /** @type {number|undefined} */
    this.statusCode = options.statusCode
    /** @type {unknown} */
    this.originalError = options.originalError
    /** @type {string|undefined} */
    this.context = options.context
  }
}

/** 将原始错误分类 */
function classifyError(error: any, context?: string) {
  const msg = error?.message || String(error)

  // 网络错误
  if (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('Failed to fetch') ||
    msg.includes('ERR_NETWORK')
  ) {
    return new AppError(`网络连接失败: ${context || msg}`, {
      category: 'network',
      originalError: error,
      context
    })
  }

  // 超时
  if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('AbortError')) {
    return new AppError(`请求超时: ${context || msg}`, {
      category: 'timeout',
      originalError: error,
      context
    })
  }

  // API 状态码错误
  if (error?.status || error?.statusCode) {
    const code = error.status || error.statusCode
    return new AppError(`API 错误 (${code}): ${context || msg}`, {
      category: 'api',
      statusCode: code,
      originalError: error,
      context
    })
  }

  // IPC 错误
  if (msg.includes('IPC') || msg.includes('ipcRenderer') || msg.includes('invoke')) {
    return new AppError(`IPC 通信错误: ${context || msg}`, {
      category: 'ipc',
      originalError: error,
      context
    })
  }

  // 未知错误
  return new AppError(msg, {
    category: 'unknown',
    originalError: error,
    context
  })
}

// ========== 用户友好的错误消息 ==========

const USER_MESSAGES = {
  network: '网络连接失败，请检查网络设置',
  timeout: '请求超时，请稍后重试',
  api: 'API 服务异常',
  ipc: '系统内部通信异常',
  validation: '数据格式错误',
  unknown: '操作失败，请重试'
}

// ========== 核心 API ==========

/**
 * 安全执行异步操作，带错误处理和可选重试
 *
 * @template T
 * @param {() => Promise<T>} fn - 要执行的异步函数
 * @param {Object} [options]
 * @param {string} [options.context] - 操作上下文描述（用于日志）
 * @param {number} [options.retries=0] - 重试次数
 * @param {number} [options.retryDelay=1000] - 重试间隔 (ms)
 * @param {boolean} [options.silent=false] - 为 true 时不弹 toast
 * @param {T} [options.fallback] - 失败时的回退值
 * @returns {Promise<T>}
 */
export async function safeAsync(fn: any, options: Record<string, any> = {}) {
  const { context = '', retries = 0, retryDelay = 1000, silent = false, fallback } = options

  let lastError: unknown = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      const appError = classifyError(error, context)

      if (attempt < retries) {
        log.warn(
          `[${context}] 第 ${attempt + 1} 次尝试失败，${retryDelay}ms 后重试:`,
          appError.message
        )
        await new Promise((r) => setTimeout(r, retryDelay * (attempt + 1)))
      } else {
        // 最后一次失败
        log.error(`[${context}] 执行失败 (共尝试 ${attempt + 1} 次):`, appError.message)

        if (!silent) {
          const userMsg = context
            ? `${context}: ${USER_MESSAGES[appError.category]}`
            : USER_MESSAGES[appError.category]
          toast.error(userMsg)
        }
      }
    }
  }

  // 所有重试都失败
  if (fallback !== undefined) return fallback
  throw classifyError(lastError, context)
}

/**
 * 安全执行 IPC 调用
 * @template T
 * @param {string} channel - IPC 通道名
 * @param {unknown} [data] - 传递的数据
 * @param {Object} [options] - safeAsync 选项
 * @returns {Promise<T>}
 */
export async function safeIpc(channel: string, data?: unknown, options: Record<string, any> = {}) {
  return safeAsync(() => window.api.invoke(channel, data), {
    context: `IPC:${channel}`,
    ...options
  })
}

/**
 * 安全执行 fetch 请求
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {Object} [options] - safeAsync 选项
 * @returns {Promise<Response>}
 */
export async function safeFetch(url: string, init?: RequestInit, options: Record<string, any> = {}) {
  return safeAsync(
    async () => {
      const response = await fetch(url, init)
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as any
        error.status = response.status
        throw error
      }
      return response
    },
    {
      context: options.context || `Fetch:${new URL(url, 'http://localhost').pathname}`,
      retries: options.retries ?? 1,
      ...options
    }
  )
}

/**
 * 安全执行数据库操作
 * @template T
 * @param {() => Promise<T>} fn
 * @param {string} [context]
 * @returns {Promise<T|undefined>}
 */
export async function safeDb(fn: any, context = 'DB操作') {
  return safeAsync(fn, {
    context,
    retries: 1,
    retryDelay: 500,
    silent: true,
    fallback: undefined
  })
}
