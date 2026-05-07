// src/features/auth/PortalNotificacionesPage.tsx
import { Bell, CheckCheck, ChevronRight, FileText, CalendarDays, Info } from 'lucide-react'
import { useNavigate }               from 'react-router-dom'
import { useAuth }                   from '@/hooks/useAuth'
import { useNotificacionesPortal }   from '@/hooks/usePortal'
import { marcarNotificacionLeida, marcarTodasLeidas } from '@/lib/firestore/portal'
import { Card }                      from '@/components/ui'
import { BannerPushNotifications }   from '@/components/shared/PushNotifications'
import type { Notificacion }         from '@/types'
import toast                         from 'react-hot-toast'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function tiempoRelativo(fecha: Date | { toDate(): Date } | string | number): string {
  try {
    const d = fecha && typeof fecha === 'object' && 'toDate' in fecha ? fecha.toDate() : new Date(fecha)
    const diff = Math.floor((Date.now() - d.getTime()) / 1000)
    if (diff < 60)   return 'hace un momento'
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
    if (diff < 86400)return `hace ${Math.floor(diff / 3600)} h`
    if (diff < 604800)return `hace ${Math.floor(diff / 86400)} día${Math.floor(diff / 86400) > 1 ? 's' : ''}`
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })
  } catch { return '' }
}

function iconoNotif(tipo: string) {
  if (tipo === 'turno')       return <CalendarDays size={16} className="text-blue-500" />
  if (tipo === 'documentacion') return <Info size={16} className="text-amber-500" />
  return <FileText size={16} style={{ color: 'var(--gp-orange)' }} />
}

// ─── ITEM DE NOTIFICACIÓN ─────────────────────────────────────────────────────

function NotifItem({
  notif, onVer,
}: { notif: Notificacion; onVer: (n: Notificacion) => void }) {
  return (
    <button
      onClick={() => onVer(notif)}
      className={`w-full flex items-start gap-3 p-4 rounded-2xl border text-left
                   transition-all active:scale-[0.99] ${
        notif.leida
          ? 'bg-white border-gray-100'
          : 'bg-gp-orange-pale border-orange-200'
      }`}
    >
      {/* Ícono */}
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
        notif.leida ? 'bg-gray-100' : 'bg-white'
      }`}>
        {iconoNotif(notif.tipo)}
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm leading-snug ${notif.leida ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>
            {notif.titulo}
          </p>
          {!notif.leida && (
            <span className="w-2 h-2 rounded-full bg-gp-orange shrink-0 mt-1" aria-label="no leída" />
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.mensaje}</p>
        <p className="text-xs text-gray-400 mt-1">{tiempoRelativo(notif.creadoEn)}</p>
      </div>

      {(notif.tramiteId || notif.turnoId) && (
        <ChevronRight size={14} className="text-gray-300 shrink-0 mt-1" />
      )}
    </button>
  )
}

// ─── PÁGINA ───────────────────────────────────────────────────────────────────

export default function PortalNotificacionesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { notifs, noLeidas, loading } = useNotificacionesPortal(user?.uid)

  const handleVer = async (n: Notificacion) => {
    // Marcar como leída
    if (!n.leida) {
      await marcarNotificacionLeida(n.id).catch(() => {})
    }
    // Navegar si tiene referencia
    if (n.tramiteId) navigate('/portal/tramites')
    else if (n.turnoId) navigate('/portal/turnos')
  }

  const handleLeerTodas = async () => {
    if (noLeidas === 0) return
    await marcarTodasLeidas(notifs).catch(() => {})
    toast.success('Todas marcadas como leídas')
  }

  // Agrupar por "hoy" y "anteriores"
  const hoy = new Date(); hoy.setHours(0,0,0,0)
  const deHoy      = notifs.filter(n => {
    try { return (n.creadoEn?.toDate ? n.creadoEn.toDate() : typeof n.creadoEn === 'string' || typeof n.creadoEn === 'number' ? new Date(n.creadoEn) : n.creadoEn  .toDate()) >= hoy }
    catch { return false }
  })
  const anteriores = notifs.filter(n => !deHoy.includes(n))

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Bell size={20} style={{ color: 'var(--gp-orange)' }} />
            Notificaciones
          </h1>
          {noLeidas > 0 && (
            <p className="text-sm text-gray-500 mt-0.5">
              {noLeidas} sin leer
            </p>
          )}
        </div>
        {noLeidas > 0 && (
          <button
            onClick={handleLeerTodas}
            className="flex items-center gap-1.5 text-xs font-semibold text-gp-orange
                       hover:underline transition-colors"
          >
            <CheckCheck size={14} /> Marcar todas
          </button>
        )}
      </div>

      {/* Banner push — invitar a activar si no están activas */}
      <BannerPushNotifications />

      {/* Contenido */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : notifs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <Bell size={24} className="text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">Sin notificaciones</p>
          <p className="text-sm text-gray-400 mt-1">
            Te avisaremos cuando haya novedades en tus trámites o turnos.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {deHoy.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Hoy</p>
              <div className="space-y-2">
                {deHoy.map(n => <NotifItem key={n.id} notif={n} onVer={handleVer} />)}
              </div>
            </div>
          )}
          {anteriores.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Anteriores</p>
              <div className="space-y-2">
                {anteriores.map(n => <NotifItem key={n.id} notif={n} onVer={handleVer} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}