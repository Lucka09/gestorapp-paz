// src/features/multas/ConsultasMultasPage.tsx
import { useState, useMemo } from 'react'
import toast from 'react-hot-toast'
import Modal from '@/components/shared/Modal'
import ModalOtrosPagos from '@/components/multas/ModalOtrosPagos'
import { CreditCard, Search, X, Clock } from 'lucide-react'
import PresupuestoMultas from '@/features/multas/PresupuestoMultas'
import { usePermisos } from '@/hooks/usePermisos'
import { useConsultasInfracciones } from '@/hooks/useConsultasInfracciones'
import { useEquipo } from '@/hooks/useEquipo'
import { useAuthStore } from '@/store/authStore'
import {
  persistirDatosPresupuesto,
  marcarConsultaEnviada,
  descartarConsulta,
  asignarConsulta,
  reclamarConsultaSiLibre,
} from '@/lib/firestore/consultasInfracciones'
import { money } from '@/lib/calcularPresupuesto'
import type { ConsultaInfraccion } from '@/infraccion_types'
import type { DatosPresupuesto } from '@/lib/armarDatosPresupuesto'
const NARANJA = '#D4621A'
type Tab = 'cola' | 'cotizadas' | 'sin_deuda'
// Roles que pueden asignar y ver todas las consultas.
const ROLES_ADMIN = ['propietario', 'admin', 'admin_gral', 'superadmin']
function valorConsulta(c: ConsultaInfraccion): string {
  return c.tipoConsulta === 'dni' ? (c.dni ?? '—') : (c.dominio ?? '—')
}
function waLink(whatsapp: string, mensaje: string): string {
  const num = (whatsapp || '').replace(/[^0-9]/g, '')
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`
}
const trabajables = (c: ConsultaInfraccion) => c.cotizacion?.cantidadTrabajable ?? 0

// ─── Fechas ──────────────────────────────────────────────────────────────────
const ms = (ts: any): number => (typeof ts?.toMillis === 'function' ? ts.toMillis() : 0)
function fechaCorta(ts: any): string {
  const t = ms(ts)
  if (!t) return ''
  return new Date(t).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function haceCuanto(ts: any): string {
  const t = ms(ts)
  if (!t) return ''
  const min = Math.floor((Date.now() - t) / 60000)
  if (min < 1)  return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24)   return `hace ${h} h`
  const d = Math.floor(h / 24)
  return d === 1 ? 'hace 1 día' : `hace ${d} días`
}
/** Color de espera en cola: normal < 24 h · ámbar 24–48 h · rojo > 48 h */
function colorEspera(ts: any): string {
  const h = (Date.now() - ms(ts)) / 3_600_000
  if (!ms(ts) || h < 24) return 'text-gray-400'
  return h < 48 ? 'text-amber-600 font-semibold' : 'text-red-600 font-semibold'
}
/** Tomada por la extensión en los últimos 10 min (mismo criterio que colaProximaConsulta) */
const enProceso = (c: ConsultaInfraccion) => Date.now() - ms((c as any).bloqueadoEn) < 10 * 60 * 1000
/** Fecha del último movimiento relevante según el estado */
const fechaEstado = (c: ConsultaInfraccion) =>
  (c as any).enviadaEn ?? c.consultadaEn ?? c.creadaEn

// ─── Buscador ────────────────────────────────────────────────────────────────
const norm      = (s?: string) => (s ?? '').toUpperCase().replace(/[\s.\-]/g, '')
const soloDigit = (s?: string) => (s ?? '').replace(/\D/g, '')
function coincide(c: ConsultaInfraccion, q: string): boolean {
  const qn = norm(q)
  const qd = soloDigit(q)
  if (!qn) return false
  if (norm(c.dominio).includes(qn) || norm(c.dni).includes(qn)) return true
  if (qd.length >= 6 && soloDigit(c.contacto?.whatsapp).includes(qd)) return true
  return (c.contacto?.nombre ?? '').toLowerCase().includes(q.trim().toLowerCase())
}
function etiquetaEstado(c: ConsultaInfraccion): { label: string; cls: string } {
  switch (c.estado) {
    case 'pendiente':  return { label: 'En cola',             cls: 'bg-yellow-50 text-yellow-700' }
    case 'consultada': return { label: 'Procesando',          cls: 'bg-blue-50 text-blue-700' }
    case 'cotizada':   return trabajables(c) > 0
      ? { label: 'Cotizada · sin enviar', cls: 'bg-orange-50 text-orange-700' }
      : { label: 'Sin trabajables',       cls: 'bg-gray-100 text-gray-500' }
    case 'enviada':    return { label: 'Presupuesto enviado', cls: 'bg-green-50 text-green-700' }
    case 'sin_deuda':  return { label: 'Sin deuda',           cls: 'bg-gray-100 text-gray-500' }
    case 'descartada': return { label: 'Descartada',          cls: 'bg-gray-100 text-gray-400' }
    default:           return { label: c.estado,              cls: 'bg-gray-100 text-gray-500' }
  }
}
export default function ConsultasMultasPage() {
  const { puede } = usePermisos()
  const user = useAuthStore(s => s.user)
  const { activos } = useEquipo()
  const puedeVer = puede('verConsultasMultas')
  const puedeEnviar = puede('responderWA')
  const esAdmin = ROLES_ADMIN.includes(user?.rol ?? '')
  const { consultas, todas, porEstado, paraEnviar, loading } = useConsultasInfracciones()
  const [tab, setTab] = useState<Tab>('cola')
  const [busqueda, setBusqueda] = useState('')

  // Resultados del buscador: en TODOS los estados (incluye descartadas).
  const buscando  = busqueda.trim().length >= 2
  const resultados = useMemo(
    () => buscando
      ? consultas.filter(c => coincide(c, busqueda)).sort((a, b) => ms(b.creadaEn) - ms(a.creadaEn))
      : [],
    [consultas, busqueda, buscando],
  )
  // Si no la ve pero existe a cargo de otro: avisamos (sin datos del cliente)
  // para que no se cargue duplicada.
  const deOtros = useMemo(() => {
    if (!buscando || resultados.length > 0) return []
    const qn = norm(busqueda)
    if (qn.length < 6) return []
    return todas.filter(c => norm(c.dominio) === qn || norm(c.dni) === qn)
  }, [todas, busqueda, buscando, resultados.length])
  const [abierta, setAbierta] = useState<ConsultaInfraccion | null>(null)
  const [otrosPagosOpen, setOtrosPagos] = useState(false)
  if (!puedeVer) return <div className="p-6 text-sm text-gray-500">No tenés acceso a esta sección.</div>
  // ── Grupos por pestaña ───────────────────────────────────────────────
  // Cola en el MISMO orden en que la extensión las entrega:
  // procesándose arriba; después las asignadas a mí y luego las libres, cada
  // grupo de la más antigua a la más nueva. (Admins: todas por antigüedad.)
  const porAntiguedad = (a: ConsultaInfraccion, b: ConsultaInfraccion) => ms(a.creadaEn) - ms(b.creadaEn)
  const procesando = [...(porEstado.consultada || [])].sort(porAntiguedad)
  const pendientes = [...(porEstado.pendiente || [])]
  const esperando  = esAdmin
    ? pendientes.sort(porAntiguedad)
    : [
        ...pendientes.filter(c => c.asignadoA === user?.uid).sort(porAntiguedad),
        ...pendientes.filter(c => !c.asignadoA).sort(porAntiguedad),
      ]
  const enCola = [...procesando, ...esperando]
  // Resto de pestañas: lo más reciente primero, por su última fecha de movimiento.
  const recientes = (a: ConsultaInfraccion, b: ConsultaInfraccion) => ms(fechaEstado(b)) - ms(fechaEstado(a))
  const cotizadas = [
    ...paraEnviar.filter(c => trabajables(c) > 0),
    ...(porEstado.enviada || []).filter(c => trabajables(c) > 0),
  ].sort(recientes)
  const sinDeuda = [
    ...(porEstado.sin_deuda || []),
    ...paraEnviar.filter(c => trabajables(c) === 0),
    ...(porEstado.enviada || []).filter(c => trabajables(c) === 0),
  ].sort(recientes)
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'cola',      label: 'En cola',                  count: enCola.length },
    { key: 'cotizadas', label: 'Cotizadas / trabajables',  count: cotizadas.length },
    { key: 'sin_deuda', label: 'Sin deuda / sin trabajables', count: sinDeuda.length },
  ]
  async function handleAsignar(consultaId: string, uid: string) {
    try {
      if (!uid) { await asignarConsulta(consultaId, null); toast('Consulta liberada'); return }
      const m = activos.find(x => x.uid === uid)
      await asignarConsulta(consultaId, { uid, nombre: m ? `${m.nombre} ${m.apellido}` : '—' })
      toast.success('Consulta asignada')
    } catch (e: any) { toast.error(e?.message ?? 'No se pudo asignar') }
  }
  async function handleEnviar(consulta: ConsultaInfraccion, datos: DatosPresupuesto) {
    try {
      await persistirDatosPresupuesto(consulta.id, datos)
      await marcarConsultaEnviada(consulta.id)
      // Auto-claim: quien la trabaja/envía queda asignado si estaba libre.
      if (!consulta.asignadoA && user) {
        await reclamarConsultaSiLibre(consulta.id, {
          uid: user.uid, nombre: `${user.nombre ?? ''} ${user.apellido ?? ''}`.trim() || (user.email ?? '—'),
        })
      }
      const wa = consulta.contacto?.whatsapp
      if (wa) window.open(waLink(wa, datos.mensajeWhatsapp), '_blank', 'noopener')
      toast.success('Presupuesto guardado. Abriendo WhatsApp…')
      setAbierta(null)
    } catch (e: any) { toast.error(e?.message ?? 'No se pudo enviar') }
  }
  async function handleDescartar(id: string) {
    try { await descartarConsulta(id); toast('Consulta descartada') }
    catch (e: any) { toast.error(e?.message ?? 'Error al descartar') }
  }
  // ─ Sub-componentes ────────────────────────────────────────────────────
  const AsignarSelect = ({ c }: { c: ConsultaInfraccion }) => {
    if (!esAdmin) return null
    return (
      <select
        value={c.asignadoA ?? ''}
        onClick={e => e.stopPropagation()}
        onChange={e => handleAsignar(c.id, e.target.value)}
        className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-600 outline-none focus:border-orange-300"
      >
        <option value="">Sin asignar</option>
        {activos.map(m => (
          <option key={m.uid} value={m.uid}>{m.nombre} {m.apellido}</option>
        ))}
      </select>
    )
  }
  const BadgeAsignado = ({ c }: { c: ConsultaInfraccion }) =>
    c.asignadoANombre
      ? <span className="text-[10px] rounded-full px-2 py-0.5 bg-blue-50 text-blue-700 whitespace-nowrap">{c.asignadoANombre}</span>
      : null
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: NARANJA }}>Consultas de multas</h1>
          <p className="text-sm text-gray-500">
            {esAdmin
              ? 'Cola de la extensión, cotizaciones y resultados sin deuda.'
              : 'Tus consultas asignadas.'}
          </p>
        </div>
        {puede('gestionarMultas') && (
          <button onClick={() => setOtrosPagos(true)}
            className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: NARANJA }}>
            <CreditCard size={15} /> Otros Pagos
          </button>
        )}
      </header>
      <ModalOtrosPagos open={otrosPagosOpen} onClose={() => setOtrosPagos(false)} />
      {/* ── BUSCADOR ─────────────────────────────────────────────────── */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por patente, DNI, cliente o WhatsApp…"
          aria-label="Buscar consulta"
          className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 bg-white"
        />
        {busqueda && (
          <button onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        )}
      </div>

      {buscando && (
        <section className="mb-6">
          <p className="text-xs text-gray-400 mb-2">
            {resultados.length} resultado{resultados.length !== 1 ? 's' : ''} para «{busqueda.trim()}» · todos los estados
          </p>
          {resultados.length === 0 && deOtros.length === 0 && !loading && (
            <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-3">
              No está en consultas. Si es un cliente nuevo, cargalo como lead y se encola solo.
            </p>
          )}
          {deOtros.map(c => (
            <div key={c.id} className="text-sm bg-amber-50 border border-amber-100 text-amber-800 rounded-lg px-3 py-3 mb-2">
              Esta {c.tipoConsulta === 'dni' ? 'consulta por DNI' : 'patente'} ya está en consultas
              ({etiquetaEstado(c).label.toLowerCase()}), a cargo de {c.asignadoANombre || 'otro integrante del equipo'}.
              No la cargues de nuevo.
            </div>
          ))}
          <div className="grid gap-2">
            {resultados.map(c => {
              const e = etiquetaEstado(c)
              return (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div>
                      <span className="font-medium text-gray-800">{valorConsulta(c)}</span>
                      <span className="text-gray-400 ml-2">{c.contacto?.nombre || 'Lead'}</span>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      Cargada {fechaCorta(c.creadaEn)}
                      {c.consultadaEn ? ` · consultada ${fechaCorta(c.consultadaEn)}` : ''}
                      {(c as any).enviadaEn ? ` · enviada ${fechaCorta((c as any).enviadaEn)}` : ''}
                      {c.cotizacion ? ` · ${c.cotizacion.cantidadTrabajable} trabajable(s) · ${money(c.cotizacion.importeTotalDeuda)}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <BadgeAsignado c={c} />
                    <span className={`text-[11px] rounded-full px-2 py-0.5 whitespace-nowrap ${e.cls}`}>{e.label}</span>
                    {c.cotizacion && (
                      <button onClick={() => setAbierta(c)}
                        className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-orange-200 text-orange-700 hover:bg-orange-50 whitespace-nowrap">
                        Ver presupuesto
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── PESTAÑAS ─────────────────────────────────────────────────── */}
      <div className={`flex gap-2 mb-5 overflow-x-auto ${buscando ? 'hidden' : ''}`}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5
              ${tab === t.key ? 'text-white shadow-sm' : 'bg-white border border-gray-100 text-gray-600 hover:border-orange-200'}`}
            style={tab === t.key ? { background: NARANJA } : undefined}
          >
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === t.key ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>
      {loading && <div className="text-sm text-gray-400 mb-4">Cargando…</div>}
      {/* ── PESTAÑA: EN COLA ─────────────────────────────────────────── */}
      {!buscando && tab === 'cola' && (
        <div className="grid gap-2">
          {enCola.length === 0 && !loading && <p className="text-sm text-gray-400">Nada en cola por ahora.</p>}
          {enCola.length > 0 && (
            <p className="text-[11px] text-gray-400 mb-1">
              Ordenadas como las entrega la extensión: {esAdmin ? 'de la más antigua a la más nueva' : 'primero las tuyas, después las libres, de la más antigua a la más nueva'}.
            </p>
          )}
          {enCola.map((c, i) => (
            <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm">
              <div className="min-w-0 flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-gray-50 text-gray-500 text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div>
                    <span className="font-medium text-gray-800">{valorConsulta(c)}</span>
                    <span className="text-gray-400 ml-2">{c.contacto?.nombre || 'Lead'}</span>
                  </div>
                  <div className={`text-[11px] flex items-center gap-1 ${colorEspera(c.creadaEn)}`}>
                    <Clock size={11} /> {fechaCorta(c.creadaEn)} · {haceCuanto(c.creadaEn)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <BadgeAsignado c={c} />
                <AsignarSelect c={c} />
                {puede('gestionarMultas') && (
                  <button onClick={() => setAbierta(c)}
                    className="shrink-0 text-[11px] font-semibold px-2 py-1 rounded-lg border border-orange-200 text-orange-700 hover:bg-orange-50 whitespace-nowrap">
                    Cotizar CABA
                  </button>
                )}
                <span className="text-gray-400 text-xs whitespace-nowrap">
                  {c.estado === 'consultada' ? 'procesando…'
                    : enProceso(c) ? 'tomada por la extensión'
                    : c.tipoConsulta === 'dni' ? 'DNI · esperando extensión' : 'esperando extensión'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* ── PESTAÑA: COTIZADAS / TRABAJABLES ─────────────────────────── */}
      {!buscando && tab === 'cotizadas' && (
        <div className="grid gap-3">
          {cotizadas.length === 0 && !loading && <p className="text-sm text-gray-400">No hay cotizaciones con actas trabajables.</p>}
          {cotizadas.map(c => (
            <article key={c.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-900">{valorConsulta(c)}</div>
                  <div className="text-sm text-gray-500">{c.contacto?.nombre || 'Lead'}{c.contacto?.whatsapp ? ` · ${c.contacto.whatsapp}` : ''}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {c.estado === 'enviada' ? 'Enviada' : 'Cotizada'} {fechaCorta(fechaEstado(c))} · cargada {fechaCorta(c.creadaEn)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <BadgeAsignado c={c} />
                  <span className={`text-[11px] rounded-full px-2 py-0.5 whitespace-nowrap ${c.estado === 'enviada' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
                    {c.estado === 'enviada' ? 'enviada' : 'cotizada'}
                  </span>
                </div>
              </div>
              {c.cotizacion && (
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Metric label="Trabajables" value={String(c.cotizacion.cantidadTrabajable)} />
                  <Metric label="Deuda" value={money(c.cotizacion.importeTotalDeuda)} />
                  <Metric label="Honorarios" value={money(c.cotizacion.honorariosGestoria)} />
                </div>
              )}
              <div className="mt-4 flex items-center gap-2">
                <button onClick={() => setAbierta(c)} className="flex-1 rounded-lg py-2 text-sm font-semibold text-white" style={{ background: NARANJA }}>
                  Ver presupuesto
                </button>
                <AsignarSelect c={c} />
                {c.estado !== 'enviada' && (
                  <button onClick={() => handleDescartar(c.id)} className="rounded-lg px-3 py-2 text-sm text-gray-500 bg-gray-100">
                    Descartar
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {!buscando && tab === 'sin_deuda' && (
        <div className="grid gap-3">
          {sinDeuda.length === 0 && !loading && <p className="text-sm text-gray-400">Sin consultas en esta categoría.</p>}
          {sinDeuda.map(c => (
            <article key={c.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-900">{valorConsulta(c)}</div>
                  <div className="text-sm text-gray-500">{c.contacto?.nombre || 'Lead'}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">Consultada {fechaCorta(fechaEstado(c))}</div>
                </div>
                <div className="flex items-center gap-2">
                  <BadgeAsignado c={c} />
                  <span className="text-[11px] rounded-full px-2 py-0.5 bg-gray-100 text-gray-500 whitespace-nowrap">
                    {c.cotizacion ? `${c.cotizacion.cantidadExcluida} excluida(s)` : 'sin deuda'}
                  </span>
                </div>
              </div>
              {c.cotizacion && c.cotizacion.actasExcluidas.length > 0 && (
                <div className="mt-3 space-y-1">
                  {c.cotizacion.actasExcluidas.map(a => (
                    <div key={a.nroActa} className="flex items-center justify-between gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5">
                      <span className="font-mono shrink-0">{a.nroActa}</span>
                      <span className="flex-1 truncate">{a.estadoCausa}</span>
                      <span className="text-gray-400 flex-1 truncate">{a.clasificacion.motivoExclusion}</span>
                      <span className="shrink-0">{money(a.importeTotal)}</span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {/* ── MODAL PRESUPUESTO ─────────────────────────────────────────── */}
      <Modal open={!!abierta} onClose={() => setAbierta(null)} title="Presupuesto de multas" subtitle={abierta ? valorConsulta(abierta) : undefined} size="lg">
        {abierta && (
          <PresupuestoMultas
            dominio={valorConsulta(abierta)}
            cotizacion={abierta.cotizacion}
            cotizacionCABA={abierta.cotizacionCABA}
            clienteNombre={abierta.contacto?.nombre}
            onEnviar={puedeEnviar ? (datos) => handleEnviar(abierta, datos) : undefined}
          />
        )}
      </Modal>
    </div>
  )
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 py-2">
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className="text-sm font-semibold text-gray-900">{value}</div>
    </div>
  )
}