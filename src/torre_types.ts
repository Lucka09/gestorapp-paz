// src/types/torre.types.ts
// ─── TORRE DE CONTROL — TIPOS ─────────────────────────────────────────────────
// Compatible con los tipos existentes en src/types/index.ts
// No modifica ningún tipo existente.

import { Timestamp } from 'firebase/firestore'

// ─── GEOLOCALIZACIÓN DE PRESENCIA ────────────────────────────────────────────
// Se captura en los pasos donde el gestor debe presentarse físicamente
// en un registro, delegación u oficina (P5 presentación, P6 retiro/postergar).

export interface GeoRegistro {
  lat:            number    // latitud WGS84
  lng:            number    // longitud WGS84
  precisionM:     number    // precisión GPS en metros
  capturadaEn:    Timestamp
  direccionAprox?: string   // resultado de reverse geocoding (Nominatim, opcional)
}

// ─── FOTO DE WORKFLOW ─────────────────────────────────────────────────────────

export interface FotoWorkflow {
  url:          string       // Firebase Storage download URL
  storageRef:   string       // path en Storage, ej: "gestoriaId/workflows/tramiteId/paso2/foto1.jpg"
  nombre:       string       // nombre original del archivo
  tamanoKb:     number       // tamaño en KB
  subidaPor:    string       // uid del usuario
  subidaEn:     Timestamp
  validadaOk:   boolean      // pasó la validación de calidad
  // Flag de admin para solicitar resubida
  adminFlag?:       boolean
  adminFlagPor?:    string   // uid del admin que la flagueó
  adminFlagNombre?: string   // nombre del admin
  adminFlagEn?:     Timestamp
  adminFlagNota?:   string
}

// ─── DATOS DE CADA PASO ───────────────────────────────────────────────────────

export interface PasoWorkflowBase {
  completadoPor:     string     // uid
  completadoPorNombre: string   // nombre visible
  completadoEn:      Timestamp
}

export interface Paso1Data extends PasoWorkflowBase {
  // Solo confirmación de recepción — sin datos extra
}

export interface Paso2Data extends PasoWorkflowBase {
  nombreTitular: string
  nroDni:        string
  fotos:         FotoWorkflow[]  // cantidad variable — frente/dorso de cada doc
}

export interface Paso3Data extends PasoWorkflowBase {
  fotos: FotoWorkflow[]  // 1 foto — captura del sistema de precarga
}

export interface Paso4Data extends PasoWorkflowBase {
  fechaTurno:         string  // formato "YYYY-MM-DD"
  horaTurno:          string  // formato "HH:MM"
  registroUbicacion:  string  // nombre del registro, ej: "Seccional 3ª - San Martín"
  montoGestor:        number  // monto en pesos
  fotos:              FotoWorkflow[]  // 2 fotos del turno obtenido
}

export interface Paso5Data extends PasoWorkflowBase {
  fotos:     FotoWorkflow[]  // 1 foto — recibo de presentación
  ubicacion?: GeoRegistro    // geo al presentarse en el registro
}

// ─── PASO 6: CHAPA PATENTE (el más complejo) ──────────────────────────────────

export type EstadoChapaPatente =
  | 'pendiente'    // fecha asignada, esperando
  | 'atrasada'     // vencio el plazo sin confirmación del gestor
  | 'postergada'   // el gestor confirmó que no pudo retirar, nueva fecha asignada
  | 'retirada'     // el gestor confirmó retiro + foto cargada

export interface AuditModificacion {
  campo:             string
  valorAnterior:     unknown
  valorNuevo:        unknown
  modificadoPor:     string   // uid
  modificadoPorNombre: string
  modificadoPorRol:  string
  modificadoEn:      Timestamp
  nota?:             string
}

export interface IntentoRetiroChapa {
  numero:              number    // 1er intento, 2do, etc.
  fechaEstimada:       Timestamp // la que indicó el gestor para este intento
  diasIndicados:       number    // días que indicó
  resultado:           'postergado' | 'retirado'
  respondidoPor:       string    // uid del gestor
  respondidoPorNombre: string
  respondidoEn:        Timestamp
  nota?:               string    // texto libre opcional del gestor
  // Solo si resultado = postergado
  nuevosDias?:         number
  nuevaFechaEstimada?: Timestamp
  // Solo si resultado = retirado
  fotoChapaUrl?:       string
  // Geolocalización al ir al registro (retirar o postergar)
  ubicacion?:          GeoRegistro
  // Si admin modificó la fecha manualmente
  modificaciones?:     AuditModificacion[]
}

