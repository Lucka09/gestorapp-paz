// functions/src/cupones/parseCupon.ts
import type { CuponInfraccion } from '../cupon_types'

export interface CuponParseado {
  nroActa?: string
  fechaHechoISO?: string
  marca?: string
  modelo?: string
  serieOriginal?: string
  importeNeto?: number
  cantidadUF?: number
  valorUF?: number
  fechaVencimiento?: string
  nroExpediente?: string
}

function limpiar(texto: string): string {
  return texto.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function extraer(texto: string, patron: RegExp): string | undefined {
  const m = texto.match(patron)
  return m ? m[1].trim() : undefined
}

function aNumero(s: string | undefined): number | undefined {
  if (!s) return undefined
  const limpio = s.replace(/\./g, '').replace(',', '.')
  const n = Number(limpio)
  return Number.isFinite(n) ? n : undefined
}

function fechaArgAISO(s: string | undefined): string | undefined {
  if (!s) return undefined
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return undefined
  return `${m[3]}-${m[2]}-${m[1]}`
}

export function parseCuponPDF(texto: string): CuponParseado {
  const t = limpiar(texto)

  const nroActa =
    extraer(t, /Acta\s*(?:N[°º.]?\s*)?(:?\d{2}-\d{3}-\d{8}-\d(?:-\d{2})?)/i) ??
    extraer(t, /(\d{2}-\d{3}-\d{8}-\d(?:-\d{2})?)/)

  const serieOriginal = extraer(t, /Nro\.?\s*de\s*Serie:?\s*([A-Z0-9_\-\/\s]{3,})/i)
  const marca = extraer(t, /(?:Equipo\s+)?Marca:?\s*([A-ZÁÉÍÓÚÑ0-9\s\-\.]+?)(?=\s+Nro\.?\s*de\s*Serie)/i)
  const modelo = extraer(t, /Modelo:?\s*([A-ZÁÉÍÓÚÑ0-9\s\-\.,]+?)(?=\s+Descripci[oó]n|\s*$)/i)

  const fechaHecho =
    extraer(t, /Fecha\s*(?:del\s*hecho|de\s*la\s*infracci[oó]n|cometida):?\s*(\d{2}\/\d{2}\/\d{4})/i) ??
    extraer(t, /(\d{2}\/\d{2}\/\d{4})/)

  const importeNeto = aNumero(extraer(t, /IMPORTE\s*(?:NETO\s*)?(?:A\s*PAGAR)?:?\s*\$?\s*([\d\.,]+)/i))
  const valorUF = aNumero(extraer(t, /VALOR\s*UF:?\s*\$?\s*([\d\.,]+)/i))
  const cantidadUF = aNumero(extraer(t, /CANTIDAD\s*UF:?\s*([\d\.,]+)/i))
  const fechaVencimiento = fechaArgAISO(extraer(t, /(?:FECHA\s+DE\s+)?VENCIMIENTO:?\s*(\d{2}\/\d{2}\/\d{4})/i))
  const nroExpediente = extraer(t, /(?:Expediente|Causa|N[°º]\s*de\s*causa):?\s*([A-Z0-9\-\/\s]+)/i)

  return {
    nroActa,
    fechaHechoISO: fechaArgAISO(fechaHecho),
    marca: marca?.replace(/\s+/g, ' ').trim(),
    modelo: modelo?.replace(/\s+/g, ' ').trim(),
    serieOriginal: serieOriginal?.replace(/\s+/g, ' ').trim(),
    importeNeto,
    cantidadUF,
    valorUF,
    fechaVencimiento,
    nroExpediente,
  }
}

export function parseResultADocFields(p: CuponParseado): Partial<CuponInfraccion> {
  return {
    nroActa: p.nroActa,
    fechaHechoISO: p.fechaHechoISO,
    marca: p.marca,
    modelo: p.modelo,
    serieOriginal: p.serieOriginal,
    importeNeto: p.importeNeto,
    cantidadUF: p.cantidadUF,
    valorUF: p.valorUF,
    fechaVencimiento: p.fechaVencimiento,
  }
}