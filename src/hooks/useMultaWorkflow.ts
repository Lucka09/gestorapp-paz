// src/hooks/useMultaWorkflow.ts
import { useState, useEffect, useCallback } from 'react'
import { onSnapshot }     from 'firebase/firestore'
import { useAuthStore }   from '@/store/authStore'
import { useGestoriaId }  from '@/context/GestoriaContext'
import { Timestamp }      from 'firebase/firestore'
import {
  multaWorkflowDoc,
  crearMultaWorkflow,
  confirmarPaso1Multa,  confirmarPaso2Multa,
  confirmarPreRevision, resolverRebote,
  resolverEsperaMesaAyuda,
  confirmarPaso4Multa,  confirmarPaso5Multa,
  confirmarPaso6Multa,  confirmarPaso7Multa,
  asignarAdminMulta,
} from '@/lib/firestore/MultaWorwflow'
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage'
import { storage }         from '@/lib/firebase'
import type {
  MultaWorkflow, MultaPaso1Data, MultaPaso2Data,
  MultaPaso3Data, MultaReboteResolucion,
  MultaPaso4Data, MultaPaso5Data, MultaPaso6Data, MultaPaso7Data,
} from '@/multa_types'
import type { FotoWorkflow } from '@/torre_types'
import toast from 'react-hot-toast'

// ─── TIPOS LOCALES ────────────────────────────────────────────────────────────

export interface FotoLocal {
  file:        File
  preview:     string
  estado:      'pendiente' | 'subiendo' | 'ok' | 'error'
  progreso:    number
  fotoRemota?: FotoWorkflow
}

// ─── UPLOAD ───────────────────────────────────────────────────────────────────

async function subirFoto(
  file:       File,
  path:       string,
  onProgress: (p: number) => void,
): Promise<FotoWorkflow> {
  return new Promise((resolve, reject) => {
    const sRef   = storageRef(storage, path)
    const upload = uploadBytesResumable(sRef, file)
    upload.on(
      'state_changed',
      snap => onProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
      reject,
      async () => {
        const url = await getDownloadURL(upload.snapshot.ref)
        resolve({
          url,
          storageRef:  path,
          nombre:      file.name,
          tamanoKb:    Math.round(file.size / 1024),
          subidaPor:   '',   // se sobreescribe en el llamador con user.uid
          subidaEn:    Timestamp.now(),
          validadaOk:  true,
        })
      },
    )
  })
}

// ─── HOOK PRINCIPAL ───────────────────────────────────────────────────────────

