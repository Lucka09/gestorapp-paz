import {
  addDoc, updateDoc, deleteDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp,
  onSnapshot, collection, doc,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../firebase'
import { emitirEventoSilencioso, type ActorInfo } from './eventos'
import { crearProspecto } from './pipeline'
import { extraerClaveMultas, asegurarConsultaMultas } from './consultasMultas'
import {
  crearEvento,
  type Lead, type LeadInput, type EstadoLead, type OrigenSistema,
  type TipoEvento, type OrigenCanal, type TipoTramite,
} from '@/types'

// ─── COLECCIÓN ────────────────────────────────────────────────────────────────
const leadsCol = collection(db, 'leads')
const leadDoc  = (id: string) => doc(db, 'leads', id)
const consultasCol = collection(db, 'consultasInfracciones')
// ─── HELPERS ──────────────────────────────────────────────────────────────────
function leadLabel(l: { nombre: string; apellido?: string }): string {
  return l.apellido ? `${l.apellido}, ${l.nombre}` : l.nombre
}

/** Mapea estado del lead → tipo de evento a emitir */
const EVENTO_POR_ESTADO: Partial<Record<EstadoLead, TipoEvento>> = {
  contactado: 'lead.contactado',
  calificado: 'lead.calificado',
  perdido:    'lead.perdido',
  descartado: 'lead.descartado',
}

// ─── READ (tiempo real) ──────────────────────────────────────────────────────
export function subscribeLeads(
  gestoriaId: string,
  callback:   (leads: Lead[]) => void,
): Unsubscribe {
  const q = query(
    leadsCol,
    where('gestoriaId', '==', gestoriaId),
    orderBy('creadoEn', 'desc'),
    limit(300),
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as Lead))
  )
}

// ─── WRITE ────────────────────────────────────────────────────────────────────

/**
 * Crea un lead. `opts.origenSistema` distingue de dónde vino:
 *   'manual' | 'web_form' | 'wa_api' | 'campana' | 'referido' | 'import'
 */
export async function crearLead(
  gestoriaId: string,
  data:       LeadInput,
  creadoPor:  string,
  opts: { origenSistema?: OrigenSistema; actor?: ActorInfo } = {},
): Promise<string> {
  const { utm, ...rest } = data
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) clean[k] = v
  }

  const origenSistema = opts.origenSistema ?? 'manual'
  const ref = await addDoc(leadsCol, {
    ...clean,
    gestoriaId,
    estado:        'nuevo',
    prioridad:     data.prioridad ?? 'normal',
    origenSistema,
    utm_source:    utm?.source  ?? null,
    utm_medium:    utm?.medium  ?? null,
    utm_campaign:  utm?.campaign ?? null,
    utm_content:   utm?.content ?? null,
    creadoPor,
    creadoEn:      serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  })

  // Evento fire-and-forget
  emitirEventoSilencioso(crearEvento({
    gestoriaId,
    tipo:         'lead.creado',
    entidad:      'lead',
    entidadId:    ref.id,
    entidadLabel: leadLabel(data),
    actorId:      opts.actor?.id ?? creadoPor,
    actorNombre:  opts.actor?.nombre,
    actorTipo:    opts.actor?.id ? 'usuario' : 'sistema',
    payload:      { canal: data.canal, telefono: data.telefono, origenSistema },
    resumen:      `Nuevo lead ${leadLabel(data)} vía ${data.canal}`,
  }))

  return ref.id
}

/** Edición general de campos (sin cambio de estado). */
export async function actualizarLead(
  id:    string,
  data:  Partial<LeadInput>,
  actor?: ActorInfo,
): Promise<void> {
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) clean[k] = v
  }
  await updateDoc(leadDoc(id), { ...clean, actualizadoEn: serverTimestamp() })
}

/**
 * Cambia el estado del lead y emite el evento correspondiente.
 * Para 'convertido', usar convertirLeadAProspecto() en su lugar.
 */
