import {
  getDoc, addDoc, updateDoc, deleteDoc, getDocs, query, where,
  orderBy, serverTimestamp, onSnapshot, Timestamp,
  startAfter, getCountFromServer,
  type CollectionReference, type DocumentData, type Unsubscribe,
  type QueryConstraint, type QueryDocumentSnapshot,
  arrayUnion, limit,
} from 'firebase/firestore'
import { tramitesCol, tramiteDoc, vehiculoDoc, clienteDoc } from './collections'
import { generarNumeroTramite, CODIGO_TRAMITE } from './collections'
import { registrarActividad } from './audit'
import { notificarCambioEstado } from './notificaciones'
import type { Tramite, EstadoTramite, TipoTramite, Rol } from '@/types'
import { crearRecibo, generarNumeroRecibo } from './recibos'
import { notificarRecibo } from './alertas'
import { emitirEventoSilencioso } from './eventos'
import { crearEvento } from '@/types'
// ─── READ ─────────────────────────────────────────────────────────────────────

export function subscribeTramites(
  gestoriaId: string,
  callback:   (tramites: Tramite[]) => void
): Unsubscribe {
  const q = query(
    tramitesCol,
    where('gestoriaId', '==', gestoriaId),
    orderBy('creadoEn', 'desc'),
    limit(300)  // ⚡ evita lecturas ilimitadas
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as Tramite))
  )
}

// ⚡ getDocs version para TanStack Query (no mantiene listener permanente)
export async function getTramites(gestoriaId: string, cantidad = 300): Promise<Tramite[]> {
  const snap = await getDocs(query(
    tramitesCol,
    where('gestoriaId', '==', gestoriaId),
    orderBy('creadoEn', 'desc'),
    limit(cantidad),
  ))
  return snap.docs.map(d => ({ ...d.data(), id: d.id }) as Tramite)
}


// Trámites propios de un gestor (asignados o creados por su usuario)
export function subscribeTramitesPropios(
  gestoriaId: string,
  uid:        string,
  callback:   (tramites: Tramite[]) => void
): Unsubscribe {
  const asignadosQ = query(
    tramitesCol,
    where('gestoriaId', '==', gestoriaId),
    where('asignadoA',  '==', uid)
  )
  const creadosQ = query(
    tramitesCol,
    where('gestoriaId', '==', gestoriaId),
    where('creadoPor',  '==', uid)
  )

  let asignados: Tramite[] = []
  let creados: Tramite[] = []

  const toMillis = (t: Tramite) => {
    const val = t.creadoEn as unknown as { toMillis?: () => number }
    if (val?.toMillis) return val.toMillis()
    return 0
  }

  const emitir = () => {
    const byId = new Map<string, Tramite>()
    ;[...asignados, ...creados].forEach(t => byId.set(t.id, t))
    const merged = Array.from(byId.values())
      .sort((a, b) => toMillis(b) - toMillis(a))
    callback(merged)
  }

  const unsubAsignados = onSnapshot(asignadosQ, snap => {
    asignados = snap.docs.map(d => ({ ...d.data(), id: d.id }) as Tramite)
    emitir()
  })

  const unsubCreados = onSnapshot(creadosQ, snap => {
    creados = snap.docs.map(d => ({ ...d.data(), id: d.id }) as Tramite)
    emitir()
  })

  return () => {
    unsubAsignados()
    unsubCreados()
  }
}

export async function getTramitesPropiosTodos(
  gestoriaId: string,
  uid:        string,
): Promise<Tramite[]> {
  const { getDocs: gd } = await import('firebase/firestore')

  const [asignadosSnap, creadosSnap] = await Promise.all([
    gd(query(
      tramitesCol,
      where('gestoriaId', '==', gestoriaId),
      where('asignadoA',  '==', uid)
    )),
    gd(query(
      tramitesCol,
      where('gestoriaId', '==', gestoriaId),
      where('creadoPor',  '==', uid)
    )),
  ])

  const byId = new Map<string, Tramite>()
  ;[...asignadosSnap.docs, ...creadosSnap.docs].forEach(d => {
    byId.set(d.id, { ...d.data(), id: d.id } as Tramite)
  })

  return Array.from(byId.values()).sort((a, b) => b.creadoEn.toMillis() - a.creadoEn.toMillis())
}

