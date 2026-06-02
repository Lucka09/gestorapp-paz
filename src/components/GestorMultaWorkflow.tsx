// src/components/GestorMultaWorkflow.tsx
import { useState, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { useMultaWorkflow }  from '@/hooks/useMultaWorkflow'
import { useAuthStore }      from '@/store/authStore'
import { usePermisos }       from '@/hooks/usePermisos'
import { useGestoresEquipo, useGestoresMulta } from '@/hooks/useEquipo'
import { editarFechaTramiteMulta } from '@/lib/firestore/MultaWorwflow'
import {
  PASOS_MULTA_CONFIG, ESTADO_MULTA_LABELS, ESTADO_MULTA_COLORS,
  METODOS_PAGO_LABELS, documentacionCompleta,
} from '@/multa_types'
import type { MetodoPago, RegistroPago } from '@/multa_types'
import {
  AlertTriangle, CheckCircle2, Clock, RotateCcw,
  Upload, X, Eye, ChevronDown, ChevronUp,
  DollarSign, User, FileText, Camera, Download, ZoomIn, PlusCircle, CreditCard,
  Pencil, History, ShieldCheck,
} from 'lucide-react'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function formatARS(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
}

function FotoUploader({
  label, required = false, onChange, preview,
}: {
  label: string; required?: boolean
  onChange: (f: File | undefined) => void
  preview?: string | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-1">
        {label}{required ? ' *' : ' (opcional)'}
      </p>
      <div
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-gray-200 rounded-xl p-3 flex flex-col
                   items-center justify-center gap-1 cursor-pointer hover:border-[#D4621A]/40
                   hover:bg-[#D4621A]/5 transition-all min-h-[80px]"
      >
        {preview ? (
          <div className="relative w-full">
            <img src={preview} alt={label} className="w-full h-24 object-cover rounded-lg" />
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onChange(undefined) }}
              className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
            >
              <X size={10} />
            </button>
          </div>
        ) : (
          <>
            <Camera size={20} className="text-gray-300" />
            <span className="text-xs text-gray-400">Tap para subir foto</span>
          </>
        )}
      </div>
      <input
        ref={inputRef} type="file" accept="image/*" capture="environment"
        className="hidden"
        onChange={e => onChange(e.target.files?.[0])}
      />
    </div>
  )
}

function BadgeEstado({ estado }: { estado: keyof typeof ESTADO_MULTA_LABELS }) {
  return (
    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${ESTADO_MULTA_COLORS[estado]}`}>
      {ESTADO_MULTA_LABELS[estado]}
    </span>
  )
}


// ─── VISOR DE DOCUMENTACIÓN — para Admin en paso 3 ───────────────────────────

interface FotoDoc {
  label: string
  foto?: { url: string; nombre?: string; storageRef?: string }
}

function VisorDocumentacion({ fotos }: { fotos: FotoDoc[] }) {
  const [ampliada, setAmpliada] = useState<string | null>(null)
  const disponibles = fotos.filter(f => f.foto?.url)

  if (!disponibles.length) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
        ⚠️ No hay documentación adjunta en este trámite.
      </div>
    )
  }

  return (
    <>
      {/* Lightbox */}
      {ampliada && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setAmpliada(null)}
        >
          <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <img src={ampliada} alt="Documento" className="w-full rounded-xl shadow-2xl" />
            <div className="flex gap-2 mt-3 justify-center">
              <a
                href={ampliada}
                download
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-white text-gray-800 rounded-xl text-sm font-semibold hover:bg-gray-100"
                onClick={e => e.stopPropagation()}
              >
                <Download size={14} /> Descargar
              </a>
              <button
                onClick={() => setAmpliada(null)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-xl text-sm font-semibold hover:bg-gray-600"
              >
                <X size={14} /> Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grid de fotos */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-gray-600 flex items-center gap-1.5">
          <Eye size={12} /> Documentación adjunta ({disponibles.length} archivos)
        </p>
        <div className="grid grid-cols-2 gap-2">
          {disponibles.map(({ label, foto }) => (
            <div key={label} className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
              <img
                src={foto!.url}
                alt={label}
                className="w-full h-28 object-cover"
              />
              {/* Overlay con acciones */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                <button
                  onClick={() => setAmpliada(foto!.url)}
                  className="w-8 h-8 bg-white rounded-full flex items-center justify-center hover:bg-gray-100"
                  title="Ver ampliado"
                >
                  <ZoomIn size={14} className="text-gray-800" />
                </button>
                <a
                  href={foto!.url}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="w-8 h-8 bg-white rounded-full flex items-center justify-center hover:bg-gray-100"
                  title="Descargar"
                >
                  <Download size={14} className="text-gray-800" />
                </a>
              </div>
              {/* Label */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                <span className="text-white text-[10px] font-semibold">{label}</span>
              </div>
            </div>
          ))}
        </div>
        {/* Links de descarga individual */}
        <div className="flex flex-wrap gap-1 mt-1">
          {disponibles.map(({ label, foto }) => (
            <a
              key={label}
              href={foto!.url}
              target="_blank"
              rel="noreferrer"
              download
              className="flex items-center gap-1 text-[11px] font-semibold text-[#D4621A] hover:underline"
            >
              <Download size={10} /> {label}
            </a>
          ))}
        </div>
      </div>
    </>
  )
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

interface Props { tramiteId: string; numeroLITExterno?: string }

export default function GestorMultaWorkflow({ tramiteId, numeroLITExterno }: Props) {
  const { user }   = useAuthStore()
  const { puede }  = usePermisos()
  const esAdmin           = puede('editarConfiguracion') || user?.rol === 'admin' || user?.rol === 'propietario' || user?.rol === 'admin_gral'
  const esAsesorComercial = user?.rol === 'asesor_comercial'
  // Asesor: roles que hacen recepción y documentación (pasos 1 y 2)
  const esAsesor          = esAsesorComercial || ['vendedor', 'operador'].includes(user?.rol ?? '') || !esAdmin
  // Puede asignar responsable: el asesor_comercial que creó el trámite O el admin/propietario
  const puedeAsignar      = esAsesorComercial || esAdmin
  // Solo propietario, admin_gral y admin pueden cerrar el paso 7
  const puedeCerrarPaso7  = user?.rol === 'propietario' || user?.rol === 'admin_gral' || user?.rol === 'admin'
  const { gestores: gestoresEquipo } = useGestoresEquipo()
  const { gestores: gestoresMulta }  = useGestoresMulta()

  const {
    workflow, loading, guardando, error, progreso, pasoActual,
    confirmarPaso1, confirmarPaso2,
    confirmarPreRevision, resolverRebote, resolverMesaAyuda,
    confirmarPaso4, confirmarPaso5, confirmarPaso6, confirmarPaso7,
    asignarAdmin,
    agregarPago,
  } = useMultaWorkflow(tramiteId)

  // ── Estado local de formularios ───────────────────────────────────────────

  // Modal de pago
  const [modalPago, setModalPago] = useState(false)
  const [nuevoPagoModal, setNuevoPagoModal] = useState<{
    monto: number; metodoPago: MetodoPago; nota: string
  }>({ monto: 0, metodoPago: 'efectivo', nota: '' })

  const handleAgregarPago = async () => {
    if (!nuevoPagoModal.monto || nuevoPagoModal.monto <= 0) {
      toast.error('Ingresá un monto válido')
      return
    }
    await agregarPago(nuevoPagoModal.monto, nuevoPagoModal.metodoPago, nuevoPagoModal.nota || undefined)
    setNuevoPagoModal({ monto: 0, metodoPago: 'efectivo', nota: '' })
    setModalPago(false)
  }

  // Paso 1
  const [p1, setP1] = useState({
    patente: '', nombreCompleto: '', dni: '',
    fechaTramite: '', fechaInfraccion: '', requiereSUATS: false, observacion: '',
  })

  // Paso 2 — archivos
  const [archivos, setArchivos] = useState<Record<string, File | undefined>>({})
  const [previews, setPreviews] = useState<Record<string, string | null>>({})
  const setArchivo = (campo: string) => (file: File | undefined) => {
    setArchivos(prev => ({ ...prev, [campo]: file }))
    setPreviews(prev => ({
      ...prev,
      [campo]: file ? URL.createObjectURL(file) : null,
    }))
  }
  const [p2, setP2] = useState({
    tieneCedula: true, tieneTitulo: false,
    observacionDocumentacion: '',
    presupuestoEnviado: false, pagoConfirmado: false,
    historialPagos: [] as RegistroPago[],
    montoTotal: 0,
  })
  const [nuevoPago, setNuevoPago] = useState({ monto: 0, metodoPago: 'efectivo' as MetodoPago, nota: '' })

  // Paso 3 — pre-revisión
  const [p3, setP3] = useState({
    resultado: 'ok' as 'ok' | 'rebotado' | 'mesa_ayuda',
    observacion: '', motivoRebote: '', motivoMesaAyuda: '',
    emailMesaAyuda: '', plazoEspera: '48hs' as '24hs' | '48hs' | '72hs',
  })

  // Rebote resolución
  const [rebote, setRebote] = useState({
    requiereInformePersona: false,
    informePersonaPagado: false,
    observacion: '',
  })
  const [archivosRebote, setArchivosRebote] = useState<Record<string, File | undefined>>({})
  const [previewsRebote, setPreviewsRebote] = useState<Record<string, string | null>>({})

  // Paso 4
  const [p4, setP4] = useState({ notasRevision: '', cantidadMultas: 0, borradoresListos: false, observacion: '' })

  // Paso 5 — fotos descargo
  const [fotosDescargo, setFotosDescargo] = useState<File[]>([])
  const [p5obs, setP5obs] = useState('')

  // Paso 6
  const [p6, setP6] = useState({ suatsGenerado: false, observacion: '' })
  const [fotosSuats, setFotosSuats] = useState<File[]>([])

  // Paso 7
  const [p7, setP7] = useState({
    clienteAvisado: false, suatsEntregado: false,
    canalEntrega: 'whatsapp' as 'presencial' | 'whatsapp' | 'email' | 'otro',
    observacionFinal: '',
    suatsAbonado: false,
    montoSUATS: 0,
    pagoTotalRecibo: 0,
  })

  const [pasosColapsados, setPasosColapsados] = useState<Record<number, boolean>>({})
  const toggle = (n: number) => setPasosColapsados(p => ({ ...p, [n]: !p[n] }))

  // ── Edición de fecha del trámite ──────────────────────────────────────────
  const [editandoFecha, setEditandoFecha]     = useState(false)
  const [nuevaFecha, setNuevaFecha]           = useState('')
  const [notaFecha, setNotaFecha]             = useState('')
  const [guardandoFecha, setGuardandoFecha]   = useState(false)
  const [mostrarHistFecha, setMostrarHistFecha] = useState(false)

  // ── Confirmación de asignación de admin ───────────────────────────────────
  const [confirmAsignacion, setConfirmAsignacion] = useState<{ uid: string; nombre: string } | null>(null)

  // ── Agregar pago al historial ─────────────────────────────────────────────
  const agregarPagoLocal = () => {
    if (!user || nuevoPago.monto <= 0) return
    const pago: RegistroPago = {
      ...nuevoPago,
      registradoPor:       user.uid,
      registradoPorNombre: `${user.nombre} ${user.apellido}`.trim(),
      registradoEn:        { toDate: () => new Date() } as any,
    }
    const hist = [...p2.historialPagos, pago]
    setP2(prev => ({
      ...prev,
      historialPagos: hist,
      montoTotal: hist.reduce((s, p) => s + p.monto, 0),
    }))
    setNuevoPago({ monto: 0, metodoPago: 'efectivo', nota: '' })
  }

  // ── Guardar edición de fecha del trámite ──────────────────────────────────
  const handleGuardarFecha = async () => {
    if (!nuevaFecha || !user) return
    setGuardandoFecha(true)
    try {
      await editarFechaTramiteMulta(
        tramiteId,
        nuevaFecha,
        user.uid,
        `${user.nombre} ${user.apellido}`.trim(),
        notaFecha || undefined,
      )
      toast.success('Fecha del trámite actualizada con registro de auditoría ✓')
      setEditandoFecha(false)
      setNuevaFecha('')
      setNotaFecha('')
    } catch {
      toast.error('Error al actualizar la fecha')
    } finally {
      setGuardandoFecha(false)
    }
  }

  // ── Confirmar asignación de admin ─────────────────────────────────────────
  const handleConfirmarAsignacion = async () => {
    if (!confirmAsignacion) return
    await asignarAdmin(confirmAsignacion.uid, confirmAsignacion.nombre)
    setConfirmAsignacion(null)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-2 border-[#D4621A] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!workflow) return null

  const estadoActual = workflow.estadoWorkflow
  const esRebotado   = estadoActual === 'rebotado'
  const esMesa       = estadoActual === 'en_espera_mesa'

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Header estado */}
      <div className="flex items-center justify-between p-4 bg-[#1A1A1A] rounded-2xl">
        <div>
          <p className="text-white font-bold text-sm">Workflow de Multas</p>
          <p className="text-gray-400 text-xs mt-0.5">
            Paso {Math.min(pasoActual, 7)} de 7 · Iniciado por {workflow.iniciadoPorNombre}
          </p>
        </div>
        <BadgeEstado estado={estadoActual} />
      </div>

      {/* Alerta rebote */}
      {esRebotado && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <RotateCcw size={16} className="text-red-600" />
            <p className="text-sm font-bold text-red-700">Trámite rebotado por el Admin</p>
          </div>
          <p className="text-xs text-red-600 mb-1">
            <strong>Motivo:</strong> {workflow.paso3?.motivoRebote ?? 'Ver observación del Admin'}
          </p>
          <p className="text-xs text-red-500">
            Resolvé la documentación solicitada y reenvíalo al Admin.
          </p>
        </div>
      )}

      {/* Alerta mesa de ayuda */}
      {esMesa && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} className="text-amber-600" />
            <p className="text-sm font-bold text-amber-700">En espera — Mesa de ayuda externa</p>
          </div>
          <p className="text-xs text-amber-600 mb-1">
            <strong>Motivo:</strong> {workflow.paso3?.motivoMesaAyuda}
          </p>
          <p className="text-xs text-amber-600 mb-1">
            <strong>Plazo estimado:</strong> {workflow.paso3?.plazoEspera ?? '48hs'} hábiles
          </p>
          {workflow.paso3?.emailMesaAyuda && (
            <p className="text-xs text-amber-500">Email enviado a: {workflow.paso3.emailMesaAyuda}</p>
          )}
          {esAdmin && (
            <button
              onClick={() => resolverMesaAyuda()}
              className="mt-3 w-full py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-colors"
            >
              ✅ Respuesta recibida — Continuar gestión
            </button>
          )}
        </div>
      )}

      {/* Asignar responsable de verificación — asesor_comercial O admin */}
      {!workflow.asignadoAdminId && pasoActual >= 3 && puedeAsignar && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div>
            <p className="text-xs font-bold text-blue-800 mb-0.5">
              Asignar responsable de verificación
            </p>
            <p className="text-xs text-blue-600">
              Seleccioná el Admin o Gestor/Mandatario que va a verificar la documentación
              y continuar la gestión de la multa.
            </p>
          </div>
          <select
            onChange={e => {
              const g = gestoresMulta.find((g: any) => g.uid === e.target.value)
              if (g) setConfirmAsignacion({ uid: g.uid, nombre: `${(g as any).nombre} ${(g as any).apellido}`.trim() })
              // Reset select
              e.target.value = ''
            }}
            defaultValue=""
            className="w-full px-3 py-2 border border-blue-200 rounded-xl text-sm outline-none
                       focus:border-[#D4621A] bg-white"
          >
            <option value="">— Seleccioná el responsable —</option>
            {gestoresMulta.filter((g: any) => g.activo !== false).map((g: any) => {
              const rolLabel: Record<string, string> = {
                propietario: 'Propietario',
                admin_gral:  'Admin General',
                admin:       'Administrador',
                gestor:      'Gestor / Mandatario',
              }
              return (
                <option key={g.uid} value={g.uid}>
                  {g.nombre} {g.apellido} — {rolLabel[g.rol] ?? g.rol}
                </option>
              )
            })}
          </select>
          {gestoresMulta.length === 0 && (
            <p className="text-xs text-amber-600">
              No hay admins ni gestores disponibles en el equipo.
            </p>
          )}
        </div>
      )}
      {workflow.asignadoAdminId && (
        <div className="flex items-center gap-2 text-xs text-gray-600 bg-blue-50
                        border border-blue-100 rounded-xl px-3 py-2">
          <User size={12} className="text-blue-500 shrink-0" />
          <span>
            Responsable asignado:{' '}
            <strong className="text-blue-800">{workflow.asignadoAdminNombre}</strong>
          </span>
        </div>
      )}

      {/* ── PANEL DE PAGOS — disponible desde paso 2 en adelante ── */}
      {workflow.paso2 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <CreditCard size={14} className="text-emerald-600" />
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Historial de pagos
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-emerald-700">
                Total: {formatARS(workflow.paso2?.montoTotal ?? 0)}
              </span>
              <button
                onClick={() => setModalPago(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700
                           text-white text-xs font-bold rounded-xl transition-colors"
              >
                <PlusCircle size={12} /> Registrar pago
              </button>
            </div>
          </div>
          <div className="px-4 py-3">
            {(!workflow.paso2?.historialPagos || workflow.paso2.historialPagos.length === 0) ? (
              <p className="text-xs text-gray-400 text-center py-2">
                Sin pagos registrados — usá el botón para agregar el primero
              </p>
            ) : (
              <div className="space-y-2">
                {workflow.paso2.historialPagos.map((pago, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                    <div>
                      <span className="text-xs font-semibold text-gray-700">
                        {METODOS_PAGO_LABELS[pago.metodoPago]}
                      </span>
                      {pago.nota && <span className="text-xs text-gray-400"> — {pago.nota}</span>}
                      {pago.registradoPorNombre && (
                        <p className="text-[10px] text-gray-400">{pago.registradoPorNombre}</p>
                      )}
                    </div>
                    <span className="text-sm font-bold text-emerald-700">{formatARS(pago.monto)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-gray-100 px-1">
                  <span className="text-xs font-bold text-gray-500">Total acumulado</span>
                  <span className="text-sm font-bold text-emerald-700">
                    {formatARS(workflow.paso2.montoTotal ?? 0)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL REGISTRAR PAGO ── */}
      {modalPago && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4"
          onClick={() => setModalPago(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <CreditCard size={16} className="text-emerald-600" />
                Registrar pago
              </h3>
              <button onClick={() => setModalPago(false)}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                <X size={14} className="text-gray-600" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Monto ($)
              </label>
              <input
                type="number" min={1} step={100}
                value={nuevoPagoModal.monto || ''}
                onChange={e => setNuevoPagoModal(p => ({ ...p, monto: Number(e.target.value) }))}
                placeholder="Ej: 15000"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-lg font-bold
                           outline-none focus:border-emerald-500 text-gray-900"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Método de pago
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(METODOS_PAGO_LABELS) as [MetodoPago, string][]).map(([k, v]) => (
                  <button key={k} type="button"
                    onClick={() => setNuevoPagoModal(p => ({ ...p, metodoPago: k }))}
                    className={`py-2 px-3 rounded-xl border-2 text-xs font-semibold transition-all text-left
                      ${nuevoPagoModal.metodoPago === k
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Nota / concepto <span className="font-normal text-gray-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={nuevoPagoModal.nota}
                onChange={e => setNuevoPagoModal(p => ({ ...p, nota: e.target.value }))}
                placeholder="Ej: Seña, saldo final, 1er cuota..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                           outline-none focus:border-emerald-400 text-gray-700"
              />
            </div>

            <button
              onClick={handleAgregarPago}
              disabled={guardando || !nuevoPagoModal.monto || nuevoPagoModal.monto <= 0}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold
                         rounded-xl text-sm transition-colors disabled:opacity-50 flex items-center
                         justify-center gap-2"
            >
              {guardando ? 'Guardando...' : (
                <><CheckCircle2 size={15} /> Confirmar — {formatARS(nuevoPagoModal.monto || 0)}</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── PASO 1 ── */}
      {renderPasoHeader(1, pasoActual, pasosColapsados, toggle)}
      {!pasosColapsados[1] && pasoActual >= 1 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
          {pasoActual === 1 ? (
            <>
              {/* Advertencia fecha */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700">
                  <strong>Importante:</strong> La fecha del trámite es crítica. Una fecha incorrecta puede
                  generar conflictos con multas sentenciadas. Verificar con el cliente antes de confirmar.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Patente *', key: 'patente', placeholder: 'AB 123 CD' },
                  { label: 'DNI *', key: 'dni', placeholder: '20123456' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">{f.label}</label>
                    <input
                      value={(p1 as any)[f.key]}
                      onChange={e => setP1(prev => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A] uppercase"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Nombre completo *</label>
                <input
                  value={p1.nombreCompleto}
                  onChange={e => setP1(prev => ({ ...prev, nombreCompleto: e.target.value }))}
                  placeholder="Apellido, Nombre"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">
                  Fecha del trámite * <span className="text-amber-600">(verificar con el cliente)</span>
                </label>
                <input
                  type="date"
                  value={p1.fechaTramite}
                  onChange={e => setP1(prev => ({ ...prev, fechaTramite: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">
                  Fecha de la infracción
                  <span className="text-gray-400 font-normal ml-1">(opcional — editable luego)</span>
                </label>
                <input
                  type="date"
                  value={p1.fechaInfraccion}
                  onChange={e => setP1(prev => ({ ...prev, fechaInfraccion: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
                />
              </div>
              <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={p1.requiereSUATS}
                  onChange={e => setP1(prev => ({ ...prev, requiereSUATS: e.target.checked }))}
                  className="w-4 h-4 accent-[#D4621A]"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">El cliente requiere informe SUATS</p>
                  <p className="text-xs text-gray-400">Se generará al finalizar el descargo</p>
                </div>
              </label>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Observaciones (opcional)</label>
                <textarea
                  value={p1.observacion}
                  onChange={e => setP1(prev => ({ ...prev, observacion: e.target.value }))}
                  placeholder="Notas adicionales del caso..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A] resize-none"
                />
              </div>
              <button
                disabled={!p1.patente || !p1.nombreCompleto || !p1.dni || !p1.fechaTramite || guardando}
                onClick={() => confirmarPaso1(p1)}
                className="w-full py-3 bg-[#D4621A] hover:bg-[#b8541a] text-white font-semibold rounded-xl
                           text-sm transition-colors disabled:opacity-50"
              >
                {guardando ? 'Guardando...' : 'Confirmar recepción →'}
              </button>
            </>
          ) : (
            <>
            <ResumenPaso datos={[
              { label: 'Patente',     val: workflow.paso1?.patente ?? '—' },
              { label: 'Titular',     val: workflow.paso1?.nombreCompleto ?? '—' },
              { label: 'DNI',         val: workflow.paso1?.dni ?? '—' },
              { label: 'Fecha trámite',   val: workflow.paso1?.fechaTramite   ?? '—' },
              { label: 'Fecha infracción', val: workflow.paso1?.fechaInfraccion ?? '—' },
              { label: 'SUATS',       val: workflow.paso1?.requiereSUATS ? 'Sí, requerido' : 'No requerido' },
            ]} />

            {/* ── Edición de fecha del trámite ── */}
            {workflow.paso1?.fechaTramite && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-gray-600 flex items-center gap-1">
                    <History size={12} /> Fecha del trámite
                  </p>
                  {!editandoFecha && (
                    <button
                      onClick={() => { setNuevaFecha(workflow.paso1?.fechaTramite ?? ''); setEditandoFecha(true) }}
                      className="flex items-center gap-1 text-xs text-[#D4621A] hover:text-[#b8541a] font-semibold"
                    >
                      <Pencil size={11} /> Editar fecha
                    </button>
                  )}
                </div>
                <p className="text-sm font-semibold text-gray-800 mb-2">
                  📅 {workflow.paso1.fechaTramite}
                </p>

                {editandoFecha && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                    <p className="text-xs text-amber-700 font-semibold flex items-center gap-1">
                      <AlertTriangle size={12} /> Editando fecha — se registrará auditoría
                    </p>
                    <input
                      type="date"
                      value={nuevaFecha}
                      onChange={e => setNuevaFecha(e.target.value)}
                      className="w-full px-3 py-2 border border-amber-300 rounded-xl text-sm outline-none focus:border-[#D4621A] bg-white"
                    />
                    <input
                      type="text"
                      value={notaFecha}
                      onChange={e => setNotaFecha(e.target.value)}
                      placeholder="Motivo del cambio (opcional)"
                      className="w-full px-3 py-2 border border-amber-200 rounded-xl text-sm outline-none focus:border-[#D4621A] bg-white"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditandoFecha(false); setNuevaFecha(''); setNotaFecha('') }}
                        className="flex-1 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50"
                      >Cancelar</button>
                      <button
                        disabled={!nuevaFecha || guardandoFecha}
                        onClick={handleGuardarFecha}
                        className="flex-1 py-2 bg-[#D4621A] text-white rounded-xl text-xs font-semibold disabled:opacity-50 hover:bg-[#b8541a]"
                      >{guardandoFecha ? 'Guardando...' : 'Guardar cambio'}</button>
                    </div>
                  </div>
                )}

                {/* Historial de cambios de fecha */}
                {(workflow.historialFechaTramite?.length ?? 0) > 0 && (
                  <div className="mt-2">
                    <button
                      onClick={() => setMostrarHistFecha(p => !p)}
                      className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                    >
                      <History size={11} />
                      {mostrarHistFecha ? 'Ocultar historial' : `Ver historial (${workflow.historialFechaTramite!.length} cambio${workflow.historialFechaTramite!.length > 1 ? 's' : ''})`}
                    </button>
                    {mostrarHistFecha && (
                      <div className="mt-2 space-y-1.5 bg-gray-50 rounded-xl p-3">
                        {workflow.historialFechaTramite!.map((h, i) => (
                          <div key={i} className="text-xs text-gray-600 flex flex-col gap-0.5 border-b border-gray-100 pb-1.5 last:border-0 last:pb-0">
                            <span className="font-semibold text-gray-800">
                              {h.valorAnterior} → {h.valorNuevo}
                            </span>
                            <span className="text-gray-400">
                              Por {h.modificadoPorNombre} · {h.modificadoEn?.toDate?.()?.toLocaleDateString('es-AR') ?? '—'}
                            </span>
                            {h.nota && <span className="italic text-gray-500">{h.nota}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            </>
          )}
        </div>
      )}

      {/* ── PASO 2 — Documentación + Honorarios ── */}
      {pasoActual >= 2 && renderPasoHeader(2, pasoActual, pasosColapsados, toggle)}
      {pasoActual >= 2 && !pasosColapsados[2] && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-5">
          {pasoActual === 2 || esRebotado ? (
            <>
              {/* Tipo de documento secundario */}
              <div className="flex gap-3">
                {[
                  { key: 'tieneCedula', label: 'Tiene Cédula' },
                  { key: 'tieneTitulo', label: 'Tiene Título (sin cédula)' },
                ].map(opt => (
                  <label key={opt.key} className="flex-1 flex items-center gap-2 p-3 border border-gray-200 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(p2 as any)[opt.key]}
                      onChange={e => setP2(prev => ({ ...prev, [opt.key]: e.target.checked }))}
                      className="accent-[#D4621A]"
                    />
                    <span className="text-sm text-gray-700">{opt.label}</span>
                  </label>
                ))}
              </div>

              {/* Fotos DNI */}
              <div>
                <p className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1">
                  <FileText size={12} /> DNI del titular
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <FotoUploader label="DNI Frente" required onChange={setArchivo('fotoDniFrente')} preview={previews['fotoDniFrente']} />
                  <FotoUploader label="DNI Dorso"  required onChange={setArchivo('fotoDniDorso')} preview={previews['fotoDniDorso']} />
                </div>
              </div>

              {/* Fotos Cédula */}
              {p2.tieneCedula && (
                <div>
                  <p className="text-xs font-bold text-gray-600 mb-2">Cédula del vehículo</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FotoUploader label="Cédula Frente" onChange={setArchivo('fotoCedulaFrente')} preview={previews['fotoCedulaFrente']} />
                    <FotoUploader label="Cédula Dorso"  onChange={setArchivo('fotoCedulaDorso')}  preview={previews['fotoCedulaDorso']} />
                  </div>
                </div>
              )}

              {/* Fotos Título */}
              {p2.tieneTitulo && (
                <div>
                  <p className="text-xs font-bold text-gray-600 mb-2">Título del vehículo</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FotoUploader label="Título Frente" onChange={setArchivo('fotoTituloFrente')} preview={previews['fotoTituloFrente']} />
                    <FotoUploader label="Título Dorso"  onChange={setArchivo('fotoTituloDorso')}  preview={previews['fotoTituloDorso']} />
                  </div>
                </div>
              )}

              {/* Observación si falta algo */}
              {(!p2.tieneCedula && !p2.tieneTitulo) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-amber-700 mb-2">
                    ⚠️ Sin cédula ni título — observación obligatoria
                  </p>
                  <textarea
                    value={p2.observacionDocumentacion}
                    onChange={e => setP2(prev => ({ ...prev, observacionDocumentacion: e.target.value }))}
                    placeholder="Aclará por qué no se pudo obtener la documentación..."
                    rows={2}
                    className="w-full px-3 py-2 border border-amber-300 rounded-xl text-sm outline-none resize-none bg-white"
                  />
                </div>
              )}
              {(p2.tieneCedula || p2.tieneTitulo) && (
                <textarea
                  value={p2.observacionDocumentacion}
                  onChange={e => setP2(prev => ({ ...prev, observacionDocumentacion: e.target.value }))}
                  placeholder="Observaciones sobre la documentación (opcional)..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none resize-none"
                />
              )}

              {/* Progreso de subida */}
              {progreso > 0 && progreso < 100 && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Subiendo fotos...</span><span>{progreso}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full">
                    <div className="h-full bg-[#D4621A] rounded-full transition-all" style={{ width: `${progreso}%` }} />
                  </div>
                </div>
              )}

              {/* ── Honorarios ── */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-bold text-gray-600 mb-3 flex items-center gap-1">
                  <DollarSign size={12} /> Honorarios y cobros
                </p>
                <div className="space-y-2 mb-3">
                  {p2.historialPagos.map((pago, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2 text-sm">
                      <span className="text-gray-700">{METODOS_PAGO_LABELS[pago.metodoPago]}</span>
                      <span className="font-bold text-emerald-700">{formatARS(pago.monto)}</span>
                    </div>
                  ))}
                  {p2.historialPagos.length > 0 && (
                    <div className="flex justify-between px-3 py-2 font-bold text-sm border-t border-gray-200">
                      <span>Total cobrado</span>
                      <span className="text-emerald-700">{formatARS(p2.montoTotal)}</span>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number" placeholder="Monto $" value={nuevoPago.monto || ''}
                    onChange={e => setNuevoPago(prev => ({ ...prev, monto: Number(e.target.value) }))}
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
                  />
                  <select
                    value={nuevoPago.metodoPago}
                    onChange={e => setNuevoPago(prev => ({ ...prev, metodoPago: e.target.value as MetodoPago }))}
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
                  >
                    {Object.entries(METODOS_PAGO_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <button onClick={agregarPagoLocal} className="py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-colors">
                    + Agregar pago
                  </button>
                </div>
                <div className="flex gap-3 mt-3">
                  {[
                    { key: 'presupuestoEnviado', label: 'Presupuesto enviado al cliente' },
                    { key: 'pagoConfirmado',     label: 'Pago confirmado' },
                  ].map(opt => (
                    <label key={opt.key} className="flex-1 flex items-center gap-2 p-3 border border-gray-200 rounded-xl cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={(p2 as any)[opt.key]}
                        onChange={e => setP2(prev => ({ ...prev, [opt.key]: e.target.checked }))}
                        className="accent-[#D4621A]"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              <button
                disabled={!archivos['fotoDniFrente'] || !archivos['fotoDniDorso'] || guardando ||
                  ((!p2.tieneCedula && !p2.tieneTitulo) && !p2.observacionDocumentacion.trim())}
                onClick={() => confirmarPaso2(p2 as any, archivos as any)}
                className="w-full py-3 bg-[#D4621A] hover:bg-[#b8541a] text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50"
              >
                {guardando ? `Subiendo fotos... ${progreso}%` : 'Confirmar documentación →'}
              </button>
            </>
          ) : (
            <ResumenPaso datos={[
              { label: 'DNI',     val: workflow.paso2?.fotoDniFrente ? '✅ Cargado' : '—' },
              { label: 'Cédula',  val: workflow.paso2?.fotoCedulaFrente ? '✅ Cargado' : 'No cargada' },
              { label: 'Título',  val: workflow.paso2?.fotoTituloFrente ? '✅ Cargado' : 'No cargado' },
              { label: 'Total cobrado', val: formatARS(workflow.paso2?.montoTotal ?? 0) },
              { label: 'Obs.',    val: workflow.paso2?.observacionDocumentacion ?? '—' },
            ]} />
          )}
        </div>
      )}

      {/* ── PASO 3 — Pre-revisión (Admin) ── */}
      {pasoActual >= 3 && renderPasoHeader(3, pasoActual, pasosColapsados, toggle)}
      {pasoActual >= 3 && !pasosColapsados[3] && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">

          {/* Resolución del rebote (Asesor) */}
          {esRebotado && (
            <div className="space-y-4">
              <p className="text-sm font-bold text-red-700">Resolver el rebote del Admin</p>
              <div className="flex gap-3">
                <label className="flex-1 flex items-center gap-2 p-3 border border-gray-200 rounded-xl cursor-pointer text-sm">
                  <input type="radio" name="tipoRebote" checked={!rebote.requiereInformePersona}
                    onChange={() => setRebote(prev => ({ ...prev, requiereInformePersona: false }))}
                    className="accent-[#D4621A]"
                  />
                  Tengo el DNI del infractor
                </label>
                <label className="flex-1 flex items-center gap-2 p-3 border border-gray-200 rounded-xl cursor-pointer text-sm">
                  <input type="radio" name="tipoRebote" checked={rebote.requiereInformePersona}
                    onChange={() => setRebote(prev => ({ ...prev, requiereInformePersona: true }))}
                    className="accent-[#D4621A]"
                  />
                  Requiere informe de persona
                </label>
              </div>
              {!rebote.requiereInformePersona ? (
                <div className="grid grid-cols-2 gap-3">
                  <FotoUploader label="DNI Infractor Frente" onChange={f => { setArchivosRebote(prev => ({ ...prev, fotoDniInfractorFrente: f })); setPreviewsRebote(prev => ({ ...prev, fotoDniInfractorFrente: f ? URL.createObjectURL(f) : null })) }} preview={previewsRebote['fotoDniInfractorFrente']} />
                  <FotoUploader label="DNI Infractor Dorso"  onChange={f => { setArchivosRebote(prev => ({ ...prev, fotoDniInfractorDorso:  f })); setPreviewsRebote(prev => ({ ...prev, fotoDniInfractorDorso:  f ? URL.createObjectURL(f) : null })) }} preview={previewsRebote['fotoDniInfractorDorso']} />
                </div>
              ) : (
                <label className="flex items-center gap-2 p-3 border border-amber-200 bg-amber-50 rounded-xl text-sm cursor-pointer">
                  <input type="checkbox" checked={rebote.informePersonaPagado}
                    onChange={e => setRebote(prev => ({ ...prev, informePersonaPagado: e.target.checked }))}
                    className="accent-[#D4621A]"
                  />
                  <span>Informe de persona abonado — esperando 24hs para continuar</span>
                </label>
              )}
              <textarea
                value={rebote.observacion}
                onChange={e => setRebote(prev => ({ ...prev, observacion: e.target.value }))}
                placeholder="Observaciones sobre la resolución..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none resize-none"
              />
              <button
                onClick={() => resolverRebote(
                  { ...rebote, resueltoBy: '', resueltoPorNombre: '', resueltoEn: null as any } as any,
                  archivosRebote as any,
                )}
                disabled={guardando || (rebote.requiereInformePersona && !rebote.informePersonaPagado) ||
                  (!rebote.requiereInformePersona && !archivosRebote['fotoDniInfractorFrente'])}
                className="w-full py-3 bg-[#D4621A] text-white font-semibold rounded-xl text-sm disabled:opacity-50"
              >
                {guardando ? 'Enviando...' : 'Enviar resolución al Admin →'}
              </button>
            </div>
          )}

          {/* Pre-revisión (Admin) */}
          {!esRebotado && pasoActual === 3 && esAdmin && (
            <div className="space-y-4">
              {/* Visor de documentación — el Admin verifica las fotos antes de aprobar/rebotar */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                  Documentación cargada por el asesor
                </p>
                <VisorDocumentacion fotos={[
                  { label: 'DNI Frente',     foto: workflow.paso2?.fotoDniFrente },
                  { label: 'DNI Dorso',      foto: workflow.paso2?.fotoDniDorso },
                  { label: 'Cédula Frente',  foto: workflow.paso2?.fotoCedulaFrente },
                  { label: 'Cédula Dorso',   foto: workflow.paso2?.fotoCedulaDorso },
                  { label: 'Título Frente',  foto: workflow.paso2?.fotoTituloFrente },
                  { label: 'Título Dorso',   foto: workflow.paso2?.fotoTituloDorso },
                ]} />
                {workflow.paso2?.observacionDocumentacion && (
                  <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    <p className="text-xs font-bold text-amber-700 mb-0.5">Observación del asesor:</p>
                    <p className="text-sm text-amber-800">{workflow.paso2.observacionDocumentacion}</p>
                  </div>
                )}
              </div>

              <p className="text-sm font-bold text-gray-700">Resultado de la pre-revisión</p>
              <div className="space-y-2">
                {([
                  { val: 'ok',         label: '✅ Sin irregularidades — continuar gestión', cls: 'border-emerald-200' },
                  { val: 'rebotado',   label: '↩️ Rebotar al asesor (falta/error documentación)', cls: 'border-amber-200' },
                  { val: 'mesa_ayuda', label: '📧 Derivar a mesa de ayuda externa', cls: 'border-red-200' },
                ] as const).map(opt => (
                  <label key={opt.val} className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer text-sm ${p3.resultado === opt.val ? 'bg-gray-50 ' + opt.cls : 'border-gray-200'}`}>
                    <input type="radio" name="resultado" value={opt.val} checked={p3.resultado === opt.val}
                      onChange={() => setP3(prev => ({ ...prev, resultado: opt.val }))}
                      className="accent-[#D4621A]"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>

              {p3.resultado === 'rebotado' && (
                <textarea value={p3.motivoRebote}
                  onChange={e => setP3(prev => ({ ...prev, motivoRebote: e.target.value }))}
                  placeholder="Describí qué documentación falta o está incorrecta..."
                  rows={2} required
                  className="w-full px-3 py-2 border border-red-200 rounded-xl text-sm outline-none resize-none bg-red-50"
                />
              )}

              {p3.resultado === 'mesa_ayuda' && (
                <div className="space-y-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <textarea value={p3.motivoMesaAyuda}
                    onChange={e => setP3(prev => ({ ...prev, motivoMesaAyuda: e.target.value }))}
                    placeholder="Descripción de la discrepancia (ej: género incorrecto en la multa)..."
                    rows={2}
                    className="w-full px-3 py-2 border border-amber-300 rounded-xl text-sm outline-none resize-none bg-white"
                  />
                  <input value={p3.emailMesaAyuda}
                    onChange={e => setP3(prev => ({ ...prev, emailMesaAyuda: e.target.value }))}
                    placeholder="Email de mesa de ayuda externa"
                    type="email"
                    className="w-full px-3 py-2 border border-amber-300 rounded-xl text-sm outline-none bg-white"
                  />
                  <div>
                    <label className="text-xs font-semibold text-amber-700 mb-1 block">Plazo estimado de respuesta</label>
                    <div className="flex gap-2">
                      {(['24hs', '48hs', '72hs'] as const).map(p => (
                        <button key={p} type="button"
                          onClick={() => setP3(prev => ({ ...prev, plazoEspera: p }))}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${p3.plazoEspera === p ? 'bg-amber-500 border-amber-500 text-white' : 'border-amber-300 text-amber-700'}`}
                        >
                          {p} hábiles
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <textarea value={p3.observacion}
                onChange={e => setP3(prev => ({ ...prev, observacion: e.target.value }))}
                placeholder="Observaciones de la revisión..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none resize-none"
              />

              <button
                disabled={guardando ||
                  (p3.resultado === 'rebotado'   && !p3.motivoRebote.trim()) ||
                  (p3.resultado === 'mesa_ayuda' && !p3.motivoMesaAyuda.trim())}
                onClick={() => confirmarPreRevision(p3)}
                className="w-full py-3 bg-[#D4621A] text-white font-semibold rounded-xl text-sm disabled:opacity-50"
              >
                {guardando ? 'Guardando...' : 'Confirmar pre-revisión →'}
              </button>
            </div>
          )}

          {pasoActual > 3 && !esRebotado && (
            <ResumenPaso datos={[
              { label: 'Resultado', val: workflow.paso3?.resultado === 'ok' ? '✅ Sin irregularidades' : workflow.paso3?.resultado ?? '—' },
              { label: 'Obs.',      val: workflow.paso3?.observacion ?? '—' },
            ]} />
          )}
        </div>
      )}

      {/* ── PASO 4 — Revisión profunda ── */}
      {pasoActual >= 4 && !esMesa && renderPasoHeader(4, pasoActual, pasosColapsados, toggle)}
      {pasoActual >= 4 && !esMesa && !pasosColapsados[4] && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
          {pasoActual === 4 && esAdmin ? (
            <>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Notas de revisión multa x multa *</label>
                <textarea value={p4.notasRevision}
                  onChange={e => setP4(prev => ({ ...prev, notasRevision: e.target.value }))}
                  placeholder="Documentá la revisión de cada multa, inconsistencias encontradas, decisiones tomadas..."
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Cantidad de multas</label>
                  <input type="number" value={p4.cantidadMultas || ''}
                    onChange={e => setP4(prev => ({ ...prev, cantidadMultas: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none"
                  />
                </div>
                <label className="flex items-center gap-2 p-3 border border-gray-200 rounded-xl cursor-pointer self-end">
                  <input type="checkbox" checked={p4.borradoresListos}
                    onChange={e => setP4(prev => ({ ...prev, borradoresListos: e.target.checked }))}
                    className="accent-[#D4621A]"
                  />
                  <span className="text-sm">Borradores listos para cargar</span>
                </label>
              </div>
              <button
                disabled={!p4.notasRevision.trim() || !p4.borradoresListos || guardando}
                onClick={() => confirmarPaso4(p4)}
                className="w-full py-3 bg-[#D4621A] text-white font-semibold rounded-xl text-sm disabled:opacity-50"
              >
                {guardando ? 'Guardando...' : 'Confirmar borradores listos →'}
              </button>
            </>
          ) : (
            <ResumenPaso datos={[
              { label: 'Multas',    val: `${workflow.paso4?.cantidadMultas ?? '—'} multas revisadas` },
              { label: 'Notas',     val: (workflow.paso4?.notasRevision ? workflow.paso4.notasRevision.slice(0, 80) + '...' : '—') },
              { label: 'Borradores', val: workflow.paso4?.borradoresListos ? '✅ Listos' : '—' },
            ]} />
          )}
        </div>
      )}

      {/* ── PASO 5 — Carga del descargo ── */}
      {pasoActual >= 5 && renderPasoHeader(5, pasoActual, pasosColapsados, toggle)}
      {pasoActual >= 5 && !pasosColapsados[5] && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
          {pasoActual === 5 && esAdmin ? (
            <>
              <p className="text-xs text-gray-500">Subí las capturas/fotos del descargo cargado en el sistema.</p>
              <div>
                <label className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center gap-2 cursor-pointer hover:border-[#D4621A]/40 hover:bg-[#D4621A]/5 transition-all">
                  <Upload size={20} className="text-gray-300" />
                  <span className="text-xs text-gray-400">Seleccioná fotos del descargo</span>
                  <input type="file" accept="image/*" multiple className="hidden"
                    onChange={e => setFotosDescargo(Array.from(e.target.files ?? []))}
                  />
                </label>
                {fotosDescargo.length > 0 && (
                  <p className="text-xs text-emerald-600 mt-1">{fotosDescargo.length} archivo(s) seleccionado(s)</p>
                )}
              </div>
              <textarea value={p5obs} onChange={e => setP5obs(e.target.value)}
                placeholder="Observaciones del descargo..."
                rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none resize-none"
              />
              {progreso > 0 && progreso < 100 && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Subiendo...</span><span>{progreso}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full">
                    <div className="h-full bg-[#D4621A] rounded-full" style={{ width: `${progreso}%` }} />
                  </div>
                </div>
              )}
              <button disabled={fotosDescargo.length === 0 || guardando}
                onClick={() => confirmarPaso5({ observacion: p5obs }, fotosDescargo)}
                className="w-full py-3 bg-[#D4621A] text-white font-semibold rounded-xl text-sm disabled:opacity-50"
              >
                {guardando ? `Subiendo... ${progreso}%` : 'Confirmar descargo subido →'}
              </button>
            </>
          ) : (
            <ResumenPaso datos={[
              { label: 'Fotos cargadas', val: `${workflow.paso5?.fotosDescargo?.length ?? 0} archivos` },
              { label: 'Obs.',           val: workflow.paso5?.observacion ?? '—' },
            ]} />
          )}
        </div>
      )}

      {/* ── PASO 6 — SUATS / Resolución ── */}
      {pasoActual >= 6 && renderPasoHeader(6, pasoActual, pasosColapsados, toggle)}
      {pasoActual >= 6 && !pasosColapsados[6] && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
          {pasoActual === 6 && esAdmin ? (
            <>
              {workflow.paso1?.requiereSUATS ? (
                <>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-700">
                    ✅ El cliente solicitó informe SUATS. Adjuntá las capturas del informe.
                  </div>
                  <label className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center gap-2 cursor-pointer hover:border-emerald-400 transition-all">
                    <Upload size={20} className="text-gray-300" />
                    <span className="text-xs text-gray-400">Subir capturas del SUATS</span>
                    <input type="file" accept="image/*" multiple className="hidden"
                      onChange={e => setFotosSuats(Array.from(e.target.files ?? []))}
                    />
                  </label>
                  {fotosSuats.length > 0 && (
                    <p className="text-xs text-emerald-600">{fotosSuats.length} captura(s) del SUATS</p>
                  )}
                  <button
                    disabled={fotosSuats.length === 0 || guardando}
                    onClick={() => confirmarPaso6({ ...p6, suatsGenerado: true }, fotosSuats)}
                    className="w-full py-3 bg-[#D4621A] text-white font-semibold rounded-xl text-sm disabled:opacity-50"
                  >
                    {guardando ? `Subiendo... ${progreso}%` : 'SUATS generado — Notificar asesor →'}
                  </button>
                </>
              ) : (
                <>
                  <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-xs text-teal-700">
                    El cliente no requirió SUATS. Confirmá la resolución para notificar al asesor.
                  </div>
                  <textarea value={p6.observacion} onChange={e => setP6(prev => ({ ...prev, observacion: e.target.value }))}
                    placeholder="Observaciones de cierre..."
                    rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none resize-none"
                  />
                  <button disabled={guardando}
                    onClick={() => confirmarPaso6({ ...p6, suatsGenerado: false }, [])}
                    className="w-full py-3 bg-[#D4621A] text-white font-semibold rounded-xl text-sm disabled:opacity-50"
                  >
                    {guardando ? 'Guardando...' : 'Confirmar resolución — sin SUATS →'}
                  </button>
                </>
              )}
            </>
          ) : (
            <ResumenPaso datos={[
              { label: 'SUATS',  val: workflow.paso6?.suatsGenerado ? '✅ Generado' : 'No requerido' },
              { label: 'Fotos',  val: `${workflow.paso6?.fotosSuats?.length ?? 0} capturas` },
            ]} />
          )}
        </div>
      )}

      {/* ── PASO 7 — Cierre y entrega ── */}
      {pasoActual >= 7 && renderPasoHeader(7, pasoActual, pasosColapsados, toggle)}
      {pasoActual >= 7 && !pasosColapsados[7] && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
          {pasoActual === 7 ? (
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-700 font-semibold">
                🔔 El trámite está resuelto. Avisá al cliente y cerrá la gestión.
              </div>

              {/* Banner de restricción de rol */}
              {!puedeCerrarPaso7 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                  <ShieldCheck size={14} className="text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700">
                    El cierre y archivo del trámite requiere autorización de un <strong>Administrador, Admin General o Propietario</strong>.
                    Completá los datos de entrega para que puedan finalizar.
                  </p>
                </div>
              )}

              {/* ── Pago total del recibo (OBLIGATORIO) ──────────────────────── */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Pago total del recibo <span className="text-red-500">*</span>
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Obligatorio para finalizar el trámite</p>
                </div>
                <div className="px-4 py-3">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">$</span>
                    <input
                      type="number" min={0} step={100}
                      value={p7.pagoTotalRecibo || ''}
                      onChange={e => setP7(prev => ({ ...prev, pagoTotalRecibo: Number(e.target.value) }))}
                      placeholder="0"
                      className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm
                                 font-bold text-gray-800 bg-white outline-none
                                 focus:border-[#D4621A] focus:shadow-[0_0_0_3px_rgba(212,98,26,0.1)]"
                    />
                  </div>
                  {p7.pagoTotalRecibo > 0 && (
                    <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
                      <span>✓</span>
                      {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(p7.pagoTotalRecibo)} registrado
                    </p>
                  )}
                </div>
              </div>

              {/* Checkboxes de confirmación */}
              <div className="space-y-2">
                {[
                  { key: 'clienteAvisado', label: 'Cliente avisado de la resolución' },
                  ...(workflow.paso1?.requiereSUATS ? [{ key: 'suatsEntregado', label: 'SUATS entregado al cliente' }] : []),
                ].map(opt => (
                  <label key={opt.key} className="flex items-center gap-2 p-3 border border-gray-200 rounded-xl cursor-pointer text-sm">
                    <input type="checkbox" checked={(p7 as any)[opt.key]}
                      onChange={e => setP7(prev => ({ ...prev, [opt.key]: e.target.checked }))}
                      className="accent-[#D4621A]"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>

              {/* ── SUATS abonado ──────────────────────────────────────────── */}
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <label className="flex items-center gap-2 p-3 cursor-pointer text-sm hover:bg-gray-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={p7.suatsAbonado}
                    onChange={e => setP7(prev => ({
                      ...prev,
                      suatsAbonado: e.target.checked,
                      montoSUATS: e.target.checked ? prev.montoSUATS : 0,
                    }))}
                    className="accent-[#D4621A]"
                  />
                  <span className="font-medium text-gray-700">¿Se abonó SUATS?</span>
                  <span className="text-xs text-gray-400 ml-auto">(opcional)</span>
                </label>
                {p7.suatsAbonado && (
                  <div className="px-3 pb-3 border-t border-gray-100 bg-amber-50/50">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5 mt-2.5">
                      Monto abonado SUATS *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">$</span>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={p7.montoSUATS || ''}
                        onChange={e => setP7(prev => ({ ...prev, montoSUATS: Number(e.target.value) }))}
                        placeholder="0"
                        className="w-full pl-7 pr-3 py-2.5 border border-amber-200 rounded-xl text-sm
                                   font-bold text-amber-800 bg-white outline-none
                                   focus:border-[#D4621A] focus:shadow-[0_0_0_3px_rgba(212,98,26,0.1)]"
                      />
                    </div>
                    {p7.montoSUATS > 0 && (
                      <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                        <span>📊</span>
                        Se registrará en el reporte mensual como SUATS abonado.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Canal de entrega */}
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Canal de entrega</label>
                <div className="grid grid-cols-4 gap-2">
                  {([
                    { val: 'whatsapp', label: 'WhatsApp' },
                    { val: 'email', label: 'Email' },
                    { val: 'presencial', label: 'Presencial' },
                    { val: 'otro', label: 'Otro' },
                  ] as const).map(opt => (
                    <button key={opt.val} type="button"
                      onClick={() => setP7(prev => ({ ...prev, canalEntrega: opt.val }))}
                      className={`py-2 rounded-xl text-xs font-semibold border transition-all ${p7.canalEntrega === opt.val ? 'bg-[#D4621A] border-[#D4621A] text-white' : 'border-gray-200 text-gray-600'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <textarea value={p7.observacionFinal} onChange={e => setP7(prev => ({ ...prev, observacionFinal: e.target.value }))}
                placeholder="Observaciones finales del cierre..."
                rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none resize-none"
              />

              {/* Validación: si marcó suatsAbonado, el monto es obligatorio */}
              {!p7.pagoTotalRecibo && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  ⚠ Ingresá el pago total del recibo para poder finalizar.
                </p>
              )}
              {p7.suatsAbonado && !p7.montoSUATS && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  ⚠ Ingresá el monto abonado por SUATS para poder finalizar.
                </p>
              )}

              <button
                disabled={
                  !puedeCerrarPaso7 ||
                  !p7.clienteAvisado ||
                  !p7.pagoTotalRecibo ||
                  (!!workflow.paso1?.requiereSUATS && !p7.suatsEntregado) ||
                  (p7.suatsAbonado && !p7.montoSUATS) ||
                  guardando
                }
                onClick={() => confirmarPaso7(p7)}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm disabled:opacity-50 transition-colors"
              >
                {guardando ? 'Archivando...' : puedeCerrarPaso7 ? '🗂️ Finalizar y archivar trámite' : '🔒 Solo Admin / Propietario puede cerrar'}
              </button>
            </>
          ) : (
            <div className="flex items-start gap-3 py-4">
              <CheckCircle2 size={28} className="text-emerald-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800">Trámite completado y archivado</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Canal: {workflow.paso7?.canalEntrega} · Por: {workflow.paso7?.completadoPorNombre}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(workflow.paso7?.pagoTotalRecibo ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-bold text-emerald-700">
                      Recibo: {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(workflow.paso7!.pagoTotalRecibo)}
                    </span>
                  )}
                  {workflow.paso7?.suatsAbonado && workflow.paso7?.montoSUATS && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-amber-700">
                      SUATS: {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(workflow.paso7.montoSUATS)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal confirmación asignación */}
      {confirmAsignacion && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setConfirmAsignacion(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <User size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm">Confirmar asignación</p>
                <p className="text-xs text-gray-500">Esta acción quedará registrada</p>
              </div>
            </div>
            <p className="text-sm text-gray-700 mb-5">
              ¿Asignar a <strong>{confirmAsignacion.nombre}</strong> como responsable de verificación de esta multa?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAsignacion(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarAsignacion}
                className="flex-1 py-2.5 bg-[#D4621A] text-white rounded-xl text-sm font-semibold hover:bg-[#b8541a] transition-colors"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error global */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}

// ─── SUBCOMPONENTES ───────────────────────────────────────────────────────────

function renderPasoHeader(
  paso: number, pasoActual: number,
  colapsados: Record<number, boolean>,
  toggle: (n: number) => void,
) {
  const config     = PASOS_MULTA_CONFIG.find(p => p.id === paso)
  const completado = pasoActual > paso
  const activo     = pasoActual === paso
  const pendiente  = pasoActual < paso

  return (
    <button
      onClick={() => toggle(paso)}
      className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all ${
        activo     ? 'border-[#D4621A]/40 bg-[#D4621A]/5' :
        completado ? 'border-emerald-200 bg-emerald-50/50' :
        'border-gray-100 bg-gray-50/50 opacity-50'
      }`}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
        completado ? 'bg-emerald-500 text-white' :
        activo     ? 'bg-[#D4621A] text-white' :
        'bg-gray-200 text-gray-500'
      }`}>
        {completado ? '✓' : paso}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{config?.titulo}</p>
        <p className="text-xs text-gray-400">{config?.subtitulo}</p>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        completado ? 'bg-emerald-100 text-emerald-700' :
        activo     ? 'bg-[#D4621A]/10 text-[#D4621A]' :
        'bg-gray-100 text-gray-400'
      }`}>
        {completado ? 'Completado' : activo ? 'En curso' : 'Pendiente'}
      </span>
      {colapsados[paso] ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronUp size={14} className="text-gray-400 shrink-0" />}
    </button>
  )
}

function ResumenPaso({ datos }: { datos: { label: string; val: string }[] }) {
  return (
    <div className="space-y-2">
      {datos.map(d => (
        <div key={d.label} className="flex justify-between text-sm border-b border-gray-50 pb-1 last:border-0">
          <span className="text-gray-500">{d.label}</span>
          <span className="font-medium text-gray-800 text-right max-w-[65%] truncate">{d.val}</span>
        </div>
      ))}
    </div>
  )
}