export async function cambiarEstadoLead(
  id:     string,
  estado: EstadoLead,
  actor?: ActorInfo,
  motivo?: string,
): Promise<void> {
  const snap = await getDoc(leadDoc(id))
  if (!snap.exists()) return
  const lead = { ...snap.data(), id: snap.id } as Lead

  await updateDoc(leadDoc(id), {
    estado,
    ...(motivo ? { motivoPerdidaNota: motivo } : {}),
    ...(estado === 'contactado' ? { ultimoContactoEn: serverTimestamp() } : {}),
    actualizadoEn: serverTimestamp(),
  })

  const tipoEvento = EVENTO_POR_ESTADO[estado]
  if (tipoEvento) {
    emitirEventoSilencioso(crearEvento({
      gestoriaId:   lead.gestoriaId,
      tipo:         tipoEvento,
      entidad:      'lead',
      entidadId:    id,
      entidadLabel: leadLabel(lead),
      actorId:      actor?.id ?? lead.creadoPor,
      actorNombre:  actor?.nombre,
      actorTipo:    actor?.id ? 'usuario' : 'sistema',
      payload:      { estado, motivo },
      resumen:      `Lead ${leadLabel(lead)} → ${estado}`,
    }))
  }
}

/** Asigna el lead a un vendedor/asesor. */
export async function asignarLead(
  id:       string,
  uid:      string,
  nombre:   string,
  actor?:   ActorInfo,
): Promise<void> {
  const snap = await getDoc(leadDoc(id))
  if (!snap.exists()) return
  const lead = { ...snap.data(), id: snap.id } as Lead

  await updateDoc(leadDoc(id), {
    asignadoA: uid,
    asignadoNombre: nombre,
    actualizadoEn: serverTimestamp(),
  })

  emitirEventoSilencioso(crearEvento({
    gestoriaId:   lead.gestoriaId,
    tipo:         'lead.asignado',
    entidad:      'lead',
    entidadId:    id,
    entidadLabel: leadLabel(lead),
    actorId:      actor?.id ?? lead.creadoPor,
    actorNombre:  actor?.nombre,
    actorTipo:    actor?.id ? 'usuario' : 'sistema',
    payload:      { asignadoA: uid, asignadoNombre: nombre },
    resumen:      `Lead ${leadLabel(lead)} asignado a ${nombre}`,
  }))
}

/**
 * Convierte el lead en un Prospecto del pipeline.
 * Crea el prospecto, marca el lead como convertido y emite ambos eventos.
 * @returns id del prospecto creado
 */
export async function convertirLeadAProspecto(
  id:    string,
  actor?: ActorInfo,
): Promise<string> {
  const snap = await getDoc(leadDoc(id))
  if (!snap.exists()) throw new Error('Lead no encontrado')
  const lead = { ...snap.data(), id: snap.id } as Lead

  // 1. Crear el prospecto en el pipeline
  const prospectoData = {
    gestoriaId:  lead.gestoriaId,
    nombre:      lead.nombre,
    apellido:    lead.apellido ?? '',
    documento:    lead.documento ?? '',
    telefono:    lead.telefono ?? '',
    email:       lead.email ?? '',
    localidad:   lead.localidad ?? '',
    etapa:       'nuevo',
    color:       'azul',
    tipoTramite: (lead.tipoTramiteInteres ?? 'transferencia') as TipoTramite,
    patente:     '',
    descripcion: lead.consulta ?? '',
    montoCierre: 0,
    formaPago:   '',
    fechaCierre: '',
    asignadoA:   lead.asignadoA ?? '',
  }
  const prospectoId = await crearProspecto(
    prospectoData as any,
    actor?.id ?? lead.creadoPor,
    actor,
  )

  // 2. Marcar el lead como convertido
  await updateDoc(leadDoc(id), {
    estado:       'convertido',
    convertidoA:  'prospecto',
    prospectoId,
    actualizadoEn: serverTimestamp(),
  })

  // 3. Evento de conversión
  emitirEventoSilencioso(crearEvento({
    gestoriaId:   lead.gestoriaId,
    tipo:         'lead.convertido',
    entidad:      'lead',
    entidadId:    id,
    entidadLabel: leadLabel(lead),
    actorId:      actor?.id ?? lead.creadoPor,
    actorNombre:  actor?.nombre,
    actorTipo:    actor?.id ? 'usuario' : 'sistema',
    payload:      { prospectoId },
    resumen:      `Lead ${leadLabel(lead)} convertido en prospecto`,
  }))

  return prospectoId
}

