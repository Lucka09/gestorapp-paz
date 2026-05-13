import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Sparkles, X, Send, ChevronDown,
  Loader2, RefreshCw, Copy, Check,
  MessageSquare, Zap,
} from 'lucide-react'
import { useAuth }          from '@/hooks/useAuth'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app }              from '@/lib/firebase'
import { useGestoria } from '@/context/GestoriaContext'
import { useMetricas, useUltimosTramites, useTurnosHoy } from '@/hooks/useDashboard'

// ─── TIPOS ───────────────────────────────────────────────────────────────────

interface Mensaje {
  id:      string
  rol:     'user' | 'assistant'
  texto:   string
  ts:      number
  copiado?: boolean
}

// ─── SUGERENCIAS RÁPIDAS ──────────────────────────────────────────────────────

const SUGERENCIAS = [
  '¿Qué trámites están demorados?',
  'Documentación para transferencia',
  '¿Cuántos turnos hay hoy?',
  'Generame un mensaje para un cliente',
  '¿Cómo va la cobranza este mes?',
  'Explicame el trámite 08',
]

// ─── SISTEMA PROMPT ───────────────────────────────────────────────────────────

function buildSystemPrompt(params: {
  nombreUsuario: string
  rolUsuario:    string
  nombreGestoria: string
  metricas?: {
    tramitesActivos: number
    tramitesHoy:     number
    turnosHoy:       number
    clientesTotal:   number
  }
  ultimosTramites?: Array<{
    tipo:    string
    estado:  string
    cliente: string
    patente: string
  }>
  turnosHoy?: Array<{
    hora:    string
    tipo:    string
    cliente: string
  }>
}) {
  const { nombreUsuario, rolUsuario, nombreGestoria, metricas, ultimosTramites, turnosHoy } = params

  const metricasStr = metricas
    ? `
MÉTRICAS ACTUALES:
- Trámites activos: ${metricas.tramitesActivos}
- Trámites iniciados hoy: ${metricas.tramitesHoy}
- Turnos hoy: ${metricas.turnosHoy}
- Clientes registrados: ${metricas.clientesTotal}`
    : ''

  const tramitesStr = ultimosTramites?.length
    ? `\nÚLTIMOS TRÁMITES:\n${ultimosTramites.map(t =>
        `- ${t.tipo} | ${t.patente} | Cliente: ${t.cliente} | Estado: ${t.estado}`
      ).join('\n')}`
    : ''

  const turnosStr = turnosHoy?.length
    ? `\nTURNOS DE HOY:\n${turnosHoy.map(t =>
        `- ${t.hora} hs | ${t.tipo} | ${t.cliente}`
      ).join('\n')}`
    : ''

  return `Sos el Asistente IA de GestorApp, el sistema de gestión para gestorías de automotores de Argentina. Tu nombre es "Gestor IA".

CONTEXTO:
- Gestoría: ${nombreGestoria}
- Usuario: ${nombreUsuario} (Rol: ${rolUsuario})
- Sistema: GestorApp por JAH-NISSI Digital Studio
${metricasStr}${tramitesStr}${turnosStr}

TUS CAPACIDADES:
1. Consultar y analizar trámites, turnos, clientes y métricas del sistema
2. Redactar mensajes profesionales para clientes (WhatsApp, email)
3. Explicar requisitos y documentación para cada tipo de trámite
4. Sugerir próximas acciones para mejorar la operación
5. Responder sobre la normativa DNRPA y trámites de automotores en Argentina
6. Ayudar con presupuestos, seguimientos y gestión del equipo

TRÁMITES QUE GESTIONA LA GESTORÍA (servicios reales de ${nombreGestoria}):
- Transferencia de dominio
- Alta (inscripción inicial)
- Baja de dominio
- Trámite 08 (formulario 08 DNRPA)
- Duplicado de título / cédula
- Cambio de radicación
- Informe y certificado de dominio
- Prenda (constitución/cancelación)
- Descargo de multas PBA
- Inhibición / levantamiento de inhibición
- VTV (verificación técnica vehicular)

ESTADOS DE TRÁMITE:
pendiente → en_proceso → en_organismo → listo_para_retirar → entregado
(también: documentacion_requerida, cancelado)

REGLAS DE COMUNICACIÓN:
- Respondé siempre en español argentino (usá "vos" y formas verbales argentinas)
- Sé conciso pero completo. Usá bullet points cuando la respuesta tenga más de 3 ítems
- Cuando redactes mensajes para clientes, poné el texto entre triple guiones (---) para que sea fácil de copiar
- Si no tenés datos suficientes para responder algo concreto, pedí más contexto
- Nunca inventes datos de trámites específicos; basate en lo que te dieron
- Podés hacer cálculos, comparaciones y sugerencias estratégicas

Sos el asistente más capacitado de Argentina en gestión de automotores. Ayudá al equipo a ser más eficiente y brindar un servicio excepcional.`
}