export function subscribeTramitesPorCliente(
  clienteId:  string,
  gestoriaId: string,
  callback:   (tramites: Tramite[]) => void
): Unsubscribe {
  const q = query(
    tramitesCol,
    where('gestoriaId', '==', gestoriaId),
    where('clienteId',  '==', clienteId),
    orderBy('creadoEn', 'desc')
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as Tramite))
  )
}

export function subscribeTramite(
  id:       string,
  callback: (t: Tramite | null) => void
): Unsubscribe {
  return onSnapshot(tramiteDoc(id), snap =>
    callback(snap.exists() ? ({ ...snap.data(), id: snap.id } as Tramite) : null)
  )
}

// ─── WRITE ────────────────────────────────────────────────────────────────────

export type TramiteInput = {
  gestoriaId:            string   // requerido — tenant scope
  tipo:                  TipoTramite
  clienteId:             string
  vehiculoId:            string
  patente:               string
  descripcion:           string
  observacionesInternas: string
  honorarios:            number
  asignadoA:             string | null
}

export async function crearTramite(
  data:      TramiteInput,
  creadoPor: string
): Promise<string> {
  const anioActual = new Date().getFullYear()
  const countSnap  = await getCountFromServer(
    query(tramitesCol,
      where('gestoriaId', '==', data.gestoriaId),
      where('tipo',       '==', data.tipo),
    )
  )
  const secuencial = countSnap.data().count + 1
  const numero     = generarNumeroTramite(data.tipo, secuencial)

  const ref = await addDoc(tramitesCol as CollectionReference<DocumentData>, {
    ...data,
    numero,
    estado:           'pendiente',
    documentos:       [],
    historialEstados: [],
    pagado:           false,
    fechaPago:        null,
    turnoId:          null,
    creadoPor,
    creadoEn:         serverTimestamp(),
    actualizadoEn:    serverTimestamp(),
  })

  // Vincular al vehículo (existente)
  const vRef  = vehiculoDoc(data.vehiculoId)
  const vSnap = await getDoc(vRef)
  if (vSnap.exists()) {
    const ids: string[] = vSnap.data().tramitesIds ?? []
    await updateDoc(vRef, { tramitesIds: [...ids, ref.id] })
  }

  // Evento fire-and-forget — todos los datos están en memoria
  emitirEventoSilencioso(crearEvento({
    gestoriaId:   data.gestoriaId,
    tipo:         'tramite.creado',
    entidad:      'tramite',
    entidadId:    ref.id,
    entidadLabel: `${numero} · ${data.patente}`,
    actorId:      creadoPor,
    actorTipo:    'usuario',
    payload:      { tipo: data.tipo, patente: data.patente, honorarios: data.honorarios },
    resumen:      `Nuevo trámite ${numero} (${data.tipo}) de ${data.patente}`,
  }))

  return ref.id
}

