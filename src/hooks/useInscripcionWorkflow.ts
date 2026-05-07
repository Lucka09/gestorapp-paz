// src/hooks/useInscripcionWorkflow.ts
// ─── HOOK — WORKFLOW DE INSCRIPCIÓN INICIAL ───────────────────────────────────
// Para el panel del mandatario. Maneja el estado local del flujo de pasos,
// validación de fotos y upload a Firebase Storage.

import { useState, useEffect, useCallback } from 'react'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { storage }           from '@/lib/firebase'
import { useAuthStore }      from '@/store/authStore'
import { useGestoriaId }     from '@/context/GestoriaContext'
import {
  subscribeWorkflow,
  confirmarPaso1, confirmarPaso2, confirmarPaso3,
  confirmarPaso4, confirmarPaso5, iniciarPaso6,
  confirmarRetiroChapa, postergarRetiroChapa,
} from '@/lib/firestore/inscripcionworkflow'
import { validarFoto, generarPathStorage } from '@/lib/firestore/fotoValidator'
import type { InscripcionWorkflow, FotoWorkflow } from '@/types/torre.types'

// ─── OPTIMIZACIÓN DE IMÁGENES ────────────────────────────────────────────────

const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.78
const SKIP_COMPRESS_UNDER_BYTES = 350 * 1024

