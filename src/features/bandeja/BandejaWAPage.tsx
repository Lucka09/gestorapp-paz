import { useState, useRef, useEffect, useMemo } from 'react'
import {
  MessageCircle, Search, Filter, Check, CheckCheck,
  User, Link2, Tag, ChevronRight, Send, Phone,
  MoreVertical, Clock, Wifi, WifiOff, Circle,
  RefreshCw, UserCheck, X, ArrowLeft,
} from 'lucide-react'
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns'
import { es } from 'date-fns/locale'
import { useConversacionesWA, useMensajesWA, useNoLeidosWA } from '@/hooks/useConversacionesWA'
import { useAuth }          from '@/hooks/useAuth'
import { useEquipo }        from '@/hooks/useEquipo'
import { getPermisos }      from '@/utils/permisos'
import { usePageTitle }     from '@/hooks/usePageTitle'
import { useGestoria }      from '@/context/GestoriaContext'
import { crearConsultaDesdeWA }       from '@/lib/firestore/consultasInfracciones'
import { actualizarConsultaSugerida } from '@/lib/firestore/conversacionesWA'
import type { ConversacionWA, MensajeWA, EstadoConversacion } from '@/wa_types'

// ─── PALETA BANDEJA WA ────────────────────────────────────────────────────────
// Los colores de WA son parte de la identidad de la interfaz (dark chat).
// WA_ORANGE_VAR usa el color primario del tenant desde GestoriaContext.

const WA_GREEN    = '#25D366'   // verde oficial WhatsApp — identidad fija
const WA_DARK     = '#111B21'   // fondo principal del chat
const WA_PANEL    = '#202C33'   // panel lateral y headers
const WA_BUBBLE_I = '#202C33'   // burbuja entrante
const WA_BUBBLE_O = '#005C4B'   // burbuja saliente
const WA_TEXT     = '#E9EDEF'   // texto principal en dark
const WA_SUBTEXT  = '#8696A0'   // texto secundario / timestamps
const WA_DIVIDER  = '#2A3942'   // bordes y separadores

// Helper que lee el color del tenant en runtime (respetar branding)
const getOrange = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--gp-orange').trim() || '#D4621A'

