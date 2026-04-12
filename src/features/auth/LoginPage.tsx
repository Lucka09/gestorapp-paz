import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { setError('Completá todos los campos.'); return }
    setError('')
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err: any) {
      setError(getErrorMessage(err.code))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--gp-black)' }}
    >
      {/* Glow de fondo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div style={{
          position: 'absolute', top: '-20%', right: '-10%',
          width: '500px', height: '500px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212,98,26,0.12) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-20%', left: '-10%',
          width: '400px', height: '400px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212,98,26,0.07) 0%, transparent 70%)',
        }} />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="bg-white overflow-hidden" style={{ borderRadius: 'var(--radius-xl)', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>

          {/* Header naranja */}
          <div style={{ background: 'var(--gp-orange)', padding: '28px 32px 24px' }}>
            {/* Logo GP */}
            <div className="flex items-center gap-3 mb-5">
              <img
                src="/logo-gp-64.jpg"
                alt="Logo Gestoría Paz"
                style={{
                  width: 48, height: 48,
                  borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.4)',
                  objectFit: 'cover',
                  background: 'rgba(255,255,255,0.1)',
                }}
                onError={e => {
                  e.currentTarget.style.display = 'none'
                }}
              />
              <div>
                <p style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800, fontSize: 16,
                  color: 'white', lineHeight: 1.2, margin: 0,
                }}>GestorApp</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', margin: 0 }}>
                  Gestoría Paz
                </p>
              </div>
            </div>

            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800, fontSize: 26,
              color: 'white', margin: '0 0 4px',
            }}>
              Bienvenido
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', margin: 0 }}>
              Ingresá con tu cuenta para continuar
            </p>
          </div>

          {/* Formulario */}
          <form
            onSubmit={handleSubmit}
            style={{ padding: '28px 32px' }}
            aria-label="Formulario de inicio de sesión"
            noValidate
          >

            {/* Email */}
            <div style={{ marginBottom: 18 }}>
              <label
                htmlFor="login-email"
                style={{
                  display: 'block', fontSize: 11, fontWeight: 600,
                  color: 'var(--color-text-3)', textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: 8,
                }}
              >
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder="ejemplo@correo.com"
                autoComplete="email"
                id="login-email"
                aria-required="true"
                aria-describedby={error ? 'login-error' : undefined}
                style={{
                  width: '100%', borderRadius: 'var(--radius-md)',
                  border: `1.5px solid ${error ? '#FCA5A5' : 'var(--color-border)'}`,
                  padding: '12px 14px', fontSize: 16, outline: 'none',
                  fontFamily: 'var(--font-body)', boxSizing: 'border-box',
                  background: error ? '#FFF5F5' : 'white',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                  color: 'var(--color-text-1)',
                }}
                onFocus={e => {
                  e.target.style.borderColor = 'var(--gp-orange)'
                  e.target.style.boxShadow   = '0 0 0 3px var(--gp-orange-subtle)'
                }}
                onBlur={e => {
                  e.target.style.borderColor = error ? '#FCA5A5' : 'var(--color-border)'
                  e.target.style.boxShadow   = 'none'
                }}
              />
            </div>

            {/* Contraseña */}
            <div style={{ marginBottom: 20 }}>
              <label
                htmlFor="login-password"
                style={{
                  display: 'block', fontSize: 11, fontWeight: 600,
                  color: 'var(--color-text-3)', textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: 8,
                }}
              >
                Contraseña
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  id="login-password"
                  placeholder="••••••••"
                  aria-required="true"
                  autoComplete="current-password"
                  style={{
                    width: '100%', borderRadius: 'var(--radius-md)',
                    border: `1.5px solid ${error ? '#FCA5A5' : 'var(--color-border)'}`,
                    padding: '12px 44px 12px 14px', fontSize: 14, outline: 'none',
                    fontFamily: 'var(--font-body)', boxSizing: 'border-box',
                    background: error ? '#FFF5F5' : 'white',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    color: 'var(--color-text-1)',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = 'var(--gp-orange)'
                    e.target.style.boxShadow   = '0 0 0 3px var(--gp-orange-subtle)'
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = error ? '#FCA5A5' : 'var(--color-border)'
                    e.target.style.boxShadow   = 'none'
                  }}
                />
                <button
                  type="button"
                  aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    position: 'absolute', right: 12, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-text-4)', padding: 4,
                  }}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                role="alert"
                aria-live="polite"
                aria-atomic="true"
                style={{
                  background: '#FEF2F2', border: '1px solid #FECACA',
                  borderRadius: 'var(--radius-md)', padding: '10px 14px',
                  marginBottom: 16, fontSize: 13, color: '#B91C1C',
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                }}
              >
                <span aria-hidden="true" style={{ flexShrink: 0 }}>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Botón */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? 'var(--gp-orange-light)' : 'var(--gp-orange)',
                color: 'white', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                borderRadius: 'var(--radius-md)', padding: '14px',
                fontSize: 15, fontWeight: 700,
                fontFamily: 'var(--font-body)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.15s',
                boxShadow: 'var(--shadow-gp)',
              }}
              onMouseEnter={e => {
                if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'var(--gp-orange-hover)'
              }}
              onMouseLeave={e => {
                if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'var(--gp-orange)'
              }}
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>

          {/* Footer */}
          <div style={{ padding: '0 32px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: 'var(--color-text-4)', margin: 0 }}>
              ¿Problemas para ingresar?{' '}
              <a
                href="https://wa.me/5491158591881"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--gp-orange)', fontWeight: 600 }}
              >
                Contactá al administrador
              </a>
            </p>
          </div>
        </div>

        {/* Firma JAH-NISSI */}
        <p style={{
          textAlign: 'center', fontSize: 11,
          color: 'rgba(255,255,255,0.3)', marginTop: 20,
          fontFamily: 'var(--font-body)',
        }}>
          Desarrollado por{' '}
          <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
            JAH-NISSI Digital Studio
          </span>
        </p>
      </div>
    </div>
  )
}

function getErrorMessage(code: string): string {
  const msgs: Record<string, string> = {
    'auth/invalid-email':         'El correo ingresado no es válido.',
    'auth/user-disabled':         'Esta cuenta fue deshabilitada.',
    'auth/user-not-found':        'Correo o contraseña incorrectos.',
    'auth/wrong-password':        'Correo o contraseña incorrectos.',
    'auth/invalid-credential':    'Correo o contraseña incorrectos.',
    'auth/too-many-requests':     'Demasiados intentos. Intentá más tarde.',
    'auth/network-request-failed':'Sin conexión. Verificá tu internet.',
  }
  return msgs[code] ?? 'Ocurrió un error. Intentá de nuevo.'
}
