// src/hooks/useTorreControl.ts
// ─── HOOK PRINCIPAL — TORRE DE CONTROL ────────────────────────────────────────
// Combina tramites existentes + workflows + cálculo de alertas.
// No reemplaza useTramites — lo consume y enriquece.

import { useState, useEffect, useMemo } from 'react'
import { useGestoriaId }    from '@/context/GestoriaContext'
import { useAuthStore }     from '@/store/authStore'
import { useTramites }      from '@/hooks/useTramites'
import { usePermisos }     from '@/hooks/usePermisos'
import { getWorkflowsGestoria, subscribeWorkflowsGestoria } from '@/lib/firestore/inscripcionworkflow'
import type { Tramite }     from '@/types'
import type {
  InscripcionWorkflow, TramiteEnriquecido, AlertaTorre,
  NivelAlerta, EstadisticasMandatario,
} from '@/torre_types'

const HIDDEN_POLL_MS = 60_000

// ─── HOOK ─────────────────────────────────────────────────────────────────────

export function useTorreControl() {
  const gestoriaId          = useGestoriaId()
  const { user }   = useAuthStore()
  const { puede }  = usePermisos()
  const soloPropia = puede('verTorreSoloPropia')
  const verTodo    = puede('verTorreCompleta')
  const { tramites, loading: loadingTramites } = useTramites({ whenHidden: 'poll', hiddenPollMs: HIDDEN_POLL_MS })

  const [workflows, setWorkflows]           = useState<InscripcionWorkflow[]>([])
  const [loadingWorkflows, setLoadingWork]  = useState(true)
  const [isPageVisible, setIsPageVisible]   = useState(
    typeof document === 'undefined' ? true : !document.hidden
  )

  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVisibilityChange = () => setIsPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  useEffect(() => {
    if (!gestoriaId) return

    if (!isPageVisible) {
      let disposed = false
      const cargar = async () => {
        try {
          const data = await getWorkflowsGestoria(gestoriaId)
          if (!disposed) {
            setWorkflows(data)
            setLoadingWork(false)
          }
        } catch {
          if (!disposed) setLoadingWork(false)
        }
      }

      void cargar()
      const intervalId = window.setInterval(() => {
        void cargar()
      }, HIDDEN_POLL_MS)

      return () => {
        disposed = true
        window.clearInterval(intervalId)
      }
    }

    const unsub = subscribeWorkflowsGestoria(gestoriaId, data => {
      setWorkflows(data)
      setLoadingWork(false)
    })
    return () => unsub()
  }, [gestoriaId, isPageVisible])

  const workflowMap = useMemo(() => {
    const map = new Map<string, InscripcionWorkflow>()
    workflows.forEach(w => map.set(w.tramiteId, w))
    return map
  }, [workflows])

  // Filtro por visibilidad según permiso del rol
  const tramitesVisibles = useMemo(() => {
    const base = tramites.filter(t => t.estado !== 'cancelado')
    // Propietario y Admin ven todo
    if (verTodo) return base
    // Gestor/Mandatario solo ve los suyos
    if (soloPropia) {
      const uid = user?.uid
      return base.filter(t => t.asignadoA === uid || t.creadoPor === uid)
    }
    return base
  }, [tramites, user])

  // ── Enriquecimiento: tramites + alertLevel + alertas ──────────────────────

  const tramitesEnriquecidos = useMemo<TramiteEnriquecido[]>(() => {
    return tramitesVisibles
      .map(t => {
        const workflow  = t.tipo === 'inscripcion_inicial' ? workflowMap.get(t.id) : undefined
        const alertas   = calcularAlertas(t, workflow)
        const alertLevel = alertas.length > 0
          ? nivelMasAlto(alertas.map(a => a.nivel))
          : 'info'

        const diasSinMovimiento = calcularDiasSinMovimiento(t)
        const diasHastaChapa    = workflow?.paso6
          ? calcularDiasHastaChapa(workflow.paso6.fechaEstimadaRetiro.toDate())
          : undefined

        return {
          ...t,
          alertLevel,
          alertas,
          workflow,
          diasSinMovimiento,
          diasHastaChapa,
        } as TramiteEnriquecido
      })
      .sort((a, b) => nivelPeso(b.alertLevel) - nivelPeso(a.alertLevel))
  }, [tramitesVisibles, workflowMap])

  // ── KPIs derivados ────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const activos       = tramitesEnriquecidos.length
    const criticos      = tramitesEnriquecidos.filter(t => t.alertLevel === 'critico').length
    const rojos         = tramitesEnriquecidos.filter(t => t.alertLevel === 'rojo').length
    const demorados     = tramitesEnriquecidos.filter(t => t.alertLevel === 'naranja' || t.alertLevel === 'amarillo').length
    const inscripciones = tramitesEnriquecidos.filter(t => t.tipo === 'inscripcion_inicial').length
    const transferencias = tramitesEnriquecidos.filter(t => t.tipo === 'transferencia').length
    const multas        = tramitesEnriquecidos.filter(t => t.tipo === 'descargo_multa').length
    const chapasPendientes = tramitesEnriquecidos.filter(
      t => t.workflow?.pasoActual === 6 && t.workflow.paso6?.estado !== 'retirada'
    ).length

    return {
      activos, criticos, rojos, demorados,
      inscripciones, transferencias, multas, chapasPendientes,
    }
  }, [tramitesEnriquecidos])

  // ── Alertas activas globales ───────────────────────────────────────────────

  const alertasActivas = useMemo<AlertaTorre[]>(() => {
    return tramitesEnriquecidos
      .flatMap(t => t.alertas)
      .filter(a => !a.reconocida)
      .sort((a, b) => nivelPeso(b.nivel) - nivelPeso(a.nivel))
  }, [tramitesEnriquecidos])

  // ── Etapas del pipeline para inscripciones ────────────────────────────────

  const etapasPipeline = useMemo(() => {
    const inscripciones = tramitesEnriquecidos.filter(t => t.tipo === 'inscripcion_inicial')
    const conteo: Record<number, number> = {}
    inscripciones.forEach(t => {
      const paso = t.workflow?.pasoActual ?? 1
      conteo[paso] = (conteo[paso] ?? 0) + 1
    })
    return conteo
  }, [tramitesEnriquecidos])

  const loading = loadingTramites || loadingWorkflows

  return {
    tramitesEnriquecidos,
    kpis,
    alertasActivas,
    etapasPipeline,
    loading,
  }
}

