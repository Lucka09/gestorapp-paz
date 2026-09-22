// src/features/cobranzas/ComprobantesTab.tsx
// ─── SOLAPA COMPROBANTES (Cobranzas) ─────────────────────────────────────────
// Dos apartados:
//   · Cobros de clientes → comprobantes cargados + recibos que no lo tienen
//   · Pagos a encargados → saldos adeudados, liquidar y archivo de pagos

import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  FileText, Paperclip, CheckCircle2, AlertTriangle, ExternalLink, Wallet,
} from 'lucide-react'
import { Button, Input, Select } from '@/components/ui'
import Modal from '@/components/shared/Modal'
import AdjuntarComprobante from '@/components/shared/AdjuntarComprobante'
import { useAuth } from '@/hooks/useAuth'
import { usePermisos } from '@/hooks/usePermisos'
import { useGestoriaId } from '@/context/GestoriaContext'
import {
  subscribeComprobantes, getRecibosSinComprobante, adjuntarARecibo,
  marcarVerificado, type Comprobante,
} from '@/lib/firestore/comprobantes'
import {
  getComisionesPendientes, getSaldoEncargado, registrarLiquidacion,
  subscribeLiquidaciones, type ComisionPendiente, type Liquidacion,
} from '@/lib/firestore/liquidaciones'
import { subscribeEncargados, type Encargado } from '@/lib/firestore/encargados'

const fmt  = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
const fFec = (t: any) => {
  const d = t?.toDate?.() ?? (t instanceof Date ? t : null)
  return d ? d.toLocaleDateString('es-AR') : '—'
}
const nom = (e: Encargado & { apodo?: string }) =>
  `${e.nombre} ${e.apellido ?? ''}`.trim() + (e.apodo ? ` (${e.apodo})` : '')

export default function ComprobantesTab() {
  const [seccion, setSeccion] = useState<'clientes' | 'encargados'>('clientes')
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([['clientes', 'Cobros de clientes'], ['encargados', 'Pagos a encargados']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setSeccion(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              seccion === k ? 'border-[#D4621A] bg-orange-50 text-[#D4621A]' : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}>{l}</button>
        ))}
      </div>
      {seccion === 'clientes' ? <CobrosClientes /> : <PagosEncargados />}
    </div>
  )
}

// ═══ COBROS DE CLIENTES ══════════════════════════════════════════════════════

