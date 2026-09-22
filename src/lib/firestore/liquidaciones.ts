// src/lib/firestore/liquidaciones.ts
// ─── LIQUIDACIÓN DE COMISIONES A ENCARGADOS ──────────────────────────────────
//
// EL HUECO QUE CUBRE
//   `recibo.comisionReferido` registra lo que SE LE DEBE al encargado cuando el
//   cliente paga. Pero cuándo y cuánto SE LE PAGÓ no estaba en ningún lado. Si a
//   Julian Zeiss se le paga a fin de mes por 13 clientes juntos, ese pago no
//   existía, y su comprobante no tenía a qué engancharse.
//
// EL MODELO
//   Una liquidación = un pago al encargado, que cubre UNO O VARIOS recibos.
//   Sirve igual si se paga por cada cliente (1 recibo) o todo junto a fin de
//   mes (N recibos).
//
//     comisión devengada  = Σ recibo.comisionReferido
//     comisión pagada     = Σ liquidacion.monto
//     comisión adeudada   = devengada − pagada
//
// ⚠️ LA LIQUIDACIÓN NO ES UN RECIBO NEGATIVO
//   La comisión ya se descontó del neto de la gestoría al cobrarle al cliente.
//   Si el pago al encargado también restara, se descontaría dos veces. Por eso
//   vive en su propia colección y finanzas.ts no la suma.

