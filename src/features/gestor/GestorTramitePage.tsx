// src/features/gestor/GestorTramitePage.tsx
// Vista mobile-first del mandatario para gestionar los 7 pasos de una inscripción inicial.

import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Camera, CheckCircle2, Lock,
  ChevronDown, ChevronUp, AlertTriangle, X,
  Plus, RefreshCw, Car,
} from 'lucide-react'
import { useAuth }                from '@/hooks/useAuth'
import { usePageTitle }           from '@/hooks/usePageTitle'
import { useTramite }             from '@/hooks/useTramites'
import { useInscripcionWorkflow } from '@/hooks/useInscripcionWorkflow'
import { GestorMultaWorkflow }    from '@/components/GestorMultaWorkflow'
import { PASOS_INSCRIPCION }      from '@/types/torre.types'
import { formatFecha }            from '@/utils'
import type { FotoLocal }         from '@/hooks/useInscripcionWorkflow'

// ─── CAMPO DE TEXTO ───────────────────────────────────────────────────────────

function Campo({
  label, campo, tipo = 'text', datos, onChange,
}: {
  label:    string
  campo:    string
  tipo?:    string
  datos:    Record<string, string | number>
  onChange: (campo: string, val: string | number) => void
}) {
  const val = datos[campo] ?? ''
  return (
    <div className="mb-3">
      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      <input
        type={tipo}
        value={String(val)}
        onChange={e => onChange(campo, tipo === 'number' ? Number(e.target.value) : e.target.value)}
        placeholder={label}
        className="w-full px-3 py-2.5 bg-white/6 border border-white/12 rounded-xl
                   text-sm text-gray-100 placeholder-gray-600 outline-none
                   focus:border-[#D4621A]/50 focus:bg-white/8 transition-all"
      />
    </div>
  )
}

// ─── ITEM DE FOTO ─────────────────────────────────────────────────────────────

function FotoItem({ foto, idx, onResubir }: { foto: FotoLocal; idx: number; onResubir: () => void }) {
  const borderColor =
    foto.estado === 'rechazada'   ? 'border-red-600/40 bg-red-900/10'  :
    foto.estado === 'validando'   ? 'border-blue-500/30 bg-blue-900/8' :
    foto.estado === 'subiendo'    ? 'border-blue-500/30 bg-blue-900/8' :
    foto.estado === 'error_upload'? 'border-red-600/40 bg-red-900/10'  :
    'border-emerald-500/30 bg-emerald-900/8'

  return (
    <div className={`rounded-xl border p-3 mb-2 ${borderColor}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-gray-400">Foto {idx + 1}</span>
        {foto.estado === 'validando' && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30">
            ⏳ Validando...
          </span>
        )}
        {foto.estado === 'subiendo' && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30">
            ⬆ Subiendo {foto.progreso}%
          </span>
        )}
        {foto.estado === 'ok' && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            ✓ Válida
          </span>
        )}
        {(foto.estado === 'rechazada' || foto.estado === 'error_upload') && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-600/15 text-red-400 border border-red-600/30">
            ✗ {foto.estado === 'rechazada' ? 'Rechazada' : 'Error'}
          </span>
        )}
      </div>

      {/* Preview */}
      {foto.preview && (
        <img
          src={foto.preview}
          alt={`Foto ${idx + 1}`}
          className="w-full h-24 object-cover rounded-lg mb-2"
        />
      )}

      {/* Barra de progreso */}
      {foto.estado === 'subiendo' && (
        <div className="h-1 bg-white/8 rounded-full overflow-hidden mb-2">
          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${foto.progreso}%` }} />
        </div>
      )}

      {/* Mensaje de rechazo */}
      {foto.razon && (
        <div className="bg-red-900/20 rounded-lg px-2.5 py-2 mb-2">
          <p className="text-[11px] text-red-400 leading-snug">⚠ {foto.razon}</p>
        </div>
      )}

      {/* Botón de resubida */}
      {(foto.estado === 'rechazada' || foto.estado === 'error_upload') && (
        <button
          onClick={onResubir}
          className="w-full py-2 bg-white/5 border border-white/12 rounded-lg
                     text-xs font-semibold text-gray-300 hover:bg-white/8 transition-all"
        >
          📷 Volver a subir esta foto
        </button>
      )}
    </div>
  )
}

