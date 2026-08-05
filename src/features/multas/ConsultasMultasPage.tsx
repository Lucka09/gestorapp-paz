// src/pages/ConsultasMultasPage.tsx
// ─── CONSULTAS DE MULTAS — vista de trabajo ─────────────────────────────────
// Lista las consultas por estado. El foco son las COTIZADAS (ya pasaron por la
// extensión): Jessica abre el presupuesto, ajusta si hace falta, y envía. Al
// enviar, persiste el presupuesto exacto en la consulta (fuente única de verdad)
// y abre WhatsApp con el mensaje al contacto.

import { useState } from 'react'
import toast from 'react-hot-toast'
import Modal from '@/components/shared/Modal'
import PresupuestoMultas from '@/features/multas/PresupuestoMultas'
import { usePermisos } from '@/hooks/usePermisos'
import { useConsultasInfracciones } from '@/hooks/useConsultasInfracciones'
import {
  persistirDatosPresupuesto,
  marcarConsultaEnviada,
  descartarConsulta,
} from '@/lib/firestore/consultasInfracciones'
import { money } from '@/lib/calcularPresupuesto'
import type { ConsultaInfraccion } from '@/infraccion_types'
import type { DatosPresupuesto } from '@/lib/armarDatosPresupuesto'

const NARANJA = '#D4621A'

function valorConsulta(c: ConsultaInfraccion): string {
  return c.tipoConsulta === 'dni' ? (c.dni ?? '—') : (c.dominio ?? '—')
}

function waLink(whatsapp: string, mensaje: string): string {
  const num = (whatsapp || '').replace(/[^0-9]/g, '')
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`
}

export default function ConsultasMultasPage() {
  const { puede }   = usePermisos()
  const puedeVer    = puede('verCRM')
  const puedeEnviar = puede('responderWA')

  const { porEstado, paraEnviar, loading } = useConsultasInfracciones()
  const [abierta, setAbierta] = useState<ConsultaInfraccion | null>(null)

  if (!puedeVer) {
    return <div className="p-6 text-sm text-gray-500">No tenés acceso a esta sección.</div>
  }

  const enCola = [...porEstado.pendiente, ...porEstado.consultada]

  async function handleEnviar(consulta: ConsultaInfraccion, datos: DatosPresupuesto) {
    try {
      await persistirDatosPresupuesto(consulta.id, datos)
      await marcarConsultaEnviada(consulta.id)
      const wa = consulta.contacto?.whatsapp
      if (wa) window.open(waLink(wa, datos.mensajeWhatsapp), '_blank', 'noopener')
      toast.success('Presupuesto guardado. Abriendo WhatsApp…')
      setAbierta(null)
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo enviar')
    }
  }

  async function handleDescartar(id: string) {
    try { await descartarConsulta(id); toast('Consulta descartada') }
    catch (e: any) { toast.error(e?.message ?? 'Error al descartar') }
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <header className="mb-5">
        <h1 className="text-xl font-bold" style={{ color: NARANJA }}>Consultas de multas</h1>
        <p className="text-sm text-gray-500">Presupuestos listos para revisar y enviar.</p>
      </header>

      {loading && <div className="text-sm text-gray-400">Cargando…</div>}

      {/* ── LISTAS PARA ENVIAR ─────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
          Para enviar ({paraEnviar.length})
        </h2>
        {paraEnviar.length === 0 && !loading && (
          <p className="text-sm text-gray-400">Nada pendiente de envío por ahora.</p>
        )}
        <div className="grid gap-3">
          {paraEnviar.map(c => (
            <article key={c.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-900">{valorConsulta(c)}</div>
                  <div className="text-sm text-gray-500">
                    {c.contacto?.nombre || 'Lead web'}
                    {c.contacto?.whatsapp ? ` · ${c.contacto.whatsapp}` : ''}
                  </div>
                </div>
                <span className="text-[11px] rounded-full px-2 py-0.5 bg-orange-50 text-orange-700 whitespace-nowrap">
                  cotizada
                </span>
              </div>

              {c.cotizacion && (
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Metric label="Trabajables" value={String(c.cotizacion.cantidadTrabajable)} />
                  <Metric label="Deuda" value={money(c.cotizacion.importeTotalDeuda)} />
                  <Metric label="Honorarios" value={money(c.cotizacion.honorariosGestoria)} />
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setAbierta(c)}
                  className="flex-1 rounded-lg py-2 text-sm font-semibold text-white"
                  style={{ background: NARANJA }}
                >
                  Ver presupuesto
                </button>
                <button
                  onClick={() => handleDescartar(c.id)}
                  className="rounded-lg px-3 py-2 text-sm text-gray-500 bg-gray-100"
                >
                  Descartar
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── EN COLA (esperando la extensión) ───────────────────────────── */}
      {enCola.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            En cola ({enCola.length})
          </h2>
          <div className="grid gap-2">
            {enCola.map(c => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm">
                <span className="font-medium text-gray-800">{valorConsulta(c)}</span>
                <span className="text-gray-400">
                  {c.tipoConsulta === 'dni' ? 'DNI · manual' : 'esperando consulta'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── ENVIADAS / SIN DEUDA (resumen) ─────────────────────────────── */}
      <section className="text-sm text-gray-400">
        {porEstado.enviada.length > 0 && <div>Enviadas: {porEstado.enviada.length}</div>}
        {porEstado.sin_deuda.length > 0 && <div>Sin deuda: {porEstado.sin_deuda.length}</div>}
      </section>

      {/* ── MODAL PRESUPUESTO ──────────────────────────────────────────── */}
      <Modal
        open={!!abierta}
        onClose={() => setAbierta(null)}
        title="Presupuesto de multas"
        subtitle={abierta ? valorConsulta(abierta) : undefined}
        size="lg"
      >
        {abierta?.cotizacion && (
          <PresupuestoMultas
            dominio={valorConsulta(abierta)}
            cotizacion={abierta.cotizacion}
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