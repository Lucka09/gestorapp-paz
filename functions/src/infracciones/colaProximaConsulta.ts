// functions/src/infracciones/colaProximaConsulta.ts
// ─── COLA DE CONSULTAS PARA LA EXTENSIÓN ─────────────────────────────────────
// Devuelve la próxima consulta pendiente de la gestoría del usuario autenticado
// y la bloquea temporalmente para que dos operadores no tomen la misma.
//
// Contrato con extension/content.js:
//   GET → { consulta: null } | { consulta: { id, tipoConsulta, dominio, dni,
//           tipoDocumento, genero, contactoNombre, contacto } }
//   Auth: Bearer <ID token de Firebase>
//
// Multi-tenant: el gestoriaId sale del perfil del usuario (users/{uid}),
// no de un secret — funciona para cualquier gestoría sin tocar el código.
//
// Despliegue: firebase deploy --only functions:colaProximaConsulta
import * as admin from 'firebase-admin'
import { onRequest } from 'firebase-functions/v2/https'
import { logger }    from 'firebase-functions'

const BLOQUEO_MS = 10 * 60 * 1000 // 10 min: si no se procesa, vuelve a la cola

export const colaProximaConsulta = onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') { res.status(204).send(''); return }

  try {
    // 1) Autenticación
    const header = req.headers.authorization || ''
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) { res.status(401).json({ consulta: null }); return }

    const decoded = await admin.auth().verifyIdToken(token)

    // 2) Tenant desde el perfil del usuario (multi-tenant real)
    const userSnap   = await admin.firestore().doc(`users/${decoded.uid}`).get()
    const gestoriaId = userSnap.exists ? (userSnap.data() as any)?.gestoriaId : null
    if (!gestoriaId) {
      logger.warn('[cola] usuario sin gestoriaId', { uid: decoded.uid })
      res.status(403).json({ consulta: null }); return
    }

    // 3) Pendientes del tenant (dos where de igualdad → sin índice compuesto)
    const db   = admin.firestore()
    const snap = await db.collection('consultasInfracciones')
      .where('gestoriaId', '==', gestoriaId)
      .where('estado',     '==', 'pendiente')
      .limit(50)
      .get()

    // 4) Descartar bloqueadas recientes (en memoria)
    const ahora = Date.now()
    const disponibles = snap.docs.filter(d => {
      const b = (d.data() as any).bloqueadoEn
      if (!b) return true
      const t = b.toMillis ? b.toMillis() : 0
      return ahora - t > BLOQUEO_MS
    })

    // 5) Prioridad por secretario: primero LAS MÍAS (asignadoA == uid), luego el
    //    POOL (sin asignar). Nunca tomamos consultas asignadas a OTRO secretario:
    //    cada uno resuelve el captcha de sus propios leads.
    const porAntiguedad = (a: admin.firestore.QueryDocumentSnapshot,
                           b: admin.firestore.QueryDocumentSnapshot) => {
      const ta = (a.data() as any).creadaEn?.toMillis?.() ?? 0
      const tb = (b.data() as any).creadaEn?.toMillis?.() ?? 0
      return ta - tb
    }
    const mias = disponibles
      .filter(d => (d.data() as any).asignadoA === decoded.uid)
      .sort(porAntiguedad)
    const pool = disponibles
      .filter(d => !(d.data() as any).asignadoA)
      .sort(porAntiguedad)
    const elegida = mias[0] ?? pool[0] ?? null

    logger.info('[cola] búsqueda', {
      gestoriaId, uid: decoded.uid,
      pendientes: snap.size, mias: mias.length, pool: pool.length,
    })

    if (!elegida) { res.status(200).json({ consulta: null }); return }

    // 6) Bloquear la elegida y devolverla
    const doc = elegida
    await doc.ref.update({
      bloqueadoEn: admin.firestore.FieldValue.serverTimestamp(),
    })

    const c = doc.data() as any
    res.status(200).json({
      consulta: {
        id:             doc.id,
        tipoConsulta:   c.tipoConsulta || 'dominio',
        dominio:        c.dominio || '',
        dni:            c.dni || '',
        tipoDocumento:  c.tipoDocumento || 'DNI',
        genero:         c.genero || '',
        contactoNombre: c.contacto?.nombre || '',
        contacto:       c.contacto || null,
      },
    })
  } catch (e: any) {
    logger.error('[cola] error', { message: e?.message })
    res.status(401).json({ consulta: null })
  }
})