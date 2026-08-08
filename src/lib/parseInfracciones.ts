// src/lib/parseInfracciones.ts
// ─── PARSER + CLASIFICADOR + COTIZADOR — INFRACCIONES PBA ─────────────────────
//
// Transforma la respuesta cruda del portal en el modelo interno de GestorApp,
// clasifica cada acta en trabajable / excluida, y calcula honorarios.
//
// ⚠️ REGLA DE NEGOCIO — CONFIRMAR CON MATÍAS antes de producción:
// La matriz de estados (qué se trabaja y qué no) y el modelo de honorarios son
// PROVISORIOS. Se guardan en `configuracion.cotizacionMultas` y se editan desde
// la UI de Configuración. Acá van solo los defaults de arranque.

import type {
  RawActa,
  RawRespuestaPortal,
  Acta,
  ClasificacionActa,
  CotizacionMultas,
} from '../infraccion_types'

// ─── CONFIG (default provisorio — la fuente de verdad es Firestore) ──────────

export interface ReglaEstado {
  trabajable: boolean
  motivo:     string | null   // se muestra en el PDF si trabajable=false
}

export interface ConfigCotizacionMultas {
  /** Clave = estadoCausaPublico.descripcion (en MAYÚSCULAS). */
  matrizEstados: Record<string, ReglaEstado>
  /** Estado no listado en la matriz → se excluye por seguridad (no se cobra de más). */
  reglaPorDefecto: ReglaEstado
  /** Overrides por flag del acta (se aplican DESPUÉS de la matriz). */
  overrides: {
    excluirSiApremio:      boolean   // conApremio=true → excluir
    excluirSiVencida:      boolean   // estaVencida=true → excluir
    excluirSiTieneDescargo:boolean   // tieneDescargo=true → excluir (ya hay uno en curso)
    excluirSiSinDI: boolean   // debeDI=true → excluir (badge "Sin DI" del portal)
  }
  /** Honorarios. Modelo por tramos sobre CANTIDAD de actas trabajables. */
  honorarios: {
    modo:  'por_acta' | 'por_dominio' | 'tramos'
    // por_acta: honorario fijo × cada acta trabajable
    montoPorActa: number
    // por_dominio: honorario fijo por dominio con ≥1 acta trabajable
    montoPorDominio: number
    // tramos: escala por cantidad de actas trabajables
    tramos: Array<{ hasta: number; montoPorActa: number }>
  }
}

