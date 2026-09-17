import {
  doc, getDoc, updateDoc, serverTimestamp, arrayUnion, Timestamp,
} from 'firebase/firestore'
import { clientesCol, vehiculosCol } from './collections'
import { registrarActividad } from './audit'
import { emitirEventoSilencioso } from './eventos'
import { crearEvento } from '@/types'
import type { Cliente, Vehiculo, Rol } from '@/types'
import type { CampoCambiado } from '@/components/shared/ModalMotivoEdicion'
 
const MIN_MOTIVO = 10
 
export interface ContextoEdicion {
  uid:        string
  nombre:     string
  rol:        Rol
  gestoriaId: string
}
 
/** Convierte el diff de la UI en los objetos antes/despues que espera audit_log. */
function diffToAudit(cambios: CampoCambiado[]): {
  antes:   Record<string, unknown>
  despues: Record<string, unknown>
} {
  const antes:   Record<string, unknown> = {}
  const despues: Record<string, unknown> = {}
  for (const c of cambios) {
    antes[c.campo]   = c.antes   ?? null
    despues[c.campo] = c.despues ?? null
  }
  return { antes, despues }
}
 
function validarMotivo(motivo: string): string {
  const m = (motivo ?? '').trim()
  if (m.length < MIN_MOTIVO) {
    throw new Error(`El motivo del cambio es obligatorio (mínimo ${MIN_MOTIVO} caracteres).`)
  }
  return m
}
 
/** Solo los campos que cambiaron, para no pisar nada de más. */
function soloCambiados(cambios: CampoCambiado[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const c of cambios) out[c.campo] = c.despues ?? null
  return out
}
 
// ─── CLIENTE ─────────────────────────────────────────────────────────────────
 
