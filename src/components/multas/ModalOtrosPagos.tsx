// src/components/multas/ModalOtrosPagos.tsx
// ─── OTROS PAGOS — cobro rápido sobre una multa existente ─────────────────────
// Se abre desde Revisión de Multas y Consultas. Busca la multa por patente, DNI
// o nombre, y registra el cobro DENTRO de esa multa (paso2.historialPagos),
// reutilizando agregarPagoMulta() → total + recibo + propagación al trámite.
// Trazabilidad: guarda quién realizó el pago (pagadoPor) y quién lo cargó
// (registradoPor/Nombre). Anti-duplicado: avisa si ya hay un cobro del mismo
// monto el mismo día en esa multa.
import { useState, useMemo } from 'react'
import toast from 'react-hot-toast'
import { Timestamp } from 'firebase/firestore'
import { Search, CheckCircle2, AlertTriangle, ChevronLeft } from 'lucide-react'
import Modal from '@/components/shared/Modal'
import { useMultaWorkflows } from '@/hooks/useMultaWorkflow'
import { useAuthStore } from '@/store/authStore'
import { agregarPagoMulta } from '@/lib/firestore/MultaWorwflow'
import {
  METODOS_PAGO_LABELS, estadoMultaEfectivo,
  ESTADO_MULTA_OP_LABELS, ESTADO_MULTA_OP_COLORS,
} from '@/types/multa_types'
import type { MetodoPago, RegistroPago, MultaWorkflow } from '@/types/multa_types'

const NARANJA = '#D4621A'
const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n || 0)
const normaliza = (s: string | undefined | null) =>
  (s ?? '').toLowerCase().replace(/\s+/g, '').trim()

interface Props {
  open:    boolean
  onClose: () => void
}

