import { useState, useEffect } from 'react'
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { Eye, EyeOff, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { getDoc, doc, collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useNavigate }    from 'react-router-dom'
import { useAuthStore }   from '@/store/authStore'

// ─── HOOK: detecta gestoría desde la URL pre-login ───────────────────────────
// Plan básico:  app.gestorapp.com         → título "GestorApp — Ingresá"
// Plan pro:     gestoriapaz.gestorapp.com → título "Gestoría Paz — GestorApp"
// Param ?g=id:  app.gestorapp.com?g=abc  → título por gestoriaId
// Esto permite branded title en el login SIN necesitar autenticación

function useTenantTitle() {
  const [nombre, setNombre] = useState('GestorApp')

  useEffect(() => {
    async function detectar() {
      try {
        // 1. Buscar por query param ?g=gestoriaId
        const params   = new URLSearchParams(window.location.search)
        const gParam   = params.get('g')

        if (gParam) {
          const snap = await getDoc(doc(db, 'gestionarias', gParam))
          if (snap.exists()) {
            const n = snap.data().branding?.nombreComercial ?? snap.data().nombre
            if (n) { setNombre(n); return }
          }
        }

        // 2. Buscar por subdominio (plan profesional)
        const host = window.location.hostname  // ej: "gestoriapaz.gestorapp.com"
        const parts = host.split('.')
        // Si tiene 3+ partes y el segundo no es 'www', hay subdominio
        if (parts.length >= 3 && parts[0] !== 'www' && parts[0] !== 'app') {
          const slug = parts[0]
          const q = query(
            collection(db, 'gestionarias'),
            where('slug', '==', slug),
            limit(1)
          )
          const res = await getDocs(q)
          if (!res.empty) {
            const n = res.docs[0].data().branding?.nombreComercial ?? res.docs[0].data().nombre
            if (n) { setNombre(n); return }
          }
        }
      } catch {
        // silencioso — título genérico como fallback
      }
    }
    detectar()
  }, [])

  return nombre
}

// ─── VISTAS ───────────────────────────────────────────────────────────────────
type Vista = 'login' | 'reset' | 'reset-enviado'

export default function LoginPage() {
  const [vista,  setVista]  = useState<Vista>('login')
  const nombreTenant        = useTenantTitle()
  const { user }            = useAuthStore()
  const navigate            = useNavigate()

  // Redirigir al panel si el usuario ya está autenticado
  useEffect(() => {
    if (!user) return
    const dest = user.rol === 'cliente'
      ? '/portal/inicio'
      : user.rol === 'gestor'
      ? '/admin/gestor'
      : '/admin/dashboard'
    navigate(dest, { replace: true })
  }, [user, navigate])


  // Actualizar <title> con el nombre del tenant detectado
  useEffect(() => {
    document.title = vista === 'login'
      ? `Ingresar — ${nombreTenant}`
      : vista === 'reset'
      ? `Recuperar contraseña — ${nombreTenant}`
      : `¡Listo! — ${nombreTenant}`
    return () => { document.title = nombreTenant }
  }, [vista, nombreTenant])

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
        <div
          className="bg-white overflow-hidden"
          style={{ borderRadius: 'var(--radius-xl)', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}
        >
          {/* Header naranja */}
          <div style={{ background: 'var(--gp-orange)', padding: '28px 32px 24px' }}>
            <div className="flex items-center gap-3 mb-5">
              <img
                src="/logo-gp-64.jpg"
                alt={nombreTenant}
                style={{
                  width: 48, height: 48, borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.4)',
                  objectFit: 'cover', background: 'rgba(255,255,255,0.1)',
                }}
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
              <div>
                <p style={{
                  fontFamily: 'var(--font-display)', fontWeight: 800,
                  fontSize: 16, color: 'white', lineHeight: 1.2, margin: 0,
                }}>GestorApp</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', margin: 0 }}>
                  {nombreTenant}
                </p>
              </div>
            </div>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontWeight: 800,
              fontSize: 26, color: 'white', margin: '0 0 4px',
            }}>
              {vista === 'login'         ? 'Bienvenido'             :
               vista === 'reset-enviado' ? '¡Listo!'                :
               'Recuperar contraseña'}
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', margin: 0 }}>
              {vista === 'login'         ? 'Ingresá con tu cuenta para continuar'         :
               vista === 'reset-enviado' ? 'Revisá tu correo electrónico'                 :
               'Te enviaremos un enlace para restablecer tu contraseña'}
            </p>
          </div>

          {vista === 'login'         && <FormLogin      onOlvide={() => setVista('reset')} />}
          {vista === 'reset'         && <FormReset      onVolver={() => setVista('login')} onEnviado={() => setVista('reset-enviado')} />}
          {vista === 'reset-enviado' && <ResetEnviado   onVolver={() => setVista('login')} />}
        </div>

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