export async function eliminarLead(id: string): Promise<void> {
  await deleteDoc(leadDoc(id))
  // Sin evento: queda en audit_log.
}
// ─── VALIDACIONES Y NORMALIZACIÓN ─────────────────────────────────────────────

export function normalizarDNI(raw: string): string {
  return raw.replace(/[.\s-]/g, '')
}

export function normalizarPatente(raw: string): string {
  return raw.toUpperCase().replace(/\s/g, '')
}

export function normalizarTelefono(raw: string): string {
  const limpio = raw.replace(/\D/g, '')
  if (limpio.length === 10 && limpio.startsWith('11')) {
    return `549${limpio}`
  }
  if (limpio.length === 11 && limpio.startsWith('911')) {
    return `54${limpio}`
  }
  return limpio.startsWith('54') ? limpio : `54${limpio}`
}

export function validarPatente(patente: string): boolean {
  const normalizada = normalizarPatente(patente)
  // Formato viejo: ABC123
  if (/^[A-Z]{3}\d{3}$/.test(normalizada)) return true
  // Formato nuevo: AB123CD
  if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(normalizada)) return true
  return false
}

export function validarDNI(dni: string): boolean {
  const normalizado = normalizarDNI(dni)
  return /^\d{7,8}$/.test(normalizado)
}

export interface ResultadoValidacion {
  /** Errores que SÍ bloquean (nombre faltante o formato inválido de un dato cargado) */
  bloqueantes: string[]
  /** Avisos que NO bloquean (datos opcionales faltantes) */
  avisos: string[]
  datosNormalizados: Partial<LeadInput>
}

export function validarLead(data: LeadInput): ResultadoValidacion {
  const bloqueantes: string[] = []
  const avisos: string[] = []
  const datosNormalizados: Partial<LeadInput> = {}

  if (!data.nombre?.trim()) bloqueantes.push('El nombre es obligatorio')

  if (!data.telefono && !data.email) {
    avisos.push('Sin teléfono ni email: no vas a poder responderle al cliente')
  }
  if (data.telefono) {
    const tel = normalizarTelefono(data.telefono)
    if (tel.length < 10) bloqueantes.push('Teléfono inválido')
    else datosNormalizados.telefono = tel
  }

  // Si no cargaron patente/DNI en los campos, extraerlos de la consulta/nota
  const extraida = (!data.patente || !data.documento) ? extraerClaveMultas(data.consulta ?? '') : {}
  const patenteBruta  = data.patente  || extraida.patente
  const documentoBruto = data.documento || extraida.dni

  if (patenteBruta) {
    const pat = normalizarPatente(patenteBruta)
    if (!validarPatente(pat)) bloqueantes.push('Patente inválida (ABC123 o AB123CD)')
    else datosNormalizados.patente = pat
  }
  if (documentoBruto) {
    const dni = normalizarDNI(documentoBruto)
    if (!validarDNI(dni)) bloqueantes.push('DNI inválido (7-8 dígitos)')
    else datosNormalizados.documento = dni
  }

  if (!patenteBruta && !documentoBruto) {
    avisos.push('Sin patente ni DNI: el lead se guarda, pero aún no puede ir a la cola de consultas')
  }

  return { bloqueantes, avisos, datosNormalizados }
}

// ─── DEDUPLICACIÓN ────────────────────────────────────────────────────────────

export async function buscarLeadDuplicado(
  gestoriaId: string,
  data: Partial<LeadInput>
): Promise<Lead | null> {
  const candidatos: Array<[string, string]> = []
  if (data.telefono)  candidatos.push(['telefono',  normalizarTelefono(data.telefono)])
  if (data.documento) candidatos.push(['documento', normalizarDNI(data.documento)])
  if (data.patente)   candidatos.push(['patente',   normalizarPatente(data.patente)])

  for (const [campo, valor] of candidatos) {
    const snap = await getDocs(query(
      leadsCol,
      where('gestoriaId', '==', gestoriaId),
      where(campo, '==', valor),
      limit(1)
    ))
    if (!snap.empty) {
      return { ...snap.docs[0].data(), id: snap.docs[0].id } as Lead
    }
  }
  return null
}