export async function cambiarEstado(
  id:             string,
  nuevoEstado:    EstadoTramite,
  nota:           string,
  cambiadoPor:    string,
  estadoAnterior: EstadoTramite,
  cambiadoPorNombre?: string,
): Promise<void> {
  // 1. Actualizar el trámite (existente)
  await updateDoc(tramiteDoc(id), {
    estado:        nuevoEstado,
    actualizadoEn: serverTimestamp(),
    historialEstados: arrayUnion({
      estadoAnterior,
      estadoNuevo:       nuevoEstado,
      cambiadoPor,
      cambiadoPorNombre: cambiadoPorNombre ?? null,
      fecha:             new Date(),
      nota:              nota ?? '',
    }),
  })

  // 1b. Eventos fire-and-forget (estado_cambiado, y completado si es entrega)
  void (async () => {
    try {
      const snap = await getDoc(tramiteDoc(id))
      if (!snap.exists()) return
      const t = { ...snap.data(), id: snap.id } as Tramite

      emitirEventoSilencioso(crearEvento({
        gestoriaId:   t.gestoriaId,
        tipo:         'tramite.estado_cambiado',
        entidad:      'tramite',
        entidadId:    id,
        entidadLabel: `${t.numero} · ${t.patente}`,
        actorId:      cambiadoPor,
        actorNombre:  cambiadoPorNombre,
        actorTipo:    'usuario',
        payload:      { estadoAnterior, estadoNuevo: nuevoEstado, nota },
        resumen:      `${t.numero} pasó de ${estadoAnterior} a ${nuevoEstado}`,
      }))

      // Si es entrega al cliente, también emitimos el evento de completado
      if (nuevoEstado === 'entregado') {
        emitirEventoSilencioso(crearEvento({
          gestoriaId:   t.gestoriaId,
          tipo:         'tramite.completado',
          entidad:      'tramite',
          entidadId:    id,
          entidadLabel: `${t.numero} · ${t.patente}`,
          actorId:      cambiadoPor,
          actorNombre:  cambiadoPorNombre,
          actorTipo:    'usuario',
          payload:      { estadoAnterior },
          resumen:      `${t.numero} entregado al cliente`,
        }))
      }
    } catch (e) {
      console.warn('[tramites] No se pudo emitir evento de estado:', e)
    }
  })()

  // 2-4. Notificación al portal del cliente (existente, sin cambios)
  try {
    const tSnap = await getDoc(tramiteDoc(id))
    if (!tSnap.exists()) return
    const tramite = { ...tSnap.data(), id: tSnap.id } as Tramite
    const cSnap = await getDoc(clienteDoc(tramite.clienteId))
    if (!cSnap.exists()) return
    const destinatarioId = cSnap.data().userId
    if (!destinatarioId) return
    await notificarCambioEstado({
      destinatarioId,
      tramiteId:   id,
      gestoriaId:  tramite.gestoriaId,
      numero:      tramite.numero,
      tipo:        tramite.tipo,
      patente:     tramite.patente,
      estadoNuevo: nuevoEstado,
      nota,
    })
  } catch {
    console.warn('[cambiarEstado] No se pudo notificar al cliente, estado actualizado correctamente')
  }
}

export async function actualizarTramite(
  id:   string,
  data: Partial<Pick<Tramite,
    'descripcion' | 'observacionesInternas' |
    'honorarios'  | 'pagado' | 'asignadoA'
  >>
): Promise<void> {
  await updateDoc(tramiteDoc(id), {
    ...data,
    actualizadoEn: serverTimestamp(),
  })
}

/** Cambia el estado operativo del trámite (en_proceso, completado, cancelado, etc.) */
export async function cambiarEstadoTramite(
  id:     string,
  estado: string,
  opts?: { completadoPor?: string; completadoPorNombre?: string }
): Promise<void> {
  await updateDoc(tramiteDoc(id), {
    estado,
    ...(estado === 'completado' ? {
      fechaCompletado:     serverTimestamp(),
      completadoPor:       opts?.completadoPor ?? null,
      completadoPorNombre: opts?.completadoPorNombre ?? null,
    } : {}),
    actualizadoEn: serverTimestamp(),
  })
}

/** Elimina un trámite permanentemente — solo Propietario */
export async function eliminarTramite(id: string): Promise<void> {
  await deleteDoc(tramiteDoc(id))
}

export async function marcarPagado(
  id:     string,
  pagado: boolean
): Promise<void> {
  await updateDoc(tramiteDoc(id), {
    pagado,
    fechaPago:     pagado ? serverTimestamp() : null,
    actualizadoEn: serverTimestamp(),
  })
}