export function useMultaWorkflow(tramiteId: string) {
  const { user }      = useAuthStore()
  const gestoriaId    = useGestoriaId()
  const [workflow, setWorkflow] = useState<MultaWorkflow | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [progreso, setProgreso] = useState(0)

  // Suscripción al documento
  useEffect(() => {
    if (!tramiteId) return
    return onSnapshot(
      multaWorkflowDoc(tramiteId),
      snap => {
        setWorkflow(snap.exists() ? { ...snap.data(), id: snap.id } as MultaWorkflow : null)
        setLoading(false)
      },
      err => {
        setError(err.message)
        setLoading(false)
      },
    )
  }, [tramiteId])

  // Auto-crear si no existe
  useEffect(() => {
    if (!tramiteId || !gestoriaId || !user || loading || workflow) return
    crearMultaWorkflow(
      tramiteId, gestoriaId, user.uid,
      `${user.nombre} ${user.apellido}`.trim(),
    ).catch(console.error)
  }, [tramiteId, gestoriaId, user, loading, workflow])

  // Helper para subir múltiples fotos
  const subirFotos = useCallback(async (
    fotos:      Record<string, File | undefined>,
    basePath:   string,
  ): Promise<Record<string, FotoWorkflow | undefined>> => {
    const resultado: Record<string, FotoWorkflow | undefined> = {}
    const entries = Object.entries(fotos).filter(([, f]) => !!f) as [string, File][]
    const total   = entries.length
    let done      = 0

    for (const [campo, file] of entries) {
      const path = `${basePath}/${campo}_${Date.now()}.jpg`
      resultado[campo] = await subirFoto(
        file, path,
        p => setProgreso(Math.round((done / total * 100) + (p / total))),
      )
      done++
      setProgreso(Math.round(done / total * 100))
    }
    return resultado
  }, [])

  // ── PASO 1 ────────────────────────────────────────────────────────────────
  const confirmarPaso1 = useCallback(async (
    campos: Pick<MultaPaso1Data, 'patente' | 'nombreCompleto' | 'dni' | 'fechaTramite' | 'requiereSUATS' | 'observacion'>
  ) => {
    if (!user) return
    setGuardando(true)
    setError(null)
    try {
      await confirmarPaso1Multa(tramiteId, {
        ...campos,
        completadoPor:       user.uid,
        completadoPorNombre: `${user.nombre} ${user.apellido}`.trim(),
      })
      toast.success('Paso 1 completado')
    } catch (e: any) {
      setError(e.message)
      toast.error('Error al guardar')
    } finally {
      setGuardando(false)
    }
  }, [tramiteId, user])

  // ── PASO 2 ────────────────────────────────────────────────────────────────
  const confirmarPaso2 = useCallback(async (
    campos: Omit<MultaPaso2Data, 'completadoPor' | 'completadoPorNombre' | 'completadoEn'>,
    archivos: {
      fotoDniFrente?:    File
      fotoDniDorso?:     File
      fotoCedulaFrente?: File
      fotoCedulaDorso?:  File
      fotoTituloFrente?: File
      fotoTituloDorso?:  File
    }
  ) => {
    if (!user || !gestoriaId) return
    setGuardando(true)
    setError(null)
    setProgreso(0)
    try {
      const basePath = `${gestoriaId}/multas/${tramiteId}/paso2`
      const fotos    = await subirFotos(archivos, basePath)
      await confirmarPaso2Multa(tramiteId, {
        ...campos,
        ...fotos,
        completadoPor:       user.uid,
        completadoPorNombre: `${user.nombre} ${user.apellido}`.trim(),
      } as any)
      toast.success('Documentación guardada')
    } catch (e: any) {
      setError('Error al subir documentos. Verificá tu conexión.')
      toast.error('Error al guardar')
    } finally {
      setGuardando(false)
      setProgreso(0)
    }
  }, [tramiteId, gestoriaId, user, subirFotos])

  // ── PASO 3: Pre-revisión ──────────────────────────────────────────────────
  const confirmarPreRevisionFn = useCallback(async (
    campos: Omit<MultaPaso3Data, 'completadoPor' | 'completadoPorNombre' | 'completadoEn'>
  ) => {
    if (!user || !gestoriaId) return
    setGuardando(true)
    setError(null)
    try {
      await confirmarPreRevision(tramiteId, gestoriaId, {
        ...campos,
        // Asignar rebote al asesor que inició
        rebotadoAUid:    campos.resultado === 'rebotado' ? (workflow?.iniciadoPor ?? '') : undefined,
        rebotadoANombre: campos.resultado === 'rebotado' ? (workflow?.iniciadoPorNombre ?? '') : undefined,
        completadoPor:       user.uid,
        completadoPorNombre: `${user.nombre} ${user.apellido}`.trim(),
      })
      const msgs = {
        ok:          'Pre-revisión aprobada — avanzando a gestión',
        rebotado:    'Trámite rebotado al asesor',
        mesa_ayuda:  'Derivado a mesa de ayuda',
      }
      toast.success(msgs[campos.resultado])
    } catch (e: any) {
      setError(e.message)
      toast.error('Error al guardar')
    } finally {
      setGuardando(false)
    }
  }, [tramiteId, gestoriaId, user, workflow])

  // ── REBOTE: Asesor resuelve ───────────────────────────────────────────────
  const resolverReboteFn = useCallback(async (
    campos: Omit<MultaReboteResolucion, 'resueltoBy' | 'resueltoPorNombre' | 'resueltoEn'>,
    archivos?: { fotoDniInfractorFrente?: File; fotoDniInfractorDorso?: File }
  ) => {
    if (!user || !gestoriaId) return
    setGuardando(true)
    setError(null)
    setProgreso(0)
    try {
      let fotos: Record<string, FotoWorkflow | undefined> = {}
      if (archivos) {
        fotos = await subirFotos(archivos, `${gestoriaId}/multas/${tramiteId}/rebote`)
      }
      await resolverRebote(
        tramiteId, gestoriaId,
        { ...campos, ...fotos, resueltoBy: user.uid, resueltoPorNombre: `${user.nombre} ${user.apellido}`.trim() },
        workflow?.asignadoAdminId,
        workflow?.asignadoAdminNombre,
      )
      toast.success('Documentación enviada al Admin')
    } catch (e: any) {
      setError(e.message)
      toast.error('Error al resolver rebote')
    } finally {
      setGuardando(false)
      setProgreso(0)
    }
  }, [tramiteId, gestoriaId, user, workflow, subirFotos])

  // ── Mesa de ayuda resuelta ────────────────────────────────────────────────
  const resolverMesaAyuda = useCallback(async (observacion?: string) => {
    setGuardando(true)
    try {
      await resolverEsperaMesaAyuda(tramiteId, observacion)
      toast.success('Espera finalizada — continuando gestión')
    } catch {
      toast.error('Error al actualizar estado')
    } finally {
      setGuardando(false)
    }
  }, [tramiteId])

  // ── PASO 4 ────────────────────────────────────────────────────────────────
  const confirmarPaso4 = useCallback(async (
    campos: Omit<MultaPaso4Data, 'completadoPor' | 'completadoPorNombre' | 'completadoEn'>
  ) => {
    if (!user) return
    setGuardando(true)
    setError(null)
    try {
      await confirmarPaso4Multa(tramiteId, {
        ...campos,
        completadoPor:       user.uid,
        completadoPorNombre: `${user.nombre} ${user.apellido}`.trim(),
      })
      toast.success('Borradores listos para cargar')
    } catch (e: any) {
      setError(e.message)
      toast.error('Error al guardar')
    } finally {
      setGuardando(false)
    }
  }, [tramiteId, user])

  // ── PASO 5 ────────────────────────────────────────────────────────────────
  const confirmarPaso5 = useCallback(async (
    campos:   Omit<MultaPaso5Data, 'completadoPor' | 'completadoPorNombre' | 'completadoEn' | 'fotosDescargo'>,
    archivos: File[]
  ) => {
    if (!user || !gestoriaId) return
    setGuardando(true)
    setError(null)
    setProgreso(0)
    try {
      const fotosDescargo: FotoWorkflow[] = []
      for (let i = 0; i < archivos.length; i++) {
        const path = `${gestoriaId}/multas/${tramiteId}/paso5/descargo_${i}_${Date.now()}.jpg`
        const foto = await subirFoto(archivos[i], path, p =>
          setProgreso(Math.round((i / archivos.length * 100) + (p / archivos.length)))
        )
        fotosDescargo.push(foto)
      }
      await confirmarPaso5Multa(tramiteId, {
        ...campos, fotosDescargo,
        completadoPor:       user.uid,
        completadoPorNombre: `${user.nombre} ${user.apellido}`.trim(),
      })
      toast.success('Descargo subido correctamente')
    } catch (e: any) {
      setError('Error al subir el descargo')
      toast.error('Error al subir')
    } finally {
      setGuardando(false)
      setProgreso(0)
    }
  }, [tramiteId, gestoriaId, user])

  // ── PASO 6 ────────────────────────────────────────────────────────────────
  const confirmarPaso6 = useCallback(async (
    campos:   Omit<MultaPaso6Data, 'completadoPor' | 'completadoPorNombre' | 'completadoEn' | 'fotosSuats'>,
    archivos: File[]
  ) => {
    if (!user || !gestoriaId) return
    setGuardando(true)
    setError(null)
    setProgreso(0)
    try {
      const fotosSuats: FotoWorkflow[] = []
      for (let i = 0; i < archivos.length; i++) {
        const path = `${gestoriaId}/multas/${tramiteId}/paso6/suats_${i}_${Date.now()}.jpg`
        const foto = await subirFoto(archivos[i], path, p =>
          setProgreso(Math.round((i / archivos.length * 100) + (p / archivos.length)))
        )
        fotosSuats.push(foto)
      }
      await confirmarPaso6Multa(tramiteId, {
        ...campos,
        fotosSuats: archivos.length > 0 ? fotosSuats : undefined,
        completadoPor:       user.uid,
        completadoPorNombre: `${user.nombre} ${user.apellido}`.trim(),
      })
      toast.success(campos.suatsGenerado ? 'SUATS generado' : 'Resolución registrada')
    } catch {
      toast.error('Error al guardar')
    } finally {
      setGuardando(false)
      setProgreso(0)
    }
  }, [tramiteId, gestoriaId, user])

  // ── PASO 7 ────────────────────────────────────────────────────────────────
  const confirmarPaso7 = useCallback(async (
    campos: Omit<MultaPaso7Data, 'completadoPor' | 'completadoPorNombre' | 'completadoEn'>
  ) => {
    if (!user || !gestoriaId) return
    setGuardando(true)
    setError(null)
    try {
      await confirmarPaso7Multa(tramiteId, gestoriaId, {
        ...campos,
        completadoPor:       user.uid,
        completadoPorNombre: `${user.nombre} ${user.apellido}`.trim(),
      })
      toast.success('Trámite cerrado y archivado ✓')
    } catch {
      toast.error('Error al cerrar el trámite')
    } finally {
      setGuardando(false)
    }
  }, [tramiteId, gestoriaId, user])

  // ── Asignar admin ─────────────────────────────────────────────────────────
  const asignarAdmin = useCallback(async (uid: string, nombre: string) => {
    await asignarAdminMulta(tramiteId, uid, nombre)
      .then(() => toast.success('Admin asignado'))
      .catch(() => toast.error('Error al asignar'))
  }, [tramiteId])

  const pasoActual = workflow?.pasoActual ?? 1

  return {
    workflow, loading, guardando, error, progreso, pasoActual,
    confirmarPaso1,
    confirmarPaso2,
    confirmarPreRevision: confirmarPreRevisionFn,
    resolverRebote: resolverReboteFn,
    resolverMesaAyuda,
    confirmarPaso4,
    confirmarPaso5,
    confirmarPaso6,
    confirmarPaso7,
    asignarAdmin,
  }
}