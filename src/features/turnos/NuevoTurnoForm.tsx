import { useState, useEffect, useMemo } from 'react'
import { Clock, CheckCircle, Share2, CalendarDays, AlertCircle } from 'lucide-react'
import { Select, Button }    from '@/components/ui'
import ClienteCombobox       from '@/components/shared/ClienteCombobox'
import { useClientes }       from '@/hooks/useClientes'
import { useTurnosPorFecha } from '@/hooks/useTurnos'
import { useConfiguracion }  from '@/hooks/useConfiguracion'
import { useGestoriaId }     from '@/context/GestoriaContext'
import { crearTurno, generarFranjas, franjasOcupadas } from '@/lib/firestore/turnos'
import { TIPO_TRAMITE_LABELS, type TipoTramite } from '@/types'
import { format, addDays, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'

// ─── MAPA día-clave (Date.getDay() → clave en horarioAtencion) ────────────────
const DOW_KEY: Record<number, string> = {
  0: 'domingo', 1: 'lunes', 2: 'martes', 3: 'miercoles',
  4: 'jueves',  5: 'viernes', 6: 'sabado',
}

// ─── PROPS ────────────────────────────────────────────────────────────────────
interface Props {
  fechaInicial:  Date
  clienteIdFijo?: string
  onSuccess:     () => void
  onCancel:      () => void
}

export default function NuevoTurnoForm({
  fechaInicial, clienteIdFijo, onSuccess, onCancel,
}: Props) {
  const { clientes }      = useClientes()
  const gestoriaId        = useGestoriaId()
  const { config, loading: loadingConfig } = useConfiguracion()

  // ── Derivar parámetros desde configuración ───────────────────────────────
  const duracion  = config.duracionTurnoMin ?? 30
  const horarios  = config.horarioAtencion  ?? {}

  // Obtener el horario del día seleccionado
  const getHorarioDia = (fecha: Date) => {
    const key = DOW_KEY[fecha.getDay()]
    return key ? horarios[key] : null
  }

  // Fecha inicial — avanzar al primer día habilitado si el día elegido no está activo
  const primerDiaHabilitado = useMemo(() => {
    const hoy = startOfDay(new Date())
    for (let i = 1; i <= 60; i++) {
      const d   = addDays(hoy, i)
      const cfg = getHorarioDia(d)
      if (cfg?.activo) return d
    }
    return addDays(hoy, 1)
  }, [horarios])

  // ── Estado del formulario ────────────────────────────────────────────────
  const [fecha,      setFecha]      = useState(
    format(fechaInicial >= startOfDay(addDays(new Date(), 1)) ? fechaInicial : primerDiaHabilitado, 'yyyy-MM-dd')
  )
  const [clienteId,  setCliente]    = useState(clienteIdFijo ?? '')
  const [tipo,       setTipo]       = useState<TipoTramite>('transferencia')
  const [franja,     setFranja]     = useState('')
  const [notas,      setNotas]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [confirmado, setConfirmado] = useState<{
    fecha: string; hora: string; horaFin: string; tipo: string
  } | null>(null)

  const fechaObj    = new Date(fecha + 'T00:00:00')
  const horarioDia  = getHorarioDia(fechaObj)
  const { turnos }  = useTurnosPorFecha(fechaObj)

  // Generar franjas según el horario real del día
  const todasFranjas = useMemo(() => {
    if (!horarioDia?.activo) return []
    return generarFranjas(horarioDia.inicio, horarioDia.fin, duracion)
  }, [horarioDia, duracion])

  const ocupadas     = franjasOcupadas(turnos)
  const disponibles  = todasFranjas.filter(f => !ocupadas.includes(f))

  // La fecha seleccionada no tiene horario activo
  const diaNoHabilitado = !horarioDia?.activo && !loadingConfig

  // Resetear franja si cambia la fecha
  useEffect(() => { setFranja('') }, [fecha])

  const calcularFin = (inicio: string) => {
    const [h, m] = inicio.split(':').map(Number)
    const finMin = h * 60 + m + duracion
    return `${String(Math.floor(finMin / 60)).padStart(2, '0')}:${String(finMin % 60).padStart(2, '0')}`
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clienteId)        { setError('Seleccioná un cliente'); return }
    if (!franja)           { setError('Seleccioná un horario'); return }
    if (diaNoHabilitado)   { setError('Este día no tiene atención configurada'); return }
    setError('')
    setLoading(true)
    try {
      await crearTurno({
        gestoriaId,                    // ← multi-tenant
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
        fecha:   fechaStr,
        hora:    franja,
        horaFin: calcularFin(franja),
        tipo:    TIPO_TRAMITE_LABELS[tipo],
      })
    } catch {
      setError('Error al crear el turno. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  // ── Pantalla de confirmación ─────────────────────────────────────────────
  if (confirmado) {
    const waNum = config.redesSociales?.whatsapp1 ?? '5491136141431'
    const waUrl = `https://wa.me/${waNum}?text=${encodeURIComponent(
      `Hola! Confirmo mi turno del ${confirmado.fecha} a las ${confirmado.hora} hs para ${confirmado.tipo} en ${config.nombreComercial ?? 'la gestoría'}.`
    )}`

    return (
      <div className="text-center py-4 animate-fadein">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
             style={{ background: '#D1FAE5' }}>
          <CheckCircle size={32} style={{ color: '#059669' }} />
        </div>
        <h3 style={{
          fontFamily: 'var(--font-display)', fontWeight: 800,
          fontSize: 20, margin: '0 0 6px', color: 'var(--color-text-1)',
        }}>
          Turno reservado
        </h3>
        <p style={{ fontSize: 14, color: 'var(--color-text-3)', margin: '0 0 20px' }}>
          Se notificará al cliente automáticamente.
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
          <p style={{
            fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)',
            margin: '0 0 4px', textTransform: 'capitalize',
          }}>
            {confirmado.fecha}
          </p>
          <div className="flex items-center gap-1.5 mb-2">
            <Clock size={14} style={{ color: 'var(--gp-orange)' }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--gp-orange)' }}>
              {confirmado.hora} – {confirmado.horaFin} hs
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--color-text-3)', margin: 0 }}>
            {confirmado.tipo}
          </p>
        </div>

        <a
          href={waUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full rounded-xl py-3 mb-3 font-semibold"
          style={{
            background: '#25D366', color: 'white', fontSize: 14,
            textDecoration: 'none', boxShadow: '0 4px 12px rgba(37,211,102,0.3)',
          }}
        >
          <Share2 size={16} /> Confirmar por WhatsApp
        </a>
        <button
          onClick={onSuccess}
          style={{
            background: 'none', border: 'none', fontSize: 13,
            color: 'var(--color-text-4)', cursor: 'pointer',
            fontFamily: 'var(--font-body)', padding: '8px',
          }}
        >
          Ir a la agenda →
        </button>
      </div>
    )
  }

  // ── Formulario ───────────────────────────────────────────────────────────
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
          min={format(addDays(new Date(), 1), 'yyyy-MM-dd')}
          max={format(addDays(new Date(), config.diasAnticipacion ?? 30), 'yyyy-MM-dd')}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm
                     outline-none focus:border-[#D4621A] focus:ring-2 focus:ring-[#D4621A]/15"
        />
      </div>

      {/* Aviso día no habilitado */}
      {diaNoHabilitado && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200
                        text-amber-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle size={15} className="shrink-0" />
          <span>
            Este día no tiene atención configurada.{' '}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => setFecha(format(primerDiaHabilitado, 'yyyy-MM-dd'))}
            >
              Ir al próximo disponible
            </button>
          </span>
        </div>
      )}

      {/* Horarios disponibles — solo si el día tiene atención */}
      {!diaNoHabilitado && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Horario disponible *
            </label>
            {horarioDia && (
              <span className="text-xs text-gray-400">
                Atención: {horarioDia.inicio} – {horarioDia.fin} hs
              </span>
            )}
          </div>

          {loadingConfig ? (
            <div className="grid grid-cols-4 gap-2">
              {[1,2,3,4,5,6,7,8].map(i => (
                <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : disponibles.length === 0 && todasFranjas.length > 0 ? (
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
                    key={f} type="button"
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
                      <Clock size={11} />{f}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          {franja && (
            <p className="text-xs text-emerald-600 font-medium">
              ✓ Turno: {franja} – {calcularFin(franja)} hs ({duracion} min)
            </p>
          )}
        </div>
      )}

      {/* Tipo de trámite */}
      <Select
        label="Tipo de trámite *"
        value={tipo}
        onChange={e => setTipo(e.target.value as TipoTramite)}
      >
        {(config.tramitesActivos ?? Object.keys(TIPO_TRAMITE_LABELS) as TipoTramite[]).map(t => (
          <option key={t} value={t}>{TIPO_TRAMITE_LABELS[t]}</option>
        ))}
      </Select>

      {/* Cliente — oculto si viene fijo */}
      {!clienteIdFijo && (
        <ClienteCombobox
          label="Cliente"
          required
          value={clienteId}
          onChange={id => setCliente(id)}
          clientes={clientes}
        />
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
        <Button type="submit" loading={loading} disabled={loading || diaNoHabilitado} className="flex-1">
          Reservar turno
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}