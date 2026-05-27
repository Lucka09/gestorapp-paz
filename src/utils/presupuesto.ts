// Generador de presupuestos PDF para Gestoría Paz
// Usa jsPDF con carga dinámica para no impactar el bundle inicial

import type { TipoTramite } from '@/types'
import { TIPO_TRAMITE_LABELS } from '@/types'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface DatosPresupuesto {
  // Cliente
  clienteNombre:   string
  clienteApellido: string
  clienteDni:      string
  clienteTelefono: string
  clienteEmail?:   string

  // Vehículo (opcional)
  patente?:        string
  marcaModelo?:    string
  anio?:           string

  // Trámite
  tipoTramite:     TipoTramite
  descripcion?:    string

  // Honorarios
  honorarios:      number
  incluyeGastos:   boolean
  gastosAdicionales?: number
  formaPago?:      string

  // Meta
  numero:          string
  fechaVencimiento?: string
  observaciones?:  string
}

export interface ResultadoPresupuesto {
  blob:     Blob
  nombre:   string
  numero:   string
}

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

const NARANJA  = [212, 98,  26] as [number,number,number]
const NEGRO    = [26,  26,  26] as [number,number,number]
const GRIS1    = [99,  99,  99] as [number,number,number]
const GRIS2    = [153, 153, 153] as [number,number,number]
const GRIS3    = [240, 240, 240] as [number,number,number]
const BLANCO   = [255, 255, 255] as [number,number,number]
const VERDE    = [5,   150, 105] as [number,number,number]

const FORMA_PAGO_LABELS: Record<string, string> = {
  efectivo:      'Efectivo',
  transferencia: 'Transferencia bancaria',
  cheque:        'Cheque',
  mixto:         'Pago mixto',
}

function generarNumero(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const n = String(Math.floor(Math.random() * 9000) + 1000)
  return `PRES-${y}${m}-${n}`
}

function formatPesos(n: number): string {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
}

function formatFechaLarga(date: Date): string {
  return date.toLocaleDateString('es-AR', {
    weekday: 'long', year: 'numeric',
    month: 'long', day: 'numeric',
  })
}

// ─── GENERADOR PRINCIPAL ──────────────────────────────────────────────────────

