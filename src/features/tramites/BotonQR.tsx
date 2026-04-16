import { useState, useRef, useEffect } from 'react'
import { QrCode, Download, Copy, ExternalLink, Loader2 } from 'lucide-react'
import { obtenerOGenerarToken }  from '@/lib/firestore/tramites'
import { Button }                from '@/components/ui'
import toast from 'react-hot-toast'

interface Props {
  tramiteId: string
  patente:   string
  tipo:      string
}

export function BotonQR({ tramiteId, patente, tipo }: Props) {
  const [abierto,  setAbierto]  = useState(false)
  const [token,    setToken]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [qrSrc,    setQrSrc]    = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const url = token
    ? `${window.location.origin}/seguimiento/${token}`
    : null

  // Generar QR al abrir
  useEffect(() => {
    if (!abierto) return
    setLoading(true)

    obtenerOGenerarToken(tramiteId)
      .then(async tok => {
        setToken(tok)
        const urlFull = `${window.location.origin}/seguimiento/${tok}`

        // Generar QR con la library
        const QRCode = await import('qrcode')
        const dataUrl = await QRCode.toDataURL(urlFull, {
          width:           280,
          margin:          2,
          color:           { dark: '#1A1A1A', light: '#FFFFFF' },
          errorCorrectionLevel: 'M',
        })
        setQrSrc(dataUrl)
      })
      .catch(() => toast.error('Error al generar el QR'))
      .finally(() => setLoading(false))
  }, [abierto, tramiteId])

  const handleDescargar = () => {
    if (!qrSrc) return
    const a = document.createElement('a')
    a.href = qrSrc
    a.download = `QR_${patente}_GestoriaPaz.png`
    a.click()
    toast.success('QR descargado')
  }

  const handleCopiarURL = () => {
    if (!url) return
    navigator.clipboard.writeText(url)
    toast.success('URL copiada al portapapeles')
  }

  const handleAbrir = () => {
    if (!url) return
    window.open(url, '_blank')
  }

  if (!abierto) {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setAbierto(true)}
      >
        <QrCode size={14} /> QR Seguimiento
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[999] flex items-center justify-center p-4"
         onClick={() => setAbierto(false)}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#1A1A1A] px-6 py-5 flex items-center gap-3">
          <div className="w-10 h-10 bg-[#D4621A] rounded-xl flex items-center justify-center">
            <QrCode size={18} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm">QR de seguimiento</p>
            <p className="text-gray-400 text-xs font-mono">{patente} · {tipo}</p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* QR image */}
          <div className="flex items-center justify-center">
            {loading ? (
              <div className="w-[200px] h-[200px] flex items-center justify-center">
                <Loader2 size={28} className="animate-spin text-gray-300" />
              </div>
            ) : qrSrc ? (
              <div className="p-3 border-2 border-gray-100 rounded-2xl inline-block">
                <img
                  src={qrSrc}
                  alt={`QR de seguimiento de ${patente}`}
                  className="w-[200px] h-[200px] rounded-lg"
                />
              </div>
            ) : null}
          </div>

          {/* Instrucción */}
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-800">
              El cliente escanea y ve el estado
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Sin login · En tiempo real · Desde cualquier celular
            </p>
          </div>

          {/* URL acortada */}
          {url && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5
                            flex items-center gap-2">
              <p className="flex-1 text-xs font-mono text-gray-600 truncate">{url}</p>
              <button
                onClick={handleCopiarURL}
                className="text-gray-400 hover:text-[var(--gp-orange)] transition-colors shrink-0"
                aria-label="Copiar URL"
              >
                <Copy size={13} />
              </button>
            </div>
          )}

          {/* Acciones */}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={handleDescargar} disabled={!qrSrc}>
              <Download size={14} /> Descargar QR
            </Button>
            <Button variant="secondary" onClick={handleAbrir} disabled={!url}>
              <ExternalLink size={14} /> Previsualizar
            </Button>
          </div>

          {/* Cerrar */}
          <button
            onClick={() => setAbierto(false)}
            className="w-full text-center text-sm text-gray-400 hover:text-gray-600
                       transition-colors py-1"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
