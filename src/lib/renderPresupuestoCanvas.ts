// src/lib/renderPresupuestoCanvas.ts
// ─── RENDER DEL PRESUPUESTO EN CANVAS (portado 1:1 del presupuestador) ───────
import { money, DATOS_FIJOS } from './calcularPresupuesto'
import type { FilaPresupuesto, TotalesPresupuesto, ConfigPresupuesto } from './calcularPresupuesto'

const NARANJA = '#F28F07'
const NEGRO   = '#121212'
const BLANCO  = '#FFFFFF'
const GRIS    = '#EAEAEA'
const GRIS_TX = '#8A8A8A'
const W  = 1080
const PX = 68

export interface MetaPresupuesto {
  patente: string
  fecha:   string
  cliente?: string
  plazo:   string
  validez: number
}

const FINE_PRINT = `⚖️ DEFENSA ADMINISTRATIVA DE ACTAS – PBA
Presentación de defensa administrativa mediante medida cautelar sobre actas de infracción de la Provincia de Buenos Aires.
La medida cautelar permite las actuaciones para la realización de trámites ante: • Registro Automotor • Informe 13i • Certificado CENAT • Vialidad Nacional.
⏱️ Plazo estimado a que el informe de multas salga libre sobre las actas trabajadas: 72 horas hábiles. Aplicable para transferencias, renovación de licencia, bajas registrales y demás trámites.
Documentación: • DNI (frente y dorso). • Cédula del vehículo (física o digital).
Observación: Si con posterioridad la autoridad competente dictara resolución de sentencia, el importe resultante —que eventualmente puede representar hasta un 50% del valor original de la infracción— no integra el alcance de la presente gestión, queda a disposición del acreedor del servicio por derivar de un acto administrativo independiente.`

function wrap(ctx: CanvasRenderingContext2D, texto: string, max: number): string[] {
  const palabras = texto.split(' ')
  const lineas: string[] = []
  let actual = ''
  for (const p of palabras) {
    const prueba = actual ? actual + ' ' + p : p
    if (ctx.measureText(prueba).width > max && actual) { lineas.push(actual); actual = p }
    else actual = prueba
  }
  if (actual) lineas.push(actual)
  return lineas
}
function ls(ctx: any, valor: string) { try { ctx.letterSpacing = valor } catch { /* noop */ } }
function truncar(ctx: CanvasRenderingContext2D, texto: string, maxAncho: number): string {
  let t = texto
  while (ctx.measureText(t).width > maxAncho && t.length > 4) t = t.slice(0, -2)
  return t !== texto ? t + '…' : texto
}
function ajustar(ctx: CanvasRenderingContext2D, texto: string, maxAncho: number, peso: number, tamBase: number, familia: string, tamMin?: number): number {
  let t = tamBase
  const min = tamMin || Math.max(10, Math.round(tamBase * 0.55))
  ctx.font = `${peso} ${t}px ${familia}`
  while (ctx.measureText(texto).width > maxAncho && t > min) {
    t -= 1
    ctx.font = `${peso} ${t}px ${familia}`
  }
  return t
}

