// src/features/importar/ImportadorWA.tsx
// Importa contactos y chats exportados desde WhatsApp Business al CRM.
//
// PASO A PASO PARA EL USUARIO:
// 1. En WhatsApp Business → Ajustes → Privacidad → Exportar contactos → .vcf
// 2. Para chats: Abrir chat → ⋮ → Más → Exportar chat → Sin archivos → .txt
// 3. Subir ambos archivos acá — el sistema los procesa y crea los clientes

import { useState, useRef, useCallback }  from 'react'
import {
  Upload, Users, MessageSquare, CheckCircle2,
  AlertTriangle, Loader2, ChevronDown, ChevronUp,
  FileText, Phone, User, Brain,
} from 'lucide-react'
import { useGestoriaId }   from '@/context/GestoriaContext'
import { useAuth }         from '@/hooks/useAuth'
import { crearCliente }    from '@/lib/firestore/clientes'
import { crearNota }       from '@/lib/firestore/notas'
import { usePageTitle }    from '@/hooks/usePageTitle'
import toast               from 'react-hot-toast'

// ─── TIPOS ───────────────────────────────────────────────────────────────────

interface ContactoWA {
  nombre:    string
  apellido:  string
  telefono:  string
  email?:    string
  empresa?:  string
  rawVCard:  string
}

interface ChatAnalizado {
  telefono:   string
  resumen:    string       // resumen de Claude del chat
  temas:      string[]     // temas detectados: pago pendiente, docs enviados, etc.
  urgencia:   'alta' | 'media' | 'baja'
  rawChat:    string
}

interface ClientePreview {
  contacto:  ContactoWA
  chat?:     ChatAnalizado
  estado:    'pendiente' | 'importando' | 'importado' | 'error'
  clienteId?: string
  error?:    string
}

// ─── PARSERS ──────────────────────────────────────────────────────────────────

function parsearVCard(vcfContent: string): ContactoWA[] {
  const cards = vcfContent.split('BEGIN:VCARD').slice(1)
  const contactos: ContactoWA[] = []

  for (const card of cards) {
    const rawVCard = 'BEGIN:VCARD' + card
    const lines    = card.split(/\r?\n/)

    const get = (prefix: string) => {
      const line = lines.find(l => l.startsWith(prefix))
      return line ? line.split(':').slice(1).join(':').trim() : ''
    }

    const fnLine = get('FN:') || get('N:')
    let nombre = '', apellido = ''

    if (fnLine.includes(';')) {
      const parts = fnLine.split(';')
      apellido = parts[0].trim()
      nombre   = parts[1]?.trim() ?? ''
    } else {
      const parts = fnLine.trim().split(' ')
      nombre   = parts[0] ?? ''
      apellido = parts.slice(1).join(' ')
    }

    // Teléfono — puede tener formato TEL;type=CELL: o TEL:
    const telLine = lines.find(l => l.startsWith('TEL'))
    const telefono = telLine
      ? telLine.split(':').slice(1).join(':').trim().replace(/\s+/g, '')
      : ''

    const email   = get('EMAIL:')
    const empresa = get('ORG:')

    if (nombre || apellido) {
      contactos.push({ nombre, apellido, telefono, email, empresa, rawVCard })
    }
  }

  return contactos
}

function parsearChats(txtContent: string, contactos: ContactoWA[]): Map<string, string> {
  // El export de WA tiene líneas como:
  // "23/05/2026, 10:30 - Juan García: hola cómo están"
  // O con el número si no está guardado:
  // "23/05/2026, 10:30 - +54 11 5859-1881: hola"

  const chatPorNumero = new Map<string, string>()
  const lineas = txtContent.split('\n')
  let currentSender = ''
  let currentLines: string[] = []

  const flush = () => {
    if (currentSender && currentLines.length > 0) {
      const existing = chatPorNumero.get(currentSender) ?? ''
      chatPorNumero.set(currentSender, existing + currentLines.join('\n') + '\n')
    }
  }

  for (const linea of lineas) {
    // Detectar inicio de mensaje nuevo
    const match = linea.match(/^\d{1,2}\/\d{1,2}\/\d{2,4},? \d{1,2}:\d{2}(?:\s?[ap]\.?m\.?)? - (.+?): (.+)$/i)
    if (match) {
      flush()
      currentSender = match[1].trim()
      currentLines  = [`${match[1]}: ${match[2]}`]
    } else if (currentSender) {
      currentLines.push(linea)
    }
  }
  flush()

  // Intentar matchear senders con contactos por nombre o número
  const resultado = new Map<string, string>()
  for (const [sender, chat] of chatPorNumero) {
    // Buscar contacto que coincida
    const contacto = contactos.find(c => {
      const nombreCompleto = `${c.nombre} ${c.apellido}`.toLowerCase()
      const senderLower    = sender.toLowerCase()
      const telLimpio      = c.telefono.replace(/\D/g, '')
      const senderNum      = sender.replace(/\D/g, '')
      return nombreCompleto.includes(senderLower) ||
             senderLower.includes(c.nombre.toLowerCase()) ||
             (telLimpio && senderNum.endsWith(telLimpio.slice(-8)))
    })
    if (contacto) {
      resultado.set(contacto.telefono, chat)
    }
  }

  return resultado
}

