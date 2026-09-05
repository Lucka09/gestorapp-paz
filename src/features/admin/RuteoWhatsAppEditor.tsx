// src/pages/admin/RuteoWhatsAppEditor.tsx
// ─── EDITOR DE RUTEO DE LÍNEAS WHATSAPP ──────────────────────────────────────
// Permite a CEO / Admin repuntar cada número de WhatsApp (WABA) al secretario
// que lo atiende, SIN tocar Firestore a mano. El webhook (functions/whatsapp/
// Webhook.ts) lee exactamente este objeto: configuracion/gestor.ruteoWhatsApp.
//
// Contrato (idéntico al que ya consume el webhook):
//   configuracion/gestor.ruteoWhatsApp.lineas: Array<{
//     displayPhone:   string   // número visible de la gestoría, ej "5491136141431"
//     phoneNumberId?: string   // ID de Meta del número — lo auto-completa el
//                              // webhook en el primer mensaje; acá es read-only
//     uid:            string   // secretario dueño de la línea
//     nombre:         string   // nombre para mostrar (asignadoNombre / lineaOrigen)
//   }>
//
// Autocontenido a propósito: tipa el shape localmente y escribe el doc directo
// (merge) para no depender de que @/types.Configuracion declare ruteoWhatsApp.

import { useEffect, useMemo, useState } from 'react'
import {
  doc, onSnapshot, setDoc, serverTimestamp,
} from 'firebase/firestore'
import {
  Phone, Plus, Trash2, Save, Link2, AlertTriangle, Check,
  Users, ArrowRight, RefreshCw,
} from 'lucide-react'
import { db }          from '@/lib/firebase'
import { useAuth }     from '@/hooks/useAuth'
import { useEquipo }   from '@/hooks/useEquipo'
import { usePermisos } from '@/hooks/usePermisos'
import { reasignarChatsMasivo } from '@/lib/firestore/conversacionesWA'

// ─── TIPO LOCAL (espejo de Webhook.ts) ───────────────────────────────────────

interface LineaRuteo {
  displayPhone:   string
  phoneNumberId?: string
  uid:            string
  nombre:         string
}

const CONFIG_REF = () => doc(db, 'configuracion', 'gestor')

// Normaliza a solo dígitos (mismo criterio que normalizarTelefono del backend).
const soloDigitos = (s: string) => (s || '').replace(/\D/g, '')

// ─── COMPONENTE ───────────────────────────────────────────────────────────────

