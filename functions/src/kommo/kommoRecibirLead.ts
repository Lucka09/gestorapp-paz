// functions/src/kommo/kommoRecibirLead.ts
// ─────────────────────────────────────────────────────────────────────────────
// Webhook de ingreso de leads de MULTAS desde Kommo (CRM interino).
// Acepta dos formatos:
//   • Nativo Kommo: { leads: { add/update: [...] }, contacts: {...} }
//   • Simple: { nombre, telefono, dni, patente, mensaje, canal } (tools/web)
// Garantías:
//   • Auth fail-closed por KOMMO_WEBHOOK_KEY (header x-kommo-key o ?key=)
//   • gestoriaId SIEMPRE server-side (GESTORIA_ID_WEB)
//   • Idempotencia: dedup por kommoLeadId → teléfono; si hay kommoLeadId el
//     doc se crea con ID determinista kommo_{gestoriaId}_{leadId}
//   • Un lead malo no tira el batch (try/catch por ítem)
// ─────────────────────────────────────────────────────────────────────────────
import * as admin from 'firebase-admin'
import { onRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'

if (!admin.apps.length) admin.initializeApp()
const db = admin.firestore()
const now = () => admin.firestore.FieldValue.serverTimestamp()

// ─── NORMALIZADORES ─────────────────────────────────────────────────────────
function normalizarTelefono(raw: string): string {
  const limpio = (raw || '').replace(/\D/g, '')
  if (!limpio) return ''
  if (limpio.length === 10 && limpio.startsWith('11')) return `549${limpio}`
  if (limpio.length === 11 && limpio.startsWith('911')) return `54${limpio}`
  return limpio.startsWith('54') ? limpio : `54${limpio}`
}
const normalizarDNI = (raw: string) => (raw || '').replace(/[.\s-]/g, '')
const normalizarPatente = (raw: string) => (raw || '').toUpperCase().replace(/\s/g, '')
const validarPatente = (p: string) => /^[A-Z]{3}\d{3}$/.test(p) || /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p)

const PIPELINE_MULTAS = (process.env.KOMMO_PIPELINE_MULTAS ?? '').trim()

function campoKommo(customFields: any[], nombres: string[]): string {
  const lows = nombres.map(n => n.toLowerCase())
  const f = (customFields ?? []).find(cf => lows.includes(String(cf?.name ?? '').trim().toLowerCase()))
  return f?.values?.[0]?.value != null ? String(f.values[0].value) : ''
}

// ─── TIPOS ──────────────────────────────────────────────────────────────────
interface LeadNormalizado {
  nombre: string; telefono: string; dni: string; patente: string
  email: string; canal: string; mensaje: string
  kommoLeadId: string | null; kommoContactId: string | null
}

// ─── PARSEO ─────────────────────────────────────────────────────────────────
function desdeFormatoSimple(b: any): LeadNormalizado {
  return {
    nombre: String(b.nombre ?? '').trim(),
    telefono: normalizarTelefono(String(b.telefono ?? '')),
    dni: normalizarDNI(String(b.dni ?? '')),
    patente: normalizarPatente(String(b.patente ?? '')),
    email: String(b.email ?? ''),
    canal: String(b.canal ?? 'whatsapp'),
    mensaje: String(b.mensaje ?? ''),
    kommoLeadId: b.kommoLeadId ? String(b.kommoLeadId) : null,
    kommoContactId: b.kommoContactId ? String(b.kommoContactId) : null,
  }
}

