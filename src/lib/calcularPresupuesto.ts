// src/lib/calcularPresupuesto.ts
// ─── MOTOR DE CÁLCULO DEL PRESUPUESTO (fuente única de verdad) ───────────────
// Portado 1:1 del presupuestador definitivo de Gestoría Paz. Lo usan por igual:
// el renderer del canvas, el mensaje de WhatsApp y la Cloud Function.
export interface FilaPresupuesto {
  jur:   string
  cant:  number
  deuda: number
  resol: number   // "queda en" manual (se ignora si transfModo='pct')
  transfModo?: 'manual' | 'pct'
  transfPct?:  number
  efvoModo?:   'pct' | 'manual'
  efvoPct?:    number
  efvoMonto?:  number
  recargoChica?: number
  recargoLarga?: number
}
export interface ConfigPresupuesto {
  transfAuto:   boolean
  transfPct:    number
  suatsOn:      boolean
  suatsMonto:   number
  efvoManual:   boolean
  efvoMonto:    number
  efvoPct:      number
  mostrarCuotas: boolean
  cuotasManual:  boolean
  nChica:        number
  nLarga:        number
  recargoChica:  number
  recargoLarga:  number
  cuotasChicaMonto: number
  cuotasLargaMonto: number
}
export const CONFIG_PRESUPUESTO_DEFAULT: ConfigPresupuesto = {
  transfAuto: true, transfPct: 40,
  suatsOn: true, suatsMonto: 20_000,
  efvoManual: false, efvoMonto: 0, efvoPct: 35,
  mostrarCuotas: false, cuotasManual: false,
  nChica: 3, nLarga: 6, recargoChica: 15, recargoLarga: 35,
  cuotasChicaMonto: 0, cuotasLargaMonto: 0,
}
export const DATOS_FIJOS = {
  direccion: 'Güemes 2261, San Martín Centro',
  whatsapp:  '11 3614-1431',
  email:     'info@gestoriapaz.com',
  web:       'gestoriapaz.com',
  instagram: '@gestoriapaz.ar',
  facebook:  '/gestoriapaz',
  tiktok:    '@gestoriapaz',
  maps:      'https://maps.app.goo.gl/yyU7xhaqu7GAJLp',
  googleRating:  '4.9',
  googleReviews: 91,
  googleReviewsUrl: 'https://share.google/eqvCtlIIC4QRFEoWa',
}
export interface TotalesPresupuesto {
  D: number; S: number
  quedaFila: number[]; efvoFila: number[]
  quedaConSuats: number[]; efvoConSuats: number[]
  Htransf: number; T: number; Hefvo: number; E: number
  efvoPct: number; ahorro: number
  mostrarCuotas: boolean; cuotasManual: boolean
  nChica: number; nLarga: number; cuotaChica: number; cuotaLarga: number
}
export const money = (n: number) => '$ ' + Math.round(n || 0).toLocaleString('es-AR')

export function calcularPresupuesto(
  filas:  FilaPresupuesto[],
  config: ConfigPresupuesto = CONFIG_PRESUPUESTO_DEFAULT,
): TotalesPresupuesto {
  const D = filas.reduce((s, f) => s + (f.deuda || 0), 0)
  const S = config.suatsOn ? config.suatsMonto : 0
  const n = filas.length

  const quedaFila = filas.map(f =>
    (f.transfModo ?? (config.transfAuto ? 'pct' : 'manual')) === 'pct'
      ? Math.round((f.deuda || 0) * (f.transfPct ?? config.transfPct) / 100)
      : (f.resol || 0))
  // Efectivo: pct = abona % de la DEUDA de la fila (simétrico a transferencia);
  // manual = monto fijo. (Antes era un descuento sobre el monto de transferencia.)
  const efvoFila = filas.map((f) =>
    (f.efvoModo ?? 'pct') === 'manual'
      ? (f.efvoMonto || 0)
      : Math.round((f.deuda || 0) * (f.efvoPct ?? config.efvoPct) / 100))

  // SUATS: 1 solo por presupuesto, distribuido entre jurisdicciones
  const cuotaSuat = n > 0 ? Math.floor(S / n) : 0
  const restoSuat = n > 0 ? S - cuotaSuat * (n - 1) : 0
  const quedaConSuats = quedaFila.map((v, i) => v + (i === n - 1 ? restoSuat : cuotaSuat))
  const efvoConSuats = efvoFila.map((v, i) => v + (i === n - 1 ? restoSuat : cuotaSuat))

  const Htransf = quedaFila.reduce((s, v) => s + v, 0)
  const Hefvo   = efvoFila.reduce((s, v) => s + v, 0)
  const T = Htransf + S
  const E = Hefvo + S
  const ahorro = D - T

  const nChica = config.nChica || 3
  const nLarga = config.nLarga || 6
  let finChica = 0, finLarga = 0
  filas.forEach((f, i) => {
    finChica += Math.round(quedaFila[i] * (1 + (f.recargoChica ?? config.recargoChica) / 100))
    finLarga += Math.round(quedaFila[i] * (1 + (f.recargoLarga ?? config.recargoLarga) / 100))
  })
  finChica += S; finLarga += S
  const cuotaChica = nChica > 0 ? finChica / nChica : 0
  const cuotaLarga = nLarga > 0 ? finLarga / nLarga : 0

  return {
    D, S, quedaFila, efvoFila, quedaConSuats, efvoConSuats,
    Htransf, T, Hefvo, E, efvoPct: config.efvoPct, ahorro,
    mostrarCuotas: config.mostrarCuotas, cuotasManual: config.cuotasManual,
    nChica, nLarga, cuotaChica, cuotaLarga,
  }
}

