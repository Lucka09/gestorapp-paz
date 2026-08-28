import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Phone, MessageCircle, UserCheck, ArrowRight,
  Trash2, MoreVertical, Search, Check, X, Users, Target,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLeads } from '@/hooks/useLeads'
import { useEquipo } from '@/hooks/useEquipo'
import { useGestoriaId } from '@/context/GestoriaContext'
import { usePageTitle } from '@/hooks/usePageTitle'
import { validarLead, buscarLeadDuplicado, convertirLeadAConsulta, esTipoMulta,
  crearLead, cambiarEstadoLead, asignarLead,
  convertirLeadAProspecto, eliminarLead,
} from '@/lib/firestore/leads'
import type { MiembroEquipo } from '@/lib/firestore/equipo'
import {
  ESTADO_LEAD_LABELS, ESTADO_LEAD_COLORS,
  PRIORIDAD_LEAD_LABELS, PRIORIDAD_LEAD_COLORS,
  ORIGEN_CANAL_LABELS, TIPO_TRAMITE_LABELS, MOTIVO_PERDIDA_LABELS,
  ESTADOS_LEAD_ACTIVOS,
  type Lead, type LeadInput, type EstadoLead, type MotivoPerdida,
  type PrioridadLead, type OrigenCanal, type TipoTramite, type Usuario,
} from '@/types'
import { Button } from '@/components/ui'
import Modal from '@/components/shared/Modal'
import toast from 'react-hot-toast'
import { getFunctions, httpsCallable } from 'firebase/functions'

// ─── CONSTANTES DE UI ─────────────────────────────────────────────────────────

type Tab = 'bandeja' | 'nuevos' | 'convertidos' | 'perdidos' | 'todos'

// Roles que reasignan a terceros y ven todo el pool de leads.
const ROLES_ADMIN = ['propietario', 'admin', 'admin_gral', 'superadmin']

const TABS: { key: Tab; label: string }[] = [
  { key: 'bandeja',     label: '📥 Bandeja'    },
  { key: 'nuevos',      label: '🆕 Nuevos'     },
  { key: 'convertidos', label: '🏆 Convertidos'},
  { key: 'perdidos',    label: '❌ Perdidos'   },
  { key: 'todos',       label: 'Todos'         },
]

const MOTIVOS_PERDIDA = (Object.keys(MOTIVO_PERDIDA_LABELS) as MotivoPerdida[])

const ESTADOS_MANUALES: EstadoLead[] = ['nuevo', 'contactado', 'calificado', 'en_negociacion']

const CANALES_FORM: OrigenCanal[] = [
  'web', 'whatsapp', 'instagram', 'facebook', 'google',
  'referido_persona', 'cartel_local', 'concesionaria', 'agencia', 'reventa', 'otro',
]

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Formatea un Timestamp de Firestore como tiempo relativo */
function timeAgo(ts: any): string {
  if (!ts) return ''
  const ms = ts.toMillis ? Date.now() - ts.toMillis() : 0
  if (ms < 60000) return 'recién'
  const min = Math.floor(ms / 60000)
  if (min < 60) return `hace ${min} min`
  const hs = Math.floor(min / 60)
  if (hs < 24) return `hace ${hs} h`
  const dias = Math.floor(hs / 24)
  return dias === 1 ? 'ayer' : `hace ${dias} días`
}

function telWA(tel?: string): string {
  if (!tel) return ''
  const clean = tel.replace(/\D/g, '')
  return clean.startsWith('54') ? clean : `549${clean}`
}

// ─── CHIPS ────────────────────────────────────────────────────────────────────

function ChipEstado({ estado }: { estado: EstadoLead }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${ESTADO_LEAD_COLORS[estado]}`}>
      {ESTADO_LEAD_LABELS[estado]}
    </span>
  )
}

function ChipPrioridad({ prioridad }: { prioridad: PrioridadLead }) {
  if (prioridad === 'normal') return null
  return (
    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${PRIORIDAD_LEAD_COLORS[prioridad]}`}>
      {PRIORIDAD_LEAD_LABELS[prioridad]}
    </span>
  )
}

// ─── TARJETA DE LEAD ──────────────────────────────────────────────────────────

