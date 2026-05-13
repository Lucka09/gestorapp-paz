import {
  collection, doc, query, where, orderBy,
  getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, writeBatch,
  type Unsubscribe, Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { tramitesCol, turnosCol, clientesCol } from './collections'
import { getVencimientosProximos, calcularEstado, diasRestantes } from './vencimientos'
import { VENCIMIENTO_LABELS } from '@/types'
import type { Tramite, Turno, Cliente } from '@/types'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export type NivelAlerta = 'critica' | 'urgente' | 'advertencia' | 'info'
export type CategoriaAlerta =
  | 'tramites'    // problemas con trámites
  | 'turnos'      // problemas con turnos
  | 'cobranzas'   // cobros pendientes
  | 'clientes'    // seguimiento de clientes
  | 'sistema'     // problemas del sistema

export interface Alerta {
  id:          string
  nivel:       NivelAlerta
  categoria:   CategoriaAlerta
  titulo:      string
  detalle:     string
  link?:       string
  leida:       boolean
  resuelta:    boolean
  datos?:      Record<string, any>  // datos extra (ids de tramites, etc.)
  creadaEn:    Timestamp
  actualizadaEn: Timestamp
}

// ─── COLECCIÓN ────────────────────────────────────────────────────────────────

const alertasCol = collection(db, 'alertas_sistema')
const alertaDoc  = (id: string) => doc(db, 'alertas_sistema', id)

// ─── CONFIG DE UMBRALES ───────────────────────────────────────────────────────

const UMBRALES = {
  docsRequeridaDias:   5,   // días sin respuesta → alerta crítica
  organismoMaxDias:   10,   // días en organismo → advertencia
  cobranazMaxDias:    15,   // días sin cobrar trámite entregado → alerta
  clienteSinActDias:  45,   // días sin actividad → info
  turnosAnticipacion:  1,   // días antes para confirmar turnos
  cobranzaMonto:    5000,   // monto mínimo para alertar
}

// ─── MOTOR DE ALERTAS ─────────────────────────────────────────────────────────

export async function ejecutarMotorAlertas(): Promise<number> {
  const ahora = new Date()
  const batch = writeBatch(db)
  let   count = 0

  const [snapTramites, snapTurnos, snapClientes] = await Promise.all([
    getDocs(query(tramitesCol, orderBy('actualizadoEn', 'desc'))),
    getDocs(query(turnosCol,   orderBy('fecha', 'asc'))),
    getDocs(clientesCol),
  ])

  const tramites = snapTramites.docs.map(d => ({ ...d.data(), id: d.id })) as Tramite[]
  const turnos   = snapTurnos.docs.map(d =>   ({ ...d.data(), id: d.id })) as Turno[]
  const clientes = snapClientes.docs.map(d => ({ ...d.data(), id: d.id })) as Cliente[]
  const clienteMap = Object.fromEntries(clientes.map(c => [c.id, c]))

  const upsertAlerta = (id: string, data: Omit<Alerta,'id'|'leida'|'resuelta'|'creadaEn'|'actualizadaEn'>) => {
    const ref = alertaDoc(id)
    batch.set(ref, {
      ...data,
      leida:         false,
      resuelta:      false,
      creadaEn:      serverTimestamp(),
      actualizadaEn: serverTimestamp(),
    }, { merge: true })
    count++
  }

  // ── 1. DOCUMENTACIÓN REQUERIDA SIN RESPUESTA ─────────────────────────────
  const tramitesDocsVencidas = tramites.filter(t => {
    if (t.estado !== 'documentacion_requerida') return false
    const d = t.actualizadoEn?.toDate?.()
    if (!d) return false
    return diasEntre(d, ahora) > UMBRALES.docsRequeridaDias
  })

  tramitesDocsVencidas.forEach(t => {
    const cliente = clienteMap[t.clienteId]
    const dias    = diasEntre(t.actualizadoEn?.toDate?.() ?? ahora, ahora)
    upsertAlerta(`docs-${t.id}`, {
      nivel:     'critica',
      categoria: 'tramites',
      titulo:    'Documentación pendiente sin respuesta',
      detalle:   `${cliente ? nomCliente(cliente) : 'Cliente'} — ${t.patente} lleva ${dias} días sin enviar los documentos.`,
      link:      `/admin/tramites/${t.id}`,
      datos:     { tramiteId: t.id, clienteId: t.clienteId, dias },
    })
  })

  // ── 2. TRÁMITES EN ORGANISMO MUY LARGO TIEMPO ────────────────────────────
  const tramitesOrganismoLargo = tramites.filter(t => {
    if (t.estado !== 'en_organismo') return false
    const d = t.actualizadoEn?.toDate?.()
    if (!d) return false
    return diasEntre(d, ahora) > UMBRALES.organismoMaxDias
  })

  if (tramitesOrganismoLargo.length > 0) {
    upsertAlerta('organismo-largo', {
      nivel:     'advertencia',
      categoria: 'tramites',
      titulo:    `${tramitesOrganismoLargo.length} trámite${tramitesOrganismoLargo.length > 1 ? 's' : ''} demorándose en organismo`,
      detalle:   `Llevan más de ${UMBRALES.organismoMaxDias} días en el organismo sin actualización. Verificá el estado.`,
      link:      '/admin/tramites',
      datos:     { ids: tramitesOrganismoLargo.map(t => t.id) },
    })
  }

  // ── 3. TRÁMITES LISTOS PARA RETIRAR SIN RETIRAR ───────────────────────────
  const tramitesListosSinRetirar = tramites.filter(t => {
    if (t.estado !== 'listo_para_retirar') return false
    const d = t.actualizadoEn?.toDate?.()
    if (!d) return false
    return diasEntre(d, ahora) > 3
  })

  if (tramitesListosSinRetirar.length > 0) {
    upsertAlerta('listos-sin-retirar', {
      nivel:     'advertencia',
      categoria: 'tramites',
      titulo:    `${tramitesListosSinRetirar.length} trámite${tramitesListosSinRetirar.length > 1 ? 's' : ''} listos hace más de 3 días`,
      detalle:   'Los clientes todavía no pasaron a retirar. Considerá enviarles un recordatorio.',
      link:      '/admin/tramites',
      datos:     { ids: tramitesListosSinRetirar.map(t => t.id) },
    })
  }

  // ── 4. TURNOS DE MAÑANA SIN CONFIRMAR ────────────────────────────────────
  const manana    = new Date(ahora); manana.setDate(manana.getDate() + 1); manana.setHours(0,0,0,0)
  const mananaFin = new Date(manana); mananaFin.setHours(23,59,59,999)

  const turnosMananaSinConfirmar = turnos.filter(t => {
    const d = t.fecha?.toDate?.()
    return d && d >= manana && d <= mananaFin && (t.estado as string) === 'pendiente'
  })

  if (turnosMananaSinConfirmar.length > 0) {
    upsertAlerta('turnos-manana', {
      nivel:     'urgente',
      categoria: 'turnos',
      titulo:    `${turnosMananaSinConfirmar.length} turno${turnosMananaSinConfirmar.length > 1 ? 's' : ''} de mañana sin confirmar`,
      detalle:   'Confirmá los turnos hoy para que los clientes reciban la notificación a tiempo.',
      link:      '/admin/turnos',
      datos:     { ids: turnosMananaSinConfirmar.map(t => t.id) },
    })
  }

  // ── 5. TURNOS DE HOY SIN ATENDER ─────────────────────────────────────────
  const hoyInicio = new Date(ahora); hoyInicio.setHours(0,0,0,0)
  const hoyFin    = new Date(ahora); hoyFin.setHours(23,59,59,999)

  const turnosHoyCancelados = turnos.filter(t => {
    const d = t.fecha?.toDate?.()
    return d && d >= hoyInicio && d <= hoyFin && (t.estado as string) === 'cancelado'
  })

  if (turnosHoyCancelados.length >= 2) {
    upsertAlerta('turnos-hoy-cancelados', {
      nivel:     'info',
      categoria: 'turnos',
      titulo:    `${turnosHoyCancelados.length} turnos cancelados hoy`,
      detalle:   'Hay franjas horarias liberadas hoy. Podés ofrecérselas a clientes en lista de espera.',
      link:      '/admin/turnos',
      datos:     { cantidad: turnosHoyCancelados.length },
    })
  }

  // ── 6. COBRANZAS VENCIDAS ────────────────────────────────────────────────
  const tramitesEntregadosSinCobrar = tramites.filter(t => {
    if (t.pagado || t.honorarios < UMBRALES.cobranzaMonto) return false
    if (!['entregado', 'listo_para_retirar'].includes(t.estado)) return false
    const d = t.actualizadoEn?.toDate?.()
    if (!d) return false
    return diasEntre(d, ahora) > UMBRALES.cobranazMaxDias
  })

  if (tramitesEntregadosSinCobrar.length > 0) {
    const totalSinCobrar = tramitesEntregadosSinCobrar.reduce((a, t) => a + (t.honorarios ?? 0), 0)
    upsertAlerta('cobranzas-vencidas', {
      nivel:     'urgente',
      categoria: 'cobranzas',
      titulo:    `$${totalSinCobrar.toLocaleString('es-AR')} sin cobrar hace más de ${UMBRALES.cobranazMaxDias} días`,
      detalle:   `${tramitesEntregadosSinCobrar.length} trámite${tramitesEntregadosSinCobrar.length > 1 ? 's' : ''} entregado${tramitesEntregadosSinCobrar.length > 1 ? 's' : ''} sin registrar el cobro.`,
      link:      '/admin/cobranzas',
      datos:     { ids: tramitesEntregadosSinCobrar.map(t => t.id), total: totalSinCobrar },
    })
  }

  // ── 7. PENDIENTE DE COBRO TOTAL ALTO ─────────────────────────────────────
  const totalPendiente = tramites
    .filter(t => !t.pagado && t.honorarios > 0 && t.estado !== 'cancelado')
    .reduce((a, t) => a + (t.honorarios ?? 0), 0)

  if (totalPendiente > 50000) {
    upsertAlerta('cobro-total-alto', {
      nivel:     'info',
      categoria: 'cobranzas',
      titulo:    `$${totalPendiente.toLocaleString('es-AR')} pendiente de cobro en total`,
      detalle:   'Hay honorarios acumulados sin registrar. Revisá el módulo de cobranzas.',
      link:      '/admin/cobranzas',
      datos:     { total: totalPendiente },
    })
  }

  // ── 8. CLIENTES SIN ACTIVIDAD PROLONGADA ─────────────────────────────────
  const umbralSinAct = new Date(ahora)
  umbralSinAct.setDate(umbralSinAct.getDate() - UMBRALES.clienteSinActDias)

  const clienteIdsConActividad = new Set(
    tramites
      .filter(t => {
        const d = t.creadoEn?.toDate?.()
        return d && d >= umbralSinAct
      })
      .map(t => t.clienteId)
  )

  const clientesSinActividad = clientes.filter(c =>
    !clienteIdsConActividad.has(c.id)
  )

  if (clientesSinActividad.length >= 5) {
    upsertAlerta('clientes-sin-actividad', {
      nivel:     'info',
      categoria: 'clientes',
      titulo:    `${clientesSinActividad.length} clientes sin actividad en más de ${UMBRALES.clienteSinActDias} días`,
      detalle:   'Son oportunidades de re-engagement. Revisá el pipeline CRM para programar el seguimiento.',
      link:      '/admin/pipeline',
      datos:     { cantidad: clientesSinActividad.length },
    })
  }

  // ── 9. MUCHOS TRÁMITES PENDIENTES ACUMULADOS ─────────────────────────────
  const tramitesPendientes = tramites.filter(t => t.estado === 'pendiente')
  if (tramitesPendientes.length >= 10) {
    upsertAlerta('pendientes-acumulados', {
      nivel:     'advertencia',
      categoria: 'tramites',
      titulo:    `${tramitesPendientes.length} trámites en estado pendiente`,
      detalle:   'Hay muchos trámites acumulados sin iniciar. Considerá avanzar los más antiguos.',
      link:      '/admin/tramites',
      datos:     { cantidad: tramitesPendientes.length },
    })
  }

  // ── 10. TRÁMITE SIN MOVIMIENTO EN 20 DÍAS ────────────────────────────────
  const tramitesSinMovimiento = tramites.filter(t => {
    if (['entregado','cancelado'].includes(t.estado)) return false
    const d = t.actualizadoEn?.toDate?.()
    if (!d) return false
    return diasEntre(d, ahora) > 20
  })

  if (tramitesSinMovimiento.length > 0) {
    upsertAlerta('tramites-sin-movimiento', {
      nivel:     'advertencia',
      categoria: 'tramites',
      titulo:    `${tramitesSinMovimiento.length} trámite${tramitesSinMovimiento.length > 1 ? 's' : ''} sin actualización en más de 20 días`,
      detalle:   'Estos trámites activos no tuvieron cambios de estado. Verificá si están avanzando.',
      link:      '/admin/tramites',
      datos:     { ids: tramitesSinMovimiento.map(t => t.id) },
    })
  }

  // ── 11. TASA DE CONVERSIÓN BAJA ───────────────────────────────────────────
  // Se calcula sobre los últimos 30 días
  const hace30 = new Date(ahora); hace30.setDate(hace30.getDate() - 30)
  const recientes = tramites.filter(t => {
    const d = t.creadoEn?.toDate?.()
    return d && d >= hace30
  })
  const entregados30 = recientes.filter(t => t.estado === 'entregado').length
  const conversion30 = recientes.length > 0
    ? Math.round((entregados30 / recientes.length) * 100)
    : null

  if (conversion30 !== null && conversion30 < 30 && recientes.length >= 5) {
    upsertAlerta('conversion-baja', {
      nivel:     'info',
      categoria: 'tramites',
      titulo:    `Tasa de cierre del ${conversion30}% en los últimos 30 días`,
      detalle:   `Solo ${entregados30} de ${recientes.length} trámites recientes llegaron a "Entregado". Revisá los cuellos de botella.`,
      link:      '/admin/tramites',
      datos:     { conversion: conversion30, total: recientes.length },
    })
  }

  // ── 12. SEMANA SIN NUEVOS TRÁMITES ────────────────────────────────────────
  const hace7 = new Date(ahora); hace7.setDate(hace7.getDate() - 7)
  const tramitesUltimaSemana = tramites.filter(t => {
    const d = t.creadoEn?.toDate?.()
    return d && d >= hace7
  })

  if (tramitesUltimaSemana.length === 0 && tramites.length > 0) {
    upsertAlerta('sin-tramites-semana', {
      nivel:     'info',
      categoria: 'sistema',
      titulo:    'Sin trámites nuevos en los últimos 7 días',
      detalle:   'No se registraron nuevos trámites esta semana. ¿Está todo cargado?',
      link:      '/admin/tramites',
      datos:     {},
    })
  }

  // ── 13. VENCIMIENTOS PRÓXIMOS ─────────────────────────────────────────────
  try {
    const vencProximos = await getVencimientosProximos('')
    const vencidos30   = vencProximos.filter(v => calcularEstado(v) === 'vencido')
    const porVencer30  = vencProximos.filter(v => calcularEstado(v) === 'por_vencer')

    if (vencidos30.length > 0) {
      upsertAlerta('vehiculos-vencidos', {
        nivel:     'urgente',
        categoria: 'tramites',
        titulo:    `${vencidos30.length} vencimiento${vencidos30.length > 1 ? 's' : ''} de vehículo vencido${vencidos30.length > 1 ? 's' : ''}`,
        detalle:   `VTV, seguro u otros documentos vencidos. Oportunidad para ofrecer el trámite de renovación.`,
        link:      '/admin/vencimientos',
        datos:     { cantidad: vencidos30.length },
      })
    }

    if (porVencer30.length > 0) {
      upsertAlerta('vehiculos-por-vencer', {
        nivel:     'advertencia',
        categoria: 'tramites',
        titulo:    `${porVencer30.length} vencimiento${porVencer30.length > 1 ? 's' : ''} próximo en 30 días`,
        detalle:   `Documentos de vehículos que vencen pronto. Ideal para contactar a los clientes y ofrecer el servicio.`,
        link:      '/admin/vencimientos',
        datos:     { cantidad: porVencer30.length },
      })
    }
  } catch { /* no romper el motor si falla esta parte */ }

  await batch.commit()
  return count
}

// ─── SUSCRIPCIÓN EN TIEMPO REAL ───────────────────────────────────────────────

export function subscribeAlertas(
  gestoriaId:   string,
  callback:     (alertas: Alerta[]) => void,
  soloNoLeidas  = false
): Unsubscribe {
  // SIEMPRE filtrar por gestoriaId para que las Security Rules puedan
  // evaluar docDeMiGestoria() correctamente y no dar permission-denied.
  const base = [where('gestoriaId', '==', gestoriaId), where('resuelta', '==', false)]
  const q = soloNoLeidas
    ? query(alertasCol, ...base, where('leida', '==', false), orderBy('creadaEn', 'desc'))
    : query(alertasCol, ...base, orderBy('creadaEn', 'desc'))

  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ ...d.data(), id: d.id }) as Alerta))
  )
}

