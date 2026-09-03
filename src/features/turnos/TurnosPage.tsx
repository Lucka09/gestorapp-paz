import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  User,
} from 'lucide-react'
import {
  addDays,
  differenceInMinutes,
  format,
  isSameDay,
  isToday,
  startOfWeek,
} from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

import { Badge, Button, Card, PageHeader } from '@/components/ui'
import Modal from '@/components/shared/Modal'
import { useAuth } from '@/hooks/useAuth'
import { useCliente } from '@/hooks/useClientes'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useTurnosPorFecha } from '@/hooks/useTurnos'
import { cancelarTurno, cumplirTurno, confirmarTurno } from '@/lib/firestore/turnos'
import { mostrarNotificacionLocal } from '@/lib/firestore/push'
import { TIPO_TRAMITE_LABELS, type Turno } from '@/types'

import NuevoTurnoForm from './NuevoTurnoForm'

const ESTADO_COLORS: Record<string, string> = {
  reservado: 'bg-yellow-100 text-yellow-700',
  confirmado: 'bg-emerald-100 text-emerald-700',
  cancelado: 'bg-red-100 text-red-500',
  cumplido: 'bg-gray-100 text-gray-500',
}

function ClienteNombre({ clienteId }: { clienteId: string }) {
  const { cliente } = useCliente(clienteId)
  return <span>{cliente ? `${cliente.apellido}, ${cliente.nombre}` : '...'}</span>
}

