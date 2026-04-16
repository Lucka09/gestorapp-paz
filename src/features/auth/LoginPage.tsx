import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { FirebaseError } from 'firebase/app'
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
    } catch (err) {
      setError(getErrorMessage((err as FirebaseError).code))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gp-black">

      {/* Glows decorativos — radial gradients no tienen equivalente en TW */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div style={{
          position: 'absolute', top: '-20%', right: '-10%',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212,98,26,0.12) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-20%', left: '-10%',
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212,98,26,0.07) 0%, transparent 70%)',
        }} />
      </div>

      <div className="relative w-full max-w-sm">

        {/* Card principal */}
        <div className="bg-white overflow-hidden rounded-gp-xl shadow-[0_24px_60px_rgba(0,0,0,0.3)]">

          {/* Header naranja */}
          <div className="bg-gp-orange px-8 pt-7 pb-6">

            {/* Logo + nombre */}
            <div className="flex items-center gap-3 mb-5">
              <img
                src="/logo-gp-64.jpg"
                alt="Logo Gestoría Paz"
                className="w-12 h-12 rounded-full border-2 border-white/40 object-cover bg-white/10"
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
              <div>
                <p className="font-gp-display font-extrabold text-base text-white leading-tight m-0">
                  GestorApp
                </p>
                <p className="text-xs text-white/75 m-0">Gestoría Paz</p>
              </div>
            </div>

            <h1 className="font-gp-display font-extrabold text-[26px] text-white mb-1">
              Bienvenido
            </h1>
            <p className="text-sm text-white/75 m-0">
              Ingresá con tu cuenta para continuar
            </p>
          </div>

          {/* Formulario */}
          <form
            onSubmit={handleSubmit}
            className="px-8 py-7"
            aria-label="Formulario de inicio de sesión"
            noValidate
          >

            {/* Email */}
            <div className="mb-4.5">
              <label
                htmlFor="login-email"
                className="block text-[11px] font-semibold text-gp-text-3 uppercase tracking-[0.08em] mb-2"
              >
                Correo electrónico
              </label>
              <input
                type="email"
                id="login-email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder="ejemplo@correo.com"
                autoComplete="email"
                aria-required="true"
                aria-describedby={error ? 'login-error' : undefined}
                className={`input-gp w-full px-3.5 py-3 text-base text-gp-text-1 box-border ${
                  error ? 'input-gp-error' : 'bg-white'
                }`}
              />
            </div>

            {/* Contraseña */}
            <div className="mb-5">
              <label
                htmlFor="login-password"
                className="block text-[11px] font-semibold text-gp-text-3 uppercase tracking-[0.08em] mb-2"
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  id="login-password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  placeholder="••••••••"
                  aria-required="true"
                  autoComplete="current-password"
                  className={`input-gp w-full pl-3.5 pr-11 py-3 text-sm text-gp-text-1 box-border ${
                    error ? 'input-gp-error' : 'bg-white'
                  }`}
                />
                <button
                  type="button"
                  aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setShowPass(!showPass)}
                  className="touch-xs absolute right-3 top-1/2 -translate-y-1/2
                             bg-transparent border-none cursor-pointer text-gp-text-4 p-1"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                id="login-error"
                role="alert"
                aria-live="polite"
                aria-atomic="true"
                className="flex items-start gap-2 bg-red-50 border border-red-200
                           rounded-gp-md px-3.5 py-2.5 mb-4 text-[13px] text-red-700"
              >
                <span aria-hidden="true" className="shrink-0">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Botón de submit */}
            {/* btn-primary maneja hover/active/disabled via CSS — no necesita handlers JS */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3.5
                         text-[15px] font-bold"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>

          {/* Footer */}
          <div className="px-8 pb-6 text-center">
            <p className="text-xs text-gp-text-4 m-0">
              ¿Problemas para ingresar?{' '}
              <a
                href="https://wa.me/5491158591881"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gp-orange font-semibold"
              >
                Contactá al administrador
              </a>
            </p>
          </div>
        </div>

        {/* Firma JAH-NISSI */}
        <p className="text-center text-[11px] text-white/30 mt-5 font-gp-body">
          Desarrollado por{' '}
          <span className="text-white/50 font-semibold">JAH-NISSI Digital Studio</span>
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