// src/hooks/useCierreMensual.ts
// ─── HOOK DE CIERRE MENSUAL ───────────────────────────────────────────────────
// Gestiona el ciclo de vida del cierre contable y de premios.
//
// Lógica de períodos:
//   • El "período activo" siempre es el mes calendario corriente.
//   • Si existe un documento en cierresMensuales para ese mes → el mes está cerrado.
//   • Al cerrar el mes: se guarda snapshot, tramites y honorarios del período.
//   • El primer día del mes nuevo, usePremios recibe periodoInicio del mes nuevo → parte en 0.
//   • Los datos históricos siempre quedan accesibles en la colección.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDocs, query, where, orderBy } from 'firebase/firestore'
import { tramitesCol } from '@/lib/firestore/collections'
import { useGestoriaId, useGestoria } from '@/context/GestoriaContext'
import { useAuth } from '@/hooks/useAuth'
import { usePermisos } from '@/hooks/usePermisos'
import {
  getCierreMensual, getCierresGestoria, crearCierreMensual,
  periodoDesde, buildCierreId,
  type CierreMensual, type SnapshotPremiosAsesor,
} from '@/lib/firestore/cierresMensuales'
import { usePremios } from '@/hooks/usePremios'
import toast from 'react-hot-toast'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const MESES_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

/** Retorna { anio, mes } del mes anterior al actual */
function mesPasado(): { anio: number; mes: number } {
  const hoy  = new Date()
  const mes  = hoy.getMonth() === 0 ? 11 : hoy.getMonth() - 1
  const anio = hoy.getMonth() === 0 ? hoy.getFullYear() - 1 : hoy.getFullYear()
  return { anio, mes }
}

/** Retorna { anio, mes } del mes actual */
function mesActual(): { anio: number; mes: number } {
  const hoy = new Date()
  return { anio: hoy.getFullYear(), mes: hoy.getMonth() }
}

// ─── HOOK PRINCIPAL ───────────────────────────────────────────────────────────

