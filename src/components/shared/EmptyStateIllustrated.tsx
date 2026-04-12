// Ilustraciones SVG para estados vacíos — cada módulo tiene la suya

interface EmptyIllustrationProps {
  tipo:        'clientes' | 'vehiculos' | 'tramites' | 'turnos' | 'notificaciones' | 'pipeline' | 'busqueda' | 'general'
  titulo:      string
  descripcion?: string
  accion?:     React.ReactNode
}

const ilustraciones: Record<string, React.ReactNode> = {
  clientes: (
    <svg width="120" height="100" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="60" cy="90" rx="50" ry="6" fill="#F3F4F6"/>
      {/* Persona 1 */}
      <circle cx="38" cy="30" r="14" fill="#E5E7EB"/>
      <circle cx="38" cy="26" r="7" fill="#D1D5DB"/>
      <path d="M20 58 Q38 44 56 58" stroke="#D1D5DB" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      {/* Persona 2 */}
      <circle cx="82" cy="34" r="12" fill="#FED7AA"/>
      <circle cx="82" cy="30" r="6" fill="#FDBA74"/>
      <path d="M66 60 Q82 48 98 60" stroke="#FDBA74" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      {/* Signo + */}
      <circle cx="60" cy="60" r="14" fill="#D4621A" opacity="0.12"/>
      <line x1="60" y1="53" x2="60" y2="67" stroke="#D4621A" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="53" y1="60" x2="67" y2="60" stroke="#D4621A" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  ),

  vehiculos: (
    <svg width="140" height="90" viewBox="0 0 140 90" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="70" cy="84" rx="60" ry="5" fill="#F3F4F6"/>
      {/* Auto */}
      <rect x="15" y="44" width="110" height="32" rx="8" fill="#E5E7EB"/>
      <path d="M30 44 L44 24 L96 24 L110 44" fill="#D1D5DB"/>
      {/* Ventanas */}
      <rect x="48" y="27" width="18" height="14" rx="3" fill="#BAC8FF" opacity="0.7"/>
      <rect x="72" y="27" width="18" height="14" rx="3" fill="#BAC8FF" opacity="0.7"/>
      {/* Ruedas */}
      <circle cx="36" cy="76" r="12" fill="#374151"/>
      <circle cx="36" cy="76" r="6" fill="#9CA3AF"/>
      <circle cx="104" cy="76" r="12" fill="#374151"/>
      <circle cx="104" cy="76" r="6" fill="#9CA3AF"/>
      {/* Faro */}
      <rect x="17" y="48" width="10" height="7" rx="2" fill="#FCD34D"/>
      {/* Signo + */}
      <circle cx="110" cy="20" r="12" fill="#D4621A" opacity="0.12"/>
      <line x1="110" y1="14" x2="110" y2="26" stroke="#D4621A" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="104" y1="20" x2="116" y2="20" stroke="#D4621A" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  ),

  tramites: (
    <svg width="110" height="110" viewBox="0 0 110 110" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="55" cy="104" rx="45" ry="5" fill="#F3F4F6"/>
      {/* Documento 1 (atrás) */}
      <rect x="30" y="20" width="58" height="72" rx="6" fill="#E5E7EB" transform="rotate(-6 30 20)"/>
      {/* Documento principal */}
      <rect x="18" y="15" width="60" height="76" rx="6" fill="white" stroke="#E5E7EB" strokeWidth="1.5"/>
      {/* Doblado esquina */}
      <path d="M62 15 L78 31 L62 31 Z" fill="#F3F4F6"/>
      <path d="M62 15 L78 31" stroke="#E5E7EB" strokeWidth="1.5"/>
      {/* Líneas de texto */}
      <rect x="26" y="40" width="36" height="4" rx="2" fill="#E5E7EB"/>
      <rect x="26" y="50" width="44" height="3" rx="1.5" fill="#F3F4F6"/>
      <rect x="26" y="58" width="38" height="3" rx="1.5" fill="#F3F4F6"/>
      <rect x="26" y="66" width="42" height="3" rx="1.5" fill="#F3F4F6"/>
      {/* Check grande */}
      <circle cx="76" cy="82" r="16" fill="#D4621A" opacity="0.12"/>
      <path d="M68 82 L74 88 L84 74" stroke="#D4621A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),

  turnos: (
    <svg width="110" height="110" viewBox="0 0 110 110" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="55" cy="104" rx="45" ry="5" fill="#F3F4F6"/>
      {/* Calendario */}
      <rect x="15" y="22" width="80" height="72" rx="8" fill="white" stroke="#E5E7EB" strokeWidth="1.5"/>
      <rect x="15" y="22" width="80" height="24" rx="8" fill="#D4621A" opacity="0.12"/>
      <rect x="15" y="38" width="80" height="8" fill="#D4621A" opacity="0.08"/>
      {/* Argollas */}
      <rect x="33" y="15" width="6" height="16" rx="3" fill="#D1D5DB"/>
      <rect x="71" y="15" width="6" height="16" rx="3" fill="#D1D5DB"/>
      {/* Celdas del calendario */}
      {[0,1,2,3,4,5,6].map((i) => (
        <rect key={i} x={22 + (i % 7) * 10} y={54 + Math.floor(i / 7) * 10} width="7" height="7" rx="1.5" fill="#F3F4F6"/>
      ))}
      {[7,8,9,10,11,12,13].map((i) => (
        <rect key={i} x={22 + ((i-7) % 7) * 10} y={64 + Math.floor((i-7) / 7) * 10} width="7" height="7" rx="1.5" fill="#F3F4F6"/>
      ))}
      {/* Celda destacada */}
      <rect x="42" y="54" width="7" height="7" rx="1.5" fill="#D4621A" opacity="0.3"/>
      {/* Reloj */}
      <circle cx="82" cy="82" r="14" fill="white" stroke="#E5E7EB" strokeWidth="1.5"/>
      <line x1="82" y1="74" x2="82" y2="82" stroke="#D4621A" strokeWidth="2" strokeLinecap="round"/>
      <line x1="82" y1="82" x2="88" y2="86" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="82" cy="82" r="2" fill="#D4621A"/>
    </svg>
  ),

  notificaciones: (
    <svg width="100" height="110" viewBox="0 0 100 110" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="104" rx="42" ry="5" fill="#F3F4F6"/>
      {/* Campana */}
      <path d="M50 16 C35 16 26 27 26 40 L26 60 L18 68 L82 68 L74 60 L74 40 C74 27 65 16 50 16 Z"
        fill="#E5E7EB" stroke="#D1D5DB" strokeWidth="1.5"/>
      {/* Detalle interior */}
      <path d="M34 52 L34 40 C34 31 41 24 50 24 C59 24 66 31 66 40 L66 52"
        fill="#D1D5DB" opacity="0.5"/>
      {/* Base */}
      <rect x="18" y="66" width="64" height="6" rx="3" fill="#D1D5DB"/>
      {/* Gancho */}
      <path d="M50 14 C50 14 48 10 50 8 C52 10 50 14 50 14" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round"/>
      {/* Botón inferior */}
      <path d="M44 72 C44 75.3 46.7 78 50 78 C53.3 78 56 75.3 56 72" stroke="#D1D5DB" strokeWidth="2" fill="none"/>
      {/* Check verde */}
      <circle cx="72" cy="30" r="14" fill="#D1FAE5"/>
      <path d="M65 30 L70 35 L79 22" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),

  pipeline: (
    <svg width="130" height="100" viewBox="0 0 130 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="65" cy="95" rx="55" ry="5" fill="#F3F4F6"/>
      {/* Columnas kanban */}
      {[10, 44, 78].map((x, i) => (
        <g key={i}>
          <rect x={x} y="14" width="28" height="72" rx="6" fill={i === 1 ? '#FEF3EC' : '#F9FAFB'} stroke={i === 1 ? '#FED7AA' : '#E5E7EB'} strokeWidth="1.5"/>
          <rect x={x+4} y="22" width="20" height="14" rx="3" fill={i === 1 ? '#FDBA74' : '#E5E7EB'}/>
          {i < 2 && <rect x={x+4} y="40" width="20" height="14" rx="3" fill={i === 1 ? '#FED7AA' : '#E5E7EB'} opacity="0.7"/>}
          {i === 0 && <rect x={x+4} y="58" width="20" height="14" rx="3" fill="#E5E7EB" opacity="0.5"/>}
        </g>
      ))}
      {/* Flechas */}
      <path d="M39 50 L43 50" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M41 47 L44 50 L41 53" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M73 50 L77 50" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M75 47 L78 50 L75 53" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Star */}
      <circle cx="107" cy="22" r="13" fill="#D4621A" opacity="0.12"/>
      <path d="M107 12 L109.5 18.5 L116.5 19 L111.5 24 L113 31 L107 27.5 L101 31 L102.5 24 L97.5 19 L104.5 18.5 Z"
        fill="#D4621A" opacity="0.5"/>
    </svg>
  ),

  busqueda: (
    <svg width="110" height="100" viewBox="0 0 110 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="55" cy="94" rx="45" ry="5" fill="#F3F4F6"/>
      <circle cx="46" cy="42" r="26" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="2"/>
      <circle cx="46" cy="42" r="18" fill="white" stroke="#F3F4F6" strokeWidth="1.5"/>
      {/* Líneas dentro */}
      <rect x="38" y="38" width="16" height="3" rx="1.5" fill="#E5E7EB"/>
      <rect x="38" y="44" width="12" height="3" rx="1.5" fill="#F3F4F6"/>
      {/* Mango lupa */}
      <line x1="65" y1="61" x2="84" y2="80" stroke="#D1D5DB" strokeWidth="5" strokeLinecap="round"/>
      {/* X dentro de lupa */}
      <line x1="40" y1="36" x2="52" y2="48" stroke="#D4621A" strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
      <line x1="52" y1="36" x2="40" y2="48" stroke="#D4621A" strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
    </svg>
  ),

  general: (
    <svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="94" rx="42" ry="5" fill="#F3F4F6"/>
      <rect x="20" y="20" width="60" height="60" rx="12" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="1.5"/>
      <rect x="30" y="35" width="40" height="5" rx="2.5" fill="#E5E7EB"/>
      <rect x="30" y="46" width="28" height="4" rx="2" fill="#F3F4F6"/>
      <rect x="30" y="56" width="34" height="4" rx="2" fill="#F3F4F6"/>
      <circle cx="72" cy="72" r="14" fill="#D4621A" opacity="0.12"/>
      <line x1="72" y1="66" x2="72" y2="78" stroke="#D4621A" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="66" y1="72" x2="78" y2="72" stroke="#D4621A" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  ),
}

const copys: Record<string, { titulo: string; desc: string }> = {
  clientes:       { titulo: 'Sin clientes todavía', desc: 'Registrá el primer cliente para empezar a gestionar sus trámites.' },
  vehiculos:      { titulo: 'Sin vehículos', desc: 'Agregá un vehículo vinculándolo al cliente titular.' },
  tramites:       { titulo: 'Sin trámites', desc: 'Creá el primer trámite seleccionando un cliente y su vehículo.' },
  turnos:         { titulo: 'Sin turnos para este día', desc: 'No hay turnos agendados. Podés agregar uno con el botón de arriba.' },
  notificaciones: { titulo: 'Todo al día', desc: 'No tenés notificaciones sin leer por el momento.' },
  pipeline:       { titulo: 'El pipeline está vacío', desc: 'Agregá tu primer prospecto para empezar a gestionar la cartera comercial.' },
  busqueda:       { titulo: 'Sin resultados', desc: 'No encontramos coincidencias. Probá con otros términos.' },
  general:        { titulo: 'Nada por aquí', desc: 'Este espacio todavía está vacío.' },
}

export function EmptyStateIllustrated({
  tipo,
  titulo,
  descripcion,
  accion,
}: EmptyIllustrationProps) {
  const ilust = ilustraciones[tipo] ?? ilustraciones.general
  const copy  = copys[tipo] ?? copys.general

  return (
    <div
      className="flex flex-col items-center justify-center py-14 px-6 text-center"
      style={{ animation: 'var(--animate-fadein, fadein 0.3s ease-out)' }}
    >
      <div style={{ marginBottom: 20, opacity: 0.85 }}>
        {ilust}
      </div>
      <h3 style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 700, fontSize: 16,
        color: 'var(--color-text-2)',
        margin: '0 0 6px',
      }}>
        {titulo || copy.titulo}
      </h3>
      <p style={{
        fontSize: 13,
        color: 'var(--color-text-4)',
        lineHeight: 1.6,
        maxWidth: 280,
        margin: '0 0 20px',
      }}>
        {descripcion || copy.desc}
      </p>
      {accion}
    </div>
  )
}

// Export individual para usar directo
export { ilustraciones }