// ─── ANALIZAR CON CLAUDE ──────────────────────────────────────────────────────

async function analizarChatConClaude(
  chatContent:  string,
  nombreCliente: string,
): Promise<{ resumen: string; temas: string[]; urgencia: 'alta' | 'media' | 'baja' }> {
  const prompt = `Sos un asistente de una gestoría del automotor argentina. 
Analizá el siguiente chat de WhatsApp con el cliente "${nombreCliente}" y extraé:

1. Un resumen breve (máx 3 oraciones) del estado actual de la gestión
2. Lista de temas detectados (puede incluir: pago_pendiente, documentacion_enviada, presupuesto_enviado, tramite_en_proceso, requiere_seguimiento, cliente_inactivo, consulta_nueva, otro)
3. Nivel de urgencia: alta (pago vencido, trámite urgente), media (en proceso), baja (consulta o sin actividad reciente)

Respondé SOLO con JSON válido, sin markdown:
{"resumen": "...", "temas": ["..."], "urgencia": "alta|media|baja"}

CHAT:
${chatContent.slice(0, 4000)}`

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages:   [{ role: 'user', content: prompt }],
    }),
  })

  const data = await resp.json()
  const text = data.content?.[0]?.text ?? '{}'
  try {
    return JSON.parse(text.replace(/```json?|```/g, '').trim())
  } catch {
    return { resumen: text.slice(0, 200), temas: ['otro'], urgencia: 'baja' }
  }
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

