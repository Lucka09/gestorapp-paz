// ─────────────────────────────────────────────────────────────────────────────
// CALCULADORA DE HONORARIOS DNRPA — GestorApp
// Basada en la tabla de aranceles del Registro Nacional de la Propiedad del Automotor
// Los valores se actualizan periódicamente desde la configuración
// ─────────────────────────────────────────────────────────────────────────────

import type { TipoTramite } from '@/types'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface ConceptoCalculo {
  concepto:    string
  monto:       number
  obligatorio: boolean    // sellado DNRPA vs honorario gestoría
  descripcion: string
}

export interface ResultadoCalculo {
  tipo:           TipoTramite
  tipoLabel:      string
  valorFiscal:    number
  conceptos:      ConceptoCalculo[]
  subtotalDNRPA:  number     // sellados y tasas oficiales
  honorariosGest: number     // honorarios de la gestoría
  totalFinal:     number
  esAproximado:   boolean    // algunos valores dependen del organismo
  notas:          string[]
}

export interface ParametrosCalculo {
  tipo:              TipoTramite
  valorFiscal:       number     // valor fiscal/venal del vehículo en $
  anioVehiculo:      number
  tipoVehiculo:      'auto' | 'moto' | 'camion' | 'utilitario'
  honorariosCustom?: number     // si 0, usar tabla interna
  incluirGastos:     boolean    // ITF, estacionamiento, correo
  provincia:         'Buenos Aires' | 'CABA' | 'Otra'
}

// ─── TABLA DE ARANCELES BASE ──────────────────────────────────────────────────
// Valores en pesos argentinos — actualizar periódicamente
// Fuente: Tabla de Aranceles DNRPA / Disposición 69/2024 y modificatorias

export const TABLA_BASE_2025 = {
  // Tasas fijas (no dependen del valor del vehículo)
  tasaRegistral:        15800,   // tasa registral base
  selladoFormulario:     3200,   // sellado por formulario oficial
  itfTransferencia:      8500,   // ITF (Impuesto a las Transacciones Financieras)
  formulario08:         12400,   // formulario 08 (dominio)
  informeDominio:        8800,   // informe de dominio
  certificadoDominio:   11200,   // certificado notarial
  selladoDuplicado:      9600,   // duplicado título/cédula
  selladoCambioRadicacion: 18500, // cambio de radicación
  selladoPrenda:        22000,   // constitución de prenda
  selladoBaja:           7800,   // baja de vehículo
  selladoAlta:          14200,   // alta / inscripción inicial
  descuentoMulta:       15000,   // descargo de multa PBA (aproximado)
  inhibicion:           19800,   // inhibición de persona
  levantamientoInhib:   22500,   // levantamiento de inhibición

  // Porcentajes sobre valor fiscal (para transferencia)
  // Escala progresiva
  transferencia: {
    tramos: [
      { hasta: 3_000_000,    tasa: 0.0180 },  // 1.8%
      { hasta: 8_000_000,    tasa: 0.0200 },  // 2.0%
      { hasta: 20_000_000,   tasa: 0.0220 },  // 2.2%
      { hasta: 50_000_000,   tasa: 0.0240 },  // 2.4%
      { hasta: Infinity,     tasa: 0.0260 },  // 2.6%
    ],
    minimo: 45_000,  // mínimo de sellado de transferencia
  },

  // Honorarios sugeridos de gestoría (editables desde configuración)
  honorarios: {
    transferencia:            85_000,
    alta:                     65_000,
    baja:                     35_000,
    tramite_08:               55_000,
    duplicado_titulo:         45_000,
    duplicado_cedula:         35_000,
    cambio_radicacion:        55_000,
    informe_dominio:          30_000,
    certificado_dominio:      45_000,
    inscripcion_inicial:      75_000,
    prenda:                   65_000,
    descargo_multa:           55_000,
    inhibicion:               60_000,
    levantamiento_inhibicion: 65_000,
    vtv:                      25_000,
    otro:                     40_000,
  },

  // Gastos adicionales opcionales
  gastos: {
    estacionamiento:  3_500,
    correoArgentino:  4_200,
    fotocopias:       1_800,
    traslado:         5_000,
  },
}

// ─── MOTOR DE CÁLCULO ─────────────────────────────────────────────────────────

function calcularSelladoTransferencia(valorFiscal: number): number {
  const { tramos, minimo } = TABLA_BASE_2025.transferencia
  const tramo = tramos.find(t => valorFiscal <= t.hasta)
  const calculado = valorFiscal * (tramo?.tasa ?? 0.026)
  return Math.max(calculado, minimo)
}

function formatTipo(tipo: TipoTramite): string {
  const labels: Record<TipoTramite, string> = {
    transferencia:           'Transferencia de Dominio',
    alta:                    'Alta de Vehículo',
    baja:                    'Baja de Vehículo',
    tramite_08:              'Trámite 08 (Dominio)',
    duplicado_titulo:        'Duplicado de Título',
    duplicado_cedula:        'Duplicado de Cédula Verde',
    cambio_radicacion:       'Cambio de Radicación',
    informe_dominio:         'Informe de Dominio',
    certificado_dominio:     'Certificado de Dominio',
    inscripcion_inicial:     'Inscripción Inicial',
    prenda:                  'Constitución de Prenda',
    descargo_multa:          'Descargo de Multa PBA',
    inhibicion:              'Inhibición',
    levantamiento_inhibicion:'Levantamiento de Inhibición',
    vtv:                     'VTV',
    otro:                    'Otro',
  }
  return labels[tipo] ?? tipo
}