function TurnoCard({ turno, onAccion }: { turno: Turno; onAccion: () => void }) {
  const [loading, setLoading] = useState(false)
  const [modalCancelar, setModalCancelar] = useState(false)
  const [motivoCancelacion, setMotivoCancelacion] = useState('')
  const { user } = useAuth()

  const esPropietario = user?.rol === 'propietario'
  const esSecretario = user?.rol === 'asesor_comercial'
  const esCreador =
    turno.creadoPor === user?.uid ||
    turno.creadoPorNombre === `${user?.nombre ?? ''} ${user?.apellido ?? ''}`.trim()

  const puedeCancelar = esPropietario || (esSecretario && esCreador)

  const accion = async (fn: () => Promise<void>, msg: string) => {
    setLoading(true)
    try {
      await fn()
      toast.success(msg)
      onAccion()
    } catch {
      toast.error('Error al actualizar el turno')
    } finally {
      setLoading(false)
    }
  }

  const handleCancelar = async () => {
    if (!motivoCancelacion.trim()) {
      toast.error('Ingresá un motivo de cancelación')
      return
    }

    await accion(
      () => cancelarTurno(turno.id, motivoCancelacion),
      'Turno cancelado',
    )
    setModalCancelar(false)
    setMotivoCancelacion('')
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="flex items-center gap-1 text-sm font-bold text-gray-900">
              <Clock size={13} className="text-[#D4621A]" />
              {turno.horaInicio} – {turno.horaFin}
            </span>
            <Badge className={ESTADO_COLORS[turno.estado]}>
              {turno.estado.charAt(0).toUpperCase() + turno.estado.slice(1)}
            </Badge>
          </div>

          <p className="text-sm font-semibold text-gray-700">
            {TIPO_TRAMITE_LABELS[turno.tipoTramite]}
          </p>

          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
            <User size={11} />
            <ClienteNombre clienteId={turno.clienteId} />
          </p>

          {turno.notas && (
            <p className="text-xs text-gray-500 mt-1 italic">&ldquo;{turno.notas}&rdquo;</p>
          )}

          {turno.motivoCancelacion && (
            <p className="text-xs text-red-400 mt-1">Motivo: {turno.motivoCancelacion}</p>
          )}
        </div>

        {turno.estado === 'reservado' && (
          <div className="flex flex-col gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => accion(() => confirmarTurno(turno.id), 'Turno confirmado')}
              disabled={loading}
              className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Confirmar
            </button>

            {puedeCancelar && (
              <button
                type="button"
                onClick={() => setModalCancelar(true)}
                disabled={loading}
                className="text-xs bg-gray-100 hover:bg-red-50 text-gray-500 hover:text-red-500 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
            )}
          </div>
        )}

        {turno.estado === 'confirmado' && (
          <div className="flex flex-col gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => accion(() => cumplirTurno(turno.id), 'Turno marcado como cumplido')}
              disabled={loading}
              className="text-xs bg-[#D4621A] hover:bg-[#B8521A] text-white px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 shrink-0"
            >
              Cumplido
            </button>

            {puedeCancelar && (
              <button
                type="button"
                onClick={() => setModalCancelar(true)}
                disabled={loading}
                className="text-xs bg-gray-100 hover:bg-red-50 text-gray-500 hover:text-red-500 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
            )}
          </div>
        )}
      </div>

      <Modal
        open={modalCancelar}
        onClose={() => {
          setModalCancelar(false)
          setMotivoCancelacion('')
        }}
        title="Cancelar turno"
        subtitle="Ingresá el motivo de cancelación"
        size="sm"
      >
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-xs text-amber-800">
              <strong>Turno:</strong> {turno.horaInicio} hs — {TIPO_TRAMITE_LABELS[turno.tipoTramite]}
            </p>
            <p className="text-xs text-amber-700 mt-1">
              <strong>Cliente:</strong> <ClienteNombre clienteId={turno.clienteId} />
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">
              Motivo de cancelación *
            </label>
            <textarea
              value={motivoCancelacion}
              onChange={e => setMotivoCancelacion(e.target.value)}
              placeholder="Ej: Cliente no asistió, cambio de horario, error en la carga..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#D4621A] resize-none"
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <Button onClick={handleCancelar} loading={loading} className="flex-1">
              Confirmar cancelación
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setModalCancelar(false)
                setMotivoCancelacion('')
              }}
            >
              Volver
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default function TurnosPage() {
  usePageTitle('Agenda / Turnos')

  const [fechaSeleccionada, setFecha] = useState(new Date())
  const [semanaBase, setSemana] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [modalOpen, setModal] = useState(false)
  const { turnos, loading } = useTurnosPorFecha(fechaSeleccionada)
  const [, forceUpdate] = useState(0)
  const { user } = useAuth()

  const diasSemana = Array.from({ length: 7 }, (_, i) => addDays(semanaBase, i))

  useEffect(() => {
    if (!user) return

    const turnosProximos = turnos.filter(t => {
      if (t.estado === 'cancelado' || t.estado === 'cumplido') return false

      const fechaTurno = t.fecha?.toDate?.()
      if (!fechaTurno) return false
      if (!isSameDay(fechaTurno, new Date())) return false

      const ahora = new Date()
      const minutos = differenceInMinutes(fechaTurno, ahora)
      return minutos > 0 && minutos <= 30
    })

    if (turnosProximos.length === 0) return

    const turno = turnosProximos[0]
    const fechaTurno = turno.fecha?.toDate?.()
    const horaTurno = turno.horaInicio

    toast(
      () => (
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-[#D4621A] shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Turno próximo</p>
            <p className="text-xs text-gray-600 mt-1">
              {turno.horaInicio} hs — {TIPO_TRAMITE_LABELS[turno.tipoTramite]}
            </p>
          </div>
        </div>
      ),
      { duration: 8000 },
    )

    mostrarNotificacionLocal({
      titulo: '🔔 Turno próximo',
      cuerpo: `${horaTurno} hs — ${TIPO_TRAMITE_LABELS[turno.tipoTramite]}`,
      tag: `turno-${turno.id}`,
    })
  }, [turnos, user])

  return (
    <div>
      <PageHeader
        title="Turnos"
        subtitle={`${turnos.filter(t => t.estado !== 'cancelado').length} turnos el ${format(fechaSeleccionada, "d 'de' MMMM", { locale: es })}`}
        action={
          <Button onClick={() => setModal(true)}>
            <Plus size={16} /> Nuevo turno
          </Button>
        }
      />

      <Card className="p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setSemana(d => addDays(d, -7))}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={18} className="text-gray-500" />
          </button>
          <span className="text-sm font-semibold text-gray-700">
            {format(semanaBase, 'MMMM yyyy', { locale: es })}
          </span>
          <button
            type="button"
            onClick={() => setSemana(d => addDays(d, 7))}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {diasSemana.map(dia => {
            const selec = isSameDay(dia, fechaSeleccionada)
            const hoy = isToday(dia)
            return (
              <button
                key={dia.toISOString()}
                type="button"
                onClick={() => setFecha(dia)}
                className={`flex flex-col items-center py-2.5 rounded-xl transition-all ${
                  selec
                    ? 'bg-[#D4621A] text-white shadow-md shadow-[#D4621A]/30'
                    : hoy
                      ? 'bg-[#D4621A]/10 text-[#D4621A]'
                      : 'hover:bg-gray-50 text-gray-600'
                }`}
              >
                <span className="text-xs font-medium uppercase tracking-wide">
                  {format(dia, 'EEE', { locale: es }).slice(0, 3)}
                </span>
                <span className={`text-lg font-bold mt-0.5 leading-none ${selec ? 'text-white' : ''}`}>
                  {format(dia, 'd')}
                </span>
              </button>
            )
          })}
        </div>
      </Card>

      <div className="flex items-center gap-2 mb-3">
        <CalendarDays size={16} className="text-[#D4621A]" />
        <h2 className="font-semibold text-gray-800 text-sm">
          {format(fechaSeleccionada, "EEEE d 'de' MMMM", { locale: es })}
          {isToday(fechaSeleccionada) && (
            <span className="ml-2 text-xs text-[#D4621A] font-medium">· Hoy</span>
          )}
        </h2>
      </div>

      {loading ? (
        <SkeletonTurnos />
      ) : turnos.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-200">
          <CalendarDays size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Sin turnos para este día.</p>
          <button
            type="button"
            onClick={() => setModal(true)}
            className="text-[#D4621A] text-sm mt-2 hover:underline font-medium"
          >
            + Agregar turno
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {turnos
            .slice()
            .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
            .map(t => (
              <TurnoCard key={t.id} turno={t} onAccion={() => forceUpdate(n => n + 1)} />
            ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModal(false)}
        title="Nuevo Turno"
        subtitle="Reservá un turno para un cliente"
        size="md"
      >
        <NuevoTurnoForm
          fechaInicial={fechaSeleccionada}
          onSuccess={() => {
            setModal(false)
            toast.success('Turno reservado')
          }}
          onCancel={() => setModal(false)}
        />
      </Modal>
    </div>
  )
}

function SkeletonTurnos() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4"
        >
          <div className="shrink-0 text-center w-14">
            <div className="h-5 w-12 bg-gray-200 rounded-full animate-pulse mx-auto mb-1" />
            <div className="h-3 w-10 bg-gray-100 rounded-full animate-pulse mx-auto" />
          </div>
          <div className="w-px h-10 bg-gray-100 shrink-0" />

          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 bg-gray-200 rounded-full animate-pulse" />
            <div className="flex gap-2">
              <div className="h-3 w-24 bg-gray-100 rounded-full animate-pulse" />
              <div className="h-3 w-16 bg-gray-100 rounded-full animate-pulse" />
            </div>
          </div>

          <div className="h-6 w-20 bg-gray-100 rounded-full animate-pulse shrink-0" />
        </div>
      ))}
    </div>
  )
}