export interface PagoTramite {
  monto:               number
  formaPago:           'efectivo' | 'transferencia' | 'cheque' | 'mixto' | 'mercadopago'
  fecha:               Timestamp
  notas:               string
  tipo:                'parcial' | 'total'   // calculado automáticamente
  numeroRecibo:        string
  reciboId:            string
  registradoPor:       string
  registradoPorNombre: string
}
 
export interface RegistroPago {
  monto:     number
  formaPago: 'efectivo' | 'transferencia' | 'cheque' | 'mixto' | 'mercadopago'
  fecha:     string   // ISO date (yyyy-mm-dd)
  notas?:    string
}
 
export interface ResultadoPago {
  tipo:         'parcial' | 'total'
  numeroRecibo: string
  reciboId:     string
}
 
// ─── REGISTRAR PAGO — acumula, calcula parcial/total, guarda recibo, alerta ──
//
// ⚠️ IMPORTANTE — TRÁMITES DE MULTA: por diseño (ver TramiteForm.tsx, comentario
// "Los honorarios y cobros se gestionan dentro del workflow de multa paso a
// paso"), los trámites tipo `descargo_multa` se crean con honorarios = 0 y
// su cobro se maneja aparte en GestorMultaWorkflow.tsx (paso2.historialPagos).
// Esta función NO debe usarse para esos trámites todavía — si se usa, el
// primer pago de cualquier monto va a marcar "total" porque honorarios=0.
// Mientras no migremos el workflow de multas a este sistema unificado,
// CobranzasPage debería excluir tipo === 'descargo_multa' de este flujo
// (ver nota al final de este archivo).
 
