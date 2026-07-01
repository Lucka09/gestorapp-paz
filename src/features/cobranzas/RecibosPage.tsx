// src/features/cobranzas/ReciboPage.tsx — NUEVO ARCHIVO
//
// Ruta a agregar en router.tsx, dentro de children de /admin:
//   { path: 'recibos/:id', element: <L><ReciboPage /></L> },
//
// Se abre desde el link de la notificación. Regenera el PDF al vuelo con el
// branding actual de la gestoría (mismo generador que ya usa GestorMultaWorkflow)
// y permite descargarlo o volver a descargarlo cuantas veces haga falta.

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Download, ArrowLeft, CheckCircle2, FileWarning } from 'lucide-react'
import { getDoc } from 'firebase/firestore'
import { tramiteDoc, clienteDoc } from '@/lib/firestore/collections'
import { getRecibo, type Recibo } from '@/lib/firestore/recibos'
import { generarComprobantePago, descargarRecibo } from '@/utils/comprobantePago'
import { Button, Spinner } from '@/components/ui'
import { useConfiguracion } from '@/hooks/useConfiguracion'
import { formatPesos, formatFechaHora } from '@/utils'
import type { Tramite, Cliente } from '@/types'

export default function ReciboPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { config } = useConfiguracion()
  const [recibo,   setRecibo]   = useState<Recibo | null>(null)
  const [tramite,  setTramite]  = useState<Tramite | null>(null)
  const [cliente,  setCliente]  = useState<Cliente | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [generando, setGenerando] = useState(false)
  const [error,    setError]    = useState(false)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      try {
        const r = await getRecibo(id)
        if (!r) { setError(true); setLoading(false); return }
        setRecibo(r)
        const [tSnap, cSnap] = await Promise.all([
          getDoc(tramiteDoc(r.tramiteId)).catch(() => null),
          getDoc(clienteDoc(r.clienteId)).catch(() => null),
        ])
        setTramite(tSnap?.exists() ? ({ ...tSnap.data(), id: tSnap.id } as Tramite) : null)
        setCliente(cSnap?.exists() ? ({ ...cSnap.data(), id: cSnap.id } as Cliente) : null)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  const handleDescargar = async () => {
    if (!recibo || !tramite) return
    setGenerando(true)
    try {
      const saldoPendiente = Math.max(0, recibo.honorariosTotales - recibo.montoCobradoAcumulado)
      const blob = await generarComprobantePago({
        tramite,
        cliente,
        gestoriaNombre:       config.nombreComercial ?? 'Gestoría',
        gestoriaTelefono:     config.telefono1 ?? '',
        gestoriaWeb:          (config as any).sitioWeb ?? '',
        gestoriaEmail:        config.email,
        gestoriaDireccion:    config.direccion,
        gestoriaResponsable:  config.responsable,
        colorPrimario:        '#D4621A',
        logoUrl:              '/logo-gp.jpg',
        reciboNumero:         recibo.numeroRecibo,
        metodoPago:           recibo.formaPago,
        montoOverride:        recibo.monto,
        // Cuando es parcial, aprovechamos el campo "período" para dejar
        // constancia del saldo — sin tocar el generador de PDF existente.
        periodoServicio:      recibo.tipo === 'parcial'
          ? `Pago parcial — saldo pendiente ${formatPesos(saldoPendiente)}`
          : undefined,
      })
      descargarRecibo(blob, `${recibo.numeroRecibo}.pdf`)
    } catch (e) {
      console.error('[ReciboPage] Error al generar el PDF:', e)
    } finally {
      setGenerando(false)
    }
  }

  if (loading) return <Spinner label="Cargando recibo..." />

  if (error || !recibo) return (
    <div className="text-center py-16 text-gray-400">
      <FileWarning size={32} className="mx-auto mb-3 opacity-40" />
      <p>Recibo no encontrado.</p>
      <Button variant="secondary" size="sm" className="mt-4" onClick={() => navigate(-1)}>
        <ArrowLeft size={14} /> Volver
      </Button>
    </div>
  )

  const saldoPendiente = Math.max(0, recibo.honorariosTotales - recibo.montoCobradoAcumulado)

  return (
    <div className="max-w-md mx-auto space-y-4">
      <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
        <ArrowLeft size={14} /> Volver
      </Button>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm text-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={26} className="text-emerald-500" />
        </div>
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{recibo.numeroRecibo}</p>
        <p className="text-2xl font-bold text-gray-900 mb-1">{formatPesos(recibo.monto)}</p>
        <p className="text-sm text-gray-500 mb-4">
          {recibo.tipo === 'total' ? 'Pago total recibido' : 'Pago parcial recibido'} · {formatFechaHora(recibo.creadoEn)}
        </p>

        <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 space-y-1 mb-5 text-left">
          <div className="flex justify-between"><span>Forma de pago</span><span className="font-medium text-gray-700 capitalize">{recibo.formaPago}</span></div>
          <div className="flex justify-between"><span>Cobrado acumulado</span><span className="font-medium text-gray-700">{formatPesos(recibo.montoCobradoAcumulado)} / {formatPesos(recibo.honorariosTotales)}</span></div>
          {saldoPendiente > 0 && (
            <div className="flex justify-between text-amber-600 font-semibold"><span>Saldo pendiente</span><span>{formatPesos(saldoPendiente)}</span></div>
          )}
          <div className="flex justify-between"><span>Emitido por</span><span className="font-medium text-gray-700">{recibo.emitidoPorNombre}</span></div>
        </div>

        <Button onClick={handleDescargar} loading={generando} className="w-full">
          <Download size={15} /> Descargar comprobante (PDF)
        </Button>
        <p className="text-xs text-gray-300 mt-3">
          El PDF se genera al momento, con el formato oficial de {config.nombreComercial ?? 'tu gestoría'}.
        </p>
      </div>
    </div>
  )
}