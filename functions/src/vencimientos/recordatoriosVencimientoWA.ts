// functions/src/vencimientos/recordatoriosVencimientoWA.ts
// ─── RECORDATORIOS DE VENCIMIENTO POR WHATSAPP ───────────────────────────────
// Corre 1 vez por día (9:00 ART). Busca vencimientos de vehículo (VTV, patente,
// seguro, licencia) que entran en una "banda" de aviso y le manda al cliente un
// TEMPLATE APROBADO de WhatsApp. Genera recurrencia/upsell sin trabajo manual.
//
// ⚠️ REQUIERE UN TEMPLATE APROBADO EN META. Fuera de la ventana de 24 h Meta
//    solo permite templates pre-aprobados (no texto libre). Ver el nombre y los
//    parámetros en `configuracion/gestor.recordatoriosVencimiento`.
//
// Config (configuracion/gestor.recordatoriosVencimiento):
//   activo:         boolean            ← apagado por defecto (no spamear sin template)
//   diasAviso:      number[]           ← bandas de aviso, ej [30, 7, 1] (agregá 0 para "vence hoy")
//   templateNombre: string             ← nombre EXACTO del template aprobado en Meta
//   idioma:         string             ← ej 'es_AR'
//   phoneNumberId?: string             ← número emisor (default: línea principal / env)
//   tipos?:         string[]           ← qué tipos avisar (default: todos)
//
// Idempotencia: cada vencimiento guarda `recordatoriosEnviados: string[]` con las
// bandas ya enviadas → nunca se manda dos veces el mismo hito.
//
// Despliegue: firebase deploy --only functions:recordatoriosVencimientoWA

import * as admin from 'firebase-admin'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions'
import { sendTemplateMessage, normalizarTelefono } from '../utils/Utils'

const DIA_MS = 86_400_000
const ART_OFFSET_MS = -3 * 3600 * 1000   // Argentina = UTC-3

// Días calendario (ART) entre hoy y una fecha. Hoy=0, mañana=1, ayer=-1.
function diasHasta(fecha: Date): number {
  const aMedianocheArt = (d: Date) => {
    const a = new Date(d.getTime() + ART_OFFSET_MS)
    a.setUTCHours(0, 0, 0, 0)
    return a.getTime()
  }
  return Math.round((aMedianocheArt(fecha) - aMedianocheArt(new Date())) / DIA_MS)
}

// Etiqueta legible del tipo de vencimiento (para el parámetro del template).
const LABEL_TIPO: Record<string, string> = {
  vtv: 'VTV', patente: 'patente', seguro: 'seguro',
  licencia: 'licencia de conducir', ruta: 'seguro obligatorio',
}
const etiquetaTipo = (t: string) => LABEL_TIPO[String(t).toLowerCase()] ?? String(t)

interface CfgRecordatorios {
  activo?:         boolean
  diasAviso?:      number[]
  templateNombre?: string
  idioma?:         string
  phoneNumberId?:  string
  tipos?:          string[]
}