// ─── BLOQUE DE FOTOS ──────────────────────────────────────────────────────────

function BloqueSubidaFotos({
  pasoId, cantidadFotos, labelFotos, fotos, onAgregarFoto,
}: {
  pasoId:       number
  cantidadFotos: number | 'variable'
  labelFotos:   string
  fotos:        FotoLocal[]
  onAgregarFoto:(file: File, reemplazaIdx?: number) => void
}) {
  const inputRef      = useRef<HTMLInputElement>(null)
  const resubirRefs   = useRef<Record<number, HTMLInputElement>>({})
  const [preguntarOtra, setPreguntarOtra] = useState(false)

  const fotosOk      = fotos.filter(f => f.estado === 'ok').length
  const hayValidando = fotos.some(f => f.estado === 'validando' || f.estado === 'subiendo')
  const limite       = typeof cantidadFotos === 'number' ? cantidadFotos : Infinity
  const puedeAgregar = !hayValidando && fotosOk < limite && !preguntarOtra && !fotos.some(f => f.estado === 'rechazada' || f.estado === 'error_upload')

  const handleNueva = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    onAgregarFoto(file)

    if (cantidadFotos === 'variable') setPreguntarOtra(true)
  }, [onAgregarFoto, cantidadFotos])

  const handleResubir = useCallback((idx: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    onAgregarFoto(file, idx)
  }, [onAgregarFoto])

  return (
    <div className="mt-3">
      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
        📎 {labelFotos}
        {typeof cantidadFotos === 'number' && (
          <span className="font-normal ml-1.5">({fotosOk}/{cantidadFotos} requeridas)</span>
        )}
        {cantidadFotos === 'variable' && (
          <span className="font-normal ml-1.5">(cantidad variable)</span>
        )}
      </div>

      {/* Fotos existentes */}
      {fotos.map((foto, i) => (
        <div key={i}>
          <input
            ref={el => { if (el) resubirRefs.current[i] = el }}
            type="file" accept="image/*" capture="environment"
            className="hidden"
            onChange={handleResubir(i)}
          />
          <FotoItem
            foto={foto}
            idx={i}
            onResubir={() => resubirRefs.current[i]?.click()}
          />
        </div>
      ))}

      {/* Input principal */}
      <input
        ref={inputRef}
        type="file" accept="image/*" capture="environment"
        className="hidden"
        onChange={handleNueva}
      />

      {/* ¿Agregar otra? */}
      {preguntarOtra && cantidadFotos === 'variable' && (
        <div className="bg-blue-900/15 border border-blue-500/25 rounded-xl p-3 mb-2">
          <p className="text-xs font-semibold text-blue-300 mb-1">✓ Foto cargada correctamente</p>
          <p className="text-xs text-gray-400 mb-3">¿Querés subir otro documento?</p>
          <div className="flex gap-2">
            <button
              onClick={() => { setPreguntarOtra(false); inputRef.current?.click() }}
              className="flex-1 py-2 rounded-lg bg-blue-500/15 border border-blue-500/30
                         text-blue-400 text-xs font-bold transition-all hover:bg-blue-500/25"
            >
              📷 Sí, subir otro
            </button>
            <button
              onClick={() => setPreguntarOtra(false)}
              className="flex-1 py-2 rounded-lg bg-white/5 border border-white/10
                         text-gray-400 text-xs font-semibold transition-all hover:bg-white/8"
            >
              No, continuar
            </button>
          </div>
        </div>
      )}

      {/* Botón agregar */}
      {puedeAgregar && !preguntarOtra && (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full py-4 border-2 border-dashed border-white/12 rounded-xl
                     flex items-center justify-center gap-2 text-gray-500 text-sm
                     hover:border-white/25 hover:text-gray-400 transition-all"
        >
          <Camera size={18} />
          {fotos.length === 0
            ? 'Tomar o subir foto'
            : cantidadFotos === 'variable'
            ? 'Agregar otro documento'
            : `Subir foto ${fotosOk + 1} de ${cantidadFotos}`}
        </button>
      )}

      {/* Validando */}
      {hayValidando && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-blue-900/12 rounded-xl text-xs text-blue-400 mt-1">
          <RefreshCw size={13} className="animate-spin shrink-0" />
          Validando calidad de imagen...
        </div>
      )}
    </div>
  )
}

