// src/hooks/useRepesca.ts
// ─── LISTADO DE REPESCA ──────────────────────────────────────────────────────
// Bandeja de trabajo: lo que quedó colgado de verdad.
//
// CAMBIO respecto de la versión anterior: se excluyen los clientes que YA
// tuvieron movimiento comercial reciente. El caso que apareció en producción:
// el cliente escribió por WhatsApp, no le contestaron por ahí, pero al día
// siguiente fue a la oficina y pagó la seña. Para el chat sigue "sin
// responder"; para el negocio está cerrado. Filtrar por la conversación sola
// no alcanza — hay que cruzarla contra trámites y recibos.
//
// Tres señales de "ya está atendido":
//   1. tiene un recibo emitido en los últimos N días
//   2. tiene un trámite creado o actualizado en los últimos N días
//   3. la conversación está marcada como resuelta
import { useState, useEffect, useMemo } from 'react'
import {
  collection, query, where, getDocs, orderBy, limit as fbLimit,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useGestoriaId } from '@/context/GestoriaContext'
import type { ConversacionWA } from '@/wa_types'
import type { Lead, EstadoLead } from '@/types'
 
const DIA_MS = 86_400_000
const ESTADOS_CERRADOS: EstadoLead[] = ['convertido', 'perdido', 'descartado']
const DIAS_ACTIVIDAD_RECIENTE = 30
 
// ─── TIPOS ────────────────────────────────────────────────────────────────────
 
export type MotivoRepesca = 'sin_responder' | 'sin_cerrar' | 'lead_frio'
 
export interface ItemRepesca {
  id: string
  origen: 'whatsapp' | 'lead'
  motivo: MotivoRepesca
  nombre: string
  telefono: string
  ultimoMensaje: string
  diasSinMov: number
  asignadoA: string
  asignadoNombre: string
  estado: string
  conversacionId?: string
  leadId?: string
  clienteId?: string
  score: number
}
 
export interface FiltrosRepesca {
  diasMin?: number
  diasMax?: number
  motivos?: MotivoRepesca[]
  soloSinDueno?: boolean
  incluirAtendidos?: boolean
}
 
// ─── HELPERS ──────────────────────────────────────────────────────────────────
 
const soloDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '')
 
function calcularScore(motivo: MotivoRepesca, dias: number, sinDueno: boolean): number {
  const base: Record<MotivoRepesca, number> = {
    sin_responder: 100, sin_cerrar: 60, lead_frio: 35,
  }
  return Math.round(base[motivo] * (1 / (1 + dias / 30)) + (sinDueno ? 15 : 0))
}
 
/**
 * Corre una query aislada. Si falla, lo registra y devuelve vacío en lugar de
 * tumbar todo el hook. `fallos` acumula el nombre de las colecciones que no se
 * pudieron leer, para mostrarlo en la UI.
 */
async function queryAislada(
  nombre: string,
  fn: () => Promise<any>,
  fallos: string[],
): Promise<any[]> {
  try {
    const snap = await fn()
    return snap.docs
  } catch (e: any) {
    console.error(`[useRepesca] falló query "${nombre}":`, e?.code, e?.message)
    fallos.push(nombre)
    return []
  }
}
 
// ─── ACTIVIDAD COMERCIAL RECIENTE ────────────────────────────────────────────
 
interface ActividadReciente {
  clientes:  Set<string>
  telefonos: Set<string>
  patentes:  Set<string>
}
 
async function cargarActividadReciente(
  gestoriaId: string,
  dias: number,
  fallos: string[],
): Promise<ActividadReciente> {
  const desde = Date.now() - dias * DIA_MS
  const clientes  = new Set<string>()
  const telefonos = new Set<string>()
  const patentes  = new Set<string>()
 
  const enVentana = (campo: any) => {
    const ms = campo?.toMillis?.()
    return typeof ms === 'number' && ms >= desde
  }
 
  // ── Recibos: si pagó, está atendido ──────────────────────────────────────
  const recibos = await queryAislada('recibos', () => getDocs(query(
    collection(db, 'recibos'),
    where('gestoriaId', '==', gestoriaId),
    fbLimit(2000),
  )), fallos)
 
  recibos.forEach((d: any) => {
    const r = d.data()
    if (!enVentana(r.creadoEn)) return
    if (r.clienteId) clientes.add(String(r.clienteId))
    if (r.patente)   patentes.add(String(r.patente).toUpperCase())
  })
 
  // ── Trámites con movimiento reciente ─────────────────────────────────────
  const tramites = await queryAislada('tramites', () => getDocs(query(
    collection(db, 'tramites'),
    where('gestoriaId', '==', gestoriaId),
    fbLimit(2000),
  )), fallos)
 
  tramites.forEach((d: any) => {
    const t = d.data()
    if (!enVentana(t.actualizadoEn) && !enVentana(t.creadoEn)) return
    if (t.estado === 'cancelado') return
    if (t.clienteId) clientes.add(String(t.clienteId))
    if (t.patente)   patentes.add(String(t.patente).toUpperCase())
  })
 
  // ── Teléfonos de esos clientes ───────────────────────────────────────────
  // Una sola query por gestoría, sin documentId() in [...]. Muchas
  // conversaciones no tienen clienteId, así que sin el teléfono el filtro
  // dejaría pasar justamente a los que ya pagaron.
  if (clientes.size > 0) {
    const cli = await queryAislada('clientes', () => getDocs(query(
      collection(db, 'clientes'),
      where('gestoriaId', '==', gestoriaId),
      fbLimit(3000),
    )), fallos)
 
    cli.forEach((d: any) => {
      if (!clientes.has(d.id)) return
      const tel = soloDigitos(d.data().telefono)
      if (tel) telefonos.add(tel)
    })
  }
 
  return { clientes, telefonos, patentes }
}
 
