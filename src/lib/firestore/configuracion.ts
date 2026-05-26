import {
  getDoc, setDoc, onSnapshot,
  serverTimestamp, type Unsubscribe,
} from 'firebase/firestore'
import { configuracionDoc } from './collections'
import type { Configuracion, TipoTramite } from '@/types'
import { TIPO_TRAMITE_LABELS } from '@/types'

// ─── VALORES POR DEFECTO ──────────────────────────────────────────────────────

const DIAS_SEMANA = ['lunes','martes','miercoles','jueves','viernes','sabado']

export const CONFIG_DEFAULT: Omit<Configuracion,'actualizadoEn'|'actualizadoPor'> = {
  nombre:           'Gestoría Paz',
  nombreComercial:  'Gestoría Paz',
  responsable:      'Ezequiel Paz',
  email:            'info@gestoriapaz.com',
  emailSecundario:  'abigail@gestoriapaz.com',
  telefono1:        '1136141431',
  telefono2:        '1152219011',
  direccion:        '',
  localidad:        'San Martín',
  provincia:        'Buenos Aires',
  horarioAtencion:  Object.fromEntries(
    DIAS_SEMANA.map(d => [d, {
      activo:  d !== 'sabado',
      inicio:  '09:00',
      fin:     d !== 'sabado' ? '17:00' : '13:00',
    }])
  ),
  duracionTurnoMin: 30,
  turnosMaxDia:     16,
  diasAnticipacion: 30,
  tramitesActivos:  Object.keys(TIPO_TRAMITE_LABELS) as TipoTramite[],
  tarifas:          Object.keys(TIPO_TRAMITE_LABELS).map(tipo => ({
    tipo:       tipo as TipoTramite,
    honorarios: 0,
    incluye:    '',
    activo:     true,
  })),
  datosBancarios: {
    titular: 'Ezequiel Paz',
    banco:   '',
    cbu:     '',
    alias:   '',
    cuit:    '',
  },
  redesSociales: {
    whatsapp1: '5491136141431',
    whatsapp2: '5491152219011',
    instagram: '',
    facebook:  '',
    web:       'gestoriapaz.com',
  },
  mensajeBienvenida:   '¡Bienvenido al portal de Gestoría Paz! Aquí podés seguir tus trámites y reservar turnos.',
  mensajeTurnoConfirm: 'Tu turno fue confirmado. Te esperamos el {fecha} a las {hora} hs.',
  mensajeListoRetirar: 'Tu trámite de {tipo} ya está listo para retirar. ¡Pasá cuando quieras!',

  // ─── PREMIOS & OBJETIVOS — Asesor Comercial ───────────────────────────────
  // Configurables por el propietario desde ConfiguracionPage > tab Premios
  premiosConfig: {
    // Premio A — por trámites (baja + transferencia) completados y pagados
    montoPremioA:      50_000,   // pesos por cada grupo de 3 trámites
    tramitesPorPremioA: 3,       // cuántos trámites hacen falta

    // Premio B — hitos de facturación acumulada en multas gestionadas
    // premioMonto = 0 significa "aún sin definir por el propietario"
    hitosMultas: [
      { id: 1, montoUmbral: 10_000_000, premioMonto: 0, descripcion: 'Primer hito — $10M en multas' },
      { id: 2, montoUmbral: 15_000_000, premioMonto: 0, descripcion: 'Segundo hito — $15M en multas' },
      { id: 3, montoUmbral: 17_000_000, premioMonto: 0, descripcion: 'Tercer hito — $17M en multas' },
      { id: 4, montoUmbral: 20_000_000, premioMonto: 0, descripcion: 'Hito máximo — $20M en multas' },
    ],
  },
}

// ─── LEER ─────────────────────────────────────────────────────────────────────

export async function getConfiguracion(): Promise<Configuracion> {
  const snap = await getDoc(configuracionDoc)
  if (!snap.exists()) return { ...CONFIG_DEFAULT } as Configuracion
  return { ...CONFIG_DEFAULT, ...snap.data() } as Configuracion
}

export function subscribeConfiguracion(
  callback: (cfg: Configuracion) => void
): Unsubscribe {
  return onSnapshot(configuracionDoc, snap => {
    if (!snap.exists()) callback({ ...CONFIG_DEFAULT } as Configuracion)
    else callback({ ...CONFIG_DEFAULT, ...snap.data() } as Configuracion)
  })
}

// ─── GUARDAR ──────────────────────────────────────────────────────────────────

export async function guardarConfiguracion(
  data:   Partial<Omit<Configuracion,'actualizadoEn'|'actualizadoPor'>>,
  userId: string
): Promise<void> {
  await setDoc(configuracionDoc, {
    ...data,
    actualizadoEn:  serverTimestamp(),
    actualizadoPor: userId,
  }, { merge: true })
}

// ─── CACHÉ LAZY ───────────────────────────────────────────────────────────────
// IMPORTANTE: no suscribir a nivel de módulo — se ejecutaría antes de que haya
// autenticación y dispararía permission-denied → cascade de errores del SDK.
// La suscripción real la gestiona useConfiguracion() una vez autenticado.

let _config: Configuracion | null = null

export function setConfigCache(cfg: Configuracion) { _config = cfg }
export function getConfigCache(): Configuracion | null { return _config }