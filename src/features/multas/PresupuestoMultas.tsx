// src/features/multas/PresupuestoMultas.tsx
import { useState, useEffect, useRef, useMemo } from 'react'
import { jsPDF } from 'jspdf'
import toast from 'react-hot-toast'
import {
  calcularPresupuesto, textoWhatsappPresupuesto, money,
  CONFIG_PRESUPUESTO_DEFAULT,
  type ConfigPresupuesto, type FilaPresupuesto,
} from '@/lib/calcularPresupuesto'
import { dibujarPresupuesto } from '@/lib/renderPresupuestoCanvas'
import type { CotizacionMultas, Acta, CotizacionCABA } from '@/infraccion_types'
import type { DatosPresupuesto } from '@/lib/armarDatosPresupuesto'
const NARANJA = '#F28F07'
interface Props {
  dominio:        string
  cotizacion:     CotizacionMultas
  cotizacionCABA?: CotizacionCABA   // ← NUEVO: opcional
  configInicial?: Partial<ConfigPresupuesto>
  clienteNombre?: string
  onEnviarWhatsapp?: (mensaje: string) => void
  onEnviar?: (datos: DatosPresupuesto) => void | Promise<void>
}
const hoyISO = () => new Date().toISOString().slice(0, 10)
const fechaLarga = (iso: string) => {
  if (!iso) return ''
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}
// ─── ESTILOS (más grandes y espaciados para edición cómoda) ──────────────────
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }
const inp: React.CSSProperties = { width: '100%', padding: '11px 13px', border: '1.5px solid #d8d8d8', borderRadius: 10, fontSize: 15, background: '#fff' }
const chk: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, fontWeight: 600, fontSize: 14, cursor: 'pointer' }
const secTitulo: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: NARANJA, marginBottom: 12 }
const card: React.CSSProperties = { background: '#fafafa', border: '1.5px solid #e4e4e4', borderRadius: 14, padding: 16, marginBottom: 14, position: 'relative' }
const chip: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, padding: '6px 11px', borderRadius: 999, background: '#121212', color: NARANJA }
const btn = (bg: string, color: string): React.CSSProperties => ({
  padding: '12px 12px', border: 'none', borderRadius: 10, cursor: 'pointer',
  fontWeight: 700, fontSize: 13.5, background: bg, color, width: '100%',
})
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
      fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap',
      background: active ? NARANJA : '#EAEAEA', color: active ? '#121212' : '#555',
    }}>{children}</button>
  )
}
function Badge({ children, color }: { children: React.ReactNode; color?: 'red' | 'green' | 'gray' }) {
  const bg = color === 'red' ? '#fdecec' : color === 'green' ? '#e8f6e8' : '#efefef'
  const fg = color === 'red' ? '#c0392b' : color === 'green' ? '#1e7e34' : '#666'
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: bg, color: fg }}>
      {children}
    </span>
  )
}
function ActaCard({ acta, excluida }: { acta: Acta; excluida?: boolean }) {
  return (
    <div style={{
      border: `1.5px solid ${excluida ? '#f1cfcf' : '#cfe6cf'}`,
      background: excluida ? '#fdf8f8' : '#f8fcf8',
      borderRadius: 12, padding: '10px 12px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 13 }}>{acta.nroActa}</span>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{money(acta.importeTotal)}</span>
      </div>
      <div style={{ fontSize: 12, color: '#555', marginTop: 4, lineHeight: 1.45 }}>
        {acta.detalles[0]?.descripcion ?? 'Infracción'} · {acta.autoridadAplicacion}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
        {excluida
          ? <Badge color="red">✕ {acta.clasificacion.motivoExclusion ?? 'Excluida'}</Badge>
          : <Badge color="green">✓ Trabajable</Badge>}
        <Badge color="gray">{acta.estadoCausa || '—'}</Badge>
        {acta.estaVencida && <Badge color="gray">Vencida</Badge>}
        {acta.conApremio && <Badge color="red">En apremio</Badge>}
      </div>
    </div>
  )
}
// ─── COMPONENTE ─────────────────────────────────────────────────────────────
export default function PresupuestoMultas({
  dominio, cotizacion, cotizacionCABA, configInicial, clienteNombre, onEnviarWhatsapp, onEnviar,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fontsReady, setFontsReady] = useState(false)
  const [tab, setTab] = useState<'preview' | 'ajustes' | 'actas'>('preview')
  const [config, setConfig] = useState<ConfigPresupuesto>({ ...CONFIG_PRESUPUESTO_DEFAULT, ...configInicial })
  const [meta, setMeta] = useState({ fecha: hoyISO(), cliente: clienteNombre ?? '', plazo: '72 hs hábiles promedio', validez: 5 })
  const [defaults, setDefaults] = useState({
    transfModo: 'pct' as 'manual' | 'pct', transfPct: 40,
    efvoModo: 'pct' as 'pct' | 'manual', efvoPct: 35,
    recargoChica: 15, recargoLarga: 35,
  })
  const nuevaFila = (): FilaPresupuesto => ({
    jur: '', cant: 1, deuda: 0, resol: 0, efvoMonto: 0,
    transfModo: defaults.transfModo, transfPct: defaults.transfPct,
    efvoModo: defaults.efvoModo, efvoPct: defaults.efvoPct,
    recargoChica: defaults.recargoChica, recargoLarga: defaults.recargoLarga,
  })
  const [filas, setFilas] = useState<FilaPresupuesto[]>(() => {
    const filaPBA: FilaPresupuesto = {
      jur: 'Pag. Provincia de Buenos Aires',
      cant: cotizacion.cantidadTrabajable,
      deuda: cotizacion.importeTotalDeuda,
      resol: Math.round(cotizacion.importeTotalDeuda * 40 / 100),
      transfModo: 'pct', transfPct: 40,
      efvoModo: 'pct', efvoPct: 35, efvoMonto: 0,
      recargoChica: 15, recargoLarga: 35,
    }
    const filasIniciales: FilaPresupuesto[] = [filaPBA]

    // Agregar fila CABA si viene cotizada (valores ya calculados por la extensión)
    if (cotizacionCABA && cotizacionCABA.actas.length > 0) {
      filasIniciales.push({
        jur: 'CABA',
        cant: cotizacionCABA.cantidad,
        deuda: cotizacionCABA.deudaTotal,
        resol: Math.round(cotizacionCABA.montoACobrarAlCliente),
        transfModo: 'manual',
        transfPct: 0,
        efvoModo: 'manual',
        efvoPct: 0,
        efvoMonto: Math.round(cotizacionCABA.montoACobrarAlCliente),
        recargoChica: 15,
        recargoLarga: 35,
      })
    }

    return filasIniciales
  })
  const totales = useMemo(() => calcularPresupuesto(filas, config), [filas, config])
  const mensaje = useMemo(
    () => textoWhatsappPresupuesto({ totales, dominio, filas, plazo: meta.plazo, validez: meta.validez }),
    [totales, dominio, filas, meta.plazo, meta.validez],
  )
  useEffect(() => {
    let vivo = true
    const fuentes = ["800 40px Syne", "700 25px 'DM Sans'", "700 40px 'JetBrains Mono'"]
    Promise.all(fuentes.map(f => (document as any).fonts?.load(f).catch(() => null)))
      .then(() => (document as any).fonts?.ready)
      .then(() => { if (vivo) setFontsReady(true) })
      .catch(() => { if (vivo) setFontsReady(true) })
    return () => { vivo = false }
  }, [])
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    dibujarPresupuesto(cv, {
      filas, totales, config,
      meta: { patente: dominio.toUpperCase(), fecha: fechaLarga(meta.fecha), cliente: meta.cliente, plazo: meta.plazo, validez: meta.validez },
    })
  }, [filas, totales, config, meta, dominio, fontsReady])

  // ─── Listener para captura CABA desde la extensión ─────────────────────────
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'GP_CABA_CAPTURADO') return
      const datos: CotizacionCABA = event.data.payload
      console.log('[PresupuestoMultas] CABA capturado:', datos)

      setFilas(fs => {
        const idx = fs.findIndex(f => f.jur === 'CABA')
        const filaCABA: FilaPresupuesto = {
          jur: 'CABA',
          cant: datos.cantidad,
          deuda: datos.deudaTotal,
          resol: Math.round(datos.montoACobrarAlCliente),
          transfModo: 'manual',
          transfPct: 0,
          efvoModo: 'manual',
          efvoPct: 0,
          efvoMonto: Math.round(datos.montoACobrarAlCliente),
          recargoChica: 15,
          recargoLarga: 35,
        }
        if (idx >= 0) {
          return fs.map((f, i) => i === idx ? filaCABA : f)
        }
        return [...fs, filaCABA]
      })

      toast.success(`✅ CABA cotizada: ${money(datos.deudaTotal)} (${datos.tienePuntosRojos ? 'con puntos rojos' : 'sin puntos rojos'})`)
    }
        window.addEventListener('message', handler)
    // Pedir a la extensión la última captura CABA pendiente (presupuesto cerrado).
    window.postMessage({ source: 'GP_PEDIR_CABA' }, window.location.origin)
    return () => window.removeEventListener('message', handler)
  }, [])

  const setCfg = (p: Partial<ConfigPresupuesto>) => setConfig(c => ({ ...c, ...p }))
  const setFila = (i: number, p: Partial<FilaPresupuesto>) => setFilas(fs => fs.map((f, j) => (j === i ? { ...f, ...p } : f)))
  const agregar = () => setFilas(fs => [...fs, nuevaFila()])
  const quitar = (i: number) => setFilas(fs => fs.filter((_, j) => j !== i))
  const descargarPNG = () => {
    canvasRef.current?.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `Presupuesto-GestoriaPaz-${dominio.toUpperCase()}.png`; a.click()
      URL.revokeObjectURL(url); toast.success('Imagen descargada')
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
    try { await navigator.clipboard.writeText(mensaje); toast.success('Texto copiado — pegalo en WhatsApp') }
    catch { toast.error('No se pudo copiar') }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── PESTAÑAS ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <TabBtn active={tab === 'preview'} onClick={() => setTab('preview')}>🖼️ Vista previa</TabBtn>
        <TabBtn active={tab === 'ajustes'} onClick={() => setTab('ajustes')}>⚙️ Ajustes</TabBtn>
        <TabBtn active={tab === 'actas'} onClick={() => setTab('actas')}>
          📋 Detalle de actas ({cotizacion.cantidadTrabajable} trab. / {cotizacion.cantidadExcluida} excl.)
        </TabBtn>
      </div>
      {/* ── TAB: VISTA PREVIA (canvas grande; siempre montado) ── */}
      <div style={{ display: tab === 'preview' ? 'block' : 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'center', background: '#f2f2f2', borderRadius: 12, padding: 18 }}>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', maxWidth: 760, height: 'auto', borderRadius: 8, boxShadow: '0 18px 50px rgba(18,18,18,.18)', background: '#fff' }}
          />
        </div>
      </div>
      {/* ─ TAB: AJUSTES (layout vertical y espacioso) ── */}
      {tab === 'ajustes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 780 }}>
          {/* Cliente */}
          <div>
            <label style={lbl}>Cliente (opcional)</label>
            <input style={inp} value={meta.cliente} placeholder="Nombre y apellido"
              onChange={e => setMeta(m => ({ ...m, cliente: e.target.value }))} />
          </div>
          {/* Jurisdicciones */}
          <section>
            <div style={secTitulo}>Jurisdicciones</div>
            {filas.map((f, i) => (
              <div key={i} style={card}>
                {filas.length > 1 && (
                  <button onClick={() => quitar(i)}
                    style={{ position: 'absolute', top: 12, right: 12, width: 26, height: 26, borderRadius: 8, border: 'none', background: '#EAEAEA', color: '#777', cursor: 'pointer', fontSize: 15 }}>
                    ×
                  </button>
                )}
                <div style={{ fontSize: 11, fontWeight: 800, color: NARANJA, letterSpacing: 1.2, marginBottom: 10 }}>
                  JURISDICCIÓN {String(i + 1).padStart(2, '0')}
                </div>
                <input style={inp} value={f.jur} placeholder="Organismo / Jurisdicción"
                  onChange={e => setFila(i, { jur: e.target.value })} />
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginTop: 14 }}>
                  <div>
                    <label style={lbl}>Deuda total</label>
                    <input style={inp} type="number" value={f.deuda}
                      onChange={e => setFila(i, { deuda: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <label style={lbl}>Cant. actas</label>
                    <input style={inp} type="number" value={f.cant}
                      onChange={e => setFila(i, { cant: parseInt(e.target.value) || 0 })} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                  <div>
                    <label style={lbl}>Transferencia ("Queda en")</label>
                    <select style={inp} value={f.transfModo}
                      onChange={e => setFila(i, { transfModo: e.target.value as 'manual' | 'pct' })}>
                      <option value="pct">Automático por %</option>
                      <option value="manual">Manual</option>
                    </select>
                  </div>
                  {f.transfModo === 'pct' ? (
                    <div>
                      <label style={lbl}>% que abona el cliente</label>
                      <input style={inp} type="number" value={f.transfPct}
                        onChange={e => setFila(i, { transfPct: parseFloat(e.target.value) || 0 })} />
                    </div>
                  ) : (
                    <div>
                      <label style={lbl}>Queda en (monto)</label>
                      <input style={inp} type="number" value={f.resol}
                        onChange={e => setFila(i, { resol: parseFloat(e.target.value) || 0 })} />
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                  <div>
                    <label style={lbl}>Efectivo</label>
                    <select style={inp} value={f.efvoModo}
                      onChange={e => setFila(i, { efvoModo: e.target.value as 'pct' | 'manual' })}>
                      <option value="pct">Descuento %</option>
                      <option value="manual">Manual</option>
                    </select>
                  </div>
                  {f.efvoModo === 'pct' ? (
                    <div>
                      <label style={lbl}>Descuento (%)</label>
                      <input style={inp} type="number" value={f.efvoPct}
                        onChange={e => setFila(i, { efvoPct: parseFloat(e.target.value) || 0 })} />
                    </div>
                  ) : (
                    <div>
                      <label style={lbl}>Monto efectivo</label>
                      <input style={inp} type="number" value={f.efvoMonto ?? 0}
                        onChange={e => setFila(i, { efvoMonto: parseFloat(e.target.value) || 0 })} />
                    </div>
                  )}
                </div>
                {/* Resumen calculado (solo lectura) */}
                <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                  <span style={chip}>Transferencia: {money(totales.quedaFila[i] ?? 0)}</span>
                  <span style={chip}>Efectivo: {money(totales.efvoFila[i] ?? 0)}</span>
                </div>
              </div>
            ))}
            <button style={btn('#EAEAEA', '#121212')} onClick={agregar}>+ Agregar jurisdicción</button>
          </section>
          {/* SUATS */}
          <section style={card}>
            <div style={secTitulo}>SUATS</div>
            <label style={chk}>
              <input type="checkbox" checked={config.suatsOn} onChange={e => setCfg({ suatsOn: e.target.checked })} style={{ accentColor: NARANJA, width: 17, height: 17 }} />
              Incluir SUATS en el total
            </label>
            {config.suatsOn && (
              <div style={{ marginTop: 12, maxWidth: 280 }}>
                <label style={lbl}>Monto SUATS</label>
                <input style={inp} type="number" value={config.suatsMonto}
                  onChange={e => setCfg({ suatsMonto: parseFloat(e.target.value) || 0 })} />
              </div>
            )}
          </section>
          {/* Cuotas */}
          <section style={card}>
            <div style={secTitulo}>Financiación en cuotas</div>
            <label style={chk}>
              <input type="checkbox" checked={config.mostrarCuotas} onChange={e => setCfg({ mostrarCuotas: e.target.checked })} style={{ accentColor: NARANJA, width: 17, height: 17 }} />
              Ofrecer pago en cuotas
            </label>
            {config.mostrarCuotas && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <div>
                  <label style={lbl}>Cuotas cortas</label>
                  <input style={inp} type="number" value={config.nChica}
                    onChange={e => setCfg({ nChica: parseInt(e.target.value) || 3 })} />
                </div>
                <div>
                  <label style={lbl}>Cuotas largas</label>
                  <input style={inp} type="number" value={config.nLarga}
                    onChange={e => setCfg({ nLarga: parseInt(e.target.value) || 6 })} />
                </div>
              </div>
            )}
          </section>
          {/* Condiciones */}
          <section style={card}>
            <div style={secTitulo}>Condiciones</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Plazo del informe</label>
                <input style={inp} value={meta.plazo}
                  onChange={e => setMeta(m => ({ ...m, plazo: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Validez (días)</label>
                <input style={inp} type="number" value={meta.validez}
                  onChange={e => setMeta(m => ({ ...m, validez: parseInt(e.target.value) || 5 }))} />
              </div>
            </div>
          </section>
          {cotizacion.cantidadExcluida > 0 && (
            <p style={{ fontSize: 12, color: '#8A8A8A', lineHeight: 1.5 }}>
              {cotizacion.cantidadExcluida} acta(s) excluida(s) del presupuesto (sentencia, descargo en curso o sin DI).
              Ver pestaña "Detalle de actas".
            </p>
          )}
        </div>
      )}
      {/* ── TAB: DETALLE DE ACTAS ── */}
      {tab === 'actas' && (
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <Badge color="green">✓ {cotizacion.cantidadTrabajable} trabajable(s) · {money(cotizacion.importeTotalDeuda)}</Badge>
            <Badge color="red">✕ {cotizacion.cantidadExcluida} excluida(s)</Badge>
            <Badge color="gray">Honorarios: {money(cotizacion.honorariosGestoria)}</Badge>
          </div>
          <div style={secTitulo}>Trabajables (entran al presupuesto)</div>
          {cotizacion.actasTrabajables.length === 0 && (
            <p style={{ fontSize: 12.5, color: '#8A8A8A', marginBottom: 12 }}>No hay actas trabajables en esta consulta.</p>
          )}
          {cotizacion.actasTrabajables.map(a => <ActaCard key={a.id} acta={a} />)}
          <div style={{ ...secTitulo, marginTop: 16 }}>Excluidas (NO entran al presupuesto)</div>
          {cotizacion.actasExcluidas.length === 0 && (
            <p style={{ fontSize: 12.5, color: '#8A8A8A' }}>No hay actas excluidas.</p>
          )}
          {cotizacion.actasExcluidas.map(a => <ActaCard key={a.id} acta={a} excluida />)}

          {/* ─── NUEVO: Actas CABA ─── */}
          {cotizacionCABA && cotizacionCABA.actas.length > 0 && (
            <>
              <div style={{ ...secTitulo, marginTop: 24 }}>
                CABA — {cotizacionCABA.cantidad} acta(s)
                {cotizacionCABA.tienePuntosRojos && (
                  <Badge color="red"> Puntos Rojos (×2.25)</Badge>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#555', marginBottom: 12, lineHeight: 1.5 }}>
                Monto 1: {money(cotizacionCABA.monto1)}
                {cotizacionCABA.tienePuntosRojos && <> · Monto 2: {money(cotizacionCABA.monto2)}</>}
                <br />
                Deuda total: {money(cotizacionCABA.deudaTotal)} · Abona el {Math.round(cotizacionCABA.porcentajePagoCliente * 100)}%
              </div>
              {cotizacionCABA.actas.map(a => (
                <div key={a.id} style={{
                  border: '1.5px solid #cfe6cf',
                  background: '#f8fcf8',
                  borderRadius: 12, padding: '10px 12px', marginBottom: 8,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 13 }}>{a.nroActa}</span>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{money(a.importeBase)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
                    {a.esPuntosRojos && <Badge color="red">Puntos Rojos</Badge>}
                    <Badge color="green">CABA</Badge>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
      {/* ── BARRA DE ACCIONES (siempre visible) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, position: 'sticky', bottom: 0, background: '#fff', paddingTop: 10 }}>
        <button style={btn(NARANJA, '#121212')} onClick={descargarPDF}>Descargar PDF</button>
        <button style={btn('#EAEAEA', '#121212')} onClick={descargarPNG}>Descargar imagen</button>
        <button style={btn('#121212', '#fff')} onClick={copiarWhatsapp}>Copiar texto WA</button>
        {(onEnviar || onEnviarWhatsapp) && (
          <button style={btn('#0f7d3b', '#fff')} onClick={() => { onEnviarWhatsapp?.(mensaje); onEnviar?.({ filas, totales, mensajeWhatsapp: mensaje }) }}>
            Enviar por WhatsApp
          </button>
        )}
      </div>
    </div>
  )
}