import {
  getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp,
  onSnapshot, type Unsubscribe,
} from 'firebase/firestore'
import { vehiculosCol, vehiculoDoc, clienteDoc } from './collections'
import type { Vehiculo, TipoVehiculo } from '@/types'

// ─── READ ─────────────────────────────────────────────────────────────────────

export function subscribeVehiculos(
  gestoriaId: string,
  callback:   (vehiculos: Vehiculo[]) => void
): Unsubscribe {
  const q = query(
    vehiculosCol,
    where('gestoriaId', '==', gestoriaId),
    orderBy('patente')
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as Vehiculo))
  )
}

export function subscribeVehiculosPorCliente(
  clienteId:  string,
  gestoriaId: string,
  callback:   (vehiculos: Vehiculo[]) => void
): Unsubscribe {
  const q = query(
    vehiculosCol,
    where('gestoriaId', '==', gestoriaId),
    where('clienteId',  '==', clienteId)
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as Vehiculo))
  )
}

export function subscribeVehiculo(
  id:       string,
  callback: (v: Vehiculo | null) => void
): Unsubscribe {
  return onSnapshot(vehiculoDoc(id), snap =>
    callback(snap.exists() ? ({ ...snap.data(), id: snap.id } as Vehiculo) : null)
  )
}

export async function getVehiculo(id: string): Promise<Vehiculo | null> {
  const snap = await getDoc(vehiculoDoc(id))
  if (!snap.exists()) return null
  return { ...snap.data(), id: snap.id } as Vehiculo
}

export async function buscarVehiculoPorPatente(
  patente:    string,
  gestoriaId: string
): Promise<Vehiculo | null> {
  const q = query(
    vehiculosCol,
    where('gestoriaId', '==', gestoriaId),
    where('patente',    '==', patente.toUpperCase().trim())
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { ...d.data(), id: d.id } as Vehiculo
}

// ─── WRITE ────────────────────────────────────────────────────────────────────

export type VehiculoInput = {
  gestoriaId: string   // requerido — tenant scope
  patente:    string
  tipo:       TipoVehiculo
  marca:      string
  modelo:     string
  anio:       number
  color:      string
  nroMotor:   string
  nroChasis:  string
  clienteId:  string
}

export async function crearVehiculo(data: VehiculoInput): Promise<string> {
  // Verificar que no exista esa patente dentro de la misma gestoría
  const existe = await buscarVehiculoPorPatente(data.patente, data.gestoriaId)
  if (existe) throw new Error('YA_EXISTE')

  const ref = await addDoc(vehiculosCol, {
    ...data,
    patente:data.patente.toUpperCase().trim(),
    historialTitulares: [{
      clienteId: data.clienteId,
      desde:     serverTimestamp(),
      hasta:     null,
    }],
    tramitesIds: [],
    creadoEn:    serverTimestamp(),
  } as any)

  // Agregar referencia al cliente
  const cRef  = clienteDoc(data.clienteId)
  const cSnap = await getDoc(cRef)
  if (cSnap.exists()) {
    const ids: string[] = cSnap.data().vehiculosIds ?? []
    await updateDoc(cRef, { vehiculosIds: [...ids, ref.id] })
  }

  return ref.id
}

export async function actualizarVehiculo(
  id:   string,
  data: Partial<Omit<VehiculoInput, 'clienteId' | 'gestoriaId'>>
): Promise<void> {
  const payload: Record<string, unknown> = { ...data }
  if (data.patente) payload.patente = data.patente.toUpperCase().trim()
  await updateDoc(vehiculoDoc(id), payload)
}

export async function eliminarVehiculo(id: string, clienteId: string): Promise<void> {
  // Remover referencia del cliente
  const cRef  = clienteDoc(clienteId)
  const cSnap = await getDoc(cRef)
  if (cSnap.exists()) {
    const ids: string[] = (cSnap.data().vehiculosIds ?? []).filter((v: string) => v !== id)
    await updateDoc(cRef, { vehiculosIds: ids })
  }
  await deleteDoc(vehiculoDoc(id))
}