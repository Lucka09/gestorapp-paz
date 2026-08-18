// functions/src/automatizaciones/condiciones.ts
// Evaluador de condiciones (AND) + plantillas con placeholders {nombre}, {patente}…

export interface Condicion {
  campo: string
  operador: string
  valor?: unknown
}

export function resolverCampo(obj: any, path: string): any {
  return path.split('.').reduce((acc, k) => (acc == null ? null : acc[k]), obj)
}

export function evaluarCondiciones(condiciones: Condicion[], contexto: any): boolean {
  if (!condiciones || condiciones.length === 0) return true
  return condiciones.every(c => evaluarUna(c, contexto))
}

function evaluarUna(c: Condicion, ctx: any): boolean {
  const real = resolverCampo(ctx, c.campo)
  switch (c.operador) {
    case '==':         return real === c.valor
    case '!=':         return real !== c.valor
    case 'in':         return Array.isArray(c.valor) && (c.valor as any[]).includes(real)
    case 'not_in':     return Array.isArray(c.valor) && !(c.valor as any[]).includes(real)
    case '>':          return Number(real) >  Number(c.valor)
    case '<':          return Number(real) <  Number(c.valor)
    case '>=':         return Number(real) >= Number(c.valor)
    case '<=':         return Number(real) <= Number(c.valor)
    case 'contains':   return String(real ?? '').toLowerCase().includes(String(c.valor).toLowerCase())
    case 'starts_with':return String(real ?? '').toLowerCase().startsWith(String(c.valor).toLowerCase())
    case 'exists':     return real !== undefined && real !== null && real !== ''
    case 'not_exists': return real === undefined || real === null || real === ''
    default:           return false
  }
}

export function rellenarPlantilla(template: string, contexto: any): string {
  return String(template).replace(/\{([a-zA-Z0-9_.]+)\}/g, (_, path) => {
    const v = resolverCampo(contexto, path)
    return v == null ? '' : String(v)
  })
}