// ─── HOOK ─────────────────────────────────────────────────────────────────────
 
export function useRepesca(filtros: FiltrosRepesca = {}) {
  const gestoriaId = useGestoriaId()
  const [items,   setItems]   = useState<ItemRepesca[]>([])
  const [ocultos, setOcultos] = useState(0)
  const [avisos,  setAvisos]  = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
 
  const {
    diasMin = 1, diasMax = 90, motivos,
    soloSinDueno = false, incluirAtendidos = false,
  } = filtros
 
  useEffect(() => {
    if (!gestoriaId) { setLoading(false); return }
 
    let cancelado = false
    setLoading(true)
    setError(null)
    setAvisos([])
 
    ;(async () => {
      const fallos: string[] = []
      try {
        const ahora = Date.now()
        const out: ItemRepesca[] = []
        let excluidos = 0
 
        const actividad = incluirAtendidos
          ? { clientes: new Set<string>(), telefonos: new Set<string>(), patentes: new Set<string>() }
          : await cargarActividadReciente(gestoriaId, DIAS_ACTIVIDAD_RECIENTE, fallos)
 
        const yaAtendido = (clienteId?: string, telefono?: string): boolean => {
          if (clienteId && actividad.clientes.has(clienteId)) return true
          const tel = soloDigitos(telefono)
          return !!tel && actividad.telefonos.has(tel)
        }
 
        // ── A. CONVERSACIONES ────────────────────────────────────────────────
        // Sin orderBy: con `limit` + `orderBy` + `where` hace falta índice
        // compuesto, y si falta, Firestore devuelve un error que en algunos
        // casos se reporta como permisos. Se ordena en memoria.
        const convs = await queryAislada('conversacionesWA', () => getDocs(query(
          collection(db, 'conversacionesWA'),
          where('gestoriaId', '==', gestoriaId),
          fbLimit(1000),
        )), fallos)
 
        convs.forEach((d: any) => {
          const c = { id: d.id, ...d.data() } as ConversacionWA & {
            ultimoMensajeDireccion?: 'entrante' | 'saliente'
            repescaDescartadaEn?: any
          }
 
          if (c.repescaDescartadaEn) return
          if (c.estado === 'resuelta') return
 
          const ms = c.ultimaActividad?.toMillis?.() ?? 0
          if (!ms) return
          const dias = Math.floor((ahora - ms) / DIA_MS)
          if (dias < diasMin || dias > diasMax) return
 
          if (yaAtendido(c.clienteId, c.telefono)) { excluidos++; return }
 
          const ultimaEsCliente = c.ultimoMensajeDireccion
            ? c.ultimoMensajeDireccion === 'entrante'
            : (c.noLeidos ?? 0) > 0
 
          const motivo: MotivoRepesca = ultimaEsCliente ? 'sin_responder' : 'sin_cerrar'
          const sinDueno = !c.asignadoA
          if (soloSinDueno && !sinDueno) return
 
          out.push({
            id: `wa_${c.id}`, origen: 'whatsapp', motivo,
            nombre: c.nombre || c.telefono,
            telefono: c.telefono,
            ultimoMensaje: c.ultimoMensaje ?? '',
            diasSinMov: dias,
            asignadoA: c.asignadoA ?? '',
            asignadoNombre: c.asignadoNombre ?? '',
            estado: c.estado ?? '',
            conversacionId: c.id,
            clienteId: c.clienteId,
            leadId: c.leadId,
            score: calcularScore(motivo, dias, sinDueno),
          })
        })
 
        // ── B. LEADS ─────────────────────────────────────────────────────────
        const leads = await queryAislada('leads', () => getDocs(query(
          collection(db, 'leads'),
          where('gestoriaId', '==', gestoriaId),
          fbLimit(1000),
        )), fallos)
 
        const telsEnLista = new Set(out.map(i => soloDigitos(i.telefono)))
 
        leads.forEach((d: any) => {
          const l = { id: d.id, ...d.data() } as Lead & {
            actualizadoEn?: any; repescaDescartadaEn?: any; clienteId?: string
          }
 
          if (l.repescaDescartadaEn) return
          if (ESTADOS_CERRADOS.includes(l.estado as EstadoLead)) return
 
          const ms = l.actualizadoEn?.toMillis?.() ?? 0
          if (!ms) return
          const dias = Math.floor((ahora - ms) / DIA_MS)
          if (dias < diasMin || dias > diasMax) return
 
          const tel = soloDigitos(l.telefono)
          if (tel && telsEnLista.has(tel)) return
          if (yaAtendido(l.clienteId, l.telefono)) { excluidos++; return }
          if (l.patente && actividad.patentes.has(String(l.patente).toUpperCase())) {
            excluidos++; return
          }
 
          const sinDueno = !(l as any).asignadoA
          if (soloSinDueno && !sinDueno) return
 
          const motivo: MotivoRepesca =
            l.estado === 'en_negociacion' || l.estado === 'calificado'
              ? 'sin_cerrar' : 'lead_frio'
 
          out.push({
            id: `lead_${l.id}`, origen: 'lead', motivo,
            nombre: `${l.nombre ?? ''} ${l.apellido ?? ''}`.trim() || String(l.telefono ?? ''),
            telefono: String(l.telefono ?? ''),
            ultimoMensaje: l.consulta ?? '',
            diasSinMov: dias,
            asignadoA: (l as any).asignadoA ?? '',
            asignadoNombre: (l as any).asignadoNombre ?? '',
            estado: l.estado,
            leadId: l.id,
            clienteId: l.clienteId,
            score: calcularScore(motivo, dias, sinDueno),
          })
        })
 
        if (cancelado) return
 
        const filtrado = motivos?.length
          ? out.filter(i => motivos.includes(i.motivo))
          : out
        filtrado.sort((a, b) => b.score - a.score)
 
        setItems(filtrado)
        setOcultos(excluidos)
 
        // Si TODO falló, es un problema real. Si falló una sola, es parcial.
        if (fallos.length > 0) {
          setAvisos(fallos)
          if (fallos.includes('conversacionesWA') && fallos.includes('leads')) {
            setError('No se pudieron leer las conversaciones ni los leads. Revisá las reglas de Firestore.')
          }
        }
      } catch (e: any) {
        if (!cancelado) {
          console.error('[useRepesca]', e)
          setError(e?.message ?? 'No se pudo cargar el listado')
        }
      } finally {
        if (!cancelado) setLoading(false)
      }
    })()
 
    return () => { cancelado = true }
  }, [gestoriaId, diasMin, diasMax, soloSinDueno, incluirAtendidos, motivos?.join(',')])
 
  const resumen = useMemo(() => ({
    total: items.length,
    sinResponder: items.filter(i => i.motivo === 'sin_responder').length,
    sinCerrar:    items.filter(i => i.motivo === 'sin_cerrar').length,
    leadsFrios:   items.filter(i => i.motivo === 'lead_frio').length,
    sinDueno:     items.filter(i => !i.asignadoA).length,
    ocultosPorActividad: ocultos,
  }), [items, ocultos])
 
  return { items, resumen, loading, error, avisos }
}
 
