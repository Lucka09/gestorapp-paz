// extension/bridge.js
// Puente app ↔ extensión en el dominio de GestorApp.
(function () {
  // 0) Marca este equipo como "con extensión" para que la app publique el token.
  //    puenteExtension.ts solo emite el ID token si localStorage.gp_ext === '1'.
  //    (los content scripts comparten el localStorage del origen de la página).
  try { window.localStorage.setItem('gp_ext', '1') } catch (e) {}

  // 1) Avisa que la extensión está lista (por si el login ya ocurrió).
  window.postMessage({ source: 'GP_EXT_READY' }, window.location.origin)

  // 2) Escucha el token publicado por la app y lo persiste.
  window.addEventListener('message', function (e) {
    if (e.origin !== window.location.origin) return
    var m = e.data
    if (m && m.source === 'GESTORAPP_TOKEN') {
      if (m.token) chrome.storage.local.set({ gpToken: m.token })
      else chrome.storage.local.remove('gpToken')
      return
    }

    // 3) Comandos de descarga de cupones → chrome.storage.local.
    //    El postMessage de la app NO cruza tabs; content.js (en el portal)
    //    los recibe vía chrome.storage.onChanged.
    var TIPOS = [
      'GP_INICIAR_DESCARGA_CUPONES',
      'GP_PAUSAR_DESCARGA_CUPONES',
      'GP_REANUDAR_DESCARGA_CUPONES',
      'GP_CANCELAR_DESCARGA_CUPONES',
    ]
    if (m && TIPOS.indexOf(m.tipo) !== -1) {
      chrome.storage.local.set({
        gpComandoDescarga: Object.assign({ ts: Date.now() }, m),
      })
    }
  })

  // 4) Relay de captura CABA: el portal la escribe en chrome.storage;
  //    la reenviamos a la app por postMessage (postMessage no cruza pestañas,
  //    chrome.storage sí) para que PresupuestoMultas la reciba y sume la fila.
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local' || !changes.gpCabaCaptura) return
    var v = changes.gpCabaCaptura.newValue
    if (v && v.payload) {
      window.postMessage({ type: 'GP_CABA_CAPTURADO', payload: v.payload }, window.location.origin)
    }
  })
})()