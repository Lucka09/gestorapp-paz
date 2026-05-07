import { useState, useEffect } from 'react'
import { Bell, BellOff, Smartphone, X, Check, AlertCircle, ExternalLink } from 'lucide-react'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { Button } from '@/components/ui'
import { mostrarNotificacionLocal } from '@/lib/firestore/push'

// ─── BANNER INLINE ────────────────────────────────────────────────────────────
// Aparece en el dashboard o donde se necesite, una sola vez

export function BannerPushNotifications() {
  const { estado, cargando, activar } = usePushNotifications()
  const [ocultado, setOcultado] = useState(false)

  // Ver si ya fue descartado antes
  useEffect(() => {
    const val = localStorage.getItem('push-banner-ocultado')
    if (val === '1') setOcultado(true)
  }, [])

  const ocultar = () => {
    setOcultado(true)
    localStorage.setItem('push-banner-ocultado', '1')
  }

  if (ocultado) return null
  if (estado === 'activo') return null
  if (estado === 'no-soportado') return null

  if (estado === 'ios-sin-instalar') {
    return (
      <div className="flex items-center gap-3 bg-gp-orange-pale border border-orange-100
                      rounded-2xl px-4 py-3.5 mb-5">
        <Smartphone size={18} style={{ color: 'var(--gp-orange)', flexShrink: 0 }} />
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800">
            Activá notificaciones en iPhone
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            En Safari: compartir → "Agregar a pantalla de inicio" → abrí desde el ícono
          </p>
        </div>
        <button onClick={ocultar} className="text-gray-400 hover:text-gray-600 shrink-0">
          <X size={16} />
        </button>
      </div>
    )
  }

  if (estado === 'denegado') {
    return (
      <div className="flex items-center gap-3 bg-red-50 border border-red-100
                      rounded-2xl px-4 py-3.5 mb-5">
        <BellOff size={18} className="text-red-500 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-700">
            Notificaciones bloqueadas
          </p>
          <p className="text-xs text-red-500 mt-0.5">
            Habilitá las notificaciones en la configuración del navegador para este sitio.
          </p>
        </div>
        <button onClick={ocultar} className="text-gray-400 shrink-0">
          <X size={16} />
        </button>
      </div>
    )
  }

  // Estado pendiente — mostrar propuesta
  return (
    <div className="flex items-center gap-3 bg-gp-orange-pale border border-orange-100
                    rounded-2xl px-4 py-3.5 mb-5 animate-fadein">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
           style={{ background: 'var(--gp-orange)' }}>
        <Bell size={17} className="text-white" />
      </div>

      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-900">
          Activá las notificaciones push
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          Recibí alertas en el celular aunque tengas la app cerrada
        </p>
      </div>

      <div className="flex gap-2 shrink-0">
        <Button size="sm" onClick={activar} loading={cargando}>
          Activar
        </Button>
        <button onClick={ocultar}
          className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center"
          aria-label="Cerrar">
          <X size={15} />
        </button>
      </div>
    </div>
  )
}

// ─── PANEL DE CONFIGURACIÓN ───────────────────────────────────────────────────
// Para usar en la página de Configuración

