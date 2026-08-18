// content.js — puente entre la página del portal y GestorApp.
// URLs Gen2 (Cloud Run) — cada función tiene su propia URL única.
const URL_COLA_PROXIMA  = 'https://colaproximaconsulta-jgbhipicma-uc.a.run.app'
const URL_GUARDAR_ACTAS = 'https://guardarconsultainfraccion-jgbhipicma-uc.a.run.app'

const SEL_INPUT_DOMINIO = 'input[name="dominio"], #dominio'
let consultaActual = null

// ─── 1. Inyectar el interceptor en el contexto de la página ──────────────────
function inyectarInterceptor() {
  const s = document.createElement('script')
  s.src = chrome.runtime.getURL('interceptor.js')
  s.onload = () => s.remove()
  ;(document.head || document.documentElement).appendChild(s)
}
inyectarInterceptor()

// ─── Auth helper ─────────────────────────────────────────────────────────────
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
    renderEstado('⚠️ Sin conexión con GestorApp.')
    return null
  }
}

// ─── 3. Enviar las actas capturadas a GestorApp ──────────────────────────────
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

// ─── 4. Autocompletar el portal (dominio O documento) ────────────────────────
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
  if (!input) { renderEstado('⚠️ No encuentro el campo de dominio.'); return }
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

// ─── Escuchar los mensajes del interceptor ───────────────────────────────────
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

// ─── UI: panel flotante ──────────────────────────────────────────────────────
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
  panel.innerHTML = `
    <div style="font-weight:600;color:#D4621A;margin-bottom:8px">GestorApp · Cola de consultas</div>
    <div id="gp-consulta" style="margin-bottom:8px;color:#555">Cargando cola…</div>
    <div id="gp-estado" style="margin-bottom:10px;color:#777;font-size:12px">&nbsp;</div>
    <div style="display:flex;gap:8px">
      <button id="gp-cargar" style="flex:1;background:#D4621A;color:#fff;border:none;border-radius:8px;padding:8px;cursor:pointer;font-weight:600">Cargar</button>
      <button id="gp-saltar" style="background:#f2f2f2;color:#555;border:none;border-radius:8px;padding:8px 10px;cursor:pointer">Saltar</button>
    </div>
  `
  document.body.appendChild(panel)
  panel.querySelector('#gp-cargar').addEventListener('click', cargarEnPortal)
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
async function descargarCupon(nroCausa) {
  const res = await fetch(`/rest/generar-cupon?nroCausa=${nroCausa}`, {
    credentials: 'include' // usa la JSESSIONID
  })
  const blob = await res.blob()
  const base64 = await blobToBase64(blob)
  return { nroCausa, pdf: base64 }
}
// ─── ESCUCHA DE MENSAJES DESDE BACKGROUND (cola de cupones) ───
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.tipo === 'GP_PROGRESO_CUPON') {
    // Actualizar UI de progreso (si existe el panel flotante)
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
// ─── DESCARGA DE CUPONES (F2.2) ──────────────────────────────────────────────
// Los comandos llegan vía chrome.storage.local (escritos por bridge.js en la app).

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
    renderEstadoDescarga('⏸️ Pausado')
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
  // 1. PDF del portal (cookies de sesión del operador)
  const url = `https://infraccionesba.gba.gob.ar/rest/generar-cupon?nroCausa=${encodeURIComponent(item.nroCausa)}`
  const res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/pdf' } })
  if (!res.ok) throw new Error(`Portal HTTP ${res.status}`)

  const blob = await res.blob()
  const base64 = await blobToBase64(blob)

  // 2. Subida a GestorApp con el token que publicó la app
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

function getToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get('gpToken', (r) => resolve(r.gpToken || null))
  })
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
    'position:fixed', 'bottom:20px', 'left:20px', 'z-index:2147483647',
    'width:300px', 'background:#fff', 'border:1px solid #e5e5e5',
    'border-radius:12px', 'box-shadow:0 4px 16px rgba(0,0,0,.12)',
    'font-family:system-ui,sans-serif', 'font-size:13px', 'color:#1a1a1a',
    'padding:14px', 'line-height:1.5',
  ].join(';')
  panel.innerHTML = `
    <div style="font-weight:600;color:#D4621A;margin-bottom:8px">GestorApp · Descarga de cupones</div>
    <div id="gp-estado-descarga" style="color:#777;font-size:12px">Esperando inicio…</div>
  `
  document.body.appendChild(panel)
}

if (document.body) montarPanelDescarga()
else document.addEventListener('DOMContentLoaded', montarPanelDescarga)