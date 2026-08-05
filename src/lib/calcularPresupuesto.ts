// src/lib/calcularPresupuesto.ts
// ─── MOTOR DE CÁLCULO DEL PRESUPUESTO (fuente única de verdad) ───────────────
//
// Portado 1:1 del presupuestador definitivo de Gestoría Paz (calcular() +
// textoWhatsapp()). Lo usan por igual: el renderer del canvas, el mensaje de
// WhatsApp y la Cloud Function. Así imagen, mensaje y datos nunca discrepan.
//
// ⚠️ transfPct, suatsMonto y efvoPct son REGLAS COMERCIALES (Matías) → viven en
// configuracion.cotizacionMultas.presupuesto.

export interface FilaPresupuesto {
  jur:   string
  cant:  number
  deuda: number
  resol: number   // "queda en" manual (se ignora si transfAuto=true)
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

// Default de arranque para el flujo automatizado: modo auto al 41% (número real
// de Gestoría Paz), editable por Jessica caso por caso.
export const CONFIG_PRESUPUESTO_DEFAULT: ConfigPresupuesto = {
  transfAuto:   true,
  transfPct:    41,
  suatsOn:      true,
  suatsMonto:   20_000,
  efvoManual:   false,
  efvoMonto:    0,
  efvoPct:      10,
  mostrarCuotas: false,
  cuotasManual:  false,
  nChica:        3,
  nLarga:        6,
  recargoChica:  15,
  recargoLarga:  35,
  cuotasChicaMonto: 0,
  cuotasLargaMonto: 0,
}

// Datos fijos de la marca (idénticos al presupuestador).
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
  D:         number
  S:         number
  quedaFila: number[]
  Htransf:   number
  T:         number
  Hefvo:     number
  E:         number
  efvoPct:   number
  ahorro:    number
  mostrarCuotas: boolean
  cuotasManual:  boolean
  nChica:    number
  nLarga:    number
  cuotaChica: number
  cuotaLarga: number
}

export const money = (n: number) => '$ ' + Math.round(n || 0).toLocaleString('es-AR')

// ─── CÁLCULO (portado 1:1) ───────────────────────────────────────────────────

export function calcularPresupuesto(
  filas:  FilaPresupuesto[],
  config: ConfigPresupuesto = CONFIG_PRESUPUESTO_DEFAULT,
): TotalesPresupuesto {
  const D = filas.reduce((s, f) => s + (f.deuda || 0), 0)
  const S = config.suatsOn ? config.suatsMonto : 0

  const quedaFila = filas.map(f =>
    config.transfAuto ? Math.round((f.deuda || 0) * config.transfPct / 100) : (f.resol || 0)
  )
  const Htransf = quedaFila.reduce((s, v) => s + v, 0)
  const T = Htransf + S

  const Hefvo = config.efvoManual
    ? config.efvoMonto
    : Math.round(Htransf * (1 - config.efvoPct / 100))
  const E = Hefvo + S

  const ahorro = D - T

  const nChica = config.nChica || 3
  const nLarga = config.nLarga || 6
  const finChica = config.cuotasManual ? config.cuotasChicaMonto : Math.round(T * (1 + config.recargoChica / 100))
  const finLarga = config.cuotasManual ? config.cuotasLargaMonto : Math.round(T * (1 + config.recargoLarga / 100))
  const cuotaChica = nChica > 0 ? finChica / nChica : 0
  const cuotaLarga = nLarga > 0 ? finLarga / nLarga : 0

  return {
    D, S, quedaFila, Htransf, T, Hefvo, E, efvoPct: config.efvoPct,
    ahorro, mostrarCuotas: config.mostrarCuotas, cuotasManual: config.cuotasManual,
    nChica, nLarga, cuotaChica, cuotaLarga,
  }
}

// ─── MENSAJE DE WHATSAPP (definitivo, portado 1:1) ───────────────────────────

export function textoWhatsappPresupuesto(params: {
  totales:  TotalesPresupuesto
  dominio:  string
  plazo?:   string
  validez?: number
}): string {
  const c = params.totales
  const plazo = params.plazo || '72 hs hábiles promedio'
  const validez = params.validez ?? 5

  const lineaCuotas = c.mostrarCuotas
    ? `\n▸ *En cuotas:* ${c.nChica} x ${money(c.cuotaChica)}  ·  ${c.nLarga} x ${money(c.cuotaLarga)}`
    : ''
  const lineaTarjetaPago = c.mostrarCuotas
    ? `Tarjeta de crédito, hasta ${c.nLarga} cuotas fijas`
    : 'Tarjeta de crédito (consultar financiación)'
  const lineaSuats = c.S > 0 ? `\n_Los importes incluyen SUATS ._` : ''

  return `*GESTORÍA PAZ* — Presupuesto
Dominio: *${params.dominio}*

Deuda total actual: ${money(c.D)}
Ahorro con la gestión: *${money(c.ahorro)}* 

▸ *Total a abonar:* ${money(c.T)} (transferencia)
▸ *En efectivo:* ${money(c.E)}${lineaCuotas}${lineaSuats}

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