// functions/src/lib/cinemometros.ts
// COPIA de src/lib/cinemometros.ts — necesario porque Cloud Functions solo sube
// archivos dentro de functions/. Mantener sincronizado manualmente si cambia.

export interface Verificacion {
  iso: string | null
  isoAlt?: string
  primitiva: boolean
  ambigua: boolean
  original: string
}

export interface Cinemometro {
  id: string
  marca: string
  modelo: string
  serieOriginal: string
  serieVariants: string[]
  codAprobacion: string
  tipo: string
  lugar: string
  verificaciones: Verificacion[]
  fuente: string
  actualizadoEl: string
}

export type EstadoVerificacion =
  | 'vigente'
  | 'vencida'
  | 'sin_verificacion_previa'
  | 'sin_registro'
  | 'serie_vacia'

export interface ResultadoEvaluacion {
  estado: EstadoVerificacion
  serieNormalizada: string
  cinemometro?: { marca: string; modelo: string; codAprobacion: string }
  ultimaVerifAnterior?: { original: string; iso: string; vencimiento: string }
  diasExceso?: number
  verificacionesPosteriores: number
  ambigua?: boolean
  escenarioAlternativo?: { estado: 'vigente' | 'vencida'; diasExceso?: number }
  fundamentos: string[]
}

export function normalizarSerie(s: string): string {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function clavesDeSerie(celda: string): string[] {
  const partes = (celda || '')
    .split(/\s*\/\s*/)
    .map(normalizarSerie)
    .filter((k) => k.length >= 4)
  return [...new Set(partes)]
}

export function parseFechaVerificacion(raw: string): Verificacion {
  const original = (raw || '').trim()
  const base: Verificacion = { iso: null, primitiva: false, ambigua: false, original }
  if (!original) return base
  if (/primitiva/i.test(original)) return { ...base, primitiva: true }

  const m = original.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/)
  if (!m) return base
  const a = +m[1]
  const b = +m[2]
  const year = m[3].length === 2 ? 2000 + +m[3] : +m[3]
  if (a < 1 || b < 1 || a > 31 || b > 31) return base

  let d: number
  let mo: number
  let ambigua = false
  let isoAlt: string | undefined

  if (a > 12 && b <= 12) {
    d = a
    mo = b
  } else if (a <= 12 && b > 12) {
    d = b
    mo = a
  } else if (a > 12 && b > 12) {
    return base
  } else {
    d = a
    mo = b
    ambigua = true
    isoAlt = armarISO(year, a, b)
  }
  return { iso: armarISO(year, mo, d), isoAlt, ambigua, primitiva: false, original }
}

function armarISO(year: number, mo: number, d: number): string {
  return `${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function addYearsISO(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y + 1, m - 1, d))
  if (dt.getUTCMonth() !== m - 1) dt.setUTCDate(0)
  return dt.toISOString().slice(0, 10)
}

export function diasEntre(desdeISO: string, hastaISO: string): number {
  const [y1, m1, d1] = desdeISO.split('-').map(Number)
  const [y2, m2, d2] = hastaISO.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

function escenario(isoVerif: string, fechaHechoISO: string) {
  const vencimiento = addYearsISO(isoVerif)
  const vigente = fechaHechoISO <= vencimiento
  return { vencimiento, vigente, diasExceso: vigente ? undefined : diasEntre(vencimiento, fechaHechoISO) }
}

export function evaluarVerificacion(
  cinemometro: Cinemometro | undefined,
  seriePortal: string,
  fechaHechoISO: string,
): ResultadoEvaluacion {
  const key = normalizarSerie(seriePortal)
  const base: ResultadoEvaluacion = {
    estado: 'serie_vacia',
    serieNormalizada: key,
    verificacionesPosteriores: 0,
    fundamentos: [],
  }
  if (!key) return base

  if (!cinemometro) {
    return {
      ...base,
      estado: 'sin_registro',
      fundamentos: [
        `El equipo con nro. de serie ${seriePortal} no figura en el listado de cinemómetros verificados por INTI (Ley 19511/72). No consta acreditación metrológica del instrumento que originó el acta.`,
      ],
    }
  }

  const conFecha = cinemometro.verificaciones
    .filter((v): v is Verificacion => !!v.iso)
    .sort((x, y) => (x.iso! < y.iso! ? -1 : 1))
  const anteriores = conFecha.filter((v) => v.iso! <= fechaHechoISO)
  const posteriores = conFecha.length - anteriores.length
  const datos = {
    marca: cinemometro.marca,
    modelo: cinemometro.modelo,
    codAprobacion: cinemometro.codAprobacion,
  }

  if (anteriores.length === 0) {
    return {
      ...base,
      estado: 'sin_verificacion_previa',
      cinemometro: datos,
      verificacionesPosteriores: posteriores,
      fundamentos: [
        `Al momento del hecho (${fechaHechoISO}) el equipo ${cinemometro.serieOriginal} (${cinemometro.marca} ${cinemometro.modelo}, ${cinemometro.codAprobacion}) no registraba verificación alguna en el listado INTI.`,
      ],
    }
  }

  const ultima = anteriores[anteriores.length - 1]
  const esc = escenario(ultima.iso!, fechaHechoISO)
  const estado: 'vigente' | 'vencida' = esc.vigente ? 'vigente' : 'vencida'

  const res: ResultadoEvaluacion = {
    ...base,
    estado,
    cinemometro: datos,
    ultimaVerifAnterior: {
      original: ultima.original,
      iso: ultima.iso!,
      vencimiento: esc.vencimiento,
    },
    diasExceso: esc.diasExceso,
    verificacionesPosteriores: posteriores,
    fundamentos:
      estado === 'vencida'
        ? [
            `Al momento del hecho (${fechaHechoISO}), la última verificación del equipo ${cinemometro.serieOriginal} (${cinemometro.marca} ${cinemometro.modelo}) fue el ${ultima.original}, cuya vigencia anual venció el ${esc.vencimiento}. El hecho ocurrió ${esc.diasExceso} días después del vencimiento de la verificación periódica (Ley 19511/72).`,
          ]
        : [
            `Verificación del ${ultima.original} vigente al momento del hecho. Revisar fundamentos alternativos (radicación, señalización, notificación).`,
          ],
  }

  if (ultima.isoAlt) {
    const escB = escenario(ultima.isoAlt, fechaHechoISO)
    const estadoB: 'vigente' | 'vencida' = escB.vigente ? 'vigente' : 'vencida'
    if (estadoB !== estado) {
      res.ambigua = true
      res.escenarioAlternativo = { estado: estadoB, diasExceso: escB.diasExceso }
    }
  }
  return res
}

export const ETIQUETAS_ESTADO: Record<EstadoVerificacion, string> = {
  vigente: 'Verificación vigente',
  vencida: 'Verificación vencida',
  sin_verificacion_previa: 'Sin verificación previa al hecho',
  sin_registro: 'Sin registro INTI',
  serie_vacia: 'Serie no informada',
}