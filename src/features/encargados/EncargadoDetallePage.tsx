// src/features/encargados/EncargadoDetallePage.tsx
// ─── FICHA INDIVIDUAL DEL ENCARGADO ──────────────────────────────────────────

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Phone, Mail, AtSign, Pencil, MessageCircle, AlertTriangle } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import Modal from '@/components/shared/Modal'
import { useGestoriaId } from '@/context/GestoriaContext'
import { usePageTitle } from '@/hooks/usePageTitle'
import { getDetalleEncargado, type DetalleEncargado } from '@/lib/firestore/encargadosMetricas'
import { actualizarEncargado, TIPO_ENCARGADO_LABELS } from '@/lib/firestore/encargados'
import { TIPO_TRAMITE_LABELS, ESTADO_TRAMITE_LABELS, ESTADO_TRAMITE_COLORS } from '@/types'

const fmt  = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
const fFec = (d: Date | null) => d ? d.toLocaleDateString('es-AR') : '—'

export default function EncargadoDetallePage() {
  const { id }     = useParams<{ id: string }>()
  const navigate   = useNavigate()
  const gestoriaId = useGestoriaId()

  const [d, setD]         = useState<DetalleEncargado | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab]     = useState<'tramites' | 'clientes' | 'comisiones'>('tramites')
  const [editando, setEditando] = useState(false)
  const [form, setForm]   = useState({ apellido: '', telefono: '', email: '', instagram: '' })
  const [guardando, setGuardando] = useState(false)

  const cargar = () => {
    if (!id || !gestoriaId) return
    setLoading(true)
    getDetalleEncargado(id, gestoriaId)
      .then(r => {
        setD(r)
        if (r) setForm({
          apellido:  r.encargado.apellido ?? '',
          telefono:  r.encargado.telefono ?? '',
          email:     r.encargado.email ?? '',
          instagram: r.encargado.instagram ?? '',
        })
      })
      .catch(e => setError(e?.message ?? 'No se pudo cargar'))
      .finally(() => setLoading(false))
  }
  useEffect(cargar, [id, gestoriaId])

  usePageTitle(d ? `${d.encargado.nombre} ${d.encargado.apellido ?? ''}` : 'Encargado')

  const guardar = async () => {
    if (!id) return
    const tel = form.telefono.replace(/\D/g, '')
    if (tel.length < 8) { alert('El teléfono es obligatorio.'); return }
    setGuardando(true)
    try {
      await actualizarEncargado(id, {
        apellido:  form.apellido.trim(),
        telefono:  tel,
        email:     form.email.trim() || undefined,
        instagram: form.instagram.trim() || undefined,
        datosIncompletos: false,
      } as any)
      setEditando(false)
      cargar()
    } finally { setGuardando(false) }
  }

  if (loading) return <div className="h-64 rounded-xl bg-gray-100 animate-pulse" />
  if (error || !d) return (
    <div className="rounded-xl border border-red-100 bg-red-50 p-4">
      <p className="text-sm text-red-700">{error ?? 'Encargado no encontrado, o no tenés acceso.'}</p>
    </div>
  )

  const e = d.encargado
  const nombre = `${e.nombre} ${e.apellido ?? ''}`.trim()
  const telWa = (e.telefono ?? '').replace(/\D/g, '')

  return (
    <div className="space-y-5 max-w-5xl">
      <button onClick={() => navigate('/admin/encargados')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="w-4 h-4" /> Volver a Encargados
      </button>

      {/* Cabecera */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-orange-50 text-[#D4621A] flex items-center
                            justify-center text-lg font-semibold shrink-0">
              {e.nombre?.[0]?.toUpperCase()}{e.apellido?.[0]?.toUpperCase() ?? ''}
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                {nombre}{e.apodo && <span className="text-gray-400 font-normal"> ({e.apodo})</span>}
              </h1>
              <p className="text-sm text-gray-400">
                {TIPO_ENCARGADO_LABELS[e.tipo]} · de {e.asignadoANombre || 'sin asignar'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {telWa && (
              <a href={`https://wa.me/${telWa}`} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="sm">
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </Button>
              </a>
            )}
            <Button variant="secondary" size="sm" onClick={() => setEditando(true)}>
              <Pencil className="w-4 h-4" /> Editar contacto
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-4 pt-4 border-t border-gray-100 text-sm">
          {e.telefono
            ? <span className="flex items-center gap-1.5 text-gray-600"><Phone className="w-4 h-4 text-gray-300" />{e.telefono}</span>
            : <span className="flex items-center gap-1.5 text-amber-600 font-medium"><AlertTriangle className="w-4 h-4" />Sin teléfono — completalo</span>}
          {e.telefonoAlt && <span className="flex items-center gap-1.5 text-gray-400"><Phone className="w-4 h-4 text-gray-300" />{e.telefonoAlt} (alt.)</span>}
          {e.email && <span className="flex items-center gap-1.5 text-gray-600"><Mail className="w-4 h-4 text-gray-300" />{e.email}</span>}
          {e.instagram && <span className="flex items-center gap-1.5 text-gray-600"><AtSign className="w-4 h-4 text-gray-300" />{e.instagram}</span>}
        </div>
        {e.notas && <p className="text-xs text-gray-400 mt-2">{e.notas}</p>}
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {([
          ['Clientes', d.totales.clientes, 'text-gray-900'],
          ['Gestiones', d.totales.tramites, 'text-gray-900'],
          ['Activas ahora', d.totales.tramitesActivos, 'text-blue-600'],
          ['Cobrado', fmt(d.totales.cobrado), 'text-emerald-600'],
          ['Comisión pagada', fmt(d.totales.comision), 'text-[#D4621A]'],
        ] as const).map(([l, v, c]) => (
          <div key={l} className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider">{l}</p>
            <p className={`text-xl font-semibold tabular-nums mt-0.5 ${c}`}>{v}</p>
          </div>
        ))}
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          ['tramites', `Gestiones (${d.tramites.length})`],
          ['clientes', `Clientes (${d.clientes.length})`],
          ['comisiones', `Comisiones (${d.comisiones.filter(c => c.comision > 0).length})`],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === k ? 'border-[#D4621A] text-[#D4621A]' : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}>{l}</button>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        {tab === 'tramites' && (d.tramites.length === 0
          ? <p className="text-sm text-gray-400 p-6 text-center">Todavía no aportó gestiones.</p>
          : <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 text-[11px] text-gray-400 uppercase tracking-wider">
                <th className="text-left font-medium px-4 py-3">Trámite</th>
                <th className="text-left font-medium px-2 py-3">Cliente</th>
                <th className="text-left font-medium px-2 py-3">Patente</th>
                <th className="text-left font-medium px-2 py-3">Estado</th>
                <th className="text-right font-medium px-2 py-3">Honorarios</th>
                <th className="text-left font-medium px-4 py-3">Fecha</th>
              </tr></thead>
              <tbody>{d.tramites.map(t => (
                <tr key={t.id} onClick={() => navigate(`/admin/tramites/${t.id}`)}
                  className={`border-b border-gray-50 hover:bg-orange-50/40 cursor-pointer ${t.activo ? '' : 'opacity-60'}`}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-900">{t.numero}</p>
                    <p className="text-xs text-gray-400">{TIPO_TRAMITE_LABELS[t.tipo as keyof typeof TIPO_TRAMITE_LABELS] ?? t.tipo}</p>
                  </td>
                  <td className="px-2 py-2.5 text-gray-600">{t.cliente}</td>
                  <td className="px-2 py-2.5 font-medium tabular-nums">{t.patente}</td>
                  <td className="px-2 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      ESTADO_TRAMITE_COLORS[t.estado as keyof typeof ESTADO_TRAMITE_COLORS] ?? 'bg-gray-100 text-gray-500'}`}>
                      {ESTADO_TRAMITE_LABELS[t.estado as keyof typeof ESTADO_TRAMITE_LABELS] ?? t.estado}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{fmt(t.honorarios)}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{fFec(t.creadoEn)}</td>
                </tr>))}
              </tbody>
            </table>)}

        {tab === 'clientes' && (d.clientes.length === 0
          ? <p className="text-sm text-gray-400 p-6 text-center">No hay clientes vinculados.</p>
          : <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 text-[11px] text-gray-400 uppercase tracking-wider">
                <th className="text-left font-medium px-4 py-3">Cliente</th>
                <th className="text-left font-medium px-2 py-3">Teléfono</th>
                <th className="text-left font-medium px-4 py-3">Alta</th>
              </tr></thead>
              <tbody>{d.clientes.map(c => (
                <tr key={c.id} onClick={() => navigate(`/admin/clientes/${c.id}`)}
                  className="border-b border-gray-50 hover:bg-orange-50/40 cursor-pointer">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{c.nombre}</td>
                  <td className="px-2 py-2.5 text-gray-500 tabular-nums">{c.telefono}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{fFec(c.creadoEn)}</td>
                </tr>))}
              </tbody>
            </table>)}

        {tab === 'comisiones' && (d.comisiones.length === 0
          ? <p className="text-sm text-gray-400 p-6 text-center">No hay cobros registrados de sus clientes.</p>
          : <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 text-[11px] text-gray-400 uppercase tracking-wider">
                <th className="text-left font-medium px-4 py-3">Recibo</th>
                <th className="text-left font-medium px-2 py-3">Cliente</th>
                <th className="text-left font-medium px-2 py-3">Patente</th>
                <th className="text-right font-medium px-2 py-3">Cobrado</th>
                <th className="text-right font-medium px-2 py-3">Comisión</th>
                <th className="text-left font-medium px-4 py-3">Fecha</th>
              </tr></thead>
              <tbody>{d.comisiones.map(c => (
                <tr key={c.reciboId} className="border-b border-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{c.numeroRecibo}</td>
                  <td className="px-2 py-2.5 text-gray-600">{c.cliente}</td>
                  <td className="px-2 py-2.5 tabular-nums">{c.patente}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{fmt(c.cobrado)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-[#D4621A]">
                    {c.comision > 0 ? fmt(c.comision) : <span className="text-gray-300">sin cargar</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{fFec(c.fecha)}</td>
                </tr>))}
              </tbody>
            </table>)}
      </div>

      {/* Edición de contacto */}
      <Modal open={editando} onClose={() => setEditando(false)} title="Editar contacto" size="md">
        <div className="space-y-3">
          <Input label="Apellido" value={form.apellido}
            onChange={x => setForm({ ...form, apellido: x.target.value })} />
          <Input label="Teléfono *" value={form.telefono}
            onChange={x => setForm({ ...form, telefono: x.target.value })}
            hint="Obligatorio: es lo que queda si cambia el secretario." />
          <Input label="Email" value={form.email}
            onChange={x => setForm({ ...form, email: x.target.value })} />
          <Input label="Instagram" value={form.instagram}
            onChange={x => setForm({ ...form, instagram: x.target.value })} />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setEditando(false)}>Cancelar</Button>
            <Button onClick={guardar} loading={guardando}>Guardar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
