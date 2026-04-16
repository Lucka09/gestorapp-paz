import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot,
  serverTimestamp, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { NotaInterna, TipoNota, Rol } from '@/types'

// ─── COLECCIÓN ────────────────────────────────────────────────────────────────

export const notasCol = collection(db, 'notas_internas')
export const notaDoc  = (id: string) => doc(db, 'notas_internas', id)

// ─── SUSCRIPCIONES ────────────────────────────────────────────────────────────

export function subscribeNotas(
  entidad:    'cliente' | 'tramite',
  entidadId:  string,
  gestoriaId: string,
  callback:   (notas: NotaInterna[]) => void
): Unsubscribe {
  const q = query(
    notasCol,
    where('gestoriaId', '==', gestoriaId),
    where('entidad',    '==', entidad),
    where('entidadId',  '==', entidadId),
    orderBy('creadoEn', 'desc')
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as NotaInterna))
  )
}

// ─── CREAR ────────────────────────────────────────────────────────────────────

export async function crearNota(input: {
  gestoriaId: string   // requerido — tenant scope
  contenido:  string
  tipo:       TipoNota
  entidad:    'cliente' | 'tramite'
  entidadId:  string
  importante: boolean
  ctx:        { uid: string; nombre: string; rol: Rol }
}): Promise<string> {
  const ref = await addDoc(notasCol, {
    gestoriaId:  input.gestoriaId,
    contenido:   input.contenido.trim(),
    tipo:        input.tipo,
    entidad:     input.entidad,
    entidadId:   input.entidadId,
    importante:  input.importante,
    autorId:     input.ctx.uid,
    autorNombre: input.ctx.nombre,
    autorRol:    input.ctx.rol,
    creadoEn:    serverTimestamp(),
    editadoEn:   null,
  })
  return ref.id
}

// ─── EDITAR ───────────────────────────────────────────────────────────────────

export async function editarNota(
  id:        string,
  contenido: string,
  tipo:      TipoNota
): Promise<void> {
  await updateDoc(notaDoc(id), {
    contenido: contenido.trim(),
    tipo,
    editadoEn: serverTimestamp(),
  })
}

// ─── TOGGLE IMPORTANTE ────────────────────────────────────────────────────────

export async function toggleImportante(
  id:         string,
  importante: boolean
): Promise<void> {
  await updateDoc(notaDoc(id), { importante })
}

// ─── ELIMINAR ─────────────────────────────────────────────────────────────────

export async function eliminarNota(id: string): Promise<void> {
  await deleteDoc(notaDoc(id))
}