function CobrosClientes() {
  const gestoriaId = useGestoriaId()
  const { user }   = useAuth()
  const { puede }  = usePermisos()
  const esControl  = puede('verPanelMando') || puede('gestionarEquipo')

  const [comps, setComps]       = useState<Comprobante[]>([])
  const [faltan, setFaltan]     = useState<any[]>([])
  const [vista, setVista]       = useState<'faltan' | 'cargados'>('faltan')
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const destino   = useRef<any>(null)

  useEffect(() => subscribeComprobantes(gestoriaId, 'cobro_cliente', setComps), [gestoriaId])

  const cargarFaltan = () => {
    if (!gestoriaId) return
    const desde = new Date(); desde.setMonth(desde.getMonth() - 2)
    getRecibosSinComprobante(gestoriaId, desde).then(setFaltan).catch(() => setFaltan([]))
  }
  useEffect(cargarFaltan, [gestoriaId, comps.length])

  const pedirArchivo = (recibo: any) => { destino.current = recibo; inputRef.current?.click() }

  const alElegir = async (f?: File) => {
    const r = destino.current
    if (!f || !r || !user) return
    setSubiendo(r.id)
    try {
      await adjuntarARecibo(f, {
        id: r.id, gestoriaId, monto: Number(r.monto ?? 0), formaPago: r.formaPago,
        tramiteId: r.tramiteId, clienteId: r.clienteId, patente: r.patente,
        numeroRecibo: r.numeroRecibo,
      }, { uid: user.uid, nombre: `${user.nombre} ${user.apellido}`.trim() })
      toast.success(`Comprobante adjuntado a ${r.numeroRecibo}`)
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo subir')
    } finally {
      setSubiendo(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const montoFaltante = faltan.reduce((a, r) => a + Math.abs(Number(r.monto ?? 0)), 0)

  return (
    <div className="space-y-3">
      <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden"
        onChange={e => alElegir(e.target.files?.[0])} />

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setVista('faltan')}
          className={`text-left rounded-xl border p-3 transition-colors ${
            vista === 'faltan' ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
          <p className="text-[11px] text-gray-400 uppercase tracking-wider">Sin comprobante</p>
          <p className="text-xl font-semibold text-amber-600 tabular-nums">{faltan.length}</p>
          <p className="text-xs text-gray-400">{fmt(montoFaltante)} · últimos 2 meses</p>
        </button>
        <button onClick={() => setVista('cargados')}
          className={`text-left rounded-xl border p-3 transition-colors ${
            vista === 'cargados' ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white'}`}>
          <p className="text-[11px] text-gray-400 uppercase tracking-wider">Con comprobante</p>
          <p className="text-xl font-semibold text-emerald-600 tabular-nums">{comps.length}</p>
          <p className="text-xs text-gray-400">{comps.filter(c => !c.verificado).length} sin verificar</p>
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        {vista === 'faltan' ? (
          faltan.length === 0
            ? <p className="text-sm text-gray-400 p-8 text-center">Todos los cobros electrónicos tienen comprobante. 👏</p>
            : <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100 text-[11px] text-gray-400 uppercase tracking-wider">
                  <th className="text-left font-medium px-4 py-3">Recibo</th>
                  <th className="text-left font-medium px-2 py-3">Patente</th>
                  <th className="text-left font-medium px-2 py-3">Método</th>
                  <th className="text-right font-medium px-2 py-3">Monto</th>
                  <th className="text-left font-medium px-2 py-3">Cargó</th>
                  <th className="text-left font-medium px-2 py-3">Fecha</th>
                  <th />
                </tr></thead>
                <tbody>{faltan.map(r => (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="px-4 py-2.5 font-medium">
                      {r.numeroRecibo}
                      {(r.tipo === 'devolucion' || Number(r.monto ?? 0) < 0) && (
                        <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600">
                          devolución
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums">{r.patente}</td>
                    <td className="px-2 py-2.5 capitalize text-gray-500">{r.formaPago}</td>
                    <td className={`px-2 py-2.5 text-right tabular-nums ${Number(r.monto ?? 0) < 0 ? 'text-red-600' : ''}`}>
                      {Number(r.monto ?? 0) < 0
                        ? `−${fmt(Math.abs(Number(r.monto ?? 0)))}`
                        : fmt(Number(r.monto ?? 0))}
                    </td>
                    <td className="px-2 py-2.5 text-xs text-gray-500">{r.atribuidoANombre || r.emitidoPorNombre}</td>
                    <td className="px-2 py-2.5 text-xs text-gray-400">{fFec(r.creadoEn)}</td>
                    <td className="px-3 py-2.5">
                      <Button size="sm" variant="secondary" onClick={() => pedirArchivo(r)}
                        loading={subiendo === r.id} disabled={!!subiendo}>
                        <Paperclip className="w-3.5 h-3.5" /> Adjuntar
                      </Button>
                    </td>
                  </tr>))}
                </tbody>
              </table>
        ) : (
          comps.length === 0
            ? <p className="text-sm text-gray-400 p-8 text-center">Todavía no se cargó ningún comprobante.</p>
            : <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100 text-[11px] text-gray-400 uppercase tracking-wider">
                  <th className="text-left font-medium px-4 py-3">Archivo</th>
                  <th className="text-left font-medium px-2 py-3">Recibo</th>
                  <th className="text-left font-medium px-2 py-3">Patente</th>
                  <th className="text-right font-medium px-2 py-3">Monto</th>
                  <th className="text-left font-medium px-2 py-3">Subió</th>
                  <th className="text-left font-medium px-2 py-3">Estado</th>
                </tr></thead>
                <tbody>{comps.map(c => (
                  <tr key={c.id} className="border-b border-gray-50">
                    <td className="px-4 py-2.5">
                      <a href={c.url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 text-[#D4621A] hover:underline">
                        <FileText className="w-4 h-4" />
                        <span className="truncate max-w-[160px]">{c.nombre}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                    <td className="px-2 py-2.5">{c.referencia}</td>
                    <td className="px-2 py-2.5 tabular-nums">{c.patente}</td>
                    <td className={`px-2 py-2.5 text-right tabular-nums ${c.monto < 0 ? 'text-red-600' : ''}`}>
                      {c.monto < 0 ? `−${fmt(Math.abs(c.monto))}` : fmt(c.monto)}
                    </td>
                    <td className="px-2 py-2.5 text-xs text-gray-500">
                      {c.subidoPorNombre}<br /><span className="text-gray-400">{fFec(c.creadoEn)}</span>
                    </td>
                    <td className="px-2 py-2.5">
                      {c.verificado
                        ? <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Verificado</span>
                        : esControl
                          ? <button onClick={() => user && marcarVerificado(c.id, user.uid)}
                              className="text-xs text-gray-500 hover:text-emerald-600 underline">Verificar</button>
                          : <span className="text-xs text-gray-400">Pendiente</span>}
                    </td>
                  </tr>))}
                </tbody>
              </table>
        )}
      </div>
    </div>
  )
}

// ═══ PAGOS A ENCARGADOS ══════════════════════════════════════════════════════

function PagosEncargados() {
  const gestoriaId = useGestoriaId()
  const { user }   = useAuth()
  const { puede }  = usePermisos()
  const verTodos   = puede('verPanelMando') || puede('gestionarEquipo')

  const [encargados, setEncargados] = useState<Encargado[]>([])
  const [saldos, setSaldos] = useState<Record<string, { adeudado: number; pendientes: number; pagado: number }>>({})
  const [liqs, setLiqs]     = useState<Liquidacion[]>([])
  const [pagando, setPagando] = useState<Encargado | null>(null)

  useEffect(() => {
    if (!gestoriaId || !user) return
    const u1 = subscribeEncargados(gestoriaId, { uid: user.uid, verTodos }, setEncargados)
    const u2 = subscribeLiquidaciones(gestoriaId, { uid: user.uid, verTodos }, setLiqs)
    return () => { u1(); u2() }
  }, [gestoriaId, user?.uid, verTodos])

  // Saldos: se calculan para los encargados visibles
  useEffect(() => {
    if (!gestoriaId || !encargados.length) return
    let vivo = true
    Promise.all(encargados.map(e =>
      getSaldoEncargado(gestoriaId, e.id).then(s => [e.id, s] as const).catch(() => [e.id, null] as const)))
      .then(r => { if (vivo) setSaldos(Object.fromEntries(r.filter(([, s]) => s)) as any) })
    return () => { vivo = false }
  }, [gestoriaId, encargados.length, liqs.length])

  const conDeuda = useMemo(
    () => encargados
      .map(e => ({ e, s: saldos[e.id] }))
      .filter(x => (x.s?.adeudado ?? 0) > 0)
      .sort((a, b) => (b.s?.adeudado ?? 0) - (a.s?.adeudado ?? 0)),
    [encargados, saldos])

  const totalAdeudado = conDeuda.reduce((a, x) => a + (x.s?.adeudado ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-orange-50 text-[#D4621A] flex items-center justify-center">
          <Wallet className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[11px] text-gray-400 uppercase tracking-wider">Comisiones adeudadas</p>
          <p className="text-xl font-semibold text-[#D4621A] tabular-nums">{fmt(totalAdeudado)}</p>
          <p className="text-xs text-gray-400">{conDeuda.length} encargados con saldo pendiente</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">A pagar</p>
        {conDeuda.length === 0
          ? <p className="text-sm text-gray-400 p-6 text-center">No hay comisiones pendientes de pago.</p>
          : <table className="w-full text-sm">
              <tbody>{conDeuda.map(({ e, s }) => (
                <tr key={e.id} className="border-t border-gray-50">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-900">{nom(e as any)}</p>
                    <p className="text-xs text-gray-400">{s!.pendientes} comisiones · {e.asignadoANombre}</p>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums font-semibold text-[#D4621A]">{fmt(s!.adeudado)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button size="sm" onClick={() => setPagando(e)}>Registrar pago</Button>
                  </td>
                </tr>))}
              </tbody>
            </table>}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pagos realizados</p>
        {liqs.length === 0
          ? <p className="text-sm text-gray-400 p-6 text-center">Todavía no se registró ningún pago.</p>
          : <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 text-[11px] text-gray-400 uppercase tracking-wider">
                <th className="text-left font-medium px-4 py-2">Encargado</th>
                <th className="text-right font-medium px-2 py-2">Monto</th>
                <th className="text-center font-medium px-2 py-2">Comisiones</th>
                <th className="text-left font-medium px-2 py-2">Método</th>
                <th className="text-left font-medium px-2 py-2">Pagó</th>
                <th className="text-left font-medium px-4 py-2">Comprobante</th>
              </tr></thead>
              <tbody>{liqs.map(l => (
                <tr key={l.id} className="border-b border-gray-50">
                  <td className="px-4 py-2.5 font-medium">{l.encargadoNombre}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{fmt(l.monto)}</td>
                  <td className="px-2 py-2.5 text-center">{l.reciboIds.length}</td>
                  <td className="px-2 py-2.5 capitalize text-gray-500">{l.formaPago}</td>
                  <td className="px-2 py-2.5 text-xs text-gray-500">{l.pagadoPorNombre}<br />
                    <span className="text-gray-400">{fFec(l.creadoEn)}</span></td>
                  <td className="px-4 py-2.5">
                    {l.tieneComprobante
                      ? <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Adjunto</span>
                      : <span className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Falta</span>}
                  </td>
                </tr>))}
              </tbody>
            </table>}
      </div>

      {pagando && <ModalLiquidar encargado={pagando} onClose={() => setPagando(null)} />}
    </div>
  )
}

// ─── Modal: liquidar comisiones ──────────────────────────────────────────────

function ModalLiquidar({ encargado, onClose }: { encargado: Encargado; onClose: () => void }) {
  const gestoriaId = useGestoriaId()
  const { user }   = useAuth()
  const [pend, setPend]     = useState<ComisionPendiente[]>([])
  const [sel, setSel]       = useState<Set<string>>(new Set())
  const [monto, setMonto]   = useState('')
  const [metodo, setMetodo] = useState('transferencia')
  const [notas, setNotas]   = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [prog, setProg]     = useState(0)

  useEffect(() => {
    getComisionesPendientes(gestoriaId, encargado.id).then(p => {
      setPend(p)
      setSel(new Set(p.map(x => x.reciboId)))   // por defecto, todas
    })
  }, [gestoriaId, encargado.id])

  const esperado = pend.filter(p => sel.has(p.reciboId)).reduce((a, p) => a + p.comision, 0)
  useEffect(() => { setMonto(esperado ? String(esperado) : '') }, [esperado])

  const toggle = (id: string) => setSel(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const montoNum = Number(monto) || 0
  const dif = montoNum - esperado

  const guardar = async () => {
    if (!user) return
    setSaving(true)
    try {
      await registrarLiquidacion({
        gestoriaId, encargadoId: encargado.id, encargadoNombre: nom(encargado as any),
        asignadoA: encargado.asignadoA, reciboIds: [...sel],
        monto: montoNum, formaPago: metodo, notas: notas.trim() || undefined,
      }, archivo, { uid: user.uid, nombre: `${user.nombre} ${user.apellido}`.trim(), rol: user.rol }, setProg)
      toast.success(`Pago de ${fmt(montoNum)} a ${encargado.nombre} registrado`)
      onClose()
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo registrar')
    } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={`Pagar comisiones a ${encargado.nombre}`} size="md">
      <div className="space-y-4">
        <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
          {pend.map(p => (
            <label key={p.reciboId} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50">
              <input type="checkbox" checked={sel.has(p.reciboId)} onChange={() => toggle(p.reciboId)}
                className="w-4 h-4 accent-[#D4621A]" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800">{p.numeroRecibo} · {p.patente}</p>
                <p className="text-xs text-gray-400">{p.fecha?.toLocaleDateString('es-AR')} · cobrado {fmt(p.cobrado)}</p>
              </div>
              <span className="tabular-nums text-sm font-medium text-[#D4621A]">{fmt(p.comision)}</span>
            </label>
          ))}
        </div>

        <div className="flex justify-between text-sm px-1">
          <span className="text-gray-500">{sel.size} comisiones seleccionadas</span>
          <span className="font-semibold">{fmt(esperado)}</span>
        </div>

        <Input label="Monto pagado *" type="number" value={monto} onChange={e => setMonto(e.target.value)}
          hint={dif !== 0 && montoNum > 0
            ? `${dif > 0 ? 'Pagás' : 'Pagás'} ${fmt(Math.abs(dif))} ${dif > 0 ? 'de más' : 'de menos'} que lo devengado. Queda registrado.`
            : undefined} />

        <Select label="Cómo se pagó" value={metodo} onChange={e => setMetodo(e.target.value)}>
          <option value="transferencia">Transferencia</option>
          <option value="efectivo">Efectivo</option>
          <option value="mercadopago">Mercado Pago</option>
          <option value="otro">Otro</option>
        </Select>

        <AdjuntarComprobante metodo={metodo === 'efectivo' ? 'transferencia' : metodo}
          archivo={archivo} onChange={setArchivo} />

        <Input label="Notas" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" />

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={guardar} loading={saving} disabled={!sel.size || !(montoNum > 0)}>
            {saving && prog > 0 && prog < 100 ? `Subiendo ${prog}%` : 'Registrar pago'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ─── MONTAJE EN CobranzasPage ─────────────────────────────────────────────────
   Sumá la tercera pestaña al switcher:

     const [tab, setTab] = useState<'cobranzas' | 'recibos' | 'comprobantes'>('cobranzas')

     {([['cobranzas','Por cobrar'], ['recibos','Recibos emitidos'],
        ['comprobantes','Comprobantes']] as const).map(...)}

     {tab === 'recibos'      ? <BandejaRecibos /> :
      tab === 'comprobantes' ? <ComprobantesTab /> : ( ...lo que ya estaba... )}
─────────────────────────────────────────────────────────────────────────────── */
