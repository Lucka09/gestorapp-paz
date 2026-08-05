// src/features/multas/PresupuestoMultas.tsx
// ─── PRESUPUESTO DE MULTAS — componente que monta el renderer en GestorApp ───
//
// Toma la cotización de una consulta (actas parseadas), pre-llena el presupuesto
// con los datos automáticos y deja que Jessica ajuste antes de exportar/enviar.
// Reusa el motor (calcularPresupuesto) y el renderer (dibujarPresupuesto), así
// imagen y mensaje salen del mismo cálculo que la Cloud Function.

import { useState, useEffect, useRef, useMemo } from 'react'
import { jsPDF } from 'jspdf'
import toast from 'react-hot-toast'
import {
  calcularPresupuesto,
  textoWhatsappPresupuesto,
  CONFIG_PRESUPUESTO_DEFAULT,
  type ConfigPresupuesto,
  type FilaPresupuesto,
} from '@/lib/calcularPresupuesto'
import { dibujarPresupuesto } from '@/lib/renderPresupuestoCanvas'
import type { CotizacionMultas } from '@/infraccion_types'
import type { DatosPresupuesto } from '@/lib/armarDatosPresupuesto'

const NARANJA = '#F28F07'

interface Props {
  dominio:        string
  cotizacion:     CotizacionMultas
  configInicial?: Partial<ConfigPresupuesto>
  clienteNombre?: string
  onEnviarWhatsapp?: (mensaje: string) => void   // opcional: solo el texto
  onEnviar?: (datos: DatosPresupuesto) => void | Promise<void> // filas+totales+mensaje
}

