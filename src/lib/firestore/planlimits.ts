// ─────────────────────────────────────────────────────────────────────────────
// PLAN LIMITS — GestorApp
// Validación de límites de plan antes de crear clientes o usuarios.
// Usa getCountFromServer (agregación) → costo de 1 lectura sin importar
// cuántos documentos haya en la colección.
// ─────────────────────────────────────────────────────────────────────────────

import {
  getCountFromServer, query, where,
} from 'firebase/firestore'
import { clientesCol, usersCol } from './collections'
import type { PlanGestoria } from '@/types'
import { PLAN_CONFIG } from '@/types'

// ─── ERROR TIPADO ─────────────────────────────────────────────────────────────
//
// Permite distinguir un error de límite de plan de cualquier otro error
// de Firestore, y mostrar un mensaje de upgrade apropiado en la UI.

export class LimitePlanError extends Error {
  constructor(
    public readonly tipo:    'clientes' | 'usuarios',
    public readonly actual:  number,
    public readonly limite:  number,
    public readonly plan:    PlanGestoria,
  ) {
    super(`LIMITE_PLAN_${tipo.toUpperCase()}`)
    this.name = 'LimitePlanError'
  }

  /** Texto de upgrade listo para mostrar en un toast o modal */
  get mensajeUpgrade(): string {
    const sigPlan = this.plan === 'starter'
      ? 'Profesional'
      : this.plan === 'profesional'
      ? 'Enterprise'
      : null

    const base = this.tipo === 'clientes'
      ? `Tu plan ${PLAN_CONFIG[this.plan].label} permite hasta ${this.limite} clientes.`
      : `Tu plan ${PLAN_CONFIG[this.plan].label} permite hasta ${this.limite} usuarios activos.`

    return sigPlan
      ? `${base} Actualizá al plan ${sigPlan} para continuar.`
      : `${base} Contactá a soporte para ampliar tu plan.`
  }
}

// ─── CONTEOS (1 lectura agregación cada uno) ──────────────────────────────────

export async function contarClientes(gestoriaId: string): Promise<number> {
  const snap = await getCountFromServer(
    query(clientesCol, where('gestoriaId', '==', gestoriaId))
  )
  return snap.data().count
}

export async function contarUsuariosActivos(gestoriaId: string): Promise<number> {
  const snap = await getCountFromServer(
    query(
      usersCol,
      where('gestoriaId', '==', gestoriaId),
      where('rol',    'in', ['propietario', 'admin_gral', 'admin', 'vendedor', 'operador', 'gestor', 'asesor_comercial', 'asistente_multas']),
      where('activo', '==', true),
    )
  )
  return snap.data().count
}

// ─── VERIFICACIONES (lanzan LimitePlanError si se superó el límite) ───────────

export async function verificarLimiteClientes(
  gestoriaId:  string,
  maxClientes: number,
  plan:        PlanGestoria,
): Promise<void> {
  const actual = await contarClientes(gestoriaId)
  if (actual >= maxClientes) {
    throw new LimitePlanError('clientes', actual, maxClientes, plan)
  }
}

export async function verificarLimiteUsuarios(
  gestoriaId:  string,
  maxUsuarios: number,
  plan:        PlanGestoria,
): Promise<void> {
  const actual = await contarUsuariosActivos(gestoriaId)
  if (actual >= maxUsuarios) {
    throw new LimitePlanError('usuarios', actual, maxUsuarios, plan)
  }
}