export function calcularHonorarios(
  params: ParametrosCalculo,
  honorariosPersonalizados?: Partial<typeof TABLA_BASE_2025.honorarios>
): ResultadoCalculo {
  const {
    tipo, valorFiscal, anioVehiculo,
    tipoVehiculo, honorariosCustom, incluirGastos, provincia,
  } = params

  const T    = TABLA_BASE_2025
  const conceptos: ConceptoCalculo[] = []
  const notas: string[] = []
  let esAproximado = false

  // ── SELLADOS Y TASAS DNRPA ────────────────────────────────────────────────

  switch (tipo) {

    case 'transferencia': {
      const sellado = calcularSelladoTransferencia(valorFiscal)
      conceptos.push({
        concepto:    'Sellado de transferencia DNRPA',
        monto:       Math.round(sellado),
        obligatorio: true,
        descripcion: `${(valorFiscal <= T.transferencia.tramos[0].hasta ? 1.8 : valorFiscal <= T.transferencia.tramos[1].hasta ? 2.0 : valorFiscal <= T.transferencia.tramos[2].hasta ? 2.2 : 2.4)}% sobre valor fiscal`,
      })
      conceptos.push({
        concepto:    'Tasa registral',
        monto:       T.tasaRegistral,
        obligatorio: true,
        descripcion: 'Tasa fija por trámite registral',
      })
      conceptos.push({
        concepto:    'Sellado de formularios',
        monto:       T.selladoFormulario * 2,
        obligatorio: true,
        descripcion: 'Formularios oficiales del registro',
      })
      conceptos.push({
        concepto:    'ITF (Impuesto a las Transacciones)',
        monto:       T.itfTransferencia,
        obligatorio: true,
        descripcion: 'Según normativa AFIP',
      })
      if (valorFiscal > 5_000_000) {
        notas.push('Para vehículos de alto valor puede requerirse verificación policial adicional.')
      }
      break
    }

    case 'tramite_08': {
      conceptos.push({
        concepto:    'Formulario 08',
        monto:       T.formulario08,
        obligatorio: true,
        descripcion: 'Certificado de dominio (Form. 08)',
      })
      conceptos.push({
        concepto:    'Tasa registral',
        monto:       T.tasaRegistral,
        obligatorio: true,
        descripcion: 'Tasa fija por trámite registral',
      })
      break
    }

    case 'informe_dominio': {
      conceptos.push({
        concepto:    'Sellado informe de dominio',
        monto:       T.informeDominio,
        obligatorio: true,
        descripcion: 'Informe de estado dominial del vehículo',
      })
      break
    }

    case 'certificado_dominio': {
      conceptos.push({
        concepto:    'Sellado certificado',
        monto:       T.certificadoDominio,
        obligatorio: true,
        descripcion: 'Certificado notarial de dominio',
      })
      conceptos.push({
        concepto:    'Tasa registral',
        monto:       T.tasaRegistral,
        obligatorio: true,
        descripcion: 'Tasa fija por trámite registral',
      })
      break
    }

    case 'duplicado_titulo': {
      conceptos.push({
        concepto:    'Sellado duplicado de título',
        monto:       T.selladoDuplicado,
        obligatorio: true,
        descripcion: 'Sellado oficial para duplicado',
      })
      conceptos.push({
        concepto:    'Tasa registral',
        monto:       T.tasaRegistral,
        obligatorio: true,
        descripcion: 'Tasa fija por trámite registral',
      })
      notas.push('Requiere denuncia policial de extravío o destrucción del título original.')
      break
    }

    case 'duplicado_cedula': {
      conceptos.push({
        concepto:    'Sellado duplicado de cédula',
        monto:       T.selladoDuplicado * 0.7,
        obligatorio: true,
        descripcion: 'Sellado oficial para duplicado de cédula verde/azul',
      })
      conceptos.push({
        concepto:    'Tasa registral',
        monto:       T.tasaRegistral,
        obligatorio: true,
        descripcion: 'Tasa fija por trámite registral',
      })
      break
    }

    case 'cambio_radicacion': {
      conceptos.push({
        concepto:    'Sellado cambio de radicación',
        monto:       T.selladoCambioRadicacion,
        obligatorio: true,
        descripcion: 'Cambio de jurisdicción registral',
      })
      conceptos.push({
        concepto:    'Tasa registral',
        monto:       T.tasaRegistral,
        obligatorio: true,
        descripcion: 'Tasa fija por trámite registral',
      })
      if (provincia !== 'Buenos Aires' && provincia !== 'CABA') {
        notas.push('Para radicaciones en el interior puede haber tasas adicionales locales.')
        esAproximado = true
      }
      break
    }

    case 'alta':
    case 'inscripcion_inicial': {
      conceptos.push({
        concepto:    'Sellado de inscripción',
        monto:       T.selladoAlta,
        obligatorio: true,
        descripcion: 'Inscripción inicial del dominio',
      })
      conceptos.push({
        concepto:    'Tasa registral',
        monto:       T.tasaRegistral,
        obligatorio: true,
        descripcion: 'Tasa fija por trámite registral',
      })
      conceptos.push({
        concepto:    'Sellado de formularios',
        monto:       T.selladoFormulario,
        obligatorio: true,
        descripcion: 'Formularios oficiales',
      })
      break
    }

    case 'baja': {
      conceptos.push({
        concepto:    'Sellado de baja',
        monto:       T.selladoBaja,
        obligatorio: true,
        descripcion: 'Baja definitiva o temporal del vehículo',
      })
      conceptos.push({
        concepto:    'Tasa registral',
        monto:       T.tasaRegistral,
        obligatorio: true,
        descripcion: 'Tasa fija por trámite registral',
      })
      break
    }

    case 'prenda': {
      conceptos.push({
        concepto:    'Sellado de prenda',
        monto:       T.selladoPrenda,
        obligatorio: true,
        descripcion: 'Constitución de gravamen prendario',
      })
      conceptos.push({
        concepto:    'Tasa registral',
        monto:       T.tasaRegistral,
        obligatorio: true,
        descripcion: 'Tasa fija por trámite registral',
      })
      notas.push('El sellado puede variar según el monto de la prenda constituida.')
      esAproximado = true
      break
    }

    case 'inhibicion': {
      conceptos.push({
        concepto:    'Sellado de inhibición',
        monto:       T.inhibicion,
        obligatorio: true,
        descripcion: 'Inhibición general de bienes',
      })
      break
    }

    case 'levantamiento_inhibicion': {
      conceptos.push({
        concepto:    'Sellado levantamiento',
        monto:       T.levantamientoInhib,
        obligatorio: true,
        descripcion: 'Levantamiento de inhibición',
      })
      break
    }

    case 'descargo_multa': {
      conceptos.push({
        concepto:    'Sellado descargo de multa',
        monto:       T.descuentoMulta,
        obligatorio: true,
        descripcion: 'Descargo de multas PBA (aproximado)',
      })
      notas.push('El importe exacto depende de la multa y el juzgado interviniente.')
      esAproximado = true
      break
    }

    default: {
      conceptos.push({
        concepto:    'Tasas y sellados estimados',
        monto:       T.tasaRegistral + T.selladoFormulario,
        obligatorio: true,
        descripcion: 'Estimación para trámite no estándar',
      })
      esAproximado = true
    }
  }

  // ── GASTOS ADICIONALES ────────────────────────────────────────────────────

  if (incluirGastos) {
    conceptos.push({
      concepto:    'Gastos operativos',
      monto:       T.gastos.estacionamiento + T.gastos.fotocopias,
      obligatorio: false,
      descripcion: 'Estacionamiento, fotocopias y traslados',
    })
  }

  // ── HONORARIOS DE LA GESTORÍA ─────────────────────────────────────────────

  let honorarios: number
  if (honorariosCustom && honorariosCustom > 0) {
    honorarios = honorariosCustom
  } else if (honorariosPersonalizados?.[tipo as keyof typeof honorariosPersonalizados]) {
    honorarios = honorariosPersonalizados[tipo as keyof typeof honorariosPersonalizados] as number
  } else {
    honorarios = T.honorarios[tipo as keyof typeof T.honorarios] ?? T.honorarios.otro
  }

  // ── TOTALES ───────────────────────────────────────────────────────────────

  const subtotalDNRPA  = conceptos
    .filter(c => c.obligatorio)
    .reduce((a, c) => a + c.monto, 0)

  const subtotalGastos = conceptos
    .filter(c => !c.obligatorio)
    .reduce((a, c) => a + c.monto, 0)

  const totalFinal = subtotalDNRPA + subtotalGastos + honorarios

  notas.push('Los valores DNRPA se actualizan periódicamente. Verificar antes de emitir presupuesto formal.')
  if (tipo === 'transferencia' && valorFiscal > 0) {
    notas.push(`Valor fiscal ingresado: $${valorFiscal.toLocaleString('es-AR')}`)
  }

  return {
    tipo,
    tipoLabel:     formatTipo(tipo),
    valorFiscal,
    conceptos,
    subtotalDNRPA: Math.round(subtotalDNRPA),
    honorariosGest: Math.round(honorarios),
    totalFinal:    Math.round(totalFinal),
    esAproximado,
    notas,
  }
}

// ─── TRÁMITES QUE REQUIEREN VALOR FISCAL ─────────────────────────────────────

export const REQUIERE_VALOR_FISCAL: TipoTramite[] = [
  'transferencia',
]

// ─── EXPORTAR TABLA PARA ACTUALIZACIÓN ───────────────────────────────────────

export function getTablaActual() {
  return TABLA_BASE_2025
}