const hoyISO = () => new Date().toISOString().slice(0, 10)
const fechaLarga = (iso: string) => {
  if (!iso) return ''
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

export default function PresupuestoMultas({
  dominio, cotizacion, configInicial, clienteNombre, onEnviarWhatsapp, onEnviar,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fontsReady, setFontsReady] = useState(false)

  const [config, setConfig] = useState<ConfigPresupuesto>({
    ...CONFIG_PRESUPUESTO_DEFAULT,
    ...configInicial,
  })
  const [meta, setMeta] = useState({
    fecha:   hoyISO(),
    cliente: clienteNombre ?? '',
    plazo:   '72 hs hábiles promedio',
    validez: 5,
  })

  // Una fila con todas las trabajables de PBA. resol arranca como sugerencia.
  const [filas, setFilas] = useState<FilaPresupuesto[]>([{
    jur:   'Pag. Provincia de Buenos Aires',
    cant:  cotizacion.cantidadTrabajable,
    deuda: cotizacion.importeTotalDeuda,
    resol: Math.round(cotizacion.importeTotalDeuda * CONFIG_PRESUPUESTO_DEFAULT.transfPct / 100),
  }])

  const totales = useMemo(() => calcularPresupuesto(filas, config), [filas, config])
  const mensaje = useMemo(
    () => textoWhatsappPresupuesto({ totales, dominio, plazo: meta.plazo, validez: meta.validez }),
    [totales, dominio, meta.plazo, meta.validez],
  )

  // Asegurar fuentes de marca antes del primer dibujo (evita layout con fallback).
  useEffect(() => {
    let vivo = true
    const fuentes = [
      "800 40px Syne",
      "700 25px 'DM Sans'",
      "700 40px 'JetBrains Mono'",
    ]
    Promise.all(fuentes.map(f => (document as any).fonts?.load(f).catch(() => null)))
      .then(() => (document as any).fonts?.ready)
      .then(() => { if (vivo) setFontsReady(true) })
      .catch(() => { if (vivo) setFontsReady(true) })
    return () => { vivo = false }
  }, [])

  // Redibujar cuando cambia cualquier dato.
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    dibujarPresupuesto(cv, {
      filas, totales, config,
      meta: { patente: dominio.toUpperCase(), fecha: fechaLarga(meta.fecha), cliente: meta.cliente, plazo: meta.plazo, validez: meta.validez },
    })
  }, [filas, totales, config, meta, dominio, fontsReady])

  const setCfg = (patch: Partial<ConfigPresupuesto>) => setConfig(c => ({ ...c, ...patch }))
  const setFila = (patch: Partial<FilaPresupuesto>) => setFilas(([f]) => [{ ...f, ...patch }])

  // ─── ACCIONES ──────────────────────────────────────────────────────────────

  const descargarPNG = () => {
    canvasRef.current?.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Presupuesto-GestoriaPaz-${dominio.toUpperCase()}.png`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Imagen descargada')
    }, 'image/png')
  }

  const descargarPDF = () => {
    const cv = canvasRef.current
    if (!cv) return
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [cv.width, cv.height] })
    pdf.addImage(cv.toDataURL('image/png'), 'PNG', 0, 0, cv.width, cv.height)
    pdf.save(`Presupuesto-GestoriaPaz-${dominio.toUpperCase()}.pdf`)
    toast.success('PDF descargado')
  }

  const copiarWhatsapp = async () => {
    try {
      await navigator.clipboard.writeText(mensaje)
      toast.success('Texto copiado — pegalo en WhatsApp')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  // ─── UI ──────────────────────────────────────────────────────────────────────

  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#555', display: 'block', marginBottom: 4 }
  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1.5px solid #d8d8d8', borderRadius: 9, fontSize: 14 }
  const chk: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }
  const btn = (bg: string, color: string): React.CSSProperties => ({ width: '100%', padding: 12, border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13.5, background: bg, color })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 24, alignItems: 'start' }}>
      {/* ── CONTROLES ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <label style={lbl}>Cliente (opcional)</label>
          <input style={inp} value={meta.cliente} placeholder="Nombre y apellido"
            onChange={e => setMeta(m => ({ ...m, cliente: e.target.value }))} />
        </div>

        <fieldset style={{ border: 'none', padding: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: NARANJA, marginBottom: 10 }}>Transferencia · "Queda en"</div>
          <label style={chk}>
            <input type="checkbox" checked={config.transfAuto} onChange={e => setCfg({ transfAuto: e.target.checked })} style={{ accentColor: NARANJA }} />
            Calcular automático por % de la deuda
          </label>
          {config.transfAuto ? (
            <div style={{ marginTop: 10 }}>
              <label style={lbl}>El cliente abona el ___ % de la deuda</label>
              <input style={inp} type="number" value={config.transfPct} min={0} max={100} step={0.5}
                onChange={e => setCfg({ transfPct: parseFloat(e.target.value) || 0 })} />
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              <label style={lbl}>Queda en (honorario)</label>
              <input style={inp} type="number" value={filas[0].resol}
                onChange={e => setFila({ resol: parseFloat(e.target.value) || 0 })} />
            </div>
          )}
        </fieldset>

        <fieldset style={{ border: 'none', padding: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: NARANJA, marginBottom: 10 }}>SUATS</div>
          <label style={chk}>
            <input type="checkbox" checked={config.suatsOn} onChange={e => setCfg({ suatsOn: e.target.checked })} style={{ accentColor: NARANJA }} />
            Incluir SUATS en el total
          </label>
          {config.suatsOn && (
            <div style={{ marginTop: 10 }}>
              <label style={lbl}>Monto SUATS</label>
              <input style={inp} type="number" value={config.suatsMonto} min={0} step={500}
                onChange={e => setCfg({ suatsMonto: parseFloat(e.target.value) || 0 })} />
            </div>
          )}
        </fieldset>

        <fieldset style={{ border: 'none', padding: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: NARANJA, marginBottom: 10 }}>Efectivo</div>
          <label style={lbl}>Descuento en efectivo (%)</label>
          <input style={inp} type="number" value={config.efvoPct} min={0} max={60} step={0.5}
            onChange={e => setCfg({ efvoPct: parseFloat(e.target.value) || 0 })} />
        </fieldset>

        <fieldset style={{ border: 'none', padding: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: NARANJA, marginBottom: 10 }}>Condiciones</div>
          <label style={chk}>
            <input type="checkbox" checked={config.mostrarCuotas} onChange={e => setCfg({ mostrarCuotas: e.target.checked })} style={{ accentColor: NARANJA }} />
            Ofrecer pago en cuotas
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <div><label style={lbl}>Plazo del informe</label>
              <input style={inp} value={meta.plazo} onChange={e => setMeta(m => ({ ...m, plazo: e.target.value }))} /></div>
            <div><label style={lbl}>Validez (días)</label>
              <input style={inp} type="number" value={meta.validez} min={1} max={30}
                onChange={e => setMeta(m => ({ ...m, validez: parseInt(e.target.value) || 5 }))} /></div>
          </div>
        </fieldset>

        {cotizacion.cantidadExcluida > 0 && (
          <p style={{ fontSize: 11.5, color: '#8A8A8A', lineHeight: 1.5 }}>
            {cotizacion.cantidadExcluida} acta(s) excluida(s) del presupuesto (sentencia, descargo en curso o sin DI).
          </p>
        )}

        <div style={{ display: 'grid', gap: 9, position: 'sticky', bottom: 0, background: '#fff', paddingTop: 12 }}>
          <button style={btn(NARANJA, '#121212')} onClick={descargarPDF}>Descargar PDF</button>
          <button style={btn('#EAEAEA', '#121212')} onClick={descargarPNG}>Descargar imagen</button>
          <button style={btn('#121212', '#fff')} onClick={copiarWhatsapp}>Copiar texto para WhatsApp</button>
          {(onEnviar || onEnviarWhatsapp) && (
            <button
              style={btn('#0f7d3b', '#fff')}
              onClick={() => {
                onEnviarWhatsapp?.(mensaje)
                onEnviar?.({ filas, totales, mensajeWhatsapp: mensaje })
              }}
            >
              Enviar por WhatsApp
            </button>
          )}
        </div>
      </div>

      {/* ── VISTA PREVIA ── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#8A8A8A' }}>Vista previa</span>
        <canvas ref={canvasRef} style={{ width: '100%', maxWidth: 400, height: 'auto', borderRadius: 8, boxShadow: '0 18px 50px rgba(18,18,18,.18)', background: '#fff' }} />
      </div>
    </div>
  )
}