// ─── ACCIONES ─────────────────────────────────────────────────────────────────

export async function marcarAlertaLeida(id: string): Promise<void> {
  await updateDoc(alertaDoc(id), {
    leida:         true,
    actualizadaEn: serverTimestamp(),
  })
}

export async function resolverAlerta(id: string): Promise<void> {
  await updateDoc(alertaDoc(id), {
    resuelta:      true,
    leida:         true,
    actualizadaEn: serverTimestamp(),
  })
}

export async function marcarTodasLeidas(): Promise<void> {
  const snap = await getDocs(query(alertasCol, where('leida', '==', false)))
  const batch = writeBatch(db)
  snap.docs.forEach(d => batch.update(d.ref, { leida: true, actualizadaEn: serverTimestamp() }))
  await batch.commit()
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function diasEntre(desde: Date, hasta: Date): number {
  return Math.floor((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24))
}

function nomCliente(c: Cliente): string {
  return `${c.apellido}, ${c.nombre}`
}

// ─── METADATOS DE DISPLAY ─────────────────────────────────────────────────────

export const NIVEL_CONFIG: Record<NivelAlerta, {
  label: string; color: string; bg: string; border: string; dot: string
}> = {
  critica:     { label: 'Crítica',     color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    dot: 'bg-red-500'    },
  urgente:     { label: 'Urgente',     color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-500' },
  advertencia: { label: 'Advertencia', color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  dot: 'bg-amber-400'  },
  info:        { label: 'Info',        color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',   dot: 'bg-blue-400'   },
}

export const CATEGORIA_CONFIG: Record<CategoriaAlerta, { label: string; emoji: string }> = {
  tramites:  { label: 'Trámites',  emoji: '📋' },
  turnos:    { label: 'Turnos',    emoji: '📅' },
  cobranzas: { label: 'Cobranzas', emoji: '💰' },
  clientes:  { label: 'Clientes',  emoji: '👥' },
  sistema:   { label: 'Sistema',   emoji: '⚙️' },
}