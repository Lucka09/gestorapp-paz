import { Component, type ReactNode, type ErrorInfo } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'

interface Props {
  children:  ReactNode
  fallback?: ReactNode
}

interface State {
  hasError:   boolean
  error:      Error | null
  errorInfo:  ErrorInfo | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })

    // Logging — en producción enviar a Sentry o similar
    console.error('[GestorApp Error]', {
      error: error.message,
      stack: error.stack,
      component: errorInfo.componentStack,
    })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    window.location.href = '/'
  }

  render() {
    if (!this.state.hasError) return this.props.children

    if (this.props.fallback) return this.props.fallback

    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--color-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: 'var(--font-body)',
        }}
        role="alert"
        aria-live="assertive"
      >
        <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
          {/* Ícono */}
          <div style={{
            width: 64, height: 64,
            background: '#FEF2F2',
            borderRadius: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <AlertTriangle size={28} color="#DC2626" />
          </div>

          {/* Mensaje */}
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 22,
            color: 'var(--color-text-1)',
            margin: '0 0 8px',
          }}>
            Algo salió mal
          </h1>
          <p style={{
            fontSize: 15,
            color: 'var(--color-text-3)',
            lineHeight: 1.65,
            margin: '0 0 8px',
          }}>
            Ocurrió un error inesperado en la aplicación.
            <br />
            Podés intentar recargar o volver al inicio.
          </p>

          {/* Error detail — solo en desarrollo */}
          {import.meta.env.DEV && this.state.error && (
            <pre style={{
              background: '#1A1A1A',
              color: '#F87171',
              borderRadius: 12,
              padding: '12px 16px',
              fontSize: 12,
              textAlign: 'left',
              overflowX: 'auto',
              margin: '16px 0',
              lineHeight: 1.5,
            }}>
              {this.state.error.message}
            </pre>
          )}

          {/* Acciones */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
            <button
              onClick={this.handleReset}
              style={{
                background: 'var(--gp-orange)',
                color: 'white',
                border: 'none',
                borderRadius: 12,
                padding: '12px 24px',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: 'var(--font-body)',
                boxShadow: 'var(--shadow-gp)',
              }}
            >
              <RefreshCw size={16} /> Volver al inicio
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: 'transparent',
                color: 'var(--color-text-3)',
                border: '1.5px solid var(--color-border)',
                borderRadius: 12,
                padding: '12px 24px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}
            >
              Recargar página
            </button>
          </div>

          {/* Contacto */}
          <p style={{
            marginTop: 24,
            fontSize: 13,
            color: 'var(--color-text-4)',
          }}>
            Si el problema persiste,{' '}
            <a
              href="https://wa.me/5491136141431"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--gp-orange)', fontWeight: 600 }}
            >
              contactá a Gestoría Paz
            </a>
          </p>

          {/* Firma */}
          <p style={{
            marginTop: 16,
            fontSize: 11,
            color: 'var(--color-text-4)',
            opacity: 0.6,
          }}>
            GestorApp · JAH-NISSI Digital Studio
          </p>
        </div>
      </div>
    )
  }
}