// ─── ACCIONES ─────────────────────────────────────────────────────────────────
 
export async function descartarDeRepesca(item: ItemRepesca, uid: string): Promise<void> {
  const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore')
  const ref = item.origen === 'whatsapp'
    ? doc(db, 'conversacionesWA', item.conversacionId!)
    : doc(db, 'leads', item.leadId!)
  await updateDoc(ref, {
    repescaDescartadaEn: serverTimestamp(),
    repescaDescartadaPor: uid,
  })
}
 
export async function tomarDeRepesca(
  item: ItemRepesca, uid: string, nombre: string,
): Promise<void> {
  const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore')
  const ref = item.origen === 'whatsapp'
    ? doc(db, 'conversacionesWA', item.conversacionId!)
    : doc(db, 'leads', item.leadId!)
  await updateDoc(ref, {
    asignadoA: uid, asignadoNombre: nombre,
    tomadoDeRepescaEn: serverTimestamp(),
  })
}

// ─── EN LA UI ─────────────────────────────────────────────────────────────────
// Conviene mostrar el contador de ocultos en RepescaPage, para que se vea que
// el filtro está haciendo algo y no parezca que faltan filas:
//
//   {resumen.ocultosPorActividad > 0 && (
//     <p className="text-xs text-gray-400">
//       {resumen.ocultosPorActividad} contactos ocultos porque ya tuvieron
//       trámite o pago en los últimos {DIAS_ACTIVIDAD_RECIENTE} días.
//     </p>
//   )}