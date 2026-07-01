// src/components/TransferenciaWorkflow.tsx
import { useState, useRef } from 'react'
import {
  AlertTriangle, Calendar, Camera, CheckCircle2,
  ChevronDown, ChevronUp, Clock, MapPin, Upload,
  X, User, FileText, Bell, RefreshCw,
} from 'lucide-react'
import { useTransferenciaWorkflow } from '@/hooks/useTransferenciaWorkflow'
import { useGeolocalizacion }       from '@/hooks/useGeolocalizacion'
import AlertaGeoPermiso             from '@/components/shared/AlertaGeoPermiso'
import { useAuthStore }             from '@/store/authStore'
import { usePermisos }              from '@/hooks/usePermisos'
import { useGestoresEquipo }        from '@/hooks/useEquipo'
import {
  PASOS_TRANSFERENCIA, ESTADO_TRF_LABELS, ESTADO_TRF_COLORS,
  getConfigPlazos,
} from '@/transferencia_types'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function FotoUploader({
  label, required = false, onChange, preview, accept = 'image/*',
}: {
  label: string; required?: boolean
  onChange: (f: File | undefined) => void
  preview?: string | null
  accept?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </p>
      <div
        onClick={() => ref.current?.click()}
        className={`border-2 border-dashed rounded-xl flex flex-col items-center
          justify-center gap-1 cursor-pointer transition-all min-h-[72px]
          ${preview ? 'border-emerald-300 bg-emerald-50/30' : 'border-gray-200 hover:border-[#D4621A]/40 hover:bg-[#D4621A]/5'}`}
      >
        {preview ? (
          <div className="relative w-full p-1">
            <img src={preview} alt={label} className="w-full h-20 object-cover rounded-lg" />
            <button type="button"
              onClick={e => { e.stopPropagation(); onChange(undefined) }}
              className="absolute top-2 right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
            ><X size={10} /></button>
          </div>
        ) : (
          <>
            <Camera size={16} className="text-gray-300" />
            <span className="text-[10px] text-gray-400">Foto</span>
          </>
        )}
      </div>
      <input ref={ref} type="file" accept={accept} capture="environment"
        className="hidden" onChange={e => onChange(e.target.files?.[0])} />
    </div>
  )
}

function DocParUploader({
  label, required = false,
  onFrente, onDorso, prevFrente, prevDorso,
}: {
  label: string; required?: boolean
  onFrente: (f?: File) => void; onDorso: (f?: File) => void
  prevFrente?: string | null; prevDorso?: string | null
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-gray-600 flex items-center gap-1">
        <FileText size={11} /> {label}
        {required && <span className="text-red-500 text-[10px] ml-1">obligatorio</span>}
        {!required && <span className="text-gray-400 text-[10px] ml-1">opcional</span>}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <FotoUploader label="Frente" required={required} onChange={onFrente} preview={prevFrente} />
        <FotoUploader label="Dorso"  required={required} onChange={onDorso}  preview={prevDorso} />
      </div>
    </div>
  )
}

