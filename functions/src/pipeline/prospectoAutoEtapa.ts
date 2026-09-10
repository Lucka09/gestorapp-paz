// functions/src/pipeline/prospectoAutoEtapa.ts
// ─── AUTO-TRANSICIÓN DE ETAPA POR TRÁMITE ────────────────────────────────────
// Trigger sobre `tramites`. Busca el prospecto ACTIVO del cliente (por clienteId,
// enlace de Fase B) y mueve su etapa sola:
//   • Trámite creado / en curso → 'en_tramite' (si estaba antes en el embudo)
//   • Trámite 'entregado' (cierre de gestión) → 'ganado'
//
// La plata NO se toca acá: los ingresos se cuentan por recibos, no por el cierre.
// Al ganar emite el evento `prospecto.cerrado_ganado` para que el motor dispare
// sus automatizaciones (tarea de alta, etc.) igual que si se moviera a mano.
//
// Despliegue: firebase deploy --only functions:prospectoAutoEtapa

import * as admin from 'firebase-admin'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions'

const db = () => admin.firestore()
const FV = admin.firestore.FieldValue

const ETAPAS_CERRADAS     = new Set(['ganado', 'perdido'])
const ETAPAS_PRE_TRAMITE  = new Set(['nuevo', 'contactado', 'presupuestado'])

// Día AR en formato YYYY-MM-DD (para fechaCierre, string como en el resto).
function diaArISO(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
}

export const prospectoAutoEtapa = onDocumentWritten(
  { document: 'tramites/{tramiteId}', region: 'southamerica-east1', memory: '256MiB', timeoutSeconds: 60 },
  async (event) => {
    const after = event.data?.after?.data() as any
    if (!after) return                                   // borrado → nada
    const before = event.data?.before?.data() as any
    const esCreacion = !event.data?.before?.exists

    // Solo seguimos si es alta o si cambió el estado (evita trabajo en ediciones triviales).
    if (!esCreacion && before?.estado === after.estado) return

    const gestoriaId = String(after.gestoriaId ?? '')
    const clienteId  = String(after.clienteId ?? '')
    if (!gestoriaId || !clienteId) return

    // Prospecto ACTIVO del cliente (dos where de igualdad → sin índice compuesto).
    const snap = await db().collection('prospectos')
      .where('gestoriaId', '==', gestoriaId)
      .where('clienteId',  '==', clienteId)
      .get()
    const activos = snap.docs.filter(d => !ETAPAS_CERRADAS.has(String((d.data() as any).etapa)))
    if (activos.length === 0) return

    // El más reciente, por si el cliente tuvo varias gestiones.
    activos.sort((a, b) =>
      ((b.data() as any).creadoEn?.toMillis?.() ?? 0) - ((a.data() as any).creadoEn?.toMillis?.() ?? 0))
    const pros  = activos[0]
    const pData = pros.data() as any
    const etapa = String(pData.etapa ?? 'nuevo')

    const cerroAhora = after.estado === 'entregado' && before?.estado !== 'entregado'

    // 1) Cierre de gestión → GANADO
    if (cerroAhora) {
      if (etapa === 'ganado') return
      await pros.ref.update({
        etapa:         'ganado',
        tramiteId:     event.params.tramiteId,
        fechaCierre:   diaArISO(),
        actualizadoEn: FV.serverTimestamp(),
      })
      // Evento para que el motor dispare sus automatizaciones de "ganado".
      await db().collection('eventos').add({
        gestoriaId,
        tipo:         'prospecto.cerrado_ganado',
        entidad:      'prospecto',
        entidadId:    pros.id,
        entidadLabel: `${pData.nombre ?? ''} ${pData.apellido ?? ''}`.trim() || pData.telefono || 'Prospecto',
        actor:        { id: 'sistema', nombre: 'Auto (trámite entregado)', tipo: 'sistema' },
        payload:      { etapa: 'ganado', origen: 'tramite_entregado', tramiteId: event.params.tramiteId },
        resumen:      'Prospecto ganado automáticamente al entregar el trámite',
        timestamp:    FV.serverTimestamp(),
      }).catch(err => logger.warn('[autoEtapa] evento ganado falló', { error: err?.message }))

      logger.info('[autoEtapa] → ganado', { prospecto: pros.id, tramite: event.params.tramiteId })
      return
    }

    // 2) Trámite en curso → EN TRÁMITE (solo si el prospecto está más atrás)
    if (ETAPAS_PRE_TRAMITE.has(etapa)) {
      await pros.ref.update({
        etapa:         'en_tramite',
        tramiteId:     event.params.tramiteId,
        actualizadoEn: FV.serverTimestamp(),
      })
      logger.info('[autoEtapa] → en_tramite', { prospecto: pros.id, tramite: event.params.tramiteId })
    }
  },
)