import {
  collection, addDoc, doc, query, where, getDocs, writeBatch,
  onSnapshot, serverTimestamp, limit, orderBy,
  type Timestamp, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { registrarActividad } from './audit'
import {
  subirArchivoComprobante, registrarComprobante,
} from './comprobantes'
import type { Rol } from '@/types'

export const liquidacionesCol = collection(db, 'liquidacionesEncargado')

export interface Liquidacion {
  id:              string
  gestoriaId:      string
  encargadoId:     string
  encargadoNombre: string
  monto:           number
  formaPago:       string
  reciboIds:       string[]     // qué comisiones cubre
  periodo?:        string       // "2026-09", informativo
  notas?:          string
  tieneComprobante?: boolean
  comprobanteId?:  string
  pagadoPor:       string
  pagadoPorNombre: string
  asignadoA:       string       // secretario dueño del encargado (para reglas)
  creadoEn:        Timestamp
}

export interface ComisionPendiente {
  reciboId:     string
  numeroRecibo: string
  fecha:        Date | null
  cliente:      string
  patente:      string
  cobrado:      number
  comision:     number
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

// ─── LECTURA ──────────────────────────────────────────────────────────────────

/**
 * Comisiones de un encargado que todavía no se le pagaron: recibos con
 * comisión cargada y sin liquidación asociada.
 */
export async function getComisionesPendientes(
  gestoriaId: string,
  encargadoId: string,
): Promise<ComisionPendiente[]> {
  const snap = await getDocs(query(
    collection(db, 'recibos'),
    where('gestoriaId', '==', gestoriaId),
    where('encargadoId', '==', encargadoId),
    limit(1000),
  ))
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as any)
    .filter(r => num(r.comisionReferido) > 0 && !r.liquidacionId && num(r.monto) > 0)
    .map(r => ({
      reciboId:     r.id,
      numeroRecibo: r.numeroRecibo ?? '',
      fecha:        r.creadoEn?.toDate?.() ?? null,
      cliente:      r.comisionDestino ?? '',
      patente:      r.patente ?? '',
      cobrado:      num(r.monto),
      comision:     num(r.comisionReferido),
    }))
    .sort((a, b) => (a.fecha?.getTime() ?? 0) - (b.fecha?.getTime() ?? 0))
}

/** Resumen devengado / pagado / adeudado de un encargado. */
export async function getSaldoEncargado(
  gestoriaId: string,
  encargadoId: string,
): Promise<{ devengado: number; pagado: number; adeudado: number; pendientes: number }> {
  const [rec, liq] = await Promise.all([
    getDocs(query(collection(db, 'recibos'),
      where('gestoriaId', '==', gestoriaId),
      where('encargadoId', '==', encargadoId), limit(2000))),
    getDocs(query(liquidacionesCol,
      where('gestoriaId', '==', gestoriaId),
      where('encargadoId', '==', encargadoId), limit(500))),
  ])
  let devengado = 0, pendientes = 0
  rec.forEach(d => {
    const r = d.data() as any
    const c = num(r.comisionReferido)
    if (c <= 0 || num(r.monto) < 0) return
    devengado += c
    if (!r.liquidacionId) pendientes++
  })
  let pagado = 0
  liq.forEach(d => { pagado += num((d.data() as any).monto) })
  return { devengado, pagado, adeudado: Math.max(0, devengado - pagado), pendientes }
}

export function subscribeLiquidaciones(
  gestoriaId: string,
  scope: { uid: string; verTodos: boolean },
  callback: (l: Liquidacion[]) => void,
): Unsubscribe {
  if (!gestoriaId) { callback([]); return () => {} }
  const f = [where('gestoriaId', '==', gestoriaId)]
  if (!scope.verTodos) f.push(where('asignadoA', '==', scope.uid))
  return onSnapshot(
    query(liquidacionesCol, ...f, orderBy('creadoEn', 'desc'), limit(300)),
    s => callback(s.docs.map(d => ({ ...d.data(), id: d.id }) as Liquidacion)),
    e => { console.error('[liquidaciones]', e.code); callback([]) },
  )
}

// ─── REGISTRAR UN PAGO AL ENCARGADO ───────────────────────────────────────────

export interface NuevaLiquidacion {
  gestoriaId:      string
  encargadoId:     string
  encargadoNombre: string
  asignadoA:       string
  reciboIds:       string[]
  monto:           number
  formaPago:       string
  notas?:          string
}

export async function registrarLiquidacion(
  input: NuevaLiquidacion,
  comprobante: File | null,
  ctx: { uid: string; nombre: string; rol: Rol },
  onProgreso?: (pct: number) => void,
): Promise<string> {
  if (!(input.monto > 0))        throw new Error('El monto tiene que ser mayor a cero.')
  if (!input.reciboIds.length)   throw new Error('Elegí al menos una comisión a pagar.')

  // Se valida contra lo pendiente: no se puede liquidar dos veces el mismo recibo
  const pendientes = await getComisionesPendientes(input.gestoriaId, input.encargadoId)
  const idsPend = new Set(pendientes.map(p => p.reciboId))
  const invalidos = input.reciboIds.filter(id => !idsPend.has(id))
  if (invalidos.length) {
    throw new Error(`${invalidos.length} de las comisiones elegidas ya estaban pagadas. Recargá la pantalla.`)
  }

  const esperado = pendientes
    .filter(p => input.reciboIds.includes(p.reciboId))
    .reduce((a, p) => a + p.comision, 0)

  // Se permite pagar distinto de lo devengado (redondeo, adelanto, ajuste),
  // pero queda registrado.
  const diferencia = Math.round(input.monto - esperado)

  // 1. La liquidación
  const ref = await addDoc(liquidacionesCol, {
    ...input,
    montoEsperado: esperado,
    diferencia,
    periodo:   new Date().toISOString().slice(0, 7),
    pagadoPor: ctx.uid,
    pagadoPorNombre: ctx.nombre,
    tieneComprobante: false,
    creadoEn: serverTimestamp(),
  })

  // 2. Marcar los recibos como liquidados. Requiere la regla de update acotado.
  const batch = writeBatch(db)
  input.reciboIds.forEach(id =>
    batch.update(doc(db, 'recibos', id), {
      liquidacionId:    ref.id,
      comisionPagadaEn: serverTimestamp(),
    }))
  await batch.commit()

  // 3. Comprobante (si vino). Si falla, la liquidación igual queda.
  if (comprobante) {
    try {
      const archivo = await subirArchivoComprobante(comprobante, input.gestoriaId, onProgreso)
      await registrarComprobante(archivo, {
        gestoriaId:    input.gestoriaId,
        tipo:          'pago_encargado',
        liquidacionId: ref.id,
        encargadoId:   input.encargadoId,
        monto:         input.monto,
        formaPago:     input.formaPago,
        referencia:    input.encargadoNombre,
        subidoPor:       ctx.uid,
        subidoPorNombre: ctx.nombre,
      })
    } catch (e) {
      console.warn('[liquidacion] comprobante no subido:', e)
    }
  }

  // 4. Trazabilidad
  await registrarActividad({
    gestoriaId:    input.gestoriaId,
    accion:        'registrar_pago',
    entidad:       'cliente',
    entidadId:     input.encargadoId,
    entidadLabel:  `Comisión a ${input.encargadoNombre}`,
    usuarioId:     ctx.uid,
    usuarioNombre: ctx.nombre,
    usuarioRol:    ctx.rol,
    despues: {
      monto: input.monto, recibos: input.reciboIds.length,
      esperado, diferencia,
    },
    nota: input.notas,
  })

  return ref.id
}


// ─── REGLAS ───────────────────────────────────────────────────────────────────
/*
1) RECIBOS — abrir un update ACOTADO. Hoy solo permiten create, así que ni el
   comprobante ni la liquidación pueden marcar el recibo. Los campos económicos
   siguen siendo inmutables: solo se pueden tocar estos cuatro.

    match /recibos/{reciboId} {
      allow read:   if isStaff() && docDeMiGestoria();
      allow create: if isStaff() && nuevaDocDeMiGestoria();
      allow update: if isStaff() && docDeMiGestoria()
                    && request.resource.data.diff(resource.data).affectedKeys()
                       .hasOnly(['tieneComprobante','comprobanteId',
                                 'liquidacionId','comisionPagadaEn']);
    }

2) LIQUIDACIONES

    match /liquidacionesEncargado/{id} {
      allow read:   if isAdmin() && docDeMiGestoria();
      allow read:   if isStaff() && docDeMiGestoria()
                    && resource.data.asignadoA == request.auth.uid;
      allow create: if isStaff() && nuevaDocDeMiGestoria()
                    && request.resource.data.pagadoPor == request.auth.uid;
      allow update: if isStaff() && docDeMiGestoria()
                    && request.resource.data.diff(resource.data).affectedKeys()
                       .hasOnly(['tieneComprobante','comprobanteId']);
      allow delete: if false;
    }

ÍNDICES
  recibos:                gestoriaId ASC, encargadoId ASC
  liquidacionesEncargado: gestoriaId ASC, creadoEn DESC
  liquidacionesEncargado: gestoriaId ASC, asignadoA ASC, creadoEn DESC
  liquidacionesEncargado: gestoriaId ASC, encargadoId ASC

¿QUIÉN PUEDE PAGAR COMISIONES?
  La regla deja que cualquier staff registre una liquidación. Si preferís que
  solo lo haga el CEO o admin, cambiá `isStaff()` por `isAdmin()` en el create.
  Es una decisión de control interno: quien paga no debería ser el mismo que
  carga la comisión, si se puede evitar.
*/