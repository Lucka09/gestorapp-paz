// interceptor.js — se inyecta en el CONTEXTO DE LA PÁGINA (no del content script).
// Objetivo:
//   1) Reescribir cantPorPagina=10 → 100 para traer TODAS las actas con un solo
//      captcha (el token es de un solo uso; no podemos pedir la página 2).
//   2) Capturar la respuesta JSON de /rest/consultar-infraccion y pasarla al
//      content script vía window.postMessage.
//
// No tocamos ni el token de reCAPTCHA ni la cookie JSESSIONID: los maneja la
// propia página. Solo espiamos y ajustamos el tamaño de página.

(() => {
  const ENDPOINT = '/rest/consultar-infraccion'
  const originalFetch = window.fetch

  window.fetch = async function (input, init) {
    let url = typeof input === 'string' ? input : (input && input.url) || ''

    if (url.includes(ENDPOINT)) {
      // 1 solve = todas las actas
      const urlReescrita = url.replace(/cantPorPagina=\d+/, 'cantPorPagina=100')

      // Reconstruir el input respetando su forma original (string o Request)
      let nuevoInput = urlReescrita
      if (typeof input !== 'string' && input) {
        try {
          nuevoInput = new Request(urlReescrita, input)
        } catch {
          nuevoInput = urlReescrita
        }
      }

      const respuesta = await originalFetch(nuevoInput, init)

      // Clonar para no consumir el body que usa la propia página
      respuesta
        .clone()
        .json()
        .then((data) => {
          window.postMessage(
            { source: 'GP_INFRACCIONES', tipo: 'ACTAS_CAPTURADAS', data },
            window.location.origin
          )
        })
        .catch((err) => {
          window.postMessage(
            { source: 'GP_INFRACCIONES', tipo: 'ERROR_PARSEO', mensaje: String(err) },
            window.location.origin
          )
        })

      return respuesta
    }

    return originalFetch.call(this, input, init)
  }

  window.postMessage({ source: 'GP_INFRACCIONES', tipo: 'INTERCEPTOR_LISTO' }, window.location.origin)
})()