// src/hooks/useMultaWorkflow.ts
// ─── HOOK — MULTA WORKFLOW ────────────────────────────────────────────────────
// Gestiona estado local de fotos, datos del formulario y validación
// de cada paso del workflow de Multas/Infracciones.
// Sigue el mismo patrón que useInscripcionWorkflow.ts

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { comprimirImagen } from '@/utils/comprimirImagen'
import { storage } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import { useGestoriaId } from '@/context/GestoriaContext'
import {
  subscribeMultaWorkflow,
  crearMultaWorkflow,
  confirmarMultaPaso1,
  confirmarMultaPaso2,
  confirmarMultaPaso3,
  confirmarMultaPaso4,
  confirmarMultaPaso5,
  agregarPagoMulta,
} from '@/lib/firestore/MultaWorwflow'
import type {
  MultaWorkflow,
  RegistroPago,
  MetodoPago,
  EstadoDocumento,
} from '@/types/multa.types'
import { observacionObligatoria } from '@/types/multa.types'
import type { FotoWorkflow } from '@/types/torre.types'
import { Timestamp } from 'firebase/firestore'

// ─── TIPOS LOCALES ────────────────────────────────────────────────────────────

export type ClaveDocumento =
  | 'dniFrente'
  | 'dniDorso'
  | 'cedulaFrente'
  | 'cedulaDorso'
  | 'suats'  // para paso 4, puede ser múltiples

export interface FotoLocal {
  clave:      ClaveDocumento | string
  archivo?:   File
  previewUrl?: string
  fotoRemota?: FotoWorkflow
  estado:     'pendiente' | 'subiendo' | 'ok' | 'error'
  error?:     string
}

// ─── HOOK PRINCIPAL ───────────────────────────────────────────────────────────

