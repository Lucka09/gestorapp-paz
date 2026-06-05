import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Pencil, DollarSign, User, Trash2,
  Car, Clock, FileText, CheckCircle, XCircle,
  Scale, MapPin, ExternalLink, Navigation
} from 'lucide-react'
import { useTramite } from '@/hooks/useTramites'
import { useCliente } from '@/hooks/useClientes'
import { useVehiculo } from '@/hooks/useVehiculos'
import { cambiarEstado, actualizarTramite, marcarPagado, eliminarTramite } from '@/lib/firestore/tramites'
import { subscribeWorkflow, crearWorkflow } from '@/lib/firestore/inscripcionworkflow'
import { onSnapshot } from 'firebase/firestore'
import { multaWorkflowDoc, sincronizarPagoMultaAlTramite } from '@/lib/firestore/MultaWorwflow'
import { crearTransferenciaWorkflow }       from '@/lib/firestore/transferenciaWorkflow'
import TransferenciaWorkflow               from '@/components/TransferenciaWorkflow'
import { useAuth }    from '@/hooks/useAuth'
import { usePermisos } from '@/hooks/usePermisos'
import { useGestoriaId } from '@/context/GestoriaContext'
import { Button, Card, Spinner } from '@/components/ui'
import Modal from '@/components/shared/Modal'
import { EstadoBadge, EstadoSelector } from './EstadoBadge'
import { BotonQR }        from './BotonQR'
import BotonComprobante      from './BotonComprobante'
import BotonComprobantePago  from './BotonComprobantePago'
import { PanelNotas }  from '@/components/shared/PanelNotas'
import { PanelDocumentacion } from '@/components/shared/PanelDocumentacion'
import GestorMultaWorkflow     from '@/components/GestorMultaWorkflow'
import NumeroBadge             from '@/components/shared/NumeroBadge'
import { TIPO_TRAMITE_LABELS, type EstadoTramite } from '@/types'
import type { InscripcionWorkflow, GeoRegistro } from '@/torre_types'
import { formatFecha, formatFechaHora, formatPesos, nombreCompleto } from '@/utils'
import toast from 'react-hot-toast'
import { usePageTitle } from '@/hooks/usePageTitle'

