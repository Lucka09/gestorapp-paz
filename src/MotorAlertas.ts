// functions/src/motorAlertas.ts
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore , Timestamp } from 'firebase-admin/firestore'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

interface AlertaInput {
  gestoriaId:  string
  tipo:        'vencimiento_proximo' | 'tramite_inactivo'
  titulo:      string
  descripcion: string
  entidadId:   string
  entidadTipo: 'tramite' | 'cliente'
  fechaRef?:   Timestamp
  prioridad:   'alta' | 'normal'
}

// ─── FUNCIÓN 1: Vencimientos próximos ─────────────────────────────────────────

async function getVencimientosProximos(diasLimite: number): Promise<AlertaInput[]> {
  const db     = getFirestore()
  const ahora  = Timestamp.now()
  const limite = Timestamp.fromMillis(
    ahora.toMillis() + diasLimite * 24 * 60 * 60 * 1000
  )

  const snap = await db
    .collectionGroup('tramites')
    .where('estado',      'not-in',   ['completado', 'archivado'])
    .where('vencimiento', '>=',        ahora)
    .where('vencimiento', '<=',        limite)
    .get()

  return snap.docs.map(doc => {
    const data = doc.data()
    const diasRestantes = Math.ceil(
      (data.vencimiento.toMillis() - ahora.toMillis()) / (1000 * 60 * 60 * 24)
    )

    return {
      gestoriaId:  data.gestoriaId,
      tipo:        'vencimiento_proximo',
      titulo:      `Vencimiento en ${diasRestantes} día${diasRestantes === 1 ? '' : 's'}`,
      descripcion: `El trámite "${data.titulo}" vence el ${
        (data.vencimiento as Timestamp)
          .toDate()
          .toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
      }.`,
      entidadId:   doc.id,
      entidadTipo: 'tramite',
      fechaRef:    data.vencimiento,
      prioridad:   diasRestantes <= 2 ? 'alta' : 'normal',
    }
  })
}

// ─── FUNCIÓN 2: Trámites inactivos ────────────────────────────────────────────

async function getTramitesInactivos(diasSinMovimiento: number): Promise<AlertaInput[]> {
  const db     = getFirestore()
  const limite = Timestamp.fromMillis(
    Date.now() - diasSinMovimiento * 24 * 60 * 60 * 1000
  )

  const snap = await db
    .collectionGroup('tramites')
    .where('estado',         'not-in',  ['completado', 'archivado'])
    .where('ultimaActualizacion', '<=', limite)
    .get()

  return snap.docs.map(doc => {
    const data = doc.data()
    const diasSin = Math.floor(
      (Date.now() - (data.ultimaActualizacion as Timestamp).toMillis()) / (1000 * 60 * 60 * 24)
    )

    return {
      gestoriaId:  data.gestoriaId,
      tipo:        'tramite_inactivo',
      titulo:      'Trámite sin actividad',
      descripcion: `El trámite "${data.titulo}" no tiene movimientos hace ${diasSin} días.`,
      entidadId:   doc.id,
      entidadTipo: 'tramite',
      prioridad:   'normal',
    }
  })
}

// ─── FUNCIÓN 3: Procesar y guardar alertas ────────────────────────────────────

async function procesarYGuardarAlertas(alertas: AlertaInput[]): Promise<void> {
  if (alertas.length === 0) return

  const db    = getFirestore()
  const ahora = Timestamp.now()

  // Procesamos en lotes de 500 (límite de Firestore)
  const LOTE = 500
  for (let i = 0; i < alertas.length; i += LOTE) {
    const batch = db.batch()
    const chunk = alertas.slice(i, i + LOTE)

    for (const alerta of chunk) {
      // Evitar duplicados: clave compuesta por entidadId + tipo + día
      const diaKey = ahora.toDate().toISOString().split('T')[0]
      const docId  = `${alerta.entidadId}_${alerta.tipo}_${diaKey}`
      const ref    = db
        .collection('gestoras')
        .doc(alerta.gestoriaId)
        .collection('alertas')
        .doc(docId)

      batch.set(ref, {
        ...alerta,
        leida:    false,
        creadoEn: ahora,
      }, { merge: true }) // merge: true para no pisar si ya existe del día
    }

    await batch.commit()
  }

  console.log(`[motorAlertas] ${alertas.length} alerta(s) procesadas.`)
}

