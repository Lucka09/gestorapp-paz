import { useState, useRef, useMemo } from 'react'
import {
  Plus, Phone, MessageCircle, FileText,
  DollarSign, TrendingUp, AlertCircle,
  ChevronRight, X, Check, Trash2, Bell,
  MoreVertical, Users, ArrowRight,
} from 'lucide-react'
import { useProspectos } from '@/hooks/usePipeline'
import { useAuth } from '@/hooks/useAuth'
import {
  crearProspecto, moverEtapa, actualizarProspecto,
  eliminarProspecto, agregarTarea, completarTarea, eliminarTarea,
  ETAPAS, COLOR_PROSPECTO,
  type Prospecto, type EtapaPipeline, type ColorProspecto,
  type ProspectoInput, type ActorInfo,
} from '@/lib/firestore/pipeline'
import { useGestoriaId } from '@/context/GestoriaContext'
import { TIPO_TRAMITE_LABELS, type TipoTramite } from '@/types'
import { Button, Spinner } from '@/components/ui'
import Modal from '@/components/shared/Modal'
import { formatPesos } from '@/utils'
import toast from 'react-hot-toast'
import ModalPresupuesto from '@/features/presupuestos/ModalPresupuesto'
import { usePageTitle } from '@/hooks/usePageTitle'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function ColorDot({ color, size = 10 }: { color: ColorProspecto; size?: number }) {
  return (
    <span
      className={`inline-block rounded-full shrink-0 ${COLOR_PROSPECTO[color].dot}`}
      style={{ width: size, height: size }}
    />
  )
}

function formatFechaCorta(iso: string) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function isTareaVencida(fecha: string) {
  return fecha <= new Date().toISOString().split('T')[0]
}

// ─── PROSPECTO CARD ───────────────────────────────────────────────────────────