export const recordatoriosVencimientoWA = onSchedule(
  {
    schedule:       '0 9 * * *',
    timeZone:       'America/Argentina/Buenos_Aires',
    region:         'southamerica-east1',
    memory:         '256MiB',
    timeoutSeconds: 300,
    secrets:        ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
  },
  async () => {
    const db = admin.firestore()

    // ── Config del tenant ──────────────────────────────────────────────────
    const cfgSnap = await db.doc('configuracion/gestor').get()
    const rc = (cfgSnap.data() as any)?.recordatoriosVencimiento as CfgRecordatorios | undefined
    if (!rc?.activo) {
      logger.info('[recVenc] desactivado — nada que hacer')
      return
    }

    const diasAviso = (Array.isArray(rc.diasAviso) && rc.diasAviso.length ? rc.diasAviso : [30, 7, 1])
      .map(Number).filter(n => Number.isFinite(n) && n >= 0)
      .sort((a, b) => b - a)                       // descendente
    if (!diasAviso.length) { logger.warn('[recVenc] sin diasAviso válidos'); return }

    const templateNombre = String(rc.templateNombre ?? 'recordatorio_vencimiento')
    const idioma         = String(rc.idioma ?? 'es_AR')
    const emisor         = rc.phoneNumberId || undefined
    const tiposFiltro    = Array.isArray(rc.tipos) && rc.tipos.length
      ? new Set(rc.tipos.map(t => String(t).toLowerCase()))
      : null

    // ── Ventana de vencimientos a revisar ──────────────────────────────────
    const maxDias = diasAviso[0]
    const inicioArt = new Date(Date.now() + ART_OFFSET_MS); inicioArt.setUTCHours(0, 0, 0, 0)
    const desde = admin.firestore.Timestamp.fromMillis(inicioArt.getTime() - ART_OFFSET_MS)
    const hasta = admin.firestore.Timestamp.fromMillis(Date.now() + (maxDias + 1) * DIA_MS)

    const snap = await db.collection('vencimientos')
      .where('fechaVencimiento', '>=', desde)
      .where('fechaVencimiento', '<=', hasta)
      .get()

    if (snap.empty) { logger.info('[recVenc] sin vencimientos en ventana'); return }

    // Cache de teléfonos de cliente para no releer el mismo doc.
    const cacheTel = new Map<string, string | null>()
    const telefonoDe = async (clienteId: string): Promise<string | null> => {
      if (!clienteId) return null
      if (cacheTel.has(clienteId)) return cacheTel.get(clienteId) ?? null
      const c = await db.doc(`clientes/${clienteId}`).get()
      const tel = c.exists ? normalizarTelefono(String((c.data() as any)?.telefono ?? '')) : ''
      const val = tel || null
      cacheTel.set(clienteId, val)
      return val
    }

    let enviados = 0, saltados = 0, errores = 0

    for (const doc of snap.docs) {
      const v = doc.data() as any
      const tipo = String(v.tipo ?? '').toLowerCase()
      if (tiposFiltro && !tiposFiltro.has(tipo)) { saltados++; continue }

      const fecha = v.fechaVencimiento?.toDate?.() as Date | undefined
      if (!fecha) { saltados++; continue }

      const d = diasHasta(fecha)
      if (d < 0) { saltados++; continue }   // ya vencido: no recordamos hacia atrás

      // Banda aplicable = el umbral más ajustado que ya se cruzó (>= d).
      const candidatos = diasAviso.filter(t => t >= d)
      if (!candidatos.length) { saltados++; continue }        // todavía lejos
      const banda = Math.min(...candidatos)

      const yaEnviadas: string[] = Array.isArray(v.recordatoriosEnviados) ? v.recordatoriosEnviados : []
      if (yaEnviadas.includes(String(banda))) { saltados++; continue }   // ya avisado este hito

      const telefono = await telefonoDe(String(v.clienteId ?? ''))
      if (!telefono) {
        logger.warn('[recVenc] vencimiento sin teléfono de cliente', { id: doc.id, clienteId: v.clienteId })
        saltados++; continue
      }

      // Cliente: nombre (para el saludo del template)
      let nombreCliente = 'Hola'
      const cli = await db.doc(`clientes/${v.clienteId}`).get()
      if (cli.exists) nombreCliente = String((cli.data() as any)?.nombre ?? 'Hola')

      const fechaStr = fecha.toLocaleDateString('es-AR', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires',
      })

      // Parámetros del template (orden EXACTO al dar de alta en Meta):
      //   {{1}} nombre · {{2}} tipo · {{3}} patente · {{4}} fecha
      const parametros = [
        nombreCliente,
        etiquetaTipo(tipo),
        String(v.patente ?? '').toUpperCase(),
        fechaStr,
      ]

      try {
        await sendTemplateMessage(telefono, templateNombre, idioma, parametros, emisor)
        await doc.ref.update({
          recordatoriosEnviados: admin.firestore.FieldValue.arrayUnion(String(banda)),
          ultimoRecordatorioEn:  admin.firestore.FieldValue.serverTimestamp(),
        })
        enviados++
      } catch (e: any) {
        errores++
        logger.error('[recVenc] error enviando template', {
          id: doc.id, template: templateNombre, message: e?.message,
        })
      }
    }

    logger.info('[recVenc] fin', { total: snap.size, enviados, saltados, errores, diasAviso })
  },
)