export function useCierreMensual() {
  const gestoriaId     = useGestoriaId()
  const { nombreComercial } = useGestoria()
  const { user }       = useAuth()
  const { puede }      = usePermisos()
  const queryClient    = useQueryClient()
  const puedeGestionar = puede('verReportes')   // propietario + admin_gral

  // ── Período pendiente de cierre: siempre el mes anterior ─────────────────
  const { anio: anioPend, mes: mesPend } = mesPasado()
  const idPend = buildCierreId(gestoriaId, anioPend, mesPend)

  // ── ¿Está cerrado el mes anterior? ───────────────────────────────────────
  const {
    data:    cierrePendiente,
    isLoading: loadingPendiente,
    refetch: refetchPendiente,
  } = useQuery({
    queryKey: ['cierre', idPend],
    queryFn:  async () => {
      try { return await getCierreMensual(gestoriaId, anioPend, mesPend) }
      catch { return null }  // 403 si las reglas no están desplegadas aún
    },
    enabled:  !!gestoriaId && puedeGestionar,
    staleTime: 1000 * 60 * 5,
  })

  const mesCerrado = !!cierrePendiente

  // ── Historial de cierres ──────────────────────────────────────────────────
  const {
    data:    historial = [],
    isLoading: loadingHist,
    refetch: refetchHist,
  } = useQuery({
    queryKey: ['cierres', gestoriaId],
    queryFn:  async () => {
      try { return await getCierresGestoria(gestoriaId) }
      catch { return [] }  // 403 si las reglas no están desplegadas aún
    },
    enabled:  !!gestoriaId && puedeGestionar,
    staleTime: 1000 * 60 * 10,
  })

  // ── Premios del asesor comercial (para snapshot) ──────────────────────────
  // Buscamos el UID del asesor_comercial de esta gestoría
  const [asesorUid, setAsesorUid] = useState<string | undefined>()
  const { data: premiosData } = usePremios(asesorUid)

  useEffect(() => {
    if (!gestoriaId) return
    // Obtener el uid del asesor_comercial
    import('@/lib/firebase').then(({ db }) => {
      import('firebase/firestore').then(({ collection, query: q, where: w, getDocs: gd }) => {
        gd(q(
          collection(db, 'users'),
          w('gestoriaId', '==', gestoriaId),
          w('rol', '==', 'asesor_comercial'),
          w('activo', '==', true),
        )).then(snap => {
          if (!snap.empty) setAsesorUid(snap.docs[0].id)
        }).catch(() => {})
      })
    })
  }, [gestoriaId])

  // ── Mutación: ejecutar el cierre ──────────────────────────────────────────
  const [notas, setNotas] = useState('')
  const [cerrando, setCerrando] = useState(false)

  const ejecutarCierre = useCallback(async () => {
    if (!gestoriaId || !user) return
    setCerrando(true)
    try {
      // 1. Obtener tramites del período pendiente para las métricas
      const { inicio, fin } = periodoDesde(anioPend, mesPend)
      const snapTram = await getDocs(query(
        tramitesCol,
        where('gestoriaId', '==', gestoriaId),
      ))
      const tramitesPeriodo = snapTram.docs
        .map(d => ({ ...d.data(), id: d.id }))
        .filter(t => {
          const f = (t as any).creadoEn?.toDate?.()
          return f && f >= inicio && f <= fin
        })

      const totalTramites   = tramitesPeriodo.length
      const totalHonorarios = tramitesPeriodo.reduce((s, t: any) => s + (t.honorarios ?? 0), 0)
      const totalCobrado    = tramitesPeriodo
        .filter((t: any) => t.pagado && (t.fechaPago?.toDate?.() ?? null) >= inicio)
        .reduce((s, t: any) => s + (t.honorarios ?? 0), 0)

      // 2. Construir snapshot de premios del asesor
      const snapshot: SnapshotPremiosAsesor[] = []
      if (premiosData && asesorUid) {
        const nombreAsesor = (await import('@/lib/firebase').then(({ db }) =>
          import('firebase/firestore').then(({ doc: d, getDoc: gd }) =>
            gd(d(db, 'users', asesorUid))
          )
        )).data()
        snapshot.push({
          uid:                  asesorUid,
          nombre:               `${(nombreAsesor as any)?.nombre ?? ''} ${(nombreAsesor as any)?.apellido ?? ''}`.trim(),
          tramitesCalificantes: premiosData.tramitesCalificantes,
          premiosA_ganados:     premiosData.premiosA_ganados,
          premiosA_pesos:       premiosData.premiosA_pesos,
          facturacionMultas:    premiosData.facturacionMultas,
          hitosAlcanzados:      premiosData.hitosAlcanzados,
          premiosB_pesos:       premiosData.premiosB_pesos,
          totalTramitesCreados: premiosData.totalTramitesCreados,
          totalMultasCreadas:   premiosData.totalMultasCreadas,
        })
      }

      // 3. Guardar el cierre
      await crearCierreMensual({
        gestoriaId,
        anio:            anioPend,
        mes:             mesPend,
        cerradoPor:      user.uid,
        cerradoPorNombre: `${user.nombre} ${user.apellido}`.trim(),
        snapshotPremios: snapshot,
        totalTramites,
        totalHonorarios,
        totalCobrado,
        notas: notas.trim() || undefined,
      })

      toast.success(`✅ Cierre de ${MESES_ES[mesPend]} ${anioPend} registrado`)
      setNotas('')
      queryClient.invalidateQueries({ queryKey: ['cierre', idPend] })
      queryClient.invalidateQueries({ queryKey: ['cierres', gestoriaId] })
      queryClient.invalidateQueries({ queryKey: ['premios'] })
      await refetchPendiente()
      await refetchHist()
    } catch (err: any) {
      // ─── DEBUG TEMPORAL ───────────────────────────────────────────────────
      console.error('[useCierreMensual] Error completo:', err)
      console.error('[useCierreMensual] Código:', err?.code)
      console.error('[useCierreMensual] Mensaje:', err?.message)
      // ────────────────────────────────────────────────────────────────────
      toast.error(err?.message ?? 'Error al registrar el cierre')
    } finally {
      setCerrando(false)
    }
  }, [gestoriaId, user, anioPend, mesPend, premiosData, asesorUid, notas, idPend, queryClient, refetchPendiente, refetchHist])

  return {
    // Estado
    puedeGestionar,
    mesCerrado,
    cerrando,
    loadingPendiente,
    loadingHist,
    notas,
    setNotas,

    // Datos del período pendiente
    anioPend,
    mesPend,
    mesPendLabel: `${MESES_ES[mesPend]} ${anioPend}`,
    cierrePendiente,

    // Datos del período activo (el mes corriente — para usePremios)
    mesActual: mesActual(),

    // Historial
    historial,

    // Acción
    ejecutarCierre,
  }
}