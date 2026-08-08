import {
  addDoc, collection, getDocs, limit, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore'
import { db } from '../firebase'

const consultasCol = collection(db, 'consultasInfracciones')

/** Extrae patente y/o DNI de un texto libre (la nota/consulta del lead). */
export function extraerClaveMultas(texto: string): { patente?: string; dni?: string } {
  if (!texto) return {}
  const out: { patente?: string; dni?: string } = {}
  const upper = texto.toUpperCase()
  const mPat = upper.match(/\b[A-Z]{2}\d{3}[A-Z]{2}\b|\b[A-Z]{3}\d{3}\b/)
  if (mPat) out.patente = mPat[0]
  const mDni = texto.match(/\b\d{1,2}(?:\.\d{3}){2}\b|\b\d{7,8}\b/)
  if (mDni) out.dni = mDni[0].replace(/[.\s-]/g, '')
  return out
}

/**
 * Crea la consulta en la cola SI no existe ya (por prospecto o por dato).
 * Devuelve el id de la consulta, o null si no hay patente/DNI.
 */
export async function asegurarConsultaMultas(params: {
  gestoriaId: string
  prospectoId: string
  leadId?: string | null
  patente?: string
  documento?: string
  contacto?: { nombre?: string; whatsapp?: string; email?: string }
  origen?: string
}): Promise<string | null> {
  const patente = (params.patente ?? '').toUpperCase().replace(/\s/g, '')
  const dni = (params.documento ?? '').replace(/[.\s-]/g, '')
  if (!patente && !dni) return null

  const tipo = patente ? 'dominio' : 'dni'
  const valor = patente || dni

  // 1) ¿Ya hay consulta vinculada a este prospecto?
  const porProspecto = await getDocs(query(
    consultasCol, where('prospectoId', '==', params.prospectoId), limit(1)
  ))
  if (!porProspecto.empty) return porProspecto.docs[0].id

  // 2) ¿Ya hay consulta con este mismo dato en la gestoría? → solo vinculamos
  const campo = tipo === 'dominio' ? 'dominio' : 'dni'
  const porValor = await getDocs(query(
    consultasCol,
    where('gestoriaId', '==', params.gestoriaId),
    where(campo, '==', valor),
    limit(1)
  ))
  if (!porValor.empty) {
    await updateDoc(porValor.docs[0].ref, { prospectoId: params.prospectoId }).catch(() => {})
    return porValor.docs[0].id
  }

  // 3) No existe → la creamos en la cola
  const ref = await addDoc(consultasCol, {
    gestoriaId: params.gestoriaId,
    tipoConsulta: tipo,
    ...(tipo === 'dominio' ? { dominio: valor } : { dni: valor, tipoDocumento: 'DNI' }),
    contacto: params.contacto ?? {},
    origen: params.origen ?? 'manual',
    estado: 'pendiente',
    prospectoId: params.prospectoId,
    ...(params.leadId ? { leadId: params.leadId } : {}),
    creadaEn: serverTimestamp(),
  })
  return ref.id
}