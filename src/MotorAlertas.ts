// functions/src/motorAlertas.ts
import { onSchedule } from 'firebase-functions/v2/scheduler'

export const motorAlertasDiario = onSchedule('every 6 hours', async () => {
  const vencimientos = await getVencimientosProximos(7)
  const tramitesSinActualizar = await getTramitesInactivos(30)
  await procesarYGuardarAlertas([...vencimientos, ...tramitesSinActualizar])
})