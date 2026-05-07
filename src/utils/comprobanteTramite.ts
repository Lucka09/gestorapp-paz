// src/utils/comprobanteTramite.ts
// ─────────────────────────────────────────────────────────────────────────────
// Genera el comprobante PDF de un trámite individual para entregar al cliente.
//
// El comprobante muestra:
//   - Header con branding de la gestoría
//   - Datos del trámite (número, tipo, patente, estado, fechas)
//   - Datos del cliente y vehículo
//   - Historial de estados abreviado
//   - Datos de pago (si está pagado)
//   - Datos bancarios para transferencia (si está pendiente)
//   - Footer con datos de contacto
//   - QR opcional con la URL de seguimiento público
//
// Carga jsPDF de forma lazy para no impactar el bundle inicial.
// ─────────────────────────────────────────────────────────────────────────────

import type { Tramite, Cliente, Vehiculo } from '@/types'
import { TIPO_TRAMITE_LABELS, ESTADO_TRAMITE_LABELS } from '@/types'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface DatosComprobante {
  tramite:    Tramite
  cliente:    Cliente | null
  vehiculo:   Vehiculo | null
  // De configuracion.ts
  gestoriaNombre:    string
  gestoriaResponsable?: string
  gestoriaTelefono1: string
  gestoriaTelefono2?: string
  gestoriaEmail:     string
  gestoriaWeb?:      string
  gestoriaDireccion?: string
  gestoriaLocalidad?: string
  bancoCbu?:         string
  bancoAlias?:       string
  bancoTitular?:     string
  // Branding
  colorPrimario?:    string
  logoUrl?:          string | null
}

// ─── COLORES ──────────────────────────────────────────────────────────────────

type RGB = [number, number, number]
const BLANCO: RGB  = [255, 255, 255]
const NEGRO:  RGB  = [26,  26,  26 ]
const GRIS1:  RGB  = [99,  99,  99 ]
const GRIS2:  RGB  = [153, 153, 153]
const GRIS3:  RGB  = [240, 240, 240]
const VERDE:  RGB  = [5,   150, 105]
const ROJO:   RGB  = [185, 28,  28 ]
const AMBER:  RGB  = [180, 110, 0  ]

function hexToRGB(hex: string): RGB {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

// ─── HELPERS DE FORMATO ───────────────────────────────────────────────────────

function formatPesos(n: number): string {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
}

function formatFechaLarga(ts: any): string {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleDateString('es-AR', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
  } catch { return '—' }
}

function formatFechaCorta(ts: any): string {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleDateString('es-AR')
  } catch { return '—' }
}

function estadoColor(estado: string): RGB {
  const colores: Record<string, RGB> = {
    pendiente:               AMBER,
    en_proceso:              [29, 78, 216],
    documentacion_requerida: ROJO,
    en_organismo:            [194, 65, 12],
    listo_para_retirar:      VERDE,
    entregado:               VERDE,
    cancelado:               GRIS2,
  }
  return colores[estado] ?? NEGRO
}

function estadoBgHex(estado: string): RGB {
  const bgs: Record<string, RGB> = {
    pendiente:               [255, 251, 235],
    en_proceso:              [239, 246, 255],
    documentacion_requerida: [254, 242, 242],
    en_organismo:            [255, 247, 237],
    listo_para_retirar:      [236, 253, 245],
    entregado:               [236, 253, 245],
    cancelado:               [249, 250, 251],
  }
  return bgs[estado] ?? GRIS3
}

// ─── GENERADOR PRINCIPAL ──────────────────────────────────────────────────────