// ─── VALIDACIÓN PATENTE / DNI (chip de consulta de infracciones) ─────────────
const RE_DOMINIO = /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2}|\d{3}[A-Z]{3}|[A-Z]\d{3}[A-Z]{3})$/
const limpiarValor = (v: string) => (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const tipoDeValor  = (v: string): 'dominio' | 'dni' =>
  /^\d{7,8}$/.test(limpiarValor(v)) ? 'dni' : 'dominio'
const esConsultable = (v: string) => {
  const x = limpiarValor(v)
  return RE_DOMINIO.test(x) || /^\d{7,8}$/.test(x)
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function formatTimestamp(ts: any): string {
  if (!ts) return ''
  const date = ts?.toDate ? ts.toDate() : new Date(ts)
  if (isToday(date))     return format(date, 'HH:mm')
  if (isYesterday(date)) return 'Ayer'
  return format(date, 'dd/MM/yy')
}

function formatHora(ts: any): string {
  if (!ts) return ''
  const date = ts?.toDate ? ts.toDate() : new Date(ts)
  return format(date, 'HH:mm')
}

function getInitials(nombre: string): string {
  return nombre.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

const ESTADO_CONFIG: Record<EstadoConversacion, { label: string; color: string; bg: string }> = {
  nueva:       { label: 'Nueva',        color: '#EF4444', bg: '#FEF2F2' },
  en_atencion: { label: 'En atención',  color: '#F59E0B', bg: '#FFFBEB' },
  resuelta:    { label: 'Resuelta',     color: '#10B981', bg: '#F0FDF4' },
  archivada:   { label: 'Archivada',    color: '#6B7280', bg: '#F9FAFB' },
}

// ─── AVATAR ───────────────────────────────────────────────────────────────────

function Avatar({ nombre, size = 40 }: { nombre: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `hsl(${(nombre.charCodeAt(0) * 47) % 360}, 45%, 35%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontWeight: 700, fontSize: size * 0.35,
      flexShrink: 0,
    }}>
      {getInitials(nombre)}
    </div>
  )
}

// ─── BADGE DE ESTADO ──────────────────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: EstadoConversacion }) {
  const cfg = ESTADO_CONFIG[estado]
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 6px',
      borderRadius: 999, background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.color}22`,
    }}>
      {cfg.label}
    </span>
  )
}

// ─── TICK DE ESTADO DE MENSAJE ────────────────────────────────────────────────

function MsgStatus({ estado }: { estado?: string }) {
  if (!estado || estado === 'enviando') return <Clock size={12} color={WA_SUBTEXT} />
  if (estado === 'error')    return <X size={12} color="#EF4444" />
  if (estado === 'enviado')  return <Check size={12} color={WA_SUBTEXT} />
  return <CheckCheck size={12} color={estado === 'leido' ? '#53BDEB' : WA_SUBTEXT} />
}

// ─── BURBUJA DE MENSAJE ───────────────────────────────────────────────────────

function BurbujaMensaje({ msg }: { msg: MensajeWA }) {
  const saliente = msg.direccion === 'saliente'
  return (
    <div style={{
      display: 'flex',
      justifyContent: saliente ? 'flex-end' : 'flex-start',
      padding: '1px 12px',
    }}>
      <div style={{
        maxWidth: '72%',
        background: saliente ? WA_BUBBLE_O : WA_BUBBLE_I,
        borderRadius: saliente ? '8px 0 8px 8px' : '0 8px 8px 8px',
        padding: '6px 10px 4px',
        position: 'relative',
      }}>
        <p style={{
          margin: 0, color: WA_TEXT, fontSize: 14,
          lineHeight: 1.45, wordBreak: 'break-word', whiteSpace: 'pre-wrap',
        }}>
          {msg.texto}
        </p>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: 3, marginTop: 2,
        }}>
          <span style={{ fontSize: 11, color: WA_SUBTEXT }}>
            {formatHora(msg.timestamp)}
          </span>
          {saliente && <MsgStatus estado={msg.estado} />}
        </div>
      </div>
    </div>
  )
}

// ─── SEPARADOR DE FECHA ───────────────────────────────────────────────────────

function SeparadorFecha({ fecha }: { fecha: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', gap: 8 }}>
      <div style={{ flex: 1, height: 1, background: WA_DIVIDER }} />
      <span style={{
        fontSize: 11, color: WA_SUBTEXT,
        background: WA_PANEL, padding: '2px 10px', borderRadius: 999,
        border: `1px solid ${WA_DIVIDER}`,
      }}>
        {fecha}
      </span>
      <div style={{ flex: 1, height: 1, background: WA_DIVIDER }} />
    </div>
  )
}

// ─── PANEL DE CHAT ────────────────────────────────────────────────────────────

