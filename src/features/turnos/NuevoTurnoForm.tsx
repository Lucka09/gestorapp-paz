import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  CheckCircle,
  Clock,
  Share2,
} from 'lucide-react'

import Modal from '@/components/shared/Modal'
import ClienteCombobox from '@/components/shared/ClienteCombobox'
import { Button, Select } from '@/components/ui'
import { useGestoriaId } from '@/context/GestoriaContext'
import { useClientes } from '@/hooks/useClientes'
import { useConfiguracion } from '@/hooks/useConfiguracion'
import { useTurnosPorFecha } from '@/hooks/useTurnos'
import { crearTurno, generarFranjas, franjasOcupadas } from '@/lib/firestore/turnos'
import { TIPO_TRAMITE_LABELS, type TipoTramite } from '@/types'
import { addDays, format, isToday, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'

const DOW_KEY: Record<number, string> = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miercoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sabado',
}

interface Props {
  fechaInicial: Date
  clienteIdFijo?: string
  onSuccess: () => void
  onCancel: () => void
}

export default function NuevoTurnoForm({
  fechaInicial,
  clienteIdFijo,
  onSuccess,
  onCancel,
}: Props) {
  const { clientes } = useClientes()
  const gestoriaId = useGestoriaId()
  const { config, loading: loadingConfig } = useConfiguracion()

  const duracion = config.duracionTurnoMin ?? 30
  const horarios = config.horarioAtencion ?? {}

  const getHorarioDia = (fecha: Date) => {
    const key = DOW_KEY[fecha.getDay()]
    return key ? horarios[key] : null
  }

  const primerDiaHabilitado = useMemo(() => {
    const hoy = startOfDay(new Date())
    for (let i = 0; i <= 60; i++) {
      const d = addDays(hoy, i)
      const cfg = getHorarioDia(d)
      if (cfg?.activo) return d
    }
    return addDays(hoy, 1)
  }, [horarios])

  const [fecha, setFecha] = useState(
    format(
      fechaInicial >= startOfDay(new Date()) ? fechaInicial : primerDiaHabilitado,
      'yyyy-MM-dd',
    ),
  )
  const [clienteId, setCliente] = useState(clienteIdFijo ?? '')
  const [tipo, setTipo] = useState<TipoTramite>('transferencia')
  const [franja, setFranja] = useState('')
  const [notas, setNotas] = useState('')
  const [modalidad, setModalidad] = useState<'presencial' | 'virtual'>('presencial')
  const [linkVirtual, setLinkVirtual] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmado, setConfirmado] = useState<{
    fecha: string
    hora: string
    horaFin: string
    tipo: string
  } | null>(null)
  const [modalAdvertencia, setModalAdvertencia] = useState<{
    abierto: boolean
    franja: string
    turnosExistentes: number
  }>({
    abierto: false,
    franja: '',
    turnosExistentes: 0,
  })

  const fechaObj = new Date(`${fecha}T00:00:00`)
  const horarioDia = getHorarioDia(fechaObj)
  const { turnos } = useTurnosPorFecha(fechaObj)

  const todasFranjas = useMemo(() => {
    if (!horarioDia?.activo) return []
    return generarFranjas(horarioDia.inicio, horarioDia.fin, duracion)
  }, [horarioDia, duracion])

  const ocupadas = franjasOcupadas(turnos)
  const diaNoHabilitado = !horarioDia?.activo && !loadingConfig

  useEffect(() => {
    setFranja('')
  }, [fecha])

  const calcularFin = (inicio: string) => {
    const [h, m] = inicio.split(':').map(Number)
    const finMin = h * 60 + m + duracion
    return `${String(Math.floor(finMin / 60)).padStart(2, '0')}:${String(finMin % 60).padStart(2, '0')}`
  }

  const crearTurnoConfirmado = async () => {
    setLoading(true)
    try {
      await crearTurno({
        gestoriaId,
        clienteId,
        tramiteId: null,
        tipoTramite: tipo,
        fecha: fechaObj,
        horaInicio: franja,
        horaFin: calcularFin(franja),
        notas,
      })

      const fechaStr = format(fechaObj, "EEEE d 'de' MMMM", { locale: es })
      setConfirmado({
        fecha: fechaStr,
        hora: franja,
        horaFin: calcularFin(franja),
        tipo: TIPO_TRAMITE_LABELS[tipo],
      })
    } catch {
      setError('Error al crear el turno. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const validarYCrear = async () => {
    if (!clienteId) {
      setError('Seleccioná un cliente')
      return
    }
    if (!franja) {
      setError('Seleccioná un horario')
      return
    }
    if (diaNoHabilitado) {
      setError('Este día no tiene atención configurada')
      return
    }

    const turnosEnFranja = turnos.filter(
      t => t.horaInicio === franja && t.estado !== 'cancelado',
    )

    if (turnosEnFranja.length > 0) {
      setModalAdvertencia({
        abierto: true,
        franja,
        turnosExistentes: turnosEnFranja.length,
      })
      return
    }

    await crearTurnoConfirmado()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    await validarYCrear()
  }

  if (confirmado) {
    const waNum = config.redesSociales?.whatsapp1 ?? '5491136141431'
    const waUrl = `https://wa.me/${waNum}?text=${encodeURIComponent(
      `Hola! Confirmo mi turno del ${confirmado.fecha} a las ${confirmado.hora} hs para ${confirmado.tipo} en ${config.nombreComercial ?? 'la gestoría'}.`,
    )}`

    return (
      <div className="text-center py-4 animate-fadein">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: '#D1FAE5' }}
        >
          <CheckCircle size={32} style={{ color: '#059669' }} />
        </div>

        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 20,
            margin: '0 0 6px',
            color: 'var(--color-text-1)',
          }}
        >
          Turno reservado
        </h3>

        <p style={{ fontSize: 14, color: 'var(--color-text-3)', margin: '0 0 20px' }}>
          Se notificará al cliente automáticamente.
        </p>

        <div
          className="rounded-2xl p-5 mb-5 text-left"
          style={{
            background: 'var(--gp-orange-pale)',
            border: '1px solid rgba(212,98,26,0.2)',
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays size={16} style={{ color: 'var(--gp-orange)' }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--gp-orange)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              Resumen del turno
            </span>
          </div>

          <p
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--color-text-1)',
              margin: '0 0 4px',
              textTransform: 'capitalize',
            }}
          >
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
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full rounded-xl py-3 mb-3 font-semibold"
          style={{
            background: '#25D366',
            color: 'white',
            fontSize: 14,
            textDecoration: 'none',
            boxShadow: '0 4px 12px rgba(37,211,102,0.3)',
          }}
        >
          <Share2 size={16} /> Confirmar por WhatsApp
        </a>

        <button
          type="button"
          onClick={onSuccess}
          style={{
            background: 'none',
            border: 'none',
            fontSize: 13,
            color: 'var(--color-text-4)',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            padding: '8px',
          }}
        >
          Ir a la agenda →
        </button>
      </div>
    )
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Fecha *
          </label>
          <input
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            min={format(startOfDay(new Date()), 'yyyy-MM-dd')}
            max={format(addDays(new Date(), config.diasAnticipacion ?? 30), 'yyyy-MM-dd')}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#D4621A] focus:ring-2 focus:ring-[#D4621A]/15"
          />
          {isToday(fechaObj) && (
            <p className="text-xs text-[#D4621A] font-medium mt-1">
              ✓ Citas para hoy habilitadas
            </p>
          )}
        </div>

        {diaNoHabilitado && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl px-4 py-3">
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
                {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                  <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : todasFranjas.length === 0 ? (
              <div className="bg-red-50 border border-red-200 text-red-500 text-sm rounded-xl px-4 py-3 text-center">
                No hay horarios disponibles para esta fecha.
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {todasFranjas.map(f => {
                  const ocupada = ocupadas.includes(f)
                  const selected = franja === f

                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFranja(f)}
                      className={`py-2.5 rounded-xl text-sm font-medium transition-all border relative ${
                        selected
                          ? 'bg-[#D4621A] text-white border-[#D4621A] shadow-md shadow-[#D4621A]/25'
                          : ocupada
                            ? 'bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-400'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-[#D4621A] hover:text-[#D4621A]'
                      }`}
                    >
                      <span className="flex items-center justify-center gap-1">
                        <Clock size={11} />
                        {f}
                      </span>

                      {ocupada && !selected && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white rounded-full flex items-center justify-center text-[9px] font-bold">
                          !
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {franja && (
              <div className="space-y-1">
                <p className="text-xs text-emerald-600 font-medium">
                  ✓ Turno: {franja} – {calcularFin(franja)} hs ({duracion} min)
                </p>
                {ocupadas.includes(franja) && (
                  <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
                    <AlertTriangle size={12} />
                    Ya hay {turnos.filter(t => t.horaInicio === franja && t.estado !== 'cancelado').length} turno(s) en este horario
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <Select
          label="Tipo de trámite *"
          value={tipo}
          onChange={e => setTipo(e.target.value as TipoTramite)}
        >
          {(config.tramitesActivos ?? (Object.keys(TIPO_TRAMITE_LABELS) as TipoTramite[])).map(t => (
            <option key={t} value={t}>{TIPO_TRAMITE_LABELS[t]}</option>
          ))}
        </Select>

        {!clienteIdFijo && (
          <ClienteCombobox
            label="Cliente"
            required
            value={clienteId}
            onChange={id => setCliente(id)}
            clientes={clientes}
          />
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Modalidad
          </label>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {(['presencial', 'virtual'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setModalidad(m)}
                className={`py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                  modalidad === m
                    ? 'bg-[#D4621A] border-[#D4621A] text-white'
                    : 'border-gray-200 text-gray-600'
                }`}
              >
                {m === 'presencial' ? '🏢 Presencial' : '💻 Virtual'}
              </button>
            ))}
          </div>

          {modalidad === 'virtual' && (
            <input
              value={linkVirtual}
              onChange={e => setLinkVirtual(e.target.value)}
              placeholder="Link de Meet / Zoom / Teams..."
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
            />
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Notas (opcional)
          </label>
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            rows={2}
            placeholder="Indicaciones para el cliente o el equipo..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#D4621A] resize-none placeholder-gray-400"
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

      <Modal
        open={modalAdvertencia.abierto}
        onClose={() => setModalAdvertencia({ abierto: false, franja: '', turnosExistentes: 0 })}
        title="⚠️ Horario con turnos existentes"
        subtitle={`Ya hay ${modalAdvertencia.turnosExistentes} turno(s) agendado(s) a las ${modalAdvertencia.franja} hs`}
        size="sm"
      >
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm text-amber-800">
              Se creará un turno adicional en este horario. El cliente deberá esperar si hay turnos previos en cola.
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={async () => {
                setModalAdvertencia({ abierto: false, franja: '', turnosExistentes: 0 })
                await crearTurnoConfirmado()
              }}
              className="flex-1"
            >
              Confirmar turno adicional
            </Button>
            <Button
              variant="secondary"
              onClick={() => setModalAdvertencia({ abierto: false, franja: '', turnosExistentes: 0 })}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
