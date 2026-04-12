import { useState } from 'react'
import { CalendarDays, Clock, CheckCircle, XCircle } from 'lucide-react'
import { useTurnosPorCliente } from '@/hooks/useTurnos'
import { cancelarTurno } from '@/lib/firestore/turnos'
import { useAuth } from '@/hooks/useAuth'
import { Card, Spinner, EmptyState } from '@/components/ui'
import NuevoTurnoForm from './NuevoTurnoForm'
import { TIPO_TRAMITE_LABELS, type Turno } from '@/types'
import { format, isFuture } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

const ESTADO_STYLES: Record<string, { bg: string; label: string }> = {
  reservado:  { bg: 'bg-yellow-100 text-yellow-700',  label: 'Reservado'  },
  confirmado: { bg: 'bg-emerald-100 text-emerald-700', label: 'Confirmado' },
  cancelado:  { bg: 'bg-red-100 text-red-500',         label: 'Cancelado'  },
  cumplido:   { bg: 'bg-gray-100 text-gray-500',       label: 'Cumplido'   },
}

function TurnoItem({ turno }: { turno: Turno }) {
  const [canceling, setCanceling] = useState(false)
  const fechaDate = turno.fecha?.toDate?.()
  const esFuturo  = fechaDate ? isFuture(fechaDate) : false
  const estilos   = ESTADO_STYLES[turno.estado] ?? ESTADO_STYLES.reservado

  const handleCancelar = async () => {
    if (!confirm('¿Cancelar este turno?')) return
    setCanceling(true)
    try {
      await cancelarTurno(turno.id, 'Cancelado por el cliente')
      toast.success('Turno cancelado')
    } catch {
      toast.error('No se pudo cancelar el turno')
    } finally {
      setCanceling(false)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${estilos.bg}`}>
              {estilos.label}
            </span>
            <span className="text-xs text-gray-400">
              {fechaDate ? format(fechaDate, "EEEE d 'de' MMMM yyyy", { locale: es }) : '—'}
            </span>
          </div>
          <p className="font-semibold text-gray-900 text-sm">
            {TIPO_TRAMITE_LABELS[turno.tipoTramite]}
          </p>
          <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
            <Clock size={11} />
            {turno.horaInicio} – {turno.horaFin} hs
          </div>
          {turno.notas && (
            <p className="text-xs text-gray-400 mt-1 italic">"{turno.notas}"</p>
          )}
        </div>

        {esFuturo && turno.estado !== 'cancelado' && (
          <button
            onClick={handleCancelar}
            disabled={canceling}
            className="text-xs text-red-400 hover:text-red-600 font-medium
                       hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors
                       disabled:opacity-50 shrink-0"
          >
            {canceling ? 'Cancelando...' : 'Cancelar'}
          </button>
        )}
      </div>
    </Card>
  )
}

export default function ReservarTurnoPage() {
  const { user }      = useAuth()
  const clienteId     = user?.clienteId ?? undefined
  const { turnos, loading } = useTurnosPorCliente(clienteId)
  const [vista, setVista] = useState<'mis-turnos' | 'nuevo'>('mis-turnos')

  const proximos  = turnos.filter(t => {
    const d = t.fecha?.toDate?.()
    return d && isFuture(d) && t.estado !== 'cancelado'
  })
  const anteriores = turnos.filter(t => !proximos.includes(t))

  if (loading) return <Spinner />

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {(['mis-turnos', 'nuevo'] as const).map(v => (
          <button
            key={v}
            onClick={() => setVista(v)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              vista === v
                ? 'bg-white text-[#D4621A] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {v === 'mis-turnos' ? '📅 Mis Turnos' : '➕ Reservar'}
          </button>
        ))}
      </div>

      {/* Mis turnos */}
      {vista === 'mis-turnos' && (
        <div className="space-y-5">
          {/* Próximos */}
          <div>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Próximos ({proximos.length})
            </h2>
            {proximos.length === 0 ? (
              <div className="text-center py-8 bg-white rounded-xl border border-dashed border-gray-200">
                <CalendarDays size={32} className="text-gray-200 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">No tenés turnos próximos.</p>
                <button onClick={() => setVista('nuevo')}
                  className="text-[#D4621A] text-sm mt-2 hover:underline font-medium">
                  Reservar un turno →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {proximos.map(t => <TurnoItem key={t.id} turno={t} />)}
              </div>
            )}
          </div>

          {/* Anteriores */}
          {anteriores.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                Historial ({anteriores.length})
              </h2>
              <div className="space-y-2">
                {anteriores.slice(0, 5).map(t => <TurnoItem key={t.id} turno={t} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reservar nuevo */}
      {vista === 'nuevo' && (
        <Card className="p-5">
          <h2 className="font-bold text-gray-900 mb-4">Reservar un turno</h2>
          <NuevoTurnoForm
            fechaInicial={new Date()}
            clienteIdFijo={clienteId}
            onSuccess={() => {
              toast.success('¡Turno reservado! Te confirmaremos a la brevedad.')
              setVista('mis-turnos')
            }}
            onCancel={() => setVista('mis-turnos')}
          />
        </Card>
      )}
    </div>
  )
}
