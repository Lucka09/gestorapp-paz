// extension/background.js
// Service worker que recibe mensajes del content script y maneja la cola de descargas.

import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

if (!getApps().length) initializeApp()
const db = getFirestore()

// Cola global de descargas por trámite
const colas = new Map()

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.tipo === 'GP_DESCARGAR_CUPONES') {
    iniciarCola(msg.tramiteId, msg.nroCausas, sender.tab.id)
    sendResponse({ ok: true, enCola: msg.nroCausas.length })
    return true
  }

  if (msg.tipo === 'GP_PAUSAR_DESCARGA') {
    const cola = colas.get(msg.tramiteId)
    if (cola) {
      cola.pausado = true
      db.collection('descargaCupones').doc(msg.tramiteId).update({
        estadoGeneral: 'pausado',
        pausadoEn: new Date(),
      })
    }
    sendResponse({ ok: true })
    return true
  }

  if (msg.tipo === 'GP_REANUDAR_DESCARGA') {
    const cola = colas.get(msg.tramiteId)
    if (cola && cola.pausado) {
      cola.pausado = false
      db.collection('descargaCupones').doc(msg.tramiteId).update({
        estadoGeneral: 'en_progreso',
        pausadoEn: null,
      })
      procesarCola(msg.tramiteId)
    }
    sendResponse({ ok: true })
    return true
  }

  if (msg.tipo === 'GP_CANCELAR_DESCARGA') {
    const cola = colas.get(msg.tramiteId)
    if (cola) {
      cola.cancelado = true
      db.collection('descargaCupones').doc(msg.tramiteId).update({
        estadoGeneral: 'cancelado',
        canceladoEn: new Date(),
        canceladoPor: cola.uid,
      })
    }
    sendResponse({ ok: true })
    return true
  }

  return false
})

async function iniciarCola(tramiteId, nroCausas, tabId) {
  const cola = {
    tramiteId,
    tabId,
    nroCausas: [...nroCausas],
    procesados: 0,
    pausado: false,
    cancelado: false,
    uid: '', // se setea desde el mensaje
  }
  colas.set(tramiteId, cola)
  await procesarCola(tramiteId)
}

async function procesarCola(tramiteId) {
  const cola = colas.get(tramiteId)
  if (!cola || cola.cancelado) return

  while (cola.nroCausas.length > 0 && !cola.pausado && !cola.cancelado) {
    const item = cola.nroCausas.shift()
    try {
      await descargarYSubir(cola, item)
      cola.procesados++
      // Notificar al tab del progreso
      chrome.tabs.sendMessage(cola.tabId, {
        tipo: 'GP_PROGRESO_CUPON',
        tramiteId,
        nroCausa: item.nroCausa,
        estado: 'ok',
        procesados: cola.procesados,
        total: cola.procesados + cola.nroCausas.length,
      })
    } catch (err) {
      console.error(`[descarga-cupones] error en ${item.nroCausa}:`, err)
      chrome.tabs.sendMessage(cola.tabId, {
        tipo: 'GP_PROGRESO_CUPON',
        tramiteId,
        nroCausa: item.nroCausa,
        estado: 'error',
        error: err.message,
        procesados: cola.procesados,
        total: cola.procesados + cola.nroCausas.length,
      })
    }
    // Delay entre descargas para no saturar el portal
    await sleep(2000)
  }

  if (cola.nroCausas.length === 0 && !cola.cancelado) {
    console.log(`[descarga-cupones] Cola ${tramiteId} completada`)
    colas.delete(tramiteId)
  }
}

async function descargarYSubir(cola, item) {
  // 1. Marcar item como "descargando" en Firestore
  await db.collection('descargaCupones').doc(cola.tramiteId).update({
    [`items.${item.nroCausa}.estado`]: 'descargando',
  })

  // 2. Fetch del PDF desde el portal (con cookies de sesión)
  const url = `https://infraccionesba.gba.gob.ar/rest/generar-cupon?nroCausa=${encodeURIComponent(item.nroCausa)}`
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'Accept': 'application/pdf',
    },
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }

  const blob = await res.blob()
  const base64 = await blobToBase64(blob)

  // 3. Marcar item como "subiendo"
  await db.collection('descargaCupones').doc(cola.tramiteId).update({
    [`items.${item.nroCausa}.estado`]: 'subiendo',
  })

  // 4. POST a la función subirCuponInfraccion
  const subirUrl = 'https://us-central1-gestorapp-paz.cloudfunctions.net/subirCuponInfraccion'
  const token = await getToken()
  const subirRes = await fetch(subirUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      data: {
        tramiteId: cola.tramiteId,
        nroCausa: item.nroCausa,
        nroActa: item.nroActa,
        pdfBase64: base64,
      },
    }),
  })

  if (!subirRes.ok) {
    const errText = await subirRes.text()
    throw new Error(`Función falló: ${errText}`)
  }

  const result = await subirRes.json()
  return result
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function getToken() {
  // Obtener el ID token de Firebase Auth (necesita que el usuario esté logueado)
  // Esto es un placeholder — en producción hay que integrarlo con Firebase Auth JS SDK
  return 'PLACEHOLDER_TOKEN'
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}