function PasoHeader({
  paso, pasoActual, colapsado, onToggle,
}: { paso: number; pasoActual: number; colapsado: boolean; onToggle: () => void }) {
  const config    = PASOS_TRANSFERENCIA.find(p => p.id === paso)!
  const completado = pasoActual > paso
  const activo     = pasoActual === paso

  return (
    <button onClick={onToggle} className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all
      ${activo ? 'border-[#D4621A]/40 bg-[#D4621A]/5' :
        completado ? 'border-emerald-200 bg-emerald-50/40' :
        'border-gray-100 bg-gray-50 opacity-50'}`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0
        ${completado ? 'bg-emerald-500 text-white' :
          activo     ? 'bg-[#D4621A] text-white' :
          'bg-gray-200 text-gray-400'}`}
      >
        {completado ? '✓' : config.icono}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">Paso {paso} — {config.titulo}</p>
        <p className="text-[10px] text-gray-400 capitalize">{config.rol}</p>
      </div>
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0
        ${completado ? 'bg-emerald-100 text-emerald-700' :
          activo     ? 'bg-[#D4621A]/10 text-[#D4621A]' :
          'bg-gray-100 text-gray-400'}`}
      >
        {completado ? 'Listo' : activo ? 'En curso' : 'Pendiente'}
      </span>
      {colapsado ? <ChevronDown size={13} className="text-gray-400 shrink-0" /> : <ChevronUp size={13} className="text-gray-400 shrink-0" />}
    </button>
  )
}

function Resumen({ filas }: { filas: { l: string; v: string }[] }) {
  return (
    <div className="space-y-2">
      {filas.map(f => (
        <div key={f.l} className="flex justify-between text-sm border-b border-gray-50 pb-1.5 last:border-0">
          <span className="text-gray-400 text-xs">{f.l}</span>
          <span className="font-medium text-gray-800 text-right max-w-[65%] text-xs">{f.v}</span>
        </div>
      ))}
    </div>
  )
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

interface Props { tramiteId: string }

export default function TransferenciaWorkflow({ tramiteId }: Props) {
  const { user }   = useAuthStore()
  const { puede }  = usePermisos()
  const { gestores: gestoresEquipo } = useGestoresEquipo()
  const geo = useGeolocalizacion()

  // [IMPORTANTE] El hook SE DECLARA ANTES de usar `workflow` en cualquier lado.
  const {
    workflow, loading, guardando, error, progreso, pasoActual,
    confirmarPaso1, confirmarPaso2, confirmarPaso3,
    agregarSeguimiento, confirmarReciboListo,
    confirmarPaso5, confirmarPaso6, confirmarPaso7,
    asignarGestor,
  } = useTransferenciaWorkflow(tramiteId)

  // ── Roles que pueden auto-gestionar los pasos de registro (3 y 6) ────────
  // Si hay un gestor asignado, solo ESE gestor (o quien tenga rol de gestión)
  // puede completar pasos 3/6 — si nadie fue asignado, cualquiera de estos
  // roles puede auto-gestionarlo sin necesidad de asignar a otro.
  const ROLES_PUEDEN_REGISTRO = ['gestor', 'admin', 'admin_gral', 'asesor_comercial', 'propietario']
  const puedeGestionarRegistro = ROLES_PUEDEN_REGISTRO.includes(user?.rol ?? '')
  const esGestor = workflow?.gestorId
    ? (user?.uid === workflow.gestorId || puedeGestionarRegistro)
    : puedeGestionarRegistro
  const esAsesor = ['propietario', 'admin', 'admin_gral', 'asesor_comercial', 'vendedor', 'operador'].includes(user?.rol ?? '')

  const [col, setCol] = useState<Record<number, boolean>>({})
  const toggle = (n: number) => setCol(p => ({ ...p, [n]: !p[n] }))

  // ── Paso 1 state ──────────────────────────────────────────────────────────
  const [p1, setP1] = useState({
    clienteId: '', vehiculoId: '', futuraRadicacion: false,
    jurisdiccionDestino: '', observacion: '',
  })

  // ── Paso 2 archivos ───────────────────────────────────────────────────────
  const [files2, setFiles2] = useState<Record<string, File | undefined>>({})
  const [prev2,  setPrev2]  = useState<Record<string, string | null>>({})
  const setF2 = (campo: string) => (file?: File) => {
    setFiles2(p => ({ ...p, [campo]: file }))
    setPrev2(p => ({ ...p, [campo]: file ? URL.createObjectURL(file) : null }))
  }
  const [obs2, setObs2] = useState('')
  const [gestorSel, setGestorSel] = useState<{ uid: string; nombre: string } | null>(null)

  // [INFORMATIVO] Ya NO se usa para bloquear el botón — solo para mostrar
  // en el resumen visual qué falta, sin impedir avanzar.
  const docs2Completos = () => {
    const reqs = ['formulario08Frente','formulario08Dorso','tituloFrente','tituloDorso',
      'cedulaFrente','cedulaDorso','verificacionPolicialFrente','verificacionPolicialDorso',
      'dniCompradorFrente','dniCompradorDorso']
    return reqs.every(k => !!files2[k])
  }

  // ── Paso 3 archivos ───────────────────────────────────────────────────────
  const [files3, setFiles3] = useState<Record<string, File | undefined>>({})
  const [prev3,  setPrev3]  = useState<Record<string, string | null>>({})
  const setF3 = (campo: string) => (file?: File) => {
    setFiles3(p => ({ ...p, [campo]: file }))
    setPrev3(p => ({ ...p, [campo]: file ? URL.createObjectURL(file) : null }))
  }
  const [monto3, setMonto3]   = useState(0)
  const [notaMonto, setNota]  = useState('')
  const [obs3, setObs3]       = useState('')

  // ── Paso 4 ────────────────────────────────────────────────────────────────
  const [obs4, setObs4]        = useState('')
  const [reciboListo, setRL]   = useState(false)

  // ── Paso 5 ────────────────────────────────────────────────────────────────
  const [p5, setP5] = useState({
    reciboListo: true, fechaTurnoRetiro: '', horaTurnoRetiro: '',
    registroNombre: '', registroDireccion: '', observacion: '',
  })

  // ── Paso 6 ────────────────────────────────────────────────────────────────
  const [file6, setFile6]    = useState<File | undefined>()
  const [prev6, setPrev6]    = useState<string | null>(null)
  const [obs6, setObs6]      = useState('')

  // ── Paso 7 ────────────────────────────────────────────────────────────────
  const [p7, setP7] = useState({
    entregadoAlCliente: false,
    canalEntrega: 'whatsapp' as 'presencial' | 'whatsapp' | 'email' | 'otro',
    observacionFinal: '',
  })
  const [file7, setFile7] = useState<File | undefined>()

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-2 border-[#D4621A] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const futuraRad = workflow?.paso1?.futuraRadicacion ?? p1.futuraRadicacion
  const configPlazos = getConfigPlazos(futuraRad)

  return (
    <div className="space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-[#1A1A1A] rounded-2xl">
        <div>
          <p className="text-white font-bold text-sm">Transferencia de Dominio</p>
          <p className="text-gray-400 text-xs mt-0.5">
            Paso {Math.min(pasoActual, 7)} de 7
            {workflow?.estadoWorkflow && (
              <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${ESTADO_TRF_COLORS[workflow.estadoWorkflow]}`}>
                {ESTADO_TRF_LABELS[workflow.estadoWorkflow]}
              </span>
            )}
          </p>
        </div>
        {/* Geo banner */}
        {(pasoActual === 3 || pasoActual === 6) && geo.estadoPermiso !== 'granted' && (
          <AlertaGeoPermiso estadoPermiso={geo.estadoPermiso} onSolicitar={geo.solicitarPermiso} />
        )}
      </div>

      {/* Asignar gestor (o auto-gestionar) */}
      {pasoActual >= 2 && !workflow?.gestorId && esAsesor && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-2">
          <p className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1">
            <User size={12} /> Asignar Gestor/Mandatario
          </p>
          <select onChange={e => {
            const g = gestoresEquipo.find((g: any) => g.uid === e.target.value)
            if (g) asignarGestor(g.uid, `${g.nombre} ${g.apellido}`.trim())
          }} defaultValue=""
            className="w-full px-3 py-2 border border-blue-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
          >
            <option value="">— Seleccioná el gestor —</option>
            {gestoresEquipo.filter((g: any) => g.rol === 'gestor').map(g => (
              <option key={g.uid} value={g.uid}>{g.nombre} {g.apellido}</option>
            ))}
          </select>
          {/* Auto-gestión — para admin/admin_gral/asesor_comercial/propietario que
              prefieren hacer ellos mismos la presentación en el registro */}
          {user && puedeGestionarRegistro && (
            <button
              onClick={() => asignarGestor(user.uid, `${user.nombre} ${user.apellido}`.trim())}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              o gestionarlo yo mismo →
            </button>
          )}
        </div>
      )}
      {workflow?.gestorNombre && (
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
          <User size={11} /> Gestor asignado: <strong>{workflow.gestorNombre}</strong>
        </div>
      )}

      {/* ── PASO 1 ── */}
      <PasoHeader paso={1} pasoActual={pasoActual} colapsado={!!col[1]} onToggle={() => toggle(1)} />
      {!col[1] && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
          {pasoActual === 1 ? (
            <>
              {/* Futura radicación — checkbox opcional, nunca bloquea */}
              <label className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-xl cursor-pointer hover:border-[#D4621A]/40 transition-all">
                <input type="checkbox" checked={p1.futuraRadicacion}
                  onChange={e => setP1(p => ({ ...p, futuraRadicacion: e.target.checked }))}
                  className="w-4 h-4 accent-[#D4621A]"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-800">¿Hay futura radicación?</p>
                  <p className="text-xs text-gray-400">
                    {p1.futuraRadicacion
                      ? 'Podés indicar el partido/provincia destino abajo · Plazo estimado hasta 45 días hábiles'
                      : 'Sin cambio de jurisdicción · Plazo estimado 3-21 días hábiles'}
                  </p>
                </div>
              </label>

              {p1.futuraRadicacion && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">
                    Jurisdicción destino (partido / provincia) — opcional
                  </label>
                  <input value={p1.jurisdiccionDestino}
                    onChange={e => setP1(p => ({ ...p, jurisdiccionDestino: e.target.value }))}
                    placeholder="Ej: La Plata, Buenos Aires"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
                  />
                </div>
              )}

              {/* Plazos — informativo, generan alertas internas, no bloquean nada */}
              <div className={`p-3 rounded-xl border text-xs ${p1.futuraRadicacion ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                <strong>Plazo estimado:</strong> {configPlazos.label} · El sistema va a generar
                recordatorios internos automáticos cada {configPlazos.frecuenciaAlertaDias} días
                para hacer seguimiento — esto es solo informativo, no traba el trámite.
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Observaciones (opcional)</label>
                <textarea value={p1.observacion} onChange={e => setP1(p => ({ ...p, observacion: e.target.value }))}
                  rows={2} placeholder="Notas del caso..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none resize-none"
                />
              </div>

              <button
                onClick={() => confirmarPaso1({
                  clienteId:           p1.clienteId   || (workflow?.paso1?.clienteId ?? ''),
                  vehiculoId:          p1.vehiculoId  || (workflow?.paso1?.vehiculoId ?? ''),
                  futuraRadicacion:    p1.futuraRadicacion,
                  jurisdiccionDestino: p1.futuraRadicacion ? p1.jurisdiccionDestino : undefined,
                  observacion:         p1.observacion || undefined,
                })}
                disabled={guardando}
                className="w-full py-3 bg-[#D4621A] hover:bg-[#b8541a] text-white font-semibold rounded-xl text-sm disabled:opacity-50"
              >
                {guardando ? 'Guardando...' : 'Confirmar datos → Paso 2'}
              </button>
            </>
          ) : (
            <Resumen filas={[
              { l: 'Futura radicación', v: workflow?.paso1?.futuraRadicacion ? `Sí — ${workflow.paso1.jurisdiccionDestino ?? 'sin especificar'}` : 'No' },
              { l: 'Plazo estimado', v: configPlazos.label },
              { l: 'Obs.', v: workflow?.paso1?.observacion ?? '—' },
            ]} />
          )}
        </div>
      )}

      {/* ── PASO 2 — Documentación ── */}
      {pasoActual >= 2 && <PasoHeader paso={2} pasoActual={pasoActual} colapsado={!!col[2]} onToggle={() => toggle(2)} />}
      {pasoActual >= 2 && !col[2] && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-5">
          {pasoActual === 2 ? (
            <>
              {/* Informativo, ya no es una traba */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
                <FileText size={13} className="text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700">
                  Subí lo que tengas disponible — <strong>nada de esto bloquea el avance</strong>.
                  Si falta algún documento, dejá la observación abajo explicando por qué,
                  para tener registro y poder completarlo después.
                </p>
              </div>

              <DocParUploader label="Formulario 08 / 08 Digital"
                onFrente={setF2('formulario08Frente')} onDorso={setF2('formulario08Dorso')}
                prevFrente={prev2['formulario08Frente']} prevDorso={prev2['formulario08Dorso']} />

              <DocParUploader label="Título del vehículo"
                onFrente={setF2('tituloFrente')} onDorso={setF2('tituloDorso')}
                prevFrente={prev2['tituloFrente']} prevDorso={prev2['tituloDorso']} />

              <DocParUploader label="Cédula verde"
                onFrente={setF2('cedulaFrente')} onDorso={setF2('cedulaDorso')}
                prevFrente={prev2['cedulaFrente']} prevDorso={prev2['cedulaDorso']} />

              <DocParUploader label="Verificación policial"
                onFrente={setF2('verificacionPolicialFrente')} onDorso={setF2('verificacionPolicialDorso')}
                prevFrente={prev2['verificacionPolicialFrente']} prevDorso={prev2['verificacionPolicialDorso']} />

              <DocParUploader label="DNI del comprador"
                onFrente={setF2('dniCompradorFrente')} onDorso={setF2('dniCompradorDorso')}
                prevFrente={prev2['dniCompradorFrente']} prevDorso={prev2['dniCompradorDorso']} />

              {/* Formulario 04 — SIEMPRE visible, ya no depende de futuraRad */}
              <DocParUploader label="Formulario 04 (radicación)"
                onFrente={setF2('formulario04Frente')} onDorso={setF2('formulario04Dorso')}
                prevFrente={prev2['formulario04Frente']} prevDorso={prev2['formulario04Dorso']} />

              {/* Asignar gestor al confirmar docs */}
              {!workflow?.gestorId && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Asignar gestor para la gestión en registro (opcional)</label>
                  <select onChange={e => {
                    const g = gestoresEquipo.find((g: any) => g.uid === e.target.value)
                    setGestorSel(g ? { uid: g.uid, nombre: `${g.nombre} ${g.apellido}`.trim() } : null)
                  }} defaultValue=""
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
                  >
                    <option value="">— Asignar gestor (opcional) —</option>
                    {gestoresEquipo.filter((g: any) => g.rol === 'gestor').map(g => (
                      <option key={g.uid} value={g.uid}>{g.nombre} {g.apellido}</option>
                    ))}
                  </select>
                </div>
              )}

              <textarea value={obs2} onChange={e => setObs2(e.target.value)}
                rows={2} placeholder="Observaciones — ej: 'falta DNI comprador, cliente lo trae la semana próxima'..."
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none resize-none"
              />

              {!docs2Completos() && (
                <p className="text-xs text-gray-400">
                  ℹ️ Todavía faltan algunos documentos — podés avanzar igual y completarlos después.
                </p>
              )}

              {progreso > 0 && progreso < 100 && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Subiendo documentación...</span><span>{progreso}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full">
                    <div className="h-full bg-[#D4621A] rounded-full transition-all" style={{ width: `${progreso}%` }} />
                  </div>
                </div>
              )}

              <button
                disabled={guardando}
                onClick={() => confirmarPaso2(obs2, files2 as any, gestorSel?.uid, gestorSel?.nombre)}
                className="w-full py-3 bg-[#D4621A] hover:bg-[#b8541a] text-white font-semibold rounded-xl text-sm disabled:opacity-50"
              >
                {guardando ? `Subiendo... ${progreso}%` : 'Confirmar documentación → Paso 3'}
              </button>
            </>
          ) : (
            <Resumen filas={[
              { l: 'F08',          v: workflow?.paso2?.formulario08?.frente ? '✅' : '—' },
              { l: 'Título',       v: workflow?.paso2?.titulo?.frente       ? '✅' : '—' },
              { l: 'Cédula',       v: workflow?.paso2?.cedula?.frente       ? '✅' : '—' },
              { l: 'Ver. Policial',v: workflow?.paso2?.verificacionPolicial?.frente ? '✅' : '—' },
              { l: 'DNI comprador',v: workflow?.paso2?.dniComprador?.frente ? '✅' : '—' },
              { l: 'F04',          v: workflow?.paso2?.formulario04?.frente ? '✅' : '—' },
              { l: 'Obs.',         v: workflow?.paso2?.observacion ?? '—' },
            ]} />
          )}
        </div>
      )}

      {/* ── PASO 3 — Presentación al registro ── */}
      {pasoActual >= 3 && <PasoHeader paso={3} pasoActual={pasoActual} colapsado={!!col[3]} onToggle={() => toggle(3)} />}
      {pasoActual >= 3 && !col[3] && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-5">
          {pasoActual === 3 && esGestor ? (
            <>
              <p className="text-xs text-gray-500">
                El registro suele emitir 3 recibos. Recomendado cargarlos, pero si no los
                tenés a mano todavía, podés avanzar igual y dejarlo aclarado abajo.
              </p>

              <div className="space-y-1">
                <p className="text-xs font-bold text-gray-700 flex items-center gap-1">
                  <FileText size={11} className="text-[#D4621A]" />
                  Recibo de Transferencia
                  <span className="text-[10px] text-gray-400 ml-1">recomendado</span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <FotoUploader label="Frente" onChange={setF3('reciboTrfFrente')} preview={prev3['reciboTrfFrente']} />
                  <FotoUploader label="Dorso (opcional)" onChange={setF3('reciboTrfDorso')} preview={prev3['reciboTrfDorso']} />
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                  <FileText size={11} />
                  Recibo de ARBA
                  <span className="text-[10px] text-gray-400 ml-1">recomendado</span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <FotoUploader label="Frente" onChange={setF3('reciboArbaFrente')} preview={prev3['reciboArbaFrente']} />
                  <FotoUploader label="Dorso (opcional)" onChange={setF3('reciboArbaDorso')} preview={prev3['reciboArbaDorso']} />
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                  <FileText size={11} />
                  Recibo de SUATS
                  <span className="text-[10px] text-gray-400 ml-1">recomendado</span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <FotoUploader label="Frente" onChange={setF3('reciboSuatsFrente')} preview={prev3['reciboSuatsFrente']} />
                  <FotoUploader label="Dorso (opcional)" onChange={setF3('reciboSuatsDorso')} preview={prev3['reciboSuatsDorso']} />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">
                  Monto a abonar al registro ($)
                </label>
                <input type="number" value={monto3 || ''}
                  onChange={e => setMonto3(Number(e.target.value))}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
                />
                <input value={notaMonto} onChange={e => setNota(e.target.value)}
                  placeholder="Nota sobre el monto (desglose, ej: ARBA $X + sellos $Y)"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A] mt-2"
                />
              </div>

              {/* Geo presencia */}
              {geo.estadoPermiso === 'granted' ? (
                <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                  <MapPin size={12} /> Se registrará tu ubicación al confirmar la presentación.
                </div>
              ) : (
                <AlertaGeoPermiso estadoPermiso={geo.estadoPermiso} onSolicitar={geo.solicitarPermiso} />
              )}

              <textarea value={obs3} onChange={e => setObs3(e.target.value)} rows={2}
                placeholder="Observaciones — ej: 'recibo SUATS no disponible, el registro lo entrega después'..."
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none resize-none"
              />

              {(!files3['reciboTrfFrente'] || !files3['reciboArbaFrente'] || !files3['reciboSuatsFrente']) && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  <span>Recomendado subir los 3 recibos. Si falta alguno, dejalo aclarado en observaciones — no impide avanzar.</span>
                </div>
              )}

              <button
                disabled={guardando}
                onClick={async () => {
                  let geoData = geo.ubicacion ?? undefined
                  if (geo.estadoPermiso === 'granted' && !geoData) geoData = await geo.capturar() ?? undefined
                  confirmarPaso3({ montoRegistro: monto3, notaMontoRegistro: notaMonto, observacion: obs3, reciboTransferencia: null as any, reciboArba: null as any, reciboSuats: null as any } as any,
                    files3 as any, geoData)
                }}
                className="w-full py-3 bg-[#D4621A] text-white font-semibold rounded-xl text-sm disabled:opacity-50"
              >
                {guardando ? `Guardando... ${progreso}%` : '📍 Confirmar presentación en registro → Paso 4'}
              </button>
            </>
          ) : pasoActual > 3 ? (
            <Resumen filas={[
              { l: 'Monto abonado', v: `$${workflow?.paso3?.montoRegistro?.toLocaleString('es-AR') ?? 0}` },
              { l: 'Geo', v: workflow?.paso3?.geoPresencia ? `${workflow.paso3.geoPresencia.lat.toFixed(4)}, ${workflow.paso3.geoPresencia.lng.toFixed(4)}` : '—' },
            ]} />
          ) : (
            <p className="text-xs text-gray-400 py-4 text-center">
              Solo el gestor asignado (o un Admin/Asesor sin gestor asignado todavía) puede completar este paso.
            </p>
          )}
        </div>
      )}

      {/* ── PASO 4 — Seguimiento de plazos ── */}
      {pasoActual >= 4 && <PasoHeader paso={4} pasoActual={pasoActual} colapsado={!!col[4]} onToggle={() => toggle(4)} />}
      {pasoActual >= 4 && !col[4] && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
          {pasoActual === 4 && (
            <>
              <div className={`p-3 rounded-xl border text-xs ${futuraRad ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                <div className="flex items-center gap-1 font-semibold mb-1">
                  <Clock size={11} /> Seguimiento activo
                </div>
                {configPlazos.label} · El sistema genera un recordatorio interno cada {configPlazos.frecuenciaAlertaDias} días — es solo informativo.
                {workflow?.recordatorioSeguimiento && (
                  <div className="mt-1">
                    Próximo recordatorio: <strong>{workflow.recordatorioSeguimiento.toDate().toLocaleDateString('es-AR')}</strong>
                  </div>
                )}
              </div>

              {(workflow?.paso4?.seguimientos ?? []).length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {(workflow?.paso4?.seguimientos ?? []).map((s, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-3 text-xs">
                      <div className="flex justify-between text-gray-400 mb-1">
                        <span>{s.registradoPorNombre}</span>
                        <span>{s.fecha?.toDate?.()?.toLocaleDateString('es-AR') ?? '—'}</span>
                      </div>
                      <p className="text-gray-700">{s.observacion}</p>
                    </div>
                  ))}
                </div>
              )}

              {!reciboListo && (
                <div className="space-y-2">
                  <textarea value={obs4} onChange={e => setObs4(e.target.value)} rows={2}
                    placeholder="El registro aún no tiene el recibo listo. Aclará el estado actual..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none resize-none"
                  />
                  <button onClick={() => { agregarSeguimiento(obs4); setObs4('') }}
                    disabled={!obs4.trim() || guardando}
                    className="w-full py-2.5 border-2 border-[#D4621A] text-[#D4621A] font-semibold rounded-xl text-sm hover:bg-[#D4621A]/5 disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <RefreshCw size={13} /> Registrar seguimiento
                  </button>
                </div>
              )}

              <label className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-xl cursor-pointer hover:border-emerald-400 transition-all">
                <input type="checkbox" checked={reciboListo}
                  onChange={e => setRL(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-800">✅ El registro informó que el recibo está listo</p>
                  <p className="text-xs text-gray-400">Avanzar para agendar el turno de retiro</p>
                </div>
              </label>

              {reciboListo && (
                <button onClick={() => confirmarReciboListo({} as any)}
                  disabled={guardando}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : '📅 Recibo listo — Agendar turno de retiro →'}
                </button>
              )}
            </>
          )}
          {pasoActual > 4 && (
            <Resumen filas={[
              { l: 'Seguimientos', v: `${workflow?.paso4?.seguimientos?.length ?? 0} entradas` },
              { l: 'Recibo listo', v: '✅ Confirmado' },
            ]} />
          )}
        </div>
      )}

      {/* ── PASO 5 — Turno de retiro ── */}
      {pasoActual >= 5 && <PasoHeader paso={5} pasoActual={pasoActual} colapsado={!!col[5]} onToggle={() => toggle(5)} />}
      {pasoActual >= 5 && !col[5] && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
          {pasoActual === 5 ? (
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2">
                <Bell size={13} className="text-emerald-600 mt-0.5 shrink-0" />
                <p className="text-xs text-emerald-700">
                  El sistema enviará una alerta interna 24hs antes y el día del turno para no perder la presentación.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Fecha del turno *</label>
                  <input type="date" value={p5.fechaTurnoRetiro}
                    onChange={e => setP5(p => ({ ...p, fechaTurnoRetiro: e.target.value }))}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Hora (opcional)</label>
                  <input type="time" value={p5.horaTurnoRetiro}
                    onChange={e => setP5(p => ({ ...p, horaTurnoRetiro: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Nombre del registro *</label>
                <input value={p5.registroNombre}
                  onChange={e => setP5(p => ({ ...p, registroNombre: e.target.value }))}
                  placeholder="Ej: Registro Seccional San Martín N°3"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Dirección (opcional)</label>
                <input value={p5.registroDireccion}
                  onChange={e => setP5(p => ({ ...p, registroDireccion: e.target.value }))}
                  placeholder="Ej: Av. San Martín 2450, San Martín"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
                />
              </div>

              <textarea value={p5.observacion} onChange={e => setP5(p => ({ ...p, observacion: e.target.value }))}
                rows={2} placeholder="Observaciones del turno..."
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none resize-none"
              />

              <button
                disabled={!p5.fechaTurnoRetiro || !p5.registroNombre || guardando}
                onClick={() => confirmarPaso5({ ...p5, reciboListo: true } as any)}
                className="w-full py-3 bg-[#D4621A] text-white font-semibold rounded-xl text-sm disabled:opacity-50"
              >
                {guardando ? 'Guardando...' : '📅 Confirmar turno → Paso 6'}
              </button>
            </>
          ) : (
            <Resumen filas={[
              { l: 'Fecha turno',  v: workflow?.paso5?.fechaTurnoRetiro ?? '—' },
              { l: 'Hora',         v: workflow?.paso5?.horaTurnoRetiro  ?? '—' },
              { l: 'Registro',     v: workflow?.paso5?.registroNombre   ?? '—' },
              { l: 'Dirección',    v: workflow?.paso5?.registroDireccion ?? '—' },
            ]} />
          )}
        </div>
      )}

      {/* ── PASO 6 — Confirmación de retiro ── */}
      {pasoActual >= 6 && <PasoHeader paso={6} pasoActual={pasoActual} colapsado={!!col[6]} onToggle={() => toggle(6)} />}
      {pasoActual >= 6 && !col[6] && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
          {pasoActual === 6 && esGestor ? (
            <>
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-start gap-2">
                <MapPin size={13} className="text-purple-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-purple-700 font-semibold mb-0.5">
                    Presencia en el registro
                  </p>
                  <p className="text-xs text-purple-600">
                    Recomendado confirmar tu ubicación GPS y sacar foto del recibo físico retirado.
                  </p>
                </div>
              </div>

              {geo.estadoPermiso !== 'granted' && (
                <AlertaGeoPermiso estadoPermiso={geo.estadoPermiso} onSolicitar={geo.solicitarPermiso} />
              )}

              {geo.ubicacion && (
                <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                  <CheckCircle2 size={12} /> Ubicación capturada: {geo.ubicacion.direccionAprox ?? `${geo.ubicacion.lat.toFixed(4)}, ${geo.ubicacion.lng.toFixed(4)}`}
                </div>
              )}

              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                  <Camera size={11} className="text-[#D4621A]" />
                  Foto del recibo físico retirado
                  <span className="text-[10px] text-gray-400 ml-1">recomendado</span>
                </p>
                <p className="text-[10px] text-gray-400 mb-1">
                  Sacá una foto del recibo que acabás de retirar como constancia.
                </p>
                <FotoUploader label="Foto recibo"
                  onChange={f => { setFile6(f); setPrev6(f ? URL.createObjectURL(f) : null) }}
                  preview={prev6}
                />
              </div>

              <textarea value={obs6} onChange={e => setObs6(e.target.value)} rows={2}
                placeholder="Observaciones — ej: 'no se pudo sacar foto, recibo en papel deteriorado'..."
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none resize-none"
              />

              {!file6 && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  <span>Recomendado adjuntar la foto del recibo físico. Si no es posible, dejalo aclarado arriba — no impide confirmar el retiro.</span>
                </div>
              )}

              <button
                disabled={guardando}
                onClick={async () => {
                  let geoData = geo.ubicacion ?? undefined
                  if (geo.estadoPermiso === 'granted' && !geoData) geoData = await geo.capturar() ?? undefined
                  confirmarPaso6({ presentadoEnRegistro: true, observacion: obs6 } as any, geoData, file6)
                }}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl text-sm disabled:opacity-50"
              >
                {guardando ? 'Guardando...' : '📍 Confirmar retiro del recibo → Paso 7'}
              </button>
            </>
          ) : pasoActual > 6 ? (
            <Resumen filas={[
              { l: 'Presentado', v: workflow?.paso6?.presentadoEnRegistro ? '✅ Sí' : '—' },
              { l: 'Geo', v: workflow?.paso6?.geoRetiro?.direccionAprox ?? `${workflow?.paso6?.geoRetiro?.lat?.toFixed(4) ?? '—'}` },
            ]} />
          ) : (
            <p className="text-xs text-gray-400 py-4 text-center">
              Solo el gestor asignado (o un Admin/Asesor sin gestor asignado) puede completar este paso.
            </p>
          )}
        </div>
      )}

      {/* ── PASO 7 — Entrega y cierre ── */}
      {pasoActual >= 7 && <PasoHeader paso={7} pasoActual={pasoActual} colapsado={!!col[7]} onToggle={() => toggle(7)} />}
      {pasoActual >= 7 && !col[7] && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
          {pasoActual === 7 ? (
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-700 font-semibold">
                🎉 El recibo fue retirado. Entregalo al cliente y cerrá la gestión.
              </div>
              <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer">
                <input type="checkbox" checked={p7.entregadoAlCliente}
                  onChange={e => setP7(p => ({ ...p, entregadoAlCliente: e.target.checked }))}
                  className="accent-[#D4621A] w-4 h-4"
                />
                <span className="text-sm font-medium text-gray-800">Recibo entregado al cliente</span>
              </label>

              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Canal de entrega</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['whatsapp','presencial','email','otro'] as const).map(c => (
                    <button key={c} type="button"
                      onClick={() => setP7(p => ({ ...p, canalEntrega: c }))}
                      className={`py-2 rounded-xl text-xs font-semibold border transition-all capitalize
                        ${p7.canalEntrega === c ? 'bg-[#D4621A] border-[#D4621A] text-white' : 'border-gray-200 text-gray-600'}`}
                    >{c}</button>
                  ))}
                </div>
              </div>

              <FotoUploader label="Foto constancia de entrega (opcional)"
                onChange={f => setFile7(f)} />

              <textarea value={p7.observacionFinal}
                onChange={e => setP7(p => ({ ...p, observacionFinal: e.target.value }))} rows={2}
                placeholder="Observaciones finales..."
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none resize-none"
              />

              <button
                disabled={!p7.entregadoAlCliente || guardando}
                onClick={() => confirmarPaso7(p7 as any, file7)}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm disabled:opacity-50"
              >
                {guardando ? 'Archivando...' : '🗂️ Finalizar y archivar transferencia'}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3 py-4">
              <CheckCircle2 size={28} className="text-emerald-500 shrink-0" />
              <div>
                <p className="font-semibold text-gray-800">Transferencia completada y archivada</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Canal: {workflow?.paso7?.canalEntrega} · Por: {workflow?.paso7?.completadoPorNombre}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">{error}</div>
      )}
    </div>
  )
}