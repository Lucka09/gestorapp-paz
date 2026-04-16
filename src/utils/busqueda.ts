import type { Cliente, Vehiculo, Tramite, Turno } from '@/types'
import { TIPO_TRAMITE_LABELS, ESTADO_TRAMITE_LABELS } from '@/types'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export type TipoResultado = 'cliente' | 'vehiculo' | 'tramite' | 'turno'

export interface ResultadoBusqueda {
  id:          string
  tipo:        TipoResultado
  titulo:      string        // línea principal
  subtitulo:   string        // línea secundaria
  meta?:       string        // dato extra (estado, fecha, etc.)
  badge?:      string        // badge de color
  badgeCls?:   string        // clases tailwind del badge
  link:        string        // ruta a navegar al seleccionar
  score:       number        // relevancia 0–100
  raw:         any           // objeto original
}

// ─── NORMALIZAR TEXTO ─────────────────────────────────────────────────────────

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // quitar acentos
    .trim()
}

// ─── SCORE DE RELEVANCIA ──────────────────────────────────────────────────────

function score(texto: string, query: string): number {
  const t = norm(texto)
  const q = norm(query)
  if (!t || !q) return 0
  if (t === q)           return 100
  if (t.startsWith(q))   return 90
  if (t.includes(q))     return 70
  // Coincidencia parcial por palabras
  const words = q.split(' ').filter(Boolean)
  const hits  = words.filter(w => t.includes(w)).length
  if (hits > 0) return Math.round((hits / words.length) * 50)
  return 0
}

function maxScore(...args: number[]): number {
  return Math.max(...args, 0)
}

// ─── BUSCAR EN CLIENTES ───────────────────────────────────────────────────────

export function buscarClientes(
  clientes: Cliente[],
  query:    string
): ResultadoBusqueda[] {
  if (!query.trim()) return []
  const q = norm(query)

  return clientes
    .map(c => {
      const nombreComp = `${c.apellido} ${c.nombre}`
      const s = maxScore(
        score(nombreComp,     query),
        score(c.dni,          query),
        score(c.telefono,     query),
        score(c.email ?? '',  query),
        score(c.localidad ?? '', query),
      )
      if (s === 0) return null

      return {
        id:         c.id,
        tipo:       'cliente' as TipoResultado,
        titulo:     `${c.apellido}, ${c.nombre}`,
        subtitulo:  [c.telefono, c.email].filter(Boolean).join(' · '),
        meta:       c.localidad ?? '',
        badge:      `DNI ${c.dni}`,
        badgeCls:   'bg-gray-100 text-gray-600',
        link:       `/admin/clientes/${c.id}`,
        score:      s,
        raw:        c,
      } as ResultadoBusqueda
    })
    .filter(Boolean) as ResultadoBusqueda[]
}

// ─── BUSCAR EN VEHÍCULOS ──────────────────────────────────────────────────────

export function buscarVehiculos(
  vehiculos: Vehiculo[],
  query:     string,
  clienteMap: Record<string, Cliente>
): ResultadoBusqueda[] {
  if (!query.trim()) return []

  return vehiculos
    .map(v => {
      const titular = clienteMap[v.clienteId]
      const desc    = `${v.marca} ${v.modelo} ${v.anio}`
      const s = maxScore(
        score(v.patente,       query) * 1.2,  // patente tiene más peso
        score(desc,            query),
        score(v.nroChasis ?? '', query),
        score(v.nroMotor  ?? '', query),
        titular ? score(`${titular.apellido} ${titular.nombre}`, query) * 0.8 : 0,
      )
      if (s === 0) return null

      return {
        id:        v.id,
        tipo:      'vehiculo' as TipoResultado,
        titulo:    v.patente,
        subtitulo: `${desc}${titular ? ` — ${titular.apellido}, ${titular.nombre}` : ''}`,
        meta:      v.color ?? '',
        badge:     v.tipo.charAt(0).toUpperCase() + v.tipo.slice(1),
        badgeCls:  'bg-blue-100 text-blue-700',
        link:      `/admin/vehiculos/${v.id}`,
        score:     Math.min(s, 100),
        raw:       v,
      } as ResultadoBusqueda
    })
    .filter(Boolean) as ResultadoBusqueda[]
}

// ─── BUSCAR EN TRÁMITES ───────────────────────────────────────────────────────

const ESTADO_BADGE_CLS: Record<string, string> = {
  pendiente:               'bg-yellow-100 text-yellow-700',
  en_proceso:              'bg-blue-100 text-blue-700',
  documentacion_requerida: 'bg-red-100 text-red-700',
  en_organismo:            'bg-orange-100 text-orange-700',
  listo_para_retirar:      'bg-emerald-100 text-emerald-700',
  entregado:               'bg-green-100 text-green-700',
  cancelado:               'bg-gray-100 text-gray-500',
}

