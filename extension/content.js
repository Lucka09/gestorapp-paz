// content.js — puente entre la página del portal y GestorApp.
// URLs Gen2 (Cloud Run) — cada función tiene su propia URL única.
const URL_COLA_PROXIMA  = 'https://colaproximaconsulta-jgbhipicma-uc.a.run.app'
const URL_GUARDAR_ACTAS = 'https://guardarconsultainfraccion-jgbhipicma-uc.a.run.app'
const SEL_INPUT_DOMINIO = 'input[name="dominio"], #dominio'

// ── URLs y reglas CABA ──────────────────────────────────────────────────────
const URL_CABA_CONSULTA = 'buenosaires.gob.ar/licenciasdeconducir/consulta-de-infracciones'
const URL_CABA_LEGAJO   = 'buenosaires.gob.ar/comprobante-de-legajo'
const UMBRAL_CABA            = 300_000
const MULT_PUNTOS_ROJOS      = 2.25
const PCT_PAGO_MENOR_UMBRAL  = 0.70
const PCT_PAGO_MAYOR_UMBRAL  = 0.67

let consultaActual = null

// ─── 1. Inyectar el interceptor en el contexto de la página (solo PBA) ──────
if (window.location.hostname.includes('infraccionesba.gba.gob.ar')) {
  function inyectarInterceptor() {
    const s = document.createElement('script')
    s.src = chrome.runtime.getURL('interceptor.js')
    s.onload = () => s.remove()
    ;(document.head || document.documentElement).appendChild(s)
  }
  inyectarInterceptor()
}