// ─── LOGO / MARCA DE AGUA (vector oficial) ───────────────────────────────────
const LOGO_PATH_D = "M3480 6571 c-974 -139 -1802 -762 -2168 -1633 -231 -547 -277 -1193 -127 -1773 212 -819 756 -1480 1508 -1834 59 -28 111 -51 115 -51 4 0 41 -14 82 -30 583 -238 1349 -236 1960 5 220 87 526 260 664 376 12 9 62 51 112 92 210 175 426 430 582 686 54 89 184 349 203 406 7 22 16 45 20 50 24 35 109 352 134 495 9 52 21 124 27 160 17 90 16 551 -1 665 -35 241 -114 559 -162 647 -5 10 -9 22 -9 27 0 5 -14 40 -31 78 -17 37 -38 84 -46 103 -114 254 -337 559 -593 808 -373 363 -903 621 -1465 713 -185 31 -624 36 -805 10z m695 -176 c1081 -134 1955 -919 2189 -1967 110 -490 65 -1120 -107 -1510 -8 -18 -20 -49 -27 -68 -66 -182 -285 -537 -431 -700 -457 -509 -971 -790 -1614 -882 -135 -19 -511 -16 -663 5 -582 83 -1107 349 -1510 766 -826 854 -973 2196 -350 3179 410 647 1097 1083 1853 1177 145 18 515 18 660 0z M2359 5727 c-39 -30 -39 -37 -39 -731 0 -429 4 -677 10 -681 5 -3 23 4 40 16 l30 23 0 647 c0 581 2 647 16 653 9 3 154 6 324 6 170 0 315 -3 324 -6 14 -5 16 -27 16 -140 0 -169 -5 -164 166 -164 l122 0 6 -37 c3 -21 4 -154 3 -296 -1 -142 0 -260 4 -263 3 -2 21 11 40 29 l34 32 -3 297 -3 297 -162 166 -162 165 -375 0 c-279 0 -379 -4 -391 -13z m878 -209 c83 -82 82 -90 -9 -86 l-73 3 -3 73 c-4 90 3 91 85 10z M2914 5033 c-71 -76 -135 -139 -144 -141 -8 -1 -40 22 -70 53 -55 56 -76 65 -98 43 -24 -24 -11 -49 64 -120 91 -87 96 -91 126 -79 25 9 308 314 308 332 0 22 -21 49 -39 49 -11 0 -73 -58 -147 -137z M4155 4914 c-291 -22 -482 -75 -651 -179 -11 -7 -56 -32 -100 -55 -141 -75 -263 -151 -309 -190 -33 -29 -59 -41 -102 -50 -275 -53 -625 -181 -754 -276 -131 -96 -12 -117 681 -118 409 0 443 1 565 22 185 33 391 61 501 68 l94 7 0 -28 c0 -51 -97 -193 -151 -220 -39 -21 -94 -31 -284 -55 -93 -11 -201 -28 -240 -36 -234 -51 -253 -54 -377 -54 -171 0 -504 18 -658 35 -110 12 -127 17 -142 37 -35 45 -39 48 -68 48 -18 0 -34 8 -44 22 -33 47 -59 -38 -59 -187 1 -142 19 -195 67 -195 27 1 29 2 13 11 -23 14 -56 85 -57 122 0 32 20 35 58 9 29 -20 62 -34 62 -27 0 3 -13 29 -30 58 -43 77 -41 101 8 92 63 -10 394 -34 654 -47 258 -12 377 -7 855 38 98 9 104 -15 11 -41 -72 -20 -288 -111 -303 -127 -7 -7 2 -9 30 -4 22 3 103 13 180 22 192 21 206 16 259 -87 48 -96 44 -113 -27 -134 -124 -37 -643 -46 -957 -16 -58 5 -181 15 -275 21 -453 31 -515 41 -515 87 0 15 -3 14 -21 -4 -42 -41 8 -79 120 -94 368 -47 1594 -82 1730 -49 65 15 77 32 85 116 38 441 232 726 431 635 76 -34 133 -116 161 -231 l14 -55 -5 70 c-3 50 -13 87 -34 130 -29 57 -84 125 -102 125 -5 0 -9 6 -9 14 0 21 73 36 465 95 476 73 912 120 950 103 26 -12 49 -71 69 -184 l14 -73 1 51 c1 27 -9 88 -20 135 -25 100 -60 149 -129 184 -26 13 -70 43 -97 65 -26 23 -58 49 -69 59 -243 201 -376 270 -619 318 -77 15 -728 27 -870 17z m1040 -104 c170 -54 326 -162 396 -275 43 -68 23 -91 -86 -100 -214 -17 -465 -47 -510 -60 -27 -8 -81 -17 -120 -21 -55 -5 -75 -11 -93 -30 -26 -28 -64 -31 -83 -8 -11 14 -27 16 -91 11 -55 -5 -78 -3 -78 5 0 35 226 436 263 467 59 48 267 54 402 11z m-480 9 c6 -9 -7 -41 -38 -94 -130 -217 -156 -258 -186 -282 -16 -14 -477 -16 -1041 -4 -273 6 -295 7 -295 24 0 9 12 25 26 35 253 169 313 205 444 267 75 35 90 38 230 50 190 16 851 19 860 4z m-545 -454 c0 -8 -7 -15 -15 -15 -8 0 -15 7 -15 15 0 8 7 15 15 15 8 0 15 -7 15 -15z m-60 -8 c0 -8 -43 -23 -117 -41 -65 -16 -142 -37 -172 -48 -65 -22 -71 -22 -71 -4 0 15 101 51 210 76 30 7 69 16 85 21 46 11 65 10 65 -4z m-370 -102 c0 -8 -7 -15 -15 -15 -8 0 -15 7 -15 15 0 8 7 15 15 15 8 0 15 -7 15 -15z m-80 -30 c0 -8 -7 -15 -15 -15 -8 0 -15 7 -15 15 0 8 7 15 15 15 8 0 15 -7 15 -15z M4798 4521 c-44 -9 -78 -36 -78 -63 0 -16 9 -18 98 -18 129 0 202 9 202 26 0 35 -145 71 -222 55z M5727 4079 c-44 -36 -65 -75 -101 -186 -36 -114 -32 -135 8 -33 43 114 63 151 95 177 58 50 117 12 147 -95 21 -77 22 -80 23 -57 1 66 -37 167 -77 203 -33 29 -50 28 -95 -9z M3929 4066 c-4 -4 -349 -46 -499 -62 -62 -6 -140 -35 -140 -52 0 -4 26 -20 57 -36 68 -33 106 -34 298 -11 179 22 221 32 255 56 28 21 90 92 90 103 0 7 -54 8 -61 2z M5738 3958 c-39 -33 -81 -246 -45 -232 27 10 50 -21 42 -57 -6 -29 -6 -30 13 -20 12 6 25 11 29 11 15 0 43 -57 43 -88 0 -62 -26 -83 -48 -39 -10 19 -11 16 -6 -20 7 -54 -18 -71 -48 -32 -20 23 -20 51 -2 117 5 16 2 22 -9 22 -8 0 -18 6 -21 13 -15 31 3 -133 19 -170 61 -151 169 70 152 313 -11 147 -62 227 -119 182z m78 -75 c14 -33 14 -40 0 -70 -19 -41 -20 -43 -2 -43 19 0 26 -22 26 -81 0 -56 -13 -63 -49 -25 -17 18 -22 32 -17 50 4 15 2 26 -4 26 -5 0 -10 23 -10 53 0 123 26 164 56 90z m-66 -63 c0 -77 -17 -95 -39 -41 -15 35 2 111 24 111 12 0 15 -15 15 -70z M4270 3831 c-102 -55 -156 -192 -148 -380 13 -286 176 -399 304 -210 124 185 95 518 -51 589 -50 24 -60 24 -105 1z m78 -83 c2 -20 -4 -50 -12 -67 -9 -16 -16 -39 -16 -51 0 -13 -7 -20 -18 -20 -15 0 -20 14 -30 82 -13 92 -9 100 43 96 27 -3 30 -7 33 -40z m95 -63 c27 -57 22 -81 -22 -109 -96 -61 -109 -46 -59 69 37 85 55 94 81 40z m-200 -35 c30 -105 17 -125 -50 -74 -38 29 -39 33 -17 91 24 62 45 57 67 -17z m77 -97 c0 -10 3 -28 6 -40 6 -21 3 -23 -30 -23 -41 0 -50 28 -19 62 21 23 43 23 43 1z m-95 -63 c32 -12 32 -19 -6 -80 -49 -80 -78 -60 -79 56 0 48 12 52 85 24z m238 -30 c-5 -103 -23 -113 -90 -50 -68 63 -47 102 52 97 l40 -2 -2 -45z m-153 -24 c5 -13 12 -25 17 -27 10 -5 73 -123 73 -138 0 -20 -52 -61 -76 -61 -23 0 -24 2 -24 89 0 66 -4 92 -15 101 -20 17 -20 60 0 60 9 0 20 -11 25 -24z m-36 -70 c10 -40 -5 -146 -20 -146 -21 0 -54 37 -54 60 0 30 40 110 55 110 7 0 16 -11 19 -24z M5255 3734 c-212 -36 -434 -96 -524 -142 -69 -35 -49 -38 75 -13 611 126 654 135 689 154 19 10 19 10 0 18 -33 13 -93 9 -240 -17z M2133 2949 c-224 -71 -242 -392 -29 -501 52 -26 220 -23 279 6 l37 18 0 84 c0 71 3 85 20 97 30 21 14 27 -77 27 -89 0 -94 -3 -63 -28 25 -21 39 -127 21 -160 -24 -45 -131 -40 -180 8 -90 90 -99 316 -15 389 77 68 227 41 248 -44 11 -42 26 -18 26 40 0 51 -1 54 -32 64 -63 22 -168 22 -235 0z M3135 2958 c-81 -29 -117 -76 -117 -150 1 -65 29 -96 129 -144 106 -50 126 -79 107 -152 -13 -46 -97 -67 -153 -38 -25 13 -51 53 -65 99 -11 35 -24 16 -28 -40 -5 -85 21 -103 149 -103 127 0 211 70 200 167 -7 65 -43 104 -139 151 -93 45 -105 55 -114 100 -5 25 -1 36 19 56 50 50 140 26 170 -45 18 -43 36 -24 30 32 -4 37 -10 49 -30 58 -36 17 -124 22 -158 9z M4154 2961 c-144 -37 -223 -144 -212 -285 9 -109 53 -179 142 -227 53 -28 189 -27 251 2 187 88 197 384 17 482 -54 29 -144 42 -198 28z m110 -45 c127 -53 143 -363 23 -436 -120 -74 -231 40 -231 235 0 158 94 249 208 201z M2535 2952 c-2 -2 5 -12 16 -23 30 -30 29 -464 -1 -474 -55 -18 -5 -25 170 -25 l190 0 0 23 c0 12 3 39 6 60 8 47 -17 52 -36 8 -14 -35 -70 -61 -129 -61 -71 0 -71 0 -71 116 l0 104 60 0 c57 0 62 -2 78 -30 26 -45 32 -37 32 45 0 83 -2 86 -36 50 -19 -21 -32 -25 -79 -25 l-55 0 0 100 0 100 59 0 c76 0 108 -12 123 -47 17 -38 18 -39 28 -23 14 22 12 88 -2 97 -12 7 -346 12 -353 5z M3426 2952 c-9 -9 -7 -122 2 -122 5 0 16 16 25 34 17 37 69 61 117 54 l25 -3 3 -206 c3 -227 -3 -259 -43 -259 -14 0 -25 -4 -25 -10 0 -6 43 -10 110 -10 109 0 131 6 88 25 -23 10 -23 12 -26 238 l-2 227 46 0 c48 0 104 -40 104 -74 0 -9 7 -16 15 -16 24 0 21 117 -2 124 -24 7 -430 5 -437 -2z M4577 2953 c-3 -2 3 -13 14 -24 30 -30 29 -439 -1 -469 -29 -29 -28 -30 70 -30 92 0 106 5 70 28 -18 11 -20 23 -20 107 l0 95 29 0 c25 0 35 -10 76 -77 26 -43 59 -95 73 -115 l25 -38 73 0 c43 0 74 4 74 10 0 6 -6 10 -13 10 -19 0 -57 44 -116 133 -60 92 -60 96 -18 122 103 65 81 210 -38 239 -35 9 -291 17 -298 9z m236 -44 c49 -22 63 -108 27 -166 -19 -33 -39 -42 -95 -46 l-30 -2 -3 113 -3 112 40 0 c22 0 51 -5 64 -11z M5130 2952 c-9 -3 -6 -10 9 -21 20 -15 21 -26 25 -196 4 -235 0 -274 -30 -286 -42 -15 -27 -19 76 -19 100 0 120 7 78 25 -23 10 -23 13 -26 232 -2 213 -1 224 18 240 11 10 20 21 20 25 0 7 -148 7 -170 0z M5616 2951 c-21 -4 -32 -14 -39 -36 -50 -163 -162 -453 -180 -467 -21 -17 -20 -18 46 -18 64 0 86 11 51 24 -18 7 -16 67 5 119 10 27 12 27 100 27 l90 0 20 -55 c25 -67 26 -73 4 -97 -15 -17 -13 -18 75 -18 99 0 101 1 75 30 -18 19 -31 49 -78 180 -15 41 -31 84 -35 95 -5 11 -27 65 -48 120 -42 106 -42 106 -86 96z m24 -210 c17 -49 29 -94 25 -100 -11 -20 -135 -14 -135 6 0 32 54 183 66 183 6 0 26 -40 44 -89z M3197 2203 c-3 -5 3 -17 14 -26 18 -16 19 -31 19 -234 -1 -223 -5 -253 -41 -253 -11 0 -11 -2 1 -10 19 -12 177 -13 184 -1 3 5 -6 16 -19 25 -25 16 -26 20 -23 104 l3 87 72 6 c83 8 127 30 160 78 53 79 35 155 -47 201 -41 23 -58 25 -181 28 -76 2 -139 0 -142 -5z m238 -39 c49 -19 62 -143 20 -192 -27 -32 -71 -48 -105 -37 -19 6 -20 15 -20 121 l0 114 44 0 c24 0 52 -3 61 -6z M3825 2200 c-13 -5 -28 -32 -44 -76 -73 -211 -155 -420 -167 -427 -29 -17 -12 -27 44 -27 69 0 77 5 51 31 -22 22 -20 50 7 115 l14 34 88 -3 87 -2 17 -35 c28 -57 33 -101 15 -115 -26 -19 -9 -25 73 -25 89 0 95 3 70 39 -15 20 -121 282 -192 474 -10 28 -27 32 -63 17z m34 -216 c17 -47 31 -90 31 -95 0 -5 -31 -9 -70 -9 -80 0 -82 3 -54 87 42 131 51 132 93 17z M4207 2203 c-4 -3 -7 -31 -7 -62 l1 -56 21 29 c29 39 75 56 153 56 81 0 81 -3 10 -117 -30 -48 -58 -95 -62 -103 -4 -8 -41 -72 -84 -142 -42 -70 -74 -129 -71 -132 8 -8 362 -5 392 3 21 6 26 14 31 56 8 68 3 72 -37 31 -40 -41 -85 -56 -171 -56 -52 0 -63 3 -63 17 0 17 81 161 197 351 35 56 63 109 63 117 0 16 -358 23 -373 8z"
let _logoTile: HTMLCanvasElement | null = null
function obtenerLogoTile(): HTMLCanvasElement {
  if (_logoTile) return _logoTile
  const path = new Path2D(LOGO_PATH_D)
  const RES = 480
  const off = document.createElement('canvas')
  off.width = RES; off.height = RES
  const octx = off.getContext('2d')!
  octx.save()
  octx.translate(RES / 2, RES / 2)
  octx.scale(0.85, 0.85)
  octx.translate(-392, -347)
  octx.translate(0, 723)
  octx.scale(0.1, -0.1)
  octx.fillStyle = NARANJA
  octx.fill(path)
  octx.restore()
  _logoTile = off
  return off
}
function dibujarMarcaDeAgua(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const tile = obtenerLogoTile()
  ctx.save()
  ctx.globalAlpha = 0.06
  ctx.translate(W / 2, H / 2)
  ctx.rotate(-18 * Math.PI / 180)
  ctx.translate(-W / 2, -H / 2)
  const diag = Math.sqrt(W * W + H * H)
  const paso = 300, tam = 108
  for (let yy = -diag; yy < H + diag; yy += paso * 0.9) {
    for (let xx = -diag; xx < W + diag; xx += paso) {
      ctx.drawImage(tile, xx - tam / 2, yy - tam / 2, tam, tam)
    }
  }
  ctx.restore()
}