export interface Paso6Data {
  // Fecha inicial asignada por el gestor
  diasIndicados:         number
  fechaEstimadaRetiro:   Timestamp
  // Referenciado del Paso 4 automáticamente
  registroUbicacion:     string
  // Estado actual del ciclo
  estado:                EstadoChapaPatente
  // Historial completo de intentos (puede repetirse N veces)
  intentos:              IntentoRetiroChapa[]
  // Foto final de la chapa (solo cuando estado = retirada)
  fotoChapaUrl?:         string
  // Alertas enviadas (para no repetir)
  alertasEnviadas:       AlertaChapaEnviada[]
  // Quién inició el paso 6
  iniciadoPor:           string
  iniciadoPorNombre:     string
  iniciadoEn:            Timestamp
  // Quién lo cerró (cuando estado = retirada)
  cerradoPor?:           string
  cerradoPorNombre?:     string
  cerradoEn?:            Timestamp
}

export interface AlertaChapaEnviada {
  tipo:      '7d' | '5d' | '3d' | '24h' | 'dia_retiro'
  enviadaEn: Timestamp
  fechaRef:  Timestamp  // la fecha de retiro a la que refería esta alerta
}

export interface Paso7Data extends PasoWorkflowBase {
  // Archivado final
}

// ─── DOCUMENTO PRINCIPAL: InscripcionWorkflow ─────────────────────────────────
// Colección: `inscripcionWorkflow`
// ID del documento = tramiteId (1:1 con el trámite)

export interface InscripcionWorkflow {
  id:          string
  tramiteId:   string
  gestoriaId:  string
  pasoActual:  number     // 1 a 7

  paso1?: Paso1Data
  paso2?: Paso2Data
  paso3?: Paso3Data
  paso4?: Paso4Data
  paso5?: Paso5Data
  paso6?: Paso6Data
  paso7?: Paso7Data

  creadoEn:      Timestamp
  actualizadoEn: Timestamp
}

// ─── ALERTAS DE LA TORRE DE CONTROL ──────────────────────────────────────────

export type NivelAlerta = 'info' | 'amarillo' | 'naranja' | 'rojo' | 'critico'

export type TipoAlertaTorre =
  // Workflow de inscripción
  | 'sin_movimiento_48h'
  | 'sin_movimiento_72h'
  | 'sin_movimiento_5d'
  | 'paso_sin_asignar'
  | 'foto_con_flag_admin'
  // Chapa patente (paso 6)
  | 'chapa_7d'
  | 'chapa_5d'
  | 'chapa_3d'
  | 'chapa_24h'
  | 'chapa_hoy'
  | 'chapa_atrasada'
  | 'chapa_postergada'
  // Trámites generales
  | 'tramite_observado'
  | 'tramite_bloqueado'
  | 'vencimiento_proximo'
  | 'mandatario_sobrecarga'

export interface AlertaTorre {
  id:          string         // tramiteId + tipo (compuesto, para dedup)
  tramiteId:   string
  gestoriaId:  string
  tipo:        TipoAlertaTorre
  nivel:       NivelAlerta
  titulo:      string
  mensaje:     string
  // Para ACK
  reconocida:       boolean
  reconocidaPor?:   string
  reconocidaPorNombre?: string
  reconocidaEn?:    Timestamp
  comentario?:      string
  // Meta
  creadaEn:    Timestamp
  resueltaEn?: Timestamp
}

// ─── TRAMITE ENRIQUECIDO (calculado en el hook, no en Firestore) ──────────────
// Es el tipo que usa la Torre de Control internamente.
// Combina Tramite + workflow + alertLevel calculado.

import type { Tramite } from '@/types'

export interface TramiteEnriquecido extends Tramite {
  alertLevel:    NivelAlerta
  alertas:       AlertaTorre[]
  workflow?:     InscripcionWorkflow
  diasSinMovimiento: number
  // Para inscripciones con paso 6 activo
  diasHastaChapa?: number   // negativo si está vencido
}

