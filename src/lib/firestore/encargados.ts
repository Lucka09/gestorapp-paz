// src/lib/firestore/encargados.ts
// ─── ENCARGADOS DE MULTAS Y REFERIDOS ────────────────────────────────────────
//
// Hoy el referido vive como TEXTO LIBRE en `cliente.origenNombre`. Eso trae
// tres problemas: "Julian Zeiss" y "JULIAN ZEISS" son dos entidades distintas
// en las métricas, no hay forma de guardar su teléfono, y si el secretario que
// lo trajo se va, el contacto se pierde.
//
// Acá pasan a ser entidades con id propio.
//
// AISLAMIENTO
//   Cada secretario ve solo los suyos (`asignadoA`). El CEO y los admin ven
//   todos. El encargado NO se borra si el secretario se va: se reasigna, y el
//   historial de clientes y comisiones queda intacto.

import {
  collection, doc, addDoc, getDoc, getDocs, query, where, orderBy,
  updateDoc, onSnapshot, serverTimestamp, limit,
  type Timestamp, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { registrarActividad } from './audit'
import type { Rol, OrigenCanal } from '@/types'

export const encargadosCol = collection(db, 'encargados')

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export type TipoEncargado =
  | 'encargado_multas'
  | 'concesionaria'
  | 'agencia'
  | 'reventa'
  | 'referido_persona'

export const TIPO_ENCARGADO_LABELS: Record<TipoEncargado, string> = {
  encargado_multas: 'Encargado de Multas',
  concesionaria:    'Concesionaria',
  agencia:          'Agencia',
  reventa:          'Reventa / Automotora',
  referido_persona: 'Referido (persona)',
}

export interface Encargado {
  id:         string
  gestoriaId: string
  // — Contacto —
  nombre:     string          // obligatorio
  apellido:   string          // obligatorio
  telefono:   string          // obligatorio
  email?:     string
  instagram?: string
  notas?:     string
  tipo:       TipoEncargado
  // — Relación —
  asignadoA:       string     // uid del secretario que lo trajo
  asignadoANombre: string
  activo:     boolean
  // — Comisión —
  /** Porcentaje pactado. Si es 0, la comisión se carga a mano en cada cobro. */
  comisionPct?: number
  // — Métricas cacheadas (las recalcula el hook, esto es para listados) —
  clientesAportados?:  number
  comisionesPagadas?:  number
  ultimoAporteEn?:     Timestamp
  // — Auditoría —
  creadoEn:   Timestamp
  creadoPor:  string
  actualizadoEn?: Timestamp
}

export type EncargadoInput = Omit<
  Encargado, 'id' | 'creadoEn' | 'actualizadoEn' | 'clientesAportados' | 'comisionesPagadas' | 'ultimoAporteEn'
>

// ─── LECTURA ──────────────────────────────────────────────────────────────────

/**
 * Los encargados que puede ver este usuario.
 * Un secretario ve los suyos; admin y propietario ven todos.
 *
 * Nota: son dos queries distintas y no una con filtro condicional, porque
 * Firestore evalúa las reglas contra la forma de la query. Mezclarlas haría
 * que la del secretario fuera rechazada.
 */
export function subscribeEncargados(
  gestoriaId: string,
  opts: { uid?: string; verTodos?: boolean },
  callback: (e: Encargado[]) => void,
): Unsubscribe {
  if (!gestoriaId) { callback([]); return () => {} }

  const filtros = [where('gestoriaId', '==', gestoriaId)]
  if (!opts.verTodos && opts.uid) filtros.push(where('asignadoA', '==', opts.uid))

  const q = query(encargadosCol, ...filtros, orderBy('nombre'), limit(500))

  return onSnapshot(
    q,
    snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as Encargado)),
    err  => { console.error('[encargados]', err.code, err.message); callback([]) },
  )
}

export async function getEncargado(id: string): Promise<Encargado | null> {
  const s = await getDoc(doc(encargadosCol, id))
  return s.exists() ? ({ ...s.data(), id: s.id } as Encargado) : null
}

// ─── ESCRITURA ────────────────────────────────────────────────────────────────

export interface ChequeoEncargado { ok: boolean; errores: string[] }

export function validarEncargado(e: Partial<EncargadoInput>): ChequeoEncargado {
  const errores: string[] = []
  if (!e.nombre?.trim())   errores.push('El nombre es obligatorio.')
  if (!e.apellido?.trim()) errores.push('El apellido es obligatorio.')
  const tel = String(e.telefono ?? '').replace(/\D/g, '')
  if (tel.length < 8)      errores.push('El teléfono es obligatorio y debe ser válido.')
  if (e.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email)) errores.push('Email inválido.')
  if (!e.tipo)             errores.push('Indicá de qué tipo es.')
  return { ok: errores.length === 0, errores }
}

