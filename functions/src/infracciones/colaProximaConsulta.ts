// functions/src/infracciones/colaProximaConsulta.ts
// ─── SIRVE EL PRÓXIMO DOMINIO DE LA COLA A LA EXTENSIÓN ──────────────────────
//
// content.js hace GET /colaProximaConsulta y espera { consulta: {...} | null }.
// Prioridad: leads de la web primero, después el más viejo (FIFO).
// Bloqueo suave: al servir un item se marca bloqueadoPor/bloqueadoEn durante
// LOCK_MS, para que dos operadoras (Jessica + Abigail) no procesen el mismo.
// Si se completa (estado → cotizada) sale del pool; si se abandona, el bloqueo
// vence solo y vuelve a estar disponible.
//
// Despliegue: firebase deploy --only functions:colaProximaConsulta

import * as admin    from 'firebase-admin'
import { onRequest } from 'firebase-functions/v2/https'
import { logger }    from 'firebase-functions'

const LOCK_MS       = 3 * 60 * 1000  // 3 min: cubre el tiempo de resolver el captcha
const MAX_CANDIDATOS = 20

const ORIGENES_OK = new Set(['https://infraccionesba.gba.gob.ar'])

function setCors(req: any, res: any): void {
  const origin = req.headers.origin as string | undefined
  if (origin && (ORIGENES_OK.has(origin) || origin.startsWith('chrome-extension://'))) {
    res.set('Access-Control-Allow-Origin', origin)
  } else {
    res.set('Access-Control-Allow-Origin', '*')
  }
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.set('Access-Control-Max-Age', '3600')
}

export const colaProximaConsulta = onRequest(
  { region: 'us-central1', timeoutSeconds: 30, memory: '256MiB', maxInstances: 5 },
  async (req, res) => {
    setCors(req, res)
    if (req.method === 'OPTIONS') { res.status(204).send(''); return }
    if (req.method !== 'GET')    { res.status(405).json({ error: 'Método no permitido' }); return }

    // ── 1. Verificar ID token ───────────────────────────────────────────────
    const authHeader = (req.headers.authorization as string) || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) { res.status(401).json({ error: 'Falta token' }); return }

    let uid: string
    try {
      uid = (await admin.auth().verifyIdToken(token)).uid
    } catch {
      res.status(401).json({ error: 'Token inválido' }); return
    }

    const db = admin.firestore()

    // ── 2. Validar usuario ──────────────────────────────────────────────────
    const userSnap = await db.doc(`users/${uid}`).get()
    if (!userSnap.exists) { res.status(403).json({ error: 'Usuario no encontrado' }); return }
    const userData = userSnap.data() as { activo?: boolean; gestoriaId?: string }
    if (userData.activo === false) { res.status(403).json({ error: 'Usuario inactivo' }); return }
    const gestoriaId = userData.gestoriaId
    if (!gestoriaId) { res.status(403).json({ error: 'Usuario sin gestoría' }); return }

    // ── 3. Traer candidatos pendientes (index: gestoriaId, estado, creadaEn) ─
    const snap = await db.collection('consultasInfracciones')
      .where('gestoriaId', '==', gestoriaId)
      .where('estado', '==', 'pendiente')
      .orderBy('creadaEn', 'asc')
      .limit(MAX_CANDIDATOS)
      .get()

    const now = Date.now()

    // Solo consultas por dominio (la extensión autocompleta el input de dominio),
    // con dominio presente y sin bloqueo vigente de otra persona.
    const disponibles = snap.docs.filter(d => {
      const x = d.data() as any
      if (x.tipoConsulta !== 'dominio' || !x.dominio) return false
      const bloqueadoEn  = x.bloqueadoEn?.toMillis?.() ?? 0
      const bloqueadoPor = x.bloqueadoPor
      if (bloqueadoPor && bloqueadoPor !== uid && (now - bloqueadoEn) < LOCK_MS) return false
      return true
    })

    // Prioridad: web primero. Dentro de cada grupo respeta el orden por creadaEn.
    disponibles.sort((a, b) => {
      const pa = (a.data() as any).origen === 'web' ? 0 : 1
      const pb = (b.data() as any).origen === 'web' ? 0 : 1
      return pa - pb
    })

    const pick = disponibles[0]
    if (!pick) { res.status(200).json({ consulta: null }); return }

    // ── 4. Reclamar el item de forma atómica (evita doble-servido) ──────────
    try {
      const consulta = await db.runTransaction(async tx => {
        const s = await tx.get(pick.ref)
        const x = s.data() as any
        if (!x || x.estado !== 'pendiente') return null
        const bEn = x.bloqueadoEn?.toMillis?.() ?? 0
        if (x.bloqueadoPor && x.bloqueadoPor !== uid && (Date.now() - bEn) < LOCK_MS) return null
        tx.update(pick.ref, {
          bloqueadoPor: uid,
          bloqueadoEn:  admin.firestore.FieldValue.serverTimestamp(),
        })
        return {
          id:             s.id,
          tipoConsulta:   x.tipoConsulta ?? 'dominio',
          dominio:        x.dominio ?? '',
          dni:            x.dni ?? '',
          genero:         x.genero ?? '',
          tipoDocumento:  x.tipoDocumento ?? 'DNI',
          contactoNombre: x.contacto?.nombre ?? '',
        }
      })

      if (consulta) {
        logger.info(JSON.stringify({ fn: 'colaProximaConsulta', gestoriaId, uid, servido: consulta.id }))
      }
      res.status(200).json({ consulta })
    } catch (e) {
      logger.warn('[colaProximaConsulta] transacción falló', e)
      res.status(200).json({ consulta: null })  // la extensión reintenta en el próximo poll
    }
  },
)