// ── FUNCIÓN NUEVA: recordatorios de transferencia vencidos ──────────────────
 
async function getRecordatoriosTransferenciaVencidos(): Promise<AlertaInput[]> {
  const db    = getFirestore()
  const ahora = Timestamp.now()
  const alertas: AlertaInput[] = []
 
  // Seguimiento de plazos (paso 4) — venció la fecha de "próxima alerta"
  const snapSeguimiento = await db
    .collectionGroup('transferenciaWorkflow')
    .where('estadoWorkflow', '==', 'seguimiento')
    .where('recordatorioSeguimiento', '<=', ahora)
    .get()
 
  snapSeguimiento.docs.forEach(doc => {
    const data = doc.data()
    alertas.push({
      gestoriaId:  data.gestoriaId,
      tipo:        'tramite_inactivo',  // reutiliza el tipo existente — es lo más cercano
      titulo:      'Seguimiento de transferencia pendiente',
      descripcion: `La transferencia sigue en seguimiento en el registro. Plazo estimado: ${
        data.paso1?.futuraRadicacion ? 'hasta 45 días (futura radicación)' : '3 a 21 días'
      }. Conviene confirmar el estado con el registro.`,
      entidadId:   doc.id,
      entidadTipo: 'tramite',
      prioridad:   'normal',
    })
  })
 
  // Turno de retiro — 24hs antes
  const snap24hs = await db
    .collectionGroup('transferenciaWorkflow')
    .where('estadoWorkflow', '==', 'recibo_listo')
    .where('recordatorio24hs', '<=', ahora)
    .get()
 
  snap24hs.docs.forEach(doc => {
    const data = doc.data()
    alertas.push({
      gestoriaId:  data.gestoriaId,
      tipo:        'vencimiento_proximo',
      titulo:      '📅 Turno de retiro mañana',
      descripcion: `Recordatorio: turno de retiro el ${data.paso5?.fechaTurnoRetiro} en ${data.paso5?.registroNombre ?? 'el registro'}. Gestor: ${data.gestorNombre ?? 'sin asignar'}.`,
      entidadId:   doc.id,
      entidadTipo: 'tramite',
      prioridad:   'alta',
    })
  })
 
  // Turno de retiro — el mismo día
  const snapDia = await db
    .collectionGroup('transferenciaWorkflow')
    .where('estadoWorkflow', '==', 'recibo_listo')
    .where('recordatorioDiaTurno', '<=', ahora)
    .get()
 
  snapDia.docs.forEach(doc => {
    const data = doc.data()
    alertas.push({
      gestoriaId:  data.gestoriaId,
      tipo:        'vencimiento_proximo',
      titulo:      '📍 Turno de retiro HOY',
      descripcion: `Hoy es el turno de retiro en ${data.paso5?.registroNombre ?? 'el registro'}${data.paso5?.horaTurnoRetiro ? ' a las ' + data.paso5.horaTurnoRetiro : ''}. Gestor: ${data.gestorNombre ?? 'sin asignar'}.`,
      entidadId:   doc.id,
      entidadTipo: 'tramite',
      prioridad:   'alta',
    })
  })
 
  return alertas
}
// ─── CLOUD FUNCTION ───────────────────────────────────────────────────────────

export const motorAlertasDiario = onSchedule('every 6 hours', async () => {
  const [vencimientos, tramitesSinActualizar, recordatoriosTransferencia] = await Promise.all([
    getVencimientosProximos(7),
    getTramitesInactivos(30),
    getRecordatoriosTransferenciaVencidos(),
  ])
  await procesarYGuardarAlertas([
    ...vencimientos,
    ...tramitesSinActualizar,
    ...recordatoriosTransferencia,
  ])
})