// src/features/campanas/ModalNuevaCampana.tsx
import { useState, useEffect } from 'react'
import { Users, MessageSquare, Calendar, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react'
import { useAccionesCampana } from '@/hooks/useCampanas'
import { useGestoriaId }      from '@/context/GestoriaContext'
import {
  TEMPLATES_PREDEFINIDOS, CRITERIO_LABELS, COSTO_CONVERSACION_USD,
} from '@/campana_types'
import type {
  CampanaInput, FiltroAudiencia, TemplateCampana, CriterioAudiencia,
} from '@/campana_types'
import { TIPO_TRAMITE_LABELS } from '@/types'
import { Timestamp } from 'firebase/firestore'

const PASOS = ['Audiencia', 'Template', 'Configurar', 'Confirmar']

interface Props {
  onClose:  () => void
  onCreada: (id: string) => void
}

export default function ModalNuevaCampana({ onClose, onCreada }: Props) {
  const gestoriaId = useGestoriaId()
  const { crear, estimar, estimando, audienciaEstimada, saving } = useAccionesCampana()

  const [paso,       setPaso]       = useState(0)
  const [nombre,     setNombre]     = useState('')
  const [descripcion,setDescripcion]= useState('')
  const [filtro,     setFiltro]     = useState<FiltroAudiencia>({ criterio: 'todos_clientes' })
  const [template,   setTemplate]   = useState<TemplateCampana>(TEMPLATES_PREDEFINIDOS[0])
  const [programada, setProgramada] = useState(false)
  const [fechaEnvio, setFechaEnvio] = useState('')

  // Estimar audiencia cada vez que cambia el filtro
  useEffect(() => {
    estimar(filtro)
  }, [filtro.criterio, filtro.mesesSinTramite, filtro.diasVencimiento, filtro.tipoTramite])

  const costoEstimado = ((audienciaEstimada ?? 0) * COSTO_CONVERSACION_USD).toFixed(2)

  const handleCrear = async () => {
    const input: Omit<CampanaInput, 'creadoPor' | 'creadoPorNombre'> = {
      gestoriaId,
      nombre:      nombre.trim(),
      descripcion: descripcion.trim() || undefined,
      estado:      'borrador',
      template,
      filtro,
      programadaPara: programada && fechaEnvio
        ? Timestamp.fromDate(new Date(fechaEnvio))
        : undefined,
    }
    const id = await crear(input)
    if (id) onCreada(id)
  }

  // ─── PASO 1: Audiencia ─────────────────────────────────────────────────────

  const renderAudiencia = () => (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
          Nombre de la campaña *
        </label>
        <input
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          placeholder="Ej: Reactivación junio 2026"
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none
                     focus:border-[#D4621A] focus:ring-2 focus:ring-[#D4621A]/15 transition-all"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
          Segmento de audiencia
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(CRITERIO_LABELS) as [CriterioAudiencia, string][]).map(([k, lbl]) => (
            <button
              key={k}
              onClick={() => setFiltro({ criterio: k })}
              className={`text-left p-3 rounded-xl border text-sm transition-all ${
                filtro.criterio === k
                  ? 'border-[#D4621A] bg-[#D4621A]/5 text-[#D4621A] font-semibold'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-filtros dinámicos */}
      {filtro.criterio === 'sin_tramite_reciente' && (
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">
            Sin trámite en los últimos
          </label>
          <select
            value={filtro.mesesSinTramite ?? 6}
            onChange={e => setFiltro(f => ({ ...f, mesesSinTramite: Number(e.target.value) }))}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
          >
            {[3,6,9,12].map(m => <option key={m} value={m}>{m} meses</option>)}
          </select>
        </div>
      )}
      {filtro.criterio === 'vencimiento_proximo' && (
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">
            Vencimiento en los próximos
          </label>
          <select
            value={filtro.diasVencimiento ?? 30}
            onChange={e => setFiltro(f => ({ ...f, diasVencimiento: Number(e.target.value) }))}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
          >
            {[15,30,45,60].map(d => <option key={d} value={d}>{d} días</option>)}
          </select>
        </div>
      )}
      {filtro.criterio === 'por_tipo_tramite' && (
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Tipo de trámite</label>
          <select
            value={filtro.tipoTramite ?? ''}
            onChange={e => setFiltro(f => ({ ...f, tipoTramite: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
          >
            <option value="">— Seleccioná —</option>
            {Object.entries(TIPO_TRAMITE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      )}

      {/* Estimación */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-blue-600 font-semibold">Audiencia estimada</p>
          <p className="text-xs text-blue-500 mt-0.5">Con número de teléfono registrado</p>
        </div>
        {estimando ? (
          <Loader2 size={20} className="text-blue-500 animate-spin" />
        ) : (
          <div className="text-right">
            <p className="text-2xl font-extrabold text-blue-700">{audienciaEstimada ?? '—'}</p>
            <p className="text-xs text-blue-500">~${costoEstimado} USD</p>
          </div>
        )}
      </div>
    </div>
  )

  // ─── PASO 2: Template ──────────────────────────────────────────────────────

  const renderTemplate = () => (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Seleccioná uno de los templates predefinidos. Deberás aprobarlos en Meta Business Manager
        antes del primer envío real.
      </p>
      <div className="space-y-3">
        {TEMPLATES_PREDEFINIDOS.map(t => (
          <button
            key={t.nombreMeta}
            onClick={() => setTemplate(t)}
            className={`w-full text-left p-4 rounded-xl border transition-all ${
              template.nombreMeta === t.nombreMeta
                ? 'border-[#D4621A] bg-[#D4621A]/5'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-700 font-mono">{t.nombreMeta}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                t.categoria === 'UTILITY'    ? 'bg-blue-100 text-blue-700'   :
                t.categoria === 'MARKETING'  ? 'bg-purple-100 text-purple-700' :
                'bg-gray-100 text-gray-600'
              }`}>{t.categoria}</span>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">{t.cuerpo}</p>
            <div className="flex flex-wrap gap-1 mt-2">
              {t.variables.map(v => (
                <span key={v.nombre} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                  {`{{${v.nombre}}}`}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  )

  // ─── PASO 3: Configurar ────────────────────────────────────────────────────

  const renderConfigurar = () => (
    <div className="space-y-5">
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
          Descripción interna (opcional)
        </label>
        <textarea
          value={descripcion}
          onChange={e => setDescripcion(e.target.value)}
          placeholder="Notas sobre el objetivo de esta campaña..."
          rows={3}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none
                     focus:border-[#D4621A] resize-none transition-all"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
          Momento de envío
        </label>
        <div className="space-y-2">
          {[
            { val: false, label: 'Enviar manualmente (yo lo activo desde la campaña)' },
            { val: true,  label: 'Programar para fecha y hora específica' },
          ].map(opt => (
            <label key={String(opt.val)} className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:border-gray-300 transition-all">
              <input
                type="radio" name="timing"
                checked={programada === opt.val}
                onChange={() => setProgramada(opt.val)}
                className="accent-[#D4621A]"
              />
              <span className="text-sm text-gray-700">{opt.label}</span>
            </label>
          ))}
        </div>
        {programada && (
          <div className="mt-3">
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Fecha y hora</label>
            <input
              type="datetime-local"
              value={fechaEnvio}
              onChange={e => setFechaEnvio(e.target.value)}
              min={new Date().toISOString().slice(0,16)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
            />
          </div>
        )}
      </div>
    </div>
  )

  // ─── PASO 4: Confirmar ─────────────────────────────────────────────────────

  const renderConfirmar = () => (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-2xl p-5 space-y-3">
        {[
          { label: 'Nombre',     val: nombre },
          { label: 'Segmento',   val: CRITERIO_LABELS[filtro.criterio] },
          { label: 'Audiencia',  val: `${audienciaEstimada ?? '—'} contactos` },
          { label: 'Template',   val: template.nombreMeta },
          { label: 'Categoría',  val: template.categoria },
          { label: 'Costo est.', val: `~$${costoEstimado} USD` },
          { label: 'Envío',      val: programada && fechaEnvio
              ? new Date(fechaEnvio).toLocaleString('es-AR')
              : 'Manual (desde el panel)' },
        ].map(r => (
          <div key={r.label} className="flex items-center justify-between py-1.5 border-b border-gray-200 last:border-0">
            <span className="text-xs font-semibold text-gray-500">{r.label}</span>
            <span className="text-sm text-gray-800 font-medium">{r.val}</span>
          </div>
        ))}
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
        <p className="text-xs text-amber-700 font-semibold">⚠️ Recordá</p>
        <p className="text-xs text-amber-600 mt-1">
          La campaña se creará en estado <strong>Borrador</strong>. El envío real requiere
          que el template esté aprobado por Meta Business Manager y que la Cloud Function
          de WhatsApp esté configurada.
        </p>
      </div>
    </div>
  )

  const puedeAvanzar = () => {
    if (paso === 0) return nombre.trim().length > 2
    if (paso === 1) return !!template.nombreMeta
    if (paso === 2) return !programada || !!fechaEnvio
    return true
  }

  const RENDER = [renderAudiencia, renderTemplate, renderConfigurar, renderConfirmar]
  const ICONOS = [<Users size={14} />, <MessageSquare size={14} />, <Calendar size={14} />, <ChevronRight size={14} />]

  return (
    <div>
      {/* Stepper */}
      <div className="flex items-center gap-1 mb-6">
        {PASOS.map((p, i) => (
          <div key={p} className="flex items-center gap-1 flex-1">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              i === paso   ? 'bg-[#D4621A] text-white' :
              i < paso     ? 'bg-emerald-100 text-emerald-700' :
              'bg-gray-100 text-gray-400'
            }`}>
              {ICONOS[i]} {p}
            </div>
            {i < PASOS.length - 1 && <div className="flex-1 h-px bg-gray-200" />}
          </div>
        ))}
      </div>

      {/* Contenido del paso */}
      <div className="min-h-[300px]">{RENDER[paso]()}</div>

      {/* Navegación */}
      <div className="flex items-center justify-between pt-5 border-t border-gray-100 mt-5">
        <button
          onClick={() => paso === 0 ? onClose() : setPaso(p => p - 1)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ChevronLeft size={14} /> {paso === 0 ? 'Cancelar' : 'Atrás'}
        </button>
        {paso < PASOS.length - 1 ? (
          <button
            onClick={() => setPaso(p => p + 1)}
            disabled={!puedeAvanzar()}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-[#D4621A] hover:bg-[#b8541a]
                       text-white text-sm font-semibold rounded-xl transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Siguiente <ChevronRight size={14} />
          </button>
        ) : (
          <button
            onClick={handleCrear}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#D4621A] hover:bg-[#b8541a]
                       text-white text-sm font-semibold rounded-xl transition-colors
                       disabled:opacity-60"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Crear campaña
          </button>
        )}
      </div>
    </div>
  )
}