export function PanelConfigPush() {
  const { estado, cargando, activar } = usePushNotifications()

  const CONFIG_NOTIFS = [
    { key: 'cambio_estado',    label: 'Cambios de estado en trámites',  default: true },
    { key: 'turno_manana',     label: 'Turnos de mañana sin confirmar', default: true },
    { key: 'cobranza_vencida', label: 'Cobros vencidos',                default: true },
    { key: 'listo_retirar',    label: 'Trámites listos para retirar',   default: true },
    { key: 'docs_requerida',   label: 'Documentación sin respuesta',    default: false },
    { key: 'cliente_nuevo',    label: 'Nuevo cliente registrado',        default: false },
  ]

  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('push-prefs')
      return saved ? JSON.parse(saved) : Object.fromEntries(
        CONFIG_NOTIFS.map(c => [c.key, c.default])
      )
    } catch {
      return Object.fromEntries(CONFIG_NOTIFS.map(c => [c.key, c.default]))
    }
  })

  const togglePref = (key: string) => {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    localStorage.setItem('push-prefs', JSON.stringify(next))
  }

  const probarNotificacion = () => {
    mostrarNotificacionLocal({
      titulo: 'GestorApp — Prueba ✅',
      cuerpo: 'Las notificaciones push están funcionando correctamente.',
      url:    '/admin/dashboard',
      tag:    'test',
    })
  }

  return (
    <div className="space-y-5">

      {/* Estado actual */}
      <div className={`flex items-center gap-3 rounded-xl p-4 border
                       ${estado === 'activo'
                         ? 'bg-emerald-50 border-emerald-200'
                         : 'bg-gray-50 border-gray-200'
                       }`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center
                         ${estado === 'activo' ? 'bg-emerald-100' : 'bg-gray-100'}`}>
          {estado === 'activo'
            ? <Bell size={18} className="text-emerald-600" />
            : <BellOff size={18} className="text-gray-400" />
          }
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">
            {estado === 'activo'         ? 'Notificaciones activas'      :
             estado === 'denegado'       ? 'Notificaciones bloqueadas'   :
             estado === 'no-soportado'   ? 'Browser no compatible'       :
             estado === 'ios-sin-instalar'? 'Requiere instalar la PWA'   :
             'Notificaciones desactivadas'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {estado === 'activo'
              ? 'Recibirás alertas aunque la app esté cerrada'
              : 'Activá para recibir alertas en tu celular o computadora'}
          </p>
        </div>
        {estado !== 'activo' && estado !== 'no-soportado' && estado !== 'ios-sin-instalar' && (
          <Button size="sm" onClick={activar} loading={cargando}
            variant={estado === 'denegado' ? 'secondary' : 'primary'}>
            {estado === 'denegado' ? 'Cómo habilitar' : 'Activar'}
          </Button>
        )}
        {estado === 'activo' && (
          <button
            onClick={probarNotificacion}
            className="text-xs text-emerald-600 font-medium hover:underline"
          >
            Probar
          </button>
        )}
      </div>

      {/* iOS guide */}
      {estado === 'ios-sin-instalar' && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-blue-800 flex items-center gap-2">
            <Smartphone size={15} /> Cómo instalar en iPhone
          </p>
          <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
            <li>Abrí la app en Safari (no en Chrome)</li>
            <li>Tocá el botón compartir <span className="font-mono bg-blue-100 px-1 rounded">⬆</span></li>
            <li>Seleccioná "Agregar a pantalla de inicio"</li>
            <li>Abrí la app desde el ícono en tu pantalla</li>
            <li>Las notificaciones ya estarán disponibles</li>
          </ol>
        </div>
      )}

      {/* Configuración de qué notificaciones recibir */}
      {estado === 'activo' && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Qué notificaciones recibir
          </p>
          {CONFIG_NOTIFS.map(cfg => (
            <label
              key={cfg.key}
              className="flex items-center justify-between py-2.5 border-b border-gray-50
                         last:border-0 cursor-pointer group"
            >
              <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">
                {cfg.label}
              </span>
              <div
                onClick={() => togglePref(cfg.key)}
                className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer
                             ${prefs[cfg.key]
                               ? 'bg-gp-orange'
                               : 'bg-gray-200'
                             }`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full
                                 shadow-sm transition-transform
                                 ${prefs[cfg.key] ? 'translate-x-5' : 'translate-x-1'}`}
                />
              </div>
            </label>
          ))}
        </div>
      )}

      {/* Browser no compatible */}
      {estado === 'no-soportado' && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100
                        rounded-xl p-4">
          <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 leading-relaxed">
            Tu navegador no soporta notificaciones push.
            Usá Chrome o Edge en Android/Desktop para recibirlas.
          </p>
        </div>
      )}
    </div>
  )
}