// ── Auth helper ─────────────────────────────────────────────────────────────
async function getToken() {
  const { gpToken } = await chrome.storage.local.get('gpToken')
  console.log('[GestorApp] gpToken:', gpToken ? '✅ PRESENTE' : '❌ AUSENTE')
  return gpToken || null
}
async function apiFetch(url, options = {}) {
  const token = await getToken()
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
}
// ─── 2. Traer la próxima consulta de la cola ─────────────────────────────────
async function traerProximaConsulta() {
  try {
    const res = await apiFetch(URL_COLA_PROXIMA)
    console.log('[GestorApp] colaProximaConsulta status:', res.status)
    if (res.status === 401) {
      renderEstado('⚠️ Token vencido. Abrí GestorApp y recargá.')
      return null
    }
    if (!res.ok) {
      renderEstado(`⚠️ Error ${res.status} al leer la cola.`)
      return null
    }
    const data = await res.json()
    console.log('[GestorApp] cola response:', data)
    return data.consulta || null
  } catch (e) {
    console.warn('[GestorApp] No se pudo traer la cola:', e)
    renderEstado('️ Sin conexión con GestorApp.')
    return null
  }
}
// ─── 3. Enviar las actas capturadas a GestorApp (solo PBA) ───────────────────
async function enviarActas(raw) {
  if (!consultaActual) {
    console.warn('[GestorApp] Actas capturadas sin consulta activa — se ignoran')
    return
  }
  try {
    const res = await apiFetch(URL_GUARDAR_ACTAS, {
      method: 'POST',
      body: JSON.stringify({
        consultaId: consultaActual.id,
        dominio: consultaActual.tipoConsulta === 'dni' ? '' : consultaActual.dominio,
        raw,
      }),
    })
    if (res.ok) {
      renderEstado('✅ Enviado. Cargando siguiente…')
      consultaActual = null
      setTimeout(cargarSiguiente, 1200)
    } else {
      renderEstado(`⚠️ Error ${res.status} al enviar. Reintentá.`)
    }
  } catch (e) {
    renderEstado('⚠️ Sin conexión con GestorApp. Reintentá.')
    console.warn('[GestorApp] enviarActas:', e)
  }
}
// ─── 4. Autocompletar el portal PBA (dominio O documento) ───────────────────
function setValorReact(el, valor) {
  const proto = el instanceof window.HTMLSelectElement
    ? window.HTMLSelectElement.prototype
    : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
  setter.call(el, valor)
  el.dispatchEvent(new Event('input',  { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}
function autocompletarDominio(dominio) {
  const input = document.querySelector(SEL_INPUT_DOMINIO)
  if (!input) { renderEstado('️ No encuentro el campo de dominio.'); return }
  setValorReact(input, dominio)
  input.focus()
  renderEstado(`Dominio ${dominio} cargado. Resolvé el captcha y tocá Buscar.`)
}
function porTexto(selector, regex) {
  return Array.from(document.querySelectorAll(selector))
    .find(el => regex.test((el.textContent || '').trim()))
}
function autocompletarDocumento({ dni, tipoDocumento, genero }) {
  const faltantes = []
  const tabs = document.querySelectorAll('.nav-tabs .nav-link, .tab-button, [role="tab"], button')
  const tabDoc = Array.from(tabs).find(el => /documento/i.test(el.textContent || ''))
  if (tabDoc) { tabDoc.click() } else { faltantes.push('Tab Documento') }
  setTimeout(() => {
    const selectTipo = document.querySelector(
      'select[name="tipoDocumento"], select[id*="tipo"], select[id*="Tipo"]'
    ) || Array.from(document.querySelectorAll('select')).find(s =>
      Array.from(s.options).some(o => /DNI/i.test(o.text))
    )
    if (selectTipo) {
      const tipo = tipoDocumento || 'DNI'
      const opt = Array.from(selectTipo.options).find(o =>
        o.text.trim().toUpperCase() === tipo.toUpperCase() || o.value === '0'
      )
      if (opt) setValorReact(selectTipo, opt.value)
      else faltantes.push('Tipo')
    } else { faltantes.push('Tipo') }
    const inputNro = document.querySelector(
      'input[name="nroDocumento"], input[placeholder*="olo números"], ' +
      'input[placeholder*="úmero"], input[type="number"], input[inputmode="numeric"]'
    )
    if (inputNro && dni) setValorReact(inputNro, String(dni))
    else if (!inputNro) faltantes.push('Número')
    if (genero) {
      const radio = document.querySelector(`input[type="radio"][value="${genero}"]`)
                 || document.querySelector(`input[type="radio"][name*="enero"][value="${genero}"]`)
      if (radio) { radio.click() }
      else {
        const etiqueta = genero === 'M' ? /masculino/i
                       : genero === 'F' ? /femenino/i
                       : /no\s*binario|^x/i
        const label = porTexto('label', etiqueta)
        const radioLabel = label
          ? (label.querySelector('input[type="radio"]') ||
             document.getElementById(label.getAttribute('for') || ''))
          : null
        if (radioLabel) { radioLabel.click() }
        else { faltantes.push('Género') }
      }
    }
    if (faltantes.length) {
      renderEstado(`Cargá a mano: ${faltantes.join(', ')}. Luego captcha + Buscar. (DNI ${dni})`)
    } else {
      renderEstado(`DNI ${dni} cargado. Resolvé el captcha y tocá Buscar.`)
    }
  }, 300)
}
function cargarEnPortal() {
  if (!consultaActual) return
  if (consultaActual.tipoConsulta === 'dni') {
    autocompletarDocumento(consultaActual)
  } else {
    autocompletarDominio(consultaActual.dominio)
  }
}
// ─── Escuchar los mensajes del interceptor (solo PBA) ────────────────────────
if (window.location.hostname.includes('infraccionesba.gba.gob.ar')) {
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return
    const msg = event.data
    if (!msg || msg.source !== 'GP_INFRACCIONES') return
    if (msg.tipo === 'ACTAS_CAPTURADAS') {
      enviarActas(msg.data)
    } else if (msg.tipo === 'ERROR_PARSEO') {
      renderEstado('⚠️ El portal devolvió algo inesperado. Revisá manualmente.')
    }
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// CABA — AUTOCOMPLETADO + PASO 1 (consulta) + PASO 2 (legajo)
// ═══════════════════════════════════════════════════════════════════════════════

const isCABAConsulta = window.location.href.includes(URL_CABA_CONSULTA)
const isCABALegajo   = window.location.href.includes(URL_CABA_LEGAJO)
const isCABA         = isCABAConsulta || isCABALegajo

if (isCABA) {
  // ─── 6.1 Autocompletar portal CABA ───────────────────────────────────────
  function setValorReactCABA(el, valor) {
    const proto = el instanceof window.HTMLSelectElement
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    setter.call(el, valor)
    el.dispatchEvent(new Event('input',  { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function autocompletarCABA(consulta) {
    if (!consulta) return

    if (consulta.tipoConsulta === 'dni') {
      // 1. Click en tab "Un documento"
      const tabs = Array.from(document.querySelectorAll('button, [role="tab"], a, span'))
        .filter(el => /documento|dni|un documento/i.test(el.textContent || ''))
      if (tabs[0]) { tabs[0].click(); console.log('[GestorApp CABA] Tab documento clickeado') }

      setTimeout(() => {
        // 2. Seleccionar tipo de documento "DNI"
        const selects = Array.from(document.querySelectorAll('select'))
        const selectTipo = selects.find(s =>
          Array.from(s.options).some(o => /DNI|documento/i.test(o.text))
        )
        if (selectTipo) {
          const optDNI = Array.from(selectTipo.options).find(o =>
            /DNI/i.test(o.text) || o.value === 'DNI'
          )
          if (optDNI) setValorReactCABA(selectTipo, optDNI.value)
        }

        // 3. Completar número de DNI
        const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"], input:not([type])'))
        const inputDNI = inputs.find(inp =>
          /n[úu]mero|documento|dni/i.test(inp.placeholder || inp.name || inp.id || '') ||
          inp.getAttribute('aria-label')?.toLowerCase().includes('documento')
        )
        if (inputDNI && consulta.dni) {
          setValorReactCABA(inputDNI, String(consulta.dni))
          console.log('[GestorApp CABA] DNI cargado:', consulta.dni)
        }

        renderEstado(`DNI ${consulta.dni} cargado en CABA. Resolvé el captcha y tocá Consultar.`)
      }, 400)

    } else {
      // Consulta por dominio/patente
      const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'))
      const inputPatente = inputs.find(inp =>
        /patente|dominio/i.test(inp.placeholder || inp.name || inp.id || '') ||
        inp.getAttribute('aria-label')?.toLowerCase().includes('patente')
      )
      if (inputPatente && consulta.dominio) {
        setValorReactCABA(inputPatente, consulta.dominio.toUpperCase().replace(/\s/g, ''))
        console.log('[GestorApp CABA] Patente cargada:', consulta.dominio)
        renderEstado(`Patente ${consulta.dominio} cargada en CABA. Resolvé el captcha y tocá Consultar.`)
      } else {
        renderEstado('⚠️ No encuentro el campo de patente en CABA. Cargalo a mano.')
      }
    }
  }

  function cargarEnPortalCABA() {
    if (!consultaActual) return
    autocompletarCABA(consultaActual)
  }

  // ─── 6.2 Helpers de scraping CABA ────────────────────────────────────────
  function extraerMontoNoTachado() {
    const candidatos = Array.from(document.querySelectorAll('span, div, p, td, strong, b, h1, h2, h3, h4'))
    const validos = candidatos.filter(el => {
      const texto = el.textContent.trim()
      const estilo = window.getComputedStyle(el)
      const tienePrecio = /\$?\s?\d{1,3}(\.\d{3})*(,\d{1,2})?/.test(texto)
      const noTachado =
        estilo.textDecoration !== 'line-through' &&
        estilo.textDecorationLine !== 'line-through' &&
        !el.closest('[style*="line-through"]') &&
        !el.closest('[style*="text-decoration"]') &&
        !el.closest('del') &&
        !el.closest('s')
      return tienePrecio && noTachado
    })
    if (validos.length === 0) return null
    const texto = validos[validos.length - 1].textContent
    return parseFloat(texto.replace(/[^0-9,]/g, '').replace(',', '.'))
  }

  function detectarPuntosRojos() {
    const html = document.body.innerHTML.toLowerCase()
    return (
      html.includes('puntos rojos') ||
      html.includes('falta especial') ||
      html.includes('no apta') ||
      html.includes('miba') ||
      html.includes('comprobante de legajo') ||
      html.includes('actas por faltas especiales')
    )
  }

  function extraerActasDeTablaCABA() {
    const tablas = Array.from(document.querySelectorAll('table'))
    const tablaResultados = tablas.find(t => {
      const html = t.innerHTML.toLowerCase()
      return html.includes('acta') || html.includes('importe') || html.includes('fecha')
    })
    if (!tablaResultados) return []

    const filas = Array.from(tablaResultados.querySelectorAll('tbody tr, tr'))
      .filter(tr => tr.children.length >= 3 && tr.children.length <= 8)

    return filas.map((fila, idx) => {
      const celdas = Array.from(fila.children)
      const nroActa = celdas.find(c => /\d{4,}/.test(c.textContent.trim()))?.textContent.trim() || `ACTA-${idx}`
      const textoImporte = celdas.find(c => /\$|,\d{2}$/.test(c.textContent.trim()))?.textContent.trim() || '0'
      const importe = parseFloat(textoImporte.replace(/[^0-9,]/g, '').replace(',', '.')) || 0
      return {
        id: `caba_${nroActa}_${Date.now()}`,
        nroActa,
        importeBase: importe,
        esPuntosRojos: false,
        fecha: celdas[0]?.textContent?.trim() || undefined,
        estado: celdas[celdas.length - 1]?.textContent?.trim() || undefined,
      }
    }).filter(a => a.importeBase > 0)
  }

  function calcularPorcentajeCABA(deudaTotal) {
    return deudaTotal <= UMBRAL_CABA ? PCT_PAGO_MENOR_UMBRAL : PCT_PAGO_MAYOR_UMBRAL
  }

    function enviarCABAAlFrontend(payload) {
    // chrome.storage SÍ cruza pestañas; bridge.js (en la app) lo escucha y lo
    // reinyecta en la página para que PresupuestoMultas lo reciba.
    chrome.storage.local.set({ gpCabaCaptura: { payload, ts: Date.now() } })

    console.log('[GestorApp CABA] Guardado en storage para la app:', payload)

    const n = document.createElement('div')
    n.textContent = '✅ CABA capturada — enviada al presupuesto'
    n.style.cssText =
      'position:fixed;bottom:20px;right:20px;z-index:999999;background:#10b981;color:#fff;' +
      'padding:12px 24px;border-radius:8px;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,.3);' +
      'font-family:system-ui,sans-serif;font-size:14px;'
    document.body.appendChild(n)
    setTimeout(() => n.remove(), 3000)
  }

  // ─── 6.3 PASO 1: Consulta de infracciones ────────────────────────────────
  if (isCABAConsulta) {
    function capturarPaso1() {
      console.log('[GestorApp CABA] Paso 1: extrayendo consulta...')
      const tienePuntosRojos = detectarPuntosRojos()
      const monto1 = extraerMontoNoTachado()
      const actas = extraerActasDeTablaCABA()

      const monto1Final = monto1 ?? actas.reduce((s, a) => s + a.importeBase, 0)

      if (monto1Final === 0 && actas.length === 0) {
        alert('⚠️ No se detectaron actas ni montos.\n\nAsegurate de haber resuelto el captcha y que la tabla de resultados esté visible.')
        return
      }

      sessionStorage.setItem('gp_caba_paso1', JSON.stringify({
        monto1: monto1Final,
        actas,
        tienePuntosRojos,
        timestamp: Date.now(),
      }))

      if (tienePuntosRojos) {
        alert(
          '⚠️ Se detectaron infracciones con Puntos Rojos.\n\n' +
          'La extensión lo redirigirá al portal de Comprobante de Legajo para completar la cotización.\n' +
          'Allí la extensión completará automáticamente el DNI/Patente. Vos solo tenés que tocar "Consultar".'
        )
        setTimeout(() => {
          window.location.href = 'https://buenosaires.gob.ar/comprobante-de-legajo/'
        }, 1500)
      } else {
        const deudaTotal = monto1Final
        const porcentaje = calcularPorcentajeCABA(deudaTotal)
        const montoACobrar = deudaTotal * porcentaje

        enviarCABAAlFrontend({
          jurisdiccion: 'CABA',
          actas,
          cantidad: actas.length,
          tienePuntosRojos: false,
          monto1: monto1Final,
          monto2: 0,
          deudaTotal,
          porcentajePagoCliente: porcentaje,
          montoACobrarAlCliente: montoACobrar,
          umbralAplicado: UMBRAL_CABA,
        })
      }
    }

    function observarResultadosCABA() {
      const observer = new MutationObserver(() => {
        const tabla = document.querySelector('table')
        const btnExistente = document.getElementById('gp-caba-btn-paso1')
        if (tabla && !btnExistente) {
          const btn = document.createElement('button')
          btn.id = 'gp-caba-btn-paso1'
          btn.textContent = '📥 Cotizar CABA (Paso 1)'
          btn.style.cssText =
            'position:fixed;top:10px;right:10px;z-index:99999;background:#F28F07;color:#fff;' +
            'padding:12px 20px;border:none;border-radius:8px;font-weight:700;cursor:pointer;' +
            'box-shadow:0 4px 12px rgba(0,0,0,.3);font-size:14px;font-family:system-ui,sans-serif;'
          btn.onclick = capturarPaso1
          document.body.appendChild(btn)
          console.log('[GestorApp CABA] Botón Paso 1 inyectado')
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }

    const btnPaso1 = document.createElement('button')
    btnPaso1.id = 'gp-caba-btn-paso1'
    btnPaso1.textContent = '📥 Cotizar CABA (Paso 1)'
    btnPaso1.style.cssText =
      'position:fixed;top:10px;right:10px;z-index:99999;background:#F28F07;color:#fff;' +
      'padding:12px 20px;border:none;border-radius:8px;font-weight:700;cursor:pointer;' +
      'box-shadow:0 4px 12px rgba(0,0,0,.3);font-size:14px;font-family:system-ui,sans-serif;'
    btnPaso1.onclick = capturarPaso1
    document.body.appendChild(btnPaso1)

    observarResultadosCABA()
  }

  // ─── 6.4 PASO 2: Comprobante de legajo (solo si hay puntos rojos) ────────
  if (isCABALegajo) {
    function extraerTotalLegajo() {
      const candidatos = Array.from(document.querySelectorAll('span, div, p, td, strong, b, [class*="total"], [class*="monto"], h1, h2, h3'))
      const validos = candidatos.filter(el => {
        const texto = el.textContent.trim()
        return /\$?\s?\d{1,3}(\.\d{3})*(,\d{1,2})?/.test(texto)
      })
      if (validos.length === 0) return 0
      const texto = validos[validos.length - 1].textContent
      return parseFloat(texto.replace(/[^0-9,]/g, '').replace(',', '.')) || 0
    }

    function capturarPaso2() {
      console.log('[GestorApp CABA] Paso 2: extrayendo comprobante de legajo...')
      const datosPaso1 = JSON.parse(sessionStorage.getItem('gp_caba_paso1') || 'null')

      if (!datosPaso1 || !datosPaso1.monto1) {
        alert(' No se encontraron datos del Paso 1.\n\nVolvé a iniciar desde el portal de consulta de infracciones.')
        return
      }

      const totalPuntosRojosBase = extraerTotalLegajo()

      if (totalPuntosRojosBase === 0) {
        const continuar = confirm(
          '⚠️ No se detectó un monto de puntos rojos en esta página.\n\n' +
          '¿Querés continuar con Monto 2 = $0?\n\n' +
          'Asegurate de haber resuelto la consulta y que el total sea visible.'
        )
        if (!continuar) return
      }

      const monto2 = totalPuntosRojosBase * MULT_PUNTOS_ROJOS
      const deudaTotal = datosPaso1.monto1 + monto2
      const porcentaje = calcularPorcentajeCABA(deudaTotal)
      const montoACobrar = deudaTotal * porcentaje

      console.log('[GestorApp CABA] Cálculos:', {
        monto1: datosPaso1.monto1,
        totalPuntosRojosBase,
        monto2,
        deudaTotal,
        porcentaje,
        montoACobrar,
      })

      const actasFinales = datosPaso1.actas.map(a => ({ ...a, esPuntosRojos: true }))

      sessionStorage.removeItem('gp_caba_paso1')

      enviarCABAAlFrontend({
        jurisdiccion: 'CABA',
        actas: actasFinales,
        cantidad: actasFinales.length,
        tienePuntosRojos: true,
        monto1: datosPaso1.monto1,
        monto2,
        deudaTotal,
        porcentajePagoCliente: porcentaje,
        montoACobrarAlCliente: montoACobrar,
        umbralAplicado: UMBRAL_CABA,
      })
    }

    function autocompletarLegajoCABA() {
      const datosPaso1 = JSON.parse(sessionStorage.getItem('gp_caba_paso1') || 'null')
      if (!datosPaso1) return
      if (consultaActual) {
        autocompletarCABA(consultaActual)
      }
    }

    const btnPaso2 = document.createElement('button')
    btnPaso2.id = 'gp-caba-btn-paso2'
    btnPaso2.textContent = '📥 Finalizar CABA (Paso 2)'
    btnPaso2.style.cssText =
      'position:fixed;top:10px;right:10px;z-index:99999;background:#D4621A;color:#fff;' +
      'padding:12px 20px;border:none;border-radius:8px;font-weight:700;cursor:pointer;' +
      'box-shadow:0 4px 12px rgba(0,0,0,.3);font-size:14px;font-family:system-ui,sans-serif;'
    btnPaso2.onclick = capturarPaso2
    document.body.appendChild(btnPaso2)

    setTimeout(autocompletarLegajoCABA, 800)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI: PANEL FLOTANTE (compartido, adaptado por portal)
// ═══════════════════════════════════════════════════════════════════════════════

let panel
function montarPanel() {
  panel = document.createElement('div')
  panel.style.cssText = [
    'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
    'width:280px', 'background:#fff', 'border:1px solid #e5e5e5',
    'border-radius:12px', 'box-shadow:0 4px 16px rgba(0,0,0,.12)',
    'font-family:system-ui,sans-serif', 'font-size:13px', 'color:#1a1a1a',
    'padding:14px', 'line-height:1.5',
  ].join(';')

  const portalLabel = isCABA ? 'CABA' : 'PBA'

  panel.innerHTML = `
    <div style="font-weight:600;color:#D4621A;margin-bottom:8px">
      GestorApp · Cola de consultas (${portalLabel})
    </div>
    <div id="gp-consulta" style="margin-bottom:8px;color:#555">Cargando cola…</div>
    <div id="gp-estado" style="margin-bottom:10px;color:#777;font-size:12px">&nbsp;</div>
    <div style="display:flex;gap:8px">
      <button id="gp-cargar" style="flex:1;background:#D4621A;color:#fff;border:none;border-radius:8px;padding:8px;cursor:pointer;font-weight:600">
        Cargar
      </button>
      <button id="gp-saltar" style="background:#f2f2f2;color:#555;border:none;border-radius:8px;padding:8px 10px;cursor:pointer">
        Saltar
      </button>
    </div>
  `
  document.body.appendChild(panel)
  panel.querySelector('#gp-cargar').addEventListener('click', () => {
    if (isCABA) cargarEnPortalCABA()
    else cargarEnPortal()
  })
  panel.querySelector('#gp-saltar').addEventListener('click', cargarSiguiente)
}

function renderConsulta() {
  const el = document.getElementById('gp-consulta')
  if (!el) return
  if (!consultaActual) { el.textContent = 'Cola vacía por ahora.'; return }
  const c = consultaActual
  const clave = c.tipoConsulta === 'dni'
    ? `DNI ${c.dni}${c.genero ? ` · ${c.genero}` : ''}`
    : c.dominio
  el.textContent = `Próximo: ${clave}${c.contacto?.nombre ? ` · ${c.contacto.nombre}` : ''}`
}

function renderEstado(texto) {
  const el = document.getElementById('gp-estado')
  if (el) el.textContent = texto
}

async function cargarSiguiente() {
  renderEstado('Buscando en la cola…')
  consultaActual = await traerProximaConsulta()
  renderConsulta()
  renderEstado(consultaActual ? 'Listo para cargar.' : 'Sin pendientes.')
}

if (document.body) {
  montarPanel()
  cargarSiguiente()
} else {
  document.addEventListener('DOMContentLoaded', () => {
    montarPanel()
    cargarSiguiente()
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESCARGA DE CUPONES (F2.2) — solo en portal PBA
// ═══════════════════════════════════════════════════════════════════════════════

if (window.location.hostname.includes('infraccionesba.gba.gob.ar')) {
  const URL_SUBIR_CUPON = 'https://us-central1-gestorapp-paz.cloudfunctions.net/subirCuponInfraccion'
  let descargaCuponesActiva = false
  let descargaCuponesPausada = false
  const procesadasOkEstaSesion = new Set()

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.gpComandoDescarga) return
    manejarComandoDescarga(changes.gpComandoDescarga.newValue)
  })

  function manejarComandoDescarga(cmd) {
    if (!cmd || !cmd.tipo) return
    if (cmd.tipo === 'GP_INICIAR_DESCARGA_CUPONES') {
      iniciarDescargaCupones(cmd.tramiteId, cmd.nroCausas || [])
      return
    }
    if (cmd.tipo === 'GP_PAUSAR_DESCARGA_CUPONES') {
      descargaCuponesPausada = true
      renderEstadoDescarga('️ Pausado')
      return
    }
    if (cmd.tipo === 'GP_REANUDAR_DESCARGA_CUPONES') {
      if (!descargaCuponesPausada) return
      descargaCuponesPausada = false
      renderEstadoDescarga('▶️ Reanudando…')
      procesarColaDescarga(cmd.tramiteId, cmd.nroCausas || [])
      return
    }
    if (cmd.tipo === 'GP_CANCELAR_DESCARGA_CUPONES') {
      descargaCuponesActiva = false
      descargaCuponesPausada = false
      renderEstadoDescarga('❌ Cancelado')
    }
  }

  async function iniciarDescargaCupones(tramiteId, nroCausas) {
    if (descargaCuponesActiva) {
      renderEstadoDescarga('⚠️ Ya hay una descarga en progreso')
      return
    }
    descargaCuponesActiva = true
    descargaCuponesPausada = false
    renderEstadoDescarga(`Descargando ${nroCausas.length} cupones…`)
    await procesarColaDescarga(tramiteId, nroCausas)
    descargaCuponesActiva = false
  }

  async function procesarColaDescarga(tramiteId, nroCausas) {
    const total = nroCausas.length
    let procesados = 0
    for (const item of nroCausas) {
      if (!descargaCuponesActiva || descargaCuponesPausada) break
      if (procesadasOkEstaSesion.has(item.nroCausa)) { procesados++; continue }
      try {
        await descargarYSubirCupon(tramiteId, item)
        procesadasOkEstaSesion.add(item.nroCausa)
        procesados++
        renderEstadoDescarga(`✅ ${procesados}/${total} procesados`)
      } catch (err) {
        procesados++
        renderEstadoDescarga(`⚠️ ${procesados}/${total} (error en ${item.nroCausa})`)
        console.error('[GestorApp] Error en cupón', item.nroCausa, err)
      }
      await sleep(2000)
    }
    if (descargaCuponesActiva && !descargaCuponesPausada && procesados === total) {
      renderEstadoDescarga(`✅ Completado: ${total} cupones`)
    }
  }

  async function descargarYSubirCupon(tramiteId, item) {
    const url = `https://infraccionesba.gba.gob.ar/rest/generar-cupon?nroCausa=${encodeURIComponent(item.nroCausa)}`
    const res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/pdf' } })
    if (!res.ok) throw new Error(`Portal HTTP ${res.status}`)
    const blob = await res.blob()
    const base64 = await blobToBase64(blob)

    const token = await getToken()
    if (!token) throw new Error('Token de GestorApp no disponible (logueate en la app)')

    const subirRes = await fetch(URL_SUBIR_CUPON, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        data: { tramiteId, nroCausa: item.nroCausa, nroActa: item.nroActa, pdfBase64: base64 },
      }),
    })
    if (!subirRes.ok) {
      const errText = await subirRes.text()
      throw new Error(`subirCuponInfraccion HTTP ${subirRes.status}: ${errText}`)
    }
    return await subirRes.json()
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  function renderEstadoDescarga(texto) {
    const panel = document.getElementById('gp-panel-descarga')
    if (!panel) return
    const estado = panel.querySelector('#gp-estado-descarga')
    if (estado) estado.textContent = texto
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  function montarPanelDescarga() {
    if (document.getElementById('gp-panel-descarga')) return
    const panel = document.createElement('div')
    panel.id = 'gp-panel-descarga'
      panel.style.cssText = [
    'position:fixed', 'bottom:20px',
    isCABA ? 'left:20px' : 'right:20px',
    'z-index:2147483647',
      'width:300px', 'background:#fff', 'border:1px solid #e5e5e5',
      'border-radius:12px', 'box-shadow:0 4px 16px rgba(0,0,0,.12)',
      'font-family:system-ui,sans-serif', 'font-size:13px', 'color:#1a1a1a',
      'padding:14px', 'line-height:1.5',
    ].join(';')
    panel.innerHTML = `<div style="font-weight:600;color:#D4621A;margin-bottom:8px">GestorApp · Descarga de cupones</div> <div id="gp-estado-descarga" style="color:#777;font-size:12px">Esperando inicio…</div>`
    document.body.appendChild(panel)
  }

  if (document.body) montarPanelDescarga()
  else document.addEventListener('DOMContentLoaded', montarPanelDescarga)

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.tipo === 'GP_PROGRESO_CUPON') {
      actualizarProgresoCupones(msg)
      return
    }
    return false
  })

  function actualizarProgresoCupones(data) {
    const panel = document.getElementById('gestorapp-panel-cupones')
    if (!panel) return
    const barra = panel.querySelector('.progreso-barra')
    const texto = panel.querySelector('.progreso-texto')
    if (barra && texto) {
      const porcentaje = (data.procesados / data.total) * 100
      barra.style.width = `${porcentaje}%`
      texto.textContent = `${data.procesados} / ${data.total} cupones procesados`
    }
    if (data.estado === 'ok') {
      console.log(`[GestorApp] Cupón ${data.nroCausa} procesado OK`)
    } else if (data.estado === 'error') {
      console.error(`[GestorApp] Error en cupón ${data.nroCausa}:`, data.error)
    }
  }
}