async function comprimirImagen(file: File): Promise<File> {
  // No recomprimir archivos chicos para evitar pérdida innecesaria.
  if (file.size <= SKIP_COMPRESS_UNDER_BYTES || !file.type.startsWith('image/')) return file

  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })

    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, w, h)

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    )
    if (!blob) return file

    // Si no mejora tamaño, conservar original.
    if (blob.size >= file.size) return file

    const nombreBase = file.name.replace(/\.[^.]+$/, '')
    return new File([blob], `${nombreBase}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  } finally {
    URL.revokeObjectURL(url)
  }
}

// ─── TIPOS LOCALES ────────────────────────────────────────────────────────────

export type EstadoFotoLocal =
  | 'pendiente'    // el usuario acaba de seleccionarla
  | 'validando'    // analizando calidad
  | 'subiendo'     // upload a Storage en curso
  | 'ok'           // validada y subida exitosamente
  | 'rechazada'    // no pasó la validación
  | 'error_upload' // falló el upload

export interface FotoLocal {
  file:        File
  preview:     string       // object URL para mostrar preview
  estado:      EstadoFotoLocal
  progreso:    number       // 0-100, para la barra de progreso del upload
  razon?:      string       // motivo del rechazo
  fotoRemota?: FotoWorkflow // disponible cuando estado = 'ok'
}

export interface DatosPasoLocal {
  [campo: string]: string | number
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────

export function useInscripcionWorkflow(tramiteId: string) {
  const { user }   = useAuthStore()
  const gestoriaId = useGestoriaId()

  const [workflow, setWorkflow]   = useState<InscripcionWorkflow | null>(null)
  const [loading, setLoading]     = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  // Estado local de fotos del paso activo
  const [fotosLocales, setFotosLocales] = useState<FotoLocal[]>([])
  const [datosLocales, setDatosLocales] = useState<DatosPasoLocal>({})

  // Suscripción en tiempo real al workflow
  useEffect(() => {
    if (!tramiteId) return
    setLoading(true)
    const unsub = subscribeWorkflow(tramiteId, wf => {
      setWorkflow(wf)
      setLoading(false)
    })
    return () => unsub()
  }, [tramiteId])

  // Limpiar fotos locales al cambiar de paso
  const pasoActual = workflow?.pasoActual ?? 1
  useEffect(() => {
    setFotosLocales([])
    setDatosLocales({})
    setError(null)
  }, [pasoActual])

  // ── Manejo de fotos ──────────────────────────────────────────────────────

  /**
   * Agrega una foto: valida calidad y sube a Storage si pasa.
   * Reemplaza por índice si se indica (para resubida).
   */
  const agregarFoto = useCallback(async (
    file:           File,
    reemplazaIndice?: number,
  ): Promise<void> => {
    const fileOptimizado = await comprimirImagen(file)
    const preview = URL.createObjectURL(fileOptimizado)
    const nueva: FotoLocal = { file: fileOptimizado, preview, estado: 'validando', progreso: 0 }

    // Insertar o reemplazar en el array local
    setFotosLocales(prev => {
      const copia = [...prev]
      if (reemplazaIndice !== undefined) {
        URL.revokeObjectURL(copia[reemplazaIndice]?.preview ?? '')
        copia[reemplazaIndice] = nueva
      } else {
        copia.push(nueva)
      }
      return copia
    })

    const idx = reemplazaIndice ?? (fotosLocales.length)

    // Validar calidad
    const resultado = await validarFoto(fileOptimizado)
    if (!resultado.ok) {
      setFotosLocales(prev => {
        const copia = [...prev]
        if (copia[idx]) copia[idx] = { ...copia[idx], estado: 'rechazada', razon: resultado.razon }
        return copia
      })
      return
    }

    // Subir a Firebase Storage
    setFotosLocales(prev => {
      const copia = [...prev]
      if (copia[idx]) copia[idx] = { ...copia[idx], estado: 'subiendo' }
      return copia
    })

    try {
      const path       = generarPathStorage(gestoriaId!, tramiteId, pasoActual, idx, fileOptimizado)
      const storageRef = ref(storage, path)
      const task       = uploadBytesResumable(storageRef, fileOptimizado)

      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          snap => {
            const progreso = Math.round(snap.bytesTransferred / snap.totalBytes * 100)
            setFotosLocales(prev => {
              const copia = [...prev]
              if (copia[idx]) copia[idx] = { ...copia[idx], progreso }
              return copia
            })
          },
          reject,
          resolve,
        )
      })

      const url: string = await getDownloadURL(storageRef)

      const fotoRemota: FotoWorkflow = {
        url,
        storageRef:  path,
        nombre:      fileOptimizado.name,
        tamanoKb:    Math.round(fileOptimizado.size / 1024),
        subidaPor:   user!.uid,
        subidaEn:    { toDate: () => new Date() } as ReturnType<typeof import('firebase/firestore').Timestamp.now>,
        validadaOk:  true,
      }

      setFotosLocales(prev => {
        const copia = [...prev]
        if (copia[idx]) copia[idx] = { ...copia[idx], estado: 'ok', progreso: 100, fotoRemota }
        return copia
      })

    } catch {
      setFotosLocales(prev => {
        const copia = [...prev]
        if (copia[idx]) copia[idx] = {
          ...copia[idx], estado: 'error_upload',
          razon: 'Error al subir la foto. Verificá tu conexión e intentá de nuevo.',
        }
        return copia
      })
    }
  }, [fotosLocales.length, gestoriaId, tramiteId, pasoActual, user])

  const actualizarDato = useCallback((campo: string, valor: string | number) => {
    setDatosLocales(prev => ({ ...prev, [campo]: valor }))
  }, [])

  // ── Validación de completitud del paso ───────────────────────────────────

  const puedeAvanzar = useCallback((): boolean => {
    if (!workflow) return false
    const paso = pasoActual

    // Verificar fotos
    const fotosOk = fotosLocales.filter(f => f.estado === 'ok')
    const hayValidando = fotosLocales.some(f => f.estado === 'validando' || f.estado === 'subiendo')
    if (hayValidando) return false

    switch (paso) {
      case 1: return true  // solo confirmación
      case 2: {
        const nombre = (datosLocales.nombreTitular as string)?.trim()
        const dni    = (datosLocales.nroDni as string)?.trim()
        return !!nombre && !!dni && fotosOk.length >= 1
      }
      case 3: return fotosOk.length >= 1
      case 4: {
        const fecha    = (datosLocales.fechaTurno as string)?.trim()
        const hora     = (datosLocales.horaTurno as string)?.trim()
        const registro = (datosLocales.registroUbicacion as string)?.trim()
        const monto    = datosLocales.montoGestor as number | undefined
        return !!fecha && !!hora && !!registro && !!monto && monto > 0 && fotosOk.length >= 2
      }
      case 5: return fotosOk.length >= 1
      default: return false
    }
  }, [workflow, pasoActual, fotosLocales, datosLocales])

  // ── Confirmar paso ────────────────────────────────────────────────────────

  const confirmarPaso = useCallback(async (): Promise<void> => {
    if (!user || !puedeAvanzar()) return
    setGuardando(true)
    setError(null)

    const nombre = `${user.nombre} ${user.apellido}`.trim()
    const fotosRemota = fotosLocales.filter(f => f.fotoRemota).map(f => f.fotoRemota!)

    try {
      switch (pasoActual) {
        case 1:
          await confirmarPaso1(tramiteId, user.uid, nombre)
          break
        case 2:
          await confirmarPaso2(tramiteId, user.uid, nombre,
            {
              nombreTitular: datosLocales.nombreTitular as string,
              nroDni:        datosLocales.nroDni as string,
            },
            fotosRemota,
          )
          break
        case 3:
          await confirmarPaso3(tramiteId, user.uid, nombre, fotosRemota)
          break
        case 4:
          await confirmarPaso4(tramiteId, user.uid, nombre,
            {
              fechaTurno:        datosLocales.fechaTurno as string,
              horaTurno:         datosLocales.horaTurno as string,
              registroUbicacion: datosLocales.registroUbicacion as string,
              montoGestor:       datosLocales.montoGestor as number,
            },
            fotosRemota,
          )
          break
        case 5:
          await confirmarPaso5(tramiteId, user.uid, nombre, fotosRemota)
          // Paso 5 NO finaliza. El hook de Firestore ya avanzó a paso 6.
          // El cartel de "¿cuántos días?" lo maneja el componente que consume este hook.
          break
      }
    } catch (e) {
      setError('Ocurrió un error al guardar. Intentá de nuevo.')
      console.error(e)
    } finally {
      setGuardando(false)
    }
  }, [user, pasoActual, tramiteId, fotosLocales, datosLocales, puedeAvanzar])

  // ── Iniciar Paso 6 ────────────────────────────────────────────────────────

  const iniciarChapaPatente = useCallback(async (diasIndicados: number): Promise<void> => {
    if (!user || !workflow) return
    setGuardando(true)
    try {
      // Obtener registroUbicacion del paso 4 automáticamente
      const registroUbicacion = workflow.paso4?.registroUbicacion ?? ''
      const nombre = `${user.nombre} ${user.apellido}`.trim()
      await iniciarPaso6(tramiteId, user.uid, nombre, diasIndicados, registroUbicacion)
    } catch (e) {
      setError('Error al registrar la fecha de chapa.')
      console.error(e)
    } finally {
      setGuardando(false)
    }
  }, [user, workflow, tramiteId])

  // ── Confirmar retiro de chapa ─────────────────────────────────────────────

  const confirmarRetiro = useCallback(async (fotoChapaFile: File): Promise<void> => {
    if (!user || !workflow?.paso6) return
    setGuardando(true)
    try {
      const fotoOptimizada = await comprimirImagen(fotoChapaFile)
      const path       = generarPathStorage(gestoriaId!, tramiteId, 6, 0, fotoOptimizada)
      const storageRef = ref(storage, path)
      await uploadBytesResumable(storageRef, fotoOptimizada)
      const url: string = await getDownloadURL(storageRef)
      const nombre = `${user.nombre} ${user.apellido}`.trim()
      await confirmarRetiroChapa(tramiteId, user.uid, nombre, url, workflow)
    } catch (e) {
      setError('Error al confirmar el retiro de la chapa.')
      console.error(e)
    } finally {
      setGuardando(false)
    }
  }, [user, workflow, tramiteId, gestoriaId])

  // ── Postergar retiro ──────────────────────────────────────────────────────

  const postergarRetiro = useCallback(async (nuevosDias: number, nota?: string): Promise<void> => {
    if (!user || !workflow?.paso6) return
    setGuardando(true)
    try {
      const nombre = `${user.nombre} ${user.apellido}`.trim()
      await postergarRetiroChapa(tramiteId, user.uid, nombre, nuevosDias, nota, workflow)
    } catch (e) {
      setError('Error al postergar la fecha de retiro.')
      console.error(e)
    } finally {
      setGuardando(false)
    }
  }, [user, workflow, tramiteId])

  // ── Limpieza de object URLs ───────────────────────────────────────────────

  useEffect(() => {
    return () => {
      fotosLocales.forEach(f => URL.revokeObjectURL(f.preview))
    }
  }, [fotosLocales])

  return {
    // Estado
    workflow,
    loading,
    guardando,
    error,
    pasoActual,
    // Fotos y datos locales
    fotosLocales,
    datosLocales,
    agregarFoto,
    actualizarDato,
    // Validación
    puedeAvanzar,
    // Acciones
    confirmarPaso,
    iniciarChapaPatente,
    confirmarRetiro,
    postergarRetiro,
  }
}