// ─── HELPERS DE ESTILO ────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600,
  color: 'var(--color-text-3)', textTransform: 'uppercase',
  letterSpacing: '0.08em', marginBottom: 8,
}

const inputBase: React.CSSProperties = {
  width: '100%', borderRadius: 'var(--radius-md)',
  padding: '12px 14px', fontSize: 14, outline: 'none',
  fontFamily: 'var(--font-body)', boxSizing: 'border-box' as const,
  transition: 'border-color 0.15s, box-shadow 0.15s',
  color: 'var(--color-text-1)',
}

function inputStyle(error: boolean): React.CSSProperties {
  return {
    ...inputBase,
    border: `1.5px solid ${error ? '#FCA5A5' : 'var(--color-border)'}`,
    background: error ? '#FFF5F5' : 'white',
  }
}

function onFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.target.style.borderColor = 'var(--gp-orange)'
  e.target.style.boxShadow   = '0 0 0 3px var(--gp-orange-subtle)'
}

function onBlur(hasError: boolean) {
  return (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = hasError ? '#FCA5A5' : 'var(--color-border)'
    e.target.style.boxShadow   = 'none'
  }
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div role="alert" style={{
      background: '#FEF2F2', border: '1px solid #FECACA',
      borderRadius: 'var(--radius-md)', padding: '10px 14px',
      marginBottom: 16, fontSize: 13, color: '#B91C1C',
      display: 'flex', alignItems: 'flex-start', gap: 8,
    }}>
      <span aria-hidden="true" style={{ flexShrink: 0 }}>⚠️</span>
      <span>{msg}</span>
    </div>
  )
}

function BtnSubmit({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) {
  return (
    <button type="submit" disabled={loading} style={{
      width: '100%',
      background: loading ? 'var(--gp-orange-light)' : 'var(--gp-orange)',
      color: 'white', border: 'none',
      cursor: loading ? 'not-allowed' : 'pointer',
      borderRadius: 'var(--radius-md)', padding: '14px',
      fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-body)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      transition: 'all 0.15s', boxShadow: 'var(--shadow-gp)',
    }}>
      {loading && <Loader2 size={16} className="animate-spin" />}
      {loading ? loadingLabel : label}
    </button>
  )
}

// ─── FORM LOGIN ───────────────────────────────────────────────────────────────

function FormLogin({ onOlvide }: { onOlvide: () => void }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { setError('Completá todos los campos.'); return }
    setError(''); setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (err: unknown) {
      const errorCode = err instanceof Error && 'code' in err ? (err as { code: string }).code : 'unknown'
      setError(getErrorMessage(errorCode))
    } finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: '28px 32px' }} noValidate>
      <div style={{ marginBottom: 18 }}>
        <label htmlFor="login-email" style={labelStyle}>Correo electrónico</label>
        <input type="email" id="login-email" value={email} autoComplete="email"
          onChange={e => { setEmail(e.target.value); setError('') }}
          placeholder="ejemplo@correo.com"
          style={inputStyle(!!error)} onFocus={onFocus} onBlur={onBlur(!!error)} />
      </div>

      <div style={{ marginBottom: 8 }}>
        <label htmlFor="login-password" style={labelStyle}>Contraseña</label>
        <div style={{ position: 'relative' }}>
          <input type={showPass ? 'text' : 'password'} id="login-password"
            value={password} autoComplete="current-password"
            onChange={e => { setPassword(e.target.value); setError('') }}
            placeholder="••••••••"
            style={{ ...inputStyle(!!error), padding: '12px 44px 12px 14px' }}
            onFocus={onFocus} onBlur={onBlur(!!error)} />
          <button type="button" onClick={() => setShowPass(!showPass)}
            aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                     background: 'none', border: 'none', cursor: 'pointer',
                     color: 'var(--color-text-4)', padding: 4 }}>
            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div style={{ textAlign: 'right', marginBottom: 20 }}>
        <button type="button" onClick={onOlvide}
          style={{ background: 'none', border: 'none', cursor: 'pointer',
                   fontSize: 12, color: 'var(--gp-orange)', fontWeight: 600,
                   fontFamily: 'var(--font-body)', padding: '2px 0' }}>
          ¿Olvidaste tu contraseña?
        </button>
      </div>

      {error && <ErrorBox msg={error} />}
      <BtnSubmit loading={loading} label="Ingresar" loadingLabel="Ingresando..." />

      <p style={{ fontSize: 12, color: 'var(--color-text-4)', margin: '20px 0 0', textAlign: 'center' }}>
        ¿Problemas?{' '}
        <a href="https://wa.me/5491158591881" target="_blank" rel="noopener noreferrer"
           style={{ color: 'var(--gp-orange)', fontWeight: 600 }}>
          Contactá al administrador
        </a>
      </p>
    </form>
  )
}

