// Generador de reportes mensuales PDF para Gestoría Paz
// Diseño ejecutivo: portada naranja/negro + secciones con datos reales

import type { Tramite, Cliente } from '@/types'
import { TIPO_TRAMITE_LABELS, ESTADO_TRAMITE_LABELS } from '@/types'
import type { IngresoMes, TipoCount, TopCliente } from '@/lib/firestore/dashboard'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface DatosReporteMensual {
  mes:            number          // 0-11
  anio:           number
  tramites:       Tramite[]
  clientes:       Cliente[]
  ingresosMes:    IngresoMes[]    // últimos 6 meses para el gráfico
  tiposTramite:   TipoCount[]
  topClientes:    TopCliente[]
  // Datos de la gestoría (desde configuracion.ts)
  gestoriaNombre:     string
  gestoriaSubtitulo?: string      // ej: 'Mandataria del Automotor'
  gestoriaLocalidad?: string
  gestoriaTelefono?:  string
  gestoriaEmail?:     string
  gestoriaWeb?:       string
  colorPrimario?:     string
  logoUrl?:           string | null
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const NARANJA = [212, 98, 26]  as [number,number,number]
const NEGRO   = [26,  26, 26]  as [number,number,number]
const BLANCO  = [255,255,255]  as [number,number,number]
const GRIS1   = [99,  99, 99]  as [number,number,number]
const GRIS2   = [240,240,240]  as [number,number,number]
const GRIS3   = [249,249,249]  as [number,number,number]
const VERDE   = [5,  150,105]  as [number,number,number]
const ROJO    = [220, 38, 38]  as [number,number,number]
const AZUL    = [37, 99, 235]  as [number,number,number]

const MESES_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

function fp(n: number): string {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
}

function pct(a: number, b: number): string {
  if (!b) return '0%'
  return `${Math.round((a / b) * 100)}%`
}

// ─── GENERADOR ────────────────────────────────────────────────────────────────

export async function generarReporteMensual(
  datos: DatosReporteMensual
): Promise<{ blob: Blob; nombre: string }> {

  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210
  const H = 297
  const mg = 16    // margen
  const col2 = W / 2
  let y = 0

  const mes  = MESES_ES[datos.mes]
  const anio = datos.anio
  const titulo = `Reporte ${mes} ${anio}`

  // Branding dinámico del tenant
  const hexToRgb = (hex: string): [number,number,number] => {
    const h = hex.replace('#', '')
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
  }
  const COLOR_PRIMARIO: [number,number,number] = datos.colorPrimario
    ? hexToRgb(datos.colorPrimario) : NARANJA

  // ── HELPERS INTERNOS ──────────────────────────────────────────────────────

  const txt = (
    texto: string, x: number, yy: number,
    { size = 9, bold = false, color = NEGRO, align = 'left' as 'left'|'center'|'right' } = {}
  ) => {
    doc.setFontSize(size)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(color[0], color[1], color[2])
    doc.text(texto, x, yy, { align })
  }

  const box = (
    x: number, yy: number, w: number, h: number,
    fill: [number,number,number], stroke?: [number,number,number], radio = 0
  ) => {
    doc.setFillColor(fill[0], fill[1], fill[2])
    if (stroke) {
      doc.setDrawColor(stroke[0], stroke[1], stroke[2])
      doc.setLineWidth(0.3)
    }
    if (radio > 0) {
      doc.roundedRect(x, yy, w, h, radio, radio, stroke ? 'FD' : 'F')
    } else {
      doc.rect(x, yy, w, h, stroke ? 'FD' : 'F')
    }
  }

  const linea = (yy: number, color = GRIS2, grosor = 0.3) => {
    doc.setDrawColor(color[0], color[1], color[2])
    doc.setLineWidth(grosor)
    doc.line(mg, yy, W - mg, yy)
  }

  const seccion = (titulo_sec: string, yy: number): number => {
    txt(titulo_sec, mg, yy, { size: 7, bold: true, color: NARANJA })
    linea(yy + 2, NARANJA, 0.6)
    return yy + 8
  }

  const kpiBox = (
    x: number, yy: number, w: number,
    label: string, valor: string, sub: string,
    color: [number,number,number]
  ) => {
    box(x, yy, w, 22, GRIS3, GRIS2, 2)
    doc.setFillColor(color[0], color[1], color[2])
    doc.roundedRect(x, yy, 3, 22, 1, 1, 'F')
    txt(label.toUpperCase(), x + 6, yy + 6, { size: 6, bold: true, color: GRIS1 })
    txt(valor, x + 6, yy + 13, { size: 13, bold: true, color: NEGRO })
    txt(sub, x + 6, yy + 18.5, { size: 7, color: GRIS1 })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PÁGINA 1 — PORTADA
  // ══════════════════════════════════════════════════════════════════════════

  // Fondo negro superior
  box(0, 0, W, 80, NEGRO)

  // Banda naranja decorativa
  box(0, 75, W, 6, NARANJA)

  // Logo / iniciales
  try {
    const logoUrl = datos.logoUrl ?? `${window.location.origin}/logo-gp-200.jpg`
    const resp = await fetch(logoUrl)
    const blob = await resp.blob()
    const b64 = await new Promise<string>(res => {
      const reader = new FileReader()
      reader.onload = () => res((reader.result as string).split(',')[1])
      reader.readAsDataURL(blob)
    })
    doc.addImage(`data:image/jpeg;base64,${b64}`, 'JPEG', mg, 12, 24, 24)
  } catch {
    box(mg, 12, 24, 24, COLOR_PRIMARIO, undefined, 4)
    txt(datos.gestoriaNombre.slice(0,2).toUpperCase(), mg + 12, 26, { size: 11, bold: true, color: BLANCO, align: 'center' })
  }

  txt(datos.gestoriaNombre.toUpperCase(), mg + 28, 20, { size: 14, bold: true, color: BLANCO })
  if (datos.gestoriaSubtitulo) {
    txt(datos.gestoriaSubtitulo, mg + 28, 26, { size: 8, color: [180,120,80] as any })
  }
  if (datos.gestoriaLocalidad) {
    txt(datos.gestoriaLocalidad, mg + 28, 31, { size: 7.5, color: [150,100,60] as any })
  }

  // Título del reporte
  txt('REPORTE MENSUAL', col2, 60, { size: 9, bold: true, color: COLOR_PRIMARIO, align: 'center' })
  txt(titulo.toUpperCase(), col2, 70, { size: 24, bold: true, color: BLANCO, align: 'center' })

  y = 90

  // ── MÉTRICAS CLAVE DEL MES ────────────────────────────────────────────────

  // Calcular métricas del mes seleccionado
  const inicioMes = new Date(anio, datos.mes, 1)
  const finMes    = new Date(anio, datos.mes + 1, 0, 23, 59, 59)

  const tramitesMes = datos.tramites.filter(t => {
    const d = t.creadoEn?.toDate?.()
    return d && d >= inicioMes && d <= finMes
  })

  const cobradosMes = datos.tramites.filter(t => {
    const d = t.fechaPago?.toDate?.()
    return t.pagado && d && d >= inicioMes && d <= finMes
  })

  const ingresosTotalMes = cobradosMes.reduce((a, t) => a + (t.honorarios ?? 0), 0)
  const pendientesMes    = tramitesMes.filter(t => !['entregado','cancelado'].includes(t.estado))
  const entregadosMes    = tramitesMes.filter(t => t.estado === 'entregado')

  // Mes anterior para comparación
  const inicioAnt  = new Date(anio, datos.mes - 1, 1)
  const finAnt     = new Date(anio, datos.mes, 0, 23, 59, 59)
  const tramitesAnt = datos.tramites.filter(t => {
    const d = t.creadoEn?.toDate?.()
    return d && d >= inicioAnt && d <= finAnt
  })
  const cobradosAnt   = datos.tramites.filter(t => {
    const d = t.fechaPago?.toDate?.()
    return t.pagado && d && d >= inicioAnt && d <= finAnt
  })
  const ingresosAnt = cobradosAnt.reduce((a, t) => a + (t.honorarios ?? 0), 0)
  const varIngresos = ingresosAnt > 0
    ? `${ingresosTotalMes >= ingresosAnt ? '+' : ''}${Math.round(((ingresosTotalMes - ingresosAnt) / ingresosAnt) * 100)}% vs mes ant.`
    : 'sin dato anterior'

  // 4 KPIs en fila
  const kpiW = (W - mg * 2 - 9) / 4
  ;[
    { label: 'Trámites nuevos', valor: String(tramitesMes.length), sub: `${entregadosMes.length} entregados`, color: NARANJA },
    { label: 'Ingresos cobrados', valor: fp(ingresosTotalMes), sub: varIngresos, color: VERDE },
    { label: 'Activos al cierre', valor: String(pendientesMes.length), sub: 'en proceso', color: AZUL },
    { label: 'Clientes activos', valor: String([...new Set(tramitesMes.map(t => t.clienteId))].length), sub: 'con trámites', color: [99,99,200] as any },
  ].forEach((k, i) => {
    kpiBox(mg + i * (kpiW + 3), y, kpiW, k.label, k.valor, k.sub, k.color)
  })

  y += 30

  // ── EVOLUCIÓN DE INGRESOS (gráfico de barras manual) ─────────────────────

  y = seccion('EVOLUCIÓN DE INGRESOS — ÚLTIMOS 6 MESES', y)

  const graphH = 42
  const graphW = W - mg * 2
  const barW   = graphW / datos.ingresosMes.length - 4
  const maxVal = Math.max(...datos.ingresosMes.map(m => m.ingresos), 1)

  datos.ingresosMes.forEach((m, i) => {
    const barH   = maxVal > 0 ? (m.ingresos / maxVal) * graphH : 2
    const bx     = mg + i * (graphW / datos.ingresosMes.length)
    const esCurrent = m.mes.startsWith(MESES_ES[datos.mes].slice(0, 3))
    const barColor = esCurrent ? NARANJA : GRIS2

    box(bx, y + graphH - barH, barW, barH, barColor)
    txt(m.mes, bx + barW / 2, y + graphH + 5, { size: 6.5, color: GRIS1, align: 'center' })
    if (m.ingresos > 0) {
      const label = m.ingresos >= 1000
        ? `$${(m.ingresos / 1000).toFixed(0)}k`
        : `$${m.ingresos}`
      txt(label, bx + barW / 2, y + graphH - barH - 2, { size: 6, bold: true, color: esCurrent ? NARANJA : GRIS1, align: 'center' })
    }
  })

  y += graphH + 12

  // ── TRÁMITES POR TIPO ─────────────────────────────────────────────────────

  y = seccion('DISTRIBUCIÓN POR TIPO DE TRÁMITE', y)

  const top5 = datos.tiposTramite.slice(0, 5)
  const maxCant = Math.max(...top5.map(t => t.cantidad), 1)
  const barW2 = (W - mg * 2 - 70)

  top5.forEach((t, i) => {
    const ry = y + i * 10
    txt(t.label, mg, ry + 5, { size: 8, color: NEGRO })
    const fill = (t.cantidad / maxCant) * barW2
    box(mg + 65, ry, barW2, 7, GRIS2, undefined, 1)
    box(mg + 65, ry, Math.max(fill, 3), 7, NARANJA, undefined, 1)
    txt(String(t.cantidad), mg + 65 + barW2 + 4, ry + 5, { size: 7.5, bold: true, color: NEGRO })
    txt(fp(t.ingresos), W - mg, ry + 5, { size: 7.5, color: GRIS1, align: 'right' })
  })

  y += top5.length * 10 + 6

  // ══════════════════════════════════════════════════════════════════════════
  // PÁGINA 2
  // ══════════════════════════════════════════════════════════════════════════
  doc.addPage()
  y = mg + 4

  // Header de continuación
  box(0, 0, W, 12, NEGRO)
  txt(`${titulo} — continuación`, mg, 8, { size: 8, bold: true, color: NARANJA })
  txt(datos.gestoriaNombre, W - mg, 8, { size: 8, color: [180,120,80] as any, align: 'right' })
  y = 20

  // ── TOP CLIENTES ──────────────────────────────────────────────────────────

  y = seccion('TOP CLIENTES DEL MES', y)

  // Cabecera
  box(mg, y, W - mg * 2, 7, NEGRO, undefined, 1.5)
  ;[
    ['CLIENTE', mg + 4],
    ['TRÁMITES', mg + 90],
    ['INGRESOS', W - mg - 30],
  ].forEach(([label, x]) => txt(String(label), Number(x), y + 5, { size: 6.5, bold: true, color: BLANCO }))
  y += 9

  datos.topClientes.forEach((c, i) => {
    const bg = i % 2 === 0 ? GRIS3 : BLANCO
    box(mg, y, W - mg * 2, 8, bg)
    txt(`${i + 1}. ${c.nombre}`, mg + 4, y + 5.5, { size: 8, color: NEGRO })
    txt(String(c.tramites), mg + 90, y + 5.5, { size: 8, color: NEGRO })
    txt(c.ingresos > 0 ? fp(c.ingresos) : '—', W - mg - 4, y + 5.5, { size: 8, bold: true, color: VERDE, align: 'right' })
    y += 8
  })

  y += 8

  // ── DETALLE DE TRÁMITES DEL MES ───────────────────────────────────────────

  y = seccion(`TRÁMITES CREADOS EN ${mes.toUpperCase()} ${anio}`, y)

  // Cabecera tabla
  box(mg, y, W - mg * 2, 7, NEGRO, undefined, 1.5)
  ;[
    ['NÚMERO', mg + 4],
    ['TIPO', mg + 32],
    ['PATENTE', mg + 88],
    ['ESTADO', mg + 110],
    ['HONORARIOS', W - mg - 30],
  ].forEach(([label, x]) => txt(String(label), Number(x), y + 5, { size: 6.5, bold: true, color: BLANCO }))
  y += 9

  const tramitesMesShow = tramitesMes.slice(0, 25)
  tramitesMesShow.forEach((t, i) => {
    if (y > H - 30) {
      doc.addPage()
      y = mg + 10
      // mini header
      box(0, 0, W, 10, NEGRO)
      txt(`${titulo} — Trámites (cont.)`, mg, 7, { size: 7.5, bold: true, color: NARANJA })
      y = 14
    }
    const bg = i % 2 === 0 ? GRIS3 : BLANCO
    box(mg, y, W - mg * 2, 7, bg)

    const estadoColor =
      t.estado === 'entregado'  ? VERDE  :
      t.estado === 'cancelado'  ? GRIS1  :
      t.estado === 'documentacion_requerida' ? ROJO : NEGRO

    txt(t.numero ?? '—',            mg + 4,      y + 5, { size: 7, color: NEGRO })
    txt(TIPO_TRAMITE_LABELS[t.tipo], mg + 32,     y + 5, { size: 7, color: NEGRO })
    txt(t.patente ?? '—',           mg + 88,     y + 5, { size: 7, color: NEGRO })
    txt(ESTADO_TRAMITE_LABELS[t.estado], mg + 110, y + 5, { size: 6.5, color: estadoColor })
    txt(t.honorarios > 0 ? fp(t.honorarios) : '—', W - mg - 4, y + 5,
        { size: 7, bold: t.pagado, color: t.pagado ? VERDE : NEGRO, align: 'right' })
    y += 7
  })

  if (tramitesMes.length > 25) {
    txt(`... y ${tramitesMes.length - 25} trámites más`, mg, y + 5, { size: 7.5, color: GRIS1 })
    y += 8
  }

  // ── RESUMEN FINANCIERO ────────────────────────────────────────────────────

  y += 6
  linea(y, GRIS2)
  y += 8

  y = seccion('RESUMEN FINANCIERO DEL MES', y)

  const totalHonorarios = tramitesMes.reduce((a, t) => a + (t.honorarios ?? 0), 0)
  const totalCobrado    = cobradosMes.reduce((a, t) => a + (t.honorarios ?? 0), 0)
  const totalPendiente  = tramitesMes.filter(t => !t.pagado && t.honorarios > 0)
                                     .reduce((a, t) => a + (t.honorarios ?? 0), 0)

  ;[
    ['Total honorarios facturados', fp(totalHonorarios), NEGRO],
    ['Total cobrado en el mes',     fp(totalCobrado),    VERDE],
    ['Pendiente de cobro',          fp(totalPendiente),  ROJO],
    ['% cobrado sobre facturado',   pct(totalCobrado, totalHonorarios), NARANJA],
  ].forEach(([label, valor, color]) => {
    txt(String(label), mg, y, { size: 8.5, color: GRIS1 })
    txt(String(valor), W - mg, y, { size: 9, bold: true, color: color as [number,number,number], align: 'right' })
    linea(y + 2, GRIS2, 0.2)
    y += 8
  })

  // ── FOOTER ÚLTIMA PÁGINA ──────────────────────────────────────────────────
  const numPags = (doc as any).getNumberOfPages?.() ?? 1
  for (let p = 1; p <= numPags; p++) {
    doc.setPage(p)
    box(0, H - 14, W, 14, NEGRO)
    const footerParts = [
      datos.gestoriaNombre,
      datos.gestoriaLocalidad,
      datos.gestoriaTelefono,
      datos.gestoriaEmail,
    ].filter(Boolean).join('  ·  ')
    txt(footerParts, col2, H - 8, { size: 7, color: [180,120,80] as any, align: 'center' })
    txt(`Generado el ${new Date().toLocaleDateString('es-AR')}  ·  Página ${p}`,
        col2, H - 4, { size: 6.5, color: [130,80,40] as any, align: 'center' })
  }

  const blob   = doc.output('blob')
  const nombre = `Reporte_${datos.gestoriaNombre.replace(/\s+/g,'_')}_${mes}_${anio}.pdf`
  return { blob, nombre }
}