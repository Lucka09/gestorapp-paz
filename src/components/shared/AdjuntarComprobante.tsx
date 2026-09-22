// src/components/shared/AdjuntarComprobante.tsx
// ─── ADJUNTAR COMPROBANTE EN UN FORMULARIO DE PAGO ───────────────────────────
//
// Se monta en los cuatro puntos de cobro, debajo de CamposDeduccion.
// Solo aparece cuando el método lo amerita (no en efectivo).
//
// Diseño: el archivo se ELIGE acá pero se SUBE cuando el padre confirma el
// pago. Así, si el secretario cancela el cobro, no queda un archivo huérfano
// en Storage. El padre recibe el File y lo sube después de crear el recibo.
//
// Es opcional a propósito: si fuera obligatorio, se subiría cualquier foto
// para poder guardar. Si no se adjunta, el recibo queda como pendiente de
// comprobante y se puede completar desde la solapa Comprobantes.

import { useRef, useState, useEffect } from 'react'
import { Paperclip, FileText, X, Camera } from 'lucide-react'
import { requiereComprobante, validarArchivo } from '@/lib/firestore/comprobantes'

interface Props {
  metodo:   string
  archivo:  File | null
  onChange: (f: File | null) => void
  compacto?: boolean
}

export default function AdjuntarComprobante({ metodo, archivo, onChange, compacto }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!archivo || !archivo.type.startsWith('image/')) { setPreview(null); return }
    const u = URL.createObjectURL(archivo)
    setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [archivo])

  if (!requiereComprobante(metodo)) return null

  const elegir = (f?: File) => {
    setError(null)
    if (!f) return
    const err = validarArchivo(f)
    if (err) { setError(err); return }
    onChange(f)
  }

  return (
    <div className={`rounded-xl border border-dashed p-3 ${
      archivo ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-300 bg-gray-50/40'
    }`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
          <Paperclip className="w-3.5 h-3.5" /> Comprobante del pago
        </p>
        {!archivo && <span className="text-[10px] text-gray-400">opcional</span>}
      </div>

      {archivo ? (
        <div className="flex items-center gap-3 mt-2">
          {preview
            ? <img src={preview} alt="" className="w-12 h-12 rounded-lg object-cover border border-gray-200" />
            : <div className="w-12 h-12 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                <FileText className="w-5 h-5 text-red-500" />
              </div>}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-800 truncate">{archivo.name}</p>
            <p className="text-xs text-gray-400">{(archivo.size / 1024).toFixed(0)} KB · se sube al confirmar</p>
          </div>
          <button type="button" onClick={() => onChange(null)}
            className="text-gray-400 hover:text-red-500 shrink-0"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <div className={`flex gap-2 mt-2 ${compacto ? '' : ''}`}>
          <button type="button" onClick={() => inputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200
                       bg-white text-xs font-medium text-gray-600 hover:border-[#D4621A] hover:text-[#D4621A]">
            <Paperclip className="w-3.5 h-3.5" /> Elegir archivo
          </button>
          <label className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200
                            bg-white text-xs font-medium text-gray-600 hover:border-[#D4621A] hover:text-[#D4621A] cursor-pointer">
            <Camera className="w-3.5 h-3.5" /> Sacar foto
            <input type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => elegir(e.target.files?.[0])} />
          </label>
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden"
        onChange={e => elegir(e.target.files?.[0])} />

      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
      {!archivo && !error && (
        <p className="text-[11px] text-gray-400 mt-1.5">
          Captura de la transferencia o ticket de la tarjeta. Si no lo tenés ahora,
          se puede adjuntar después desde Cobranzas → Comprobantes.
        </p>
      )}
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════════════════════
   CÓMO MONTARLO — mismo patrón en los cuatro puntos de cobro
   ═══════════════════════════════════════════════════════════════════════════

1 · Estado:
      const [comprobante, setComprobante] = useState<File | null>(null)

2 · Debajo de <CamposDeduccion>:
      <AdjuntarComprobante metodo={metodo} archivo={comprobante} onChange={setComprobante} />

3 · Después de crear el recibo, subirlo. El pago ya quedó guardado: si la
    subida falla, se avisa pero NO se revierte el cobro.

      const reciboId = ...   // lo que devuelva el flujo de cobro
      if (comprobante && reciboId) {
        try {
          await adjuntarARecibo(comprobante, {
            id: reciboId, gestoriaId, monto, formaPago: metodo,
            tramiteId, clienteId, patente, numeroRecibo,
          }, { uid: user.uid, nombre: `${user.nombre} ${user.apellido}`.trim() })
        } catch (e) {
          toast('El cobro se guardó, pero el comprobante no se pudo subir. ' +
                'Adjuntalo desde Cobranzas → Comprobantes.', { icon: '📎' })
        }
      }

    Para esto los flujos tienen que DEVOLVER el reciboId:
      · registrarPago       → ya devuelve { reciboId, numeroRecibo } ✓
      · agregarPagoMulta    → hoy devuelve void. Cambialo a Promise<string | null>
                               y que retorne el reciboId que crea adentro.
      · confirmarPaso7Multa → mismo cambio.

4 · Limpiar en el reset:  setComprobante(null)

═══════════════════════════════════════════════════════════════════════════ */