export async function registrarPago(
  id:   string,
  pago: RegistroPago,
  ctx:  { uid: string; nombre: string; rol: string; gestoriaId: string },
): Promise<ResultadoPago> {
  const snap = await getDoc(tramiteDoc(id))
  if (!snap.exists()) throw new Error('Trámite no encontrado')
  const tramite = { ...snap.data(), id: snap.id } as Tramite & { historialPagos?: PagoTramite[] }
 
  if (tramite.tipo === 'descargo_multa') {
    throw new Error(
      'Los trámites de multas se cobran desde el workflow (paso 2), no desde Cobranzas.'
    )
  }
 
  // 1. Cuánto se cobró hasta ahora (incluyendo este pago)
  const historialActual = tramite.historialPagos ?? []
  const cobradoPrevio    = historialActual.reduce((a, p) => a + p.monto, 0)
  const cobradoTotal     = cobradoPrevio + pago.monto
 
  // 2. Parcial o total — automático, no lo elige el usuario
  const tipo: 'parcial' | 'total' = cobradoTotal >= tramite.honorarios ? 'total' : 'parcial'
 
  // 3. Número de recibo correlativo
  const numeroRecibo = await generarNumeroRecibo(ctx.gestoriaId)
 
  // 4. Guardar metadata del recibo (el PDF se genera en el cliente, no acá)
  const reciboId = await crearRecibo({
    numeroRecibo,
    tramiteId:    id,
    clienteId:    tramite.clienteId,
    gestoriaId:   ctx.gestoriaId,
    tipo,
    monto:        pago.monto,
    montoCobradoAcumulado: cobradoTotal,
    honorariosTotales:     tramite.honorarios,
    formaPago:    pago.formaPago,
    notas:        pago.notas ?? '',
    patente:      tramite.patente,
    numeroTramite: tramite.numero,
    tipoTramite:  tramite.tipo,
    emitidoPor:        ctx.uid,
    emitidoPorNombre:  ctx.nombre,
  })
 
  const nuevoPago: PagoTramite = {
    monto:     pago.monto,
    formaPago: pago.formaPago,
    fecha:     Timestamp.fromDate(new Date(pago.fecha + 'T12:00:00')),
    notas:     pago.notas ?? '',
    tipo,
    numeroRecibo,
    reciboId,
    registradoPor:       ctx.uid,
    registradoPorNombre: ctx.nombre,
  }
 
  // 5. Persistir en el trámite: push al historial + flags para queries rápidas.
  //    Mantenemos `formaPago`/`notasPago` a nivel raíz por compatibilidad con
  //    código viejo que pudiera leerlos, aunque la fuente de verdad ahora es
  //    el array `historialPagos`.
  await updateDoc(tramiteDoc(id), {
    historialPagos: arrayUnion(nuevoPago),
    montoCobrado:   cobradoTotal,
    pagado:         tipo === 'total',
    formaPago:      pago.formaPago,
    notasPago:      pago.notas ?? '',
    fechaPago:      tipo === 'total' ? serverTimestamp() : (tramite as any).fechaPago ?? null,
    actualizadoEn:  serverTimestamp(),
  })
 
  // 6. Notificar (best-effort — el pago ya quedó guardado aunque esto falle)
  try {
    await notificarRecibo({
      gestoriaId: ctx.gestoriaId, tramiteId: id, reciboId, numeroRecibo,
      monto: pago.monto, tipo, patente: tramite.patente,
    })
  } catch (e) { console.error('[registrarPago] No se pudo crear la alerta:', e) }
 
  // 7. Auditoría
  await registrarActividad({
    accion: 'registrar_pago', entidad: 'tramite', entidadId: id,
    entidadLabel: tramite.patente, usuarioId: ctx.uid, usuarioNombre: ctx.nombre,
    usuarioRol: ctx.rol as Rol, gestoriaId: ctx.gestoriaId,
    despues: { monto: pago.monto, formaPago: pago.formaPago, tipo, numeroRecibo },
    nota: pago.notas || undefined,
  })
    // 8. Evento de pago (fire-and-forget)
  emitirEventoSilencioso(crearEvento({
    gestoriaId:   ctx.gestoriaId,
    tipo:         'pago.registrado',
    entidad:      'pago',
    entidadId:    reciboId,
    entidadLabel: `${tramite.numero} · ${tramite.patente}`,
    actorId:      ctx.uid,
    actorNombre:  ctx.nombre,
    actorRol:     ctx.rol as Rol,
    actorTipo:    'usuario',
    payload:      { monto: pago.monto, formaPago: pago.formaPago, tipo, numeroRecibo, tramiteId: id },
    resumen:      `Pago de $${pago.monto} (${tipo}) para ${tramite.patente} — ${numeroRecibo}`,
  }))

  return { tipo, numeroRecibo, reciboId }
}
 
export async function desmarcarPago(id: string): Promise<void> {
  // Vacía el historial — uso excepcional (error de carga). Si solo se quiere
  // corregir UN pago puntual sin perder el resto, avisame y agrego un
  // `eliminarPago(id, index)` en vez de este reset total.
  await updateDoc(tramiteDoc(id), {
    pagado: false, fechaPago: null, formaPago: '', notasPago: '',
    montoCobrado: 0, historialPagos: [], actualizadoEn: serverTimestamp(),
  })
}
// ─── TOKEN PÚBLICO PARA QR ────────────────────────────────────────────────────

function generarToken(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 20 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}

export async function obtenerOGenerarToken(id: string): Promise<string> {
  const snap = await getDoc(tramiteDoc(id))
  if (!snap.exists()) throw new Error('Trámite no encontrado')

  const data = snap.data()
  if (data.tokenPublico) return data.tokenPublico

  const token = generarToken()
  await updateDoc(tramiteDoc(id), {
    tokenPublico:  token,
    actualizadoEn: serverTimestamp(),
  })
  return token
}

