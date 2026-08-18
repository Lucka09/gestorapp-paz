// functions/src/cupones/subirCuponInfraccion.ts
// Recibe el PDF base64 de la extensión, lo sube a Cloud Storage, lo parsea,
// busca cinemómetro, evalúa verificación, y guarda el doc cupones.
// Actualiza el contador del job descargaCupones/{tramiteId}.

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { getAuth } from 'firebase-admin/auth'
import { parseCuponPDF, parseResultADocFields } from './parseCupon'
import {
  normalizarSerie,
  evaluarVerificacion,
  type Cinemometro,
} from '../lib/cinemometros'
import type { CuponInfraccion, DescargaCuponesJob } from '../cupon_types'

if (!getApps().length) initializeApp()
const db = getFirestore()
const auth = getAuth()
const storage = getStorage().bucket() // bucket predeterminado

interface Request {
  tramiteId: string
  nroCausa: string
  nroActa?: string
  dominio?: string
  pdfBase64: string
}

export const subirCuponInfraccion = onCall<Request>(
  {
    cors: [/gestorapp.*\.vercel\.app$/, /gestorapp.*\.web\.app$/, /localhost/],
    memory: '512MiB',
    timeoutSeconds: 60,
  },
  async (req) => {
    // ─── 1. Auth + gestoriaId server-side (defensa estándar GestorApp) ───
    const uid = req.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'Requiere login')
    const user = await auth.getUser(uid).catch(() => null)
    if (!user) throw new HttpsError('unauthenticated', 'Usuario no encontrado')
    const gestoriaId = user.customClaims?.gestoriaId as string | undefined
    if (!gestoriaId) throw new HttpsError('permission-denied', 'Usuario sin gestoría asignada')

    // ─── 2. Validar input ───
    const { tramiteId, nroCausa, nroActa, dominio, pdfBase64 } = req.data ?? ({} as Request)
    if (!tramiteId || !nroCausa || !pdfBase64) {
      throw new HttpsError('invalid-argument', 'Faltan campos requeridos')
    }
    if (!/^[\w\-]{10,80}$/.test(nroCausa)) {
      throw new HttpsError('invalid-argument', 'nroCausa con formato inválido')
    }

    // Defensa IDOR: verificar que el trámite sea del gestoriaId
    const tramiteSnap = await db.collection('tramites').doc(tramiteId).get()
    if (!tramiteSnap.exists || tramiteSnap.get('gestoriaId') !== gestoriaId) {
      throw new HttpsError('permission-denied', 'Trámite no pertenece a la gestoría')
    }

    const cuponRef = db.collection('tramites').doc(tramiteId).collection('cupones').doc(nroCausa)
    const jobRef = db.collection('descargaCupones').doc(tramiteId)
    // Idempotencia: si el cupón ya está ok, no reprocesar ni tocar contadores
    const cuponExistente = await cuponRef.get()
    if (cuponExistente.exists && cuponExistente.get('estado') === 'ok') {
      return {
        ok: true,
        nroCausa,
        estado: 'ok',
        yaProcesado: true,
        evaluacion: cuponExistente.get('evaluacion')?.estado ?? 'sin_evaluar',
      }
    }

    await marcarItem(jobRef, nroCausa, 'subiendo')

    try {
      // ─── 3. Subir a Cloud Storage ───
      const pdfBuffer = Buffer.from(pdfBase64, 'base64')
      if (pdfBuffer.length < 1024) throw new Error('PDF demasiado chico, probablemente vacío')
      if (pdfBuffer.slice(0, 4).toString() !== '%PDF') throw new Error('No es un PDF válido')

      const storagePath = `cupones/${gestoriaId}/${tramiteId}/${nroCausa}.pdf`
      const file = storage.file(storagePath)
      await file.save(pdfBuffer, {
        contentType: 'application/pdf',
        metadata: { metadata: { tramiteId, nroCausa, gestoriaId, subidoPor: uid } },
        resumable: false,
      })

      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      })

      // ─── 4. Parsear (lazy import de pdf-parse: evita timeout de cold start) ───
      const pdfParse = (await import('pdf-parse')).default
      const pdfData = await pdfParse(pdfBuffer)
      const parseado = parseCuponPDF(pdfData.text)
      const serieNormalizada = parseado.serieOriginal
        ? normalizarSerie(parseado.serieOriginal)
        : undefined

      // ─── 5. Buscar cinemómetro (F1) ───
      let cinemometro: Cinemometro | undefined
      if (serieNormalizada) {
        const snap = await db.collection('cinemometros').doc(serieNormalizada).get()
        if (snap.exists) cinemometro = snap.data() as Cinemometro
      }

      // ─── 6. Evaluar (siempre que haya fecha de hecho) ───
      let evaluacion: CuponInfraccion['evaluacion']
      if (parseado.fechaHechoISO && serieNormalizada) {
        const r = evaluarVerificacion(cinemometro, serieNormalizada, parseado.fechaHechoISO)
        evaluacion = {
          estado: r.estado,
          cinemometro: r.cinemometro,
          ultimaVerifAnterior: r.ultimaVerifAnterior,
          diasExceso: r.diasExceso,
          ambigua: r.ambigua,
          fundamentos: r.fundamentos,
        }
      }

      // ─── 7. Guardar doc del cupón ───
      const ahora = FieldValue.serverTimestamp()
      const docData: Partial<CuponInfraccion> = {
        ...parseResultADocFields(parseado),
        id: nroCausa,
        tramiteId,
        gestoriaId,
        nroCausa,
        nroActa: parseado.nroActa ?? nroActa ?? '',
        dominio: dominio ?? tramiteSnap.get('patente') ?? '',
        serieNormalizada,
        storagePath,
        signedUrl,
        signedUrlExpira: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) as any,
        pdfSizeBytes: pdfBuffer.length,
        estado: 'ok',
        evaluacion,
        descargadoPor: uid,
        descargadoPorNombre: user.displayName ?? user.email ?? '',
        descargadoEn: ahora as any,
        creadoEn: ahora as any,
        actualizadoEn: ahora as any,
      }
      await cuponRef.set(docData, { merge: true })

      // ─── 8. Marcar item ok y actualizar contadores del job ───
      await marcarItem(jobRef, nroCausa, 'ok')
      await jobRef.update({
        completadosOk: FieldValue.increment(1),
        actualizadoEn: ahora,
      })
      await recalcularEstadoGeneral(jobRef)

      return { ok: true, nroCausa, estado: 'ok', evaluacion: evaluacion?.estado ?? 'sin_evaluar' }
    } catch (err: any) {
      const mensaje = err?.message ?? String(err)
      const tipo =
        mensaje.includes('No es un PDF') || mensaje.includes('demasiado chico')
          ? 'error_pdf'
          : mensaje.includes('parse') || mensaje.includes('serie')
            ? 'error_parse'
            : 'error_storage'
      await marcarItem(jobRef, nroCausa, tipo, mensaje)
      await jobRef.update({
        conError: FieldValue.increment(1),
        actualizadoEn: FieldValue.serverTimestamp(),
      })
      await recalcularEstadoGeneral(jobRef)
      console.error('[subirCuponInfraccion] error', { tramiteId, nroCausa, tipo, mensaje })
      throw new HttpsError('internal', `Error procesando cupón: ${mensaje}`)
    }
  },
)

