// functions/src/cupones/iniciarDescargaCupones.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import type { DescargaCuponesJob, ItemDescargaCupon } from '../cupon_types'
import { CORS_ORIGINS } from '../cors'

if (!getApps().length) initializeApp()
const db = getFirestore()
const auth = getAuth()

interface Request {
  tramiteId: string
  nroCausas: { nroCausa: string; nroActa?: string }[]
}

export const iniciarDescargaCupones = onCall<Request>(
    { cors: CORS_ORIGINS },
  async (req) => {
    const uid = req.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'Requiere login')
    const user = await auth.getUser(uid).catch(() => null)
    if (!user) throw new HttpsError('unauthenticated', 'Usuario no encontrado')
    const gestoriaId = user.customClaims?.gestoriaId as string | undefined
    if (!gestoriaId) throw new HttpsError('permission-denied', 'Usuario sin gestoría')

    const { tramiteId, nroCausas } = req.data ?? ({} as Request)
    if (!tramiteId || !Array.isArray(nroCausas) || nroCausas.length === 0) {
      throw new HttpsError('invalid-argument', 'Faltan datos')
    }

    const tramiteSnap = await db.collection('tramites').doc(tramiteId).get()
    if (!tramiteSnap.exists || tramiteSnap.get('gestoriaId') !== gestoriaId) {
      throw new HttpsError('permission-denied', 'Trámite no pertenece a la gestoría')
    }

    const jobRef = db.collection('descargaCupones').doc(tramiteId)
    const existente = await jobRef.get()
    if (existente.exists) {
      const est = (existente.data() as DescargaCuponesJob).estadoGeneral
      if (est !== 'completado' && est !== 'cancelado') {
        return { ok: true, reutilizado: true, estado: est }
      }
    }

    const items: Record<string, ItemDescargaCupon> = {}
    for (const { nroCausa, nroActa } of nroCausas) {
      items[nroCausa] = {
        nroCausa,
        nroActa: nroActa ?? '',
        estado: 'pendiente',
        reintentos: 0,
      }
    }

    const ahora = FieldValue.serverTimestamp()
    await jobRef.set({
      id: tramiteId,
      tramiteId,
      gestoriaId,
      estadoGeneral: 'pendiente',
      totalItems: nroCausas.length,
      completadosOk: 0,
      conError: 0,
      omitidos: 0,
      items,
      iniciadoEn: ahora,
      iniciadoPor: uid,
      iniciadoPorNombre: user.displayName ?? user.email ?? '',
    } as DescargaCuponesJob)

    return { ok: true, totalItems: nroCausas.length }
  },
)