function PanelChat({
  conv,
  onClose,
}: {
  conv:    ConversacionWA
  onClose: () => void
}) {
  const { mensajes, loading, enviando, error, enviar, bottomRef } = useMensajesWA(conv.id)
  const { cambiarEstado, asignarseYo, asignar, marcarLeida, puedeReasignar } = useConversacionesWA()
  const { user } = useAuth()
  const { gestoriaId } = useGestoria()
  const { activos } = useEquipo()
  const [texto, setTexto] = useState('')
  const [reasignarOpen, setReasignarOpen] = useState(false)
  const [valorConsulta, setValorConsulta] = useState(conv.consultaSugerida?.valor ?? '')
  const [creandoConsulta, setCreandoConsulta] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Si el webhook actualiza el valor detectado (patente que llegó después), sincronizar
  useEffect(() => {
    setValorConsulta(conv.consultaSugerida?.valor ?? '')
  }, [conv.consultaSugerida?.valor])

  // Confirmar la consulta sugerida → crea el doc en cola (lo levanta la extensión)
  const handleConsultar = async () => {
    if (!gestoriaId || !esConsultable(valorConsulta) || creandoConsulta) return
    setCreandoConsulta(true)
    try {
      const nombreAgente =
        [(user as any)?.nombre, (user as any)?.apellido].filter(Boolean).join(' ').trim()
        || (user as any)?.email || 'Agente'
      const consultaId = await crearConsultaDesdeWA({
        gestoriaId,
        tipo:     tipoDeValor(valorConsulta),
        valor:    valorConsulta,
        contacto: { nombre: conv.nombre, whatsapp: conv.telefono, email: '' },
        leadId:   conv.leadId,
        creadoPor: { uid: user?.uid ?? '', nombre: nombreAgente },
      })
      await actualizarConsultaSugerida(conv.id, 'confirmada', consultaId)
    } catch (e) {
      console.error('[WA] error creando consulta de infracciones', e)
    } finally {
      setCreandoConsulta(false)
    }
  }

  const handleDescartarSugerida = async () => {
    try { await actualizarConsultaSugerida(conv.id, 'descartada') }
    catch (e) { console.error('[WA] error descartando sugerencia', e) }
  }

  // Candidatos para reasignar: miembros activos con acceso a la Bandeja WA
  const agentesWA = useMemo(
    () => activos.filter(m => getPermisos(m.rol).verBandejaWA),
    [activos],
  )

  // Marcar leída al abrir
  useEffect(() => {
    if (conv.noLeidos > 0) marcarLeida(conv.id)
  }, [conv.id, conv.noLeidos])

  const handleEnviar = async () => {
    if (!texto.trim() || enviando) return
    const t = texto
    setTexto('')
    await enviar(t)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleEnviar()
    }
  }

  // Agrupar mensajes por fecha
  const grupos = useMemo(() => {
    const map = new Map<string, MensajeWA[]>()
    mensajes.forEach(m => {
      const d    = m.timestamp?.toDate ? m.timestamp.toDate() : new Date()
      const key  = isToday(d) ? 'Hoy'
                 : isYesterday(d) ? 'Ayer'
                 : format(d, "d 'de' MMMM yyyy", { locale: es })
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    })
    return map
  }, [mensajes])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', background: WA_DARK,
    }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 16px', background: WA_PANEL,
        borderBottom: `1px solid ${WA_DIVIDER}`,
      }}>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: WA_SUBTEXT, display: 'flex', padding: 4,
          }}
        >
          <ArrowLeft size={20} />
        </button>

        <Avatar nombre={conv.nombre} size={38} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, color: WA_TEXT, fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conv.nombre}
          </p>
          <p style={{ margin: 0, color: WA_SUBTEXT, fontSize: 12 }}>
            +{conv.telefono}{conv.asignadoNombre ? ` · ${conv.asignadoNombre}` : (conv.asignadoA ? '' : ' · sin asignar')}
          </p>
        </div>

        <EstadoBadge estado={conv.estado} />

        {/* Acciones rápidas */}
        <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
          {puedeReasignar && (
            <>
              <button
                onClick={() => setReasignarOpen(o => !o)}
                title="Reasignar a otro agente"
                style={{
                  background: '#3B82F622', border: '1px solid #3B82F644',
                  color: '#60A5FA', borderRadius: 8, padding: '4px 8px',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <RefreshCw size={14} /> Reasignar
              </button>
              {reasignarOpen && (
                <>
                  <div
                    onClick={() => setReasignarOpen(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                  />
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 41,
                    minWidth: 210, background: WA_PANEL,
                    border: `1px solid ${WA_DIVIDER}`, borderRadius: 10,
                    boxShadow: '0 10px 30px rgba(0,0,0,0.45)', overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '8px 12px', fontSize: 11, fontWeight: 700,
                      color: WA_SUBTEXT, borderBottom: `1px solid ${WA_DIVIDER}`,
                      textTransform: 'uppercase', letterSpacing: 0.4,
                    }}>
                      Reasignar a
                    </div>
                    {agentesWA.length === 0 ? (
                      <div style={{ padding: 12, fontSize: 12, color: WA_SUBTEXT }}>
                        Sin agentes disponibles
                      </div>
                    ) : agentesWA.map(a => {
                      const esActual = a.uid === conv.asignadoA
                      return (
                        <button
                          key={a.uid}
                          onClick={() => { if (!esActual) asignar(conv.id, a.uid); setReasignarOpen(false) }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            width: '100%', textAlign: 'left', border: 'none',
                            cursor: esActual ? 'default' : 'pointer',
                            padding: '8px 12px', fontSize: 13, color: WA_TEXT,
                            background: esActual ? `${WA_GREEN}18` : 'transparent',
                          }}
                        >
                          <Avatar nombre={`${a.nombre} ${a.apellido ?? ''}`} size={24} />
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.nombre} {a.apellido ?? ''}
                          </span>
                          {esActual && <Check size={14} color={WA_GREEN} />}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </>
          )}
          {!conv.asignadoA && (
            <button
              onClick={() => asignarseYo(conv.id)}
              title="Asignarme esta conversación"
              style={{
                background: `${getOrange()}22`, border: `1px solid ${getOrange()}44`,
                color: getOrange(), borderRadius: 8, padding: '4px 8px',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <UserCheck size={14} /> Tomar
            </button>
          )}
          {conv.estado === 'en_atencion' && (
            <button
              onClick={() => cambiarEstado(conv.id, 'resuelta')}
              title="Marcar como resuelta"
              style={{
                background: '#10B98122', border: '1px solid #10B98144',
                color: '#10B981', borderRadius: 8, padding: '4px 8px',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <Check size={14} /> Resolver
            </button>
          )}
          {conv.clienteId && (
            <a
              href={`/admin/clientes/${conv.clienteId}`}
              title="Ver cliente en el CRM"
              style={{
                background: '#3B82F622', border: '1px solid #3B82F644',
                color: '#60A5FA', borderRadius: 8, padding: '4px 8px',
                fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 4,
                textDecoration: 'none',
              }}
            >
              <User size={14} /> Cliente
            </a>
          )}
          {conv.prospectoId && (
            <a
              href={`/admin/pipeline`}
              title="Ver en Pipeline"
              style={{
                background: '#8B5CF622', border: '1px solid #8B5CF644',
                color: '#A78BFA', borderRadius: 8, padding: '4px 8px',
                fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 4,
                textDecoration: 'none',
              }}
            >
              <Tag size={14} /> Pipeline
            </a>
          )}
        </div>
      </div>

      {/* Chip de consulta de infracciones (clasificación de multas) */}
      {conv.consultaSugerida?.estado === 'sugerida' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', background: '#1F2C33',
          borderBottom: `1px solid ${WA_DIVIDER}`,
        }}>
          <Search size={16} color={getOrange()} style={{ flexShrink: 0 }} />
          <span style={{ color: WA_TEXT, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
            Consultar infracciones:
          </span>
          <input
            value={valorConsulta}
            onChange={e => setValorConsulta(e.target.value.toUpperCase())}
            placeholder="Patente o DNI"
            style={{
              flex: 1, minWidth: 0, background: WA_DARK,
              border: `1px solid ${WA_DIVIDER}`, borderRadius: 6,
              color: WA_TEXT, fontSize: 13, padding: '5px 8px',
              outline: 'none', fontFamily: 'inherit', letterSpacing: 0.5,
            }}
          />
          <button
            onClick={handleConsultar}
            disabled={!esConsultable(valorConsulta) || creandoConsulta}
            style={{
              background: esConsultable(valorConsulta) ? WA_GREEN : WA_DIVIDER,
              color: esConsultable(valorConsulta) ? '#0B141A' : WA_SUBTEXT,
              border: 'none', borderRadius: 6, padding: '6px 12px',
              fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              cursor: esConsultable(valorConsulta) && !creandoConsulta ? 'pointer' : 'not-allowed',
            }}
          >
            {creandoConsulta ? 'Enviando…' : 'Consultar'}
          </button>
          <button
            onClick={handleDescartarSugerida}
            title="Descartar sugerencia"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: WA_SUBTEXT, display: 'flex', padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {conv.consultaSugerida?.estado === 'confirmada' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', background: '#0E2A20',
          borderBottom: `1px solid ${WA_DIVIDER}`,
        }}>
          <Check size={14} color={WA_GREEN} />
          <span style={{ color: WA_GREEN, fontSize: 12, fontWeight: 600 }}>
            Consulta de infracciones enviada a la cola
          </span>
        </div>
      )}

      {/* Mensajes */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '8px 0',
        display: 'flex', flexDirection: 'column',
      }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              border: `3px solid ${WA_DIVIDER}`,
              borderTopColor: WA_GREEN,
              animation: 'spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : mensajes.length === 0 ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <MessageCircle size={36} color={WA_DIVIDER} />
            <p style={{ color: WA_SUBTEXT, fontSize: 13, margin: 0 }}>
              Sin mensajes aún
            </p>
          </div>
        ) : (
          Array.from(grupos.entries()).map(([fecha, msgs]) => (
            <div key={fecha}>
              <SeparadorFecha fecha={fecha} />
              {msgs.map(m => <BurbujaMensaje key={m.id} msg={m} />)}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: '#EF444422', borderTop: '1px solid #EF444444',
          padding: '6px 16px',
        }}>
          <p style={{ margin: 0, color: '#FCA5A5', fontSize: 12 }}>
            ⚠ {error}
          </p>
        </div>
      )}

      {/* Input */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 8,
        padding: '10px 16px', background: WA_PANEL,
        borderTop: `1px solid ${WA_DIVIDER}`,
      }}>
        <textarea
          ref={inputRef}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribir mensaje…"
          rows={1}
          style={{
            flex: 1, resize: 'none', border: 'none', outline: 'none',
            background: WA_DARK, color: WA_TEXT, fontSize: 15,
            borderRadius: 12, padding: '10px 14px',
            fontFamily: 'inherit', lineHeight: 1.4,
            maxHeight: 120, overflowY: 'auto',
          }}
          onInput={e => {
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = Math.min(el.scrollHeight, 120) + 'px'
          }}
          disabled={enviando}
        />
        <button
          onClick={handleEnviar}
          disabled={!texto.trim() || enviando}
          style={{
            width: 42, height: 42, borderRadius: '50%', border: 'none',
            background: texto.trim() && !enviando ? WA_GREEN : WA_DIVIDER,
            color: 'white', cursor: texto.trim() && !enviando ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s', flexShrink: 0,
          }}
        >
          {enviando
            ? <RefreshCw size={18} style={{ animation: 'spin 0.8s linear infinite' }} />
            : <Send size={18} />
          }
        </button>
      </div>
    </div>
  )
}

// ─── TARJETA DE CONVERSACIÓN ──────────────────────────────────────────────────

function ConversacionCard({
  conv,
  activa,
  onClick,
}: {
  conv:    ConversacionWA
  activa:  boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
        background: activa ? '#2A3942' : 'transparent',
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: `1px solid ${WA_DIVIDER}`,
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!activa) e.currentTarget.style.background = '#1F2C33' }}
      onMouseLeave={e => { if (!activa) e.currentTarget.style.background = 'transparent' }}
    >
      <Avatar nombre={conv.nombre} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{
            color: WA_TEXT, fontWeight: 600, fontSize: 15,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: 160,
          }}>
            {conv.nombre}
          </span>
          <span style={{ color: WA_SUBTEXT, fontSize: 11, flexShrink: 0, marginLeft: 4 }}>
            {formatTimestamp(conv.ultimaActividad)}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
          <span style={{
            color: WA_SUBTEXT, fontSize: 13,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: 190,
          }}>
            {conv.ultimoMensaje || '…'}
          </span>
          {conv.noLeidos > 0 && (
            <span style={{
              minWidth: 20, height: 20, borderRadius: 999,
              background: WA_GREEN, color: 'white',
              fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 5px', flexShrink: 0, marginLeft: 6,
            }}>
              {conv.noLeidos > 99 ? '99+' : conv.noLeidos}
            </span>
          )}
        </div>

        <div style={{ marginTop: 4 }}>
          <EstadoBadge estado={conv.estado} />
        </div>
      </div>
    </button>
  )
}

