import { Component, type ReactNode, type ErrorInfo } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'

// ─── ERROR BOUNDARY GLOBAL ────────────────────────────────────────────────────
// Captura errores que burbujean hasta la raíz de la app.
// Usado en main.tsx envolviendo <App />.

interface Props {
  children:  ReactNode
  fallback?: ReactNode
}

interface State {
  hasError:  boolean
  error:     Error | null
  errorInfo: ErrorInfo | null
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
    // En producción enviar a Sentry u otro servicio
    console.error('[GestorApp Error]', {
      error:     error.message,
      stack:     error.stack,
      component: errorInfo.componentStack,
    })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    window.location.href = '/'
  }

  render() {
    if (!this.state.hasError) return this.props.children
    if (this.props.fallback)  return this.props.fallback

    return (
      <div
        style={{
          minHeight: '100vh', background: 'var(--color-bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, fontFamily: 'var(--font-body)',
        }}
        role="alert"
        aria-live="assertive"
      >
        <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, background: '#FEF2F2', borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <AlertTriangle size={28} color="#DC2626" />
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22,
            color: 'var(--color-text-1)', margin: '0 0 8px',
          }}>
            Algo salió mal
          </h1>
          <p style={{ fontSize: 15, color: 'var(--color-text-3)', lineHeight: 1.65, margin: '0 0 8px' }}>
            Ocurrió un error inesperado en la aplicación.
            <br />Podés intentar recargar o volver al inicio.
          </p>

          {/* Error detail — solo en desarrollo */}
          {import.meta.env.DEV && this.state.error && (
            <pre style={{
              background: '#1A1A1A', color: '#F87171', borderRadius: 12,
              padding: '12px 16px', fontSize: 12, textAlign: 'left',
              overflowX: 'auto', margin: '16px 0', lineHeight: 1.5,
            }}>
              {this.state.error.message}
            </pre>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
            <button
              onClick={this.handleReset}
              style={{
                background: 'var(--gp-orange)', color: 'white', border: 'none',
                borderRadius: 12, padding: '12px 24px', fontSize: 14,
                fontWeight: 700, cursor: 'pointer', display: 'flex',
                alignItems: 'center', gap: 8, fontFamily: 'var(--font-body)',
              }}
            >
              <RefreshCw size={16} /> Volver al inicio
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: 'transparent', color: 'var(--color-text-3)',
                border: '1.5px solid var(--color-border)',
                borderRadius: 12, padding: '12px 24px', fontSize: 14,
                fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}
            >
              Recargar página
            </button>
          </div>

          <p style={{ marginTop: 24, fontSize: 13, color: 'var(--color-text-4)' }}>
            Si el problema persiste,{' '}
            <a
              href="https://wa.me/5491136141431"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--gp-orange)', fontWeight: 600 }}
            >
              contactá a soporte
            </a>
          </p>
          <p style={{ marginTop: 16, fontSize: 11, color: 'var(--color-text-4)', opacity: 0.6 }}>
            GestorApp · JAH-NISSI Digital Studio
          </p>
        </div>
      </div>
    )
  }
}

// ─── FEATURE BOUNDARY ─────────────────────────────────────────────────────────
// Versión liviana para aislar features individuales en el router.
// Si falla Dashboard, el resto de la app sigue funcionando.

interface FeatureState {
  hasError: boolean
  error:    Error | null
}

interface FeatureProps {
  children: ReactNode
  nombre:   string   // nombre del feature para el mensaje de error
}

export class FeatureBoundaryClass extends Component<FeatureProps, FeatureState> {
  constructor(props: FeatureProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): FeatureState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[FeatureBoundary:${this.props.nombre}]`, error.message, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        className="flex flex-col items-center justify-center py-20 text-center px-6"
        role="alert"
      >
        <div style={{
          width: 48, height: 48, borderRadius: 14, background: '#FEF2F2',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        }}>
          <AlertTriangle size={22} color="#DC2626" />
        </div>
        <p className="text-sm font-semibold text-gray-700 mb-1">
          {this.props.nombre} no está disponible
        </p>
        <p className="text-xs text-gray-400 mb-4 max-w-xs">
          Ocurrió un error en este módulo. El resto de la app sigue funcionando.
        </p>
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          className="text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
          style={{ background: 'var(--gp-orange-pale)', color: 'var(--gp-orange)' }}
        >
          <RefreshCw size={12} className="inline mr-1.5" />
          Reintentar
        </button>
        {import.meta.env.DEV && this.state.error && (
          <pre className="mt-4 text-left text-xs bg-gray-900 text-red-400 rounded-lg p-3 max-w-md overflow-x-auto">
            {this.state.error.message}
          </pre>
        )}
      </div>
    )
  }
}

// Helper funcional para usar en el router de forma limpia:
// <FeatureBoundary nombre="Dashboard">...</FeatureBoundary>
export function FeatureBoundary({ nombre, children }: FeatureProps) {
  return (
    <FeatureBoundaryClass nombre={nombre}>
      {children}
    </FeatureBoundaryClass>
  )
}