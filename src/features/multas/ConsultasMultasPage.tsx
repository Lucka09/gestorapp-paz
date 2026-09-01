// src/features/multas/ConsultasMultasPage.tsx
import { useState } from 'react'
import toast from 'react-hot-toast'
import Modal from '@/components/shared/Modal'
import ModalOtrosPagos from '@/components/multas/ModalOtrosPagos'
import { CreditCard } from 'lucide-react'
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
export default function ConsultasMultasPage() {
  const { puede } = usePermisos()
  const user = useAuthStore(s => s.user)
  const { activos } = useEquipo()
  const puedeVer = puede('verConsultasMultas')
  const puedeEnviar = puede('responderWA')
  const esAdmin = ROLES_ADMIN.includes(user?.rol ?? '')
  const { porEstado, paraEnviar, loading } = useConsultasInfracciones()
  const [tab, setTab] = useState<Tab>('cola')
  const [abierta, setAbierta] = useState<ConsultaInfraccion | null>(null)
  const [otrosPagosOpen, setOtrosPagos] = useState(false)
  if (!puedeVer) return <div className="p-6 text-sm text-gray-500">No tenés acceso a esta sección.</div>
  // ── Grupos por pestaña ───────────────────────────────────────────────
  const enCola = [...(porEstado.pendiente || []), ...(porEstado.consultada || [])]
  const cotizadas = [
    ...paraEnviar.filter(c => trabajables(c) > 0),
    ...(porEstado.enviada || []).filter(c => trabajables(c) > 0),
  ]
  const sinDeuda = [
    ...(porEstado.sin_deuda || []),
    ...paraEnviar.filter(c => trabajables(c) === 0),
    ...(porEstado.enviada || []).filter(c => trabajables(c) === 0),
  ]
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
      {/* ── PESTAÑAS ─────────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-5 overflow-x-auto">
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
      {tab === 'cola' && (
        <div className="grid gap-2">
          {enCola.length === 0 && !loading && <p className="text-sm text-gray-400">Nada en cola por ahora.</p>}
          {enCola.map(c => (
            <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium text-gray-800">{valorConsulta(c)}</span>
                <span className="text-gray-400 ml-2">{c.contacto?.nombre || 'Lead'}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <BadgeAsignado c={c} />
                <AsignarSelect c={c} />
                <span className="text-gray-400 text-xs whitespace-nowrap">
                  {c.estado === 'consultada' ? 'procesando…' : c.tipoConsulta === 'dni' ? 'DNI · esperando extensión' : 'esperando extensión'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* ── PESTAÑA: COTIZADAS / TRABAJABLES ─────────────────────────── */}
      {tab === 'cotizadas' && (
        <div className="grid gap-3">
          {cotizadas.length === 0 && !loading && <p className="text-sm text-gray-400">No hay cotizaciones con actas trabajables.</p>}
          {cotizadas.map(c => (
            <article key={c.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-900">{valorConsulta(c)}</div>
                  <div className="text-sm text-gray-500">{c.contacto?.nombre || 'Lead'}{c.contacto?.whatsapp ? ` · ${c.contacto.whatsapp}` : ''}</div>
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
      {tab === 'sin_deuda' && (
        <div className="grid gap-3">
          {sinDeuda.length === 0 && !loading && <p className="text-sm text-gray-400">Sin consultas en esta categoría.</p>}
          {sinDeuda.map(c => (
            <article key={c.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-900">{valorConsulta(c)}</div>
                  <div className="text-sm text-gray-500">{c.contacto?.nombre || 'Lead'}</div>
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
        {abierta && (abierta.cotizacion || abierta.cotizacionCABA) && (
          <PresupuestoMultas
            dominio={valorConsulta(abierta)}
            cotizacion={abierta.cotizacion!}
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