// ─── DIBUJO DEL DOCUMENTO ────────────────────────────────────────────────────
export function dibujarPresupuesto(
  cv: HTMLCanvasElement,
  opts: {
    filas:   FilaPresupuesto[]
    totales: TotalesPresupuesto
    meta:    MetaPresupuesto
    config:  ConfigPresupuesto
    logoImg?: HTMLImageElement | null
  },
): void {
  const { filas, totales, meta, config } = opts
  const logoImg = opts.logoImg ?? null
  const ctx = cv.getContext('2d')!
  const c = { ...totales, patente: meta.patente, cliente: meta.cliente || '', fecha: meta.fecha, plazo: meta.plazo, validez: meta.validez }

  const legal = 'Incluye la gestión de las infracciones visibles en las plataformas oficiales al día de la fecha. No incluye municipios no adheridos.'
  ctx.font = "400 21px 'DM Sans','Helvetica Neue',Arial,sans-serif"
  const lineasLegal = wrap(ctx, legal, W - PX * 2)
  ctx.font = "400 13px 'DM Sans', sans-serif"
  const lineasFinePrint = FINE_PRINT.split('\n').flatMap(l => wrap(ctx, l, W - PX * 2))

  const DIM = {
    HEAD: 250, PAT: 168, LEGAL: 26 + lineasLegal.length * 30 + 26,
    TABLA: 66 + filas.length * 76 + 34, DEUDA: 90,
    CARDS: Math.max(320, 216 + filas.length * 32 + (c.S > 0 ? 42 : 0)),
    CUOTAS: c.mostrarCuotas ? 92 : 0, AHORRO: 168, PAGOS: 196,
    PLAZO: 118, ATENC: 322, RESENA: 108,
    FINE_PRINT: 40 + lineasFinePrint.length * 18,
    FOOT: 268,
  }
  const H = Object.values(DIM).reduce((a, v) => a + v, 0)
  cv.width = W; cv.height = H
  cv.style.aspectRatio = W + ' / ' + H
  cv.style.height = 'auto'
  ctx.clearRect(0, 0, W, H)
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  ls(ctx, '0px')
  ctx.fillStyle = BLANCO; ctx.fillRect(0, 0, W, H)
  let y = 0

  /* CABECERA */
  ctx.fillStyle = NEGRO; ctx.fillRect(0, 0, W, DIM.HEAD)
  ctx.fillStyle = NARANJA
  ctx.beginPath(); ctx.moveTo(W - 200, DIM.HEAD); ctx.lineTo(W, DIM.HEAD - 80); ctx.lineTo(W, DIM.HEAD); ctx.closePath(); ctx.fill()
  if (logoImg) {
    const alto = 96, ancho = logoImg.width / logoImg.height * alto
    ctx.drawImage(logoImg, PX, 74, Math.min(ancho, 260), alto)
  } else {
    ctx.drawImage(obtenerLogoTile(), PX, 78, 92, 92)
    ctx.fillStyle = BLANCO
    ajustar(ctx, 'GESTORÍA PAZ', 170, 800, 32, "'Syne','Arial Black',sans-serif", 20)
    ctx.fillText('GESTORÍA PAZ', PX + 104, 122)
    ls(ctx, '3px'); ctx.fillStyle = NARANJA
    ajustar(ctx, 'TU TRANQUILIDAD, NUESTRO COMPROMISO', 170, 500, 16, "'DM Sans',sans-serif", 14)
    ctx.fillText('TU TRANQUILIDAD, NUESTRO COMPROMISO', PX + 104, 152)
    ls(ctx, '0px')
  }
  ctx.textAlign = 'right'; ctx.fillStyle = BLANCO
  ajustar(ctx, 'PRESUPUESTO', 200, 800, 40, "'Syne',sans-serif", 24)
  ctx.fillText('PRESUPUESTO', W - PX, 128)
  ls(ctx, '2.5px'); ctx.fillStyle = NARANJA
  ajustar(ctx, 'GESTIÓN DE INFRACCIONES', 200, 700, 15, "'DM Sans',sans-serif", 14)
  ctx.fillText('GESTIÓN DE INFRACCIONES', W - PX, 158)
  ls(ctx, '0px'); ctx.textAlign = 'left'
  y = DIM.HEAD

  /* DOMINIO + FECHA */
  ctx.fillStyle = BLANCO; ctx.fillRect(0, y, W, DIM.PAT)
  ls(ctx, '2.5px'); ctx.fillStyle = GRIS_TX; ctx.font = "700 15px 'DM Sans',sans-serif"
  ctx.fillText('DOMINIO', PX, y + 50); ls(ctx, '0px')
  ctx.fillStyle = NEGRO
  ajustar(ctx, c.patente, 420, 700, 40, "'JetBrains Mono',monospace", 22)
  const anchoPat = ctx.measureText(c.patente).width
  ctx.beginPath(); ctx.roundRect(PX, y + 64, Math.max(anchoPat + 150, 290), 66, 12); ctx.fill()
  ctx.fillStyle = NARANJA; ls(ctx, '3px')
  ctx.fillText(c.patente, PX + 28, y + 110); ls(ctx, '0px')
  ctx.textAlign = 'right'; ls(ctx, '2.5px')
  ctx.fillStyle = GRIS_TX; ctx.font = "700 15px 'DM Sans',sans-serif"
  ctx.fillText('FECHA', W - PX, y + 50); ls(ctx, '0px')
  ctx.fillStyle = NEGRO; ctx.font = "500 26px 'DM Sans',sans-serif"
  ctx.fillText(c.fecha, W - PX, y + 92)
  if (c.cliente) { ctx.fillStyle = GRIS_TX; ctx.font = "500 21px 'DM Sans',sans-serif"; ctx.fillText(c.cliente, W - PX, y + 124) }
  ctx.textAlign = 'left'; y += DIM.PAT

  /* ACLARACIÓN LEGAL */
  ctx.fillStyle = GRIS; ctx.fillRect(0, y, W, DIM.LEGAL)
  ctx.fillStyle = NARANJA; ctx.fillRect(0, y, 7, DIM.LEGAL)
  ctx.fillStyle = '#5E5E5E'; ctx.font = "400 21px 'DM Sans',sans-serif"
  lineasLegal.forEach((l, i) => ctx.fillText(l, PX, y + 52 + i * 30))
  y += DIM.LEGAL

  /* TABLA (5 columnas) */
  ctx.fillStyle = NEGRO; ctx.fillRect(0, y, W, 66)
  ls(ctx, '1.3px'); ctx.fillStyle = BLANCO; ctx.font = "700 15px 'DM Sans',sans-serif"
  ctx.fillText('JURISDICCIÓN', PX, y + 42)
  ctx.textAlign = 'center'; ctx.fillText('CANT.', 480, y + 42)
  ctx.textAlign = 'right';  ctx.fillText('DEUDA', 660, y + 42)
  ctx.fillStyle = BLANCO;   ctx.fillText('QUEDA EN', 840, y + 42)
  ctx.fillStyle = NARANJA;  ctx.fillText('EFECTIVO', W - PX, y + 42)
  ls(ctx, '0px'); ctx.textAlign = 'left'; y += 66
  filas.forEach((f, i) => {
    ctx.fillStyle = i % 2 ? '#F7F7F7' : BLANCO; ctx.fillRect(0, y, W, 76)
    ctx.fillStyle = NEGRO; ctx.font = "500 21px 'DM Sans',sans-serif"
    ctx.fillText(truncar(ctx, f.jur || `Jurisdicción ${i + 1}`, 360), PX, y + 48)
    ctx.textAlign = 'center'; ctx.font = "700 21px 'JetBrains Mono',monospace"
    ctx.fillText(String(f.cant), 480, y + 48)
    ctx.textAlign = 'right'; ctx.fillStyle = GRIS_TX; ctx.font = "500 21px 'JetBrains Mono',monospace"
    ctx.fillText(money(f.deuda), 660, y + 48)
    ctx.fillStyle = NEGRO; ctx.font = "700 22px 'JetBrains Mono',monospace"
    ctx.fillText(money(c.quedaConSuats[i] ?? 0), 840, y + 48)
    ctx.fillStyle = NARANJA
    ctx.fillText(money(c.efvoConSuats[i] ?? 0), W - PX, y + 48)
    ctx.textAlign = 'left'; y += 76
  })
  ctx.strokeStyle = '#DDD'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(PX, y); ctx.lineTo(W - PX, y); ctx.stroke()
  y += 34

  /* DEUDA SIN GESTIONAR */
  ctx.fillStyle = GRIS
  ctx.beginPath(); ctx.roundRect(PX, y, W - PX * 2, 74, 12); ctx.fill()
  ctx.fillStyle = '#5E5E5E'; ctx.font = "500 23px 'DM Sans',sans-serif"
  ctx.fillText('Deuda total sin gestionar', PX + 28, y + 46)
  ctx.textAlign = 'right'; ctx.font = "500 25px 'JetBrains Mono',monospace"
  ctx.fillText(money(c.D), W - PX - 28, y + 46)
  const wD = ctx.measureText(money(c.D)).width
  ctx.strokeStyle = '#9A9A9A'; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(W - PX - 28 - wD, y + 38); ctx.lineTo(W - PX - 28, y + 38); ctx.stroke()
  ctx.textAlign = 'left'; y += DIM.DEUDA

  /* TARJETAS TOTALES con desglose */
  const anchoCol = (W - PX * 2 - 16) / 2
  const altCard = DIM.CARDS - 24
  ctx.fillStyle = NARANJA
  ctx.beginPath(); ctx.roundRect(PX, y, anchoCol, altCard, 16); ctx.fill()
  ls(ctx, '1.6px'); ctx.fillStyle = NEGRO
  ajustar(ctx, 'Pago por Transferencia', anchoCol - 56, 700, 15, "'DM Sans',sans-serif", 11)
  ctx.fillText('Pago por Transferencia', PX + 28, y + 44); ls(ctx, '0px')
  ajustar(ctx, money(c.T), anchoCol - 56, 700, 52, "'JetBrains Mono',monospace", 26)
  ctx.fillText(money(c.T), PX + 28, y + 102)
  ctx.font = "700 17px 'DM Sans',sans-serif";
  ctx.strokeStyle = 'rgba(18,18,18,0.2)'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(PX + 28, y + 144); ctx.lineTo(PX + anchoCol - 28, y + 144); ctx.stroke()
  ls(ctx, '1px'); ctx.font = "700 11px 'DM Sans',sans-serif"
  ctx.fillText('DESGLOSE TRANSFERENCIA:', PX + 28, y + 166); ls(ctx, '0px')
  let yDes = y + 192
  filas.forEach((f, i) => {
    ctx.fillStyle = '#2A1B02'; ctx.font = "500 15px 'DM Sans',sans-serif"
    ctx.fillText(`• ${truncar(ctx, f.jur || `Jur. ${i + 1}`, 220)}`, PX + 28, yDes)
    ctx.textAlign = 'right'; ctx.font = "700 15px 'JetBrains Mono',monospace"
    ctx.fillText(money(c.quedaConSuats[i] ?? 0), PX + anchoCol - 28, yDes); ctx.textAlign = 'left'
    yDes += 30
  })
  if (c.S > 0) { ctx.fillStyle = '#5A3A05'; ctx.font = "500 15px 'DM Sans',sans-serif"; ctx.fillText('Incluye Informe de Multas Gratis', PX + 28, yDes) }

  const x2 = PX + anchoCol + 16
  ctx.fillStyle = NEGRO
  ctx.beginPath(); ctx.roundRect(x2, y, anchoCol, altCard, 16); ctx.fill()
  ls(ctx, '1.6px'); ctx.fillStyle = NARANJA
  ajustar(ctx, 'Pago en Efectivo', anchoCol - 56, 700, 15, "'DM Sans',sans-serif", 11)
  ctx.fillText('Pago en Efectivo', x2 + 28, y + 44); ls(ctx, '0px')
  ctx.fillStyle = BLANCO
  ajustar(ctx, money(c.E), anchoCol - 56, 700, 52, "'JetBrains Mono',monospace", 26)
  ctx.fillText(money(c.E), x2 + 28, y + 102)
  ctx.fillStyle = GRIS; ctx.font = "700 17px 'DM Sans',sans-serif"
  ctx.fillText('En nuestra oficina', x2 + 28, y + 130)
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(x2 + 28, y + 144); ctx.lineTo(x2 + anchoCol - 28, y + 144); ctx.stroke()
  ls(ctx, '1px'); ctx.fillStyle = NARANJA; ctx.font = "700 11px 'DM Sans',sans-serif"
  ctx.fillText('DESGLOSE EN EFECTIVO:', x2 + 28, y + 166); ls(ctx, '0px')
  yDes = y + 192
  filas.forEach((f, i) => {
    ctx.fillStyle = '#EAEAEA'; ctx.font = "500 15px 'DM Sans',sans-serif"
    ctx.fillText(`• ${truncar(ctx, f.jur || `Jur. ${i + 1}`, 220)}`, x2 + 28, yDes)
    ctx.textAlign = 'right'; ctx.fillStyle = BLANCO; ctx.font = "700 15px 'JetBrains Mono',monospace"
    ctx.fillText(money(c.efvoConSuats[i] ?? 0), x2 + anchoCol - 28, yDes); ctx.textAlign = 'left'
    yDes += 30
  })
  if (c.S > 0) { ctx.fillStyle = '#EAEAEA'; ctx.font = "500 15px 'DM Sans',sans-serif"; ctx.fillText('Incluye Informe de Multas Gratis', x2 + 28, yDes) }
  y += DIM.CARDS

  /* CUOTAS */
  if (c.mostrarCuotas) {
    ctx.fillStyle = GRIS
    ctx.beginPath(); ctx.roundRect(PX, y, W - PX * 2, 76, 14); ctx.fill()
    ctx.fillStyle = NARANJA
    ctx.beginPath(); ctx.roundRect(PX, y, 6, 76, 3); ctx.fill()
    ctx.fillStyle = NEGRO; ls(ctx, '1.2px'); ctx.font = "700 15px 'DM Sans',sans-serif"
    ctx.fillText('FINANCIACIÓN EN CUOTAS', PX + 28, y + 30); ls(ctx, '0px')
    const txtCuotas = `${c.nChica} × ${money(c.cuotaChica)}      ·      ${c.nLarga} × ${money(c.cuotaLarga)}`
    ajustar(ctx, txtCuotas, W - PX * 2 - 56, 700, 26, "'JetBrains Mono',monospace", 15)
    ctx.fillText(txtCuotas, PX + 28, y + 60)
    y += DIM.CUOTAS
  }

  /* AHORRO */
  ctx.fillStyle = NEGRO
  ctx.beginPath(); ctx.roundRect(PX, y, W - PX * 2, 150, 16); ctx.fill()
  ls(ctx, '2.5px'); ctx.fillStyle = GRIS_TX
  ajustar(ctx, 'TU AHORRO CON ESTA GESTIÓN', W - PX * 2 - 68, 700, 16, "'DM Sans',sans-serif", 11)
  ctx.fillText('TU AHORRO CON ESTA GESTIÓN', PX + 34, y + 46); ls(ctx, '0px')
  ctx.fillStyle = NARANJA
  ajustar(ctx, money(c.ahorro), W - PX * 2 - 260, 700, 48, "'JetBrains Mono',monospace", 26)
  ctx.fillText(money(c.ahorro), PX + 34, y + 108)
  ctx.textAlign = 'left'; y += DIM.AHORRO

  /* FORMAS DE PAGO */
  ls(ctx, '2.5px'); ctx.fillStyle = NEGRO; ctx.font = "700 16px 'DM Sans',sans-serif"
  ctx.fillText('FORMAS DE PAGO', PX, y + 46); ls(ctx, '0px')
  const pagos = [
    'Transferencia bancaria',
    c.mostrarCuotas ? `Tarjeta de crédito · hasta ${c.nLarga} cuotas fijas` : 'Tarjeta de crédito · consultar financiación',
    'Efectivo en oficina', 'Mercado Pago',
  ]
  ctx.font = "400 22px 'DM Sans',sans-serif"
  const colX = [PX, PX + (W - PX * 2) / 2 + 10]
  pagos.forEach((p, i) => {
    const cx = colX[i % 2], yy = y + 92 + Math.floor(i / 2) * 44
    ctx.fillStyle = NARANJA
    ctx.beginPath(); ctx.arc(cx + 7, yy - 8, 6, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#3A3A3A'; ctx.fillText(p, cx + 30, yy)
  })
  y += DIM.PAGOS

  /* PLAZO Y VALIDEZ */
  ctx.fillStyle = GRIS
  ctx.beginPath(); ctx.roundRect(PX, y, W - PX * 2, 92, 14); ctx.fill()
  ctx.fillStyle = NEGRO; ctx.font = "700 25px 'DM Sans',sans-serif"
  ctx.fillText(`Informe de multas limpio en ${c.plazo}`, PX + 28, y + 42)
  ctx.fillStyle = '#5E5E5E'; ctx.font = "400 20px 'DM Sans',sans-serif"
  ctx.fillText(`Presupuesto válido por ${c.validez} días · Emitimos recibo por el servicio`, PX + 28, y + 72)
  y += DIM.PLAZO

  /* CÓMO TE ATENDEMOS */
  ls(ctx, '2.5px'); ctx.fillStyle = NEGRO; ctx.font = "700 16px 'DM Sans',sans-serif"
  ctx.fillText('CÓMO TE ATENDEMOS', PX, y + 34); ls(ctx, '0px')
  const anchoAt = (W - PX * 2 - 16) / 2, yAt = y + 58, xAt2 = PX + anchoAt + 16
  ;[PX, xAt2].forEach((xB, idx) => {
    ctx.fillStyle = BLANCO
    ctx.beginPath(); ctx.roundRect(xB, yAt, anchoAt, 140, 14); ctx.fill()
    ctx.strokeStyle = '#DCDCDC'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(xB, yAt, anchoAt, 140, 14); ctx.stroke()
    ctx.fillStyle = NARANJA
    ctx.beginPath(); ctx.roundRect(xB, yAt, 6, 140, 3); ctx.fill()
    ls(ctx, '1.6px'); ctx.font = "700 14px 'DM Sans',sans-serif"
    ctx.fillText(idx === 0 ? 'UBICACIÓN' : 'ATENCIÓN ONLINE', xB + 26, yAt + 36); ls(ctx, '0px')
    ctx.fillStyle = NEGRO; ctx.font = "700 23px 'DM Sans',sans-serif"
    ctx.fillText(idx === 0 ? 'Güemes 2261' : 'Videollamada', xB + 26, yAt + 72)
    ctx.font = "500 20px 'DM Sans',sans-serif"
    ctx.fillText(idx === 0 ? 'San Martín Centro' : 'Coordinamos día y hora', xB + 26, yAt + 100)
    ctx.fillStyle = GRIS_TX; ctx.font = "400 18px 'DM Sans',sans-serif"
    ctx.fillText(idx === 0 ? 'Mapa en el mensaje adjunto' : 'Si estás lejos o preferís esta modalidad', xB + 26, yAt + 126)
  })
  const yCita = yAt + 156
  ctx.fillStyle = NARANJA
  ctx.beginPath(); ctx.roundRect(PX, yCita, W - PX * 2, 62, 12); ctx.fill()
  ctx.textAlign = 'center'; ctx.fillStyle = NEGRO
  ajustar(ctx, 'Ambas modalidades se atienden únicamente con cita previa', W - PX * 2 - 48, 700, 23, "'DM Sans',sans-serif", 15)
  ctx.fillText('Ambas modalidades se atienden únicamente con cita previa', W / 2, yCita + 39)
  ctx.textAlign = 'left'; y += DIM.ATENC

  /* RESEÑAS */
  ctx.fillStyle = GRIS
  ctx.beginPath(); ctx.roundRect(PX, y, W - PX * 2, 84, 14); ctx.fill()
  ctx.fillStyle = NARANJA
  for (let i = 0; i < 5; i++) {
    ctx.beginPath()
    for (let j = 0; j < 5; j++) {
      const ang = -Math.PI / 2 + j * (2 * Math.PI / 5), angInt = ang + Math.PI / 5
      ctx.lineTo(PX + 30 + i * 30 + 12 * Math.cos(ang), y + 30 + 12 * Math.sin(ang))
      ctx.lineTo(PX + 30 + i * 30 + 12 * 0.42 * Math.cos(angInt), y + 30 + 12 * 0.42 * Math.sin(angInt))
    }
    ctx.closePath(); ctx.fill()
  }
  ctx.fillStyle = NEGRO; ctx.font = "700 32px 'JetBrains Mono',monospace"
  ctx.fillText(DATOS_FIJOS.googleRating, PX + 30, y + 66)
  ctx.fillStyle = GRIS_TX; ctx.font = "500 24px 'DM Sans',sans-serif"
  ctx.fillText(`${DATOS_FIJOS.googleReviews} opiniones en Google`, PX + 120, y + 66)
  ctx.textAlign = 'right'; ctx.fillStyle = NARANJA; ctx.font = "700 26px 'DM Sans',sans-serif"
  ctx.fillText('Ver reseñas →', W - PX, y + 48)
  ctx.textAlign = 'left'; y += DIM.RESENA

  /* LETRA CHICA */
  ctx.fillStyle = BLANCO; ctx.fillRect(0, y, W, DIM.FINE_PRINT)
  ctx.fillStyle = '#8A8A8A'; ctx.font = "400 13px 'DM Sans',sans-serif"
  lineasFinePrint.forEach((l, i) => ctx.fillText(l, PX, y + 26 + i * 18))
  y += DIM.FINE_PRINT

  /* PIE */
  ctx.fillStyle = NEGRO; ctx.fillRect(0, y, W, DIM.FOOT)
  ctx.fillStyle = NARANJA; ctx.fillRect(0, y, W, 6)
  ajustar(ctx, 'WhatsApp  ' + DATOS_FIJOS.whatsapp, (W - PX * 2) * 0.52, 700, 30, "'DM Sans',sans-serif", 18)
  ctx.fillText('WhatsApp  ' + DATOS_FIJOS.whatsapp, PX, y + 62)
  ctx.fillStyle = BLANCO; ctx.font = "500 21px 'DM Sans',sans-serif"
  ctx.fillText(DATOS_FIJOS.email, PX, y + 100)
  ctx.fillText(DATOS_FIJOS.web, PX, y + 132)
  ctx.fillStyle = GRIS_TX; ctx.font = "400 19px 'DM Sans',sans-serif"
  ctx.fillText(DATOS_FIJOS.direccion, PX, y + 172)
  ctx.textAlign = 'right'; ls(ctx, '4px'); ctx.font = "700 13px 'DM Sans',sans-serif"
  ctx.fillText('SEGUINOS', W - PX, y + 58); ls(ctx, '2px')
  ;([['Instagram', DATOS_FIJOS.instagram], ['Facebook', DATOS_FIJOS.facebook], ['TikTok', DATOS_FIJOS.tiktok]] as [string, string][]).forEach((r, i) => {
    const yy = y + 92 + i * 32
    ctx.fillStyle = BLANCO; ctx.font = "500 20px 'DM Sans',sans-serif"
    const wU = ctx.measureText(r[1]).width
    ctx.fillText(r[1], W - PX, yy)
    ctx.fillStyle = GRIS_TX; ctx.font = "400 16px 'DM Sans',sans-serif"
    ctx.fillText(r[0], W - PX - wU - 36, yy)
  })
  ls(ctx, '2px'); ctx.fillStyle = NARANJA; ctx.font = "700 18px 'DM Sans',sans-serif"
  ctx.fillText('Tu Tranquilidad, Nuestro Compromiso', W - PX, y + 212)
  ls(ctx, '0px'); ctx.textAlign = 'left'
  dibujarMarcaDeAgua(ctx, W, H)
}