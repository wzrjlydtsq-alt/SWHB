import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] 组件渲染崩溃:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: '#09090b',
            color: '#f4f4f5',
            fontFamily: 'system-ui, sans-serif',
            padding: '40px'
          }}
        >
          <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>😵 渲染出错了</h1>
          <p
            style={{
              color: '#a1a1aa',
              marginBottom: '24px',
              maxWidth: '500px',
              textAlign: 'center'
            }}
          >
            应用遇到了意外错误。你的数据已自动保存，点击下方按钮重新加载。
          </p>
          <pre
            style={{
              background: '#18181b',
              padding: '16px',
              borderRadius: '8px',
              maxWidth: '600px',
              overflow: 'auto',
              fontSize: '12px',
              color: '#ef4444',
              marginBottom: '24px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}
          >
            {this.state.error?.message || '未知错误'}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 32px',
              background: 'var(--primary-color, #3b82f6)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            重新加载应用
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