// ─── FLAG BETA ────────────────────────────────────────────────────────────────
// Poner en `true` cuando el proxy de Cloud Function esté listo.
const IA_DISPONIBLE = false

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

export default function AsistenteIA() {
  const { user }                 = useAuth()
  const { nombreComercial }      = useGestoria()
  const { metricas }             = useMetricas()
  const { tramites: ultTramites } = useUltimosTramites()
  const { turnos: turnosHoy }    = useTurnosHoy()

  const [abierto,   setAbierto]   = useState(false)
  const [mensajes,  setMensajes]  = useState<Mensaje[]>([])
  const [input,     setInput]     = useState('')
  const [cargando,  setCargando]  = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [pulso,     setPulso]     = useState(false)

  const endRef    = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)
  const abortRef  = useRef<AbortController | null>(null)

  // Auto-scroll al último mensaje
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes, cargando])

  // Focus en input al abrir
  useEffect(() => {
    if (abierto) setTimeout(() => inputRef.current?.focus(), 150)
  }, [abierto])

  // Pulso cuando hay respuesta nueva y el chat está cerrado
  useEffect(() => {
    if (!abierto && mensajes.length > 0) {
      setPulso(true)
      const t = setTimeout(() => setPulso(false), 3000)
      return () => clearTimeout(t)
    }
  }, [mensajes.length])

  // ── Construir contexto dinámico ───────────────────────────────────────────

  const systemPrompt = buildSystemPrompt({
    nombreUsuario: `${user?.nombre ?? ''} ${user?.apellido ?? ''}`.trim() || 'Usuario',
    rolUsuario:    user?.rol ?? 'operador',
    nombreGestoria: nombreComercial,
    metricas: metricas ? {
      tramitesActivos: metricas.tramitesActivos  ?? 0,
      tramitesHoy:     metricas.tramitesHoy      ?? 0,
      turnosHoy:       metricas.turnosHoy        ?? 0,
      clientesTotal:   metricas.totalClientes    ?? 0,
    } : undefined,
    ultimosTramites: ultTramites.slice(0, 5).map(t => ({
      tipo:    t.tipo,
      estado:  t.estado,
      cliente: t.clienteId ?? '',
      patente: t.patente,
    })),
    turnosHoy: turnosHoy.slice(0, 5).map(t => ({
      hora:    t.horaInicio ?? '--:--',
      tipo:    t.tipoTramite,
      cliente: t.clienteNombre ?? '',
    })),
  })

  // ── Enviar mensaje ────────────────────────────────────────────────────────

  const enviar = useCallback(async (texto: string) => {
    const textoProcesado = texto.trim()
    if (!textoProcesado || cargando) return

    setError(null)
    setInput('')

    const nuevoMensaje: Mensaje = {
      id:    crypto.randomUUID(),
      rol:   'user',
      texto: textoProcesado,
      ts:    Date.now(),
    }

    const historialActualizado = [...mensajes, nuevoMensaje]
    setMensajes(historialActualizado)
    setCargando(true)

    abortRef.current = new AbortController()

    try {
      // —— Llamar al proxy Cloud Function (API key nunca llega al cliente) ——
      const functions = getFunctions(app, 'us-central1')
      const callProxy = httpsCallable<
        { messages: Array<{role: string; content: string}>; systemPrompt: string; gestoriaId: string },
        { texto: string }
      >(functions, 'claudeProxy')

      const resultado = await callProxy({
        messages: historialActualizado.map(m => ({
          role:    m.rol,
          content: m.texto,
        })),
        systemPrompt,
        gestoriaId: user?.gestoriaId ?? '',
      })

      const respuesta = resultado.data.texto ?? ''

      setMensajes(prev => [
        ...prev,
        {
          id:    crypto.randomUUID(),
          rol:   'assistant',
          texto: respuesta,
          ts:    Date.now(),
        },
      ])
    } catch (err: any) {
      if (err.name === 'AbortError') return
      const msg = err?.message ?? 'Error al conectar con el asistente.'
      setError(msg.includes('internal') ? 'Error interno del asistente. Intentá de nuevo.' : msg)
    } finally {
      setCargando(false)
    }
  }, [mensajes, cargando, systemPrompt])

  // ── Enter para enviar ─────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar(input)
    }
  }

  // ── Copiar mensaje ────────────────────────────────────────────────────────

  const copiar = (id: string, texto: string) => {
    navigator.clipboard.writeText(texto)
    setMensajes(prev =>
      prev.map(m => m.id === id ? { ...m, copiado: true } : m)
    )
    setTimeout(() => {
      setMensajes(prev =>
        prev.map(m => m.id === id ? { ...m, copiado: false } : m)
      )
    }, 2000)
  }

  // ── Reiniciar conversación ────────────────────────────────────────────────

  const reiniciar = () => {
    abortRef.current?.abort()
    setMensajes([])
    setError(null)
    setCargando(false)
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────

  // Botón deshabilitado en Beta — IA no disponible hasta que el proxy CF esté listo
  if (!IA_DISPONIBLE) {
    return (
      <div
        title="Asistente IA — Próximamente"
        aria-label="Asistente IA — Próximamente"
        style={{
          position:       'fixed',
          bottom:         24,
          right:          24,
          zIndex:         9999,
          width:          52,
          height:         52,
          borderRadius:   '50%',
          background:     '#9ca3af',
          color:          'white',
          border:         'none',
          cursor:         'not-allowed',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          boxShadow:      '0 4px 16px rgba(0,0,0,0.15)',
          opacity:        0.7,
        }}
      >
        <Sparkles size={22} />
        {/* Tooltip "Próximamente" */}
        <span style={{
          position:      'absolute',
          bottom:        60,
          right:         0,
          background:    '#1A1A1A',
          color:         'white',
          fontSize:      11,
          fontWeight:    600,
          padding:       '5px 10px',
          borderRadius:  8,
          whiteSpace:    'nowrap',
          pointerEvents: 'none',
          opacity:       0,
          transition:    'opacity 0.2s',
        }}
          className="ia-tooltip"
        >
          Próximamente ✨
        </span>
        <style>{`.ia-tooltip { opacity: 0 !important; } div[title="Asistente IA — Próximamente"]:hover .ia-tooltip { opacity: 1 !important; }`}</style>
      </div>
    )
  }

  return (
    <>
      {/* ── Botón flotante ── */}
      <button
        onClick={() => setAbierto(v => !v)}
        aria-label="Asistente IA GestorApp"
        style={{
          position:     'fixed',
          bottom:       24,
          right:        24,
          zIndex:       9999,
          width:        52,
          height:       52,
          borderRadius: '50%',
          background:   abierto ? '#1A1A1A' : 'var(--gp-orange, #D4621A)',
          color:        'white',
          border:       'none',
          cursor:       'pointer',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          boxShadow:    '0 4px 20px rgba(212, 98, 26, 0.45)',
          transition:   'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
          transform:    abierto ? 'rotate(0deg) scale(1)' : pulso ? 'scale(1.12)' : 'scale(1)',
        }}
      >
        {abierto
          ? <ChevronDown size={22} />
          : <Sparkles size={22} />
        }
        {/* Badge de pulso */}
        {!abierto && pulso && (
          <span style={{
            position:     'absolute',
            top:          2, right: 2,
            width:        10, height: 10,
            background:   '#22c55e',
            borderRadius: '50%',
            border:       '2px solid white',
            animation:    'pulseBadge 1.5s ease-in-out infinite',
          }} />
        )}
      </button>

      {/* ── Panel del chat ── */}
      <div
        style={{
          position:      'fixed',
          bottom:        86,
          right:         24,
          zIndex:        9998,
          width:         'min(420px, calc(100vw - 32px))',
          height:        'min(580px, calc(100vh - 120px))',
          background:    'white',
          borderRadius:  20,
          boxShadow:     '0 24px 60px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
          display:       'flex',
          flexDirection: 'column',
          overflow:      'hidden',
          border:        '1px solid rgba(212,98,26,0.12)',
          // Animación
          opacity:       abierto ? 1 : 0,
          pointerEvents: abierto ? 'all' : 'none',
          transform:     abierto
            ? 'translateY(0) scale(1)'
            : 'translateY(16px) scale(0.97)',
          transition:    'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          transformOrigin: 'bottom right',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          background:    'linear-gradient(135deg, #1A1A1A 0%, #2d2d2d 100%)',
          padding:       '14px 16px',
          display:       'flex',
          alignItems:    'center',
          gap:           12,
          flexShrink:    0,
        }}>
          <div style={{
            width: 36, height: 36,
            borderRadius: 10,
            background: 'rgba(212,98,26,0.25)',
            border: '1.5px solid rgba(212,98,26,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Sparkles size={17} color="#F4936A" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              color: 'white', fontWeight: 700,
              fontSize: 13, margin: 0, lineHeight: 1.3,
            }}>
              Gestor IA
            </p>
            <p style={{
              color: 'rgba(255,255,255,0.45)',
              fontSize: 11, margin: 0,
            }}>
              {nombreComercial} · GestorApp
            </p>
          </div>

          {/* Status indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginRight: 4 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: cargando ? '#f59e0b' : '#22c55e',
              boxShadow: cargando ? '0 0 0 2px rgba(245,158,11,0.3)' : '0 0 0 2px rgba(34,197,94,0.3)',
              transition: 'all 0.3s',
            }} />
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>
              {cargando ? 'pensando…' : 'activo'}
            </span>
          </div>

          {/* Botones de acción */}
          {mensajes.length > 0 && (
            <button
              onClick={reiniciar}
              title="Nueva conversación"
              style={{
                background: 'transparent', border: 'none',
                color: 'rgba(255,255,255,0.35)', cursor: 'pointer',
                padding: 4, borderRadius: 6,
                display: 'flex', alignItems: 'center',
                transition: 'color 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
            >
              <RefreshCw size={14} />
            </button>
          )}
          <button
            onClick={() => setAbierto(false)}
            style={{
              background: 'transparent', border: 'none',
              color: 'rgba(255,255,255,0.35)', cursor: 'pointer',
              padding: 4, borderRadius: 6,
              display: 'flex', alignItems: 'center',
              transition: 'color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Mensajes ── */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: 10,
          scrollbarWidth: 'thin',
          scrollbarColor: '#e5e7eb transparent',
        }}>

          {/* Estado vacío con sugerencias */}
          {mensajes.length === 0 && !cargando && (
            <div style={{ marginTop: 8 }}>
              <div style={{
                background: 'linear-gradient(135deg, #fff7f2 0%, #fff 100%)',
                border: '1px solid rgba(212,98,26,0.15)',
                borderRadius: 14,
                padding: '14px 16px',
                marginBottom: 14,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Zap size={14} color="#D4621A" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#D4621A' }}>
                    Gestor IA listo
                  </span>
                </div>
                <p style={{ fontSize: 12, color: '#6b7280', margin: 0, lineHeight: 1.55 }}>
                  Hola {user?.nombre}! Puedo ayudarte a gestionar trámites, redactar mensajes,
                  consultar el estado del negocio y mucho más. ¿En qué arrancamos?
                </p>
              </div>

              <p style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 8, paddingLeft: 2 }}>
                Sugerencias rápidas
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {SUGERENCIAS.map(s => (
                  <button
                    key={s}
                    onClick={() => enviar(s)}
                    style={{
                      background: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: 10,
                      padding: '8px 12px',
                      textAlign: 'left',
                      fontSize: 12,
                      color: '#374151',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = '#D4621A'
                      e.currentTarget.style.color = '#D4621A'
                      e.currentTarget.style.background = '#fff7f2'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.color = '#374151'
                      e.currentTarget.style.background = 'white'
                    }}
                  >
                    <MessageSquare size={12} style={{ flexShrink: 0, opacity: 0.5 }} />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Historial de mensajes */}
          {mensajes.map(m => (
            <BurbujaMensaje
              key={m.id}
              mensaje={m}
              onCopiar={copiar}
            />
          ))}

          {/* Indicador de carga */}
          {cargando && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'linear-gradient(135deg, #1A1A1A, #2d2d2d)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Sparkles size={13} color="#F4936A" />
              </div>
              <div style={{
                background: '#f3f4f6', borderRadius: '4px 14px 14px 14px',
                padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#D4621A', opacity: 0.7,
                    animation: 'typingDot 1.2s ease-in-out infinite',
                    animationDelay: `${i * 0.2}s`,
                    display: 'inline-block',
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 10, padding: '10px 12px',
              fontSize: 12, color: '#dc2626',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>⚠️</span>
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none',
                  color: '#dc2626', cursor: 'pointer', fontSize: 14 }}
              >×</button>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* ── Input ── */}
        <div style={{
          borderTop: '1px solid #f3f4f6',
          padding: '10px 12px',
          background: 'white',
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 8,
            background: '#f9fafb',
            border: '1.5px solid #e5e7eb',
            borderRadius: 14,
            padding: '8px 8px 8px 12px',
            transition: 'border-color 0.2s',
          }}
            onFocusCapture={e => (e.currentTarget.style.borderColor = '#D4621A')}
            onBlurCapture={e  => (e.currentTarget.style.borderColor = '#e5e7eb')}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Preguntame lo que necesites…"
              rows={1}
              disabled={cargando}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                fontSize: 13,
                color: '#1f2937',
                lineHeight: 1.5,
                maxHeight: 100,
                overflowY: 'auto',
                fontFamily: 'inherit',
              }}
              onInput={e => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 100)}px`
              }}
            />
            <button
              onClick={() => enviar(input)}
              disabled={!input.trim() || cargando}
              style={{
                width: 32, height: 32,
                borderRadius: 9,
                background: (!input.trim() || cargando) ? '#e5e7eb' : '#D4621A',
                border: 'none',
                cursor: (!input.trim() || cargando) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                transition: 'all 0.2s',
              }}
            >
              {cargando
                ? <Loader2 size={15} color="white" style={{ animation: 'spin 1s linear infinite' }} />
                : <Send size={14} color={(!input.trim() || cargando) ? '#9ca3af' : 'white'} />
              }
            </button>
          </div>
          <p style={{
            fontSize: 10, color: '#9ca3af',
            textAlign: 'center', marginTop: 6, marginBottom: 0,
          }}>
            Enter para enviar · Shift+Enter para nueva línea
          </p>
        </div>
      </div>

      {/* ── Estilos globales ── */}
      <style>{`
        @keyframes typingDot {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50%       { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes pulseBadge {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%       { transform: scale(1.3); opacity: 0.7; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes fadeInMsg {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  )
}

// ─── BURBUJA DE MENSAJE ───────────────────────────────────────────────────────

function BurbujaMensaje({
  mensaje,
  onCopiar,
}: {
  mensaje:  Mensaje
  onCopiar: (id: string, texto: string) => void
}) {
  const esUsuario = mensaje.rol === 'user'

  // Formatear el texto con soporte básico de markdown
  const formatearTexto = (texto: string) => {
    const lineas = texto.split('\n')
    return lineas.map((linea, i) => {
      // Encabezados
      if (linea.startsWith('### ')) return (
        <p key={i} style={{ fontWeight: 700, fontSize: 13, color: '#111', margin: '10px 0 4px' }}>
          {linea.slice(4)}
        </p>
      )
      if (linea.startsWith('## ')) return (
        <p key={i} style={{ fontWeight: 700, fontSize: 14, color: '#111', margin: '12px 0 4px' }}>
          {linea.slice(3)}
        </p>
      )
      // Bullets
      if (linea.match(/^[-*•]\s/)) return (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 2 }}>
          <span style={{ color: '#D4621A', flexShrink: 0, marginTop: 1 }}>•</span>
          <span style={{ fontSize: 12 }}>{formatearInline(linea.slice(2))}</span>
        </div>
      )
      // Separador de mensaje para cliente
      if (linea === '---') return (
        <div key={i} style={{
          background: '#fff7f2', border: '1px dashed #D4621A',
          borderRadius: 6, padding: '2px 8px', margin: '6px 0',
          fontSize: 10, color: '#D4621A', fontStyle: 'italic',
        }}>
          ↓ Texto para cliente
        </div>
      )
      // Vacío
      if (!linea.trim()) return <div key={i} style={{ height: 4 }} />
      // Normal
      return (
        <p key={i} style={{ margin: '1px 0', fontSize: 12, lineHeight: 1.6 }}>
          {formatearInline(linea)}
        </p>
      )
    })
  }

  const formatearInline = (texto: string): React.ReactNode => {
    // Bold **texto**
    const parts = texto.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((p, i) =>
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={i} style={{ fontWeight: 700 }}>{p.slice(2, -2)}</strong>
        : p
    )
  }

  return (
    <div
      style={{
        display:        'flex',
        flexDirection:  esUsuario ? 'row-reverse' : 'row',
        alignItems:     'flex-start',
        gap:            8,
        animation:      'fadeInMsg 0.25s ease-out',
      }}
    >
      {/* Avatar del asistente */}
      {!esUsuario && (
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: 'linear-gradient(135deg, #1A1A1A, #2d2d2d)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginTop: 2,
        }}>
          <Sparkles size={13} color="#F4936A" />
        </div>
      )}

      <div style={{ maxWidth: '82%', minWidth: 40 }}>
        {/* Burbuja */}
        <div
          style={{
            padding:      '9px 12px',
            borderRadius: esUsuario
              ? '14px 4px 14px 14px'
              : '4px 14px 14px 14px',
            background:   esUsuario
              ? 'linear-gradient(135deg, #D4621A 0%, #e07030 100%)'
              : '#f3f4f6',
            color:        esUsuario ? 'white' : '#1f2937',
          }}
        >
          {esUsuario
            ? <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>{mensaje.texto}</p>
            : <div style={{ color: '#1f2937' }}>{formatearTexto(mensaje.texto)}</div>
          }
        </div>

        {/* Acciones del mensaje del asistente */}
        {!esUsuario && (
          <div style={{ display: 'flex', gap: 4, marginTop: 4, paddingLeft: 2 }}>
            <button
              onClick={() => onCopiar(mensaje.id, mensaje.texto)}
              title="Copiar respuesta"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 10, color: '#9ca3af', padding: '2px 6px',
                borderRadius: 4, transition: 'color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#D4621A')}
              onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}
            >
              {mensaje.copiado
                ? <><Check size={11} /><span>Copiado</span></>
                : <><Copy size={11} /><span>Copiar</span></>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  )
}