function desdeKommoNativo(body: any): LeadNormalizado[] {
  const todos: any[] = [
    ...((body?.leads?.add ?? []) as any[]),
    ...((body?.leads?.update ?? []) as any[]),
  ]
  if (!PIPELINE_MULTAS && todos.length > 0) {
    logger.warn('[kommo] KOMMO_PIPELINE_MULTAS sin configurar: se aceptan leads de TODOS los pipelines', {
      pipelines: todos.map(l => l?.pipeline_id),
    })
  }
  const leads = PIPELINE_MULTAS
    ? todos.filter(l => String(l?.pipeline_id ?? '') === PIPELINE_MULTAS)
    : todos
  if (PIPELINE_MULTAS && todos.length > 0 && leads.length === 0) {
    logger.info('[kommo] leads ignorados (otro pipeline)', {
      pipelines: todos.map(l => l?.pipeline_id),
    })
  }
  const contactos: any[] = [
    ...((body?.contacts?.add ?? []) as any[]),
    ...((body?.contacts?.update ?? []) as any[]),
  ]
  const telPorContacto = new Map<string, string>()
  for (const c of contactos) {
    const tels = (c.custom_fields ?? [])
      .filter((f: any) => f?.code === 'PHONE' || /tel|whatsapp|phone/i.test(String(f?.name ?? '')))
      .map((f: any) => String(f?.values?.[0]?.value ?? ''))
      .filter(Boolean)
    if (c?.id != null && tels.length) telPorContacto.set(String(c.id), tels[0])
  }
  return leads.map(l => {
    const cf = l.custom_fields ?? []
    const contactoId = l.contact_id ?? l.main_contact_id ?? null
    return {
      nombre: String(l.name ?? ''),
      telefono: normalizarTelefono(
        campoKommo(cf, ['teléfono', 'telefono', 'tel', 'whatsapp']) ||
        telPorContacto.get(String(contactoId)) || ''
      ),
      dni: normalizarDNI(campoKommo(cf, ['dni', 'cuit', 'dni/cuit', 'documento'])),
      patente: normalizarPatente(campoKommo(cf, ['patente', 'dominio', 'patente/dominio'])),
      email: campoKommo(cf, ['email', 'correo']),
      canal: 'whatsapp',
      mensaje: campoKommo(cf, ['consulta', 'mensaje', 'nota']),
      kommoLeadId: l.id != null ? String(l.id) : null,
      kommoContactId: contactoId != null ? String(contactoId) : null,
    }
  })
}

// ─── PROSPECTO + CONSULTA ───────────────────────────────────────────────────
async function crearProspectoYConsulta(p: {
  gestoriaId: string; nombre: string; apellido?: string; telefono?: string; email?: string
  patente: string; dni: string; mensaje: string; canal: string; leadId: string
}) {
  const tipoConsulta: 'dominio' | 'dni' = p.patente ? 'dominio' : 'dni'
  const pRef = await db.collection('prospectos').add({
    gestoriaId: p.gestoriaId,
    nombre: p.nombre || 'Sin nombre',
    apellido: p.apellido ?? '',
    telefono: p.telefono ?? '',
    email: p.email ?? '',
    localidad: '',
    etapa: 'nuevo', color: 'azul',
    tipoTramite: 'descargo_multa',
    patente: p.patente, documento: p.dni,
    descripcion: p.mensaje || `Consulta Kommo ${p.patente || p.dni}`,
    montoCierre: 0, formaPago: '', fechaCierre: '',
    tareas: [], etiquetas: ['kommo'],
    leadId: p.leadId, creadoPor: 'kommo',
    orden: Date.now(), creadoEn: now(), actualizadoEn: now(),
  })
  const cRef = await db.collection('consultasInfracciones').add({
    gestoriaId: p.gestoriaId,
    tipoConsulta,
    ...(tipoConsulta === 'dominio' ? { dominio: p.patente } : { dni: p.dni, tipoDocumento: 'DNI' }),
    contacto: { nombre: `${p.nombre} ${p.apellido ?? ''}`.trim(), whatsapp: p.telefono ?? '', email: p.email ?? '' },
    origen: p.canal, estado: 'pendiente',
    prospectoId: pRef.id, leadId: p.leadId, creadaEn: now(),
  })
  return { prospectoId: pRef.id, consultaId: cRef.id }
}

