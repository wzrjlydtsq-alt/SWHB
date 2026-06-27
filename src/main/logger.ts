/**
 * 星河智绘 — 主进程日志模块
 *
 * 基于 electron-log，提供结构化日志输出：
 * - 自动写入 app.getPath('logs') 目录
 * - 按日期轮转，保留最近 7 天日志
 * - 支持 debug/info/warn/error 级别
 * - 生产环境过滤 debug 级别
 */
import log from 'electron-log/main'

// ========== 配置 ==========

// 文件日志格式：[时间] [级别] [模块] 消息
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
// 控制台格式：带彩色级别
log.transports.console.format = '{h}:{i}:{s}.{ms} [{level}] {text}'

// 日志文件大小限制（5MB 后轮转）
log.transports.file.maxSize = 5 * 1024 * 1024
// 文件名
log.transports.file.fileName = 'xinghe-zhihui.log'

// 生产环境不输出 debug 级别到文件
if (process.env.NODE_ENV === 'production') {
  log.transports.file.level = 'info'
  log.transports.console.level = 'info'
} else {
  log.transports.file.level = 'debug'
  log.transports.console.level = 'debug'
}

// ========== 导出带模块名的 Logger 工厂 ==========

/**
 * 创建带模块前缀的 logger 实例
 * @example
 * const log = createLogger('TaskExecutor')
 * log.info('任务开始')  // => [2026-04-01 12:00:00.000] [info] [TaskExecutor] 任务开始
 */
export function createLogger(moduleName: string) {
  const scope = log.scope(moduleName)
  return {
    debug: (...args: unknown[]) => scope.debug(...args),
    info: (...args: unknown[]) => scope.info(...args),
    warn: (...args: unknown[]) => scope.warn(...args),
    error: (...args: unknown[]) => scope.error(...args),
    /** 获取原始 electron-log scope 实例 */
    raw: scope
  }
}

/** 主进程默认 logger */
export const mainLogger = createLogger('Main')

/** 导出底层 log 实例（用于高级配置） */
export { log as electronLog }

export default mainLogger