export async function generarComprobantePDF(
  datos: DatosComprobante
): Promise<{ blob: Blob; nombre: string }> {
  const { jsPDF } = await import('jspdf')

  const { tramite, cliente, vehiculo } = datos
  const NARANJA: RGB = hexToRGB(datos.colorPrimario ?? '#D4621A')

  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W      = 210
  const H      = 297
  const margin = 16
  const col2   = W / 2
  let   y      = 0

  // ── Helpers internos ──────────────────────────────────────────────────────

  const txt = (
    texto: string, x: number, yPos: number,
    opts: { size?: number; bold?: boolean; color?: RGB; align?: 'left' | 'center' | 'right' } = {}
  ) => {
    const { size = 9, bold = false, color = NEGRO, align = 'left' } = opts
    doc.setFontSize(size)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(color[0], color[1], color[2])
    doc.text(texto, x, yPos, { align })
  }

  const linea = (yPos: number, color: RGB = GRIS3, grosor = 0.3) => {
    doc.setDrawColor(color[0], color[1], color[2])
    doc.setLineWidth(grosor)
    doc.line(margin, yPos, W - margin, yPos)
  }

  const rect = (
    x: number, yPos: number, w: number, h: number,
    fill: RGB, radio = 1.5, tipo: 'F' | 'S' | 'FD' = 'F'
  ) => {
    doc.setFillColor(fill[0], fill[1], fill[2])
    doc.setDrawColor(fill[0], fill[1], fill[2])
    doc.roundedRect(x, yPos, w, h, radio, radio, tipo)
  }

  const labelValor = (label: string, valor: string, x: number, yPos: number, ancho = 80) => {
    txt(label, x, yPos, { size: 7, color: GRIS2 })
    txt(valor, x, yPos + 5, { size: 9, bold: true, color: NEGRO })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HEADER — banda con branding
  // ══════════════════════════════════════════════════════════════════════════

  doc.setFillColor(NARANJA[0], NARANJA[1], NARANJA[2])
  doc.rect(0, 0, W, 40, 'F')

  // Logo
  if (datos.logoUrl) {
    try {
      const resp = await fetch(datos.logoUrl)
      const blob2 = await resp.blob()
      const b64  = await new Promise<string>(res => {
        const reader = new FileReader()
        reader.onload = () => res((reader.result as string).split(',')[1])
        reader.readAsDataURL(blob2)
      })
      const ext = datos.logoUrl.includes('.png') ? 'PNG' : 'JPEG'
      doc.addImage(`data:image/${ext.toLowerCase()};base64,${b64}`, ext, margin, 7, 26, 26)
    } catch {
      doc.setFillColor(BLANCO[0], BLANCO[1], BLANCO[2])
      doc.circle(margin + 13, 20, 13, 'F')
      txt(datos.gestoriaNombre.slice(0, 2).toUpperCase(), margin + 13, 23,
          { size: 11, bold: true, color: NARANJA, align: 'center' })
    }
  } else {
    doc.setFillColor(BLANCO[0], BLANCO[1], BLANCO[2])
    doc.circle(margin + 13, 20, 13, 'F')
    txt(datos.gestoriaNombre.slice(0, 2).toUpperCase(), margin + 13, 23,
        { size: 11, bold: true, color: NARANJA, align: 'center' })
  }

  // Nombre gestoría
  txt(datos.gestoriaNombre.toUpperCase(), 47, 15,
      { size: 15, bold: true, color: BLANCO })
  if (datos.gestoriaResponsable) {
    txt(`Mandataria del Automotor — ${datos.gestoriaResponsable}`, 47, 21,
        { size: 8, color: [255, 210, 180] as RGB })
  }
  txt([
    datos.gestoriaTelefono1,
    datos.gestoriaTelefono2,
  ].filter(Boolean).join('  /  '), 47, 28, { size: 8, color: [255, 220, 200] as RGB })
  txt([
    datos.gestoriaEmail,
    datos.gestoriaWeb,
  ].filter(Boolean).join('  |  '), 47, 34, { size: 7.5, color: [255, 220, 200] as RGB })

  // COMPROBANTE + número en esquina derecha
  txt('COMPROBANTE DE TRÁMITE', W - margin, 13,
      { size: 7, bold: true, color: [255, 200, 160] as RGB, align: 'right' })
  txt(tramite.numero, W - margin, 21,
      { size: 13, bold: true, color: BLANCO, align: 'right' })
  txt(`Emitido: ${new Date().toLocaleDateString('es-AR')}`, W - margin, 27,
      { size: 7, color: [255, 220, 200] as RGB, align: 'right' })

  y = 48

  // ══════════════════════════════════════════════════════════════════════════
  // ESTADO DEL TRÁMITE — card destacada
  // ══════════════════════════════════════════════════════════════════════════

  const estadoLabel = ESTADO_TRAMITE_LABELS[tramite.estado] ?? tramite.estado
  const estadoFill  = estadoBgHex(tramite.estado)
  const estadoTxt   = estadoColor(tramite.estado)

  rect(margin, y, W - margin * 2, 18, estadoFill, 3, 'FD')
  doc.setDrawColor(estadoTxt[0], estadoTxt[1], estadoTxt[2])
  doc.setLineWidth(0.5)
  doc.roundedRect(margin, y, W - margin * 2, 18, 3, 3, 'S')

  txt('ESTADO ACTUAL', margin + 6, y + 6, { size: 7, bold: true, color: estadoTxt })
  txt(estadoLabel.toUpperCase(), margin + 6, y + 13,
      { size: 12, bold: true, color: estadoTxt })

  // Fecha de última actualización
  txt(
    `Última actualización: ${formatFechaLarga(tramite.actualizadoEn)}`,
    W - margin - 4, y + 10.5,
    { size: 8, color: GRIS1, align: 'right' }
  )

  y += 26

  // ══════════════════════════════════════════════════════════════════════════
  // DATOS DEL TRÁMITE
  // ══════════════════════════════════════════════════════════════════════════

  txt('DATOS DEL TRÁMITE', margin, y, { size: 7, bold: true, color: NARANJA })
  linea(y + 2, NARANJA, 0.5)
  y += 10

  const colW  = (W - margin * 2) / 3
  labelValor('Tipo de trámite', TIPO_TRAMITE_LABELS[tramite.tipo] ?? tramite.tipo, margin, y)
  labelValor('Patente', tramite.patente || '—', margin + colW, y)
  labelValor('N° de expediente', tramite.numero, margin + colW * 2, y)
  y += 14

  labelValor('Inicio del trámite', formatFechaLarga(tramite.creadoEn), margin, y)
  if (tramite.descripcion) {
    labelValor('Descripción', tramite.descripcion, margin + colW, y, colW * 2)
  }
  y += 14

  // ══════════════════════════════════════════════════════════════════════════
  // DATOS DEL CLIENTE Y VEHÍCULO
  // ══════════════════════════════════════════════════════════════════════════

  if (cliente) {
    linea(y, GRIS3)
    y += 8
    txt('CLIENTE', margin, y, { size: 7, bold: true, color: NARANJA })
    linea(y + 2, NARANJA, 0.5)
    y += 10

    const nombreC = `${cliente.apellido.toUpperCase()}, ${cliente.nombre}`
    txt(nombreC, margin, y, { size: 11, bold: true, color: NEGRO })
    y += 7

    const datosC = [
      cliente.dni      ? `DNI ${cliente.dni}`         : null,
      cliente.cuit     ? `CUIT ${cliente.cuit}`        : null,
      cliente.telefono ? `Tel: ${cliente.telefono}`    : null,
      cliente.email    ? cliente.email                  : null,
    ].filter(Boolean) as string[]
    txt(datosC.join('   ·   '), margin, y, { size: 8.5, color: GRIS1 })
    y += 5

    if (cliente.direccion || cliente.localidad) {
      txt(
        [cliente.direccion, cliente.localidad].filter(Boolean).join(', '),
        margin, y, { size: 8, color: GRIS2 }
      )
      y += 5
    }
    y += 2
  }

  if (vehiculo) {
    const vStr = [
      vehiculo.marca, vehiculo.modelo,
      vehiculo.anio ? `(${vehiculo.anio})` : null,
    ].filter(Boolean).join(' ')
    rect(margin, y, W - margin * 2, 9, GRIS3, 1.5)
    txt(`🚗  ${vehiculo.patente}   ·   ${vStr}`, margin + 3, y + 6,
        { size: 8.5, color: NEGRO })
    y += 13
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HONORARIOS / PAGO
  // ══════════════════════════════════════════════════════════════════════════

  if (tramite.honorarios > 0) {
    linea(y, GRIS3)
    y += 8
    txt('HONORARIOS', margin, y, { size: 7, bold: true, color: NARANJA })
    linea(y + 2, NARANJA, 0.5)
    y += 10

    const pagadoColor: RGB = tramite.pagado ? VERDE : AMBER

    // Fila honorarios
    rect(margin, y, W - margin * 2, 12, tramite.pagado ? [236, 253, 245] as RGB : [255, 251, 235] as RGB, 2, 'FD')
    doc.setDrawColor(pagadoColor[0], pagadoColor[1], pagadoColor[2])
    doc.setLineWidth(0.4)
    doc.roundedRect(margin, y, W - margin * 2, 12, 2, 2, 'S')

    txt('Honorarios de gestoría:', margin + 4, y + 7.5, { size: 9, color: NEGRO })
    txt(formatPesos(tramite.honorarios), col2, y + 7.5,
        { size: 11, bold: true, color: NARANJA })
    txt(tramite.pagado ? '✓ PAGADO' : 'PENDIENTE DE PAGO', W - margin - 4, y + 7.5,
        { size: 9, bold: true, color: pagadoColor, align: 'right' })
    y += 16

    if (tramite.pagado && tramite.fechaPago) {
      txt(`Fecha de pago: ${formatFechaCorta(tramite.fechaPago)}`, margin, y,
          { size: 8, color: GRIS1 })
      if ((tramite as any).formaPago) {
        const fp: Record<string, string> = {
          efectivo: 'Efectivo', transferencia: 'Transferencia',
          cheque: 'Cheque', mixto: 'Mixto',
        }
        txt(`Forma de pago: ${fp[(tramite as any).formaPago] ?? (tramite as any).formaPago}`,
            margin + 70, y, { size: 8, color: GRIS1 })
      }
      y += 8
    }

    // Datos bancarios si está pendiente
    if (!tramite.pagado && (datos.bancoCbu || datos.bancoAlias)) {
      y += 4
      rect(margin, y, W - margin * 2, 20, GRIS3, 2)
      txt('DATOS PARA TRANSFERENCIA', margin + 4, y + 6,
          { size: 7, bold: true, color: GRIS1 })
      const lineasBanco = [
        datos.bancoTitular ? `Titular: ${datos.bancoTitular}` : null,
        datos.bancoCbu     ? `CBU: ${datos.bancoCbu}`         : null,
        datos.bancoAlias   ? `Alias: ${datos.bancoAlias}`     : null,
      ].filter(Boolean) as string[]
      txt(lineasBanco.join('   ·   '), margin + 4, y + 12, { size: 8, color: NEGRO })
      txt(`Concepto al transferir: ${tramite.numero}`, margin + 4, y + 17.5,
          { size: 7.5, color: GRIS2 })
      y += 24
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HISTORIAL DE ESTADOS (últimos 4)
  // ══════════════════════════════════════════════════════════════════════════

  const historial = tramite.historialEstados ?? []
  if (historial.length > 0) {
    linea(y, GRIS3)
    y += 8
    txt('HISTORIAL DEL TRÁMITE', margin, y, { size: 7, bold: true, color: NARANJA })
    linea(y + 2, NARANJA, 0.5)
    y += 10

    const ultimos = [...historial].reverse().slice(0, 5)
    for (const h of ultimos) {
      const estadoH = ESTADO_TRAMITE_LABELS[h.estadoNuevo] ?? h.estadoNuevo
      const color   = estadoColor(h.estadoNuevo)
      doc.setFillColor(color[0], color[1], color[2])
      doc.circle(margin + 2, y + 0.5, 1.5, 'F')
      txt(`→ ${estadoH}`, margin + 6, y + 2, { size: 8.5, bold: true, color: NEGRO })
      if (h.fecha) {
        txt(formatFechaCorta(h.fecha), margin + 80, y + 2, { size: 7.5, color: GRIS2 })
      }
      if (h.nota) {
        txt(`"${h.nota}"`, margin + 6, y + 6.5, { size: 7.5, color: GRIS2 })
        y += 10
      } else {
        y += 7
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FOOTER
  // ══════════════════════════════════════════════════════════════════════════

  const footerY = H - 22
  doc.setFillColor(NARANJA[0], NARANJA[1], NARANJA[2])
  doc.rect(0, footerY, W, 22, 'F')

  txt(
    `${datos.gestoriaNombre}${datos.gestoriaLocalidad ? '  ·  ' + datos.gestoriaLocalidad : ''}`,
    col2, footerY + 7, { size: 8, bold: true, color: BLANCO, align: 'center' }
  )
  txt(
    [datos.gestoriaTelefono1, datos.gestoriaEmail, datos.gestoriaWeb]
      .filter(Boolean).join('   ·   '),
    col2, footerY + 13, { size: 7.5, color: [255, 210, 180] as RGB, align: 'center' }
  )
  txt('Desarrollado por JAH-NISSI Digital Studio', W - margin, footerY + 19,
      { size: 6, color: [255, 180, 130] as RGB, align: 'right' })

  // ── Output ────────────────────────────────────────────────────────────────
  const blob   = doc.output('blob')
  const nombre = `Comprobante_${tramite.numero}_${tramite.patente}.pdf`

  return { blob, nombre }
}

// ─── DESCARGAR ────────────────────────────────────────────────────────────────

export function descargarComprobante(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href      = url
  a.download  = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}