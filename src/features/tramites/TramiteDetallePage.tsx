import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Pencil, DollarSign, User,
  Car, Clock, CheckCircle,
} from 'lucide-react'
import { useTramite }   from '@/hooks/useTramites'
import { useCliente }   from '@/hooks/useClientes'
import { useVehiculo }  from '@/hooks/useVehiculos'
import { cambiarEstado, actualizarTramite, marcarPagado } from '@/lib/firestore/tramites'
import { useAuth }      from '@/hooks/useAuth'
import { Button, Card, Spinner } from '@/components/ui'
import Modal            from '@/components/shared/Modal'
import { EstadoBadge, EstadoSelector } from './EstadoBadge'
import { BotonQR }      from './BotonQR'
import { PanelNotas }   from '@/components/shared/PanelNotas'
import { TIPO_TRAMITE_LABELS, ESTADO_TRAMITE_LABELS, type EstadoTramite } from '@/types'
import { formatFecha, formatFechaHora, formatPesos, nombreCompleto } from '@/utils'
import toast from 'react-hot-toast'

export default function TramiteDetallePage() {
  const { id }       = useParams<{ id: string }>()
  const navigate     = useNavigate()
  const { user }     = useAuth()
  const { tramite, loading } = useTramite(id)
  const { cliente }  = useCliente(tramite?.clienteId)
  const { vehiculo } = useVehiculo(tramite?.vehiculoId)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    descripcion: '', observacionesInternas: '', honorarios: 0,
  })

  // ── OPTIMISTIC UPDATE ─────────────────────────────────────────────────────
  // optimisticEstado sobreescribe el estado real en la UI inmediatamente
  // después de un cambio, sin esperar a que onSnapshot confirme.
  // Se limpia solo cuando Firestore confirma (tramite.estado coincide).
  const [optimisticEstado, setOptimisticEstado] = useState<EstadoTramite | null>(null)

  useEffect(() => {
    // Cuando onSnapshot actualiza el doc con el nuevo estado, ya no necesitamos
    // el overlay — el estado real y el optimista coinciden.
    if (optimisticEstado && tramite?.estado === optimisticEstado) {
      setOptimisticEstado(null)
    }
  }, [tramite?.estado, optimisticEstado])

  // Estado visible: el overlay si está activo, el real si no
  const estadoVisible = (optimisticEstado ?? tramite?.estado) as EstadoTramite

  // ── HANDLERS ──────────────────────────────────────────────────────────────

  const handleCambiarEstado = async (nuevo: EstadoTramite, nota: string) => {
    if (!tramite || !user) return

    // 1. Respuesta visual instantánea (no espera a Firestore)
    setOptimisticEstado(nuevo)

    try {
      await cambiarEstado(
        id!, nuevo, nota, user.uid,
        tramite.estado,
        `${user.nombre ?? ''} ${user.apellido ?? ''}`.trim() || user.email,
      )
      toast.success(`Estado → ${ESTADO_TRAMITE_LABELS[nuevo]}`)
      // El useEffect limpiará optimisticEstado cuando onSnapshot llegue
    } catch {
      // Rollback: mostrar el estado anterior
      setOptimisticEstado(null)
      toast.error('Error al cambiar el estado')
    }
  }

  const handlePago = async () => {
    if (!tramite) return
    try {
      await marcarPagado(id!, !tramite.pagado)
      toast.success(tramite.pagado ? 'Marcado como pendiente de pago' : '¡Pago registrado!')
    } catch { toast.error('Error al actualizar el pago') }
  }

  const abrirEdicion = () => {
    if (!tramite) return
    setEditForm({
      descripcion:           tramite.descripcion,
      observacionesInternas: tramite.observacionesInternas,
      honorarios:            tramite.honorarios,
    })
    setEditOpen(true)
  }

  const handleGuardar = async () => {
    if (!id) return
    try {
      await actualizarTramite(id, editForm)
      toast.success('Trámite actualizado')
      setEditOpen(false)
    } catch { toast.error('Error al guardar') }
  }

  if (loading) return <Spinner />
  if (!tramite) return (
    <div className="text-center py-20">
      <p className="text-gray-400">Trámite no encontrado.</p>
      <button onClick={() => navigate('/admin/tramites')}
        className="text-gp-orange text-sm mt-2 hover:underline">
        Volver a Trámites
      </button>
    </div>
  )

  return (
    <div className="max-w-3xl space-y-4">

      {/* Topbar */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/admin/tramites')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft size={16} /> Volver a Trámites
        </button>
        <div className="flex gap-2">
          <BotonQR tramiteId={tramite.id} patente={tramite.patente} />
          <Button variant="secondary" size="sm" onClick={abrirEdicion}>
            <Pencil size={14} /> Editar
          </Button>
        </div>
      </div>

      {/* Header */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="font-mono text-xs text-gray-400 mb-1">{tramite.numero}</p>
            <h1 className="text-xl font-bold text-gray-900">
              {TIPO_TRAMITE_LABELS[tramite.tipo]}
            </h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="font-mono text-sm bg-gray-100 text-gray-700 px-3 py-1
                               rounded-lg tracking-widest font-bold">
                {tramite.patente}
              </span>
              <span className="text-xs text-gray-400">Creado: {formatFecha(tramite.creadoEn)}</span>
              <span className="text-xs text-gray-400">Actualizado: {formatFecha(tramite.actualizadoEn)}</span>
            </div>
          </div>
          <div className="shrink-0">
            <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide font-semibold">Estado</p>
            {/* EstadoSelector usa estadoVisible (optimista si hay cambio en vuelo) */}
            <EstadoSelector estadoActual={estadoVisible} onCambiar={handleCambiarEstado} />
            {/* Indicador sutil de cambio en vuelo */}
            {optimisticEstado && (
              <p className="text-xs text-gray-400 mt-1 text-right animate-pulse">
                Guardando…
              </p>
            )}
          </div>
        </div>
        {tramite.descripcion && (
          <p className="mt-4 text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-3">
            {tramite.descripcion}
          </p>
        )}
      </Card>

      {/* Honorarios */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Honorarios</p>
            <p className="text-2xl font-bold text-gray-900">
              {tramite.honorarios > 0 ? formatPesos(tramite.honorarios) : '—'}
            </p>
            {tramite.pagado && tramite.fechaPago && (
              <p className="text-xs text-emerald-600 mt-0.5">
                Pagado el {formatFecha(tramite.fechaPago)}
              </p>
            )}
          </div>
          <button
            onClick={handlePago}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                        transition-all ${tramite.pagado
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-orange-50 text-orange-600 hover:bg-orange-100'}`}
          >
            {tramite.pagado
              ? <><CheckCircle size={16} /> Pagado</>
              : <><DollarSign size={16} /> Marcar pagado</>
            }
          </button>
        </div>
      </Card>

      {/* Cliente y Vehículo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <User size={14} className="text-gray-400" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Cliente</p>
          </div>
          {cliente ? (
            <button
              onClick={() => navigate(`/admin/clientes/${tramite.clienteId}`)}
              className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-gp-orange/5
                         rounded-xl border border-gray-100 hover:border-gp-orange/20 transition-all text-left"
            >
              <div className="w-9 h-9 rounded-full bg-gp-orange/10 flex items-center justify-center
                              text-gp-orange font-bold text-xs shrink-0">
                {cliente.nombre[0]}{cliente.apellido[0]}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {nombreCompleto(cliente.nombre, cliente.apellido)}
                </p>
                <p className="text-xs text-gray-400">DNI {cliente.dni} · {cliente.telefono}</p>
              </div>
            </button>
          ) : <p className="text-sm text-gray-400">Cargando...</p>}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Car size={14} className="text-gray-400" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Vehículo</p>
          </div>
          {vehiculo ? (
            <button
              onClick={() => navigate(`/admin/vehiculos/${tramite.vehiculoId}`)}
              className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-gp-orange/5
                         rounded-xl border border-gray-100 hover:border-gp-orange/20 transition-all text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-gray-200 flex items-center justify-center shrink-0">
                <Car size={16} className="text-gray-500" />
              </div>
              <div>
                <p className="text-sm font-bold font-mono text-gray-800 tracking-widest">{vehiculo.patente}</p>
                <p className="text-xs text-gray-400">{vehiculo.marca} {vehiculo.modelo} · {vehiculo.anio}</p>
              </div>
            </button>
          ) : <p className="text-sm text-gray-400">Cargando...</p>}
        </Card>
      </div>

      {/* Notas internas */}
      {tramite && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <PanelNotas entidad="tramite" entidadId={tramite.id} />
        </div>
      )}

      {/* Historial de estados */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={14} className="text-gray-400" />
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Historial de estados
          </p>
          {tramite.historialEstados?.length > 0 && (
            <span className="ml-auto text-xs text-gray-300">
              {tramite.historialEstados.length} cambio{tramite.historialEstados.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Estado actual */}
        <div className="flex items-start gap-3 mb-3 pb-3 border-b border-gray-50">
          <div className="w-2 h-2 rounded-full bg-gp-orange mt-1.5 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-gray-500">Estado actual:</span>
              {/* Usar estadoVisible para mostrar el optimista si está en vuelo */}
              <EstadoBadge estado={estadoVisible} />
              {optimisticEstado && (
                <span className="text-xs text-gray-400 animate-pulse">· guardando…</span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Actualizado: {formatFecha(tramite.actualizadoEn)}
            </p>
          </div>
        </div>

        {!tramite.historialEstados?.length ? (
          <p className="text-xs text-gray-400 text-center py-2">Sin cambios de estado registrados.</p>
        ) : (
          <div className="space-y-3">
            {[...tramite.historialEstados].reverse().map((h, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="flex flex-col items-center shrink-0 mt-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                  {i < tramite.historialEstados.length - 1 && (
                    <div className="w-px flex-1 bg-gray-100 my-1 min-h-4" />
                  )}
                </div>

                <div className="flex-1 pb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <EstadoBadge estado={h.estadoAnterior} />
                    <span className="text-gray-300 text-xs">→</span>
                    <EstadoBadge estado={h.estadoNuevo} />
                  </div>

                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {(h as any).cambiadoPorNombre && (
                      <span className="text-xs text-gray-500 font-medium">
                        por {(h as any).cambiadoPorNombre}
                      </span>
                    )}
                    {h.fecha && (
                      <span className="text-xs text-gray-400">
                        {(h as any).cambiadoPorNombre ? '·' : ''} {formatFechaHora(h.fecha as any)}
                      </span>
                    )}
                  </div>

                  {h.nota && (
                    <p className="text-xs text-gray-500 mt-1 bg-gray-50 rounded-lg px-3 py-1.5 italic">
                      "{h.nota}"
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Observaciones internas */}
      {tramite.observacionesInternas && (
        <Card className="p-5 border-l-4 border-l-amber-400">
          <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">
            Observaciones internas
          </p>
          <p className="text-sm text-gray-600">{tramite.observacionesInternas}</p>
        </Card>
      )}

      {/* Modal editar */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar Trámite" size="md">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
              Descripción
            </label>
            <textarea
              value={editForm.descripcion}
              onChange={e => setEditForm(p => ({ ...p, descripcion: e.target.value }))}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none
                         focus:border-gp-orange resize-none placeholder-gray-400"
              placeholder="Detalle del trámite..."
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
              Honorarios ($)
            </label>
            <input
              type="number" min={0}
              value={editForm.honorarios}
              onChange={e => setEditForm(p => ({ ...p, honorarios: Number(e.target.value) }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none
                         focus:border-gp-orange"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
              Observaciones internas
            </label>
            <textarea
              value={editForm.observacionesInternas}
              onChange={e => setEditForm(p => ({ ...p, observacionesInternas: e.target.value }))}
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none
                         focus:border-gp-orange resize-none placeholder-gray-400"
              placeholder="Solo visible para el equipo..."
            />
          </div>
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <Button onClick={handleGuardar} className="flex-1">Guardar cambios</Button>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}