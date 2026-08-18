// src/components/cupones/PanelDescargaCupones.tsx
import { useDescargaCupones } from '@/hooks/useDescargaCupones'
import {
  pausarDescargaCuponesEnExtension,
  reanudarDescargaCuponesEnExtension,
  cancelarDescargaCuponesEnExtension,
} from '@/lib/puenteExtension'
import { Download, Pause, Play, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

interface Props {
  tramiteId: string
  nroCausas: { nroCausa: string; nroActa?: string }[]
}

export function PanelDescargaCupones({ tramiteId, nroCausas }: Props) {
  const { job, loading } = useDescargaCupones(tramiteId)

  if (loading) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  if (!job) return null

  const porcentaje = job.totalItems > 0 ? ((job.completadosOk + job.conError) / job.totalItems) * 100 : 0
  const enProgreso = job.estadoGeneral === 'en_progreso' || job.estadoGeneral === 'pendiente'
  const pausado = job.estadoGeneral === 'pausado'
  const completado =
    job.estadoGeneral === 'completado' || job.estadoGeneral === 'parcial' || job.estadoGeneral === 'cancelado'

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
        <Download className="h-5 w-5 text-[#D4621A]" />
        Descarga de cupones
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs text-gray-600">
          <span>Progreso</span>
          <span>
            {job.completadosOk + job.conError} / {job.totalItems}
          </span>
        </div>
        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#D4621A] transition-all"
            style={{ width: `${porcentaje}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold text-green-600">{job.completadosOk}</div>
          <div className="text-xs text-gray-500">OK</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-red-600">{job.conError}</div>
          <div className="text-xs text-gray-500">Errores</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-600">{job.omitidos}</div>
          <div className="text-xs text-gray-500">Omitidos</div>
        </div>
      </div>

      {enProgreso && (
        <div className="flex gap-2">
          <button
            onClick={() => pausarDescargaCuponesEnExtension()}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-1"
          >
            <Pause className="h-4 w-4" />
            Pausar
          </button>
          <button
            onClick={() => cancelarDescargaCuponesEnExtension()}
            className="flex-1 px-3 py-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 flex items-center justify-center gap-1"
          >
            <X className="h-4 w-4" />
            Cancelar
          </button>
        </div>
      )}

      {pausado && (
        <div className="flex gap-2">
          <button
            onClick={() => reanudarDescargaCuponesEnExtension(tramiteId, nroCausas)}
            className="flex-1 px-3 py-2 text-sm bg-[#D4621A] text-white rounded-lg hover:bg-[#b85416] flex items-center justify-center gap-1"
          >
            <Play className="h-4 w-4" />
            Reanudar
          </button>
          <button
            onClick={() => cancelarDescargaCuponesEnExtension()}
            className="flex-1 px-3 py-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 flex items-center justify-center gap-1"
          >
            <X className="h-4 w-4" />
            Cancelar
          </button>
        </div>
      )}

      {completado && (
        <div className="flex items-center gap-2 text-sm">
          {job.estadoGeneral === 'completado' ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="text-gray-700">Todos los cupones procesados</span>
            </>
          ) : job.estadoGeneral === 'parcial' ? (
            <>
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <span className="text-gray-700">Procesamiento parcial (algunos errores)</span>
            </>
          ) : (
            <>
              <X className="h-5 w-5 text-red-600" />
              <span className="text-gray-700">Descarga cancelada</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}