export function buscarTramites(
  tramites:   Tramite[],
  query:      string,
  clienteMap: Record<string, Cliente>
): ResultadoBusqueda[] {
  if (!query.trim()) return []

  return tramites
    .map(t => {
      const cliente  = clienteMap[t.clienteId]
      const tipoLabel = TIPO_TRAMITE_LABELS[t.tipo] ?? t.tipo
      const s = maxScore(
        score(t.patente ?? '',  query) * 1.2,
        score(t.numero  ?? '',  query) * 1.1,
        score(tipoLabel,        query),
        cliente ? score(`${cliente.apellido} ${cliente.nombre}`, query) * 0.9 : 0,
        score(t.descripcion ?? '', query) * 0.5,
      )
      if (s === 0) return null

      const estadoLabel = ESTADO_TRAMITE_LABELS[t.estado] ?? t.estado

      return {
        id:        t.id,
        tipo:      'tramite' as TipoResultado,
        titulo:    `${tipoLabel} — ${t.patente ?? ''}`,
        subtitulo: cliente ? `${cliente.apellido}, ${cliente.nombre}` : '—',
        meta:      t.numero ?? '',
        badge:     estadoLabel,
        badgeCls:  ESTADO_BADGE_CLS[t.estado] ?? 'bg-gray-100 text-gray-500',
        link:      `/admin/tramites/${t.id}`,
        score:     Math.min(s, 100),
        raw:       t,
      } as ResultadoBusqueda
    })
    .filter(Boolean) as ResultadoBusqueda[]
}

// ─── BUSCAR EN TURNOS ─────────────────────────────────────────────────────────

export function buscarTurnos(
  turnos:     Turno[],
  query:      string,
  clienteMap: Record<string, Cliente>
): ResultadoBusqueda[] {
  if (!query.trim()) return []

  return turnos
    .map(t => {
      const cliente   = clienteMap[t.clienteId]
      const tipoLabel = TIPO_TRAMITE_LABELS[t.tipoTramite] ?? t.tipoTramite
      const fechaStr  = t.fecha?.toDate?.()?.toLocaleDateString('es-AR') ?? ''
      const s = maxScore(
        cliente ? score(`${cliente.apellido} ${cliente.nombre}`, query) : 0,
        score(tipoLabel, query),
        score(fechaStr,  query),
      )
      if (s === 0) return null

      return {
        id:        t.id,
        tipo:      'turno' as TipoResultado,
        titulo:    tipoLabel,
        subtitulo: cliente ? `${cliente.apellido}, ${cliente.nombre}` : '—',
        meta:      `${fechaStr}${t.horaInicio ? ` · ${t.horaInicio} hs` : ''}`,
        badge:     t.estado === 'confirmado' ? 'Confirmado' : 'Pendiente',
        badgeCls:  t.estado === 'confirmado'
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-yellow-100 text-yellow-700',
        link:      '/admin/turnos',
        score:     Math.min(s, 100),
        raw:       t,
      } as ResultadoBusqueda
    })
    .filter(Boolean) as ResultadoBusqueda[]
}

// ─── BÚSQUEDA UNIFICADA ───────────────────────────────────────────────────────

export interface DatosBusqueda {
  clientes:  Cliente[]
  vehiculos: Vehiculo[]
  tramites:  Tramite[]
  turnos:    Turno[]
}

export function buscarTodo(
  datos: DatosBusqueda,
  query: string,
  limite = 12
): ResultadoBusqueda[] {
  if (!query.trim() || query.length < 2) return []

  const clienteMap = Object.fromEntries(datos.clientes.map(c => [c.id, c]))

  const todos = [
    ...buscarClientes(datos.clientes, query),
    ...buscarVehiculos(datos.vehiculos, query, clienteMap),
    ...buscarTramites(datos.tramites, query, clienteMap),
    ...buscarTurnos(datos.turnos, query, clienteMap),
  ]

  // Ordenar por score descendente, luego por tipo
  const ORDEN_TIPO: Record<TipoResultado, number> = {
    cliente: 0, vehiculo: 1, tramite: 2, turno: 3,
  }

  return todos
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo]
    })
    .slice(0, limite)
}

// ─── LABELS DE TIPO ───────────────────────────────────────────────────────────

export const TIPO_LABEL: Record<TipoResultado, string> = {
  cliente:  'Cliente',
  vehiculo: 'Vehículo',
  tramite:  'Trámite',
  turno:    'Turno',
}

export const TIPO_EMOJI: Record<TipoResultado, string> = {
  cliente:  '👤',
  vehiculo: '🚗',
  tramite:  '📋',
  turno:    '📅',
}
