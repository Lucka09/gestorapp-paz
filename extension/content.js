// content.js — puente entre la página del portal y GestorApp.
// Corre en el mundo aislado del content script (tiene acceso a chrome.*).
//
// Flujo:
//   1) Inyecta interceptor.js en el contexto de la página.
//   2) Trae de GestorApp la próxima consulta de la cola (dominio O DNI).
//   3) Al tocar "Cargar", autocompleta el formulario correspondiente; la persona
//      resuelve el captcha y da Buscar.
//   4) Cuando el interceptor captura las actas, las envía a GestorApp junto con
//      el id de la consulta en cola. (El interceptor sirve igual para dominio y
//      DNI: engancha /rest/consultar-infraccion sin importar el parámetro.)
//
// ⚠️ Selectores del portal: los del tab "Documento" están por mejor esfuerzo
// (por texto/placeholder). Si alguno no matchea, el panel avisa y la persona
// completa a mano — la captura sigue siendo automática igual.

const API_BASE = 'https://us-central1-gestorapp-paz.cloudfunctions.net'

// Selectores del portal — confirmar/ajustar contra el DOM real si cambia el HTML.
const SEL_INPUT_DOMINIO = 'input[name="dominio"], #dominio'

let consultaActual = null // { id, tipoConsulta, dominio, dni, genero, tipoDocumento, contactoNombre }

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
  return gpToken || null
}

async function apiFetch(path, options = {}) {
  const token = await getToken()
  return fetch(`${API_BASE}${path}`, {
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
    const res = await apiFetch('/colaProximaConsulta')
    if (!res.ok) return null
    const data = await res.json()
    return data.consulta || null
  } catch (e) {
    console.warn('[GestorApp] No se pudo traer la cola:', e)
    return null
  }
}

// ─── 4. Enviar las actas capturadas a GestorApp ──────────────────────────────

async function enviarActas(raw) {
  if (!consultaActual) {
    console.warn('[GestorApp] Actas capturadas sin consulta activa — se ignoran')
    return
  }
  try {
    const res = await apiFetch('/guardarConsultaInfraccion', {
      method: 'POST',
      body: JSON.stringify({
        consultaId: consultaActual.id,
        // dominio solo aplica a consultas por dominio; guardar lee el resto del
        // documento de la consulta (tipoConsulta, dni) por su cuenta.
        dominio: consultaActual.tipoConsulta === 'dni' ? '' : consultaActual.dominio,
        raw,
      }),
    })
    if (res.ok) {
      renderEstado(`✅ Enviado. Cargando siguiente…`)
      consultaActual = null
      setTimeout(cargarSiguiente, 1200)
    } else {
      renderEstado(`⚠️ Error al enviar. Reintentá.`)
    }
  } catch (e) {
    renderEstado(`⚠️ Sin conexión con GestorApp. Reintentá.`)
    console.warn('[GestorApp] enviarActas:', e)
  }
}

// ─── 3. Autocompletar el portal (dominio O documento) ────────────────────────

// Setea el valor disparando el evento que React escucha.
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

// Busca un elemento por el texto que contiene (case-insensitive).
function porTexto(selector, regex) {
  return Array.from(document.querySelectorAll(selector))
    .find(el => regex.test((el.textContent || '').trim()))
}

function autocompletarDocumento({ dni, tipoDocumento, genero }) {
  const faltantes = []

  // a) Cambiar al tab "Búsqueda por Documento".
  // El portal renderiza dos botones de tab; el segundo es "Búsqueda por Documento".
  const tabs = document.querySelectorAll('.nav-tabs .nav-link, .tab-button, [role="tab"], button')
  const tabDoc = Array.from(tabs).find(el => /documento/i.test(el.textContent || ''))
  if (tabDoc) { tabDoc.click() } else { faltantes.push('Tab Documento') }

  setTimeout(() => {
    // b) Select de tipo de documento. El portal lo llama "tipoDocumento".
    //    El valor numérico: tipoDocumento=0 → DNI (confirmado en URL real).
    const selectTipo = document.querySelector(
      'select[name="tipoDocumento"], select[id*="tipo"], select[id*="Tipo"]'
    ) || Array.from(document.querySelectorAll('select')).find(s =>
      Array.from(s.options).some(o => /DNI/i.test(o.text))
    )
    if (selectTipo) {
      // Buscar por texto "DNI" o por value "0" (confirmado: tipoDocumento=0 = DNI).
      const tipo = tipoDocumento || 'DNI'
      const opt = Array.from(selectTipo.options).find(o =>
        o.text.trim().toUpperCase() === tipo.toUpperCase() || o.value === '0'
      )
      if (opt) setValorReact(selectTipo, opt.value)
      else faltantes.push('Tipo')
    } else { faltantes.push('Tipo') }

    // c) Número de documento. El portal lo llama "nroDocumento".
    const inputNro = document.querySelector(
      'input[name="nroDocumento"], input[placeholder*="olo números"], ' +
      'input[placeholder*="úmero"], input[type="number"], input[inputmode="numeric"]'
    )
    if (inputNro && dni) setValorReact(inputNro, String(dni))
    else if (!inputNro) faltantes.push('Número')

    // d) Género. El portal manda ?genero=M|F — los radios tienen value="M"|"F"|"X".
    //    Si no llegó género del lead, no lo tocamos (queda el default del portal).
    if (genero) {
      // Buscar radio con value exacto (M / F / X).
      const radio = document.querySelector(`input[type="radio"][value="${genero}"]`)
               || document.querySelector(`input[type="radio"][name*="enero"][value="${genero}"]`)
      if (radio) { radio.click() }
      else {
        // Fallback por etiqueta.
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

// ─── UI: panel flotante mínimo ───────────────────────────────────────────────

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
    </div>`
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
  el.textContent = `Próximo: ${clave}${c.contactoNombre ? ` · ${c.contactoNombre}` : ''}`
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