// ─── NÚCLEO ─────────────────────────────────────────────────────────────────
async function procesarLead(b: LeadNormalizado) {
  const gestoriaId = process.env.GESTORIA_ID_WEB ?? 'gestoria-paz'
  let patente = b.patente
  if (patente && !validarPatente(patente)) patente = ''

  // Dedup nivel 1: kommoLeadId / nivel 2: teléfono
  let existingId: string | null = null
  if (b.kommoLeadId) {
    const dup = await db.collection('leads')
      .where('gestoriaId', '==', gestoriaId).where('kommoLeadId', '==', b.kommoLeadId)
      .limit(1).get()
    if (!dup.empty) existingId = dup.docs[0].id
  }
  if (!existingId && b.telefono) {
    const dup = await db.collection('leads')
      .where('gestoriaId', '==', gestoriaId).where('telefono', '==', b.telefono)
      .limit(1).get()
    if (!dup.empty) existingId = dup.docs[0].id
  }

  // ── Ya existe → completar campos faltantes ──
  if (existingId) {
    const ref = db.collection('leads').doc(existingId)
    const ld = ((await ref.get()).data() ?? {}) as any
    const patch: Record<string, unknown> = { actualizadoEn: now() }
    if (patente && !ld.patente) patch.patente = patente
    if (b.dni && !ld.documento) patch.documento = b.dni
    if (b.telefono && !ld.telefono) patch.telefono = b.telefono
    if (b.email && !ld.email) patch.email = b.email
    if (b.mensaje && !ld.consulta) patch.consulta = b.mensaje
    await ref.update(patch)

    const patenteFinal = patente || ld.patente || ''
    const dniFinal = b.dni || ld.documento || ''
    const clave = patenteFinal || dniFinal
    if (!ld.consultaId && clave) {
      const ids = await crearProspectoYConsulta({
        gestoriaId, nombre: ld.nombre ?? b.nombre, apellido: ld.apellido ?? '',
        telefono: ld.telefono ?? b.telefono, email: ld.email ?? b.email,
        patente: patenteFinal, dni: dniFinal,
        mensaje: ld.consulta ?? b.mensaje, canal: ld.canal ?? b.canal, leadId: existingId,
      })
      await ref.update(ids)
      return { ok: true, leadId: existingId, duplicado: true, encolado: true, ...ids }
    }
    return { ok: true, leadId: existingId, duplicado: true, encolado: !!ld.consultaId }
  }

  // ── No existe → crear ──
  const [nom, ...resto] = (b.nombre || 'Sin nombre').split(' ')
  const apellido = resto.join(' ')
  const base = {
    gestoriaId,
    nombre: nom, apellido,
    telefono: b.telefono, email: b.email,
    documento: b.dni, patente,
    canal: b.canal, origenSistema: 'kommo',
    estado: 'nuevo', prioridad: 'normal',
    tipoTramiteInteres: 'descargo_multa',
    consulta: b.mensaje || `Lead Kommo vía ${b.canal}`,
    kommoLeadId: b.kommoLeadId, kommoContactId: b.kommoContactId,
    creadoPor: 'kommo', creadoEn: now(), actualizadoEn: now(),
  }
  // ID determinista cuando hay kommoLeadId → retries/duplicados convergen al mismo doc
  let leadId: string
  if (b.kommoLeadId) {
    leadId = `kommo_${gestoriaId}_${b.kommoLeadId}`
    await db.collection('leads').doc(leadId).set(base, { merge: true })
  } else {
    leadId = (await db.collection('leads').add(base)).id
  }

  let ids: { prospectoId?: string; consultaId?: string } = {}
  if (patente || b.dni) {
    ids = await crearProspectoYConsulta({
      gestoriaId, nombre: b.nombre, apellido,
      telefono: b.telefono, email: b.email, patente, dni: b.dni,
      mensaje: b.mensaje, canal: b.canal, leadId,
    })
    await db.collection('leads').doc(leadId).update(ids)
  }
  await db.collection('eventos').add({
    gestoriaId, tipo: 'lead.creado', entidad: 'lead', entidadId: leadId,
    entidadLabel: b.nombre || b.telefono,
    actor: { id: 'kommo', nombre: 'Kommo', tipo: 'sistema' },
    payload: { canal: b.canal, origenSistema: 'kommo', kommoLeadId: b.kommoLeadId },
    resumen: `Nuevo lead ${b.nombre || b.telefono} vía Kommo (${b.canal})`,
    timestamp: now(),
  })
  logger.info('[kommo] lead nuevo', { leadId, kommoLeadId: b.kommoLeadId })
  return { ok: true, leadId, duplicado: false, ...ids }
}

