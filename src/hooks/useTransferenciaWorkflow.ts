// src/hooks/useTransferenciaWorkflow.ts
import { useState, useEffect, useCallback } from 'react'
import { Timestamp }          from 'firebase/firestore'
import { useAuthStore }       from '@/store/authStore'
import { useGestoriaId }      from '@/context/GestoriaContext'
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage'
import { storage }            from '@/lib/firebase'
import {
  subscribeTransferenciaWorkflow,
  crearTransferenciaWorkflow,
  confirmarTrfPaso1, confirmarTrfPaso2, confirmarTrfPaso3,
  agregarSeguimientoTrf, confirmarTrfPaso4,
  confirmarTrfPaso5, confirmarTrfPaso6, confirmarTrfPaso7,
  asignarGestorTransferencia,
} from '@/lib/firestore/transferenciaWorkflow'
import type {
  TransferenciaWorkflow, TrfPaso1Data, TrfPaso2Data,
  TrfPaso3Data, TrfPaso4Data, TrfPaso5Data, TrfPaso6Data,
  TrfPaso7Data, DocPar, SeguimientoEntrada,
} from '@/transferencia_types'
import type { FotoWorkflow, GeoRegistro } from '@/torre_types'
import toast from 'react-hot-toast'

// ─── UPLOAD FOTO ──────────────────────────────────────────────────────────────

async function subirFoto(
  file:       File,
  path:       string,
  uid:        string,
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
          storageRef: path,
          nombre:     file.name,
          tamanoKb:   Math.round(file.size / 1024),
          subidaPor:  uid,
          subidaEn:   Timestamp.now(),
          validadaOk: true,
        })
      },
    )
  })
}

