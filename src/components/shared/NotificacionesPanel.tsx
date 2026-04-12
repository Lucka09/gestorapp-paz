import { useState, useRef, useEffect } from 'react'
import { Bell, FileText, CalendarDays, Info, Check, CheckCheck } from 'lucide-react'
import { useNotificaciones } from '@/hooks/useNotificaciones'
import { marcarLeida, marcarTodasLeidas } from '@/lib/firestore/notificaciones'
import { useAuth } from '@/hooks/useAuth'
import { formatRelativo } from '@/utils'
import type { Notificacion } from '@/types'

const TIPO_ICON: Record<string, React.ReactNode> = {
  estado_tramite: <FileText size={14} />,
  turno:          <CalendarDays size={14} />,
  documentacion:  <FileText size={14} />,
  general:        <Info size={14} />,
}

const TIPO_COLOR: Record<string, string> = {
  estado_tramite: 'bg-blue-100 text-blue-600',
  turno:          'bg-emerald-100 text-emerald-600',
  documentacion:  'bg-orange-100 text-orange-600',
  general:        'bg-gray-100 text-gray-500',
}

function NotifItem({ notif, onRead }: { notif: Notificacion; onRead: () => void }) {
  return (
    <button
      onClick={async () => {
        if (!notif.leida) await marcarLeida(notif.id)
        onRead()
      }}
      className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50
                  transition-colors text-left border-b border-gray-50 last:border-0
                  ${!notif.leida ? 'bg-[#D4621A]/3' : ''}`}
    >
      {/* Tipo ícono */}
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5
                       ${TIPO_COLOR[notif.tipo] ?? 'bg-gray-100 text-gray-400'}`}>
        {TIPO_ICON[notif.tipo] ?? <Info size={14} />}
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-tight ${!notif.leida ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
          {notif.titulo}
        </p>
        <p className="text-xs text-gray-500 mt-0.5 leading-snug line-clamp-2">
          {notif.mensaje}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {formatRelativo(notif.creadoEn)}
        </p>
      </div>

      {/* Dot no leída */}
      {!notif.leida && (
        <div className="w-2 h-2 rounded-full bg-[#D4621A] shrink-0 mt-1.5" />
      )}
    </button>
  )
}

export default function NotificacionesPanel() {
  const { user }              = useAuth()
  const { notifs, noLeidas }  = useNotificaciones(user?.uid)
  const [open, setOpen]       = useState(false)
  const ref                   = useRef<HTMLDivElement>(null)

  // Cerrar al hacer click afuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleMarcarTodas = async () => {
    if (!user) return
    await marcarTodasLeidas(user.uid)
  }

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
      >
        <Bell size={18} />
        {noLeidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#D4621A] text-white
                           text-xs rounded-full flex items-center justify-center font-bold leading-none">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-11 w-80 bg-white border border-gray-100
                        rounded-2xl shadow-2xl z-50 overflow-hidden
                        animate-in fade-in zoom-in-95 duration-150">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Notificaciones</h3>
              {noLeidas > 0 && (
                <p className="text-xs text-gray-400">{noLeidas} sin leer</p>
              )}
            </div>
            {noLeidas > 0 && (
              <button
                onClick={handleMarcarTodas}
                className="flex items-center gap-1 text-xs text-[#D4621A] hover:underline font-medium"
              >
                <CheckCheck size={13} /> Marcar todas
              </button>
            )}
          </div>

          {/* Lista */}
          <div className="max-h-80 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="text-center py-10">
                <Bell size={28} className="text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Sin notificaciones</p>
              </div>
            ) : (
              notifs.map(n => (
                <NotifItem key={n.id} notif={n} onRead={() => setOpen(false)} />
              ))
            )}
          </div>

          {/* Footer */}
          {notifs.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-400 text-center">
                Mostrando las últimas {notifs.length} notificaciones
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
