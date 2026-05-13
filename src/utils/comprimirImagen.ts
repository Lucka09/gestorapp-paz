// src/utils/comprimirImagen.ts
// ─── UTILITARIO DE COMPRESIÓN DE IMÁGENES ────────────────────────────────────
// Compartido por useMultaWorkflow y useInscripcionWorkflow.
// Reduce el peso de las fotos antes de subir a Firebase Storage.
// Objetivo: mantener el plan gratuito (5 GB) el mayor tiempo posible.

const MAX_DIMENSION          = 1600   // px — suficiente para leer DNI y chapa
const JPEG_QUALITY           = 0.78   // 78% — balance calidad/tamaño
const SKIP_COMPRESS_UNDER_KB = 350    // no recomprimir archivos ya pequeños

/**
 * Comprime una imagen usando canvas.
 * - Redimensiona si supera MAX_DIMENSION en cualquier eje.
 * - Convierte a JPEG con JPEG_QUALITY.
 * - Si el resultado es más grande que el original, devuelve el original.
 * - Si el archivo ya pesa menos de SKIP_COMPRESS_UNDER_KB KB o no es imagen,
 *   lo devuelve sin tocar (sin pérdida innecesaria de calidad).
 */
export async function comprimirImagen(file: File): Promise<File> {
  if (
    file.size <= SKIP_COMPRESS_UNDER_KB * 1024 ||
    !file.type.startsWith('image/')
  ) return file

  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload  = () => resolve(i)
      i.onerror = reject
      i.src     = url
    })

    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
    const w     = Math.max(1, Math.round(img.width  * scale))
    const h     = Math.max(1, Math.round(img.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width  = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, w, h)

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    )
    if (!blob || blob.size >= file.size) return file

    const base = file.name.replace(/\.[^.]+$/, '')
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(url)
  }
}