// Sube un par frente/dorso
async function subirDocPar(
  frente:   File | undefined,
  dorso:    File | undefined,
  basePath: string,
  campo:    string,
  uid:      string,
  onProgress: (p: number) => void,
): Promise<DocPar> {
  const par: DocPar = {}
  if (frente) par.frente = await subirFoto(frente, `${basePath}/${campo}_frente_${Date.now()}.jpg`, uid, onProgress)
  if (dorso)  par.dorso  = await subirFoto(dorso,  `${basePath}/${campo}_dorso_${Date.now()}.jpg`,  uid, onProgress)
  return par
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────

export function useTransferenciaWorkflow(tramiteId: string) {
  const { user }    = useAuthStore()
  const gestoriaId  = useGestoriaId()
  const [workflow,  setWorkflow]  = useState<TransferenciaWorkflow | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [progreso,  setProgreso]  = useState(0)

  useEffect(() => {
    if (!tramiteId) return
    return subscribeTransferenciaWorkflow(
      tramiteId,
      wf => { setWorkflow(wf); setLoading(false) },
      err => { setError(err.message); setLoading(false) },
    )
  }, [tramiteId])

  // Auto-crear si no existe
  useEffect(() => {
    if (!tramiteId || !gestoriaId || !user || loading || workflow) return
    crearTransferenciaWorkflow(
      tramiteId, gestoriaId, user.uid,
      `${user.nombre} ${user.apellido}`.trim(),
    ).catch(console.error)
  }, [tramiteId, gestoriaId, user, loading, workflow])

  const nombreUsuario = user ? `${user.nombre} ${user.apellido}`.trim() : ''

  // ── Paso 1 ──────────────────────────────────────────────────────────────────
  const confirmarPaso1 = useCallback(async (
    campos: Omit<TrfPaso1Data, 'creadoPor' | 'creadoPorNombre' | 'creadoEn'>
  ) => {
    if (!user) return
    setGuardando(true); setError(null)
    try {
      await confirmarTrfPaso1(tramiteId, {
        ...campos,
        creadoPor: user.uid, creadoPorNombre: nombreUsuario,
      })
      toast.success('Datos guardados — Paso 1 completado')
    } catch (e: any) {
      setError(e.message); toast.error('Error al guardar')
    } finally { setGuardando(false) }
  }, [tramiteId, user, nombreUsuario])

  // ── Paso 2 — con upload de fotos ────────────────────────────────────────────
  const confirmarPaso2 = useCallback(async (
    observacion: string,
    archivos: {
      formulario08Frente?:         File; formulario08Dorso?:         File
      tituloFrente?:               File; tituloDorso?:               File
      cedulaFrente?:               File; cedulaDorso?:               File
      verificacionPolicialFrente?: File; verificacionPolicialDorso?: File
      dniCompradorFrente?:         File; dniCompradorDorso?:         File
      formulario04Frente?:         File; formulario04Dorso?:         File
    },
    gestorId?:    string,
    gestorNombre?: string,
  ) => {
    if (!user || !gestoriaId) return
    setGuardando(true); setError(null); setProgreso(0)
    const base = `${gestoriaId}/transferencias/${tramiteId}/paso2`
    const uid  = user.uid

    try {
      let done = 0; const total = Object.values(archivos).filter(Boolean).length
      const onP = (p: number) => setProgreso(Math.round((done / total * 100) + (p / total)))
      const sub = (f: File | undefined, d: File | undefined, campo: string) =>
        subirDocPar(f, d, base, campo, uid, onP)

      const [f08, tit, ced, ver, dni, f04] = await Promise.all([
        sub(archivos.formulario08Frente, archivos.formulario08Dorso, 'formulario08'),
        sub(archivos.tituloFrente,       archivos.tituloDorso,       'titulo'),
        sub(archivos.cedulaFrente,       archivos.cedulaDorso,       'cedula'),
        sub(archivos.verificacionPolicialFrente, archivos.verificacionPolicialDorso, 'verificacionPolicial'),
        sub(archivos.dniCompradorFrente, archivos.dniCompradorDorso, 'dniComprador'),
        sub(archivos.formulario04Frente, archivos.formulario04Dorso, 'formulario04'),
      ])
      setProgreso(100)

      await confirmarTrfPaso2(tramiteId, gestoriaId, {
        formulario08:         f08,
        titulo:               tit,
        cedula:               ced,
        verificacionPolicial: ver,
        dniComprador:         dni,
        formulario04:         (f04.frente || f04.dorso) ? f04 : undefined,
        observacion,
        completadoPor: uid, completadoPorNombre: nombreUsuario,
      }, gestorId, gestorNombre)
      toast.success('Documentación guardada — Paso 2 completado')
    } catch {
      setError('Error al subir documentos. Verificá la conexión.')
      toast.error('Error al subir')
    } finally { setGuardando(false); setProgreso(0) }
  }, [tramiteId, gestoriaId, user, nombreUsuario])

  // ── Paso 3 — Presentación y recibos ─────────────────────────────────────────
  const confirmarPaso3 = useCallback(async (
    campos: Omit<TrfPaso3Data, 'completadoPor' | 'completadoPorNombre' | 'completadoEn' | 'geoPresencia'>,
    archivos: {
      reciboTrfFrente?: File; reciboTrfDorso?: File
      reciboArbaFrente?: File; reciboArbaDorso?: File
      reciboSuatsFrente?: File; reciboSuatsDorso?: File
    },
    geo?: GeoRegistro,
  ) => {
    if (!user || !gestoriaId) return
    setGuardando(true); setError(null); setProgreso(0)
    const base = `${gestoriaId}/transferencias/${tramiteId}/paso3`
    const uid  = user.uid

    try {
      const onP = (p: number) => setProgreso(p)
      const sub = (f?: File, d?: File, campo?: string) =>
        subirDocPar(f, d, base, campo!, uid, onP)

      const [trf, arba, suats] = await Promise.all([
        sub(archivos.reciboTrfFrente,   archivos.reciboTrfDorso,   'reciboTransferencia'),
        sub(archivos.reciboArbaFrente,  archivos.reciboArbaDorso,  'reciboArba'),
        sub(archivos.reciboSuatsFrente, archivos.reciboSuatsDorso, 'reciboSuats'),
      ])

      await confirmarTrfPaso3(tramiteId, gestoriaId, {
        ...campos,
        // Los 3 recibos son obligatorios — se garantiza en la UI
        reciboTransferencia: trf,
        reciboArba:          arba,
        reciboSuats:         suats,
        geoPresencia:        geo,
        completadoPor: uid, completadoPorNombre: nombreUsuario,
      }, workflow?.paso1?.futuraRadicacion ?? false)
      toast.success('Presentación registrada — iniciando seguimiento')
    } catch {
      setError('Error al guardar. Verificá la conexión.')
      toast.error('Error')
    } finally { setGuardando(false); setProgreso(0) }
  }, [tramiteId, gestoriaId, user, nombreUsuario, workflow])

  // ── Paso 4 — Seguimiento ─────────────────────────────────────────────────────
  const agregarSeguimiento = useCallback(async (observacion: string) => {
    if (!user) return
    setGuardando(true)
    try {
      await agregarSeguimientoTrf(tramiteId,
        { observacion, registradoPor: user.uid, registradoPorNombre: nombreUsuario },
        workflow?.paso1?.futuraRadicacion ?? false,
      )
      toast.success('Seguimiento registrado')
    } catch { toast.error('Error al guardar') }
    finally { setGuardando(false) }
  }, [tramiteId, user, nombreUsuario, workflow])

  const confirmarReciboListo = useCallback(async (
    campos: Omit<TrfPaso4Data, 'completadoEn' | 'seguimientos' | 'frecuenciaAlertaDias' | 'plazoMaximoDias'>
  ) => {
    if (!user) return
    setGuardando(true)
    try {
      const futuraRad = workflow?.paso1?.futuraRadicacion ?? false
      await confirmarTrfPaso4(tramiteId, {
        ...campos,
        seguimientos:        workflow?.paso4?.seguimientos ?? [],
        frecuenciaAlertaDias: futuraRad ? 7 : 5,
        plazoMaximoDias:      futuraRad ? 45 : 21,
        completadoPor: user.uid, completadoPorNombre: nombreUsuario,
      })
      toast.success('¡Recibo listo! Agendá el turno de retiro.')
    } catch { toast.error('Error') }
    finally { setGuardando(false) }
  }, [tramiteId, user, nombreUsuario, workflow])

  // ── Paso 5 — Turno de retiro ─────────────────────────────────────────────────
  const confirmarPaso5 = useCallback(async (
    campos: Omit<TrfPaso5Data, 'completadoEn' | 'alerta24hs' | 'alertaDiaTurno'>
  ) => {
    if (!user || !gestoriaId) return
    setGuardando(true)
    try {
      await confirmarTrfPaso5(tramiteId, gestoriaId, {
        ...campos,
        completadoPor: user.uid, completadoPorNombre: nombreUsuario,
      })
      toast.success('Turno agendado — recibirás alertas antes del retiro')
    } catch { toast.error('Error al guardar') }
    finally { setGuardando(false) }
  }, [tramiteId, gestoriaId, user, nombreUsuario])

  // ── Paso 6 — Retiro con geo ──────────────────────────────────────────────────
  const confirmarPaso6 = useCallback(async (
    campos:  Omit<TrfPaso6Data, 'completadoEn' | 'geoRetiro' | 'fotoComprobanteRetiro'>,
    geo?:    GeoRegistro,
    archivo?: File,
  ) => {
    if (!user || !gestoriaId) return
    setGuardando(true); setError(null)
    try {
      let fotoComprobanteRetiro: FotoWorkflow | undefined
      if (archivo) {
        fotoComprobanteRetiro = await subirFoto(
          archivo,
          `${gestoriaId}/transferencias/${tramiteId}/paso6/comprobante_${Date.now()}.jpg`,
          user.uid,
          p => setProgreso(p),
        )
      }
      await confirmarTrfPaso6(tramiteId, {
        ...campos,
        geoRetiro:            geo,
        fotoComprobanteRetiro: fotoComprobanteRetiro!,
        completadoPor: user.uid, completadoPorNombre: nombreUsuario,
      })
      toast.success('Retiro confirmado ✓')
    } catch { toast.error('Error al confirmar retiro') }
    finally { setGuardando(false); setProgreso(0) }
  }, [tramiteId, gestoriaId, user, nombreUsuario])

  // ── Paso 7 — Cierre ──────────────────────────────────────────────────────────
  const confirmarPaso7 = useCallback(async (
    campos: Omit<TrfPaso7Data, 'completadoEn' | 'fotoEntrega'>,
    archivo?: File,
  ) => {
    if (!user || !gestoriaId) return
    setGuardando(true)
    try {
      let fotoEntrega: FotoWorkflow | undefined
      if (archivo) {
        fotoEntrega = await subirFoto(
          archivo,
          `${gestoriaId}/transferencias/${tramiteId}/paso7/entrega_${Date.now()}.jpg`,
          user.uid,
          p => setProgreso(p),
        )
      }
      await confirmarTrfPaso7(tramiteId, gestoriaId, {
        ...campos,
        fotoEntrega,
        completadoPor: user.uid, completadoPorNombre: nombreUsuario,
      }, workflow?.iniciadoPor ?? '')
      toast.success('Transferencia completada y archivada ✓')
    } catch { toast.error('Error al cerrar el trámite') }
    finally { setGuardando(false); setProgreso(0) }
  }, [tramiteId, gestoriaId, user, nombreUsuario, workflow])

  // ── Asignar gestor ───────────────────────────────────────────────────────────
  const asignarGestor = useCallback(async (gestorId: string, gestorNombre: string) => {
    await asignarGestorTransferencia(tramiteId, gestorId, gestorNombre)
      .then(() => toast.success('Gestor asignado'))
      .catch(() => toast.error('Error al asignar gestor'))
  }, [tramiteId])

  return {
    workflow, loading, guardando, error, progreso,
    pasoActual: workflow?.pasoActual ?? 1,
    confirmarPaso1, confirmarPaso2, confirmarPaso3,
    agregarSeguimiento, confirmarReciboListo,
    confirmarPaso5, confirmarPaso6, confirmarPaso7,
    asignarGestor,
  }
}