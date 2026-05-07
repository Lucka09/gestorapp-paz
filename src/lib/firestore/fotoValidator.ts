// src/lib/fotoValidator.ts
// ─── VALIDADOR DE CALIDAD DE FOTOS ────────────────────────────────────────────
// Validación client-side antes del upload a Firebase Storage.
// Sin dependencias externas — usa Canvas API nativa del navegador.
// Compatible con mobile (iOS Safari + Android Chrome).

export interface ResultadoValidacion {
  ok:     boolean
  razon?: string   // solo presente si ok = false
  meta?: {
    anchoPx:    number
    altoPx:     number
    tamanoKb:   number
    brillo:     number   // 0-255, promedio de luminancia
    nitidez:    number   // varianza de gradiente, mayor = más nítida
  }
}

// ─── UMBRALES ─────────────────────────────────────────────────────────────────

const UMBRAL = {
  TAMANO_MIN_KB:   40,      // menos de esto = muy baja res o corrupta
  ANCHO_MIN_PX:    600,     // mínimo aceptable para documentos
  ALTO_MIN_PX:     400,
  BRILLO_MIN:      35,      // < 35 = muy oscura
  BRILLO_MAX:      230,     // > 230 = sobreexpuesta
  NITIDEZ_MIN:     12,      // < 12 = borrosa (varianza de Laplacian)
  FORMATOS_OK:     ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp'],
}

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────

/**
 * Valida la calidad de una foto antes de subirla.
 * Retorna inmediatamente si el formato o tamaño no pasan.
 * Para las validaciones visuales (brillo, nitidez), requiere que
 * el navegador pueda renderizar la imagen en un canvas offscreen.
 */
export async function validarFoto(file: File): Promise<ResultadoValidacion> {
  // 1. Formato
  const formatoOk = UMBRAL.FORMATOS_OK.includes(file.type.toLowerCase())
  if (!formatoOk) {
    return { ok: false, razon: 'Formato no válido. Usá JPG, PNG o HEIC.' }
  }

  // 2. Tamaño mínimo
  const tamanoKb = file.size / 1024
  if (tamanoKb < UMBRAL.TAMANO_MIN_KB) {
    return {
      ok: false,
      razon: 'El archivo es demasiado pequeño. La imagen puede tener resolución insuficiente.',
    }
  }

  // 3. Análisis visual (resolución + brillo + nitidez)
  try {
    const analisis = await analizarImagen(file)

    if (analisis.anchoPx < UMBRAL.ANCHO_MIN_PX || analisis.altoPx < UMBRAL.ALTO_MIN_PX) {
      return {
        ok: false,
        razon: `Resolución insuficiente (${analisis.anchoPx}×${analisis.altoPx}px). Tomá la foto con mayor calidad.`,
        meta: { ...analisis, tamanoKb },
      }
    }

    if (analisis.brillo < UMBRAL.BRILLO_MIN) {
      return {
        ok: false,
        razon: 'La imagen está demasiado oscura. Mejorá la iluminación y volvé a tomar la foto.',
        meta: { ...analisis, tamanoKb },
      }
    }

    if (analisis.brillo > UMBRAL.BRILLO_MAX) {
      return {
        ok: false,
        razon: 'La imagen está sobreexpuesta (demasiada luz). Buscá una sombra y volvé a intentar.',
        meta: { ...analisis, tamanoKb },
      }
    }

    if (analisis.nitidez < UMBRAL.NITIDEZ_MIN) {
      return {
        ok: false,
        razon: 'La imagen está borrosa o fuera de foco. Mantené el teléfono firme y volvé a intentar.',
        meta: { ...analisis, tamanoKb },
      }
    }

    return { ok: true, meta: { ...analisis, tamanoKb } }

  } catch {
    // Si el análisis visual falla (ej: HEIC en Safari sin soporte canvas),
    // aceptamos la foto con solo la validación de tamaño/formato
    return { ok: true, meta: undefined }
  }
}

// ─── ANÁLISIS VISUAL (canvas) ─────────────────────────────────────────────────

interface AnalisisImagen {
  anchoPx:  number
  altoPx:   number
  brillo:   number
  nitidez:  number
}

async function analizarImagen(file: File): Promise<AnalisisImagen> {
  const url = URL.createObjectURL(file)
  try {
    const img = await cargarImagen(url)

    // Escalar para análisis — no necesitamos la imagen completa para calcular estadísticas
    const ESCALA = 200  // px máximo para el canvas de análisis
    const ratio  = Math.min(ESCALA / img.width, ESCALA / img.height)
    const w      = Math.round(img.width  * ratio)
    const h      = Math.round(img.height * ratio)

    const canvas  = new OffscreenCanvas(w, h)
    const ctx     = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)

    return {
      anchoPx: img.width,
      altoPx:  img.height,
      brillo:  calcularBrillo(data),
      nitidez: calcularNitidez(data, w, h),
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload  = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
    img.src = url
  })
}

/** Luminancia promedio de todos los pixels (0-255) */
function calcularBrillo(data: Uint8ClampedArray): number {
  let suma = 0
  const total = data.length / 4
  for (let i = 0; i < data.length; i += 4) {
    // Fórmula perceptual de luminancia (ITU-R BT.709)
    suma += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
  }
  return suma / total
}

/**
 * Nitidez estimada mediante el operador Laplacian simplificado.
 * Calcula la varianza del gradiente: mayor varianza = más bordes definidos = más nítida.
 * Rango aproximado: < 5 muy borrosa, 5-15 aceptable, > 15 buena.
 */
function calcularNitidez(data: Uint8ClampedArray, w: number, h: number): number {
  const grayScale: number[] = []
  for (let i = 0; i < data.length; i += 4) {
    grayScale.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
  }

  let suma = 0, sumaCuadrados = 0, n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x
      const lap =
        -grayScale[idx - w - 1] - grayScale[idx - w] - grayScale[idx - w + 1]
        - grayScale[idx - 1]    + 8 * grayScale[idx]  - grayScale[idx + 1]
        - grayScale[idx + w - 1]- grayScale[idx + w] - grayScale[idx + w + 1]
      suma        += lap
      sumaCuadrados += lap * lap
      n++
    }
  }
  const media   = suma / n
  const varianza = sumaCuadrados / n - media * media
  return Math.sqrt(Math.abs(varianza))
}

// ─── HELPER DE NOMBRE PARA STORAGE ───────────────────────────────────────────

/** Genera el path de Storage para una foto de workflow */
export function generarPathStorage(
  gestoriaId: string,
  tramiteId:  string,
  paso:       number,
  index:      number,
  archivo:    File,
): string {
  const ext       = archivo.name.split('.').pop() ?? 'jpg'
  const timestamp = Date.now()
  return `${gestoriaId}/workflows/${tramiteId}/paso${paso}/foto_${index + 1}_${timestamp}.${ext}`
}