export default function ImportadorWA() {
  usePageTitle('Importar desde WhatsApp')
  const gestoriaId   = useGestoriaId()
  const { user }     = useAuth()
  const vcfRef       = useRef<HTMLInputElement>(null)
  const chatRef      = useRef<HTMLInputElement>(null)

  const [contactos,  setContactos]  = useState<ContactoWA[]>([])
  const [chatMap,    setChatMap]    = useState<Map<string, string>>(new Map())
  const [previews,   setPreviews]   = useState<ClientePreview[]>([])
  const [analizando, setAnalizando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [paso,       setPaso]       = useState<1 | 2 | 3>(1)
  const [expandido,  setExpandido]  = useState<number | null>(null)
  const [conIA,      setConIA]      = useState(true)

  // ── Paso 1: cargar VCF ─────────────────────────────────────────────────────
  const handleVCF = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const content = ev.target?.result as string
      const parsed  = parsearVCard(content)
      setContactos(parsed)
      toast.success(`${parsed.length} contactos encontrados`)
    }
    reader.readAsText(file)
  }

  // ── Paso 1: cargar TXT de chats ────────────────────────────────────────────
  const handleChat = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const allText: string[] = []
    let loaded = 0
    for (const file of files) {
      const reader = new FileReader()
      reader.onload = ev => {
        allText.push(ev.target?.result as string)
        loaded++
        if (loaded === files.length) {
          const map = parsearChats(allText.join('\n\n===NUEVO CHAT===\n\n'), contactos)
          setChatMap(map)
          toast.success(`${map.size} chats detectados`)
        }
      }
      reader.readAsText(file, 'utf-8')
    }
  }

  // ── Paso 2: analizar con IA ────────────────────────────────────────────────
  const handleAnalizar = async () => {
    if (contactos.length === 0) return
    setAnalizando(true)
    setPaso(2)

    const items: ClientePreview[] = contactos.map(c => ({
      contacto: c,
      estado:   'pendiente' as const,
    }))
    setPreviews(items)

    if (conIA) {
      for (let i = 0; i < items.length; i++) {
        const c       = items[i].contacto
        const rawChat = chatMap.get(c.telefono)
        if (!rawChat) continue

        try {
          const analisis = await analizarChatConClaude(rawChat, `${c.nombre} ${c.apellido}`)
          items[i].chat = {
            telefono: c.telefono,
            resumen:  analisis.resumen,
            temas:    analisis.temas,
            urgencia: analisis.urgencia,
            rawChat,
          }
          setPreviews([...items])
        } catch (e) {
          console.error('Error analizando chat:', e)
        }
      }
    } else {
      // Sin IA — solo marcar si tiene chat
      for (let i = 0; i < items.length; i++) {
        const rawChat = chatMap.get(items[i].contacto.telefono)
        if (rawChat) {
          items[i].chat = {
            telefono: items[i].contacto.telefono,
            resumen:  'Chat importado sin análisis de IA',
            temas:    ['otro'],
            urgencia: 'baja',
            rawChat,
          }
        }
      }
      setPreviews([...items])
    }

    setAnalizando(false)
    setPaso(3)
  }

  // ── Paso 3: importar a Firestore ───────────────────────────────────────────
  const handleImportar = async () => {
    if (!gestoriaId || !user?.uid) return
    setImportando(true)
    const updated = [...previews]

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].estado === 'importado') continue
      updated[i].estado = 'importando'
      setPreviews([...updated])

      try {
        const c   = updated[i].contacto
        const clienteId = await crearCliente({
          gestoriaId,
          nombre:        c.nombre,
          apellido:      c.apellido,
          telefono:      c.telefono,
          email:         c.email ?? '',
          dni:           '',
          cuit:          '',
          direccion:     '',
          localidad:     '',
          observaciones: c.empresa ? `Empresa: ${c.empresa}` : '',
          // origen removido — campo no existe en ClienteInput
          userId:        null,
        }, user.uid)

        // Crear nota interna con el análisis del chat
        if (updated[i].chat?.resumen) {
          const { resumen, temas, urgencia } = updated[i].chat!
          const contenido =
            `**Importado desde WhatsApp Business**\n\n` +
            `**Resumen del chat:** ${resumen}\n\n` +
            `**Temas detectados:** ${temas.join(', ')}\n\n` +
            `**Urgencia:** ${urgencia.toUpperCase()}`

          await crearNota({
            gestoriaId,
            entidad:    'cliente',
            entidadId:  clienteId,
            contenido,
            tipo:       'interna' as any,
            importante: updated[i].chat?.urgencia === 'alta',
            ctx: {
              uid:    user.uid,
              nombre: `${user.nombre} ${user.apellido}`.trim(),
              rol:    user.rol as any,
            },
          })
        }

        updated[i].estado    = 'importado'
        updated[i].clienteId = clienteId
      } catch (err: any) {
        updated[i].estado = 'error'
        updated[i].error  = err.message ?? 'Error desconocido'
      }

      setPreviews([...updated])
    }

    setImportando(false)
    const ok = updated.filter(u => u.estado === 'importado').length
    toast.success(`${ok} clientes importados al CRM`)
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────

  const importados = previews.filter(p => p.estado === 'importado').length
  const errores    = previews.filter(p => p.estado === 'error').length
  const conChat    = previews.filter(p => !!p.chat).length

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Importar desde WhatsApp Business</h1>
        <p className="text-sm text-gray-500 mt-1">
          Migrá tus contactos y chats al CRM antes de conectar la API.
        </p>
      </div>

      {/* Instrucciones */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
        <p className="text-sm font-bold text-blue-800 mb-3">Cómo exportar desde WhatsApp Business</p>
        <div className="space-y-2 text-xs text-blue-700">
          <div className="flex gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-800 font-bold flex items-center justify-center shrink-0">1</span>
            <span><strong>Contactos:</strong> WhatsApp Business → Ajustes → Privacidad → Exportar contactos → guardás el .vcf</span>
          </div>
          <div className="flex gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-800 font-bold flex items-center justify-center shrink-0">2</span>
            <span><strong>Chats (opcional):</strong> Abrís cada chat → ⋮ → Más → Exportar chat → Sin archivos → guardás el .txt</span>
          </div>
          <div className="flex gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-800 font-bold flex items-center justify-center shrink-0">3</span>
            <span>Subís los archivos acá → la IA analiza los chats → revisás → importás al CRM</span>
          </div>
        </div>
      </div>

      {/* Paso 1: Subir archivos */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-[#D4621A] text-white text-sm font-bold flex items-center justify-center">1</span>
          <h2 className="font-bold text-gray-800">Subir archivos exportados</h2>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* VCF */}
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-2">
              Archivo de contactos (.vcf) *
            </label>
            <div
              onClick={() => vcfRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all
                ${contactos.length > 0 ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-[#D4621A]/40'}`}
            >
              {contactos.length > 0 ? (
                <>
                  <CheckCircle2 size={24} className="text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-bold text-emerald-700">{contactos.length} contactos</p>
                </>
              ) : (
                <>
                  <Users size={24} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">Subir .vcf</p>
                </>
              )}
            </div>
            <input ref={vcfRef} type="file" accept=".vcf" className="hidden" onChange={handleVCF} />
          </div>

          {/* TXT chats */}
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-2">
              Archivos de chats (.txt) — opcional
            </label>
            <div
              onClick={() => chatRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all
                ${chatMap.size > 0 ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-[#D4621A]/40'}`}
            >
              {chatMap.size > 0 ? (
                <>
                  <CheckCircle2 size={24} className="text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-bold text-emerald-700">{chatMap.size} chats</p>
                </>
              ) : (
                <>
                  <MessageSquare size={24} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">Subir .txt (múltiples)</p>
                </>
              )}
            </div>
            <input ref={chatRef} type="file" accept=".txt" multiple className="hidden" onChange={handleChat} />
          </div>
        </div>

        {/* Opción IA */}
        <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer">
          <input type="checkbox" checked={conIA} onChange={e => setConIA(e.target.checked)}
            className="accent-[#D4621A] w-4 h-4" />
          <div>
            <p className="text-sm font-semibold text-gray-800 flex items-center gap-1">
              <Brain size={14} className="text-purple-500" /> Analizar chats con IA (Claude)
            </p>
            <p className="text-xs text-gray-400">
              Genera un resumen automático del estado de cada cliente. Requiere conexión.
            </p>
          </div>
        </label>

        <button
          onClick={handleAnalizar}
          disabled={contactos.length === 0 || analizando}
          className="w-full py-3 bg-[#D4621A] hover:bg-[#b8541a] text-white font-bold rounded-xl
                     text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {analizando
            ? <><Loader2 size={15} className="animate-spin" /> Analizando con IA...</>
            : `Analizar ${contactos.length} contactos →`
          }
        </button>
      </div>

      {/* Paso 2-3: Preview y confirmación */}
      {previews.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-[#D4621A] text-white text-sm font-bold flex items-center justify-center">2</span>
              <h2 className="font-bold text-gray-800">Revisar y confirmar</h2>
            </div>
            <div className="flex gap-3 text-xs text-gray-500">
              <span><span className="text-blue-600 font-bold">{conChat}</span> con chat</span>
              <span><span className="text-emerald-600 font-bold">{importados}</span> importados</span>
              {errores > 0 && <span><span className="text-red-600 font-bold">{errores}</span> errores</span>}
            </div>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {previews.map((p, i) => {
              const urgColors = {
                alta:  'bg-red-100 text-red-700',
                media: 'bg-amber-100 text-amber-700',
                baja:  'bg-gray-100 text-gray-600',
              }
              return (
                <div key={i}
                  className={`rounded-xl border transition-all overflow-hidden ${
                    p.estado === 'importado' ? 'border-emerald-200 bg-emerald-50/30' :
                    p.estado === 'error'     ? 'border-red-200 bg-red-50/30' :
                    'border-gray-100'
                  }`}
                >
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer"
                    onClick={() => setExpandido(expandido === i ? null : i)}
                  >
                    <div className="w-8 h-8 rounded-full bg-[#D4621A]/10 text-[#D4621A] flex items-center justify-center font-bold text-sm shrink-0">
                      {p.contacto.nombre[0] ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {p.contacto.nombre} {p.contacto.apellido}
                      </p>
                      <p className="text-xs text-gray-400">{p.contacto.telefono}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {p.chat && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${urgColors[p.chat.urgencia]}`}>
                          {p.chat.urgencia.toUpperCase()}
                        </span>
                      )}
                      {p.estado === 'importado' && <CheckCircle2 size={14} className="text-emerald-500" />}
                      {p.estado === 'importando' && <Loader2 size={14} className="text-[#D4621A] animate-spin" />}
                      {p.estado === 'error' && <AlertTriangle size={14} className="text-red-500" />}
                      {expandido === i
                        ? <ChevronUp size={13} className="text-gray-400" />
                        : <ChevronDown size={13} className="text-gray-400" />
                      }
                    </div>
                  </div>

                  {expandido === i && p.chat && (
                    <div className="px-4 pb-3 space-y-2 border-t border-gray-100 pt-3">
                      <p className="text-xs font-semibold text-gray-600 mb-1">Resumen del chat (IA)</p>
                      <p className="text-xs text-gray-700 bg-gray-50 rounded-lg p-2">{p.chat.resumen}</p>
                      <div className="flex flex-wrap gap-1">
                        {p.chat.temas.map(t => (
                          <span key={t} className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                            {t.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {expandido === i && p.error && (
                    <div className="px-4 pb-3 pt-2 border-t border-red-100">
                      <p className="text-xs text-red-600">{p.error}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <button
            onClick={handleImportar}
            disabled={importando || importados === previews.length}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl
                       text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {importando
              ? <><Loader2 size={15} className="animate-spin" /> Importando... ({importados}/{previews.length})</>
              : importados === previews.length
              ? <><CheckCircle2 size={15} /> Todos importados</>
              : `Importar ${previews.length - importados} clientes al CRM`
            }
          </button>
        </div>
      )}
    </div>
  )
}