// ─── HOOK: ESTADÍSTICAS POR MANDATARIO ───────────────────────────────────────

export function useEstadisticasMandatarios(
  tramitesEnriquecidos: TramiteEnriquecido[],
  gestores: Array<{ uid: string; nombre: string; apellido?: string }> = [],
): EstadisticasMandatario[] {
  return useMemo(() => {
    const mapa = new Map<string, {
      uid: string; nombre: string; apellido: string
      tramitesActivos: number; criticos: number; demorados: number; bloqueados: number
    }>()

    gestores.forEach(g => {
      mapa.set(g.uid, {
        uid: g.uid,
        nombre: g.nombre,
        apellido: g.apellido ?? '',
        tramitesActivos: 0,
        criticos: 0,
        demorados: 0,
        bloqueados: 0,
      })
    })

    tramitesEnriquecidos.forEach(t => {
      if (!t.asignadoA) return
      const key = t.asignadoA
      if (!mapa.has(key)) {
        mapa.set(key, {
          uid: key, nombre: t.asignadoA, apellido: '',
          tramitesActivos: 0, criticos: 0, demorados: 0, bloqueados: 0,
        })
      }
      const stats = mapa.get(key)!
      stats.tramitesActivos++
      if (t.alertLevel === 'critico') stats.criticos++
      if (['amarillo', 'naranja'].includes(t.alertLevel)) stats.demorados++
      if (t.estado === 'documentacion_requerida') stats.bloqueados++
    })

    return Array.from(mapa.values()).map(s => ({
      ...s,
      finalizadosSemana: 0,  // se complementa con query adicional
      eficiencia: calcularEficiencia(s),
      estadoCarga: calcularEstadoCarga(s.tramitesActivos),
    }))
  }, [tramitesEnriquecidos, gestores])

  // Performance de gestores — solo visible para propietario/admin
  // Para gestores individuales se omite para no exponer datos de compañeros
}

