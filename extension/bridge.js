// bridge.js — content script en el origen de GestorApp (la app, no el portal).
// Captura el ID token que publica src/lib/puenteExtension.ts y lo guarda en
// chrome.storage.local como `gpToken`, que content.js usa para autenticarse
// contra las Cloud Functions (colaProximaConsulta / guardarConsultaInfraccion).

(function () {
  // 1) Marca este equipo para que GestorApp habilite la difusión del token.
  try { localStorage.setItem('gp_ext', '1'); } catch (e) { /* no-op */ }

  // 2) Avisa que la extensión está lista (por si el login ya ocurrió).
  window.postMessage({ source: 'GP_EXT_READY' }, window.location.origin);

  // 3) Escucha el token publicado por la app y lo persiste.
  window.addEventListener('message', function (e) {
    if (e.origin !== window.location.origin) return;
    var m = e.data;
    if (!m || m.source !== 'GESTORAPP_TOKEN') return;
    if (m.token) {
      chrome.storage.local.set({ gpToken: m.token });
    } else {
      chrome.storage.local.remove('gpToken');
    }
  });
})();