export async function crearEncargado(
  input: EncargadoInput,
  ctx: { uid: string; nombre: string; rol: Rol },
): Promise<string> {
  const chequeo = validarEncargado(input)
  if (!chequeo.ok) throw new Error(chequeo.errores.join('\n'))

  // Duplicados por teléfono dentro de la gestoría. Se avisa pero no se bloquea:
  // dos secretarios pueden compartir un encargado legítimamente.
  const tel = String(input.telefono).replace(/\D/g, '').slice(-10)
  const dup = await getDocs(query(
    encargadosCol,
    where('gestoriaId', '==', input.gestoriaId),
    limit(200),
  ))
  const yaExiste = dup.docs.find(d => {
    const t = String((d.data() as any).telefono ?? '').replace(/\D/g, '').slice(-10)
    return t === tel
  })
  if (yaExiste) {
    const e = yaExiste.data() as any
    throw new Error(
      `Ya existe "${e.nombre} ${e.apellido}" con ese teléfono, ` +
      `asignado a ${e.asignadoANombre || 'otro secretario'}. ` +
      'Pedí que te lo compartan en vez de duplicarlo.',
    )
  }

  const ref = await addDoc(encargadosCol, {
    ...input,
    telefono: String(input.telefono).replace(/\D/g, ''),
    activo:   true,
    creadoEn: serverTimestamp(),
    creadoPor: ctx.uid,
  })

  await registrarActividad({
    gestoriaId:    input.gestoriaId,
    accion:        'crear',
    entidad:       'cliente',            // reusa la entidad existente
    entidadId:     ref.id,
    entidadLabel:  `${input.nombre} ${input.apellido} (${TIPO_ENCARGADO_LABELS[input.tipo]})`,
    usuarioId:     ctx.uid,
    usuarioNombre: ctx.nombre,
    usuarioRol:    ctx.rol,
    despues: { tipo: input.tipo, asignadoA: input.asignadoANombre },
  })

  return ref.id
}

export async function actualizarEncargado(
  id: string,
  cambios: Partial<EncargadoInput>,
): Promise<void> {
  await updateDoc(doc(encargadosCol, id), {
    ...cambios,
    actualizadoEn: serverTimestamp(),
  })
}

/**
 * Reasigna un encargado a otro secretario. Es el caso de "se va alguien del
 * equipo": el contacto y su historial no se pierden, cambian de dueño.
 */
export async function reasignarEncargado(
  id: string,
  nuevoUid: string,
  nuevoNombre: string,
  motivo: string,
  ctx: { uid: string; nombre: string; rol: Rol; gestoriaId: string },
): Promise<void> {
  if (motivo.trim().length < 10) {
    throw new Error('Indicá el motivo de la reasignación (mínimo 10 caracteres).')
  }
  const actual = await getEncargado(id)
  if (!actual) throw new Error('El encargado no existe.')

  await updateDoc(doc(encargadosCol, id), {
    asignadoA:       nuevoUid,
    asignadoANombre: nuevoNombre,
    actualizadoEn:   serverTimestamp(),
  })

  await registrarActividad({
    gestoriaId:    ctx.gestoriaId,
    accion:        'editar',
    entidad:       'cliente',
    entidadId:     id,
    entidadLabel:  `${actual.nombre} ${actual.apellido} — reasignación`,
    usuarioId:     ctx.uid,
    usuarioNombre: ctx.nombre,
    usuarioRol:    ctx.rol,
    antes:   { asignadoA: actual.asignadoANombre },
    despues: { asignadoA: nuevoNombre },
    nota:    motivo.trim(),
  })
}

// ─── MÉTRICAS ─────────────────────────────────────────────────────────────────

export interface MetricasEncargado {
  encargadoId:      string
  nombre:           string
  tipo:             TipoEncargado
  asignadoANombre:  string
  // Volumen
  clientes:         number
  tramites:         number
  tramitesActivos:  number
  // Plata
  cobradoBruto:     number   // lo que facturaron sus clientes
  comisionPagada:   number   // lo que se le entregó a él
  netoParaGestoria: number   // lo que quedó después de su comisión
  // Tiempo
  antiguedadDias:   number
  ultimoAporteEn:   Date | null
}

/**
 * Calcula las métricas cruzando encargados → clientes → trámites → recibos.
 * La comisión sale de `recibo.comisionReferido`, que es donde se registra al
 * cobrar.
 */