// ─── MODAL: INGRESO DE DÍAS CHAPA PATENTE ────────────────────────────────────

function ModalChapaPatente({
  onConfirmar,
  registroUbicacion,
}: {
  onConfirmar:       (dias: number) => void
  registroUbicacion: string
}) {
  const [dias, setDias] = useState(15)
  const fechaEstimada   = new Date()
  fechaEstimada.setDate(fechaEstimada.getDate() + dias)

  const formatFechaLocal = (d: Date) =>
    d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-4 pb-4 sm:pb-0">
      <div className="w-full max-w-sm bg-[#111827] border border-white/12 rounded-2xl overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="bg-orange-500/10 border-b border-orange-500/20 px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <Car size={18} className="text-orange-400 shrink-0" />
            <h3 className="text-sm font-bold text-orange-300">Chapa / Patente Pendiente</h3>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Documentación presentada correctamente ✓ Antes de finalizar, indicá cuántos días
            tardará la chapa patente en estar disponible para retirar.
          </p>
        </div>

        <div className="px-5 py-4">

          {/* Registro automático */}
          {registroUbicacion && (
            <div className="mb-4 px-3 py-2 bg-white/4 rounded-lg border border-white/8">
              <p className="text-[10px] text-gray-600 mb-0.5">📍 Registro de retiro</p>
              <p className="text-xs font-semibold text-gray-300">{registroUbicacion}</p>
            </div>
          )}

          {/* Selector de días */}
          <p className="text-xs font-bold text-gray-400 mb-3">
            Días hasta la chapa (indicados por el Registro):
          </p>

          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setDias(d => Math.max(1, d - 1))}
              className="w-10 h-10 rounded-xl bg-white/8 border border-white/12 text-white text-lg font-bold
                         hover:bg-white/12 transition-all flex items-center justify-center"
            >
              −
            </button>

            <div className="flex-1 text-center">
              <input
                type="number"
                value={dias}
                min={1}
                onChange={e => setDias(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full text-center text-3xl font-extrabold text-white bg-transparent
                           border-b-2 border-orange-500/50 outline-none pb-1
                           focus:border-orange-500 transition-all"
              />
              <p className="text-[10px] text-gray-600 mt-1">días</p>
            </div>

            <button
              onClick={() => setDias(d => d + 1)}
              className="w-10 h-10 rounded-xl bg-white/8 border border-white/12 text-white text-lg font-bold
                         hover:bg-white/12 transition-all flex items-center justify-center"
            >
              +
            </button>
          </div>

          {/* Fecha estimada */}
          <div className="bg-orange-500/8 border border-orange-500/20 rounded-xl px-4 py-3 mb-5">
            <p className="text-[10px] text-orange-400/70 mb-0.5">📅 Fecha estimada de retiro</p>
            <p className="text-sm font-bold text-orange-300 capitalize">
              {formatFechaLocal(fechaEstimada)}
            </p>
            <p className="text-[10px] text-gray-600 mt-1">
              Recibirás alertas 7, 5 y 3 días antes, a las 24hs y el día del retiro.
            </p>
          </div>

          <button
            onClick={() => onConfirmar(dias)}
            className="w-full py-3.5 rounded-xl bg-orange-500 hover:bg-orange-400
                       text-white text-sm font-extrabold tracking-wide transition-all
                       shadow-lg shadow-orange-500/25"
          >
            Confirmar fecha de retiro
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── MODAL: ALERTA DÍA DE RETIRO ─────────────────────────────────────────────

function ModalAlertaRetiro({
  tramiteId, registroUbicacion, onRetiro, onPostergar,
}: {
  tramiteId:         string
  registroUbicacion: string
  onRetiro:          () => void
  onPostergar:       () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-4 pb-4 sm:pb-0">
      <div className="w-full max-w-sm bg-[#111827] border border-red-600/30 rounded-2xl overflow-hidden shadow-2xl">
        <div className="bg-red-900/20 border-b border-red-600/20 px-5 py-4 text-center">
          <span className="text-3xl">🚨</span>
          <h3 className="text-sm font-bold text-red-300 mt-1">HOY es el día de retiro de chapa</h3>
          <p className="text-[10px] text-gray-500 mt-1 font-mono">{tramiteId}</p>
        </div>
        <div className="px-5 py-4">
          {registroUbicacion && (
            <div className="mb-4 px-3 py-2 bg-white/4 rounded-lg border border-white/8 text-center">
              <p className="text-[10px] text-gray-600 mb-0.5">📍 Registro</p>
              <p className="text-xs font-semibold text-gray-300">{registroUbicacion}</p>
            </div>
          )}
          <p className="text-xs text-gray-400 text-center mb-4">¿Pudiste retirar la chapa patente?</p>
          <div className="flex gap-3">
            <button onClick={onRetiro}
              className="flex-1 py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30
                         text-emerald-400 text-sm font-bold hover:bg-emerald-500/25 transition-all">
              ✓ Sí, la retiré
            </button>
            <button onClick={onPostergar}
              className="flex-1 py-3 rounded-xl bg-red-600/10 border border-red-600/25
                         text-red-400 text-sm font-bold hover:bg-red-600/15 transition-all">
              ✗ No pude
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── MODAL: POSTERGAR RETIRO ──────────────────────────────────────────────────

function ModalPostergar({ onConfirmar, onCancelar }: { onConfirmar: (dias: number, nota: string) => void; onCancelar: () => void }) {
  const [dias, setDias] = useState(7)
  const [nota, setNota] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-4 pb-4 sm:pb-0">
      <div className="w-full max-w-sm bg-[#111827] border border-white/12 rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <h3 className="text-sm font-bold text-gray-200">Nueva fecha de retiro</h3>
          <button onClick={onCancelar} className="text-gray-600 hover:text-gray-300 transition-colors"><X size={16} /></button>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-gray-500 mb-4">¿Cuántos días se postergó la entrega de la chapa?</p>
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setDias(d => Math.max(1, d - 1))}
              className="w-10 h-10 rounded-xl bg-white/8 border border-white/12 text-white text-lg font-bold hover:bg-white/12 transition-all flex items-center justify-center">−</button>
            <div className="flex-1 text-center">
              <input type="number" value={dias} min={1}
                onChange={e => setDias(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full text-center text-3xl font-extrabold text-white bg-transparent border-b-2 border-[#D4621A]/50 outline-none pb-1 focus:border-[#D4621A] transition-all" />
              <p className="text-[10px] text-gray-600 mt-1">días</p>
            </div>
            <button onClick={() => setDias(d => d + 1)}
              className="w-10 h-10 rounded-xl bg-white/8 border border-white/12 text-white text-lg font-bold hover:bg-white/12 transition-all flex items-center justify-center">+</button>
          </div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            Nota (opcional)
          </label>
          <textarea
            value={nota}
            onChange={e => setNota(e.target.value)}
            placeholder="Ej: El Registro indicó demora por..."
            rows={2}
            className="w-full px-3 py-2.5 bg-white/6 border border-white/12 rounded-xl
                       text-xs text-gray-300 placeholder-gray-600 outline-none resize-none
                       focus:border-[#D4621A]/40 transition-all mb-4"
          />
          <button onClick={() => onConfirmar(dias, nota)}
            className="w-full py-3 rounded-xl bg-[#D4621A] hover:bg-[#c4571a]
                       text-white text-sm font-extrabold transition-all shadow-lg shadow-[#D4621A]/20">
            Confirmar nueva fecha
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── VISTA MULTA (wrapper mobile para GestorMultaWorkflow) ───────────────────

function GestorMultaView({ tramiteId, patente, navigate }: {
  tramiteId: string
  patente:   string
  navigate:  (to: string) => void
}) {
  usePageTitle(`Multa ${patente}`)
  return (
    <div className="min-h-screen bg-[#080d14] text-gray-200" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* Header sticky */}
      <div className="sticky top-0 z-40 bg-[#0a0f1a] border-b border-white/8 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/gestor')}
            className="w-8 h-8 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-gray-400 hover:text-gray-200 transition-colors shrink-0"
          >
            <ArrowLeft size={14} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-mono text-gray-600">Multa / Infracción LIT</p>
            <p className="text-sm font-bold text-gray-100 truncate">{patente}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-gray-600">Trámite</p>
            <p className="text-xs font-extrabold text-amber-400">⚖️ LIT</p>
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="px-4 py-5 pb-24">
        <GestorMultaWorkflow tramiteId={tramiteId} />
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function GestorTramitePage() {
  const { tramiteId } = useParams<{ tramiteId: string }>()
  const navigate      = useNavigate()
  const { user }      = useAuth()

  const { tramite, loading: loadingTramite } = useTramite(tramiteId)
  const {
    workflow, loading: loadingWf, guardando, geoCapturando, error,
    pasoActual, fotosLocales, datosLocales,
    agregarFoto, actualizarDato, puedeAvanzar,
    confirmarPaso, iniciarChapaPatente, confirmarRetiro, postergarRetiro,
  } = useInscripcionWorkflow(tramiteId ?? '')

  usePageTitle(tramite ? `Inscripción ${tramite.patente}` : 'Trámite')

  const [modalChapa,     setModalChapa]     = useState(false)
  const [modalAlerta,    setModalAlerta]    = useState(false)
  const [modalPostergar, setModalPostergar] = useState(false)
  const [confirmandoRetiro, setConfirmandoRetiro] = useState(false)
  const [fotoChapa, setFotoChapa] = useState<File | null>(null)
  const fotoChapaRef = useRef<HTMLInputElement>(null)

  // Detectar si el modal de chapa debe aparecer automáticamente
  // (justo después de confirmar paso 5, cuando pasoActual pasa a 6 y no hay paso6 iniciado)
  useEffect(() => {
    if (pasoActual === 6 && workflow && !workflow.paso6) {
      setModalChapa(true)
    }
  }, [pasoActual, workflow])

  // Detectar si hoy es el día de retiro
  useEffect(() => {
    if (!workflow?.paso6 || workflow.paso6.estado !== 'pendiente') return
    const fechaRetiro = workflow.paso6.fechaEstimadaRetiro.toDate()
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    fechaRetiro.setHours(0, 0, 0, 0)
    if (fechaRetiro.getTime() <= hoy.getTime()) {
      setModalAlerta(true)
    }
  }, [workflow?.paso6])

  const handleConfirmarRetiro = async () => {
    if (!fotoChapa) {
      fotoChapaRef.current?.click()
      return
    }
    await confirmarRetiro(fotoChapa)
    setConfirmandoRetiro(false)
    setFotoChapa(null)
  }

  // ── Early return: multa/infracción LIT ───────────────────────────────────
  // El workflow de multas tiene su propia pantalla mobile-first.
  // Lo detectamos en cuanto el trámite carga (sin esperar el workflow de inscripción).
  if (!loadingTramite && tramite?.tipo === 'descargo_multa') {
    return (
      <GestorMultaView
        tramiteId={tramite.id}
        patente={tramite.patente}
        navigate={navigate}
      />
    )
  }

  if (loadingTramite || loadingWf) {
    return (
      <div className="min-h-screen bg-[#080d14] flex items-center justify-center">
        <div className="text-center">
          <RefreshCw size={24} className="animate-spin text-[#D4621A] mx-auto mb-3" />
          <p className="text-xs text-gray-600">Cargando trámite...</p>
        </div>
      </div>
    )
  }

  if (!tramite || !workflow) {
    return (
      <div className="min-h-screen bg-[#080d14] flex items-center justify-center px-6">
        <div className="text-center">
          <AlertTriangle size={28} className="text-yellow-500 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Trámite no encontrado o sin workflow activo.</p>
          <button onClick={() => navigate('/admin/gestor')}
            className="mt-4 text-xs text-[#D4621A] underline">
            Volver a mis trámites
          </button>
        </div>
      </div>
    )
  }

  const paso6 = workflow.paso6

  return (
    <div className="min-h-screen bg-[#080d14] text-gray-200" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* Header sticky */}
      <div className="sticky top-0 z-40 bg-[#0a0f1a] border-b border-white/8 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin/gestor')}
            className="w-8 h-8 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-gray-400 hover:text-gray-200 transition-colors shrink-0">
            <ArrowLeft size={14} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-mono text-gray-600">{workflow.tramiteId}</p>
            <p className="text-sm font-bold text-gray-100 truncate">{tramite.patente || 'Sin patente'}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-gray-600">Paso</p>
            <p className="text-lg font-extrabold" style={{ color: PASOS_INSCRIPCION[pasoActual - 1]?.color }}>
              {pasoActual}/7
            </p>
          </div>
        </div>

        {/* Barra de progreso */}
        <div className="flex gap-0.5 mt-2.5">
          {PASOS_INSCRIPCION.map((p, i) => (
            <div key={p.id} className="flex-1 h-1 rounded-full transition-all"
              style={{
                background: i < pasoActual - 1 ? p.color
                  : i === pasoActual - 1 ? `${p.color}60`
                  : 'rgba(255,255,255,0.07)',
              }} />
          ))}
        </div>
      </div>

      <div className="px-4 py-4 pb-24">

        {/* Pasos completados (colapsados) */}
        {PASOS_INSCRIPCION.filter((_, i) => i < pasoActual - 1).map(p => (
          <div key={p.id}
            className="flex items-center gap-3 px-3 py-2.5 mb-2 rounded-xl
                       bg-emerald-900/10 border border-emerald-500/20">
            <span className="text-base shrink-0">{p.icono}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-emerald-400 truncate">{p.titulo}</p>
              <p className="text-[10px] text-gray-600">Completado ✓</p>
            </div>
            <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
          </div>
        ))}

        {/* Paso activo */}
        {pasoActual <= 7 && (() => {
          const paso = PASOS_INSCRIPCION[pasoActual - 1]
          const puede = puedeAvanzar()

          // Paso 6 — lógica especial de chapa patente
          if (paso.id === 6) {
            return (
              <div className="rounded-2xl border p-4" style={{ background: `${paso.color}08`, borderColor: `${paso.color}35` }}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
                    style={{ background: `${paso.color}18`, border: `1px solid ${paso.color}40` }}>
                    {paso.icono}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-100">{paso.titulo}</p>
                    <p className="text-[11px] font-semibold" style={{ color: paso.color }}>{paso.subtitulo}</p>
                  </div>
                </div>

                {!paso6 ? (
                  <div className="text-center py-4">
                    <RefreshCw size={16} className="animate-spin text-gray-600 mx-auto mb-2" />
                    <p className="text-xs text-gray-600">Cargando datos de chapa...</p>
                  </div>
                ) : (
                  <div>
                    {/* Estado actual */}
                    <div className="bg-white/4 border border-white/8 rounded-xl p-3 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Estado de la chapa</p>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          paso6.estado === 'pendiente'  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/25' :
                          paso6.estado === 'atrasada'   ? 'bg-red-600/15 text-red-400 border border-red-600/25' :
                          paso6.estado === 'postergada' ? 'bg-orange-500/15 text-orange-400 border border-orange-500/25' :
                          'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                        }`}>
                          {paso6.estado.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-300">
                        📅 Fecha estimada: <span className="font-semibold text-orange-300">
                          {formatFecha(paso6.fechaEstimadaRetiro)}
                        </span>
                      </p>
                      {paso6.registroUbicacion && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          📍 {paso6.registroUbicacion}
                        </p>
                      )}
                      {paso6.intentos.length > 0 && (
                        <p className="text-[10px] text-gray-600 mt-1">
                          Intento {paso6.intentos.length} — {paso6.intentos[paso6.intentos.length - 1]?.resultado}
                        </p>
                      )}
                    </div>

                    {/* Confirmar retiro (si el estado lo permite) */}
                    {(paso6.estado === 'pendiente' || paso6.estado === 'atrasada' || paso6.estado === 'postergada') && (
                      !confirmandoRetiro ? (
                        <div>
                          {geoCapturando && (
                            <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-xl bg-blue-900/20 border border-blue-500/25">
                              <RefreshCw size={12} className="animate-spin text-blue-400 shrink-0" />
                              <p className="text-[11px] text-blue-300">Registrando ubicación GPS...</p>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button onClick={() => setConfirmandoRetiro(true)} disabled={geoCapturando}
                              className="flex-1 py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30
                                         text-emerald-400 text-sm font-bold hover:bg-emerald-500/25 transition-all
                                         disabled:opacity-50 disabled:cursor-not-allowed">
                              📍 Retiré la chapa
                            </button>
                            <button onClick={() => setModalPostergar(true)} disabled={geoCapturando}
                              className="flex-1 py-3 rounded-xl bg-orange-500/10 border border-orange-500/25
                                         text-orange-400 text-sm font-bold hover:bg-orange-500/15 transition-all
                                         disabled:opacity-50 disabled:cursor-not-allowed">
                              Postergar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-xs text-gray-400 text-center">Subí una foto de la chapa para confirmar el retiro</p>
                          <input ref={fotoChapaRef} type="file" accept="image/*" capture="environment"
                            className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) setFotoChapa(f); e.target.value = '' }} />
                          {fotoChapa ? (
                            <div className="bg-emerald-900/10 border border-emerald-500/20 rounded-xl p-3">
                              <p className="text-xs text-emerald-400">✓ Foto seleccionada: {fotoChapa.name}</p>
                            </div>
                          ) : (
                            <button onClick={() => fotoChapaRef.current?.click()}
                              className="w-full py-4 border-2 border-dashed border-white/12 rounded-xl
                                         flex items-center justify-center gap-2 text-gray-500 text-sm
                                         hover:border-white/25 hover:text-gray-400 transition-all">
                              <Camera size={18} /> Tomar foto de la chapa
                            </button>
                          )}
                          <div className="flex gap-2">
                            <button onClick={() => { setConfirmandoRetiro(false); setFotoChapa(null) }}
                              className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-500 text-sm font-semibold">
                              Cancelar
                            </button>
                            <button onClick={handleConfirmarRetiro} disabled={!fotoChapa || guardando || geoCapturando}
                              className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400
                                         disabled:opacity-40 disabled:cursor-not-allowed
                                         text-white text-sm font-extrabold transition-all">
                              {geoCapturando ? '📍 Ubicación...' : guardando ? 'Guardando...' : 'Finalizar trámite ✓'}
                            </button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            )
          }

          // Paso 7 — finalizado
          if (paso.id === 7) {
            return (
              <div className="text-center py-10">
                <CheckCircle2 size={48} className="text-emerald-400 mx-auto mb-3" />
                <h2 className="text-lg font-bold text-emerald-300 mb-1">Trámite Finalizado</h2>
                <p className="text-sm text-gray-500">La gestión fue completada y archivada correctamente.</p>
              </div>
            )
          }

          // Pasos 1-5 estándar
          return (
            <div className="rounded-2xl border p-4" style={{ background: `${paso.color}08`, borderColor: `${paso.color}35` }}>
              {/* Header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
                  style={{ background: `${paso.color}18`, border: `1px solid ${paso.color}40` }}>
                  {paso.icono}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-100">{paso.titulo}</p>
                  <p className="text-[11px] font-semibold" style={{ color: paso.color }}>{paso.subtitulo}</p>
                </div>
              </div>

              {/* Descripción */}
              <div className="bg-white/3 rounded-xl px-3 py-2.5 mb-3 border border-white/6">
                <p className="text-xs text-gray-400 leading-relaxed">{paso.descripcion}</p>
              </div>

              {/* Campos de datos */}
              {paso.requiereDatos?.map(campo => (
                <Campo
                  key={campo}
                  label={{
                    nombreTitular:    'Nombre completo del titular',
                    nroDni:           'N° de DNI',
                    fechaTurno:       'Fecha del turno',
                    horaTurno:        'Hora del turno',
                    registroUbicacion:'Registro / Ubicación',
                    montoGestor:      'Monto al gestor ($)',
                  }[campo] ?? campo}
                  campo={campo}
                  tipo={{ nroDni:'text', fechaTurno:'date', horaTurno:'time', montoGestor:'number' }[campo] ?? 'text'}
                  datos={datosLocales}
                  onChange={actualizarDato}
                />
              ))}

              {/* Fotos */}
              {paso.fotos && paso.cantidadFotos && paso.labelFotos && (
                <BloqueSubidaFotos
                  pasoId={paso.id}
                  cantidadFotos={paso.cantidadFotos}
                  labelFotos={paso.labelFotos}
                  fotos={fotosLocales}
                  onAgregarFoto={agregarFoto}
                />
              )}

              {/* Error */}
              {error && (
                <div className="bg-red-900/15 border border-red-600/30 rounded-xl px-3 py-2.5 mt-3">
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}

              {/* Botón avanzar */}
              {paso.accion && (
                <>
                  {/* Indicador geo — solo visible en paso 5 mientras captura */}
                  {paso.id === 5 && geoCapturando && (
                    <div className="flex items-center gap-2 px-3 py-2 mt-3 rounded-xl bg-blue-900/20 border border-blue-500/25">
                      <RefreshCw size={12} className="animate-spin text-blue-400 shrink-0" />
                      <p className="text-[11px] text-blue-300">Obteniendo ubicación GPS...</p>
                    </div>
                  )}
                  <button
                    onClick={puede && !guardando && !geoCapturando ? confirmarPaso : undefined}
                    disabled={!puede || guardando || geoCapturando}
                    className="w-full py-4 mt-4 rounded-xl text-sm font-extrabold tracking-wide transition-all"
                    style={{
                      background:  puede ? `linear-gradient(135deg, ${paso.color}, ${paso.color}cc)` : 'rgba(255,255,255,0.05)',
                      color:       puede ? '#fff' : '#475569',
                      cursor:      puede ? 'pointer' : 'not-allowed',
                      boxShadow:   puede ? `0 4px 20px ${paso.color}35` : 'none',
                      border:      puede ? 'none' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {geoCapturando ? (
                      <span className="flex items-center justify-center gap-2">
                        <RefreshCw size={14} className="animate-spin" /> Obteniendo ubicación...
                      </span>
                    ) : guardando ? (
                      <span className="flex items-center justify-center gap-2">
                        <RefreshCw size={14} className="animate-spin" /> Guardando...
                      </span>
                    ) : !puede ? (
                      paso.fotos
                        ? `Subí ${typeof paso.cantidadFotos === 'number' ? `${paso.cantidadFotos} foto${paso.cantidadFotos > 1 ? 's' : ''}` : 'al menos 1 foto'} para continuar`
                        : 'Completá todos los campos'
                    ) : paso.id === 5 ? (
                      <span className="flex items-center justify-center gap-2">
                        📍 {paso.accion}
                      </span>
                    ) : paso.accion}
                  </button>
                </>
              )}
            </div>
          )
        })()}

        {/* Pasos futuros bloqueados */}
        {PASOS_INSCRIPCION.filter((_, i) => i > pasoActual - 1).map(p => (
          <div key={p.id}
            className="flex items-center gap-3 px-3 py-2.5 mt-2 rounded-xl
                       bg-white/2 border border-white/5 opacity-40">
            <span className="text-base grayscale shrink-0">{p.icono}</span>
            <div>
              <p className="text-xs font-semibold text-gray-600">{p.titulo}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <Lock size={9} className="text-gray-700" />
                <p className="text-[10px] text-gray-700">Bloqueado</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modales */}
      {modalChapa && (
        <ModalChapaPatente
          registroUbicacion={workflow.paso4?.registroUbicacion ?? ''}
          onConfirmar={async (dias) => { setModalChapa(false); await iniciarChapaPatente(dias) }}
        />
      )}

      {modalAlerta && paso6 && (
        <ModalAlertaRetiro
          tramiteId={workflow.tramiteId}
          registroUbicacion={paso6.registroUbicacion}
          onRetiro={() => { setModalAlerta(false); setConfirmandoRetiro(true) }}
          onPostergar={() => { setModalAlerta(false); setModalPostergar(true) }}
        />
      )}

      {modalPostergar && (
        <ModalPostergar
          onConfirmar={async (dias, nota) => {
            setModalPostergar(false)
            await postergarRetiro(dias, nota)
          }}
          onCancelar={() => setModalPostergar(false)}
        />
      )}
    </div>
  )
}