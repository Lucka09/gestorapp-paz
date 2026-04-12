import { Timestamp } from 'firebase/firestore'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

// ─── FECHAS ───────────────────────────────────────────────────────────────────

export function tsToDate(ts: Timestamp | null | undefined): Date | null {
  if (!ts) return null
  return ts.toDate()
}

export function formatFecha(ts: Timestamp | null | undefined, pattern = 'dd/MM/yyyy'): string {
  const date = tsToDate(ts)
  if (!date) return '—'
  return format(date, pattern, { locale: es })
}

export function formatFechaHora(ts: Timestamp | null | undefined): string {
  return formatFecha(ts, 'dd/MM/yyyy HH:mm')
}

export function formatRelativo(ts: Timestamp | null | undefined): string {
  const date = tsToDate(ts)
  if (!date) return '—'
  return formatDistanceToNow(date, { addSuffix: true, locale: es })
}

// ─── STRINGS ─────────────────────────────────────────────────────────────────

export function capitalizar(str: string): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export function nombreCompleto(nombre: string, apellido: string): string {
  return `${nombre} ${apellido}`.trim()
}

export function initiales(nombre: string, apellido: string): string {
  return `${nombre?.[0] ?? ''}${apellido?.[0] ?? ''}`.toUpperCase()
}

// ─── PATENTE ──────────────────────────────────────────────────────────────────

export function formatPatente(patente: string): string {
  return patente.toUpperCase().replace(/\s/g, '')
}

export function validarPatente(patente: string): boolean {
  const cleaned = formatPatente(patente)
  // Argentina vieja: AAA-000 | Argentina nueva: AA-000-AA | Mercosur: AA000AA
  return /^[A-Z]{3}\d{3}$/.test(cleaned) ||
         /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(cleaned) ||
         /^[A-Z]{2}-\d{3}-[A-Z]{2}$/.test(cleaned)
}

// ─── MONEDA ───────────────────────────────────────────────────────────────────

export function formatPesos(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(amount)
}

// ─── MISC ─────────────────────────────────────────────────────────────────────

export function generarNumeroTramite(): string {
  const year = new Date().getFullYear()
  const rand = String(Math.floor(Math.random() * 9000) + 1000)
  return `TRM-${year}-${rand}`
}

export function truncar(str: string, max = 40): string {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '…' : str
}
