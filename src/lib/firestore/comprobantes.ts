// src/lib/firestore/comprobantes.ts
// ─── COMPROBANTES DE PAGO ────────────────────────────────────────────────────
//
// Dos tipos:
//   · cobro_cliente   → respaldo de un recibo (transferencia, tarjeta, MP)
//   · pago_encargado  → respaldo de una liquidación de comisiones
//
// El comprobante SIEMPRE apunta a algo: un recibo o una liquidación. Un
// comprobante suelto no sirve para controlar nada.
//
// Se guarda el archivo en Storage y un documento en `comprobantes` con los
// metadatos. En el recibo se marca `tieneComprobante: true` para poder listar
// rápido los que faltan.

import {
  collection, addDoc, updateDoc, doc, query, where, getDocs,
  onSnapshot, serverTimestamp, limit, orderBy,
  type Timestamp, type Unsubscribe,
} from 'firebase/firestore'
import { ref as sRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { comprimirImagen } from '@/utils/comprimirImagen'

export const comprobantesCol = collection(db, 'comprobantes')

export type TipoComprobante = 'cobro_cliente' | 'pago_encargado'

/** Métodos donde el comprobante tiene sentido. En efectivo no hay nada que adjuntar. */
export const METODOS_CON_COMPROBANTE = ['transferencia', 'tarjeta', 'mercadopago', 'cheque', 'mixto']

export const requiereComprobante = (metodo?: string) =>
  !!metodo && METODOS_CON_COMPROBANTE.includes(metodo)

const MAX_MB = 10
const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']

export interface Comprobante {
  id:          string
  gestoriaId:  string
  tipo:        TipoComprobante
  // A qué respalda
  reciboId?:        string
  liquidacionId?:   string
  tramiteId?:       string
  clienteId?:       string
  encargadoId?:     string
  // Datos del pago (desnormalizados para listar sin joins)
  monto:       number
  formaPago:   string
  patente?:    string
  referencia?: string       // "Julian Zeiss", "REC-2026-0142", etc.
  // Archivo
  url:         string
  path:        string
  mime:        string
  nombre:      string
  bytes:       number
  // Control
  subidoPor:        string
  subidoPorNombre:  string
  creadoEn:         Timestamp
  verificado?:      boolean
  verificadoPor?:   string
  verificadoEn?:    Timestamp
}

// ─── VALIDACIÓN ───────────────────────────────────────────────────────────────

export function validarArchivo(f: File): string | null {
  if (!TIPOS_OK.includes(f.type) && !/\.(jpe?g|png|webp|heic|pdf)$/i.test(f.name)) {
    return 'Formato no admitido. Usá JPG, PNG o PDF.'
  }
  if (f.size > MAX_MB * 1024 * 1024) {
    return `El archivo supera los ${MAX_MB} MB.`
  }
  return null
}

// ─── SUBIDA ───────────────────────────────────────────────────────────────────

/**
 * Sube el archivo y devuelve sus datos. NO crea el documento: eso se hace
 * cuando ya se conoce el reciboId, para que nunca quede un comprobante suelto.
 *
 * Las imágenes se comprimen; los PDF van tal cual.
 */
export async function subirArchivoComprobante(
  file: File,
  gestoriaId: string,
  onProgreso?: (pct: number) => void,
): Promise<{ url: string; path: string; mime: string; nombre: string; bytes: number }> {
  const err = validarArchivo(file)
  if (err) throw new Error(err)

  const esImagen = file.type.startsWith('image/')
  const final = esImagen ? await comprimirImagen(file).catch(() => file) : file

  const mes  = new Date().toISOString().slice(0, 7)          // 2026-09
  const ext  = (final.name.split('.').pop() || (esImagen ? 'jpg' : 'pdf')).toLowerCase()
  const uid  = crypto.randomUUID()
  const path = `${gestoriaId}/comprobantes/${mes}/${uid}.${ext}`

  const task = uploadBytesResumable(sRef(storage, path), final, {
    contentType: final.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg'),
  })

  await new Promise<void>((resolve, reject) => {
    task.on('state_changed',
      s => onProgreso?.(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
      reject,
      () => resolve(),
    )
  })

  return {
    url:    await getDownloadURL(task.snapshot.ref),
    path,
    mime:   final.type,
    nombre: file.name,
    bytes:  final.size,
  }
}

// ─── REGISTRO ─────────────────────────────────────────────────────────────────

export type ArchivoSubido = Awaited<ReturnType<typeof subirArchivoComprobante>>

export async function registrarComprobante(
  archivo: ArchivoSubido,
  datos: Omit<Comprobante, 'id' | 'creadoEn' | 'url' | 'path' | 'mime' | 'nombre' | 'bytes'>,
): Promise<string> {
  const ref = await addDoc(comprobantesCol, {
    ...datos,
    ...archivo,
    verificado: false,
    creadoEn: serverTimestamp(),
  })

  // Marca en el recibo o la liquidación, para listar rápido los que faltan
  if (datos.reciboId) {
    await updateDoc(doc(db, 'recibos', datos.reciboId), {
      tieneComprobante: true,
      comprobanteId:    ref.id,
    }).catch(e => console.warn('[comprobante] no se pudo marcar el recibo:', e))
  }
  if (datos.liquidacionId) {
    await updateDoc(doc(db, 'liquidacionesEncargado', datos.liquidacionId), {
      tieneComprobante: true,
      comprobanteId:    ref.id,
    }).catch(e => console.warn('[comprobante] no se pudo marcar la liquidación:', e))
  }

  return ref.id
}

/** Para adjuntar después: al recibo que se cargó sin comprobante. */
export async function adjuntarARecibo(
  file: File,
  recibo: {
    id: string; gestoriaId: string; monto: number; formaPago: string
    tramiteId?: string; clienteId?: string; patente?: string; numeroRecibo?: string
  },
  usuario: { uid: string; nombre: string },
  onProgreso?: (pct: number) => void,
): Promise<string> {
  const archivo = await subirArchivoComprobante(file, recibo.gestoriaId, onProgreso)
  return registrarComprobante(archivo, {
    gestoriaId: recibo.gestoriaId,
    tipo:       'cobro_cliente',
    reciboId:   recibo.id,
    tramiteId:  recibo.tramiteId,
    clienteId:  recibo.clienteId,
    monto:      recibo.monto,
    formaPago:  recibo.formaPago,
    patente:    recibo.patente,
    referencia: recibo.numeroRecibo,
    subidoPor:       usuario.uid,
    subidoPorNombre: usuario.nombre,
  })
}

export async function marcarVerificado(id: string, uid: string): Promise<void> {
  await updateDoc(doc(comprobantesCol, id), {
    verificado: true, verificadoPor: uid, verificadoEn: serverTimestamp(),
  })
}

// ─── LECTURA ──────────────────────────────────────────────────────────────────

export function subscribeComprobantes(
  gestoriaId: string,
  tipo: TipoComprobante,
  callback: (c: Comprobante[]) => void,
): Unsubscribe {
  if (!gestoriaId) { callback([]); return () => {} }
  return onSnapshot(
    query(comprobantesCol,
      where('gestoriaId', '==', gestoriaId),
      where('tipo', '==', tipo),
      orderBy('creadoEn', 'desc'),
      limit(300)),
    s => callback(s.docs.map(d => ({ ...d.data(), id: d.id }) as Comprobante)),
    e => { console.error('[comprobantes]', e.code); callback([]) },
  )
}

/**
 * Recibos que deberían tener comprobante y no lo tienen. Es el control que
 * justifica el módulo: sin esto, el respaldo es voluntario y nadie lo mira.
 */
export async function getRecibosSinComprobante(
  gestoriaId: string,
  desde?: Date,
): Promise<any[]> {
  const snap = await getDocs(query(
    collection(db, 'recibos'),
    where('gestoriaId', '==', gestoriaId),
    limit(3000),
  ))
  const d0 = desde?.getTime() ?? 0
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as any)
    .filter(r =>
      !r.tieneComprobante &&
      requiereComprobante(r.formaPago) &&
      Number(r.monto ?? 0) > 0 &&
      (r.creadoEn?.toMillis?.() ?? 0) >= d0)
    .sort((a, b) => (b.creadoEn?.toMillis?.() ?? 0) - (a.creadoEn?.toMillis?.() ?? 0))
}


// ─── REGLAS ───────────────────────────────────────────────────────────────────
/*
FIRESTORE (firestore.rules):

    match /comprobantes/{id} {
      allow read:   if isStaff() && docDeMiGestoria();
      allow create: if isStaff() && nuevaDocDeMiGestoria()
                    && request.resource.data.subidoPor == request.auth.uid;
      // Solo se puede marcar como verificado; el archivo no se reemplaza
      allow update: if isAdmin() && docDeMiGestoria()
                    && request.resource.data.diff(resource.data).affectedKeys()
                       .hasOnly(['verificado','verificadoPor','verificadoEn']);
      allow delete: if false;
    }

STORAGE (storage.rules) — ANTES del catch-all, porque la primera regla que
coincide gana. Esto cierra los comprobantes aunque el resto siga abierto:

    function perfil() {
      return firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data;
    }

    match /{gestoriaId}/comprobantes/{mes}/{archivo} {
      allow read:  if request.auth != null && perfil().gestoriaId == gestoriaId;
      allow write: if request.auth != null && perfil().gestoriaId == gestoriaId
                   && request.resource.size < 10 * 1024 * 1024
                   && (request.resource.contentType.matches('image/.*')
                       || request.resource.contentType == 'application/pdf');
      allow delete: if false;
    }

Leer Firestore desde Storage requiere habilitarlo una vez:
  firebase deploy --only storage
y aceptar el permiso cross-service que pide la consola.

ÍNDICES:
  comprobantes: gestoriaId ASC, tipo ASC, creadoEn DESC
*/