export default function TramiteDetallePage() {
  const { id }     = useParams<{ id: string }>()
  const navigate   = useNavigate()
  const { user }   = useAuth()
  const gestoriaId = useGestoriaId()
  const { tramite, loading } = useTramite(id)
  usePageTitle(tramite ? `${tramite.numero} · ${tramite.patente}` : 'Trámite')
  const { cliente } = useCliente(tramite?.clienteId)
  const { vehiculo } = useVehiculo(tramite?.vehiculoId)
  const [editOpen,   setEditOpen]   = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteNota, setDeleteNota] = useState('')
  const { puede }                  = usePermisos()
  const [editForm, setEditForm] = useState({ descripcion: '', observacionesInternas: '', honorarios: 0 })

  // Tipos de workflow
  const esInscripcion   = tramite?.tipo === 'inscripcion_inicial'
  const esMulta         = tramite?.tipo === 'descargo_multa'
  const esTransferencia = tramite?.tipo === 'transferencia'
  const [wfInscripcion, setWfInscripcion] = useState<InscripcionWorkflow | null>(null)
  const [montoMulta, setMontoMulta] = useState(0)
  const [wfMultaCompletado, setWfMultaCompletado] = useState(false)

  // Suscribir al workflow de inscripción
  useEffect(() => {
    if (!id || !esInscripcion) return
    return subscribeWorkflow(id, setWfInscripcion)
  }, [id, esInscripcion])

  // Suscribir al montoTotal del workflow de multa (para recibo)
  // [FIX] Guard gestoriaId: sin él el listener se abre antes de que Auth resuelva,
  // lanza permission-denied y corrompe el SDK de Firestore para TODOS los listeners.
  useEffect(() => {
    if (!id || !esMulta || !gestoriaId) return
    const unsub = onSnapshot(
      multaWorkflowDoc(id),
      snap => {
        if (!snap.exists()) return
        const data = snap.data()
        const monto = data?.paso2?.montoTotal ?? data?.paso7?.pagoTotalRecibo ?? 0
        setMontoMulta(monto)
        // El workflow está completo cuando alcanza pasoActual 8 o estadoWorkflow='completado'
        const completado = data?.pasoActual >= 8 || data?.estadoWorkflow === 'completado'
        setWfMultaCompletado(completado)
      },
      err => {
        if (err.code === 'permission-denied') return  // Auth aún no resolvió — ignorar
        console.warn('[TramiteDetallePage] multaWorkflow listener:', err.message)
      }
    )
    return unsub
  }, [id, esMulta, gestoriaId])

  // Auto-crear workflow de inscripción y transferencia si no existen.
  // NOTA: el workflow de MULTA lo auto-crea useMultaWorkflow internamente — no duplicar aquí.
  useEffect(() => {
    if (!id || !tramite || !gestoriaId || !user?.uid) return
    if (esInscripcion) {
      crearWorkflow(id, gestoriaId, user.uid).catch(() => {})
    } else if (esTransferencia) {
      crearTransferenciaWorkflow(id, gestoriaId, user.uid, `${user.nombre ?? ''} ${user.apellido ?? ''}`.trim()).catch(() => {})
    }
  }, [id, tramite?.tipo, gestoriaId, user?.uid])

  const handleEliminar = async () => {
    if (!id) return
    try {
      await eliminarTramite(id)
      toast.success('Trámite eliminado')
      navigate('/admin/tramites')
    } catch {
      toast.error('Error al eliminar')
    }
  }

  const [cambiandoEstado,  setCambiandoEstado]  = useState(false)
  const [sincronizando,    setSincronizando]    = useState(false)

  const handleCambiarEstado = async (nuevo: EstadoTramite, nota: string) => {
    if (!tramite || !user || cambiandoEstado) return
    setCambiandoEstado(true)
    try {
      await cambiarEstado(id!, nuevo, nota, user.uid, tramite.estado)
      toast.success(`Estado actualizado → ${nuevo.replace(/_/g, ' ')}`)
    } catch (err: any) {
      console.error('[handleCambiarEstado]', err?.code, err?.message)
      toast.error('Error al cambiar el estado')
    } finally {
      setCambiandoEstado(false)
    }
  }

  const handlePago = async () => {
    if (!tramite) return
    try {
      await marcarPagado(id!, !tramite.pagado)
      toast.success(tramite.pagado ? 'Marcado como pendiente de pago' : '¡Pago registrado!')
    } catch {
      toast.error('Error al actualizar el pago')
    }
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
    } catch {
      toast.error('Error al guardar')
    }
  }

  if (loading) return <Spinner />
  if (!tramite) return (
    <div className="text-center py-20">
      <p className="text-gray-400">Trámite no encontrado.</p>
      <button onClick={() => navigate('/admin/tramites')} className="text-[#D4621A] text-sm mt-2 hover:underline">
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
          {puede('verMetricasFinancieras') && (
            <Button variant="secondary" size="sm"
              onClick={() => setDeleteOpen(true)}
              className="text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200"
            >
              <Trash2 size={14} /> Eliminar
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={abrirEdicion}>
            <Pencil size={14} /> Editar
          </Button>
        </div>
      </div>

      {/* Header principal */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="font-mono text-xs text-gray-400 mb-1">
              <NumeroBadge numero={tramite.numero} tipo={tramite.tipo} size="lg" />
            </p>
            <div className="flex items-center gap-2">
              {esMulta && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  <Scale size={10} /> Multa / LIT
                </span>
              )}
              <h1 className="text-xl font-bold text-gray-900">
                {TIPO_TRAMITE_LABELS[tramite.tipo]}
              </h1>
            </div>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="font-mono text-sm bg-gray-100 text-gray-700 px-3 py-1 rounded-lg tracking-widest font-bold">
                {tramite.patente}
              </span>
              <span className="text-xs text-gray-400">Creado: {formatFecha(tramite.creadoEn)}</span>
              <span className="text-xs text-gray-400">Actualizado: {formatFecha(tramite.actualizadoEn)}</span>
            </div>
          </div>

          {/* Acciones — QR + Comprobante + Estado */}
          <div className="shrink-0 flex items-start gap-2 flex-wrap">
            <BotonQR
              tramiteId={tramite.id}
              patente={tramite.patente}
              tipo={TIPO_TRAMITE_LABELS[tramite.tipo] ?? tramite.tipo}
            />
            <BotonComprobante tramite={tramite} cliente={cliente} vehiculo={vehiculo} />
            <BotonComprobantePago tramite={tramite} cliente={cliente} vehiculo={vehiculo} montoOverride={esMulta && montoMulta > 0 ? montoMulta : undefined} />
            <div>
              <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide font-semibold">Estado</p>
              <EstadoSelector estadoActual={tramite.estado} onCambiar={handleCambiarEstado} />

              {/* Banner: pago en workflow sin reflejar en el trámite (en curso) */}
              {esMulta && puede('cambiarEstadoTramite') && !wfMultaCompletado &&
               montoMulta > 0 && !(tramite.honorarios > 0) && (
                <div className="mt-3 rounded-xl overflow-hidden border border-blue-200 shadow-sm">
                  <div className="bg-blue-600 px-4 py-2.5 flex items-center gap-2">
                    <span className="text-white text-base leading-none">💳</span>
                    <p className="text-white text-xs font-bold tracking-wide">
                      Pago registrado sin sincronizar
                    </p>
                  </div>
                  <div className="bg-blue-50 px-4 py-3">
                    <p className="text-xs text-blue-700 mb-3 leading-relaxed">
                      Se registró un cobro de <strong>$ {montoMulta.toLocaleString('es-AR')}</strong> en
                      el workflow, pero no se reflejó aún en el trámite.
                      Sincronizá para que aparezca en <strong>Cobranzas</strong> y <strong>Reportes</strong>.
                    </p>
                    <button
                      type="button"
                      disabled={sincronizando}
                      onClick={async () => {
                        setSincronizando(true)
                        try {
                          const resultado = await sincronizarPagoMultaAlTramite(tramite.id, gestoriaId)
                          if (resultado.totalCobradoCliente > 0) {
                            toast.success()
                          } else {
                            toast('ℹ️ Sin montos para sincronizar', { icon: 'ℹ️' })
                          }
                        } catch (err: any) {
                          toast.error('Error al sincronizar el pago')
                        } finally {
                          setSincronizando(false)
                        }
                      }}
                      className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700
                                 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed
                                 text-white text-xs font-bold rounded-lg transition-all
                                 flex items-center justify-center gap-2 shadow-sm"
                    >
                      {sincronizando
                        ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sincronizando...</>
                        : <>💳 Sincronizar pago del workflow</>
                      }
                    </button>
                  </div>
                </div>
              )}

              {/* Alertas de sincronización — solo se muestran cuando el workflow está completo */}
              {esMulta && puede('cambiarEstadoTramite') && wfMultaCompletado && (
                <>
                  {/* Botón 1: marcar como entregado */}
                  {!['entregado','completado','cancelado'].includes(tramite.estado) && (
                    <div className="mt-3 rounded-xl overflow-hidden border border-amber-200 shadow-sm">
                      <div className="bg-amber-500 px-4 py-2.5 flex items-center gap-2">
                        <span className="text-white text-base leading-none">⚠️</span>
                        <p className="text-white text-xs font-bold tracking-wide">
                          Workflow completado — estado pendiente
                        </p>
                      </div>
                      <div className="bg-amber-50 px-4 py-3">
                        <p className="text-xs text-amber-700 mb-3 leading-relaxed">
                          El paso 7/7 está <strong>Completado</strong> pero el trámite sigue
                          en estado <strong className="uppercase">{tramite.estado.replace(/_/g,' ')}</strong>.
                          Sincronizá para cerrar el ciclo.
                        </p>
                        <button
                          type="button"
                          disabled={cambiandoEstado}
                          onClick={() => handleCambiarEstado(
                            'entregado',
                            'Cierre por Admin — workflow paso 7/7 completado'
                          )}
                          className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-600
                                     active:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed
                                     text-white text-xs font-bold rounded-lg transition-all
                                     flex items-center justify-center gap-2 shadow-sm"
                        >
                          {cambiandoEstado
                            ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Actualizando...</>
                            : <>🗂️ Marcar como Entregado</>
                          }
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Botón 2: sincronizar pago */}
                  {!tramite.pagado && (
                    <div className="mt-3 rounded-xl overflow-hidden border border-blue-200 shadow-sm">
                      <div className="bg-blue-600 px-4 py-2.5 flex items-center gap-2">
                        <span className="text-white text-base leading-none">💳</span>
                        <p className="text-white text-xs font-bold tracking-wide">
                          Pago registrado sin sincronizar
                        </p>
                      </div>
                      <div className="bg-blue-50 px-4 py-3">
                        <p className="text-xs text-blue-700 mb-3 leading-relaxed">
                          Los cobros del workflow no se reflejaron en el trámite. Al sincronizar
                          quedarán en <strong>Cobranzas</strong> y <strong>Reportes</strong>.
                        </p>
                        <button
                          type="button"
                          disabled={sincronizando}
                          onClick={async () => {
                            setSincronizando(true)
                            try {
                              const resultado = await sincronizarPagoMultaAlTramite(
                                tramite.id,
                                gestoriaId,
                              )
                              if (resultado.totalCobradoCliente > 0) {
                                toast.success(
                                  `✅ Pago sincronizado — $${resultado.honorarios.toLocaleString('es-AR')} honorarios`
                                )
                              } else {
                                toast(`ℹ️ El workflow no tiene montos registrados aún`, { icon: 'ℹ️' })
                              }
                            } catch (err: any) {
                              console.error('[sincronizarPago]', err?.message)
                              toast.error('Error al sincronizar el pago')
                            } finally {
                              setSincronizando(false)
                            }
                          }}
                          className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700
                                     active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed
                                     text-white text-xs font-bold rounded-lg transition-all
                                     flex items-center justify-center gap-2 shadow-sm"
                        >
                          {sincronizando
                            ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sincronizando...</>
                            : <>💳 Sincronizar pago del workflow</>
                          }
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {tramite.descripcion && (
          <p className="mt-4 text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-3">
            {tramite.descripcion}
          </p>
        )}
      </Card>

      {/* Honorarios — solo si NO es multa */}
      {!esMulta && (
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
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                tramite.pagado
                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
              }`}
            >
              {tramite.pagado
                ? <><CheckCircle size={16} /> Pagado</>
                : <><DollarSign size={16} /> Marcar pagado</>
              }
            </button>
          </div>
        </Card>
      )}

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
              className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-[#D4621A]/5
                         rounded-xl border border-gray-100 hover:border-[#D4621A]/20 transition-all text-left"
            >
              <div className="w-9 h-9 rounded-full bg-[#D4621A]/10 flex items-center justify-center
                              text-[#D4621A] font-bold text-xs shrink-0">
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
              className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-[#D4621A]/5
                         rounded-xl border border-gray-100 hover:border-[#D4621A]/20 transition-all text-left"
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

      {/* ── WORKFLOW TRANSFERENCIA ────────────────────────────────────────── */}
      {esTransferencia && id && (
        <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 px-5 py-4 bg-slate-900 border-b border-slate-700">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
              <Car size={16} className="text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Workflow de Transferencia</p>
              <p className="text-xs text-slate-400">Seguimiento paso a paso de la transferencia de dominio</p>
            </div>
          </div>
          <div className="bg-slate-900 p-5">
            <TransferenciaWorkflow tramiteId={id} />
          </div>
        </div>
      )}

      {/* ── WORKFLOW MULTA ────────────────────────────────────────────────── */}
      {esMulta && id && (
        <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 px-5 py-4 bg-slate-900 border-b border-slate-700">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
              <Scale size={16} className="text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Seguimiento del Trámite</p>
              <p className="text-xs text-slate-400">Multas / Infracciones en Litigio (LIT)</p>
            </div>
          </div>
          <div className="bg-slate-900 p-5">
            <GestorMultaWorkflow
              tramiteId={id}
              numeroLITExterno={tramite.descripcion}
            />
          </div>
        </div>
      )}

      {/* ── REGISTRO DE PRESENCIA — Inscripción Inicial ───────────────────── */}
      {esInscripcion && wfInscripcion && (() => {
        const entradas: {
          key: string; icono: React.ReactNode; titulo: string
          detalle: string; geo: GeoRegistro | null | undefined
          gestor: string; fecha: string
        }[] = []

        if (wfInscripcion.paso5) {
          entradas.push({
            key: 'p5', icono: <FileText size={13} className="text-blue-500" />,
            titulo: 'Presentación de documentación',
            detalle: 'Paso 5 — el gestor fue al registro a entregar la documentación',
            geo: wfInscripcion.paso5.ubicacion,
            gestor: wfInscripcion.paso5.completadoPorNombre,
            fecha: formatFechaHora(wfInscripcion.paso5.completadoEn),
          })
        }

        wfInscripcion.paso6?.intentos.forEach((intento, i) => {
          const esRetiro = intento.resultado === 'retirado'
          entradas.push({
            key: `p6-${i}`,
            icono: esRetiro
              ? <CheckCircle size={13} className="text-emerald-500" />
              : <Clock size={13} className="text-amber-500" />,
            titulo: esRetiro
              ? `Retiro de chapa confirmado — intento ${intento.numero}`
              : `Postergado ${intento.nuevosDias ?? '?'} días más — intento ${intento.numero}`,
            detalle: intento.nota ?? (esRetiro ? 'Chapa retirada exitosamente' : 'Sin observación'),
            geo: intento.ubicacion,
            gestor: intento.respondidoPorNombre,
            fecha: formatFechaHora(intento.respondidoEn),
          })
        })

        if (!entradas.length) return null

        return (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Navigation size={14} className="text-[#D4621A]" />
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Registro de presencia en registro
              </p>
            </div>
            <div className="space-y-3">
              {entradas.map(entrada => (
                <div key={entrada.key} className="flex gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                    {entrada.icono}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-800 leading-tight">{entrada.titulo}</p>
                      <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">{entrada.fecha}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{entrada.gestor}</p>
                    {entrada.detalle && <p className="text-xs text-gray-400 mt-1 italic">{entrada.detalle}</p>}
                    {entrada.geo ? (
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-100">
                          <MapPin size={11} className="text-emerald-600 shrink-0" />
                          <span className="text-[11px] font-medium text-emerald-700">
                            {entrada.geo.direccionAprox ?? `${entrada.geo.lat.toFixed(5)}, ${entrada.geo.lng.toFixed(5)}`}
                          </span>
                          <span className="text-[10px] text-emerald-500">±{entrada.geo.precisionM}m</span>
                        </div>
                        <a href={`https://www.google.com/maps?q=${entrada.geo.lat},${entrada.geo.lng}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 transition-colors">
                          Ver en Maps <ExternalLink size={10} />
                        </a>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 mt-2 px-2 py-1 rounded-lg bg-gray-100 border border-gray-200 w-fit">
                        <MapPin size={11} className="text-gray-400 shrink-0" />
                        <span className="text-[11px] text-gray-400">Ubicación no registrada</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )
      })()}

      {/* ── Documentación cargada ── solo admin/admin_gral/propietario ───────── */}
      {tramite && (esInscripcion || esMulta || esTransferencia) && (
        <PanelDocumentacion tramiteId={tramite.id} tipo={tramite.tipo} />
      )}

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
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Historial de estados</p>
        </div>
        {!tramite.historialEstados?.length ? (
          <p className="text-sm text-gray-400 text-center py-3">Sin cambios de estado registrados.</p>
        ) : (
          <div className="space-y-3">
            {[...tramite.historialEstados].reverse().map((h, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#D4621A] mt-2 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <EstadoBadge estado={h.estadoAnterior} />
                    <span className="text-gray-300 text-xs">→</span>
                    <EstadoBadge estado={h.estadoNuevo} />
                    <span className="text-xs text-gray-400">
                      {h?.fecha ? formatFechaHora(h.fecha as any) : ''}
                    </span>
                  </div>
                  {h.nota && <p className="text-xs text-gray-500 mt-1 italic">"{h.nota}"</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Observaciones internas */}
      {tramite.observacionesInternas && (
        <Card className="p-5 border-l-4 border-l-amber-400">
          <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">Observaciones internas</p>
          <p className="text-sm text-gray-600">{tramite.observacionesInternas}</p>
        </Card>
      )}

      {/* Modal editar */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar Trámite" size="md">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
              Descripción {esMulta && <span className="text-amber-500 normal-case font-normal">(se usa como N° de LIT)</span>}
            </label>
            <textarea
              value={editForm.descripcion}
              onChange={e => setEditForm(p => ({ ...p, descripcion: e.target.value }))}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#D4621A] resize-none"
              placeholder={esMulta ? 'Ej: LIT-2024-00123' : 'Detalle del trámite...'}
            />
          </div>
          {!esMulta && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Honorarios ($)</label>
              <input type="number" min={0} value={editForm.honorarios}
                onChange={e => setEditForm(p => ({ ...p, honorarios: Number(e.target.value) }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#D4621A]"
              />
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Observaciones internas</label>
            <textarea value={editForm.observacionesInternas}
              onChange={e => setEditForm(p => ({ ...p, observacionesInternas: e.target.value }))}
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#D4621A] resize-none"
              placeholder="Solo visible para el equipo..."
            />
          </div>
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <Button onClick={handleGuardar} className="flex-1">Guardar cambios</Button>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>
      {/* Modal eliminar — solo propietario */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Eliminar trámite" size="sm">
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-sm font-semibold text-red-700 mb-1">⚠️ Acción irreversible</p>
            <p className="text-xs text-red-600">Esta acción elimina el trámite y todos sus datos permanentemente. No se puede deshacer.</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1.5">Motivo de eliminación *</label>
            <textarea value={deleteNota} onChange={e => setDeleteNota(e.target.value)}
              rows={2} placeholder="Ej: Trámite de prueba, carga errónea..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-red-400 resize-none"
            />
          </div>
          <div className="flex gap-3">
            <Button onClick={handleEliminar} disabled={!deleteNota.trim()}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0">
              Confirmar eliminación
            </Button>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

    </div>
  )
}