import { Component, type ReactNode } from 'react'
import { createLogger } from '../utils/logger.ts'
import { reportDiagnosticEvent } from '../services/diagnostics.ts'

const log = createLogger('FeatureErrorBoundary')

type Props = {
  name: string
  children: ReactNode
  fallback?: ReactNode
}

type State = {
  hasError: boolean
}

export class FeatureErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, errorInfo: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    log.error(`${this.props.name} crashed:`, message)
    log.error(`${this.props.name} component stack:`, errorInfo)
    reportDiagnosticEvent({
      severity: 'error',
      event_type: 'feature_error_boundary',
      source: 'react',
      component: this.props.name,
      message,
      stack: error instanceof Error ? error.stack : undefined,
      context: {
        errorInfo
      }
    })
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null
    }
    return this.props.children
  }
}
