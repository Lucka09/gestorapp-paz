// src/components/shared/BannerOffline.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Banner de estado de conexión. Se monta una vez en App.tsx y se muestra
// automáticamente cuando el navegador detecta pérdida de conexión.
//
// Comportamiento:
//   - Offline:       banner rojo fijo en la parte superior, no se puede cerrar
//   - Reconectando:  banner ámbar con spinner
//   - Online:        banner verde que desaparece solo tras 3 segundos
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { WifiOff, Wifi, Loader2 } from 'lucide-react'
import { useConexion } from '@/hooks/useConexion'

export default function BannerOffline() {
  const estado = useConexion()
  const [visible, setVisible] = useState(false)
  // Controla si ya mostró al menos una vez el banner (para no mostrar "online"
  // en el primer render cuando la app carga normalmente)
  const [mostroOffline, setMostroOffline] = useState(false)

  useEffect(() => {
    if (estado === 'offline') {
      setMostroOffline(true)
      setVisible(true)
    } else if (estado === 'reconectando') {
      setVisible(true)
    } else if (estado === 'online') {
      if (mostroOffline) {
        // Mostrar "Conexión restaurada" brevemente
        setVisible(true)
        const t = setTimeout(() => setVisible(false), 3000)
        return () => clearTimeout(t)
      }
    }
  }, [estado, mostroOffline])

  if (!visible) return null

  const config = {
    offline: {
      bg:     '#1A1A1A',
      border: '#B91C1C',
      accent: '#EF4444',
      icon:   <WifiOff size={14} />,
      label:  'Sin conexión — mostrando datos en caché',
      sub:    'Las operaciones quedarán pendientes hasta reconectarte.',
    },
    reconectando: {
      bg:     '#1A1A1A',
      border: '#B45309',
      accent: '#F59E0B',
      icon:   <Loader2 size={14} className="animate-spin" />,
      label:  'Reconectando...',
      sub:    'Verificando tu conexión a internet.',
    },
    online: {
      bg:     '#1A1A1A',
      border: '#059669',
      accent: '#10B981',
      icon:   <Wifi size={14} />,
      label:  'Conexión restaurada',
      sub:    'Todo vuelve a funcionar con normalidad.',
    },
  }[estado]

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position:       'fixed',
        bottom:         16,
        left:           '50%',
        transform:      'translateX(-50%)',
        zIndex:         9999,
        display:        'flex',
        alignItems:     'center',
        gap:            10,
        background:     config.bg,
        border:         `1px solid ${config.border}`,
        borderRadius:   12,
        padding:        '10px 16px',
        boxShadow:      '0 8px 32px rgba(0,0,0,0.4)',
        animation:      'toast-in 0.2s ease-out',
        maxWidth:       'calc(100vw - 32px)',
        width:          'max-content',
      }}
    >
      {/* Ícono con color de estado */}
      <div style={{ color: config.accent, flexShrink: 0 }}>
        {config.icon}
      </div>

      {/* Textos */}
      <div style={{ minWidth: 0 }}>
        <p style={{
          fontSize: 13, fontWeight: 600,
          color: config.accent,
          margin: 0, lineHeight: 1.3,
          fontFamily: 'var(--font-body)',
        }}>
          {config.label}
        </p>
        <p style={{
          fontSize: 11, color: '#9CA3AF',
          margin: 0, lineHeight: 1.3,
          fontFamily: 'var(--font-body)',
        }}>
          {config.sub}
        </p>
      </div>

      {/* Dot pulsante — solo en offline */}
      {estado === 'offline' && (
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: config.accent,
          flexShrink: 0,
          animation: 'pulse-orange 2s ease-in-out infinite',
        }} />
      )}
    </div>
  )
}