export default function RuteoWhatsAppEditor() {
  const { user }              = useAuth()
  const { puede }             = usePermisos()
  const { equipo, activos }   = useEquipo()
  const puedeEditar = puede('editarConfiguracion')

  const [lineas,   setLineas]   = useState<LineaRuteo[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // Reasignación masiva de chats ("pasar todos los chats de X a Y")
  const [deUid, setDeUid]         = useState('')
  const [aUid,  setAUid]          = useState('')
  const [movBusy, setMovBusy]     = useState(false)
  const [movResult, setMovResult] = useState<string | null>(null)

  // Secretarios candidatos a dueños de línea (mismos que las pestañas de Bandeja)
  const agentes = useMemo(
    () => activos.filter(m => m.rol === 'asesor_comercial'),
    [activos],
  )

  const nombreDe = (uid: string) => {
    const m = equipo.find(x => x.uid === uid)
    return m ? `${m.nombre} ${m.apellido ?? ''}`.trim() : 'ese secretario'
  }

  const handleReasignarMasivo = async () => {
    if (!puedeEditar || !deUid || !aUid || deUid === aUid) return
    const aMiembro = activos.find(m => m.uid === aUid)
    const aNombre  = aMiembro ? `${aMiembro.nombre} ${aMiembro.apellido ?? ''}`.trim() : ''
    const ok = window.confirm(
      `¿Pasar TODOS los chats de ${nombreDe(deUid)} a ${aNombre}? ` +
      `Se reasignan las conversaciones de la Bandeja. Esta acción no se puede deshacer en lote.`,
    )
    if (!ok) return

    setMovBusy(true)
    setMovResult(null)
    try {
      const gestoriaId = String((user as any)?.gestoriaId ?? '')
      const n = await reasignarChatsMasivo(gestoriaId, deUid, aUid, aNombre)
      setMovResult(
        n === 0
          ? `${nombreDe(deUid)} no tenía chats asignados.`
          : `Listo: ${n} chat(s) pasaron a ${aNombre}.`,
      )
      setDeUid(''); setAUid('')
    } catch (e: any) {
      setMovResult(`Error: ${e?.message ?? 'no se pudo reasignar'}`)
    } finally {
      setMovBusy(false)
    }
  }

  // ── Cargar líneas del doc de configuración (live) ──────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      CONFIG_REF(),
      snap => {
        const data = snap.data() as { ruteoWhatsApp?: { lineas?: LineaRuteo[] } } | undefined
        setLineas(data?.ruteoWhatsApp?.lineas ?? [])
        setCargando(false)
      },
      err => {
        console.error('[ruteoWA] snapshot error:', err.code, err.message)
        setError('No se pudo leer la configuración de ruteo.')
        setCargando(false)
      },
    )
    return () => unsub()
  }, [])

  // ── Mutadores locales ──────────────────────────────────────────────────────
  const setLinea = (i: number, patch: Partial<LineaRuteo>) => {
    setLineas(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
    setGuardado(false)
  }

  const asignarDueno = (i: number, uid: string) => {
    const m = agentes.find(a => a.uid === uid)
    const nombre = m ? `${m.nombre} ${m.apellido ?? ''}`.trim() : ''
    setLinea(i, { uid, nombre })
  }

  const agregarLinea = () => {
    setLineas(prev => [...prev, { displayPhone: '', uid: '', nombre: '' }])
    setGuardado(false)
  }

  const quitarLinea = (i: number) => {
    setLineas(prev => prev.filter((_, idx) => idx !== i))
    setGuardado(false)
  }

  // ── Guardar (merge) ────────────────────────────────────────────────────────
  const guardar = async () => {
    if (!puedeEditar || !user?.uid) return
    setError(null)

    // Normalizar y validar antes de escribir.
    const limpias = lineas.map(l => ({
      ...l,
      displayPhone: soloDigitos(l.displayPhone),
    }))
    if (limpias.some(l => !l.displayPhone)) {
      setError('Cada línea necesita un número (solo dígitos, con código de país).')
      return
    }
    const dups = limpias.map(l => l.displayPhone)
    if (new Set(dups).size !== dups.length) {
      setError('Hay números repetidos: cada línea debe ser un número distinto.')
      return
    }

    setGuardando(true)
    try {
      await setDoc(
        CONFIG_REF(),
        {
          ruteoWhatsApp:  { lineas: limpias },
          actualizadoEn:  serverTimestamp(),
          actualizadoPor: user.uid,
        },
        { merge: true },
      )
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2500)
    } catch (e: any) {
      console.error('[ruteoWA] error guardando:', e)
      setError(e?.message ?? 'No se pudo guardar el ruteo.')
    } finally {
      setGuardando(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (cargando) {
    return <p className="text-sm text-gray-500">Cargando ruteo de WhatsApp…</p>
  }

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div>
        <div className="flex items-center gap-2">
          <Phone size={18} className="text-[#D4621A]" />
          <h3 className="text-base font-bold text-gray-900">Ruteo de líneas de WhatsApp</h3>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Definí qué secretario atiende cada número. Los mensajes nuevos que
          entren por ese número se asignan automáticamente a esa persona. Si un
          secretario cambia o se va, reasigná la línea acá — sin tocar código.
        </p>
      </div>

      {!puedeEditar && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>Solo lectura: tu rol no puede modificar la configuración.</span>
        </div>
      )}

      {/* Lista de líneas */}
      {lineas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          Todavía no hay líneas configuradas. Agregá una por cada número de WhatsApp.
        </div>
      ) : (
        <div className="space-y-3">
          {lineas.map((l, i) => {
            const vinculada = !!l.phoneNumberId
            const sinDueno  = !l.uid
            return (
              <div
                key={i}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  {/* Número */}
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      Número (con código país)
                    </label>
                    <input
                      value={l.displayPhone}
                      onChange={e => setLinea(i, { displayPhone: e.target.value })}
                      disabled={!puedeEditar}
                      placeholder="5491136141431"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#D4621A] disabled:bg-gray-50"
                    />
                  </div>

                  {/* Dueño */}
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      Secretario asignado
                    </label>
                    <select
                      value={l.uid}
                      onChange={e => asignarDueno(i, e.target.value)}
                      disabled={!puedeEditar}
                      className={[
                        'w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-[#D4621A] disabled:bg-gray-50',
                        sinDueno ? 'border-amber-300 text-amber-700' : 'border-gray-300',
                      ].join(' ')}
                    >
                      <option value="">— Sin asignar (pool) —</option>
                      {agentes.map(a => (
                        <option key={a.uid} value={a.uid}>
                          {a.nombre} {a.apellido ?? ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quitar */}
                  {puedeEditar && (
                    <button
                      onClick={() => quitarLinea(i)}
                      title="Quitar línea"
                      className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                {/* Estado de vínculo con Meta */}
                <div className="mt-2 flex items-center gap-1.5 text-xs">
                  {vinculada ? (
                    <>
                      <Link2 size={13} className="text-emerald-600" />
                      <span className="text-emerald-700">
                        Vinculada a Meta (phone_number_id: {l.phoneNumberId})
                      </span>
                    </>
                  ) : (
                    <>
                      <Link2 size={13} className="text-gray-400" />
                      <span className="text-gray-500">
                        Se vincula automáticamente al recibir el primer mensaje.
                      </span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Acciones */}
      {puedeEditar && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={agregarLinea}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <Plus size={16} /> Agregar línea
          </button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="flex items-center gap-1.5 rounded-lg bg-[#D4621A] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {guardado
              ? <><Check size={16} /> Guardado</>
              : <><Save size={16} /> {guardando ? 'Guardando…' : 'Guardar ruteo'}</>}
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Reasignación masiva de chats ─────────────────────────────────── */}
      {puedeEditar && (
        <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-[#D4621A]" />
            <h4 className="text-sm font-bold text-gray-900">Reasignar chats de un secretario</h4>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Cuando un secretario se va o cambia: pasá todas sus conversaciones de
            la Bandeja a otra persona de una sola vez.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end">
            {/* De */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">De</label>
              <select
                value={deUid}
                onChange={e => { setDeUid(e.target.value); setMovResult(null) }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#D4621A]"
              >
                <option value="">— Elegí un secretario —</option>
                {equipo.map(m => (
                  <option key={m.uid} value={m.uid}>
                    {m.nombre} {m.apellido ?? ''}{m.activo ? '' : ' (inactivo)'}
                  </option>
                ))}
              </select>
            </div>

            <div className="hidden pb-2 text-gray-400 sm:block">
              <ArrowRight size={18} />
            </div>

            {/* A */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">A</label>
              <select
                value={aUid}
                onChange={e => { setAUid(e.target.value); setMovResult(null) }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#D4621A]"
              >
                <option value="">— Elegí un secretario —</option>
                {agentes.map(m => (
                  <option key={m.uid} value={m.uid}>
                    {m.nombre} {m.apellido ?? ''}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleReasignarMasivo}
              disabled={movBusy || !deUid || !aUid || deUid === aUid}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-[#D4621A] px-4 py-2 text-sm font-semibold text-[#D4621A] hover:bg-[#D4621A]/10 disabled:opacity-50"
            >
              {movBusy
                ? <><RefreshCw size={16} className="animate-spin" /> Pasando…</>
                : <>Pasar chats</>}
            </button>
          </div>

          {movResult && (
            <p className="mt-2 text-xs font-semibold text-emerald-700">{movResult}</p>
          )}
        </div>
      )}
    </div>
  )
}