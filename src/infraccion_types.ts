// src/infraccion_types.ts
// ─── CONSULTA DE INFRACCIONES — PORTAL PBA (infraccionesba.gba.gob.ar) ────────
//
// Dos capas de tipos:
//   1) RAW*  → forma EXACTA en que responde el portal (no tocar, es contrato externo)
//   2) Acta / ConsultaInfraccion → modelo normalizado interno de GestorApp
//
// El portal devuelve JSON limpio por GET a:
//   /rest/consultar-infraccion?dominio=XXX&reCaptcha=<token>&cantPorPagina=100&paginaActual=1
//
// ⚠️ Colisión de nombres: el response trae `infracciones` (que son ACTAS/causas),
// y cada acta trae OTRO `infracciones` (que son los artículos infringidos).
// En el modelo normalizado: afuera = `actas`, adentro = `detalles`.

import type { Timestamp } from 'firebase/firestore'
import type { DatosPresupuesto } from '@/lib/armarDatosPresupuesto'

// ─── CAPA 1 — RESPUESTA CRUDA DEL PORTAL ─────────────────────────────────────

export interface RawDetalleInfraccion {
  articulo:    string
  descripcion: string
}

export interface RawDescargo {
  id:             number | null
  idTipoDescargo: number | null
  estadoDescargo: string | null
  tipoDescargo:   string | null   // ej. "No Notificado"
  fechaCreacion:  number | null   // epoch ms
  observacion:    string | null
}

export interface RawEstadoCausa {
  colorHex:    string   // ej. "d9534f" (rojo), "f0ad4e" (ámbar), "5cb85c" (verde)
  descripcion: string   // ej. "CON DEUDA", "DESCARGO PENDIENTE VALIDACION", "SENTENCIA"
}

/** Un acta tal cual la devuelve el portal (elemento de `infracciones` de nivel raíz). */
export interface RawActa {
  id:                        number
  nroCausa:                  string
  nroActa:                   string
  dominio:                   string
  estaEnFecha:               boolean
  estaVencida:               boolean
  tieneLicenciaRetenida:     boolean
  tienePagoUnificadoVigente: boolean
  esNADVencida:              boolean
  esNADEmitida:              boolean
  esMultaDI:                 boolean
  sePuedePagarOnline:        boolean
  sePuedeImprimir:           boolean
  sePuedeImprimirOriginal:   boolean
  sePuedeGenerarDescargo:    boolean
  sePuedeGenerarProrroga:    boolean
  sePuedeAgregarEnCarrito:   boolean
  importeTotal:              number
  infracciones:              RawDetalleInfraccion[]   // ← detalles (artículos)
  autoridadAplicacion:       string
  fechaEmision:              number   // epoch ms
  fechaVencimiento:          number   // epoch ms
  esPlanPago:                boolean
  estadoPlanDePago:          string | null
  cuotas:                    unknown[]
  codigoBarra:               string
  estadoDescargo:            string | null
  tieneDescargo:             boolean
  descargo:                  RawDescargo | null
  debeDI:                    boolean
  conApremio:                boolean
  fechaInfraccion:           number   // epoch ms
  estadoCausaPublico:        RawEstadoCausa
  error:                     string | null
}

/** Respuesta completa del endpoint /rest/consultar-infraccion. */
export interface RawRespuestaPortal {
  totalInfracciones:    number
  error:                boolean
  cantPorPagina:        number
  paginaActual:         number
  totalRegistros:       number
  infracciones:         RawActa[]   // ← ACTAS (no confundir con los detalles internos)
  esConsultaPorDominio: boolean
  totalPaginas:         number
}

// ─── CAPA 2 — MODELO NORMALIZADO INTERNO ─────────────────────────────────────

export interface DetalleInfraccion {
  articulo:    string
  descripcion: string
}

/**
 * Clasificación comercial del acta. NO viene del portal: la calcula GestorApp
 * según la matriz configurable en `configuracion.cotizacionMultas`.
 * `trabajable` decide si entra en el presupuesto o va a exclusiones (fondo del PDF).
 */
export interface ClasificacionActa {
  trabajable:      boolean
  motivoExclusion: string | null   // texto para el PDF cuando trabajable=false
}

/** Acta ya normalizada: fechas como ISO, nombres limpios, sin colisiones. */
export interface Acta {
  id:                  number
  nroActa:             string
  nroCausa:            string
  dominio:             string

  // Montos
  importeTotal:        number
  codigoBarra:         string

  // Fechas (ISO yyyy-mm-dd, convertidas de epoch ms)
  fechaInfraccion:     string
  fechaEmision:        string
  fechaVencimiento:    string

  // Infracción concreta
  detalles:            DetalleInfraccion[]
  autoridadAplicacion: string

  // Estado de la causa
  estadoCausa:         string   // estadoCausaPublico.descripcion
  estadoColorHex:      string   // estadoCausaPublico.colorHex
  estaEnFecha:         boolean
  estaVencida:         boolean
  conApremio:          boolean
  debeDI:              boolean

  // Descargo previo (si ya hay uno presentado en el portal)
  tieneDescargo:       boolean
  tipoDescargo:        string | null
  fechaDescargo:       string | null

  sePuedeGenerarDescargo: boolean

  // Clasificación comercial (la agrega GestorApp)
  clasificacion:       ClasificacionActa
}

/** Resultado de cotizar un conjunto de actas de un dominio. */
export interface CotizacionMultas {
  actasTrabajables:    Acta[]
  actasExcluidas:      Acta[]
  cantidadTrabajable:  number
  cantidadExcluida:    number
  importeTotalDeuda:   number   // suma de importeTotal de las trabajables
  honorariosGestoria:  number   // según matriz de honorarios (config)
  detalleHonorarios:   string   // texto explicativo del cálculo aplicado
}

// ─── COLA DE CONSULTAS (Firestore: `consultasInfracciones`) ──────────────────

export type OrigenConsulta = 'web' | 'manual' | 'whatsapp'

export type EstadoConsulta =
  | 'pendiente'    // en cola, esperando que Jessica la procese con la extensión
  | 'consultada'   // actas capturadas del portal
  | 'cotizada'     // cotización + PDF generados
  | 'enviada'      // presupuesto enviado al contacto
  | 'sin_deuda'    // el portal no devolvió actas
  | 'descartada'   // el contacto no avanza / dato inválido

export interface ContactoConsulta {
  nombre:    string
  whatsapp:  string
  email?:    string
}

export interface ConsultaInfraccion {
  id:            string
  gestoriaId:    string
  tipoConsulta:  'dominio' | 'dni'
  dominio?:      string
  dni?:          string
  contacto:      ContactoConsulta
  origen:        OrigenConsulta
  estado:        EstadoConsulta

  actas?:        Acta[]
  cotizacion?:   CotizacionMultas

  prospectoId?:  string          // link al pipeline (etapa nuevo → presupuestado)
  pdfUrl?:       string
  mensajeWhatsapp?: string

  // Persistido por el frontend (PresupuestoMultas) al generar/enviar:
  // filas + totales + mensaje, para que imagen y texto nunca discrepen.
  datosPresupuesto?: DatosPresupuesto

  creadaEn:      Timestamp
  consultadaPor?:     string     // uid de quien la procesó (Jessica/Abigail)
  consultadaPorNombre?: string
  consultadaEn?:      Timestamp
}