// ─── HANDLER ────────────────────────────────────────────────────────────────
export const kommoRecibirLead = onRequest(
  { region: 'us-central1', cors: true, timeoutSeconds: 30 },
  async (req, res) => {
    if (req.method === 'OPTIONS') { res.status(204).send(''); return }
    if (req.method === 'GET') { res.status(200).json({ ok: true }); return }
    if (req.method !== 'POST') { res.status(405).json({ ok: false }); return }

    const key = (req.headers['x-kommo-key'] as string) || (req.query.key as string) || ''
    if (!process.env.KOMMO_WEBHOOK_KEY || key !== process.env.KOMMO_WEBHOOK_KEY) {
      res.status(401).json({ ok: false, error: 'Key inválida' }); return
    }

    const body = req.body ?? {}
    const esNativo = Boolean(body?.leads || body?.contacts)
    const entrantes: LeadNormalizado[] = esNativo ? desdeKommoNativo(body) : [desdeFormatoSimple(body)]

    if (entrantes.length === 0 || entrantes.every(e => !e.nombre && !e.telefono)) {
      const sampleLead = body?.leads?.update?.[0] ?? body?.leads?.add?.[0] ?? null
      const sampleContact = body?.contacts?.update?.[0] ?? body?.contacts?.add?.[0] ?? null
      logger.info('[kommo] webhook recibido, sin leads parseables', {
        formatoDetectado: esNativo ? 'kommo-nativo' : 'simple',
        bodyKeys: Object.keys(body ?? {}),
        leadsKeys: body?.leads ? Object.keys(body.leads) : null,
        contactsKeys: body?.contacts ? Object.keys(body.contacts) : null,
        pipelineEsperado: PIPELINE_MULTAS || '(sin filtro)',
        sampleLeadName: sampleLead?.name ?? '(sin name)',
        sampleLeadPipeline: sampleLead?.pipeline_id ?? '(sin pipeline_id)',
        sampleLeadKeys: sampleLead ? Object.keys(sampleLead) : null,
        sampleLeadCustomFields: sampleLead?.custom_fields ?? null,
        sampleContactKeys: sampleContact ? Object.keys(sampleContact) : null,
        sampleContactCustomFields: sampleContact?.custom_fields
          ? (Array.isArray(sampleContact.custom_fields)
              ? sampleContact.custom_fields.slice(0, 5).map((cf: any) => ({
                  id: cf.id, name: cf.name, code: cf.code,
                  valuesType: Array.isArray(cf.values) ? 'array' : typeof cf.values,
                  valuesLen: Array.isArray(cf.values) ? cf.values.length : null,
                  firstValue: Array.isArray(cf.values) && cf.values[0] ? Object.keys(cf.values[0]) : null,
                }))
              : typeof sampleContact.custom_fields)
          : null,
      })
    }

    const resultados: any[] = []
    for (const b of entrantes) {
      if (!b.nombre && !b.telefono) { resultados.push({ ok: false, error: 'Sin nombre ni teléfono' }); continue }
      try {
        resultados.push(await procesarLead(b))
      } catch (e: any) {
        logger.error('[kommo] error procesando lead', {
          kommoLeadId: b.kommoLeadId, telefono: b.telefono, error: e?.message,
        })
        resultados.push({ ok: false, error: e?.message ?? 'Error interno', kommoLeadId: b.kommoLeadId })
      }
    }
    logger.info('[kommo] batch procesado', {
      total: entrantes.length, ok: resultados.filter(r => r?.ok).length,
    })
    res.status(200).json({ ok: true, procesados: resultados })
  }
)