/** Detecta trámites de multas sin depender del rename del label/clave. */
export function esTipoMulta(tipo?: string): boolean {
  const t = (tipo ?? '').toLowerCase()
  return t === 'descargo_multa' || t === 'reporte_multa' || t.includes('multa')
}

/**
 * Convierte un Lead en:
 * 1. Prospecto en /prospectos (para el Pipeline CRM)
 * 2. Consulta en /consultasInfracciones (para la extensión, si es descargo de multa)
 *
 * Retorna: { prospectoId, consultaId? }
 */
export async function convertirLeadAConsulta(
  leadId: string,
  actor?: ActorInfo
): Promise<{ prospectoId: string; consultaId?: string }> {
  const snap = await getDoc(leadDoc(leadId))
  if (!snap.exists()) throw new Error('Lead no encontrado')
  const lead = { ...snap.data(), id: snap.id } as Lead

  // 1) Prospecto en el pipeline
  const prospectoData = {
    gestoriaId:  lead.gestoriaId,
    nombre:      lead.nombre,
    apellido:    lead.apellido ?? '',
    telefono:    lead.telefono ?? '',
    email:       lead.email ?? '',
    localidad:   lead.localidad ?? '',
    etapa:       'nuevo' as const,
    color:       'azul' as const,
    tipoTramite: (lead.tipoTramiteInteres ?? 'descargo_multa') as TipoTramite,
    patente:     lead.patente ? normalizarPatente(lead.patente) : '',
    documento:   lead.documento ? normalizarDNI(lead.documento) : '',
    descripcion: lead.consulta ?? '',
    montoCierre: 0,
    formaPago:   '' as const,
    fechaCierre: '',
    asignadoA:   lead.asignadoA ?? '',
    leadId,
  }
  const prospectoId = await crearProspecto(
    prospectoData as any,
    actor?.id ?? lead.creadoPor,
    actor
  )

  const tipoConsulta: 'dominio' | 'dni' = prospectoData.patente ? 'dominio' : 'dni'
  const valor = prospectoData.patente || prospectoData.documento
  if (!valor) throw new Error('El lead necesita patente o DNI para ir a la cola')

  // 2) Consulta para la extensión (dominio O dni)
  let consultaId: string | undefined
  if (esTipoMulta(prospectoData.tipoTramite)) {
    const consultaRef = await addDoc(consultasCol, {
      gestoriaId:   lead.gestoriaId,
      tipoConsulta,
      ...(tipoConsulta === 'dominio'
        ? { dominio: valor }
        : { dni: valor, tipoDocumento: 'DNI' }),
      contacto: {
        nombre:   lead.nombre,
        whatsapp: lead.telefono ?? '',
        email:    lead.email ?? '',
      },
      origen:       lead.canal,
      estado:       'pendiente',
      prospectoId,
      leadId,
      creadaEn:     serverTimestamp(),
    })
    consultaId = consultaRef.id
  }

  // 3) Marcar lead convertido
  await updateDoc(leadDoc(leadId), {
    estado:        'convertido',
    convertidoA:   'prospecto',
    prospectoId,
    consultaId:    consultaId ?? null,
    actualizadoEn: serverTimestamp(),
  })

  // 4) Evento
  emitirEventoSilencioso(crearEvento({
    gestoriaId:   lead.gestoriaId,
    tipo:         'lead.convertido',
    entidad:      'lead',
    entidadId:    leadId,
    entidadLabel: `${lead.apellido ?? ''}, ${lead.nombre}`.trim(),
    actorId:      actor?.id ?? lead.creadoPor,
    actorNombre:  actor?.nombre,
    actorTipo:    actor?.id ? 'usuario' : 'sistema',
    payload:      { prospectoId, consultaId, tipoConsulta },
    resumen:      `Lead ${lead.nombre} → prospecto + consulta (${tipoConsulta})`,
  }))

  return { prospectoId, consultaId }
}