// ─── VISIBILIDAD POR ASIGNACIÓN (Leads / Pipeline) ──────────────────────────
// Cada secretario ve lo suyo. Admins/CEO ven todo y pueden filtrar por persona.
import type { Rol } from '@/types'

export const ROLES_VEN_TODO: Rol[] = ['propietario', 'admin', 'admin_gral', 'superadmin']

export function puedeVerTodo(rol?: string | null): boolean {
  return !!rol && (ROLES_VEN_TODO as string[]).includes(rol)
}

/** 'mios' | 'sin_asignar' | 'todos' | 'uid:<uid>' (este último solo admins) */
export type Vista = 'mios' | 'sin_asignar' | 'todos' | `uid:${string}`

export function vistaInicial(rol?: string | null): Vista {
  return puedeVerTodo(rol) ? 'todos' : 'mios'
}

export function filtrarPorVista<T extends { asignadoA?: string | null }>(
  items: T[], vista: Vista, miUid: string, verTodo: boolean, permitirPool = true,
): T[] {
  // Defensa: un secretario nunca puede ver lo de otro aunque cambie la vista.
  let v: Vista = vista
  if (!verTodo && !(v === 'mios' || (v === 'sin_asignar' && permitirPool))) v = 'mios'

  if (v === 'todos')       return items
  if (v === 'mios')        return items.filter(i => i.asignadoA === miUid)
  if (v === 'sin_asignar') return items.filter(i => !i.asignadoA)
  const uid = v.slice(4)
  return items.filter(i => i.asignadoA === uid)
}

export function contarPorVista<T extends { asignadoA?: string | null }>(items: T[], miUid: string) {
  const porUid: Record<string, number> = {}
  let sinAsignar = 0
  for (const i of items) {
    if (!i.asignadoA) sinAsignar++
    else porUid[i.asignadoA] = (porUid[i.asignadoA] ?? 0) + 1
  }
  return { todos: items.length, mios: porUid[miUid] ?? 0, sin_asignar: sinAsignar, porUid }
}