// ─── FORM RESET ───────────────────────────────────────────────────────────────

function FormReset({ onVolver, onEnviado }: { onVolver: () => void; onEnviado: () => void }) {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) { setError('Ingresá tu correo electrónico.'); return }
    setError(''); setLoading(true)
    try {
      await sendPasswordResetEmail(auth, email.trim())
      onEnviado()
    } catch (err: unknown) {
      const errorCode = err instanceof Error && 'code' in err ? (err as { code: string }).code : 'unknown'
      const msgs: Record<string, string> = {
        'auth/user-not-found':   'No existe una cuenta con ese correo.',
        'auth/invalid-email':    'El correo ingresado no es válido.',
        'auth/too-many-requests':'Demasiados intentos. Esperá unos minutos.',
      }
      setError(msgs[errorCode] ?? 'No se pudo enviar el email. Intentá de nuevo.')
    } finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: '28px 32px' }} noValidate>
      <div style={{ marginBottom: 20 }}>
        <label htmlFor="reset-email" style={labelStyle}>Correo electrónico</label>
        <input type="email" id="reset-email" value={email} autoComplete="email" autoFocus
          onChange={e => { setEmail(e.target.value); setError('') }}
          placeholder="ejemplo@correo.com"
          style={inputStyle(!!error)} onFocus={onFocus} onBlur={onBlur(!!error)} />
        <p style={{ fontSize: 12, color: 'var(--color-text-4)', marginTop: 6 }}>
          Si la cuenta existe, recibirás un email con el enlace para crear una nueva contraseña.
        </p>
      </div>
      {error && <ErrorBox msg={error} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <BtnSubmit loading={loading} label="Enviar enlace de recuperación" loadingLabel="Enviando..." />
        <button type="button" onClick={onVolver}
          style={{ width: '100%', background: 'none',
                   border: '1.5px solid var(--color-border)',
                   cursor: 'pointer', borderRadius: 'var(--radius-md)', padding: '12px',
                   fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-body)',
                   color: 'var(--color-text-3)',
                   display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <ArrowLeft size={15} /> Volver al inicio de sesión
        </button>
      </div>
    </form>
  )
}

// ─── RESET ENVIADO ────────────────────────────────────────────────────────────

function ResetEnviado({ onVolver }: { onVolver: () => void }) {
  return (
    <div style={{ padding: '32px', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: '#D1FAE5',
                    margin: '0 auto 20px', display: 'flex',
                    alignItems: 'center', justifyContent: 'center' }}>
        <CheckCircle2 size={32} style={{ color: '#059669' }} />
      </div>
      <p style={{ fontSize: 15, color: 'var(--color-text-2)', margin: '0 0 8px', lineHeight: 1.5 }}>
        Si existe una cuenta con ese correo, recibirás el enlace en los próximos minutos.
      </p>
      <p style={{ fontSize: 13, color: 'var(--color-text-4)', margin: '0 0 28px' }}>
        Revisá también la carpeta de spam.
      </p>
      <button type="button" onClick={onVolver}
        style={{ width: '100%', background: 'var(--gp-orange)', color: 'white',
                 border: 'none', cursor: 'pointer',
                 borderRadius: 'var(--radius-md)', padding: '14px',
                 fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-body)',
                 display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <ArrowLeft size={15} /> Volver al inicio de sesión
      </button>
    </div>
  )
}

// ─── ERROR MESSAGES ───────────────────────────────────────────────────────────

function getErrorMessage(code: string): string {
  const msgs: Record<string, string> = {
    'auth/invalid-email':          'El correo ingresado no es válido.',
    'auth/user-disabled':          'Esta cuenta fue deshabilitada.',
    'auth/user-not-found':         'Correo o contraseña incorrectos.',
    'auth/wrong-password':         'Correo o contraseña incorrectos.',
    'auth/invalid-credential':     'Correo o contraseña incorrectos.',
    'auth/too-many-requests':      'Demasiados intentos. Intentá recuperar tu contraseña.',
    'auth/network-request-failed': 'Sin conexión. Verificá tu internet.',
  }
  return msgs[code] ?? 'Ocurrió un error. Intentá de nuevo.'
}