export function useMultaWorkflow(tramiteId: string) {
  const { user }    = useAuth()
  const gestoriaId  = useGestoriaId()

  // ── Estado del workflow en Firestore ──────────────────────────────────────
  const [workflow, setWorkflow]     = useState<MultaWorkflow | null>(null)
  const [cargando, setCargando]     = useState(true)
  const [guardando, setGuardando]   = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // ── Estado local del formulario ───────────────────────────────────────────
  const [datosLocales, setDatosLocales] = useState<Record<string, unknown>>({})
  const [fotosLocales, setFotosLocales] = useState<FotoLocal[]>([])

  // ── Estado local de pagos (paso 2) ────────────────────────────────────────
  const [historialPagosLocal, setHistorialPagosLocal] = useState<RegistroPago[]>([])

  // ── Suscripción en tiempo real + creación inicial (efecto unificado) ───────
  // Se unifica en un solo efecto para evitar el error de Firestore
  // "Unexpected state" causado por listeners duplicados en React 18 Strict Mode.
  useEffect(() => {
    if (!tramiteId || !user) return

    let mounted = true
    setCargando(true)

    // Primero nos aseguramos de que el documento exista (idempotente)
    const nombreUsuario = `${user.nombre ?? ''} ${user.apellido ?? ''}`.trim() || user.email
    crearMultaWorkflow(tramiteId, gestoriaId, user.uid, nombreUsuario)
      .catch(console.error)
      .finally(() => {
        if (!mounted) return
        // Recién después de crear (o confirmar que ya existe) suscribimos
        const unsub = subscribeMultaWorkflow(tramiteId, (w: MultaWorkflow | null) => {
          if (!mounted) return
          setWorkflow(w)
          setCargando(false)
          if (w?.paso2?.historialPagos) {
            setHistorialPagosLocal(w.paso2.historialPagos)
          }
        })
        // El cleanup cancela el listener Y marca mounted=false
        cleanup = unsub
      })

    let cleanup: (() => void) | undefined
    return () => {
      mounted = false
      cleanup?.()
    }
  }, [tramiteId, user, gestoriaId])

  const pasoActual = workflow?.pasoActual ?? 1

  // ── Subir foto a Firebase Storage ─────────────────────────────────────────
  const subirFoto = useCallback(async (
    archivo: File,
    clave:   string,
  ): Promise<FotoWorkflow | null> => {
    if (!user) return null

    setFotosLocales(prev => prev.map(f =>
      f.clave === clave ? { ...f, estado: 'subiendo' } : f
    ))

    try {
      // Comprimir antes de subir — ahorra Storage y tiempo de carga
      const archivoOpt = await comprimirImagen(archivo)
      const path    = `${gestoriaId}/multaWorkflow/${tramiteId}/paso${pasoActual}/${clave}_${Date.now()}.jpg`
      const fileRef = storageRef(storage, path)

      // uploadBytesResumable permite mostrar progreso en el futuro
      const task = uploadBytesResumable(fileRef, archivoOpt)
      await new Promise<void>((resolve, reject) => task.on('state_changed', null, reject, resolve))
      const url = await getDownloadURL(fileRef)

      const foto: FotoWorkflow = {
        url,
        storageRef:  path,
        nombre:      archivoOpt.name,
        tamanoKb:    Math.round(archivoOpt.size / 1024),
        subidaPor:   user.uid,
        subidaEn:    Timestamp.now(),
        validadaOk:  true,
      }

      setFotosLocales(prev => prev.map(f =>
        f.clave === clave ? { ...f, fotoRemota: foto, estado: 'ok' } : f
      ))
      return foto
    } catch {
      setFotosLocales(prev => prev.map(f =>
        f.clave === clave
          ? { ...f, estado: 'error', error: 'Error al subir. Intentá de nuevo.' }
          : f
      ))
      return null
    }
  }, [user, gestoriaId, tramiteId, pasoActual])

  // ── Agregar foto al estado local ──────────────────────────────────────────
  const agregarFotoLocal = useCallback((clave: string, archivo: File) => {
    const previewUrl = URL.createObjectURL(archivo)
    setFotosLocales(prev => {
      // Reemplaza si ya existe la misma clave (para DNI, cédula que son 1:1)
      const existe = prev.find(f => f.clave === clave)
      if (existe) {
        return prev.map(f =>
          f.clave === clave
            ? { clave, archivo, previewUrl, estado: 'pendiente' }
            : f
        )
      }
      return [...prev, { clave, archivo, previewUrl, estado: 'pendiente' }]
    })
    // Auto-subir
    subirFoto(archivo, clave)
  }, [subirFoto])

  const removerFoto = useCallback((clave: string) => {
    setFotosLocales(prev => prev.filter(f => f.clave !== clave))
  }, [])

  // ── Actualizar dato de formulario ─────────────────────────────────────────
  const actualizarDato = useCallback((campo: string, valor: unknown) => {
    setDatosLocales(prev => ({ ...prev, [campo]: valor }))
  }, [])

  // ── Agregar pago (paso 2) ─────────────────────────────────────────────────
  const agregarPago = useCallback(async (
    monto:      number,
    metodoPago: MetodoPago,
    nota?:      string,
  ) => {
    if (!user) return
    setGuardando(true)
    try {
      const nombre = `${user.nombre} ${user.apellido}`.trim()
      await agregarPagoMulta(
        tramiteId, user.uid, nombre,
        { monto, metodoPago, nota },
        historialPagosLocal,
      )
    } catch {
      setError('Error al registrar el pago. Intentá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }, [user, tramiteId, historialPagosLocal])

  // ── Validación por paso ───────────────────────────────────────────────────
  const puedeAvanzar = useCallback((): boolean => {
    if (!workflow) return false
    const haySubiendo = fotosLocales.some(
      f => f.estado === 'subiendo' || f.estado === 'pendiente'
    )
    if (haySubiendo) return false

    const fotoOk = (clave: string) =>
      fotosLocales.find(f => f.clave === clave)?.estado === 'ok'

    switch (pasoActual) {
      case 1: {
        const lit = (datosLocales.numeroLIT as string)?.trim()
        return !!lit && lit.length >= 3
      }
      case 2: {
        const presupuesto = datosLocales.presupuestoEnviado as boolean
        const pago        = datosLocales.pagoConfirmado as boolean
        return !!presupuesto && !!pago && historialPagosLocal.length > 0
      }
      case 3: {
        const nombre  = (datosLocales.nombreCompleto as string)?.trim()
        const celular = (datosLocales.celular as string)?.trim()
        if (!nombre || !celular) return false

        // Observación obligatoria si falta DNI o cédula
        const dniOk    = fotoOk('dniFrente') && fotoOk('dniDorso')
        const cedulaOk = fotoOk('cedulaFrente') && fotoOk('cedulaDorso')
        if (!dniOk || !cedulaOk) {
          const obs = (datosLocales.observacion as string)?.trim()
          return !!obs && obs.length >= 10
        }
        return true
      }
      case 4: {
        const descargo = datosLocales.descargoPreparado as boolean
        const suats    = datosLocales.suatsObtenido as boolean
        return !!descargo && !!suats
      }
      case 5: {
        const entregado = datosLocales.suatsEntregado as boolean
        const fecha     = (datosLocales.fechaEntrega as string)?.trim()
        const canal     = (datosLocales.canalEntrega as string)?.trim()
        return !!entregado && !!fecha && !!canal
      }
      default:
        return false
    }
  }, [workflow, pasoActual, datosLocales, fotosLocales, historialPagosLocal])

  // ── Necesita observación (para UI) ────────────────────────────────────────
  // Usa observacionObligatoria() de multa.types — si cambian las reglas,
  // se actualiza en un solo lugar en vez de estar duplicado aquí.
  const necesitaObservacion = useMemo((): boolean => {
    if (pasoActual !== 3) return false
    const fotoRemota = (clave: string) => fotosLocales.find(f => f.clave === clave)?.fotoRemota
    // fotoRemota() ya devuelve FotoWorkflow completo — no re-wrappear
    return observacionObligatoria({
      fotoDniFrente:    fotoRemota('dniFrente')    ?? undefined,
      fotoDniDorso:     fotoRemota('dniDorso')     ?? undefined,
      fotoCedulaFrente: fotoRemota('cedulaFrente') ?? undefined,
      fotoCedulaDorso:  fotoRemota('cedulaDorso')  ?? undefined,
    })
  }, [pasoActual, fotosLocales])

  // ── Confirmar paso ────────────────────────────────────────────────────────
  const confirmarPaso = useCallback(async (): Promise<void> => {
    if (!user || !puedeAvanzar()) return
    setGuardando(true)
    setError(null)

    const nombre = `${user.nombre} ${user.apellido}`.trim()
    const fotoRemota = (clave: string) =>
      fotosLocales.find(f => f.clave === clave)?.fotoRemota

    try {
      switch (pasoActual) {
        case 1:
          await confirmarMultaPaso1(
            tramiteId, user.uid, nombre,
            datosLocales.numeroLIT as string,
            datosLocales.observacionInicial as string | undefined,
          )
          break

        case 2:
          await confirmarMultaPaso2(tramiteId, user.uid, nombre, {
            presupuestoEnviado: datosLocales.presupuestoEnviado as boolean,
            pagoConfirmado:     datosLocales.pagoConfirmado as boolean,
            historialPagos:     historialPagosLocal,
          })
          break

        case 3: {
          const estadoDni: EstadoDocumento =
            fotoRemota('dniFrente') && fotoRemota('dniDorso') ? 'ok' : 'faltante'
          const estadoCedula: EstadoDocumento =
            fotoRemota('cedulaFrente') && fotoRemota('cedulaDorso') ? 'ok' : 'faltante'

          await confirmarMultaPaso3(tramiteId, user.uid, nombre, {
            nombreCompleto:    datosLocales.nombreCompleto as string,
            celular:           datosLocales.celular as string,
            fotoDniFrente:     fotoRemota('dniFrente'),
            fotoDniDorso:      fotoRemota('dniDorso'),
            fotoCedulaFrente:  fotoRemota('cedulaFrente'),
            fotoCedulaDorso:   fotoRemota('cedulaDorso'),
            estadoDni,
            estadoCedula,
            observacion:       datosLocales.observacion as string | undefined,
          })
          break
        }

        case 4: {
          const fotosSuats = fotosLocales
            .filter(f => f.clave.startsWith('suats') && f.fotoRemota)
            .map(f => f.fotoRemota!)

          await confirmarMultaPaso4(tramiteId, user.uid, nombre, {
            descargoPreparado: datosLocales.descargoPreparado as boolean,
            suatsObtenido:     datosLocales.suatsObtenido as boolean,
            fotosSuats,
            notaDescargo:      datosLocales.notaDescargo as string | undefined,
          })
          break
        }

        case 5:
          await confirmarMultaPaso5(tramiteId, user.uid, nombre, {
            suatsEntregado:    datosLocales.suatsEntregado as boolean,
            fechaEntrega:      datosLocales.fechaEntrega as string,
            canalEntrega:      datosLocales.canalEntrega as 'presencial' | 'whatsapp' | 'email' | 'otro',
            observacionFinal:  datosLocales.observacionFinal as string | undefined,
          })
          break
      }

      // Limpiar estado local después de confirmar
      setDatosLocales({})
      setFotosLocales([])
    } catch (e) {
      console.error(e)
      setError('Ocurrió un error al guardar. Intentá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }, [
    user, pasoActual, tramiteId, datosLocales,
    fotosLocales, historialPagosLocal, puedeAvanzar,
  ])

  // ─────────────────────────────────────────────────────────────────────────
  return {
    // Estado
    workflow,
    pasoActual,
    cargando,
    guardando,
    error,

    // Datos de formulario
    datosLocales,
    fotosLocales,
    historialPagosLocal,

    // Acciones
    actualizarDato,
    agregarFotoLocal,
    removerFoto,
    agregarPago,
    confirmarPaso,

    // Validación
    puedeAvanzar,
    necesitaObservacion,
  }
}