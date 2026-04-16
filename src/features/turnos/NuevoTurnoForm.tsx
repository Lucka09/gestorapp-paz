import { useState, useEffect } from 'react'
import { Clock, CheckCircle, Share2, CalendarDays } from 'lucide-react'
import { Select, Button } from '@/components/ui'
import { useGestoriaId } from '@/context/GestoriaContext'
import { useClientes } from '@/hooks/useClientes'
import { useTurnosPorFecha } from '@/hooks/useTurnos'
import { crearTurno, generarFranjas, franjasOcupadas } from '@/lib/firestore/turnos'
import { TIPO_TRAMITE_LABELS, type TipoTramite } from '@/types'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// Horario de atención por defecto — configurable desde ConfiguracionPage
const HORA_APERTURA = '09:00'
const HORA_CIERRE   = '18:00'
const DURACION_MIN  = 30

interface Props {
  fechaInicial:   Date
  clienteIdFijo?: string
  onSuccess:      () => void
  onCancel:       () => void
}

export default function NuevoTurnoForm({
  fechaInicial, clienteIdFijo, onSuccess, onCancel,
}: Props) {
  const gestoriaId           = useGestoriaId()
  const { clientes }         = useClientes()
  const [fecha, setFecha]    = useState(format(fechaInicial, 'yyyy-MM-dd'))
  const [clienteId, setClienteId] = useState(clienteIdFijo ?? '')
  const [tipo, setTipo]      = useState<TipoTramite>('transferencia')
  const [franja, setFranja]  = useState('')
  const [notas, setNotas]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]    = useState('')
  const [confirmado, setConfirmado] = useState<{
    fecha: string; hora: string; horaFin: string; tipo: string
  } | null>(null)

  const fechaObj   = new Date(fecha + 'T00:00:00')
  const { turnos } = useTurnosPorFecha(fechaObj)

  const todasFranjas = generarFranjas(HORA_APERTURA, HORA_CIERRE, DURACION_MIN)
  const ocupadas     = franjasOcupadas(turnos)
  const disponibles  = todasFranjas.filter(f => !ocupadas.includes(f))

  // Resetear franja al cambiar fecha
  useEffect(() => { setFranja('') }, [fecha])

  const calcularFin = (inicio: string) => {
    const [h, m] = inicio.split(':').map(Number)
    const finMin = h * 60 + m + DURACION_MIN
    return `${String(Math.floor(finMin / 60)).padStart(2, '0')}:${String(finMin % 60).padStart(2, '0')}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clienteId) { setError('Seleccioná un cliente'); return }
    if (!franja)    { setError('Seleccioná un horario'); return }
    setError('')
    setLoading(true)
    try {
      // gestoriaId es inyectado aquí — el formulario no lo conoce
      await crearTurno({
        gestoriaId,
        clienteId,
        tramiteId:   null,
        tipoTramite: tipo,
        fecha:       fechaObj,
        horaInicio:  franja,
        horaFin:     calcularFin(franja),
        notas,
      })
      const fechaStr = format(fechaObj, "EEEE d 'de' MMMM", { locale: es })
      setConfirmado({
        fecha: fechaStr, hora: franja,
        horaFin: calcularFin(franja), tipo: TIPO_TRAMITE_LABELS[tipo],
      })
    } catch {
      setError('Error al crear el turno. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  // ── Pantalla de confirmación ─────────────────────────────────────────────────
  if (confirmado) {
    const waUrl = 'https://wa.me/5491136141431?text=' + encodeURIComponent(
      `Hola! Confirmo mi turno del ${confirmado.fecha} a las ${confirmado.hora} hs para ${confirmado.tipo} en Gestoria Paz.`
    )
    return (
      <div className="text-center py-4 animate-fadein">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
             style={{ background: '#D1FAE5' }}>
          <CheckCircle size={32} style={{ color: '#059669' }} />
        </div>
        <h3 style={{
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20,
          margin: '0 0 6px', color: 'var(--color-text-1)',
        }}>
          Turno reservado
        </h3>
        <p style={{ fontSize: 14, color: 'var(--color-text-3)', margin: '0 0 20px' }}>
          Te confirmaremos a la brevedad.
        </p>
        <div className="rounded-2xl p-5 mb-5 text-left"
             style={{ background: 'var(--gp-orange-pale)', border: '1px solid rgba(212,98,26,0.2)' }}>
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays size={16} style={{ color: 'var(--gp-orange)' }} />
            <span style={{
              fontSize: 11, fontWeight: 700, color: 'var(--gp-orange)',
              textTransform: 'uppercase', letterSpacing: '0.1em',
            }}>
              Resumen del turno
            </span>
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)',
                      margin: '0 0 4px', textTransform: 'capitalize' }}>
            {confirmado.fecha}
          </p>
          <div className="flex items-center gap-1.5 mb-2">
            <Clock size={14} style={{ color: 'var(--gp-orange)' }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--gp-orange)' }}>
              {confirmado.hora} - {confirmado.horaFin} hs
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--color-text-3)', margin: 0 }}>
            {confirmado.tipo}
          </p>
        </div>
        <a href={waUrl} target="_blank" rel="noopener noreferrer"
           className="flex items-center justify-center gap-2 w-full rounded-xl py-3 mb-3 font-semibold"
           style={{
             background: '#25D366', color: 'white', fontSize: 14,
             textDecoration: 'none', boxShadow: '0 4px 12px rgba(37,211,102,0.3)', display: 'flex',
           }}>
          <Share2 size={16} /> Confirmar por WhatsApp
        </a>
        <button onClick={onSuccess}
          style={{
            background: 'none', border: 'none', fontSize: 13,
            color: 'var(--color-text-4)', cursor: 'pointer',
            fontFamily: 'var(--font-body)', padding: '8px',
          }}>
          Ir a mis turnos
        </button>
      </div>
    )
  }

  // ── Formulario ───────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Fecha */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Fecha *
        </label>
        <input
          type="date"
          value={fecha}
          onChange={e => setFecha(e.target.value)}
          min={format(new Date(), 'yyyy-MM-dd')}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm
                     outline-none focus:border-[#D4621A] focus:ring-2 focus:ring-[#D4621A]/15"
        />
      </div>

      {/* Horarios disponibles */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Horario disponible *
        </label>
        {disponibles.length === 0 ? (
          <div className="bg-red-50 border border-red-200 text-red-500 text-sm
                          rounded-xl px-4 py-3 text-center">
            No hay horarios disponibles para esta fecha.
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {todasFranjas.map(f => {
              const libre    = disponibles.includes(f)
              const selected = franja === f
              return (
                <button
                  key={f}
                  type="button"
                  disabled={!libre}
                  onClick={() => setFranja(f)}
                  className={`py-2.5 rounded-xl text-sm font-medium transition-all border ${
                    selected
                      ? 'bg-[#D4621A] text-white border-[#D4621A] shadow-md shadow-[#D4621A]/25'
                      : libre
                      ? 'bg-white text-gray-700 border-gray-200 hover:border-[#D4621A] hover:text-[#D4621A]'
                      : 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed line-through'
                  }`}
                >
                  <span className="flex items-center justify-center gap-1">
                    <Clock size={11} />
                    {f}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        {franja && (
          <p className="text-xs text-emerald-600 font-medium">
            ✓ Turno: {franja} – {calcularFin(franja)} hs
          </p>
        )}
      </div>

      {/* Tipo de trámite */}
      <Select
        label="Tipo de trámite *"
        value={tipo}
        onChange={e => setTipo(e.target.value as TipoTramite)}
      >
        {(Object.entries(TIPO_TRAMITE_LABELS) as [TipoTramite, string][]).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </Select>

      {/* Cliente */}
      {!clienteIdFijo && (
        <Select
          label="Cliente *"
          value={clienteId}
          onChange={e => setClienteId(e.target.value)}
        >
          <option value="">— Seleccioná un cliente —</option>
          {clientes
            .sort((a, b) => a.apellido.localeCompare(b.apellido))
            .map(c => (
              <option key={c.id} value={c.id}>
                {c.apellido}, {c.nombre} — DNI {c.dni}
              </option>
            ))
          }
        </Select>
      )}

      {/* Notas */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Notas (opcional)
        </label>
        <textarea
          value={notas}
          onChange={e => setNotas(e.target.value)}
          rows={2}
          placeholder="Indicaciones para el cliente o el equipo..."
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                     outline-none focus:border-[#D4621A] resize-none placeholder-gray-400"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <Button type="submit" loading={loading} className="flex-1">Reservar turno</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  )
}