// ─── ESTADÍSTICAS DE MANDATARIO ───────────────────────────────────────────────

export interface EstadisticasMandatario {
  uid:            string
  nombre:         string
  apellido:       string
  tramitesActivos: number
  criticos:       number
  demorados:      number
  bloqueados:     number
  finalizadosSemana: number
  eficiencia:     number   // 0-100
  estadoCarga:    'ok' | 'atencion' | 'sobrecarga'
}

// ─── CONFIGURACIÓN DE PASOS ───────────────────────────────────────────────────

export interface PasoConfig {
  id:           number
  codigo:       string
  titulo:       string
  subtitulo:    string
  descripcion:  string
  icono:        string
  color:        string
  fotos:        boolean
  cantidadFotos?: number | 'variable'
  labelFotos?:  string
  requiereDatos?: string[]
  accion?:      string
}

export const PASOS_INSCRIPCION: PasoConfig[] = [
  {
    id: 1, codigo: 'ASIGNADO',
    titulo: 'Asignado al Gestor', subtitulo: 'Sin documentación cargada',
    descripcion: 'Confirmá la recepción del trámite para iniciar la gestión.',
    icono: '📋', color: '#64748b', fotos: false, accion: 'Confirmar recepción',
  },
  {
    id: 2, codigo: 'DOCUMENTACION',
    titulo: 'Recepción de Documentación', subtitulo: 'Datos del titular + fotos de documentos',
    descripcion: 'Cargá nombre y DNI del titular. Subí foto de cada documento (ambas caras). Podés subir varios.',
    icono: '📄', color: '#3b82f6', fotos: true,
    cantidadFotos: 'variable', labelFotos: 'Documentos del titular',
    requiereDatos: ['nombreTitular', 'nroDni'], accion: 'Confirmar documentación',
  },
  {
    id: 3, codigo: 'PRECARGA',
    titulo: 'En Proceso de Precarga', subtitulo: 'Captura del sistema de precarga',
    descripcion: 'Realizá la precarga en el sistema y subí una captura/foto de la confirmación.',
    icono: '💻', color: '#8b5cf6', fotos: true,
    cantidadFotos: 1, labelFotos: 'Captura de precarga', accion: 'Confirmar precarga',
  },
  {
    id: 4, codigo: 'TURNO',
    titulo: 'Precarga OK — Turno Obtenido', subtitulo: 'Datos y fotos del turno',
    descripcion: 'Cargá los datos del turno y subí las 2 fotos correspondientes.',
    icono: '📅', color: '#f59e0b', fotos: true,
    cantidadFotos: 2, labelFotos: 'Fotos del turno',
    requiereDatos: ['fechaTurno', 'horaTurno', 'registroUbicacion', 'montoGestor'],
    accion: 'Confirmar turno',
  },
  {
    id: 5, codigo: 'PRESENTADO',
    titulo: 'Documentación Presentada', subtitulo: 'Foto del recibo de presentación',
    descripcion: 'Subí la foto del recibo o comprobante de presentación.',
    icono: '🧾', color: '#22c55e', fotos: true,
    cantidadFotos: 1, labelFotos: 'Recibo de presentación', accion: 'Confirmar presentación',
  },
  {
    id: 6, codigo: 'CHAPA_PATENTE',
    titulo: 'Chapa/Patente Pendiente', subtitulo: 'Aguardando retiro de chapa',
    descripcion: 'Indicá en cuántos días estará lista la chapa patente para retirar.',
    icono: '🚗', color: '#f97316', fotos: false, accion: undefined,
  },
  {
    id: 7, codigo: 'FINALIZADO',
    titulo: 'Finalizado y Archivado', subtitulo: 'Trámite completado',
    descripcion: 'La gestión fue completada y archivada correctamente.',
    icono: '✅', color: '#10b981', fotos: false, accion: undefined,
  },
]

// ─── HELPERS DE TIPO ─────────────────────────────────────────────────────────

export function esTramiteInscripcion(tramite: Tramite): boolean {
  return tramite.tipo === 'inscripcion_inicial'
}