export async function generarPresupuestoPDF(
  datos: DatosPresupuesto
): Promise<ResultadoPresupuesto> {

  // Carga dinámica — no impacta el bundle inicial
  const { jsPDF } = await import('jspdf')

  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W      = 210  // ancho A4
  const H      = 297  // alto A4
  const margin = 16
  const col2   = W / 2
  let   y      = 0

  // ── HELPER: LÍNEA HORIZONTAL ──────────────────────────────────────────────

  const linea = (yPos: number, color = GRIS3, grosor = 0.3) => {
    doc.setDrawColor(color[0], color[1], color[2])
    doc.setLineWidth(grosor)
    doc.line(margin, yPos, W - margin, yPos)
  }

  // ── HELPER: TEXTO ─────────────────────────────────────────────────────────

  const txt = (
    texto: string, x: number, yPos: number,
    opts: { size?: number; bold?: boolean; color?: readonly number[];
            align?: 'left' | 'center' | 'right' } = {}
  ) => {
    const { size = 9, bold = false, color = NEGRO, align = 'left' } = opts
    doc.setFontSize(size)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(color[0], color[1], color[2])
    doc.text(texto, x, yPos, { align })
  }

  // ── HELPER: RECTÁNGULO REDONDEADO ─────────────────────────────────────────

  const rect = (
    x: number, yPos: number, w: number, h: number,
    color: readonly number[], radio = 2, tipo: 'F' | 'S' | 'FD' = 'F'
  ) => {
    doc.setFillColor(color[0], color[1], color[2])
    doc.setDrawColor(color[0], color[1], color[2])
    doc.roundedRect(x, yPos, w, h, radio, radio, tipo)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HEADER — Banda naranja
  // ══════════════════════════════════════════════════════════════════════════

  // Fondo header naranja
  doc.setFillColor(NARANJA[0], NARANJA[1], NARANJA[2])
  doc.rect(0, 0, W, 42, 'F')

  // Logo — cargar desde URL pública
  try {
    const logoUrl = `${window.location.origin}/logo-gp-200.jpg`
    const resp    = await fetch(logoUrl)
    const blob    = await resp.blob()
    const b64     = await new Promise<string>(res => {
      const reader = new FileReader()
      reader.onload = () => res((reader.result as string).split(',')[1])
      reader.readAsDataURL(blob)
    })
    // Logo circular en esquina superior izquierda
    doc.addImage(`data:image/jpeg;base64,${b64}`, 'JPEG', margin, 6, 28, 28)
  } catch {
    // Fallback: círculo con iniciales GP
    doc.setFillColor(BLANCO[0], BLANCO[1], BLANCO[2])
    doc.circle(margin + 14, 21, 14, 'F')
    txt('GP', margin + 14, 23.5, { size: 12, bold: true, color: NARANJA, align: 'center' })
  }

  // Nombre de la empresa
  txt('GESTORÍA PAZ', 52, 16, { size: 16, bold: true, color: BLANCO })
  txt('Mandataria del Automotor', 52, 22, { size: 9, color: [255, 200, 160] })

  // Datos de contacto en header
  txt('📞 11 3614-1431 / 11 5221-9011', 52, 29, { size: 8, color: [255, 220, 200] })
  txt('✉ info@gestoriapaz.com  |  gestoriapaz.com', 52, 34, { size: 8, color: [255, 220, 200] })

  // Número de presupuesto — esquina derecha del header
  const numero = datos.numero || generarNumero()
  txt('PRESUPUESTO', W - margin, 14, { size: 7, bold: true, color: [255, 200, 160], align: 'right' })
  txt(numero, W - margin, 21, { size: 13, bold: true, color: BLANCO, align: 'right' })
  txt(formatFechaLarga(new Date()), W - margin, 27, { size: 7, color: [255, 220, 200], align: 'right' })

  // ── FECHA DE VENCIMIENTO ──────────────────────────────────────────────────
  if (datos.fechaVencimiento) {
    const venc = new Date(datos.fechaVencimiento + 'T00:00:00')
    rect(W - margin - 50, 30, 50, 10, [180, 70, 10], 2)
    txt('Válido hasta:', W - margin - 4, 36, { size: 7, color: [255,200,160], align: 'right' })
    txt(venc.toLocaleDateString('es-AR'), W - margin - 4, 40, { size: 8, bold: true, color: BLANCO, align: 'right' })
  }

  y = 50

  // ══════════════════════════════════════════════════════════════════════════
  // DATOS DEL CLIENTE
  // ══════════════════════════════════════════════════════════════════════════

  txt('DATOS DEL CLIENTE', margin, y, { size: 7, bold: true, color: NARANJA })
  linea(y + 2, NARANJA, 0.5)
  y += 8

  const nombreCompleto = `${datos.clienteApellido.toUpperCase()}, ${datos.clienteNombre}`
  txt(nombreCompleto, margin, y, { size: 13, bold: true, color: NEGRO })
  y += 6

  // Fila de datos del cliente
  const datosCliente = [
    datos.clienteDni     ? `DNI: ${datos.clienteDni}`         : null,
    datos.clienteTelefono? `Tel: ${datos.clienteTelefono}`    : null,
    datos.clienteEmail   ? `Email: ${datos.clienteEmail}`     : null,
  ].filter(Boolean) as string[]

  txt(datosCliente.join('   |   '), margin, y, { size: 8.5, color: GRIS1 })
  y += 5

  // Vehículo si existe
  if (datos.patente || datos.marcaModelo) {
    const vehiculoStr = [
      datos.patente    ? `Patente: ${datos.patente}`          : null,
      datos.marcaModelo? datos.marcaModelo                    : null,
      datos.anio       ? `(${datos.anio})`                    : null,
    ].filter(Boolean).join('  ·  ')
    rect(margin, y, W - margin * 2, 8, GRIS3, 1.5)
    txt('🚗  ' + vehiculoStr, margin + 3, y + 5.5, { size: 8.5, color: NEGRO })
    y += 12
  }

  y += 4
  linea(y, GRIS3)
  y += 8

  // ══════════════════════════════════════════════════════════════════════════
  // DETALLE DEL SERVICIO
  // ══════════════════════════════════════════════════════════════════════════

  txt('DETALLE DEL SERVICIO', margin, y, { size: 7, bold: true, color: NARANJA })
  linea(y + 2, NARANJA, 0.5)
  y += 8

  // Cabecera de tabla
  rect(margin, y, W - margin * 2, 8, NEGRO, 1.5)
  txt('SERVICIO', margin + 4, y + 5.5, { size: 8, bold: true, color: BLANCO })
  txt('DESCRIPCIÓN', margin + 70, y + 5.5, { size: 8, bold: true, color: BLANCO })
  txt('IMPORTE', W - margin - 4, y + 5.5, { size: 8, bold: true, color: BLANCO, align: 'right' })
  y += 10

  // Fila del trámite
  const tipoLabel = TIPO_TRAMITE_LABELS[datos.tipoTramite] ?? datos.tipoTramite
  rect(margin, y, W - margin * 2, 10, [250, 250, 250], 1.5)
  doc.setDrawColor(GRIS3[0], GRIS3[1], GRIS3[2])
  doc.setLineWidth(0.3)
  doc.roundedRect(margin, y, W - margin * 2, 10, 1.5, 1.5, 'S')

  txt(tipoLabel, margin + 4, y + 6.5, { size: 9, bold: true, color: NEGRO })
  if (datos.descripcion) {
    txt(datos.descripcion, margin + 70, y + 6.5, { size: 8, color: GRIS1 })
  }
  txt(formatPesos(datos.honorarios), W - margin - 4, y + 6.5,
      { size: 9, bold: true, color: NARANJA, align: 'right' })
  y += 12

  // Gastos adicionales si los hay
  if (datos.incluyeGastos && datos.gastosAdicionales && datos.gastosAdicionales > 0) {
    rect(margin, y, W - margin * 2, 9, [250, 250, 250], 1.5)
    doc.roundedRect(margin, y, W - margin * 2, 9, 1.5, 1.5, 'S')
    txt('Gastos y sellados', margin + 4, y + 6, { size: 9, color: NEGRO })
    txt('Sellados, tasas y gastos administrativos', margin + 70, y + 6, { size: 8, color: GRIS1 })
    txt(formatPesos(datos.gastosAdicionales), W - margin - 4, y + 6,
        { size: 9, bold: true, color: GRIS1, align: 'right' })
    y += 11
  }

  y += 4

  // ══════════════════════════════════════════════════════════════════════════
  // TOTALES
  // ══════════════════════════════════════════════════════════════════════════

  const totalW   = 80
  const totalX   = W - margin - totalW
  const totalFin = datos.honorarios + (datos.incluyeGastos && datos.gastosAdicionales ? datos.gastosAdicionales : 0)

  // Subtotal
  doc.setDrawColor(GRIS3[0], GRIS3[1], GRIS3[2])
  doc.setLineWidth(0.3)
  doc.line(totalX, y, W - margin, y)

  y += 5
  txt('Subtotal honorarios:', totalX, y, { size: 8, color: GRIS1 })
  txt(formatPesos(datos.honorarios), W - margin - 4, y,
      { size: 8, color: NEGRO, align: 'right' })
  y += 5

  if (datos.incluyeGastos && datos.gastosAdicionales && datos.gastosAdicionales > 0) {
    txt('Gastos y sellados:', totalX, y, { size: 8, color: GRIS1 })
    txt(formatPesos(datos.gastosAdicionales), W - margin - 4, y,
        { size: 8, color: NEGRO, align: 'right' })
    y += 5
  }

  // Total final — caja naranja
  rect(totalX - 4, y, totalW + 4, 12, NARANJA, 2)
  txt('TOTAL:', totalX, y + 8.5, { size: 10, bold: true, color: BLANCO })
  txt(formatPesos(totalFin), W - margin - 4, y + 8.5,
      { size: 13, bold: true, color: BLANCO, align: 'right' })
  y += 18

  // Forma de pago
  if (datos.formaPago) {
    const label = FORMA_PAGO_LABELS[datos.formaPago] ?? datos.formaPago
    rect(margin, y, 80, 8, GRIS3, 2)
    txt(`Forma de pago:  ${label}`, margin + 4, y + 5.5, { size: 8, color: NEGRO })
    y += 12
  }

  y += 4
  linea(y, GRIS3)
  y += 10

  // ══════════════════════════════════════════════════════════════════════════
  // OBSERVACIONES
  // ══════════════════════════════════════════════════════════════════════════

  if (datos.observaciones) {
    txt('OBSERVACIONES', margin, y, { size: 7, bold: true, color: NARANJA })
    linea(y + 2, NARANJA, 0.5)
    y += 8
    rect(margin, y, W - margin * 2, 16, [255, 249, 240], 2, 'FD')
    doc.setDrawColor(...[255, 200, 160] as [number,number,number])
    doc.roundedRect(margin, y, W - margin * 2, 16, 2, 2, 'S')
    const lines = doc.splitTextToSize(datos.observaciones, W - margin * 2 - 8)
    txt(lines.join('\n'), margin + 4, y + 6, { size: 8, color: NEGRO })
    y += 20
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INFORMACIÓN BANCARIA
  // ══════════════════════════════════════════════════════════════════════════

  y += 4
  rect(margin, y, W - margin * 2, 22, GRIS3, 2)
  txt('DATOS PARA TRANSFERENCIA', margin + 4, y + 6, { size: 7, bold: true, color: GRIS1 })
  txt('Titular:   Gestoría Paz — Matias Paz', margin + 4, y + 12, { size: 8, color: NEGRO })
  txt('CUIT:  20-XXXXXXXX-X   ·   CBU:  0000000000000000000000', margin + 4, y + 17, { size: 8, color: NEGRO })
  txt('Concepto al transferir:  PRES + ' + numero, margin + 4, y + 22, { size: 8, color: GRIS1 })
  y += 28

  // ══════════════════════════════════════════════════════════════════════════
  // FOOTER
  // ══════════════════════════════════════════════════════════════════════════

  // Banda footer naranja
  const footerY = H - 20
  doc.setFillColor(NARANJA[0], NARANJA[1], NARANJA[2])
  doc.rect(0, footerY, W, 20, 'F')

  txt('Gestoría Paz  ·  San Martín, Buenos Aires', col2, footerY + 7, {
    size: 8, color: BLANCO, align: 'center',
  })
  txt('Tel: 11 3614-1431  ·  info@gestoriapaz.com  ·  gestoriapaz.com', col2, footerY + 13, {
    size: 7.5, color: [255, 210, 180], align: 'center',
  })
  txt('Desarrollado por JAH-NISSI Digital Studio', W - margin, footerY + 18, {
    size: 6, color: [255, 180, 130], align: 'right',
  })

  // Generar blob
  const blob = doc.output('blob')
  const nombre = `Presupuesto_${datos.clienteApellido}_${numero}.pdf`

  return { blob, nombre, numero }
}

// ─── DESCARGAR PDF ────────────────────────────────────────────────────────────

export function descargarPDF(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href    = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

// ─── ABRIR EN NUEVA PESTAÑA (para previsualizar) ──────────────────────────────

export function previsualizarPDF(blob: Blob) {
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

// ─── MENSAJE WHATSAPP ────────────────────────────────────────────────────────

export function mensajeWhatsAppPresupuesto(datos: DatosPresupuesto, numero: string): string {
  const tipo   = TIPO_TRAMITE_LABELS[datos.tipoTramite]
  const total  = datos.honorarios + (datos.gastosAdicionales ?? 0)
  const nombre = `${datos.clienteNombre} ${datos.clienteApellido}`

  return encodeURIComponent(
    `Hola ${datos.clienteNombre}! 👋\n\n` +
    `Te enviamos el presupuesto de Gestoría Paz:\n\n` +
    `📋 *Servicio:* ${tipo}\n` +
    (datos.patente ? `🚗 *Vehículo:* ${datos.patente}${datos.marcaModelo ? ` — ${datos.marcaModelo}` : ''}\n` : '') +
    `💰 *Total:* $${total.toLocaleString('es-AR')}\n` +
    (datos.formaPago ? `💳 *Forma de pago:* ${FORMA_PAGO_LABELS[datos.formaPago] ?? datos.formaPago}\n` : '') +
    `\n📄 Número de presupuesto: ${numero}\n\n` +
    `Ante cualquier consulta estamos a tu disposición.\n` +
    `📞 11 3614-1431 / 11 5221-9011`
  )
}