export async function getMetricasEncargados(
  gestoriaId: string,
  desde?: Date,
  hasta?: Date,
): Promise<MetricasEncargado[]> {
  if (!gestoriaId) return []

  const q = (c: string) => getDocs(query(collection(db, c), where('gestoriaId', '==', gestoriaId), limit(5000)))
  const [encS, cliS, traS, recS] = await Promise.all([
    getDocs(query(encargadosCol, where('gestoriaId', '==', gestoriaId), limit(500))),
    q('clientes'), q('tramites'), q('recibos'),
  ])

  const ahora = Date.now()
  const enRango = (t: any) => {
    if (!desde && !hasta) return true
    const ms = t?.toMillis?.() ?? 0
    return ms >= (desde?.getTime() ?? 0) && ms <= (hasta?.getTime() ?? ahora)
  }

  // clientes por encargado
  const cliPorEnc = new Map<string, string[]>()
  cliS.forEach(d => {
    const c = d.data() as any
    const id = c.encargadoId
    if (!id) return
    if (!cliPorEnc.has(id)) cliPorEnc.set(id, [])
    cliPorEnc.get(id)!.push(d.id)
  })

  const traPorCli = new Map<string, any[]>()
  traS.forEach(d => {
    const t = d.data() as any
    if (!t.clienteId) return
    if (!traPorCli.has(t.clienteId)) traPorCli.set(t.clienteId, [])
    traPorCli.get(t.clienteId)!.push(t)
  })

  const recPorCli = new Map<string, any[]>()
  recS.forEach(d => {
    const r = d.data() as any
    if (!r.clienteId) return
    if (!recPorCli.has(r.clienteId)) recPorCli.set(r.clienteId, [])
    recPorCli.get(r.clienteId)!.push(r)
  })

  return encS.docs.map(d => {
    const e = { ...d.data(), id: d.id } as Encargado
    const clientes = cliPorEnc.get(e.id) ?? []

    let tramites = 0, activos = 0, bruto = 0, comision = 0, neto = 0
    let ultimo = 0

    for (const cid of clientes) {
      for (const t of traPorCli.get(cid) ?? []) {
        tramites++
        if (t.estado !== 'entregado' && t.estado !== 'cancelado') activos++
      }
      for (const r of recPorCli.get(cid) ?? []) {
        if (!enRango(r.creadoEn)) continue
        const m = Number(r.monto ?? 0)
        if (m < 0) continue
        bruto    += m
        comision += Number(r.comisionReferido ?? 0)
        neto     += Number(r.netoGestoria ?? m)
        ultimo    = Math.max(ultimo, r.creadoEn?.toMillis?.() ?? 0)
      }
    }

    const creado = e.creadoEn?.toMillis?.() ?? ahora
    return {
      encargadoId: e.id,
      nombre: `${e.nombre} ${e.apellido}`.trim(),
      tipo: e.tipo,
      asignadoANombre: e.asignadoANombre ?? '',
      clientes: clientes.length,
      tramites, tramitesActivos: activos,
      cobradoBruto: bruto,
      comisionPagada: comision,
      netoParaGestoria: neto,
      antiguedadDias: Math.floor((ahora - creado) / 86_400_000),
      ultimoAporteEn: ultimo ? new Date(ultimo) : null,
    }
  }).sort((a, b) => b.cobradoBruto - a.cobradoBruto)
}

/** Total de comisiones pagadas en el período. Va al desglose del CEO. */
export async function getComisionesDelPeriodo(
  gestoriaId: string, desde: Date, hasta: Date,
): Promise<{ total: number; porEncargado: Record<string, number> }> {
  const snap = await getDocs(query(
    collection(db, 'recibos'),
    where('gestoriaId', '==', gestoriaId),
    limit(5000),
  ))
  let total = 0
  const porEncargado: Record<string, number> = {}
  snap.forEach(d => {
    const r = d.data() as any
    const ms = r.creadoEn?.toMillis?.() ?? 0
    if (ms < desde.getTime() || ms > hasta.getTime()) return
    const c = Number(r.comisionReferido ?? 0)
    if (c <= 0) return
    total += c
    const k = String(r.comisionDestino || r.encargadoId || 'Sin identificar')
    porEncargado[k] = (porEncargado[k] ?? 0) + c
  })
  return { total, porEncargado }
}

// ─── CAMPOS NUEVOS EN OTRAS ENTIDADES ────────────────────────────────────────
//
// Cliente (src/types/index.ts):
//   encargadoId?:     string   // referencia al encargado
//   encargadoNombre?: string   // desnormalizado, para listados sin join
//
// Tramite:
//   encargadoId?:     string   // copiado del cliente al crear
//   encargadoNombre?: string
//
// Recibo (ReciboInput):
//   encargadoId?:     string   // a quién se le pagó la comisión
//   (comisionReferido y comisionDestino ya existen)


// ─── REGLA DE FIRESTORE ───────────────────────────────────────────────────────
/*
    match /encargados/{encId} {
      // Admin y propietario ven todos; el resto del staff solo los suyos.
      allow read:   if isAdmin() && docDeMiGestoria();
      allow read:   if isStaff() && docDeMiGestoria()
                    && resource.data.asignadoA == request.auth.uid;
      allow create: if isStaff() && nuevaDocDeMiGestoria();
      // Solo el dueño o un admin lo edita
      allow update: if isAdmin() && docDeMiGestoria();
      allow update: if isStaff() && docDeMiGestoria()
                    && resource.data.asignadoA == request.auth.uid;
      // No se borran: se desactivan. Así no se pierde el historial.
      allow delete: if false;
    }
*/


// ─── ÍNDICES ──────────────────────────────────────────────────────────────────
/*
  encargados: gestoriaId ASC, nombre ASC
  encargados: gestoriaId ASC, asignadoA ASC, nombre ASC
*/