// src/types/campana_types.ts

import type { Timestamp } from 'firebase/firestore'

// ─── ESTADOS ──────────────────────────────────────────────────────────────────

export type EstadoCampana =
  | 'borrador'      // en edición, no enviada
  | 'programada'    // con fecha futura configurada
  | 'enviando'      // Cloud Function procesando envíos
  | 'completada'    // todos los envíos procesados
  | 'pausada'       // interrumpida manualmente
  | 'cancelada'

export type EstadoEnvio =
  | 'pendiente'     // en cola
  | 'enviado'       // Meta aceptó el mensaje
  | 'entregado'     // webhook delivered
  | 'leido'         // webhook read
  | 'respondido'    // el contacto contestó → lead caliente
  | 'fallido'       // error de Meta API
  | 'bloqueado'     // número inválido o bloqueó la gestoria

// ─── SEGMENTACIÓN ─────────────────────────────────────────────────────────────

export type CriterioAudiencia =
  | 'todos_clientes'             // toda la base
  | 'con_tramite_activo'         // tienen trámite en_proceso
  | 'sin_tramite_reciente'       // sin trámite en los últimos N meses
  | 'vencimiento_proximo'        // vencimiento en los próximos N días
  | 'por_tipo_tramite'           // filtra por tipo específico
  | 'respondieron_campana'       // respondieron a una campaña anterior
  | 'no_respondieron_campana'    // no respondieron campaña anterior

export interface FiltroAudiencia {
  criterio:           CriterioAudiencia
  mesesSinTramite?:   number           // para 'sin_tramite_reciente'
  diasVencimiento?:   number           // para 'vencimiento_proximo'
  tipoTramite?:       string           // para 'por_tipo_tramite'
  campanaRefId?:      string           // para respondieron/no_respondieron
}

// ─── TEMPLATE ─────────────────────────────────────────────────────────────────

export interface VariableTemplate {
  nombre:      string   // ej: "nombre_cliente"
  descripcion: string   // ej: "Nombre del titular"
  ejemplo:     string   // ej: "Juan García"
}

export interface TemplateCampana {
  nombreMeta:  string               // nombre exacto en Meta Business Manager
  idioma:      string               // 'es' | 'es_AR'
  categoria:   'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  cuerpo:      string               // texto con {{1}} {{2}} como placeholders
  variables:   VariableTemplate[]   // definición de cada variable
  aprobado:    boolean
}

// ─── MÉTRICAS ─────────────────────────────────────────────────────────────────

export interface MetricasCampana {
  totalContactos:  number
  enviados:        number
  entregados:      number
  leidos:          number
  respondidos:     number
  fallidos:        number
  // Calculados
  tasaApertura:    number   // leidos/enviados %
  tasaRespuesta:   number   // respondidos/enviados %
  costoPorLead:    number   // costoTotal/respondidos USD
  roi:             number   // tramitesCerrados * honorarioPromedio / costoTotal
}

// ─── ENVÍO INDIVIDUAL ─────────────────────────────────────────────────────────

export interface EnvioCampana {
  id:           string
  campanaId:    string
  gestoriaId:   string
  clienteId:    string
  nombre:       string
  telefono:     string   // formato: 549XXXXXXXXXX
  estado:       EstadoEnvio
  waMessageId?: string   // ID de mensaje de Meta
  variables:    string[] // valores interpolados en el template
  enviadoEn?:   Timestamp
  entregadoEn?: Timestamp
  leidoEn?:     Timestamp
  respondidoEn?: Timestamp
  error?:       string
  // Lead tracking
  convirtioPipelineId?: string  // id del prospecto creado si respondió
}

// ─── CAMPAÑA ──────────────────────────────────────────────────────────────────

export interface Campana {
  id:             string
  gestoriaId:     string
  nombre:         string
  descripcion?:   string
  estado:         EstadoCampana
  template:       TemplateCampana
  filtro:         FiltroAudiencia
  // Audiencia resuelta al momento del envío
  totalAudiencia: number
  // Programación
  programadaPara?: Timestamp   // null = envío inmediato
  // Costos Meta API
  costoUSD:        number      // acumulado real
  // Métricas
  metricas:        MetricasCampana
  // Metadata
  creadoPor:       string
  creadoPorNombre: string
  creadoEn:        Timestamp
  actualizadoEn:   Timestamp
  iniciadaEn?:     Timestamp
  completadaEn?:   Timestamp
}