// ─── LÓGICA DE ALERTAS ────────────────────────────────────────────────────────

function calcularAlertas(
  tramite:  Tramite,
  workflow: InscripcionWorkflow | undefined,
): AlertaTorre[] {
  const alertas: AlertaTorre[] = []
  const ahora   = new Date()

  // ── Alerta: sin movimiento ────────────────────────────────────────────────
  const ultimaAct = tramite.actualizadoEn?.toDate?.() ?? tramite.creadoEn?.toDate?.() ?? ahora
  const horasSinMov = (ahora.getTime() - ultimaAct.getTime()) / 3_600_000

  if (horasSinMov > 120) {    // > 5 días
    alertas.push(crearAlerta(tramite, 'sin_movimiento_5d', 'rojo',
      'Sin movimiento hace 5+ días',
      `El trámite lleva ${Math.floor(horasSinMov / 24)} días sin actualizarse.`))
  } else if (horasSinMov > 72) {
    alertas.push(crearAlerta(tramite, 'sin_movimiento_72h', 'naranja',
      'Sin movimiento 72hs',
      `El trámite lleva más de 3 días sin actualizarse.`))
  } else if (horasSinMov > 48) {
    alertas.push(crearAlerta(tramite, 'sin_movimiento_48h', 'amarillo',
      'Sin movimiento 48hs',
      `El trámite lleva más de 2 días sin actualizarse.`))
  }

  // ── Alertas del Paso 6: Chapa Patente ────────────────────────────────────
  if (workflow?.paso6 && workflow.paso6.estado !== 'retirada') {
    const fechaRetiro = workflow.paso6.fechaEstimadaRetiro.toDate()
    const diasHasta   = calcularDiasHastaChapa(fechaRetiro)

    if (diasHasta <= 0) {
      const nivel = diasHasta < -1 ? 'critico' : 'critico'
      alertas.push(crearAlerta(tramite, 'chapa_hoy', nivel,
        'Chapa/Patente: hoy es el día de retiro',
        `Hoy es la fecha estimada de retiro de la chapa. El gestor debe confirmar.`))
    } else if (diasHasta <= 1) {
      alertas.push(crearAlerta(tramite, 'chapa_24h', 'rojo',
        'Chapa/Patente: vence mañana',
        `Mañana vence el plazo de retiro de chapa. Registro: ${workflow.paso6.registroUbicacion}`))
    } else if (diasHasta <= 3) {
      alertas.push(crearAlerta(tramite, 'chapa_3d', 'naranja',
        `Chapa/Patente: retiro en ${diasHasta} días`,
        `Coordinar retiro de chapa en los próximos días. Registro: ${workflow.paso6.registroUbicacion}`))
    } else if (diasHasta <= 5) {
      alertas.push(crearAlerta(tramite, 'chapa_5d', 'amarillo',
        `Chapa/Patente: retiro en ${diasHasta} días`,
        `Se acerca la fecha de retiro de chapa.`))
    } else if (diasHasta <= 7) {
      alertas.push(crearAlerta(tramite, 'chapa_7d', 'amarillo',
        `Chapa/Patente: retiro en ${diasHasta} días`,
        `Recordatorio: chapa disponible en ${diasHasta} días.`))
    }

    if (workflow.paso6.estado === 'atrasada') {
      alertas.push(crearAlerta(tramite, 'chapa_atrasada', 'critico',
        'Chapa/Patente: plazo vencido sin confirmar',
        `El gestor no confirmó el retiro en la fecha asignada. Requiere intervención.`))
    }

    if (workflow.paso6.estado === 'postergada') {
      const nroIntento = workflow.paso6.intentos.length
      alertas.push(crearAlerta(tramite, 'chapa_postergada', 'naranja',
        `Chapa/Patente: postergada (intento ${nroIntento})`,
        `El gestor no pudo retirar la chapa. Nueva fecha asignada.`))
    }
  }

  // ── Alerta: trámite observado sin subsanar ────────────────────────────────
  if (tramite.estado === 'documentacion_requerida') {
    const horasEnEstado = horasSinMov
    if (horasEnEstado > 48) {
      alertas.push(crearAlerta(tramite, 'tramite_observado', 'rojo',
        'Documentación requerida sin resolver',
        `El trámite tiene documentación pendiente hace más de 48hs.`))
    }
  }

  // ── Alerta: fotos con flag de admin ──────────────────────────────────────
  if (workflow) {
    const tieneFotos = [workflow.paso2, workflow.paso3, workflow.paso4, workflow.paso5]
    const hayFlags   = tieneFotos.some(paso =>
      paso && 'fotos' in paso && Array.isArray(paso.fotos) &&
      paso.fotos.some((f: { adminFlag?: boolean }) => f.adminFlag)
    )
    if (hayFlags) {
      alertas.push(crearAlerta(tramite, 'foto_con_flag_admin', 'amarillo',
        'Fotos con revisión solicitada',
        `El admin solicitó resubir una o más fotos. Esperando acción del gestor.`))
    }
  }

  return alertas
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function crearAlerta(
  tramite: Tramite,
  tipo:    AlertaTorre['tipo'],
  nivel:   NivelAlerta,
  titulo:  string,
  mensaje: string,
): AlertaTorre {
  return {
    id:          `${tramite.id}_${tipo}`,
    tramiteId:   tramite.id,
    gestoriaId:  tramite.gestoriaId,
    tipo,
    nivel,
    titulo,
    mensaje,
    reconocida:  false,
    creadaEn:    { toDate: () => new Date() } as ReturnType<typeof import('firebase/firestore').Timestamp.now>,
  }
}

function calcularDiasSinMovimiento(tramite: Tramite): number {
  const ahora  = new Date()
  const ultima = tramite.actualizadoEn?.toDate?.() ?? tramite.creadoEn?.toDate?.() ?? ahora
  return (ahora.getTime() - ultima.getTime()) / 86_400_000
}

function calcularDiasHastaChapa(fecha: Date): number {
  const ahora = new Date()
  ahora.setHours(0, 0, 0, 0)
  fecha.setHours(0, 0, 0, 0)
  return Math.round((fecha.getTime() - ahora.getTime()) / 86_400_000)
}

const NIVEL_PESO: Record<NivelAlerta, number> = {
  info: 0, amarillo: 1, naranja: 2, rojo: 3, critico: 4,
}

function nivelPeso(nivel: NivelAlerta): number {
  return NIVEL_PESO[nivel] ?? 0
}

function nivelMasAlto(niveles: NivelAlerta[]): NivelAlerta {
  return niveles.reduce((max, n) => nivelPeso(n) > nivelPeso(max) ? n : max, 'info' as NivelAlerta)
}

function calcularEficiencia(stats: { criticos: number; demorados: number; tramitesActivos: number }): number {
  if (stats.tramitesActivos === 0) return 100
  const penalizacion = (stats.criticos * 3 + stats.demorados * 1) / stats.tramitesActivos * 100
  return Math.max(0, Math.round(100 - penalizacion))
}

function calcularEstadoCarga(activos: number): 'ok' | 'atencion' | 'sobrecarga' {
  if (activos > 28) return 'sobrecarga'
  if (activos > 18) return 'atencion'
  return 'ok'
}