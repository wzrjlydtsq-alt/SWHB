/**
 * 星河智绘 — 渲染进程日志模块
 *
 * 轻量级日志封装：
 * - 开发环境：console 输出（带模块名 + 时间戳）
 * - error/warn 级别：通过 IPC 转发到主进程写入文件
 * - 生产环境：只输出 info 及以上级别
 *
 * 不依赖 electron-log（渲染进程不应直接引入 Node 模块）
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

// 生产环境构建时 electron-vite 的 esbuild 会移除 console.log/info
// 因此生产环境下只有 warn/error 会真正输出
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const IS_DEV =
  typeof (import.meta as any).env?.DEV !== 'undefined' ? (import.meta as any).env.DEV : true
const MIN_LEVEL: LogLevel = IS_DEV ? 'debug' : 'info'

/** 格式化时间戳 */
function timestamp(): string {
  const now = new Date()
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`
}

/** 日志颜色（仅开发环境 console 用） */
const LEVEL_STYLES: Record<LogLevel, string> = {
  debug: 'color: #6b7280',
  info: 'color: #3b82f6',
  warn: 'color: #f59e0b',
  error: 'color: #ef4444; font-weight: bold'
}

/**
 * 创建带模块前缀的 renderer logger
 * @example
 * const log = createLogger('CanvasFeature')
 * log.info('画布初始化完成')
 * log.error('渲染失败', error)
 */
export function createLogger(moduleName: string) {
  function shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[MIN_LEVEL]
  }

  function formatArgs(level: LogLevel, args: unknown[]): string {
    return `[${timestamp()}] [${level.toUpperCase()}] [${moduleName}] ${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}`
  }

  function log(level: LogLevel, ...args: unknown[]) {
    if (!shouldLog(level)) return

    const prefix = `%c[${timestamp()}] [${level.toUpperCase()}] [${moduleName}]`

    switch (level) {
      case 'debug':
        console.debug(prefix, LEVEL_STYLES[level], ...args)
        break
      case 'info':
        console.info(prefix, LEVEL_STYLES[level], ...args)
        break
      case 'warn':
        console.warn(prefix, LEVEL_STYLES[level], ...args)
        // warn 也转发到主进程
        forwardToMain(level, formatArgs(level, args))
        break
      case 'error':
        console.error(prefix, LEVEL_STYLES[level], ...args)
        // error 转发到主进程写入日志文件
        forwardToMain(level, formatArgs(level, args))
        break
    }
  }

  return {
    debug: (...args: unknown[]) => log('debug', ...args),
    info: (...args: unknown[]) => log('info', ...args),
    warn: (...args: unknown[]) => log('warn', ...args),
    error: (...args: unknown[]) => log('error', ...args)
  }
}

/**
 * 将日志转发到主进程（通过 IPC）
 * 仅转发 warn 和 error 级别，避免 IPC 过载
 */
function forwardToMain(level: string, message: string) {
  try {
    // 使用 preload 暴露的 api.invoke 发送日志
    if (window.api?.invoke) {
      window.api.invoke('renderer-log', { level, message }).catch(() => {
        // IPC 失败时静默忽略，避免循环错误
      })
    }
  } catch {
    // 静默失败
  }
}

/** 渲染进程默认 logger */
export const rendererLogger = createLogger('Renderer')

export default rendererLogger