export async function editarClienteConMotivo(
  clienteId: string,
  cambios:   CampoCambiado[],
  motivo:    string,
  ctx:       ContextoEdicion,
): Promise<void> {
  const nota = validarMotivo(motivo)
  if (cambios.length === 0) return
 
  const ref  = doc(clientesCol, clienteId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('El cliente no existe.')
  const cli = snap.data() as Cliente
 
  if (cli.gestoriaId !== ctx.gestoriaId) {
    throw new Error('Este cliente no pertenece a tu gestoría.')
  }
 
  await updateDoc(ref, {
    ...soloCambiados(cambios),
    actualizadoEn: serverTimestamp(),
  })
 
  const { antes, despues } = diffToAudit(cambios)
  await registrarActividad({
    gestoriaId:    ctx.gestoriaId,          // ← sin esto, la regla rechaza el create
    accion:        'editar',
    entidad:       'cliente',
    entidadId:     clienteId,
    entidadLabel:  `${cli.nombre} ${cli.apellido}`.trim(),
    usuarioId:     ctx.uid,
    usuarioNombre: ctx.nombre,
    usuarioRol:    ctx.rol,
    antes,
    despues,
    nota,
  })
 
  emitirEventoSilencioso(crearEvento({
    gestoriaId:   ctx.gestoriaId,
    tipo:         'cliente.editado',
    entidad:      'cliente',
    entidadId:    clienteId,
    entidadLabel: `${cli.nombre} ${cli.apellido}`.trim(),
    actorId:      ctx.uid,
    actorNombre:  ctx.nombre,
    actorTipo:    'usuario',
    payload:      { campos: cambios.map(c => c.campo), motivo: nota },
    resumen:      `Editó ${cambios.length} campo(s) de ${cli.nombre} ${cli.apellido}`,
  }))
}
 
// ─── VEHÍCULO ────────────────────────────────────────────────────────────────
 
export async function editarVehiculoConMotivo(
  vehiculoId: string,
  cambios:    CampoCambiado[],
  motivo:     string,
  ctx:        ContextoEdicion,
): Promise<void> {
  const nota = validarMotivo(motivo)
  if (cambios.length === 0) return
 
  const ref  = doc(vehiculosCol, vehiculoId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('El vehículo no existe.')
  const veh = snap.data() as Vehiculo
 
  if (veh.gestoriaId !== ctx.gestoriaId) {
    throw new Error('Este vehículo no pertenece a tu gestoría.')
  }
 
  // El cambio de titular tiene su propia función: no se cuela por acá.
  const cambioTitular = cambios.find(c => c.campo === 'clienteId')
  if (cambioTitular) {
    throw new Error(
      'El cambio de titular se hace desde "Cambiar titular", no desde la edición general.',
    )
  }
 
  await updateDoc(ref, {
    ...soloCambiados(cambios),
    actualizadoEn: serverTimestamp(),
  })
 
  const { antes, despues } = diffToAudit(cambios)
  await registrarActividad({
    gestoriaId:    ctx.gestoriaId,
    accion:        'editar',
    entidad:       'vehiculo',
    entidadId:     vehiculoId,
    entidadLabel:  veh.patente,
    usuarioId:     ctx.uid,
    usuarioNombre: ctx.nombre,
    usuarioRol:    ctx.rol,
    antes,
    despues,
    nota,
  })
 
  emitirEventoSilencioso(crearEvento({
    gestoriaId:   ctx.gestoriaId,
    tipo:         'vehiculo.editado',
    entidad:      'vehiculo',
    entidadId:    vehiculoId,
    entidadLabel: veh.patente,
    actorId:      ctx.uid,
    actorNombre:  ctx.nombre,
    actorTipo:    'usuario',
    payload:      { campos: cambios.map(c => c.campo), motivo: nota },
    resumen:      `Editó ${cambios.length} campo(s) del vehículo ${veh.patente}`,
  }))
}
 
// ─── CAMBIO DE TITULAR ───────────────────────────────────────────────────────
// Decisión tomada: es una edición con motivo, no un trámite con workflow.
// Pero escribe historialTitulares para no perder la cadena de titularidad.
 
export async function cambiarTitularVehiculo(
  vehiculoId:     string,
  nuevoClienteId: string,
  motivo:         string,
  ctx:            ContextoEdicion,
): Promise<void> {
  const nota = validarMotivo(motivo)
 
  const ref  = doc(vehiculosCol, vehiculoId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('El vehículo no existe.')
  const veh = snap.data() as Vehiculo
 
  if (veh.gestoriaId !== ctx.gestoriaId) {
    throw new Error('Este vehículo no pertenece a tu gestoría.')
  }
  if (veh.clienteId === nuevoClienteId) {
    throw new Error('El vehículo ya está a nombre de ese cliente.')
  }
 
  // Nombres para el registro legible (el audit no debe requerir joins después).
  const [antSnap, nueSnap] = await Promise.all([
    veh.clienteId ? getDoc(doc(clientesCol, veh.clienteId)) : Promise.resolve(null),
    getDoc(doc(clientesCol, nuevoClienteId)),
  ])
  if (!nueSnap.exists()) throw new Error('El cliente destino no existe.')
 
  const nue = nueSnap.data() as Cliente
  if (nue.gestoriaId !== ctx.gestoriaId) {
    throw new Error('El cliente destino no pertenece a tu gestoría.')
  }
  const ant = antSnap?.exists() ? antSnap.data() as Cliente : null
 
  const nombreAnt = ant ? `${ant.nombre} ${ant.apellido}`.trim() : '—'
  const nombreNue = `${nue.nombre} ${nue.apellido}`.trim()
  const ahora     = Timestamp.now()
 
  // ── 1. Cerrar el tramo del titular anterior y abrir el nuevo ──────────────
  // historialTitulares existe en el tipo Vehiculo desde siempre y nunca se
  // escribía. Acá se empieza a poblar.
  const historialPrevio = veh.historialTitulares ?? []
  const historialCerrado = historialPrevio.map(h =>
    h.hasta === null ? { ...h, hasta: ahora } : h,
  )
 
  // Si nunca hubo historial pero sí titular, se registra retroactivamente el
  // tramo abierto con la fecha de creación del vehículo.
  if (historialCerrado.length === 0 && veh.clienteId) {
    historialCerrado.push({
      clienteId: veh.clienteId,
      desde:     veh.creadoEn ?? ahora,
      hasta:     ahora,
    })
  }
 
  await updateDoc(ref, {
    clienteId:          nuevoClienteId,
    historialTitulares: [
      ...historialCerrado,
      { clienteId: nuevoClienteId, desde: ahora, hasta: null },
    ],
    actualizadoEn: serverTimestamp(),
  })
 
  // ── 2. Mantener vehiculosIds de ambos clientes ────────────────────────────
  try {
    await updateDoc(doc(clientesCol, nuevoClienteId), {
      vehiculosIds:  arrayUnion(vehiculoId),
      actualizadoEn: serverTimestamp(),
    })
    if (ant && veh.clienteId) {
      const restantes = (ant.vehiculosIds ?? []).filter(id => id !== vehiculoId)
      await updateDoc(doc(clientesCol, veh.clienteId), {
        vehiculosIds:  restantes,
        actualizadoEn: serverTimestamp(),
      })
    }
  } catch (e) {
    // No revierte el cambio de titular: el dato fuerte es vehiculo.clienteId.
    console.warn('[cambiarTitular] no se pudo sincronizar vehiculosIds:', e)
  }
 
  // ── 3. Trazabilidad ───────────────────────────────────────────────────────
  await registrarActividad({
    gestoriaId:    ctx.gestoriaId,
    accion:        'editar',
    entidad:       'vehiculo',
    entidadId:     vehiculoId,
    entidadLabel:  `${veh.patente} — cambio de titular`,
    usuarioId:     ctx.uid,
    usuarioNombre: ctx.nombre,
    usuarioRol:    ctx.rol,
    antes:   { clienteId: veh.clienteId ?? null, titular: nombreAnt },
    despues: { clienteId: nuevoClienteId,        titular: nombreNue },
    nota,
  })
 
  emitirEventoSilencioso(crearEvento({
    gestoriaId:   ctx.gestoriaId,
    tipo:         'vehiculo.titular_cambiado',
    entidad:      'vehiculo',
    entidadId:    vehiculoId,
    entidadLabel: veh.patente,
    actorId:      ctx.uid,
    actorNombre:  ctx.nombre,
    actorTipo:    'usuario',
    payload:      { de: nombreAnt, a: nombreNue, motivo: nota },
    resumen:      `Titular de ${veh.patente}: ${nombreAnt} → ${nombreNue}`,
  }))
}
 
// ─── TIPOS DE EVENTO A REGISTRAR ─────────────────────────────────────────────
// Agregar en src/types/evento.ts → TipoEvento:
//   | 'cliente.editado'
//   | 'vehiculo.editado'
//   | 'vehiculo.titular_cambiado'
// y sus entradas en TIPO_EVENTO_LABELS / TIPO_EVENTO_EMOJI.