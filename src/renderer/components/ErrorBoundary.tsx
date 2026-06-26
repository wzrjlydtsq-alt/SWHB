/**
 * 星河智绘 — 增强版 ErrorBoundary
 *
 * 第三层错误处理：系统级崩溃恢复
 *
 * 功能：
 * - React 组件渲染错误捕获
 * - 错误详情展示（可折叠堆栈）
 * - 一键重新加载 / 重置状态
 * - 自动将崩溃日志转发到主进程文件
 * - 崩溃计数（连续崩溃 3 次以上提示清除缓存）
 */
import { Component } from 'react'
import { createLogger } from '../utils/logger.ts'
import { reportDiagnosticEvent } from '../services/diagnostics.ts'

const log = createLogger('ErrorBoundary')

/** 崩溃计数（当前会话） */
let crashCount = 0
const MAX_CRASHES_BEFORE_RESET = 3

export class ErrorBoundary extends Component<any, any> {
  constructor(props: any) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showStack: false
    }
  }

  static getDerivedStateFromError(error: any) {
    crashCount++
    return { hasError: true, error }
  }

  componentDidCatch(error: any, errorInfo: any) {
    try {
      error.__reactError = true
    } catch {}
    this.setState({ errorInfo })

    // 记录到渲染进程日志（自动转发到主进程文件）
    log.error('组件渲染崩溃:', error?.message || error)
    log.error('组件堆栈:', errorInfo?.componentStack || '无')

    // 尝试保存当前状态到 localStorage 作为崩溃快照
    try {
      const crashReport = {
        timestamp: new Date().toISOString(),
        error: error?.message || String(error),
        stack: error?.stack,
        componentStack: errorInfo?.componentStack,
        crashCount,
        url: window.location.href,
        userAgent: navigator.userAgent
      }
      localStorage.setItem('xh_last_crash', JSON.stringify(crashReport))
    } catch {
      // 静默忽略
    }

    reportDiagnosticEvent({
      severity: crashCount >= MAX_CRASHES_BEFORE_RESET ? 'fatal' : 'error',
      event_type: 'react_error_boundary',
      source: 'react',
      component: 'App',
      message: error?.message || String(error),
      stack: error?.stack,
      context: {
        componentStack: errorInfo?.componentStack,
        crashCount
      }
    })
  }

  handleReload = () => {
    window.location.reload()
  }

  handleResetAndReload = () => {
    try {
      // 清除可能导致崩溃的状态
      localStorage.removeItem('xh-app-store')
      sessionStorage.clear()
    } catch {
      // 静默
    }
    window.location.reload()
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showStack: false })
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const { error, errorInfo, showStack } = this.state
    const isRepeatedCrash = crashCount >= MAX_CRASHES_BEFORE_RESET

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#080c14',
          color: '#e4e4e7',
          fontFamily: "'Inter', 'Noto Sans SC', system-ui, sans-serif",
          padding: '40px',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* 背景装饰 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse 80% 60% at 50% 40%, hsla(0, 40%, 15%, 0.3) 0%, transparent 70%)',
            pointerEvents: 'none'
          }}
        />

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            maxWidth: '560px',
            width: '100%',
            textAlign: 'center'
          }}
        >
          {/* 标题 */}
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>
            {isRepeatedCrash ? '🔧' : '😵'}
          </div>
          <h1
            style={{
              fontSize: '22px',
              fontWeight: '600',
              marginBottom: '8px',
              color: 'hsla(0, 70%, 72%, 0.95)',
              letterSpacing: '0.05em'
            }}
          >
            {isRepeatedCrash ? '应用反复崩溃' : '渲染出错了'}
          </h1>
          <p
            style={{
              color: 'hsla(210, 15%, 65%, 0.8)',
              marginBottom: '24px',
              fontSize: '13px',
              lineHeight: '1.7'
            }}
          >
            {isRepeatedCrash
              ? '应用在本次会话中已崩溃多次，建议清除缓存后重新加载。你的项目数据已保存在数据库中。'
              : '应用遇到了意外错误。你的项目数据已自动保存，可以尝试重试或重新加载。'}
          </p>

          {/* 错误信息 */}
          <div
            style={{
              background: 'hsla(0, 30%, 12%, 0.6)',
              border: '1px solid hsla(0, 40%, 30%, 0.3)',
              borderRadius: '10px',
              padding: '14px 16px',
              marginBottom: '20px',
              textAlign: 'left'
            }}
          >
            <div
              style={{
                fontSize: '12px',
                color: 'hsla(0, 55%, 65%, 0.9)',
                fontFamily: "'Courier New', monospace",
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                maxHeight: showStack ? '300px' : '60px',
                overflow: 'auto',
                transition: 'max-height 0.3s ease'
              }}
            >
              {error?.message || '未知错误'}
              {showStack && error?.stack && (
                <>
                  {'\n\n'}
                  {error.stack}
                </>
              )}
              {showStack && errorInfo?.componentStack && (
                <>
                  {'\n\n--- Component Stack ---\n'}
                  {errorInfo.componentStack}
                </>
              )}
            </div>
            <button
              onClick={() => this.setState({ showStack: !showStack })}
              style={{
                marginTop: '8px',
                background: 'none',
                border: 'none',
                color: 'hsla(210, 40%, 60%, 0.7)',
                cursor: 'pointer',
                fontSize: '11px',
                padding: '2px 0'
              }}
            >
              {showStack ? '▲ 收起详情' : '▼ 展开详情'}
            </button>
          </div>

          {/* 操作按钮 */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {!isRepeatedCrash && (
              <button onClick={this.handleRetry} style={btnStyle('#3b82f6', '#2563eb')}>
                🔄 重试
              </button>
            )}
            <button onClick={this.handleReload} style={btnStyle('#6366f1', '#4f46e5')}>
              ↻ 重新加载
            </button>
            {isRepeatedCrash && (
              <button onClick={this.handleResetAndReload} style={btnStyle('#ef4444', '#dc2626')}>
                🗑️ 清除缓存并重载
              </button>
            )}
          </div>

          {/* 崩溃计数 */}
          {crashCount > 1 && (
            <p
              style={{
                marginTop: '16px',
                fontSize: '11px',
                color: 'hsla(210, 15%, 50%, 0.5)',
                fontFamily: "'Courier New', monospace"
              }}
            >
              本次会话崩溃次数: {crashCount}
            </p>
          )}
        </div>
      </div>
    )
  }
}

/** 按钮样式工厂 */
function btnStyle(bg, hover) {
  return {
    padding: '10px 24px',
    background: bg,
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    letterSpacing: '0.03em',
    transition: 'all 0.2s ease',
    boxShadow: `0 4px 14px ${bg}44`
  }
}