// Default de arranque. `montoPorActa: 55000` sale de calculadoraDNRPA.honorarios.descargo_multa.
// ⚠️ Matías debe confirmar: ¿es por acta, por dominio, o por tramos de cantidad?
export const DEFAULT_CONFIG_COTIZACION: ConfigCotizacionMultas = {
  matrizEstados: {
    'CON DEUDA':                     { trabajable: true,  motivo: null },
    'DESCARGO PENDIENTE VALIDACION': { trabajable: false, motivo: 'Ya tiene descargo presentado, pendiente de validación' },
    'SENTENCIA':                     { trabajable: false, motivo: 'Causa con sentencia firme' },
    'SIN DEUDA':                     { trabajable: false, motivo: 'Sin deuda' },
    'PAGADA':                        { trabajable: false, motivo: 'Ya abonada' },
  },
  reglaPorDefecto: { trabajable: false, motivo: 'Estado no clasificado — revisar manualmente' },
 overrides: {
  excluirSiApremio:       true,
  excluirSiVencida:       false,
  excluirSiTieneDescargo: true,
  excluirSiSinDI:         true,
},
  honorarios: {
    modo: 'por_acta',
    montoPorActa:    55_000,
    montoPorDominio: 55_000,
    tramos: [
      { hasta: 3,        montoPorActa: 55_000 },
      { hasta: 8,        montoPorActa: 48_000 },
      { hasta: Infinity, montoPorActa: 42_000 },
    ],
  },
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Epoch en ms → ISO 'yyyy-mm-dd'. Devuelve '' si el valor no es válido. */
export function epochToISO(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return ''
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

// ─── CLASIFICACIÓN ───────────────────────────────────────────────────────────
// REGLAS DURAS DE NEGOCIO (confirmadas por Matías): NUNCA se trabajan actas
// sin Deber de Informar, con descargo pendiente de validación, ni sentenciadas.
// Van ANTES de cualquier otra regla y no son configurables.
export function clasificarActa(
  raw: RawActa,
  config: ConfigCotizacionMultas = DEFAULT_CONFIG_COTIZACION,
): ClasificacionActa {
  const estado = (raw.estadoCausaPublico?.descripcion ?? '').trim().toUpperCase()

  // ── REGLAS DURAS DE NEGOCIO (confirmadas) ────────────────────────────────
  // 1) SENTENCIADAS
  if (estado.includes('SENTENCIA'))
    return { trabajable: false, motivoExclusion: 'Causa con sentencia firme' }

  // 2) DESCARGO PENDIENTE DE VALIDACION
  if (estado.includes('DESCARGO'))
    return { trabajable: false, motivoExclusion: 'Descargo presentado, pendiente de validación' }

  // 3) SIN DI — VERIFICADO contra datos reales del portal:
  //    debeDI=true ⇒ el acta DEBE el Deber de Informar (badge "Sin DI") ⇒ excluir.
  if (config.overrides.excluirSiSinDI && raw.debeDI)
    return { trabajable: false, motivoExclusion: 'Sin Deber de Informar (sin DI)' }

  // ── Exclusiones obvias por estado ────────────────────────────────────────
  if (estado.includes('SIN DEUDA'))
    return { trabajable: false, motivoExclusion: 'Sin deuda' }
  if (estado.includes('PAGADA'))
    return { trabajable: false, motivoExclusion: 'Ya abonada' }

  // ── Overrides configurables (solo pueden EXCLUIR) ────────────────────────
  if (config.overrides.excluirSiApremio && raw.conApremio)
    return { trabajable: false, motivoExclusion: 'En apremio (ejecución fiscal)' }
  if (config.overrides.excluirSiTieneDescargo && raw.tieneDescargo)
    return { trabajable: false, motivoExclusion: 'Ya tiene descargo presentado' }
  if (config.overrides.excluirSiVencida && raw.estaVencida)
    return { trabajable: false, motivoExclusion: 'Acta vencida' }

  // ── Matriz exacta para estados conocidos ─────────────────────────────────
  const exacta = config.matrizEstados[estado]
  if (exacta) {
    return exacta.trabajable
      ? { trabajable: true, motivoExclusion: null }
      : { trabajable: false, motivoExclusion: exacta.motivo }
  }

  // ── Habilitar: cualquier acta con deuda > 0 ──────────────────────────────
  if ((raw.importeTotal ?? 0) > 0)
    return { trabajable: true, motivoExclusion: null }

  // ── Sin deuda ni estado reconocible ──────────────────────────────────────
  return { trabajable: false, motivoExclusion: `Estado no clasificado (${estado || 'sin estado'})` }
}
// ─── PARSEO ──────────────────────────────────────────────────────────────────

export function parseActa(
  raw: RawActa,
  config: ConfigCotizacionMultas = DEFAULT_CONFIG_COTIZACION,
): Acta {
  return {
    id:                  raw.id,
    nroActa:             raw.nroActa,
    nroCausa:            raw.nroCausa,
    dominio:             raw.dominio,

    importeTotal:        raw.importeTotal ?? 0,
    codigoBarra:         raw.codigoBarra ?? '',

    fechaInfraccion:     epochToISO(raw.fechaInfraccion),
    fechaEmision:        epochToISO(raw.fechaEmision),
    fechaVencimiento:    epochToISO(raw.fechaVencimiento),

    detalles:            (raw.infracciones ?? []).map(d => ({
      articulo:    d.articulo,
      descripcion: d.descripcion,
    })),
    autoridadAplicacion: raw.autoridadAplicacion ?? '',

    estadoCausa:         raw.estadoCausaPublico?.descripcion ?? '',
    estadoColorHex:      raw.estadoCausaPublico?.colorHex ?? '',
    estaEnFecha:         !!raw.estaEnFecha,
    estaVencida:         !!raw.estaVencida,
    conApremio:          !!raw.conApremio,
    debeDI:              !!raw.debeDI,

    tieneDescargo:       !!raw.tieneDescargo,
    tipoDescargo:        raw.descargo?.tipoDescargo ?? null,
    fechaDescargo:       raw.descargo?.fechaCreacion ? epochToISO(raw.descargo.fechaCreacion) : null,

    sePuedeGenerarDescargo: !!raw.sePuedeGenerarDescargo,

    clasificacion:       clasificarActa(raw, config),
  }
}

/** Respuesta cruda del portal → array de actas normalizadas. */
export function parseRespuestaPortal(
  raw: RawRespuestaPortal,
  config: ConfigCotizacionMultas = DEFAULT_CONFIG_COTIZACION,
): Acta[] {
  if (!raw || raw.error || !Array.isArray(raw.infracciones)) return []
  return raw.infracciones.map(a => parseActa(a, config))
}

// ─── COTIZACIÓN ──────────────────────────────────────────────────────────────

export function cotizar(
  actas: Acta[],
  config: ConfigCotizacionMultas = DEFAULT_CONFIG_COTIZACION,
): CotizacionMultas {
  const trabajables = actas.filter(a => a.clasificacion.trabajable)
  const excluidas   = actas.filter(a => !a.clasificacion.trabajable)

  const importeTotalDeuda = trabajables.reduce((sum, a) => sum + a.importeTotal, 0)
  const n = trabajables.length

  let honorarios = 0
  let detalle = ''
  const h = config.honorarios

  if (n === 0) {
    detalle = 'Sin actas trabajables'
  } else if (h.modo === 'por_dominio') {
    honorarios = h.montoPorDominio
    detalle = `Honorario único por dominio: $${h.montoPorDominio.toLocaleString('es-AR')}`
  } else if (h.modo === 'tramos') {
    const tramo = h.tramos.find(t => n <= t.hasta) ?? h.tramos[h.tramos.length - 1]
    honorarios = n * tramo.montoPorActa
    detalle = `${n} acta(s) × $${tramo.montoPorActa.toLocaleString('es-AR')} = $${honorarios.toLocaleString('es-AR')}`
  } else {
    // por_acta
    honorarios = n * h.montoPorActa
    detalle = `${n} acta(s) × $${h.montoPorActa.toLocaleString('es-AR')} = $${honorarios.toLocaleString('es-AR')}`
  }

  return {
    actasTrabajables:   trabajables,
    actasExcluidas:     excluidas,
    cantidadTrabajable: trabajables.length,
    cantidadExcluida:   excluidas.length,
    importeTotalDeuda,
    honorariosGestoria: honorarios,
    detalleHonorarios:  detalle,
  }
}