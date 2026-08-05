export interface RawDetalleInfraccion {
  articulo:    string
  descripcion: string
}

export interface RawDescargo {
  id:             number | null
  idTipoDescargo: number | null
  estadoDescargo: string | null
  tipoDescargo:   string | null
  fechaCreacion:  number | null
  observacion:    string | null
}

export interface RawEstadoCausa {
  colorHex:    string
  descripcion: string
}

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
  infracciones:              RawDetalleInfraccion[]
  autoridadAplicacion:       string
  fechaEmision:              number
  fechaVencimiento:           number
  esPlanPago:                boolean
  estadoPlanDePago:          string | null
  cuotas:                    unknown[]
  codigoBarra:               string
  estadoDescargo:            string | null
  tieneDescargo:             boolean
  descargo:                  RawDescargo | null
  debeDI:                    boolean
  conApremio:                boolean
  fechaInfraccion:           number
  estadoCausaPublico:        RawEstadoCausa
  error:                     string | null
}

export interface RawRespuestaPortal {
  totalInfracciones:    number
  error:                boolean
  cantPorPagina:        number
  paginaActual:         number
  totalRegistros:       number
  infracciones:         RawActa[]
  esConsultaPorDominio: boolean
  totalPaginas:         number
}

export interface DetalleInfraccion {
  articulo:    string
  descripcion: string
}

export interface ClasificacionActa {
  trabajable:      boolean
  motivoExclusion: string | null
}

export interface Acta {
  id:                  number
  nroActa:             string
  nroCausa:            string
  dominio:             string
  importeTotal:        number
  codigoBarra:         string
  fechaInfraccion:     string
  fechaEmision:        string
  fechaVencimiento:    string
  detalles:            DetalleInfraccion[]
  autoridadAplicacion: string
  estadoCausa:         string
  estadoColorHex:      string
  estaEnFecha:         boolean
  estaVencida:         boolean
  conApremio:          boolean
  debeDI:              boolean
  tieneDescargo:       boolean
  tipoDescargo:        string | null
  fechaDescargo:       string | null
  sePuedeGenerarDescargo: boolean
  clasificacion:       ClasificacionActa
}

export interface CotizacionMultas {
  actasTrabajables:    Acta[]
  actasExcluidas:      Acta[]
  cantidadTrabajable:  number
  cantidadExcluida:    number
  importeTotalDeuda:   number
  honorariosGestoria:  number
  detalleHonorarios:   string
}