export type CampanaInput = Omit<
  Campana,
  'id' | 'creadoEn' | 'actualizadoEn' | 'metricas' | 'costoUSD' | 'totalAudiencia'
>

// ─── TEMPLATES PREDEFINIDOS ───────────────────────────────────────────────────

export const TEMPLATES_PREDEFINIDOS: TemplateCampana[] = [
  {
    nombreMeta: 'gp_recordatorio_vencimiento',
    idioma:     'es_AR',
    categoria:  'UTILITY',
    aprobado:   false,
    cuerpo:     'Hola {{1}} 👋 Te recordamos desde *Gestoría Paz* que el vencimiento de tu vehículo {{2}} es el *{{3}}*. ¿Querés que lo gestionemos? Respondé *SI* y te contactamos. 🚗 _Trámites sin vueltas._',
    variables: [
      { nombre: 'nombre_cliente',   descripcion: 'Nombre del titular',     ejemplo: 'Juan' },
      { nombre: 'patente_vehiculo', descripcion: 'Patente del vehículo',   ejemplo: 'AB 123 CD' },
      { nombre: 'fecha_vencimiento',descripcion: 'Fecha de vencimiento',   ejemplo: '30/06/2026' },
    ],
  },
  {
    nombreMeta: 'gp_reactivacion_cliente',
    idioma:     'es_AR',
    categoria:  'MARKETING',
    aprobado:   false,
    cuerpo:     'Hola {{1}} 😊 Hace un tiempo que no sabemos de vos. En *Gestoría Paz* seguimos a tu disposición para transferencias, inscripciones y todo lo que necesites del automotor. ¿En qué te podemos ayudar? ✅ _Trámites sin vueltas._',
    variables: [
      { nombre: 'nombre_cliente', descripcion: 'Nombre del titular', ejemplo: 'María' },
    ],
  },
  {
    nombreMeta: 'gp_campana_general',
    idioma:     'es_AR',
    categoria:  'MARKETING',
    aprobado:   false,
    cuerpo:     'Hola {{1}} 🚗 ¿Sabías que en *Gestoría Paz* podés hacer tu {{2}} sin moverte de casa? Te asesoramos y gestionamos todo. Escribinos para más info. _Trámites sin vueltas._',
    variables: [
      { nombre: 'nombre_cliente', descripcion: 'Nombre del titular', ejemplo: 'Carlos' },
      { nombre: 'tipo_tramite',   descripcion: 'Tipo de trámite',    ejemplo: 'transferencia' },
    ],
  },
]

export const CRITERIO_LABELS: Record<CriterioAudiencia, string> = {
  todos_clientes:          'Todos los clientes',
  con_tramite_activo:      'Con trámite activo',
  sin_tramite_reciente:    'Sin trámite reciente',
  vencimiento_proximo:     'Vencimiento próximo',
  por_tipo_tramite:        'Por tipo de trámite',
  respondieron_campana:    'Respondieron campaña anterior',
  no_respondieron_campana: 'No respondieron campaña anterior',
}

export const ESTADO_CAMPANA_LABELS: Record<EstadoCampana, string> = {
  borrador:   'Borrador',
  programada: 'Programada',
  enviando:   'Enviando',
  completada: 'Completada',
  pausada:    'Pausada',
  cancelada:  'Cancelada',
}

export const ESTADO_CAMPANA_COLORS: Record<EstadoCampana, string> = {
  borrador:   'bg-gray-100 text-gray-600',
  programada: 'bg-blue-100 text-blue-700',
  enviando:   'bg-amber-100 text-amber-700',
  completada: 'bg-emerald-100 text-emerald-700',
  pausada:    'bg-orange-100 text-orange-700',
  cancelada:  'bg-red-100 text-red-700',
}

// Costo aproximado por conversación de marketing en Argentina (USD)
export const COSTO_CONVERSACION_USD = 0.016