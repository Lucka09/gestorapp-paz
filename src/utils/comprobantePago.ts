// src/utils/comprobantePago.ts
// Genera un PDF de comprobante de pago profesional para Gestoría Paz.

import { TIPO_TRAMITE_LABELS } from '@/types'
import type { Tramite, Cliente } from '@/types'

export interface DatosRecibo {
  tramite:              Tramite
  cliente:              Cliente | null
  gestoriaNombre:       string
  gestoriaTelefono:     string
  gestoriaWeb?:         string
  gestoriaEmail?:       string
  gestoriaDireccion?:   string
  gestoriaResponsable?: string
  colorPrimario?:       string
  logoUrl?:             string | null
  reciboNumero?:        string
  metodoPago?:          string
  periodoServicio?:     string
  recibeConforme?:      string
  urlSeguimiento?:      string
}

type RGB = [number, number, number]
const BLANCO: RGB = [255, 255, 255]
const NEGRO:  RGB = [26,  26,  26]
const GRIS1:  RGB = [100, 100, 100]
const GRIS2:  RGB = [210, 210, 210]

function hexToRGB(hex: string): RGB {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
}

function formatPesos(n: number): string {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
}

function hoy(): string {
  return new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' })
}

export async function generarComprobantePago(datos: DatosRecibo): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const W      = 210
  const H      = 297
  const margin = 14
  const orange: RGB = datos.colorPrimario ? hexToRGB(datos.colorPrimario) : [212, 98, 26]
  const { tramite, cliente } = datos

  // ── HEADER NARANJA ────────────────────────────────────────────────────────
  doc.setFillColor(...orange)
  doc.rect(0, 0, W, 38, 'F')

  // Logo
  if (datos.logoUrl) {
    try {
      const resp = await fetch(datos.logoUrl)
      const buf  = await resp.arrayBuffer()
      const b64  = btoa(String.fromCharCode(...new Uint8Array(buf)))
      const ext  = datos.logoUrl.includes('.png') ? 'PNG' : 'JPEG'
      doc.addImage(`data:image/${ext.toLowerCase()};base64,${b64}`, ext, margin, 4, 30, 30)
    } catch {}
  } else {
    doc.setFillColor(...BLANCO)
    doc.roundedRect(margin, 4, 30, 30, 4, 4, 'F')
    doc.setTextColor(...orange)
    doc.setFontSize(14); doc.setFont('helvetica', 'bold')
    doc.text('GP', margin + 15, 22, { align: 'center' })
  }

  // Título
  doc.setTextColor(...BLANCO)
  doc.setFontSize(22); doc.setFont('helvetica', 'bold')
  doc.text('RECIBO DE PAGO', W - margin, 22, { align: 'right' })
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text(datos.gestoriaNombre, W - margin, 30, { align: 'right' })

  // ── FECHA Y RECIBO N° ─────────────────────────────────────────────────────
  let y = 52
  const numRecibo = datos.reciboNumero ?? tramite.numero ?? tramite.id.slice(-6).toUpperCase()

  for (const row of [
    { label: 'Fecha',      value: hoy() },
    { label: 'Recibo N.°', value: numRecibo },
  ]) {
    doc.setTextColor(...GRIS1); doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.text(row.label, W - margin - 42, y)
    doc.setTextColor(...NEGRO); doc.setFont('helvetica', 'bold')
    doc.text(row.value, W - margin, y, { align: 'right' })
    doc.setDrawColor(...GRIS2); doc.line(W - margin - 36, y + 1, W - margin, y + 1)
    y += 10
  }

  // ── SEPARADOR ─────────────────────────────────────────────────────────────
  y += 4
  doc.setDrawColor(...GRIS2); doc.setLineWidth(0.3)
  doc.line(margin, y, W - margin, y)

  // ── RECIBÍ DE ─────────────────────────────────────────────────────────────
  y += 10
  const nombreCliente = cliente
    ? `${cliente.nombre} ${cliente.apellido}`.toUpperCase()
    : ''
  const dniCliente = cliente?.dni ? `  -  DNI ${cliente.dni}` : ''

  doc.setTextColor(...GRIS1); doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text('Recibi de', margin, y)
  doc.setTextColor(...NEGRO); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
  doc.text(nombreCliente + dniCliente, margin + 22, y)
  doc.setDrawColor(...GRIS2); doc.line(margin + 20, y + 1, W - margin, y + 1)

  // ── SUMA + FORMA DE PAGO ──────────────────────────────────────────────────
  y += 12
  const monto = tramite.honorarios > 0 ? formatPesos(tramite.honorarios) : '$ _______________'

  doc.setTextColor(...GRIS1); doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text('La suma de', margin, y)
  doc.setTextColor(...orange); doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
  doc.text(monto, margin + 22, y)

  doc.setTextColor(...GRIS1); doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text('Forma de pago', W / 2 + 5, y)
  doc.setTextColor(...NEGRO); doc.setFont('helvetica', 'bold')
  doc.text(datos.metodoPago ?? '_______________', W / 2 + 32, y)
  doc.setDrawColor(...GRIS2)
  doc.line(margin + 20, y + 1, W / 2, y + 1)
  doc.line(W / 2 + 30, y + 1, W - margin, y + 1)

  // ── TRABAJO REALIZADO ─────────────────────────────────────────────────────
  y += 14
  const tipoTramite = TIPO_TRAMITE_LABELS[tramite.tipo] ?? tramite.tipo
  const concepto    = tramite.descripcion
    ? `${tipoTramite} - ${tramite.descripcion}`
    : tipoTramite

  doc.setTextColor(...GRIS1); doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text('Por el trabajo realizado:', margin, y)
  doc.setTextColor(...NEGRO); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  const lines = doc.splitTextToSize(concepto, W - margin - margin - 52)
  doc.text(lines, margin + 46, y)
  doc.setDrawColor(...GRIS2); doc.line(margin + 44, y + 1, W - margin, y + 1)
  if (lines.length > 1) y += 5

  // ── PATENTE ───────────────────────────────────────────────────────────────
  if (tramite.patente) {
    y += 10
    doc.setTextColor(...GRIS1); doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    doc.text('Vehiculo / Patente:', margin, y)
    doc.setTextColor(...NEGRO); doc.setFont('helvetica', 'bold')
    doc.text(tramite.patente, margin + 36, y)
    doc.setDrawColor(...GRIS2); doc.line(margin + 34, y + 1, W - margin, y + 1)
  }

  // ── PERÍODO ───────────────────────────────────────────────────────────────
  y += 12
  doc.setTextColor(...GRIS1); doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text('Correspondiente al periodo de', margin, y)
  doc.setTextColor(...NEGRO); doc.setFont('helvetica', 'bold')
  doc.text(datos.periodoServicio ?? hoy(), margin + 55, y)
  doc.setDrawColor(...GRIS2); doc.line(margin + 53, y + 1, W - margin, y + 1)

  // ── RECIBE CONFORME ───────────────────────────────────────────────────────
  y += 10
  doc.setTextColor(...GRIS1); doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text('Recibe conforme', margin, y)
  doc.setTextColor(...NEGRO); doc.setFont('helvetica', 'bold')
  doc.text(datos.recibeConforme ?? datos.gestoriaNombre, margin + 32, y)
  doc.setDrawColor(...GRIS2); doc.line(margin + 30, y + 1, W - margin, y + 1)

  // ── FIRMAS ────────────────────────────────────────────────────────────────
  y += 30
  const firmaCentroL = W / 4
  const firmaCentroR = (3 * W) / 4

  // Línea de firma del cliente
  doc.setDrawColor(...NEGRO); doc.setLineWidth(0.4)
  doc.line(firmaCentroL - 25, y, firmaCentroL + 25, y)

  // Sello digital gestoría (rectángulo naranja con texto)
  const selW = 54; const selH = 18
  const selX = firmaCentroR - selW / 2
  const selY = y - selH

  doc.setFillColor(...orange)
  doc.roundedRect(selX, selY, selW, selH, 3, 3, 'F')

  // Nombre gestoría en el sello
  doc.setTextColor(...BLANCO)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
  doc.text(datos.gestoriaNombre.toUpperCase(), firmaCentroR, selY + 6, { align: 'center' })

  // Responsable
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
  doc.text(datos.gestoriaResponsable ?? 'Responsable autorizado', firmaCentroR, selY + 11, { align: 'center' })

  // Leyenda firma digital
  doc.setFontSize(5.5)
  doc.text('Firma digital - Documento valido sin firma olografa', firmaCentroR, selY + 15.5, { align: 'center' })

  // Etiquetas debajo
  y += 5
  doc.setTextColor(...GRIS1); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  doc.text('Firma y aclaracion del cliente', firmaCentroL, y, { align: 'center' })
  doc.text('Sello digital Gestoria', firmaCentroR, y, { align: 'center' })

  // ── DISCLAIMER ────────────────────────────────────────────────────────────
  y += 14
  doc.setDrawColor(...GRIS2); doc.setLineWidth(0.2)
  doc.line(margin, y, W - margin, y)
  y += 6
  doc.setTextColor(...GRIS1); doc.setFont('helvetica', 'italic'); doc.setFontSize(7)
  const disc = doc.splitTextToSize(
    'Este documento es un comprobante interno de pago emitido por ' + datos.gestoriaNombre +
    ' en concepto de honorarios por servicios profesionales de gestoria del automotor. ' +
    'No reemplaza ni tiene validez como factura, recibo fiscal, ni instrumento juridico. ' +
    'En caso de requerir documentacion fiscal, solicitar comprobante correspondiente al responsable del estudio.',
    W - margin * 2
  )
  doc.text(disc, margin, y)

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const footerY = H - 48
  doc.setFillColor(...orange)
  doc.rect(0, footerY, W, 4, 'F')

  const qrSize = 28
  const qrY    = footerY + 8

  // QR seguimiento (izquierda)
  if (datos.urlSeguimiento) {
    try {
      const QRCode = await import('qrcode')
      const qrUrl  = await QRCode.toDataURL(datos.urlSeguimiento, {
        width: 200, margin: 1,
        color: { dark: '#1A1A1A', light: '#FFFFFF' },
        errorCorrectionLevel: 'M',
      })
      doc.addImage(qrUrl, 'PNG', margin, qrY, qrSize, qrSize)
      doc.setTextColor(...GRIS1); doc.setFont('helvetica', 'normal'); doc.setFontSize(6)
      doc.text('QR Seguimiento', margin + qrSize / 2, qrY + qrSize + 3, { align: 'center' })
    } catch {}
  }

  // QR contacto (derecha) — WhatsApp o web
  const telLimpio = datos.gestoriaTelefono.replace(/\D/g, '')
  const waUrl     = `https://wa.me/549${telLimpio.replace(/^549/, '')}`
  const contactUrl = datos.gestoriaWeb
    ? `https://${datos.gestoriaWeb.replace(/https?:\/\//, '')}`
    : waUrl

  try {
    const QRCode    = await import('qrcode')
    const qrContact = await QRCode.toDataURL(contactUrl, {
      width: 200, margin: 1,
      color: { dark: '#1A1A1A', light: '#FFFFFF' },
    })
    doc.addImage(qrContact, 'PNG', W - margin - qrSize, qrY, qrSize, qrSize)
    doc.setTextColor(...GRIS1); doc.setFont('helvetica', 'normal'); doc.setFontSize(6)
    doc.text('QR Contacto', W - margin - qrSize / 2, qrY + qrSize + 3, { align: 'center' })
  } catch {}

  // Datos de contacto centrados
  const cx = W / 2
  doc.setTextColor(...NEGRO); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('CONTACTO', cx, qrY + 6, { align: 'center' })

  let cy = qrY + 13
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRIS1)

  // Teléfono — sin emojis, solo texto
  if (datos.gestoriaTelefono) {
    doc.text(`Tel/WA: ${datos.gestoriaTelefono}`, cx, cy, { align: 'center' })
    cy += 6
  }
  if (datos.gestoriaWeb) {
    doc.text(datos.gestoriaWeb, cx, cy, { align: 'center' })
    cy += 5
  }
  if (datos.gestoriaEmail) {
    doc.text(datos.gestoriaEmail, cx, cy, { align: 'center' })
    cy += 5
  }
  doc.setFont('helvetica', 'italic'); doc.setFontSize(7)
  doc.text('Gestores del Automotor', cx, cy, { align: 'center' })

  return doc.output('blob')
}

export function descargarRecibo(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href = url; a.download = nombre; a.click()
  URL.revokeObjectURL(url)
}