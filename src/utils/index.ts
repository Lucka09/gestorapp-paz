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

/** @deprecated usar generarNumeroCorrelativo */
export function generarNumeroTramite(): string {
  const year = new Date().getFullYear()
  const rand = String(Math.floor(Math.random() * 9000) + 1000)
  return `TRM-${year}-${rand}`
}

// ─── NUMERACIÓN CORRELATIVA POR TIPO Y AÑO ────────────────────────────────────
// Formato: TRF-2026-0001  (Transferencia nro 1 del 2026)
// Prefijos: INS, TRF, MUL, y el resto como OTR
// El contador se reinicia cada año por gestoriaId+tipo+año.
// Colección Firestore: contadores/{gestoriaId}_{tipo}_{año}

const TIPO_PREFIJO: Record<string, string> = {
  inscripcion_inicial: 'INS',
  transferencia:       'TRF',
  descargo_multa:      'MUL',
  // otros tipos del sistema
  t08:                 'T08',
  pre_radicacion:      'PRE',
  inhabilitacion:      'INH',
  cedula_verde:        'CED',
  levantamiento_prenda:'LEV',
  alta_vehiculo:       'ALT',
  baja_vehiculo:       'BAJ',
  dto_infraccion:      'DTI',
  denuncia_cedula:     'DCE',
  radicacion:          'RAD',
  vtv:                 'VTV',
  otro:                'OTR',
}

export function prefijoPorTipo(tipo: string): string {
  return TIPO_PREFIJO[tipo] ?? 'OTR'
}

/**
 * Genera el siguiente número correlativo para un tipo de trámite en una gestoría.
 * Usa una transacción Firestore sobre la colección `contadoresTramites` para
 * garantizar unicidad incluso con escrituras concurrentes.
 *
 * Formato resultante: TRF-2026-0001
 */
export async function generarNumeroCorrelativo(
  gestoriaId: string,
  tipo:        string,
): Promise<string> {
  const { db }          = await import('@/lib/firebase')
  const { doc, runTransaction } = await import('firebase/firestore')

  const anio    = new Date().getFullYear()
  const prefijo = prefijoPorTipo(tipo)
  const clave   = `${gestoriaId}_${prefijo}_${anio}`
  const ref     = doc(db, 'contadoresTramites', clave)

  const nuevoValor = await runTransaction(db, async tx => {
    const snap = await tx.get(ref)
    const actual = snap.exists() ? (snap.data()?.contador ?? 0) : 0
    const siguiente = actual + 1
    tx.set(ref, { gestoriaId, tipo, prefijo, anio, contador: siguiente }, { merge: true })
    return siguiente
  })

  const nroFormateado = String(nuevoValor).padStart(4, '0')
  return `${prefijo}-${anio}-${nroFormateado}`
}

export function truncar(str: string, max = 40): string {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '…' : str
}