function ProspectoCard({
  prospecto,
  onOpen,
  onMover,
}: {
  prospecto: Prospecto
  onOpen:    (p: Prospecto) => void
  onMover:   (id: string, etapa: EtapaPipeline) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const tareasVencidas = prospecto.tareas.filter(
    t => !t.completada && isTareaVencida(t.fechaAlerta)
  ).length
  const tareasPendientes = prospecto.tareas.filter(t => !t.completada).length

  const etapasDestino = ETAPAS.filter(e => e.key !== prospecto.etapa)

  const tel = prospecto.telefono.replace(/\D/g, '')
  const num = tel.startsWith('54') ? tel : `549${tel}`

  return (
    <div
      className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm
                 hover:shadow-md transition-all cursor-pointer group"
      onClick={() => onOpen(prospecto)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <ColorDot color={prospecto.color} size={8} />
          <span className="text-sm font-bold text-gray-900 truncate">
            {prospecto.apellido}, {prospecto.nombre}
          </span>
        </div>
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
          className="text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100
                     transition-all p-0.5 shrink-0"
        >
          <MoreVertical size={14} />
        </button>
      </div>

      {/* Tipo trámite + patente */}
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        <span className="text-xs bg-[#D4621A]/10 text-[#D4621A] px-2 py-0.5 rounded-full font-medium">
          {TIPO_TRAMITE_LABELS[prospecto.tipoTramite]}
        </span>
        {prospecto.patente && (
          <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg tracking-wider">
            {prospecto.patente}
          </span>
        )}
      </div>

      {/* Descripción breve */}
      {prospecto.descripcion && (
        <p className="text-xs text-gray-500 mb-2.5 line-clamp-2 leading-relaxed">
          {prospecto.descripcion}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <a
            href={`https://wa.me/${num}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="p-1.5 bg-[#25D366]/10 text-[#25D366] rounded-lg
                       hover:bg-[#25D366]/20 transition-colors"
          >
            <MessageCircle size={12} />
          </a>
          <a
            href={`tel:${prospecto.telefono}`}
            onClick={e => e.stopPropagation()}
            className="p-1.5 bg-blue-50 text-blue-500 rounded-lg
                       hover:bg-blue-100 transition-colors"
          >
            <Phone size={12} />
          </a>
        </div>

        <div className="flex items-center gap-2">
          {prospecto.etapa === 'cerrado' && prospecto.montoCierre > 0 && (
            <span className="text-xs font-bold text-green-600">
              {formatPesos(prospecto.montoCierre)}
            </span>
          )}
          {tareasVencidas > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-bold text-red-600
                             bg-red-50 px-1.5 py-0.5 rounded-full">
              <Bell size={9} /> {tareasVencidas}
            </span>
          )}
          {tareasPendientes > 0 && tareasVencidas === 0 && (
            <span className="text-xs text-gray-400">
              {tareasPendientes} tarea{tareasPendientes !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Menú mover etapa */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={e => { e.stopPropagation(); setMenuOpen(false) }}
          />
          <div
            className="absolute right-0 mt-1 z-20 bg-white border border-gray-100
                        rounded-xl shadow-xl py-1.5 w-44"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-xs text-gray-400 px-3 py-1.5 font-semibold uppercase tracking-wide">
              Mover a
            </p>
            {etapasDestino.map(e => (
              <button
                key={e.key}
                onClick={() => { onMover(prospecto.id, e.key); setMenuOpen(false) }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50
                            transition-colors flex items-center gap-2 ${e.color}`}
              >
                <ArrowRight size={12} /> {e.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── COLUMNA KANBAN ───────────────────────────────────────────────────────────

function KanbanColumna({
  etapaConfig,
  prospectos,
  onOpen,
  onMover,
  onNuevo,
}: {
  etapaConfig: typeof ETAPAS[0]
  prospectos:  Prospecto[]
  onOpen:      (p: Prospecto) => void
  onMover:     (id: string, etapa: EtapaPipeline) => void
  onNuevo:     (etapa: EtapaPipeline) => void
}) {
  const totalMonto = prospectos
    .filter(p => p.etapa === 'cerrado')
    .reduce((a, p) => a + (p.montoCierre || 0), 0)

  return (
    <div className="flex flex-col w-64 shrink-0">
      {/* Header columna */}
      <div className={`rounded-xl border ${etapaConfig.border} ${etapaConfig.bg}
                       px-3 py-2.5 mb-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${etapaConfig.color}`}>
            {etapaConfig.label}
          </span>
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full
                            ${etapaConfig.bg} ${etapaConfig.color} border ${etapaConfig.border}`}>
            {prospectos.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {totalMonto > 0 && (
            <span className="text-xs font-semibold text-green-600">
              {formatPesos(totalMonto)}
            </span>
          )}
          <button
            onClick={() => onNuevo(etapaConfig.key)}
            className={`p-1 rounded-lg hover:bg-white/70 transition-colors ${etapaConfig.color}`}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 min-h-30">
        {prospectos.map(p => (
          <ProspectoCard
            key={p.id}
            prospecto={p}
            onOpen={onOpen}
            onMover={onMover}
          />
        ))}
        {prospectos.length === 0 && (
          <div
            onClick={() => onNuevo(etapaConfig.key)}
            className={`border-2 border-dashed ${etapaConfig.border} rounded-xl
                         p-5 text-center cursor-pointer hover:${etapaConfig.bg} transition-colors`}
          >
            <p className={`text-xs ${etapaConfig.color} opacity-60`}>+ Agregar prospecto</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── FORM NUEVO/EDITAR PROSPECTO ──────────────────────────────────────────────

function ProspectoForm({
  initial,
  etapaInicial,
  onSave,
  onCancel,
}: {
  initial?:     Partial<Prospecto>
  etapaInicial: EtapaPipeline
  onSave:       (data: Partial<Prospecto>) => Promise<void>
  onCancel:     () => void
}) {
  const [form, setForm] = useState({
    nombre:      initial?.nombre      ?? '',
    apellido:    initial?.apellido    ?? '',
    documento:  initial?.documento  ?? '',
    telefono:    initial?.telefono    ?? '',
    email:       initial?.email       ?? '',
    localidad:   initial?.localidad   ?? '',
    tipoTramite: initial?.tipoTramite ?? 'transferencia' as TipoTramite,
    patente:     initial?.patente     ?? '',
    descripcion: initial?.descripcion ?? '',
    color:       initial?.color       ?? 'azul' as ColorProspecto,
    etapa:       initial?.etapa       ?? etapaInicial,
    montoCierre: initial?.montoCierre ?? 0,
    formaPago:   initial?.formaPago   ?? '',
    fechaCierre: initial?.fechaCierre ?? '',
    asignadoA:   initial?.asignadoA   ?? '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.nombre || !form.apellido || !form.telefono) {
      toast.error('Nombre, apellido y teléfono son obligatorios')
      return
    }
    setSaving(true)
    try { await onSave(form) }
    finally { setSaving(false) }
  }

  const inputCls = `w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none
                    focus:border-[#D4621A] focus:ring-2 focus:ring-[#D4621A]/15 placeholder-gray-400`
  const labelCls = `text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5`

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Nombre *</label>
          <input className={inputCls} value={form.nombre} onChange={set('nombre')} placeholder="Juan" />
        </div>
        <div>
          <label className={labelCls}>Apellido *</label>
          <input className={inputCls} value={form.apellido} onChange={set('apellido')} placeholder="García" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Teléfono *</label>
          <input className={inputCls} value={form.telefono} onChange={set('telefono')} placeholder="1145678901" />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input className={inputCls} type="email" value={form.email} onChange={set('email')} placeholder="juan@mail.com" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
  <div>
    <label className={labelCls}>Tipo de trámite</label>
    <select className={inputCls} value={form.tipoTramite} onChange={set('tipoTramite')}>
      {(Object.entries(TIPO_TRAMITE_LABELS) as [TipoTramite, string][]).map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  </div>
  <div>
    <label className={labelCls}>Patente</label>
    <input className={`${inputCls} uppercase`} value={form.patente} onChange={set('patente')} placeholder="AB123CD" />
  </div>
  <div>
    <label className={labelCls}>DNI / Doc</label>
    <input className={inputCls} value={form.documento} onChange={set('documento')} placeholder="30111222" inputMode="numeric" />
  </div>
</div>
      <div>
        <label className={labelCls}>Localidad</label>
        <input className={inputCls} value={form.localidad} onChange={set('localidad')} placeholder="San Martín" />
      </div>
      <div>
        <label className={labelCls}>Descripción / Nota</label>
        <textarea
          className={`${inputCls} resize-none`}
          rows={2}
          value={form.descripcion}
          onChange={set('descripcion')}
          placeholder="¿Qué necesita? ¿Cómo llegó?"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Color / Estado</label>
          <select className={inputCls} value={form.color} onChange={set('color')}>
            {(Object.entries(COLOR_PROSPECTO) as Array<[ColorProspecto, { label: string; dot: string }]>).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Etapa</label>
          <select className={inputCls} value={form.etapa} onChange={set('etapa')}>
            {ETAPAS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>
        </div>
      </div>

      {/* Datos de cierre */}
      {form.etapa === 'cerrado' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-green-700 uppercase tracking-wide">Datos del cierre</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Monto ($)</label>
              <input
                className={inputCls} type="number" min={0}
                value={form.montoCierre} onChange={set('montoCierre')} placeholder="45000"
              />
            </div>
            <div>
              <label className={labelCls}>Forma de pago</label>
              <select className={inputCls} value={form.formaPago} onChange={set('formaPago')}>
                <option value="">Seleccionar</option>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="cheque">Cheque</option>
                <option value="mixto">Mixto</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Fecha de cierre</label>
            <input className={inputCls} type="date" value={form.fechaCierre} onChange={set('fechaCierre')} />
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <Button onClick={handleSave} loading={saving} className="flex-1">Guardar</Button>
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  )
}

// ─── MODAL DETALLE ────────────────────────────────────────────────────────────

function ModalDetalle({
  prospecto,
  onClose,
  actor,
}: {
  prospecto: Prospecto
  onClose:   () => void
  actor?:    ActorInfo
}) {
  const [editando,    setEditando]    = useState(false)
  const [presupOpen,  setPresupOpen]  = useState(false)
  const [nuevaTarea,  setNuevaTarea]  = useState('')
  const [fechaTarea,  setFechaTarea]  = useState('')
  const [loadingT,    setLoadingT]    = useState(false)

  const tel = prospecto.telefono.replace(/\D/g, '')
  const num = tel.startsWith('54') ? tel : `549${tel}`
  const etapaConf = ETAPAS.find(e => e.key === prospecto.etapa)

  const handleAgregarTarea = async () => {
    if (!nuevaTarea.trim() || !fechaTarea) {
      toast.error('Escribí la tarea y seleccioná una fecha')
      return
    }
    setLoadingT(true)
    try {
      await agregarTarea(prospecto.id, prospecto.tareas, nuevaTarea.trim(), fechaTarea)
      setNuevaTarea(''); setFechaTarea('')
      toast.success('Tarea agregada')
    } finally { setLoadingT(false) }
  }

  const handleSaveEdit = async (data: Partial<Prospecto>) => {
  await actualizarProspecto(prospecto.id, data, actor)
  toast.success('Prospecto actualizado')
  setEditando(false)
}

  const handleEliminar = async () => {
    if (!confirm('¿Eliminar este prospecto? No se puede deshacer.')) return
    await eliminarProspecto(prospecto.id)
    toast.success('Prospecto eliminado')
    onClose()
  }

  if (editando) {
    return (
      <ProspectoForm
        initial={prospecto}
        etapaInicial={prospecto.etapa}
        onSave={handleSaveEdit}
        onCancel={() => setEditando(false)}
      />
    )
  }

  return (
    <div className="space-y-5">
      {/* Header info */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ColorDot color={prospecto.color} size={10} />
            <span className="text-xs font-medium text-gray-500">
              {COLOR_PROSPECTO[prospecto.color].label}
            </span>
          </div>
          <h3 className="text-lg font-bold text-gray-900">
            {prospecto.apellido}, {prospecto.nombre}
          </h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full
                              ${etapaConf?.bg} ${etapaConf?.color} border ${etapaConf?.border}`}>
              {etapaConf?.label}
            </span>
            <span className="text-xs bg-[#D4621A]/10 text-[#D4621A] px-2 py-0.5 rounded-full font-medium">
              {TIPO_TRAMITE_LABELS[prospecto.tipoTramite]}
            </span>
            {prospecto.patente && (
              <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg">
                {prospecto.patente}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setEditando(true)}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            Editar
          </button>
          <button
            onClick={handleEliminar}
            className="text-xs bg-red-50 hover:bg-red-100 text-red-500 px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            Eliminar
          </button>
        </div>
      </div>

      {/* Contacto */}
      <div className="flex gap-2">
        <a href={`https://wa.me/${num}`} target="_blank" rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] text-white
                     rounded-xl py-2.5 text-sm font-semibold hover:bg-[#20ba5a] transition-colors">
          <MessageCircle size={16} /> WhatsApp
        </a>
        <a href={`tel:${prospecto.telefono}`}
          className="flex-1 flex items-center justify-center gap-2 bg-blue-500 text-white
                     rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-600 transition-colors">
          <Phone size={16} /> Llamar
        </a>
        <button
          onClick={() => setPresupOpen(true)}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors"
          style={{ background: 'var(--gp-orange-pale)', color: 'var(--gp-orange)', border: '1px solid rgba(212,98,26,0.2)' }}
        >
          <FileText size={16} /> Presupuesto
        </button>
      </div>

      {/* Datos */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
        {prospecto.email     && <div className="flex gap-2"><span className="text-gray-400 w-20 shrink-0">Email</span><span className="text-gray-700">{prospecto.email}</span></div>}
        {prospecto.localidad && <div className="flex gap-2"><span className="text-gray-400 w-20 shrink-0">Localidad</span><span className="text-gray-700">{prospecto.localidad}</span></div>}
        {prospecto.descripcion && <div className="flex gap-2"><span className="text-gray-400 w-20 shrink-0">Nota</span><span className="text-gray-700">{prospecto.descripcion}</span></div>}
        {prospecto.etapa === 'cerrado' && prospecto.montoCierre > 0 && (
          <>
            <div className="flex gap-2"><span className="text-gray-400 w-20 shrink-0">Monto</span><span className="font-bold text-green-600">{formatPesos(prospecto.montoCierre)}</span></div>
            {prospecto.formaPago  && <div className="flex gap-2"><span className="text-gray-400 w-20 shrink-0">Forma pago</span><span className="text-gray-700 capitalize">{prospecto.formaPago}</span></div>}
            {prospecto.fechaCierre && <div className="flex gap-2"><span className="text-gray-400 w-20 shrink-0">Fecha cierre</span><span className="text-gray-700">{formatFechaCorta(prospecto.fechaCierre)}</span></div>}
          </>
        )}
      </div>

      {/* Tareas */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          Tareas / Alertas
        </p>

        <div className="space-y-2 mb-3">
          {prospecto.tareas.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">Sin tareas programadas.</p>
          )}
          {prospecto.tareas.map(tarea => (
            <div
              key={tarea.id}
              className={`flex items-center gap-3 p-3 rounded-xl border
                          ${tarea.completada
                            ? 'bg-gray-50 border-gray-100 opacity-60'
                            : isTareaVencida(tarea.fechaAlerta)
                            ? 'bg-red-50 border-red-200'
                            : 'bg-white border-gray-100'}`}
            >
              <button
                onClick={() => completarTarea(prospecto.id, prospecto.tareas, tarea.id)}
                disabled={tarea.completada}
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0
                            ${tarea.completada
                              ? 'border-gray-300 bg-gray-300'
                              : 'border-[#D4621A] hover:bg-[#D4621A]/10'}`}
              >
                {tarea.completada && <Check size={11} className="text-white" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${tarea.completada ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                  {tarea.descripcion}
                </p>
                <p className={`text-xs mt-0.5 font-medium
                               ${isTareaVencida(tarea.fechaAlerta) && !tarea.completada
                                 ? 'text-red-600' : 'text-gray-400'}`}>
                  {isTareaVencida(tarea.fechaAlerta) && !tarea.completada ? '⚠️ ' : '📅 '}
                  {formatFechaCorta(tarea.fechaAlerta)}
                </p>
              </div>
              <button
                onClick={() => eliminarTarea(prospecto.id, prospecto.tareas, tarea.id)}
                className="text-gray-300 hover:text-red-400 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        {/* Agregar tarea */}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <input
              value={nuevaTarea}
              onChange={e => setNuevaTarea(e.target.value)}
              placeholder="Nueva tarea o recordatorio..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none
                         focus:border-[#D4621A] focus:ring-2 focus:ring-[#D4621A]/15 placeholder-gray-400"
              onKeyDown={e => e.key === 'Enter' && handleAgregarTarea()}
            />
          </div>
          <input
            type="date"
            value={fechaTarea}
            onChange={e => setFechaTarea(e.target.value)}
            className="border border-gray-200 rounded-xl px-2 py-2 text-sm outline-none
                       focus:border-[#D4621A] w-36"
          />
          <button
            onClick={handleAgregarTarea}
            disabled={loadingT}
            className="bg-[#D4621A] text-white rounded-xl px-3 py-2 hover:bg-[#B8521A]
                       transition-colors disabled:opacity-50 shrink-0"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <ModalPresupuesto
        open={presupOpen}
        onClose={() => setPresupOpen(false)}
        cliente={{
          id: '', nombre: prospecto.nombre, apellido: prospecto.apellido,
          dni: '', telefono: prospecto.telefono, email: prospecto.email,
          creadoEn: new Date(), actualizadoEn: new Date(),
        } as any}
        tipoInicial={prospecto.tipoTramite}
      />
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function PipelinePage() {
  const { user } = useAuth()
  usePageTitle('Prospectos')
  const actor: ActorInfo | undefined = user
    ? { id: user.uid, nombre: `${user.nombre} ${user.apellido}`, rol: user.rol }
    : undefined

  const { porEtapa, metricas, tareasUrgentes, loading } = useProspectos()
  const [modalNuevo,       setModalNuevo]    = useState(false)
  const [search,           setSearch]        = useState('')
  const [etapaInicial,     setEtapaInicial]  = useState<EtapaPipeline>('nuevo')
  const [prospectoAbierto, setAbierto]       = useState<Prospecto | null>(null)
  const [alertasOpen,      setAlertasOpen]   = useState(false)

  const handleMover = async (id: string, etapa: EtapaPipeline) => {
    try {
      await moverEtapa(id, etapa, actor)
      toast.success(`Movido a ${ETAPAS.find(e => e.key === etapa)?.label}`)
    } catch { toast.error('Error al mover') }
  }

  const handleNuevo = (etapa: EtapaPipeline) => {
    setEtapaInicial(etapa)
    setModalNuevo(true)
  }

  // DESPUÉS
const gestoriaId = useGestoriaId()  // ← agregar este hook al inicio del componente

const handleCrear = async (data: Partial<Prospecto>) => {
  if (!user || !gestoriaId) return
  await crearProspecto(
    { ...data, gestoriaId } as Omit<ProspectoInput, 'tareas' | 'creadoPor' | 'orden' | 'etiquetas'>,
    user.uid
  )
  toast.success('Prospecto creado')
  setModalNuevo(false)
}

  // Total de prospectos para el contador de búsqueda
  const totalProspectos = useMemo(
    () => Object.values(porEtapa).flat().length,
    [porEtapa]
  )

  // Filtrado por búsqueda global
  const prospectosFiltrados = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase()
    return Object.values(porEtapa).flat().filter(p =>
      `${p.apellido} ${p.nombre}`.toLowerCase().includes(q) ||
      p.telefono?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q)
    )
  }, [porEtapa, search])

  if (loading) return <SkeletonPipeline />

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Prospectos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {metricas.activos} activos · {metricas.cerrados} cerrados · {formatPesos(metricas.ingresos)} facturado
          </p>
        </div>
        <div className="flex gap-2">
          {tareasUrgentes.length > 0 && (
            <button
              onClick={() => setAlertasOpen(true)}
              className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600
                         px-3 py-2 rounded-xl text-sm font-semibold hover:bg-red-100 transition-colors"
            >
              <Bell size={15} />
              {tareasUrgentes.length} alerta{tareasUrgentes.length !== 1 ? 's' : ''}
            </button>
          )}
          <Button onClick={() => handleNuevo('nuevo')}>
            <Plus size={16} /> Nuevo prospecto
          </Button>
        </div>
      </div>

      {/* Métricas rápidas */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total',      value: metricas.total,           color: 'text-gray-900'    },
          { label: 'Activos',    value: metricas.activos,         color: 'text-blue-600'    },
          { label: 'Cerrados',   value: metricas.cerrados,        color: 'text-green-600'   },
          { label: 'Conversión', value: `${metricas.conversion}%`,color: 'text-[#D4621A]'  },
        ].map(m => (
          <div key={m.label} className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm">
            <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Búsqueda global */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4"
             fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar prospecto por nombre, teléfono o email..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm
                     outline-none focus:border-[#D4621A] focus:ring-2 focus:ring-[#D4621A]/10 bg-white"
        />
        {search && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {prospectosFiltrados?.length ?? totalProspectos} resultado{(prospectosFiltrados?.length ?? totalProspectos) !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Sin resultados */}
      {prospectosFiltrados && prospectosFiltrados.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-300">
          <p className="text-base font-semibold text-gray-400">Sin resultados para "{search}"</p>
        </div>
      )}

      {/* Tablero Kanban */}
      <div className={`flex gap-4 overflow-x-auto pb-4 flex-1 ${prospectosFiltrados ? 'hidden' : ''}`}>
        {ETAPAS.map(etapaConf => (
          <KanbanColumna
            key={etapaConf.key}
            etapaConfig={etapaConf}
            prospectos={porEtapa[etapaConf.key] ?? []}
            onOpen={setAbierto}
            onMover={handleMover}
            onNuevo={handleNuevo}
          />
        ))}
      </div>

      {/* Vista lista — resultados de búsqueda */}
      {prospectosFiltrados && prospectosFiltrados.length > 0 && (
        <div className="space-y-2">
          {prospectosFiltrados.map(p => (
            <button
              key={p.id}
              onClick={() => setAbierto(p)}
              className="w-full flex items-center gap-3 bg-white border border-gray-100 rounded-xl
                         px-4 py-3 text-left hover:border-[#D4621A]/30 hover:shadow-sm transition-all"
            >
              <div className="w-9 h-9 rounded-lg bg-[#D4621A]/10 flex items-center justify-center
                              text-[#D4621A] font-bold text-xs shrink-0">
                {p.apellido[0]?.toUpperCase()}{p.nombre[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{p.apellido}, {p.nombre}</p>
                <p className="text-xs text-gray-400">
                  {TIPO_TRAMITE_LABELS[p.tipoTramite]} · {ETAPAS.find(e => e.key === p.etapa)?.label ?? p.etapa}
                </p>
              </div>
              <div className="text-xs font-semibold shrink-0" style={{ color: '#D4621A' }}>
                {p.montoCierre > 0 ? formatPesos(p.montoCierre) : ''}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Modal nuevo prospecto */}
      <Modal
        open={modalNuevo}
        onClose={() => setModalNuevo(false)}
        title="Nuevo Prospecto"
        subtitle="Agregá los datos del lead"
        size="lg"
      >
        <ProspectoForm
          etapaInicial={etapaInicial}
          onSave={handleCrear}
          onCancel={() => setModalNuevo(false)}
        />
      </Modal>

      {/* Modal detalle prospecto */}
      {prospectoAbierto && (
        <Modal
          open={!!prospectoAbierto}
          onClose={() => setAbierto(null)}
          title={`${prospectoAbierto.apellido}, ${prospectoAbierto.nombre}`}
          subtitle={TIPO_TRAMITE_LABELS[prospectoAbierto.tipoTramite]}
          size="md"
        >
          <ModalDetalle
            prospecto={prospectoAbierto}
            onClose={() => setAbierto(null)}
            actor={actor}
          />
        </Modal>
      )}

      {/* Modal alertas */}
      <Modal
        open={alertasOpen}
        onClose={() => setAlertasOpen(false)}
        title="Alertas vencidas"
        subtitle={`${tareasUrgentes.length} tarea${tareasUrgentes.length !== 1 ? 's' : ''} pendiente${tareasUrgentes.length !== 1 ? 's' : ''}`}
        size="md"
      >
        <div className="space-y-3">
          {tareasUrgentes.map((t, i) => (
            <div key={i} className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-3">
              <Bell size={16} className="text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{t.descripcion}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t.prospecto.apellido}, {t.prospecto.nombre} · {formatFechaCorta(t.fechaAlerta)}
                </p>
              </div>
              <button
                onClick={() => setAbierto(t.prospecto)}
                className="text-xs text-[#D4621A] hover:underline shrink-0"
              >
                Ver →
              </button>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}

// ─── SKELETON ─────────────────────────────────────────────────────────────────

function SkeletonPipeline() {
  const ETAPA_COLORS = ['bg-gray-100', 'bg-blue-50', 'bg-indigo-50', 'bg-amber-50', 'bg-emerald-50', 'bg-red-50']
  return (
    <div className="flex flex-col h-full animate-fadein">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div className="space-y-2">
          <div className="h-6 w-32 bg-gray-200 rounded-full animate-pulse" />
          <div className="h-3.5 w-52 bg-gray-100 rounded-full animate-pulse" />
        </div>
        <div className="h-9 w-36 bg-gray-100 rounded-xl animate-pulse" />
      </div>

      <div className="grid grid-cols-4 gap-3 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm">
            <div className="h-7 w-10 bg-gray-200 rounded-full animate-pulse mx-auto mb-1" />
            <div className="h-3 w-14 bg-gray-100 rounded-full animate-pulse mx-auto" />
          </div>
        ))}
      </div>

      <div className="h-10 bg-gray-100 rounded-xl animate-pulse mb-4" />

      <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
        {ETAPA_COLORS.map((bg, col) => (
          <div key={col} className="shrink-0 w-64">
            <div className={`${bg} rounded-xl p-3 mb-3 flex items-center justify-between`}>
              <div className="h-3.5 w-20 bg-white/60 rounded-full animate-pulse" />
              <div className="h-5 w-6 bg-white/60 rounded-full animate-pulse" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: col === 0 ? 3 : col === 2 ? 2 : 1 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="h-3.5 w-28 bg-gray-200 rounded-full animate-pulse" />
                    <div className="h-4 w-4 rounded-full bg-gray-100 animate-pulse" />
                  </div>
                  <div className="h-3 w-20 bg-gray-100 rounded-full animate-pulse" />
                  <div className="h-3 w-32 bg-gray-100 rounded-full animate-pulse" />
                  <div className="flex items-center justify-between pt-1">
                    <div className="h-4 w-16 bg-gray-100 rounded-full animate-pulse" />
                    <div className="h-3 w-12 bg-gray-100 rounded-full animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}