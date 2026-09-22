import {
  doc, getDoc, collection, query, where, getDocs,
  serverTimestamp, runTransaction, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { crearRecibo, generarNumeroRecibo } from './recibos'
import { registrarActividad } from './audit'
import { calcularNetoGestoria } from './finanzas'
import type { Rol } from '@/types'
 
const MIN_MOTIVO = 10
 
export type MotivoDevolucion =
  | 'tramite_cancelado'      // no se hizo la gestión
  | 'cobro_duplicado'        // se cobró dos veces
  | 'error_monto'            // se cobró de más
  | 'cliente_desistio'
  | 'otro'
 
export const MOTIVO_DEVOLUCION_LABELS: Record<MotivoDevolucion, string> = {
  tramite_cancelado: 'Trámite cancelado',
  cobro_duplicado:   'Cobro duplicado',
  error_monto:       'Error en el monto cobrado',
  cliente_desistio:  'El cliente desistió',
  otro:              'Otro',
}
 
export interface DevolucionInput {
  tramiteId:   string
  gestoriaId:  string
  monto:       number              // POSITIVO: cuánto se le devuelve al cliente
  motivo:      MotivoDevolucion
  detalle:     string              // obligatorio, mínimo 10 caracteres
  formaPago:   string              // cómo se le devolvió
  /** Recibo original que se está revirtiendo, si aplica. */
  reciboOriginalId?: string
  /** Fecha real de la devolución (ISO aaaa-mm-dd). Define en qué mes impacta. */
  fecha?: string
}
 
export interface ContextoDevolucion {
  uid:    string
  nombre: string
  rol:    Rol
}
 
// ─── VALIDACIÓN ───────────────────────────────────────────────────────────────
 
export interface ChequeoDevolucion {
  ok:             boolean
  errores:        string[]
  cobradoTotal:   number
  devueltoPrevio: number
  disponible:     number   // máximo devolvible
}
 
/**
 * No se puede devolver más de lo que se cobró, descontando devoluciones
 * anteriores. Sin este chequeo el neto del mes puede quedar negativo por un
 * error de tipeo.
 */
export async function chequearDevolucion(
  tramiteId: string,
  gestoriaId: string,
  monto:     number,
  detalle:   string,
): Promise<ChequeoDevolucion> {
  const errores: string[] = []
 
  const snap = await getDocs(query(
    collection(db, 'recibos'),
    where('gestoriaId', '==', gestoriaId),
    where('tramiteId', '==', tramiteId),
  ))
 
  let cobradoTotal = 0
  let devueltoPrevio = 0
  snap.forEach(d => {
    const r = d.data() as any
    const m = Number(r.monto ?? 0)
    if (r.tipo === 'devolucion' || m < 0) devueltoPrevio += Math.abs(m)
    else cobradoTotal += m
  })
 
  const disponible = Math.max(0, cobradoTotal - devueltoPrevio)
 
  if (!(monto > 0)) {
    errores.push('El monto a devolver debe ser mayor a cero.')
  } else if (monto > disponible) {
    errores.push(
      `No se puede devolver $${monto.toLocaleString('es-AR')}: el trámite tiene ` +
      `$${disponible.toLocaleString('es-AR')} disponibles ` +
      `(cobrado $${cobradoTotal.toLocaleString('es-AR')}, ` +
      `ya devuelto $${devueltoPrevio.toLocaleString('es-AR')}).`,
    )
  }
 
  if ((detalle ?? '').trim().length < MIN_MOTIVO) {
    errores.push(`El detalle del motivo es obligatorio (mínimo ${MIN_MOTIVO} caracteres).`)
  }
 
  return { ok: errores.length === 0, errores, cobradoTotal, devueltoPrevio, disponible }
}
 
// ─── REGISTRAR ────────────────────────────────────────────────────────────────
 
export async function registrarDevolucion(
  input: DevolucionInput,
  ctx:   ContextoDevolucion,
): Promise<string> {
  const chequeo = await chequearDevolucion(input.tramiteId, input.gestoriaId, input.monto, input.detalle)
  if (!chequeo.ok) throw new Error(chequeo.errores.join('\n'))
 
  const tramiteSnap = await getDoc(doc(db, 'tramites', input.tramiteId))
  if (!tramiteSnap.exists()) throw new Error('El trámite no existe.')
  const tramite = tramiteSnap.data() as any
 
  if (tramite.gestoriaId !== input.gestoriaId) {
    throw new Error('Ese trámite no pertenece a tu gestoría.')
  }
 
  // ── Atribución: el premio se le descuenta a quien cobró ──────────────────
  // Se busca el recibo original (o el último del trámite) para saber a qué
  // secretario revertirle el ingreso. Si se lo atribuyéramos a quien hace la
  // devolución, el premio se le restaría a la persona equivocada.
  const atribucion = await resolverAtribucion(input.tramiteId, input.gestoriaId, input.reciboOriginalId)
 
  const numeroRecibo = await generarNumeroRecibo(input.gestoriaId)
  const montoNegativo = -Math.abs(input.monto)
 
  const { netoGestoria } = calcularNetoGestoria({ monto: montoNegativo })
 
  const reciboId = await crearRecibo({
    numeroRecibo,
    tramiteId:  input.tramiteId,
    clienteId:  tramite.clienteId,
    gestoriaId: input.gestoriaId,
    tipo:       'devolucion' as any,
    monto:      montoNegativo,          // ← negativo: resta en toda suma
    netoGestoria,
    formaPago:  input.formaPago,
    notas:      `Devolución — ${MOTIVO_DEVOLUCION_LABELS[input.motivo]}: ${input.detalle.trim()}`,
    patente:       tramite.patente ?? '',
    numeroTramite: tramite.numero ?? '',
    tipoTramite:   tramite.tipo ?? '',
    emitidoPor:       ctx.uid,
    emitidoPorNombre: ctx.nombre,
    // El ingreso se revierte a quien lo cobró, no a quien devuelve
    atribuidoA:       atribucion.uid,
    atribuidoANombre: atribucion.nombre,
    // Metadatos propios de la devolución
    esDevolucion:     true,
    motivoDevolucion: input.motivo,
    detalleDevolucion: input.detalle.trim(),
    devueltoPor:       ctx.uid,
    devueltoPorNombre: ctx.nombre,
    reciboOriginalId:  input.reciboOriginalId ?? '',
    // Criterio de caja: la plata salió el día que dice el usuario, no el día
    // que se cargó. Si no viene, crearRecibo usa hoy.
    fechaCobro: input.fecha
      ? Timestamp.fromDate(new Date(input.fecha + 'T12:00:00'))
      : undefined,
  } as any)
 
  // ── Trazabilidad ─────────────────────────────────────────────────────────
  await registrarActividad({
    gestoriaId:    input.gestoriaId,
    accion:        'registrar_pago',      // reusa la acción existente
    entidad:       'tramite',
    entidadId:     input.tramiteId,
    entidadLabel:  `${tramite.numero ?? input.tramiteId} — devolución`,
    usuarioId:     ctx.uid,
    usuarioNombre: ctx.nombre,
    usuarioRol:    ctx.rol,
    antes:  { cobradoTotal: chequeo.cobradoTotal, devueltoPrevio: chequeo.devueltoPrevio },
    despues: {
      devuelto: input.monto,
      devueltoTotal: chequeo.devueltoPrevio + input.monto,
      reciboDevolucion: numeroRecibo,
      atribuidoA: atribucion.nombre,
    },
    nota: `${MOTIVO_DEVOLUCION_LABELS[input.motivo]}: ${input.detalle.trim()}`,
  })
 
  // ── Acumulado en el trámite, para mostrarlo en el detalle ────────────────
  try {
    await runTransaction(db, async tx => {
      const ref = doc(db, 'tramites', input.tramiteId)
      const s = await tx.get(ref)
      if (!s.exists()) return
      const prev = Number((s.data() as any).devueltoAlCliente ?? 0)
      tx.update(ref, {
        devueltoAlCliente: prev + input.monto,
        ultimaDevolucionEn: serverTimestamp(),
        actualizadoEn: serverTimestamp(),
      })
    })
  } catch (e) {
    // El recibo negativo ya es la fuente de verdad; este campo es para mostrar.
    console.warn('[devolucion] no se pudo actualizar el acumulado:', e)
  }
 
  return reciboId
}
 
// ─── HELPERS ──────────────────────────────────────────────────────────────────
 
async function resolverAtribucion(
  tramiteId: string,
  gestoriaId: string,
  reciboOriginalId?: string,
): Promise<{ uid: string; nombre: string }> {
  // 1. Si se indicó el recibo original, se usa su atribución
  if (reciboOriginalId) {
    const s = await getDoc(doc(db, 'recibos', reciboOriginalId))
    if (s.exists()) {
      const r = s.data() as any
      return {
        uid:    String(r.atribuidoA ?? r.emitidoPor ?? ''),
        nombre: String(r.atribuidoANombre ?? r.emitidoPorNombre ?? ''),
      }
    }
  }
 
  // 2. Si no, el recibo de cobro más grande del trámite: es el que más pesó
  //    en el premio del secretario.
  const snap = await getDocs(query(
    collection(db, 'recibos'),
    where('gestoriaId', '==', gestoriaId),
    where('tramiteId', '==', tramiteId),
  ))
 
  let mejor: any = null
  snap.forEach(d => {
    const r = d.data() as any
    const m = Number(r.monto ?? 0)
    if (m <= 0) return
    if (!mejor || m > Number(mejor.monto ?? 0)) mejor = r
  })
 
  return {
    uid:    String(mejor?.atribuidoA ?? mejor?.emitidoPor ?? ''),
    nombre: String(mejor?.atribuidoANombre ?? mejor?.emitidoPorNombre ?? ''),
  }
}
 
/** Devoluciones de un trámite, para mostrar en el detalle. */
export async function getDevolucionesPorTramite(tramiteId: string, gestoriaId: string): Promise<any[]> {
  const snap = await getDocs(query(
    collection(db, 'recibos'),
    where('gestoriaId', '==', gestoriaId),
    where('tramiteId', '==', tramiteId),
  ))
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as any))
    .filter(r => r.tipo === 'devolucion' || Number(r.monto ?? 0) < 0)
    .sort((a, b) => (b.creadoEn?.toMillis?.() ?? 0) - (a.creadoEn?.toMillis?.() ?? 0))
}