// ─── PANEL VACÍO ─────────────────────────────────────────────────────────────

function PanelVacio() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: WA_DARK, gap: 12,
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: '#1F2C33',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <MessageCircle size={32} color={WA_SUBTEXT} />
      </div>
      <p style={{ color: WA_TEXT, fontWeight: 600, fontSize: 18, margin: 0 }}>
        GestorApp · Bandeja WhatsApp
      </p>
      <p style={{ color: WA_SUBTEXT, fontSize: 14, margin: 0, textAlign: 'center', maxWidth: 280 }}>
        Seleccioná una conversación de la lista para ver los mensajes
      </p>
    </div>
  )
}

// ─── PESTAÑA DE SECRETARIO (barra superior en vista de control) ───────────────

function TabAgente({
  label, activa, noLeidos, onClick, nombreAvatar,
}: {
  label:         string
  activa:        boolean
  noLeidos:      number
  onClick:       () => void
  nombreAvatar?: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        cursor: 'pointer', flexShrink: 0, borderRadius: 999,
        padding: nombreAvatar ? '3px 12px 3px 3px' : '6px 14px',
        fontSize: 12, fontWeight: 700,
        background: activa ? WA_GREEN : WA_PANEL,
        color:      activa ? '#0B141A' : WA_SUBTEXT,
        border: `1px solid ${activa ? WA_GREEN : WA_DIVIDER}`,
        transition: 'background 0.12s',
      }}
    >
      {nombreAvatar && <Avatar nombre={nombreAvatar} size={22} />}
      <span>{label}</span>
      {noLeidos > 0 && (
        <span style={{
          minWidth: 18, height: 18, borderRadius: 999,
          background: activa ? '#0B141A' : WA_GREEN,
          color:      activa ? WA_GREEN : '#0B141A',
          fontSize: 10, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 4px',
        }}>
          {noLeidos > 99 ? '99+' : noLeidos}
        </span>
      )}
    </button>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function BandejaWAPage() {
  usePageTitle('Bandeja WhatsApp')

  // Resetear al panel de lista al ampliar la ventana (tablet/desktop)
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setMostrarChat(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const {
    conversaciones, loading, metricas,
    cambiarEstado, verTodo,
  } = useConversacionesWA()
  const { activos } = useEquipo()

  const [seleccionada, setSeleccionada]   = useState<ConversacionWA | null>(null)
  const [busqueda, setBusqueda]           = useState('')
  const [filtroEstado, setFiltroEstado]   = useState<EstadoConversacion | 'todas'>('todas')
  const [mostrarChat, setMostrarChat]     = useState(false)   // mobile toggle
  // Pestaña de secretario (solo roles de control). 'todos' | uid | 'sin_asignar'
  const [tabAgente, setTabAgente]         = useState<string>('todos')

  // Secretarios activos con acceso a la Bandeja → una pestaña cada uno.
  // Reactivo: si se desactiva/crea/renombra un miembro, las pestañas se ajustan
  // solas (useEquipo vive por onSnapshot). No hay nombres hardcodeados.
  const agentesWA = useMemo(
    () => activos.filter(m => getPermisos(m.rol).verBandejaWA),
    [activos],
  )
  const uidsActivos = useMemo(
    () => new Set(agentesWA.map(a => a.uid)),
    [agentesWA],
  )

  // Si estabas parado en la pestaña de un secretario que se desactivó/salió,
  // volvemos a "Todos" para no quedar en una vista sin pestaña resaltada.
  useEffect(() => {
    if (
      tabAgente !== 'todos' &&
      tabAgente !== 'sin_asignar' &&
      !uidsActivos.has(tabAgente)
    ) {
      setTabAgente('todos')
    }
  }, [tabAgente, uidsActivos])

  // No leídos por pestaña (sobre TODO el scope, no el filtrado por búsqueda).
  // "sin_asignar" junta el pool ('') + huérfanos (dueño que ya no está activo).
  const noLeidosPorTab = useMemo(() => {
    const acc: Record<string, number> = { todos: 0, sin_asignar: 0 }
    agentesWA.forEach(a => { acc[a.uid] = 0 })
    conversaciones.forEach(c => {
      const n = c.noLeidos ?? 0
      acc.todos += n
      if (!c.asignadoA || !uidsActivos.has(c.asignadoA)) acc.sin_asignar += n
      else acc[c.asignadoA] = (acc[c.asignadoA] ?? 0) + n
    })
    return acc
  }, [conversaciones, agentesWA, uidsActivos])

  const convsFiltradas = useMemo(() => {
    return conversaciones.filter(c => {
      const matchBusq = !busqueda
        || c.nombre.toLowerCase().includes(busqueda.toLowerCase())
        || c.telefono.includes(busqueda)
        || c.ultimoMensaje.toLowerCase().includes(busqueda.toLowerCase())
      const matchEstado = filtroEstado === 'todas' || c.estado === filtroEstado
      // Pestaña de secretario — solo aplica a roles de control (verTodo).
      const matchTab =
        !verTodo || tabAgente === 'todos'
          ? true
          : tabAgente === 'sin_asignar'
            ? (!c.asignadoA || !uidsActivos.has(c.asignadoA))
            : c.asignadoA === tabAgente
      return matchBusq && matchEstado && matchTab
    })
  }, [conversaciones, busqueda, filtroEstado, tabAgente, verTodo, uidsActivos])

  const handleSelect = (conv: ConversacionWA) => {
    setSeleccionada(conv)
    setMostrarChat(true)
  }

  return (
    <div style={{
      display: 'flex', height: 'calc(100vh - 112px)',
      borderRadius: 14, overflow: 'hidden',
      border: `1px solid ${WA_DIVIDER}`,
      background: WA_DARK,
      boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
    }}>

      {/* ── Lista de conversaciones ──────────────────────────────────────────── */}
      <div
        className={[
          'flex-col shrink-0 border-r',
          mostrarChat ? 'hidden lg:flex' : 'flex w-full lg:w-auto',
          'lg:flex',
        ].join(' ')}
        style={{
          width: typeof window !== 'undefined' && window.innerWidth < 1024 ? '100%' : 340,
          borderColor: WA_DIVIDER,
          background: WA_DARK,
        }}
      >
        {/* Header lista */}
        <div style={{ padding: '12px 16px', background: WA_PANEL, borderBottom: `1px solid ${WA_DIVIDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: WA_GREEN,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <MessageCircle size={16} color="white" />
              </div>
              <div>
                <p style={{ margin: 0, color: WA_TEXT, fontWeight: 700, fontSize: 15 }}>
                  WhatsApp
                </p>
                <p style={{ margin: 0, color: WA_SUBTEXT, fontSize: 11 }}>
                  {metricas.total} conversaciones · {metricas.noLeidosTotal} sin leer
                </p>
              </div>
            </div>
          </div>

          {/* Métricas rápidas */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {(['todas', 'nueva', 'en_atencion', 'resuelta'] as const).map(e => {
              const labels = { todas: 'Todas', nueva: 'Nuevas', en_atencion: 'En atención', resuelta: 'Resueltas' }
              const count  = e === 'todas' ? metricas.total
                           : e === 'nueva' ? metricas.nuevas
                           : e === 'en_atencion' ? metricas.enAtencion
                           : metricas.resueltas
              return (
                <button
                  key={e}
                  onClick={() => setFiltroEstado(e)}
                  style={{
                    flex: 1, border: 'none', cursor: 'pointer', borderRadius: 8,
                    padding: '4px 0', fontSize: 11, fontWeight: 600,
                    background: filtroEstado === e ? WA_GREEN + '22' : WA_DARK,
                    color:      filtroEstado === e ? WA_GREEN : WA_SUBTEXT,
                    borderBottom: filtroEstado === e ? `2px solid ${WA_GREEN}` : '2px solid transparent',
                  }}
                >
                  {labels[e]}<br />
                  <span style={{ fontSize: 14 }}>{count}</span>
                </button>
              )
            })}
          </div>

          {/* Buscador */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: WA_DARK, borderRadius: 8, padding: '6px 10px',
          }}>
            <Search size={15} color={WA_SUBTEXT} />
            <input
              type="text"
              placeholder="Buscar conversación…"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              style={{
                flex: 1, border: 'none', outline: 'none',
                background: 'transparent', color: WA_TEXT,
                fontSize: 13, fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        {/* Pestañas por secretario — solo roles de control (CEO / Admin Gral) */}
        {verTodo && agentesWA.length > 0 && (
          <div style={{
            display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0,
            padding: '8px 10px', background: WA_DARK,
            borderBottom: `1px solid ${WA_DIVIDER}`,
          }}>
            <TabAgente
              label="Todos"
              activa={tabAgente === 'todos'}
              noLeidos={noLeidosPorTab.todos}
              onClick={() => setTabAgente('todos')}
            />
            {agentesWA.map(a => (
              <TabAgente
                key={a.uid}
                label={a.nombre}
                nombreAvatar={`${a.nombre} ${a.apellido ?? ''}`}
                activa={tabAgente === a.uid}
                noLeidos={noLeidosPorTab[a.uid] ?? 0}
                onClick={() => setTabAgente(a.uid)}
              />
            ))}
            <TabAgente
              label="Sin asignar"
              activa={tabAgente === 'sin_asignar'}
              noLeidos={noLeidosPorTab.sin_asignar}
              onClick={() => setTabAgente('sin_asignar')}
            />
          </div>
        )}

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: WA_PANEL }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ width: '60%', height: 14, background: WA_PANEL, borderRadius: 4, marginBottom: 6 }} />
                    <div style={{ width: '80%', height: 12, background: WA_PANEL, borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : convsFiltradas.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: 40, gap: 8,
            }}>
              <MessageCircle size={28} color={WA_DIVIDER} />
              <p style={{ color: WA_SUBTEXT, fontSize: 13, margin: 0, textAlign: 'center' }}>
                {busqueda ? 'Sin resultados' : 'No hay conversaciones activas'}
              </p>
            </div>
          ) : (
            convsFiltradas.map(conv => (
              <ConversacionCard
                key={conv.id}
                conv={conv}
                activa={seleccionada?.id === conv.id}
                onClick={() => handleSelect(conv)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Panel de chat (móvil: solo cuando mostrarChat=true; desktop: siempre) ── */}
      <div
        className={[
          'flex-1 flex-col min-w-0',
          mostrarChat ? 'flex' : 'hidden lg:flex',
        ].join(' ')}
      >
        {seleccionada ? (
          <PanelChat
            key={seleccionada.id}
            conv={seleccionada}
            onClose={() => { setMostrarChat(false); setSeleccionada(null) }}
          />
        ) : (
          <PanelVacio />
        )}
      </div>

    </div>
  )
}