export default function ModalOtrosPagos({ open, onClose }: Props) {
  const { multas } = useMultaWorkflows()
  const { user }   = useAuthStore()

  const [q,         setQ]         = useState('')
  const [sel,       setSel]       = useState<MultaWorkflow | null>(null)
  const [monto,     setMonto]     = useState(0)
  const [metodo,    setMetodo]    = useState<MetodoPago>('efectivo')
  const [pagadoPor, setPagadoPor] = useState('')
  const [nota,      setNota]      = useState('')
  const [guardando, setGuardando] = useState(false)

  // Búsqueda por patente, DNI o nombre (mismo criterio que la tabla de Revisión).
  const resultados = useMemo(() => {
    const term = normaliza(q)
    if (term.length < 2) return []
    return multas
      .filter(w => [w.paso1?.patente, w.paso1?.dni, w.paso1?.nombreCompleto]
        .some(v => normaliza(v).includes(term)))
      .slice(0, 12)
  }, [q, multas])

  // Anti-duplicado: mismo monto + mismo día en el historial de la multa elegida.
  const posibleDuplicado = useMemo(() => {
    if (!sel || !monto) return false
    const hoy = new Date().toDateString()
    return (sel.paso2?.historialPagos ?? []).some(pg => {
      const d = pg.registradoEn?.toDate?.() ?? null
      return pg.monto === monto && d != null && d.toDateString() === hoy
    })
  }, [sel, monto])

  const reset = () => {
    setSel(null); setMonto(0); setMetodo('efectivo'); setPagadoPor(''); setNota(''); setQ('')
  }
  const cerrar = () => { reset(); onClose() }

  const elegir = (w: MultaWorkflow) => {
    setSel(w)
    setPagadoPor(w.paso1?.nombreCompleto ?? '')
  }

  const confirmar = async () => {
    if (!user || !sel) return
    if (!monto || monto <= 0) { toast.error('Ingresá un monto válido'); return }
    setGuardando(true)
    try {
      const pago: RegistroPago = {
        monto,
        metodoPago:          metodo,
        nota:                nota.trim() || undefined,
        pagadoPor:           pagadoPor.trim() || undefined,
        origen:              'otros_pagos',
        registradoPor:       user.uid,
        registradoPorNombre: `${user.nombre ?? ''} ${user.apellido ?? ''}`.trim(),
        registradoEn:        Timestamp.now(),
      }
      await agregarPagoMulta(sel.id, pago, sel.paso2?.historialPagos ?? [])
      toast.success(`Cobro de ${fmt(monto)} registrado en ${sel.paso1?.patente ?? 'la multa'}`)
      cerrar()
    } catch (e) {
      console.error('[OtrosPagos]', e)
      toast.error('No se pudo registrar el cobro')
    } finally {
      setGuardando(false)
    }
  }

  const cargador = `${user?.nombre ?? ''} ${user?.apellido ?? ''}`.trim() || 'vos'

  return (
    <Modal open={open} onClose={cerrar} title="Otros Pagos" subtitle="Cobro rápido sobre una multa existente" size="lg">
      {!sel ? (
        // ── PASO 1: buscar y elegir la multa ──────────────────────────────
        <div className="space-y-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar por patente, DNI o nombre…"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
            />
          </div>

          {q.trim().length < 2 && (
            <p className="text-xs text-gray-400 text-center py-6">Escribí al menos 2 caracteres para buscar.</p>
          )}
          {q.trim().length >= 2 && resultados.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">Sin multas que coincidan.</p>
          )}

          <div className="space-y-2 max-h-72 overflow-y-auto">
            {resultados.map(w => {
              const est = estadoMultaEfectivo(w)
              return (
                <button
                  key={w.id}
                  onClick={() => elegir(w)}
                  className="w-full flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-xl hover:border-[#D4621A] text-left transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">
                      {w.paso1?.patente ?? '—'} · {w.paso1?.nombreCompleto ?? 'Sin nombre'}
                    </p>
                    <p className="text-xs text-gray-400">
                      DNI {w.paso1?.dni ?? '—'} · Cobrado {fmt(w.paso2?.montoTotal ?? 0)}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg ${ESTADO_MULTA_OP_COLORS[est]}`}>
                    {ESTADO_MULTA_OP_LABELS[est]}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        // ── PASO 2: registrar el cobro ────────────────────────────────────
        <div className="space-y-4">
          <button onClick={() => setSel(null)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
            <ChevronLeft size={14} /> Cambiar multa
          </button>

          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-sm font-bold text-gray-800">{sel.paso1?.patente} · {sel.paso1?.nombreCompleto}</p>
            <p className="text-xs text-gray-400">
              DNI {sel.paso1?.dni ?? '—'} · Total cobrado actual {fmt(sel.paso2?.montoTotal ?? 0)}
            </p>
          </div>

          {/* Monto */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Monto del cobro *</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">$</span>
              <input
                type="number" min={0} step={100}
                value={monto || ''}
                onChange={e => setMonto(Number(e.target.value))}
                placeholder="0"
                className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 outline-none focus:border-[#D4621A]"
              />
            </div>
          </div>

          {/* Método */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Método</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {(Object.keys(METODOS_PAGO_LABELS) as MetodoPago[]).map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMetodo(k)}
                  className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                    metodo === k ? 'border-[#D4621A] bg-orange-50 text-[#D4621A]' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {METODOS_PAGO_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          {/* Quién realizó el pago */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quién realizó el pago</label>
            <input
              value={pagadoPor}
              onChange={e => setPagadoPor(e.target.value)}
              placeholder="Nombre de quién abonó"
              className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
            />
          </div>

          {/* Nota */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Nota (opcional)</label>
            <input
              value={nota}
              onChange={e => setNota(e.target.value)}
              placeholder="Detalle del cobro"
              className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#D4621A]"
            />
          </div>

          {posibleDuplicado && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>Ya hay un cobro de {fmt(monto)} registrado hoy en esta multa. Verificá que no sea un duplicado antes de confirmar.</span>
            </div>
          )}

          <p className="text-[11px] text-gray-400">
            Se registrará a nombre de <b>{cargador}</b> como quien cargó el cobro.
          </p>

          <button
            disabled={guardando || !monto}
            onClick={confirmar}
            className="w-full py-3 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: NARANJA }}
          >
            {guardando ? 'Registrando…' : <><CheckCircle2 size={16} /> Registrar cobro — {fmt(monto || 0)}</>}
          </button>
        </div>
      )}
    </Modal>
  )
}