// ─── Helpers ──
async function marcarItem(
  jobRef: FirebaseFirestore.DocumentReference,
  nroCausa: string,
  estado: CuponInfraccion['estado'],
  errorDetalle?: string,
) {
  await jobRef.update({
    [`items.${nroCausa}.estado`]: estado,
    [`items.${nroCausa}.ultimoIntento`]: FieldValue.serverTimestamp(),
    ...(errorDetalle ? { [`items.${nroCausa}.errorDetalle`]: errorDetalle } : {}),
    ...(estado === 'reintentar' ? { [`items.${nroCausa}.reintentos`]: FieldValue.increment(1) } : {}),
  })
}

async function recalcularEstadoGeneral(jobRef: FirebaseFirestore.DocumentReference) {
  const snap = await jobRef.get()
  if (!snap.exists) return
  const data = snap.data()!
  const total = data.totalItems as number
  const ok = (data.completadosOk as number) ?? 0
  const err = (data.conError as number) ?? 0
  const omit = (data.omitidos as number) ?? 0
  const procesados = ok + err + omit
  let nuevo: DescargaCuponesJob['estadoGeneral']
  if (procesados < total) {
    nuevo = data.estadoGeneral === 'pausado' ? 'pausado' : 'en_progreso'
  } else if (err === 0) {
    nuevo = 'completado'
  } else {
    nuevo = 'parcial'
  }
  await jobRef.update({
    estadoGeneral: nuevo,
    ...(nuevo === 'completado' ? { completadoEn: FieldValue.serverTimestamp() } : {}),
  })
}