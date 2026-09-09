// functions/src/leads/repescaLeadsFrios.ts
// ─── REPESCA DE LEADS FRÍOS ──────────────────────────────────────────────────
// Corre 1 vez por día (10:00 ART). Busca leads que quedaron sin avanzar hace
// N días (ni convertidos ni descartados) y les manda un WhatsApp de reactivación
// con TEMPLATE APROBADO. Recupera plata que se estaba perdiendo, sin trabajo manual.
//
// ⚠️ REQUIERE TEMPLATE APROBADO EN META (probablemente categoría MARKETING, que
//    exige opción de baja / opt-out en el texto). Fuera de la ventana de 24 h no
//    se puede mandar texto libre.
//
// Config (configuracion/gestor.repescaLeads):
//   activo:         boolean   (default false — no dispara hasta aprobar el template)
//   diasFrio:       number    (default 15)  — inactividad mínima para repescar
//   templateNombre: string    (default 'repesca_lead')
//   idioma:         string    (default 'es_AR')
//   phoneNumberId?: string    — número emisor (default: línea principal / env)
//   maxPorDia:      number    (default 30)  — tope diario para no quemar la línea
//
// Idempotente: cada lead marca `repescadoEn` → se repesca una sola vez.
//
// Despliegue: firebase deploy --only functions:repescaLeadsFrios

import * as admin from 'firebase-admin'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions'
import { sendTextMessage, normalizarTelefono } from '../utils/Utils'

const DIA_MS = 86_400_000
const FV = admin.firestore.FieldValue

// Estados en los que NO tiene sentido repescar (ya cerraron de un lado u otro).
const ESTADOS_FINALES = new Set(['convertido', 'perdido', 'descartado'])

interface CfgRepesca {
  activo?:         boolean
  diasFrio?:       number
  templateNombre?: string
  idioma?:         string
  phoneNumberId?:  string
  maxPorDia?:      number
}

export const repescaLeadsFrios = onSchedule(
  {
    schedule:       '0 10 * * *',
    timeZone:       'America/Argentina/Buenos_Aires',
    region:         'southamerica-east1',
    memory:         '256MiB',
    timeoutSeconds: 300,
    secrets:        ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
  },
  async () => {
    const db = admin.firestore()

    const cfgSnap = await db.doc('configuracion/gestor').get()
    const rc = (cfgSnap.data() as any)?.repescaLeads as CfgRepesca | undefined
    if (!rc?.activo) { logger.info('[repesca] desactivado'); return }

    const diasFrio       = Number(rc.diasFrio ?? 15)
    const templateNombre = String(rc.templateNombre ?? 'repesca_lead')
    const idioma         = String(rc.idioma ?? 'es_AR')
    const emisor         = rc.phoneNumberId || undefined
    const maxPorDia      = Number(rc.maxPorDia ?? 30)

    const ahora = Date.now()
    // Frío = inactivo hace >= diasFrio, pero no más de 90 días (no perseguir fósiles).
    const limiteSup = admin.firestore.Timestamp.fromMillis(ahora - diasFrio * DIA_MS)
    const limiteInf = admin.firestore.Timestamp.fromMillis(ahora - 90 * DIA_MS)

    // Un solo rango de desigualdad (actualizadoEn); el resto se filtra en memoria.
    const snap = await db.collection('leads')
      .where('actualizadoEn', '>=', limiteInf)
      .where('actualizadoEn', '<=', limiteSup)
      .get()

    if (snap.empty) { logger.info('[repesca] sin leads fríos'); return }

    let enviados = 0, saltados = 0, errores = 0

    for (const doc of snap.docs) {
      if (enviados >= maxPorDia) break

      const l = doc.data() as any
      if (ESTADOS_FINALES.has(String(l.estado ?? ''))) { saltados++; continue }
      if (l.repescadoEn)                               { saltados++; continue }

      const telefono = normalizarTelefono(String(l.telefono ?? ''))
      if (!telefono) { saltados++; continue }

      const nombre = String(l.nombre ?? '').trim() || 'Hola'

      // Parámetros del template (orden EXACTO al dar de alta en Meta):
      //   {{1}} nombre
      const parametros = [nombre]

      try {
        await sendTextMessage(
          telefono,
          `${templateNombre} (${idioma}): ${parametros.join(', ')}`,
          emisor,
        )
        await doc.ref.update({
          repescadoEn: FV.serverTimestamp(),
          estado: l.estado === 'nuevo' ? 'contactado' : l.estado,
          actualizadoEn: FV.serverTimestamp(),
        })
        enviados++
      } catch (e: any) {
        errores++
        logger.error('[repesca] error enviando template', {
          lead: doc.id, template: templateNombre, message: e?.message,
        })
      }
    }

    logger.info('[repesca] fin', { total: snap.size, enviados, saltados, errores, diasFrio })
  },
)