// ─── MENSAJE DE WHATSAPP (definitivo, con desglose por jurisdicción) ─────────
export function textoWhatsappPresupuesto(params: {
  totales:  TotalesPresupuesto
  dominio:  string
  filas?:   FilaPresupuesto[]
  plazo?:   string
  validez?: number
}): string {
  const c = params.totales
  const filas = params.filas ?? []
  const plazo = params.plazo || '72 hs hábiles promedio'
  const validez = params.validez ?? 5
  const desglose = (arr: number[]) =>
    filas.map((f, i) => `  • ${f.jur || 'Jurisdicción ' + (i + 1)}: ${money(arr[i])}`).join('\n')
  const conDesglose = filas.length > 0
  const lineaCuotas = c.mostrarCuotas
    ? `\n▸ *En cuotas:* ${c.nChica} x ${money(c.cuotaChica)}  ·  ${c.nLarga} x ${money(c.cuotaLarga)}` : ''
  const lineaSuats = c.S > 0 ? `\n_Incluye Informe de Multas Gratis._` : ''
  const lineaTarjetaPago = c.mostrarCuotas
    ? `Tarjeta de crédito, hasta ${c.nLarga} cuotas fijas`
    : 'Tarjeta de crédito (consultar financiación)'
  return `*GESTORÍA PAZ* — Presupuesto
Dominio: *${params.dominio}*

Deuda total actual: ${money(c.D)}
Ahorro con la gestión: *${money(c.ahorro)}*
${conDesglose ? `\n*Desglose por Jurisdicción (Transferencia):*\n${desglose(c.quedaConSuats)}\n` : ''}▸ *Pago por transferencia:* ${money(c.T)}
${conDesglose ? `\n*Desglose en Efectivo (en nuestra oficina):*\n${desglose(c.efvoConSuats)}\n` : ''}▸ *Pago en efectivo en nuestra oficina:* ${money(c.E)}${lineaCuotas}${lineaSuats}

Incluye la gestión de las infracciones visibles en las plataformas oficiales al día de la fecha.
El informe de multas sale limpio en ${plazo}. Ideal para renovar el registro, transferir el vehículo o presentar la baja al seguro.

*Formas de pago*
• Transferencia bancaria
• ${lineaTarjetaPago}
• Efectivo en oficina
• Mercado Pago

Emitimos recibo por el servicio.

*Cómo te atendemos* (siempre con cita previa)

▸ *En nuestra oficina*
${DATOS_FIJOS.direccion}
Ver ubicación: ${DATOS_FIJOS.maps}

▸ *Por videollamada*
Si te queda lejos o preferís hacerlo desde tu casa, coordinamos día y horario. Es la misma atención, con la comodidad y la seguridad de verificar todo en pantalla.

Presupuesto válido por ${validez} días. Los importes pueden variar según las actualizaciones de los organismos.

Decime cómo querés avanzar y lo dejamos iniciado hoy.

★ ${DATOS_FIJOS.googleRating} en Google (${DATOS_FIJOS.googleReviews} opiniones) ★ Nuestras reseñas en Google → ${DATOS_FIJOS.googleReviewsUrl}

—
Gestoría Paz · Tu Tranquilidad, Nuestro Compromiso
${DATOS_FIJOS.email} · ${DATOS_FIJOS.web}
Instagram ${DATOS_FIJOS.instagram} · Facebook ${DATOS_FIJOS.facebook} · TikTok ${DATOS_FIJOS.tiktok}`
}