// Buscar trámite por token (para la página pública — sin gestoriaId intencional)
export async function getTramitePorToken(token: string): Promise<Tramite | null> {
  const { getDocs: gd, query: q, where: w } = await import('firebase/firestore')
  const snap = await gd(q(tramitesCol, w('tokenPublico', '==', token)))
  if (snap.empty) return null
  const d = snap.docs[0]
  return { ...d.data(), id: d.id } as Tramite
}
// ─── FUNCIONES DE PAGINACIÓN (agregar a tramites.ts) ─────────────────────────
//
// Índices compuestos requeridos en Firestore (firestore.indexes.json).
// Firebase los sugiere automáticamente al ejecutar la query por primera vez
// en la consola con el error "requires an index".
//
// Los 4 índices necesarios (todos con __name__ ASC al final):
//   [gestoriaId ASC, creadoEn DESC]
//   [gestoriaId ASC, estado   ASC, creadoEn DESC]
//   [gestoriaId ASC, tipo     ASC, creadoEn DESC]
//   [gestoriaId ASC, estado   ASC, tipo ASC, creadoEn DESC]
//
// ─────────────────────────────────────────────────────────────────────────────

export const PAGE_SIZE_TRAMITES = 25

export type FiltrosTramitesPagina = {
  estado: EstadoTramite | 'todos'
  tipo:   TipoTramite   | 'todos'
}

/** Total de trámites del tenant, opcionalmente filtrado por estado/tipo. */
export async function getTramitesCount(
  gestoriaId: string,
  filtros?:   FiltrosTramitesPagina,
): Promise<number> {
  const constraints: QueryConstraint[] = [
    where('gestoriaId', '==', gestoriaId),
  ]
  if (filtros?.estado && filtros.estado !== 'todos')
    constraints.push(where('estado', '==', filtros.estado))
  if (filtros?.tipo && filtros.tipo !== 'todos')
    constraints.push(where('tipo', '==', filtros.tipo))

  const snap = await getCountFromServer(query(tramitesCol, ...constraints))
  return snap.data().count
}

/**
 * Una página de trámites con filtros opcionales, ordenada por fecha desc.
 * `cursor` = último DocumentSnapshot de la página anterior (null = página 1).
 */
export async function getTramitesPagina(
  gestoriaId: string,
  filtros:    FiltrosTramitesPagina,
  cursor:     QueryDocumentSnapshot<Tramite> | null,
  pageSize =  PAGE_SIZE_TRAMITES,
): Promise<{
  tramites: Tramite[]
  lastDoc:  QueryDocumentSnapshot<Tramite> | null
}> {
  const constraints: QueryConstraint[] = [
    where('gestoriaId', '==', gestoriaId),
  ]
  if (filtros.estado !== 'todos') constraints.push(where('estado', '==', filtros.estado))
  if (filtros.tipo   !== 'todos') constraints.push(where('tipo',   '==', filtros.tipo))
  constraints.push(orderBy('creadoEn', 'desc'))
  if (cursor) constraints.push(startAfter(cursor))
  constraints.push(limit(pageSize))

  const snap = await getDocs(query(tramitesCol, ...constraints))
  return {
    tramites: snap.docs.map(d => ({ ...d.data(), id: d.id })),
    lastDoc:  (snap.docs[snap.docs.length - 1] ?? null) as QueryDocumentSnapshot<Tramite> | null,
  }
}

/**
 * Todos los trámites del tenant con filtros opcionales — sin límite.
 * Usarlo solo para:
 *   - Búsqueda de texto (cuando el usuario escribe en el buscador)
 *   - Exportación a Excel (cuando el usuario hace click en Exportar)
 */
export async function getTramitesTodos(
  gestoriaId: string,
  filtros?:   FiltrosTramitesPagina,
): Promise<Tramite[]> {
  const constraints: QueryConstraint[] = [
    where('gestoriaId', '==', gestoriaId),
  ]
  if (filtros?.estado && filtros.estado !== 'todos')
    constraints.push(where('estado', '==', filtros.estado))
  if (filtros?.tipo && filtros.tipo !== 'todos')
    constraints.push(where('tipo', '==', filtros.tipo))
  constraints.push(orderBy('creadoEn', 'desc'))

  const snap = await getDocs(query(tramitesCol, ...constraints))
  return snap.docs.map(d => ({ ...d.data(), id: d.id }))
}