function LeadCard({
  lead,
  esActivo,
  onOpen,
  onConvertir,
  onContactado,
  onPerder,
  onDescartar,
  onEliminar,
}: {
  lead: Lead
  esActivo: boolean
  onOpen: (l: Lead) => void
  onConvertir: (l: Lead) => void
  onContactado: (l: Lead) => void
  onPerder: (l: Lead) => void
  onDescartar: (l: Lead) => void
  onEliminar: (l: Lead) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const iniciales = `${lead.nombre[0] ?? ''}${lead.apellido?.[0] ?? ''}`.toUpperCase()

  return (
    <div
      className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer group animate-fadein"
      onClick={() => onOpen(lead)}
    >
      {/* Header: avatar + nombre + prioridad + menú */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-[#D4621A]/10 text-[#D4621A] flex items-center justify-center font-bold text-sm shrink-0">
          {iniciales}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm truncate">
              {lead.apellido ? `${lead.apellido}, ${lead.nombre}` : lead.nombre}
            </span>
            <ChipPrioridad prioridad={lead.prioridad} />
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {ORIGEN_CANAL_LABELS[lead.canal]}
            </span>
            {lead.tipoTramiteInteres && (
              <span className="text-[11px] bg-[#D4621A]/10 text-[#D4621A] px-2 py-0.5 rounded-full font-medium">
                {TIPO_TRAMITE_LABELS[lead.tipoTramiteInteres as TipoTramite] ?? lead.tipoTramiteInteres}
              </span>
            )}
          </div>
        </div>
        <div className="relative shrink-0">
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
            className="text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-all p-1"
          >
            <MoreVertical size={15} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={e => { e.stopPropagation(); setMenuOpen(false) }} />
              <div
                className="absolute right-0 mt-1 z-20 bg-white border border-gray-100 rounded-xl shadow-xl py-1.5 w-48"
                onClick={e => e.stopPropagation()}
              >
                {esActivo && (
                  <>
                    <button onClick={() => { onConvertir(lead); setMenuOpen(false) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-green-700">
                      <ArrowRight size={13} /> Convertir a prospecto
                    </button>
                    {lead.estado === 'nuevo' && (
                      <button onClick={() => { onContactado(lead); setMenuOpen(false) }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-blue-700">
                        <Check size={13} /> Marcar contactado
                      </button>
                    )}
                    <button onClick={() => { onPerder(lead); setMenuOpen(false) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-red-600">
                      <X size={13} /> Marcar perdido
                    </button>
                    <button onClick={() => { onDescartar(lead); setMenuOpen(false) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-500">
                      <Trash2 size={13} /> Descartar
                    </button>
                  </>
                )}
                <button onClick={() => { onEliminar(lead); setMenuOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 flex items-center gap-2 text-red-500 border-t border-gray-50">
                  <Trash2 size={13} /> Eliminar definitivamente
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Consulta */}
      {lead.consulta && (
        <p className="text-xs text-gray-500 mt-3 line-clamp-2 leading-relaxed">
          "{lead.consulta}"
        </p>
      )}

      {/* Footer: contacto + estado + asignado + tiempo */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
        <div className="flex items-center gap-1.5">
          {lead.telefono && (
            <>
              <a
                href={`https://wa.me/${telWA(lead.telefono)}`}
                target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="p-1.5 bg-[#25D366]/10 text-[#25D366] rounded-lg hover:bg-[#25D366]/20 transition-colors"
                title="WhatsApp"
              >
                <MessageCircle size={13} />
              </a>
              <a
                href={`tel:${lead.telefono}`}
                onClick={e => e.stopPropagation()}
                className="p-1.5 bg-blue-50 text-blue-500 rounded-lg hover:bg-blue-100 transition-colors"
                title="Llamar"
              >
                <Phone size={13} />
              </a>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ChipEstado estado={lead.estado} />
          {lead.asignadoNombre ? (
            <span className="text-[11px] text-gray-400 flex items-center gap-1">
              <Users size={11} /> {lead.asignadoNombre.split(' ')[0]}
            </span>
          ) : esActivo ? (
            <span className="text-[11px] text-amber-500 font-medium flex items-center gap-1">
              <Target size={11} /> sin asignar
            </span>
          ) : null}
          <span className="text-[11px] text-gray-300">{timeAgo(lead.creadoEn)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── FORM NUEVO LEAD (manual) ─────────────────────────────────────────────────

function LeadForm({
  onSave,
  onCancel,
}: {
  onSave: (data: LeadInput) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    nombre: '', apellido: '', telefono: '', email: '', documento: '',
    localidad: '', consulta: '', fuente: '',
    tipoTramiteInteres: '' as TipoTramite | '',
    canal: 'whatsapp' as OrigenCanal,
    prioridad: 'normal' as PrioridadLead,
  })
  const [saving, setSaving] = useState(false)

  const set = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    if (!form.telefono && !form.email) {
      toast.error('Cargá al menos un teléfono o un email')
      return
    }
    setSaving(true)
    try {
      await onSave({
        ...form,
        tipoTramiteInteres: form.tipoTramiteInteres || undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#D4621A] focus:ring-2 focus:ring-[#D4621A]/15 placeholder-gray-400'
  const labelCls = 'text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Nombre *</label>
          <input className={inputCls} value={form.nombre} onChange={set('nombre')} placeholder="Juan" />
        </div>
        <div>
          <label className={labelCls}>Apellido</label>
          <input className={inputCls} value={form.apellido} onChange={set('apellido')} placeholder="García" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Teléfono</label>
          <input className={inputCls} value={form.telefono} onChange={set('telefono')} placeholder="1145678901" />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input className={inputCls} type="email" value={form.email} onChange={set('email')} placeholder="juan@mail.com" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Canal de origen</label>
          <select className={inputCls} value={form.canal} onChange={set('canal')}>
            {CANALES_FORM.map(c => <option key={c} value={c}>{ORIGEN_CANAL_LABELS[c]}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Trámite de interés</label>
          <select className={inputCls} value={form.tipoTramiteInteres} onChange={set('tipoTramiteInteres')}>
            <option value="">Sin especificar</option>
            {(Object.entries(TIPO_TRAMITE_LABELS) as [TipoTramite, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Localidad</label>
          <input className={inputCls} value={form.localidad} onChange={set('localidad')} placeholder="San Martín" />
        </div>
        <div>
          <label className={labelCls}>Prioridad</label>
          <select className={inputCls} value={form.prioridad} onChange={set('prioridad')}>
            {(Object.entries(PRIORIDAD_LEAD_LABELS) as [PrioridadLead, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>Consulta / Mensaje</label>
        <textarea
          className={`${inputCls} resize-none`}
          rows={2}
          value={form.consulta}
          onChange={set('consulta')}
          placeholder="¿Qué necesita? ¿Cómo llegó?"
        />
      </div>
      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <Button onClick={handleSave} loading={saving} className="flex-1">Guardar lead</Button>
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  )
}

// ─── MODAL DETALLE ────────────────────────────────────────────────────────────

function ModalDetalleLead({
  lead,
  equipo,
  onClose,
  onActualizar,
}: {
  lead: Lead
  equipo: Usuario[]
  onClose: () => void
  onActualizar: (lead: Lead) => void
}) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [convirtiendo, setConvirtiendo] = useState(false)
  const [asignandoA, setAsignandoA] = useState(lead.asignadoA ?? '')

  const actor = user
    ? { id: user.uid, nombre: `${user.nombre} ${user.apellido}`, rol: user.rol }
    : undefined

  const esActivo = ESTADOS_LEAD_ACTIVOS.includes(lead.estado)
  const esAdmin  = ROLES_ADMIN.includes(user?.rol ?? '')

const handleConvertir = async () => {
  setConvirtiendo(true)
  try {
    const { consultaId } = await convertirLeadAConsulta(lead.id, actor)
    toast.success(
      consultaId
        ? 'Lead convertido: prospecto creado y en cola de consultas'
        : 'Lead convertido en prospecto (cargá patente o DNI para encolarlo)'
    )
    onActualizar({ ...lead, estado: 'convertido' })
  } catch (e: any) {
    toast.error(e?.message ?? 'No se pudo convertir el lead')
    setConvirtiendo(false)
  }
}

  const handleEstado = async (estado: EstadoLead) => {
    await cambiarEstadoLead(lead.id, estado, actor)
    toast.success(`Estado: ${ESTADO_LEAD_LABELS[estado]}`)
    onActualizar({ ...lead, estado })
  }

  const handleAsignar = async (uid: string) => {
    setAsignandoA(uid)
    if (!uid) return
    const miembro = equipo.find(m => m.uid === uid)
    await asignarLead(lead.id, uid, miembro ? `${miembro.nombre} ${miembro.apellido}` : '', actor)
    toast.success(`Asignado a ${miembro?.nombre ?? 'usuario'}`)
    onActualizar({ ...lead, asignadoA: uid, asignadoNombre: miembro ? `${miembro.nombre} ${miembro.apellido}` : '' })
  }

  const handleEliminar = async () => {
    if (!confirm('¿Eliminar este lead definitivamente?')) return
    await eliminarLead(lead.id)
    toast.success('Lead eliminado')
    onClose()
  }

  const infoCls = 'flex gap-2 text-sm'
  const labelInfoCls = 'text-gray-400 w-24 shrink-0'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            {lead.apellido ? `${lead.apellido}, ${lead.nombre}` : lead.nombre}
          </h3>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <ChipEstado estado={lead.estado} />
            <ChipPrioridad prioridad={lead.prioridad} />
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {ORIGEN_CANAL_LABELS[lead.canal]}
            </span>
          </div>
        </div>
        <button
          onClick={handleEliminar}
          className="text-xs bg-red-50 hover:bg-red-100 text-red-500 px-3 py-1.5 rounded-lg font-medium transition-colors"
        >
          Eliminar
        </button>
      </div>

      {/* Contacto rápido */}
      {lead.telefono && (
        <div className="flex gap-2">
          <a
            href={`https://wa.me/${telWA(lead.telefono)}`}
            target="_blank" rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-[#20ba5a] transition-colors"
          >
            <MessageCircle size={16} /> WhatsApp
          </a>
          <a
            href={`tel:${lead.telefono}`}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-500 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-600 transition-colors"
          >
            <Phone size={16} /> Llamar
          </a>
        </div>
      )}

      {/* Datos */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-2">
        {lead.telefono   && <div className={infoCls}><span className={labelInfoCls}>Teléfono</span><span className="text-gray-700">{lead.telefono}</span></div>}
        {lead.email      && <div className={infoCls}><span className={labelInfoCls}>Email</span><span className="text-gray-700">{lead.email}</span></div>}
        {lead.documento  && <div className={infoCls}><span className={labelInfoCls}>Documento</span><span className="text-gray-700">{lead.documento}</span></div>}
        {lead.localidad  && <div className={infoCls}><span className={labelInfoCls}>Localidad</span><span className="text-gray-700">{lead.localidad}</span></div>}
        {lead.tipoTramiteInteres && (
          <div className={infoCls}>
            <span className={labelInfoCls}>Interés</span>
            <span className="text-gray-700">{TIPO_TRAMITE_LABELS[lead.tipoTramiteInteres as TipoTramite] ?? lead.tipoTramiteInteres}</span>
          </div>
        )}
        {lead.fuente     && <div className={infoCls}><span className={labelInfoCls}>Fuente</span><span className="text-gray-700">{lead.fuente}</span></div>}
        {lead.consulta   && <div className={infoCls}><span className={labelInfoCls}>Consulta</span><span className="text-gray-700">{lead.consulta}</span></div>}
        <div className={infoCls}><span className={labelInfoCls}>Recibido</span><span className="text-gray-700">{timeAgo(lead.creadoEn)}</span></div>
        {lead.prospectoId && (
          <div className={infoCls}><span className={labelInfoCls}>Convertido</span><span className="text-green-600 font-medium">Prospecto creado ✓</span></div>
        )}
      </div>

      {/* Acciones si está activo */}
      {esActivo && (
        <div className="space-y-3">
          {/* Botones de estado */}
          <div className="grid grid-cols-2 gap-2">
            {lead.estado === 'nuevo' && (
              <Button variant="secondary" onClick={() => handleEstado('contactado')}>
                <Check size={14} /> Marcar contactado
              </Button>
            )}
            {lead.estado !== 'calificado' && lead.estado !== 'nuevo' && (
              <Button variant="secondary" onClick={() => handleEstado('calificado')}>
                <Target size={14} /> Calificar
              </Button>
            )}
          </div>

          {/* Asignación — reasignar a terceros solo admins; el resto reclama el pool libre */}
          {esAdmin ? (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
                Asignar a
              </label>
              <select
                value={asignandoA}
                onChange={e => handleAsignar(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#D4621A]"
              >
                <option value="">Sin asignar</option>
                {equipo.map(m => (
                  <option key={m.uid} value={m.uid}>{m.nombre} {m.apellido}</option>
                ))}
              </select>
            </div>
          ) : !lead.asignadoA ? (
            <Button variant="secondary" onClick={() => { if (user) handleAsignar(user.uid) }} className="w-full">
              <UserCheck size={15} /> Reclamar este lead
            </Button>
          ) : (
            <div className="text-xs text-gray-500 flex items-center gap-1.5">
              <UserCheck size={13} className="text-green-600" />
              Asignado a {lead.asignadoNombre || 'vos'}
            </div>
          )}

          {/* Convertir */}
          <Button onClick={handleConvertir} loading={convirtiendo} className="w-full">
            <ArrowRight size={15} /> Convertir en prospecto
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── MODAL MOTIVO DE PÉRDIDA ─────────────────────────────────────────────────

function ModalMotivo({
  lead,
  esDescarte,
  onClose,
  onConfirm,
}: {
  lead: Lead
  esDescarte: boolean
  onClose: () => void
  onConfirm: (motivo: MotivoPerdida, nota: string) => Promise<void>
}) {
  const [motivo, setMotivo] = useState<MotivoPerdida>('no_responde')
  const [nota, setNota] = useState('')
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    setSaving(true)
    try { await onConfirm(motivo, nota) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        {esDescarte
          ? `¿Por qué se descarta el lead de ${lead.nombre}?`
          : `¿Por qué se perdió el lead de ${lead.nombre}?`}
      </p>
      <select
        value={motivo}
        onChange={e => setMotivo(e.target.value as MotivoPerdida)}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#D4621A]"
      >
        {MOTIVOS_PERDIDA.map(m => <option key={m} value={m}>{MOTIVO_PERDIDA_LABELS[m]}</option>)}
      </select>
      <textarea
        value={nota}
        onChange={e => setNota(e.target.value)}
        rows={2}
        placeholder="Nota opcional..."
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#D4621A] resize-none"
      />
      <div className="flex gap-3">
        <Button onClick={handleConfirm} loading={saving} className="flex-1">
          Confirmar
        </Button>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function LeadsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const gestoriaId = useGestoriaId()
  usePageTitle('Leads')

  const { leads, loading, metricas } = useLeads()
  const { equipo } = useEquipo() as { equipo: Usuario[] }

  const [tab, setTab] = useState<Tab>('bandeja')
  const [search, setSearch] = useState('')
  const [modalNuevo, setModalNuevo] = useState(false)
  const [leadAbierto, setLeadAbierto] = useState<Lead | null>(null)
  const [leadPerder, setLeadPerder] = useState<Lead | null>(null)
  const [esDescarte, setEsDescarte] = useState(false)

  const actor = user
    ? { id: user.uid, nombre: `${user.nombre} ${user.apellido}`, rol: user.rol }
    : undefined

  const activarAutomatizaciones = async () => {
    try {
      const fn = httpsCallable(getFunctions(), 'seedAutomatizaciones')
      const res: any = await fn({})
      toast.success(res.data.creadas > 0
        ? `Automatizaciones activadas (${res.data.creadas})`
        : 'Las automatizaciones ya estaban activadas')
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudieron activar')
    }
  }

  // ── Filtrado por tab + búsqueda ──────────────────────────────────────────
  const leadsFiltrados = useMemo(() => {
    let base = leads
    if (tab === 'bandeja')     base = base.filter(l => ESTADOS_LEAD_ACTIVOS.includes(l.estado))
    if (tab === 'nuevos')      base = base.filter(l => l.estado === 'nuevo')
    if (tab === 'convertidos') base = base.filter(l => l.estado === 'convertido')
    if (tab === 'perdidos')    base = base.filter(l => l.estado === 'perdido' || l.estado === 'descartado')

    if (search.trim()) {
      const q = search.toLowerCase()
      base = base.filter(l =>
        `${l.nombre} ${l.apellido ?? ''}`.toLowerCase().includes(q) ||
        l.telefono?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q)
      )
    }
    return base
  }, [leads, tab, search])

  // ── Contadores para las tabs ──────────────────────────────────────────────
  const contadores: Record<Tab, number> = {
    bandeja: metricas.activos,
    nuevos: metricas.nuevos,
    convertidos: metricas.convertidos,
    perdidos: metricas.perdidos,
    todos: metricas.total,
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCrear = async (data: LeadInput) => {
  if (!user || !gestoriaId) return

  // 1. Validar y extraer datos del texto de consulta
  const validacion = validarLead(data)
  if (validacion.bloqueantes.length) {
    toast.error(validacion.bloqueantes[0])
    return
  }

  // 2. Combinar datos originales + extraídos del texto
  const datosFinales: LeadInput = {
    ...data,
    ...validacion.datosNormalizados,
  }

  // 3. Buscar duplicados
  const duplicado = await buscarLeadDuplicado(gestoriaId, datosFinales)
  if (duplicado) {
    const abrir = confirm(
      `Ya existe un lead similar (${duplicado.nombre} ${duplicado.apellido ?? ''}).\n\n¿Querés abrirlo en vez de crear uno nuevo?`
    )
    if (abrir) {
      setLeadAbierto(duplicado)
      setModalNuevo(false)
      return
    }
  }

  // 4. Crear el lead con datos normalizados.
  //    Si lo crea un secretario, nace asignado a él (solo lo ve él + admins).
  //    Si lo crea un admin, queda sin asignar → pool (lo asigna o lo dejan libre).
  const asignar = ROLES_ADMIN.includes(user.rol ?? '')
    ? undefined
    : { uid: user.uid, nombre: `${user.nombre} ${user.apellido}`.trim() }
  const leadId = await crearLead(
    gestoriaId,
    datosFinales,
    user.uid,
    { origenSistema: 'manual', actor, asignar }
  )

  // 5. Determinar si puede ir a la cola (patente o DNI + tipo multa)
  const tipoTramite = datosFinales.tipoTramiteInteres ?? 'descargo_multa'
  const tienePatente = !!(datosFinales.patente)
  const tieneDNI = !!(datosFinales.documento)
  const tieneClave = tienePatente || tieneDNI

  if (esTipoMulta(tipoTramite) && tieneClave) {
    // AUTOMÁTICO: crear prospecto + encolar consulta
    try {
      await convertirLeadAConsulta(leadId, actor)
      toast.success('Lead creado → prospecto y en cola de consultas')
    } catch (e: any) {
      toast.error(`Lead creado pero no se pudo encolar: ${e.message}`)
    }
  } else {
    toast.success('Lead creado')
    validacion.avisos.forEach(a => toast(a, { icon: '⚠️', duration: 4500 }))
  }

  setModalNuevo(false)
}
  const handleConvertir = async (lead: Lead) => {
    try {
      await convertirLeadAProspecto(lead.id, actor)
      toast.success('¡Lead convertido! Abriendo pipeline...')
      navigate('/admin/pipeline')
    } catch {
      toast.error('No se pudo convertir')
    }
  }

  const handleContactado = async (lead: Lead) => {
    await cambiarEstadoLead(lead.id, 'contactado', actor)
    toast.success('Marcado como contactado')
  }

  const handlePerder = (lead: Lead, descartar = false) => {
    setLeadPerder(lead)
    setEsDescarte(descartar)
  }

  const confirmarPerdida = async (motivo: MotivoPerdida, nota: string) => {
    if (!leadPerder) return
    await cambiarEstadoLead(
      leadPerder.id,
      esDescarte ? 'descartado' : 'perdido',
      actor,
      `${motivo}${nota ? ` — ${nota}` : ''}`
    )
    toast.success(esDescarte ? 'Lead descartado' : 'Lead marcado como perdido')
    setLeadPerder(null)
  }

  const handleEliminar = async (lead: Lead) => {
    if (!confirm('¿Eliminar este lead definitivamente? No se puede deshacer.')) return
    await eliminarLead(lead.id)
    toast.success('Lead eliminado')
    if (leadAbierto?.id === lead.id) setLeadAbierto(null)
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col h-full gap-3">
        <div className="h-6 w-32 bg-gray-200 rounded-full animate-pulse" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="h-7 w-10 bg-gray-200 rounded-full animate-pulse mx-auto mb-1" />
              <div className="h-3 w-14 bg-gray-100 rounded-full animate-pulse mx-auto" />
            </div>
          ))}
        </div>
        <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Leads</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {metricas.nuevos} nuevos · {metricas.sinAsignar} sin asignar · {metricas.convertidos} convertidos
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" onClick={activarAutomatizaciones}>
            ⚙ Automatizaciones
          </Button>
          <Button onClick={() => setModalNuevo(true)}>
            <Plus size={16} /> Nuevo lead
          </Button>
        </div>
      </div>

      {/* Métricas rápidas */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Bandeja activa', value: metricas.activos,     color: 'text-gray-900'   },
          { label: 'Nuevos',         value: metricas.nuevos,      color: 'text-blue-600'   },
          { label: 'Sin asignar',    value: metricas.sinAsignar,  color: 'text-amber-500'  },
          { label: 'Convertidos',    value: metricas.convertidos, color: 'text-green-600'  },
        ].map(m => (
          <div key={m.label} className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm">
            <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5
              ${tab === t.key
                ? 'bg-[#D4621A] text-white shadow-sm'
                : 'bg-white border border-gray-100 text-gray-600 hover:border-[#D4621A]/30'}`}
          >
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold
              ${tab === t.key ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>
              {contadores[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Búsqueda */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, teléfono o email..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A] focus:ring-2 focus:ring-[#D4621A]/10 bg-white"
        />
      </div>

      {/* Lista de leads */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 overflow-y-auto pb-4 flex-1">
        {leadsFiltrados.map(lead => (
          <LeadCard
            key={lead.id}
            lead={lead}
            esActivo={ESTADOS_LEAD_ACTIVOS.includes(lead.estado)}
            onOpen={setLeadAbierto}
            onConvertir={handleConvertir}
            onContactado={handleContactado}
            onPerder={l => handlePerder(l, false)}
            onDescartar={l => handlePerder(l, true)}
            onEliminar={handleEliminar}
          />
        ))}
      </div>

      {/* Empty state */}
      {leadsFiltrados.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-[#D4621A]/10 flex items-center justify-center mb-3">
            <Target size={24} className="text-[#D4621A]" />
          </div>
          <p className="text-base font-semibold text-gray-500">
            {search ? `Sin resultados para "${search}"` : 'No hay leads en esta vista'}
          </p>
          {!search && tab === 'bandeja' && (
            <p className="text-sm text-gray-400 mt-1">
              Los leads van a aparecer acá cuando entren desde la web, WhatsApp o carga manual.
            </p>
          )}
        </div>
      )}

      {/* Modal nuevo lead */}
      <Modal
        open={modalNuevo}
        onClose={() => setModalNuevo(false)}
        title="Nuevo Lead"
        subtitle="Carga manual de un lead"
        size="lg"
      >
        <LeadForm onSave={handleCrear} onCancel={() => setModalNuevo(false)} />
      </Modal>

      {/* Modal detalle */}
      {leadAbierto && (
        <Modal
          open={!!leadAbierto}
          onClose={() => setLeadAbierto(null)}
          title="Detalle del lead"
          size="md"
        >
          <ModalDetalleLead
            lead={leadAbierto}
            equipo={equipo}
            onClose={() => setLeadAbierto(null)}
            onActualizar={setLeadAbierto}
          />
        </Modal>
      )}

      {/* Modal motivo de pérdida */}
      {leadPerder && (
        <Modal
          open={!!leadPerder}
          onClose={() => setLeadPerder(null)}
          title={esDescarte ? 'Descartar lead' : 'Marcar como perdido'}
          size="sm"
        >
          <ModalMotivo
            lead={leadPerder}
            esDescarte={esDescarte}
            onClose={() => setLeadPerder(null)}
            onConfirm={confirmarPerdida}
          />
        </Modal>
      )}
    </div>
  )
}