// functions/src/whatsapp/media.ts
// ─── MEDIA ENTRANTE: descargar de Meta → guardar en Storage ──────────────────
// Meta manda solo un media_id; el archivo se baja en 2 pasos (media_id → URL
// temporal → binario, ambos con el token de Meta) y se sube a Firebase Storage
// con un download token permanente, para que la Bandeja lo muestre.
//
// La URL devuelta funciona sin reglas (acceso por token), y la escritura la hace
// el Admin SDK (que saltea las reglas de Storage).

import * as admin from 'firebase-admin'
import axios from 'axios'
import { randomUUID } from 'crypto'
import { getMetaToken } from '../utils/Utils'

const META_API_BASE = 'https://graph.facebook.com/v20.0'
const BUCKET = process.env.STORAGE_BUCKET || 'gestorapp-paz.firebasestorage.app'

const EXT_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr',
  'video/mp4': 'mp4', 'application/pdf': 'pdf',
}
function extDeMime(m: string): string {
  return EXT_POR_MIME[(m || '').split(';')[0].trim()] ?? 'bin'
}

export async function descargarYGuardarMedia(p: {
  mediaId:     string
  mime:        string
  gestoriaId:  string
  telefono:    string
  waMessageId: string
}): Promise<string | null> {
  try {
    const token = getMetaToken()

    // 1) media_id → URL temporal de Meta
    const meta = await axios.get(`${META_API_BASE}/${p.mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const url = meta.data?.url
    if (!url) return null

    // 2) descargar el binario (requiere el mismo token)
    const bin = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'arraybuffer',
    })
    const buffer = Buffer.from(bin.data as ArrayBuffer)

    // 3) subir a Storage con download token permanente
    const ext  = extDeMime(p.mime)
    const path = `${p.gestoriaId}/whatsapp/${p.telefono}/${p.waMessageId}.${ext}`
    const bucket = admin.storage().bucket(BUCKET)
    const file = bucket.file(path)
    const downloadToken = randomUUID()
    await file.save(buffer, {
      resumable: false,
      metadata: {
        contentType: p.mime,
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    })

    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`
  } catch (e: any) {
    console.warn('[WA media] no se pudo descargar/guardar:', e?.message)
    return null
  }
}