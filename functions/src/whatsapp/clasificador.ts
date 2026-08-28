// functions/src/whatsapp/clasificador.ts
// ─────────────────────────────────────────────────────────────────────────────
// Clasificación de intención (multa vs. general) + detección de patente/DNI en
// texto libre. Todo funciones puras, sin dependencias de Firestore, para poder
// testearlas aisladas y correrlas en el webhook sin costo.
// ─────────────────────────────────────────────────────────────────────────────

export const KEYWORDS_MULTA_DEFAULT = [
  'multa', 'multas', 'infraccion', 'infracciones', 'descargo', 'descargos',
  'acta', 'actas', 'cedulon', 'comparendo',
  'tengo una multa', 'tengo multas', 'me llego una multa', 'me llegaron multas',
  'consultar multa', 'consultar multas', 'sacar multa', 'sacar la multa',
  'foto de la multa', 'infraccion de transito', 'infracciones de transito',
]

// Saca tildes, pasa a minúsculas y colapsa espacios — así "infracción" e
// "infraccion" (y variaciones de mayúsculas/espacios) matchean igual.
function normalizar(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True si el texto contiene alguna keyword de multas. */
export function esConsultaMulta(
  texto: string,
  keywords: string[] = KEYWORDS_MULTA_DEFAULT,
): boolean {
  const t = normalizar(texto)
  if (!t) return false
  return keywords.some(k => {
    const kn = normalizar(k)
    return kn.length > 0 && t.includes(kn)
  })
}

// ─── DETECCIÓN DE PATENTE / DNI ──────────────────────────────────────────────

// Formatos válidos ya limpios (mismos que la web pública).
const RE_DOMINIO_LIMPIO =
  /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2}|\d{3}[A-Z]{3}|[A-Z]\d{3}[A-Z]{3})$/

// Patrones tolerantes con espacios/guiones/puntos dentro del texto libre.
const PATRONES_PATENTE: RegExp[] = [
  /\b([A-Z]{2})[\s.\-]?(\d{3})[\s.\-]?([A-Z]{2})\b/g,   // Mercosur auto  AB123CD
  /\b([A-Z])[\s.\-]?(\d{3})[\s.\-]?([A-Z]{3})\b/g,      // Mercosur moto  A123BCD
  /\b([A-Z]{3})[\s.\-]?(\d{3})\b/g,                      // auto viejo     ABC123
  /\b(\d{3})[\s.\-]?([A-Z]{3})\b/g,                      // moto vieja     123ABC
]

export interface DatoInfraccion { tipo: 'dominio' | 'dni'; valor: string }

/**
 * Busca una patente (prioridad) o un DNI dentro de un mensaje. Devuelve el
 * primer match válido, o null. El resultado es una SUGERENCIA: la confirma
 * un humano en la Bandeja antes de disparar la consulta a la cola.
 */
export function detectarDatoInfraccion(texto: string): DatoInfraccion | null {
  const T = (texto || '').toUpperCase()

  // 1) Patente (mayor prioridad)
  for (const re of PATRONES_PATENTE) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(T)) !== null) {
      const cand = m.slice(1).join('').replace(/[^A-Z0-9]/g, '')
      if (RE_DOMINIO_LIMPIO.test(cand)) return { tipo: 'dominio', valor: cand }
    }
  }

  // 2) DNI con rótulo explícito ("DNI 12345678", "documento: 12345678")
  const conRotulo = T.match(/\b(?:DNI|DOCUMENTO|DOC)\D{0,6}(\d{7,8})\b/)
  if (conRotulo) return { tipo: 'dni', valor: conRotulo[1] }

  // 3) DNI suelto: 7-8 dígitos que no formen parte de un número más largo
  const suelto = T.match(/(?<!\d)(\d{7,8})(?!\d)/)
  if (suelto) return { tipo: 'dni', valor: suelto[1] }

  return null
}

/** Deduce el tipo de consulta a partir de un valor ya tipeado (chip editable). */
export function tipoDeValor(valorRaw: string): 'dominio' | 'dni' {
  const v = (valorRaw || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^\d{7,8}$/.test(v) ? 'dni' : 'dominio'
}

/** Valida que un valor sea patente o DNI reconocible (para habilitar el botón). */
export function esValorConsultable(valorRaw: string): boolean {
  const v = (valorRaw || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return RE_DOMINIO_LIMPIO.test(v) || /^\d{7,8}$/.test(v)
}