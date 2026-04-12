import { useState, useCallback } from 'react'
import {
  Upload, Download, FileSpreadsheet, CheckCircle,
  AlertTriangle, XCircle, ArrowRight, RefreshCw,
  Users, Car, FileText, ChevronDown, ChevronUp,
} from 'lucide-react'
import { Button, Card, PageHeader } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { descargarPlantilla } from '@/utils/plantillaImportacion'
import {
  leerExcel, validarExcel, importarAFirestore,
  type ResultadoValidacion, type ResultadoImportacion,
  type ErrorImportacion,
} from '@/utils/importador'
import toast from 'react-hot-toast'

type Paso = 'inicio' | 'validando' | 'preview' | 'importando' | 'resultado'

function ErroresLista({ errores, titulo, tipo }: {
  errores: ErrorImportacion[]
  titulo:  string
  tipo:    'error' | 'warning'
}) {
  const [open, setOpen] = useState(false)
  if (!errores.length) return null

  const color = tipo === 'error'
    ? { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-700' }
    : { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-700' }

  const Icon = tipo === 'error' ? XCircle : AlertTriangle

  return (
    <div className={`${color.bg} border ${color.border} rounded-xl overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <Icon size={16} className={color.text} />
          <span className={`text-sm font-semibold ${color.text}`}>{titulo}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${color.badge}`}>
            {errores.length}
          </span>
        </div>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="border-t border-current/10 divide-y divide-current/10 max-h-60 overflow-y-auto">
          {errores.map((e, i) => (
            <div key={i} className="px-4 py-2.5 flex items-start gap-3">
              <span className={`text-xs font-mono ${color.badge} px-2 py-0.5 rounded shrink-0`}>
                {e.hoja} · F{e.fila}
              </span>
              <div>
                <span className={`text-xs font-semibold ${color.text}`}>{e.campo}: </span>
                <span className={`text-xs ${color.text} opacity-80`}>{e.mensaje}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ImportarPage() {
  const { user }   = useAuth()
  const [paso, setPaso] = useState<Paso>('inicio')
  const [archivo, setArchivo]     = useState<File | null>(null)
  const [dragging, setDragging]   = useState(false)
  const [validacion, setValidacion] = useState<ResultadoValidacion | null>(null)
  const [resultado, setResultado]   = useState<ResultadoImportacion | null>(null)
  const [progreso, setProgreso]     = useState('')

  // ── DRAG & DROP ────────────────────────────────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) procesarArchivo(file)
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) procesarArchivo(file)
  }

  // ── PROCESAR ARCHIVO ───────────────────────────────────────────────────────
  const procesarArchivo = async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error('Solo se aceptan archivos Excel (.xlsx)')
      return
    }
    setArchivo(file)
    setPaso('validando')

    try {
      const wb = await leerExcel(file)
      const resultado = validarExcel(wb)
      setValidacion(resultado)
      setPaso('preview')
    } catch (err: any) {
      toast.error(err.message ?? 'Error al leer el archivo')
      setPaso('inicio')
    }
  }

  // ── IMPORTAR ───────────────────────────────────────────────────────────────
  const handleImportar = async () => {
    if (!validacion || !user) return
    if (validacion.errores.length > 0) {
      toast.error('Corregí los errores antes de importar')
      return
    }

    setPaso('importando')

    try {
      setProgreso('Preparando importación...')
      await new Promise(r => setTimeout(r, 300))

      if (validacion.clientes.length > 0) {
        setProgreso(`Importando ${validacion.clientes.length} clientes...`)
        await new Promise(r => setTimeout(r, 200))
      }
      if (validacion.vehiculos.length > 0) {
        setProgreso(`Importando ${validacion.vehiculos.length} vehículos...`)
        await new Promise(r => setTimeout(r, 200))
      }
      if (validacion.tramites.length > 0) {
        setProgreso(`Importando ${validacion.tramites.length} trámites...`)
        await new Promise(r => setTimeout(r, 200))
      }

      const res = await importarAFirestore(validacion, user.uid)
      setResultado(res)
      setPaso('resultado')

      if (res.errores.length === 0) {
        toast.success('Importación completada con éxito')
      } else {
        toast('Importación completada con algunos errores', { icon: '⚠️' })
      }
    } catch (err: any) {
      toast.error('Error durante la importación: ' + (err.message ?? ''))
      setPaso('preview')
    }
  }

  const resetear = () => {
    setPaso('inicio')
    setArchivo(null)
    setValidacion(null)
    setResultado(null)
    setProgreso('')
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Importar cartera"
        subtitle="Cargá los datos existentes de Gestoría Paz desde Excel"
      />

      {/* ── PASO: INICIO ── */}
      {paso === 'inicio' && (
        <div className="space-y-5">
          {/* Info */}
          <Card className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-[#D4621A]/10 rounded-xl flex items-center
                              justify-center shrink-0">
                <FileSpreadsheet size={20} className="text-[#D4621A]" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 mb-1">¿Cómo funciona?</h2>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Descargá la plantilla Excel, completala con los datos de tus clientes,
                  vehículos y trámites, y subila acá. El sistema valida todo antes de
                  importar — sin riesgo de datos duplicados ni inconsistencias.
                </p>
              </div>
            </div>
          </Card>

          {/* Paso 1: Descargar plantilla */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#D4621A] text-white flex items-center
                                justify-center font-bold text-sm shrink-0">1</div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Descargá la plantilla</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Excel con 3 hojas: Clientes, Vehículos y Trámites + instrucciones
                  </p>
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={descargarPlantilla}>
                <Download size={15} /> Plantilla
              </Button>
            </div>
          </Card>

          {/* Paso 2: Completar */}
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 flex items-center
                              justify-center font-bold text-sm shrink-0">2</div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Completá con tus datos</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Podés pegar desde tu Excel/WhatsApp actual. Los campos con * son obligatorios.
                  Podés importar solo clientes, o todo junto.
                </p>
              </div>
            </div>
          </Card>

          {/* Paso 3: Subir */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all
                        cursor-pointer
                        ${dragging
                          ? 'border-[#D4621A] bg-[#D4621A]/5'
                          : 'border-gray-200 hover:border-[#D4621A]/50 hover:bg-gray-50'
                        }`}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileInput}
            />
            <div className="w-14 h-14 bg-[#D4621A]/10 rounded-2xl flex items-center
                            justify-center mx-auto mb-4">
              <Upload size={26} className="text-[#D4621A]" />
            </div>
            <p className="font-bold text-gray-900 mb-1">
              {dragging ? 'Soltá el archivo acá' : 'Subí tu Excel completado'}
            </p>
            <p className="text-sm text-gray-400">
              Arrastrá y soltá o hacé click para seleccionar
            </p>
            <p className="text-xs text-gray-300 mt-2">.xlsx · .xls</p>
          </div>
        </div>
      )}

      {/* ── PASO: VALIDANDO ── */}
      {paso === 'validando' && (
        <Card className="p-12 text-center">
          <RefreshCw size={36} className="text-[#D4621A] animate-spin mx-auto mb-4" />
          <p className="font-bold text-gray-900">Analizando el archivo...</p>
          <p className="text-sm text-gray-400 mt-1">{archivo?.name}</p>
        </Card>
      )}

      {/* ── PASO: PREVIEW ── */}
      {paso === 'preview' && validacion && (
        <div className="space-y-5">
          {/* Resumen */}
          <Card className="p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Resumen del archivo
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <Users size={20} className="text-[#D4621A] mx-auto mb-1" />
                <p className="text-2xl font-bold text-gray-900">{validacion.clientes.length}</p>
                <p className="text-xs text-gray-400">Clientes</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <Car size={20} className="text-[#D4621A] mx-auto mb-1" />
                <p className="text-2xl font-bold text-gray-900">{validacion.vehiculos.length}</p>
                <p className="text-xs text-gray-400">Vehículos</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <FileText size={20} className="text-[#D4621A] mx-auto mb-1" />
                <p className="text-2xl font-bold text-gray-900">{validacion.tramites.length}</p>
                <p className="text-xs text-gray-400">Trámites</p>
              </div>
            </div>
          </Card>

          {/* Errores críticos */}
          {validacion.errores.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <XCircle size={18} className="text-red-600 shrink-0" />
                <p className="font-bold text-red-700">
                  Hay {validacion.errores.length} error{validacion.errores.length !== 1 ? 'es' : ''} que impiden importar
                </p>
              </div>
              <p className="text-sm text-red-600 mb-3">
                Corregí estos errores en el Excel y volvé a subirlo.
              </p>
              <ErroresLista
                errores={validacion.errores}
                titulo="Ver errores en detalle"
                tipo="error"
              />
            </div>
          )}

          {/* Warnings */}
          {validacion.warnings.length > 0 && (
            <ErroresLista
              errores={validacion.warnings}
              titulo={`${validacion.warnings.length} advertencia${validacion.warnings.length !== 1 ? 's' : ''} (no bloquean la importación)`}
              tipo="warning"
            />
          )}

          {/* Todo OK */}
          {validacion.errores.length === 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4
                            flex items-center gap-3">
              <CheckCircle size={20} className="text-emerald-600 shrink-0" />
              <div>
                <p className="font-semibold text-emerald-700">Archivo válido — listo para importar</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  Los registros duplicados (mismo DNI o patente) serán ignorados automáticamente.
                </p>
              </div>
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-3">
            {validacion.errores.length === 0 ? (
              <Button onClick={handleImportar} className="flex-1">
                <ArrowRight size={16} /> Importar {validacion.clientes.length + validacion.vehiculos.length + validacion.tramites.length} registros
              </Button>
            ) : (
              <Button onClick={resetear} variant="secondary" className="flex-1">
                Corregir y volver a subir
              </Button>
            )}
            <Button variant="secondary" onClick={resetear}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* ── PASO: IMPORTANDO ── */}
      {paso === 'importando' && (
        <Card className="p-12 text-center">
          <div className="w-16 h-16 bg-[#D4621A]/10 rounded-2xl flex items-center
                          justify-center mx-auto mb-5">
            <RefreshCw size={30} className="text-[#D4621A] animate-spin" />
          </div>
          <p className="font-bold text-gray-900 mb-2">Importando datos...</p>
          <p className="text-sm text-gray-500">{progreso}</p>
          <p className="text-xs text-gray-400 mt-3">
            No cierres esta ventana
          </p>
        </Card>
      )}

      {/* ── PASO: RESULTADO ── */}
      {paso === 'resultado' && resultado && (
        <div className="space-y-5">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center
                              justify-center shrink-0">
                <CheckCircle size={24} className="text-emerald-600" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900">¡Importación completada!</h2>
                <p className="text-sm text-gray-500">
                  Los datos ya están disponibles en GestorApp.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-emerald-700">{resultado.clientesCreados}</p>
                <p className="text-xs text-emerald-600 font-medium mt-1">Clientes creados</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-emerald-700">{resultado.vehiculosCreados}</p>
                <p className="text-xs text-emerald-600 font-medium mt-1">Vehículos creados</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-emerald-700">{resultado.tramitesCreados}</p>
                <p className="text-xs text-emerald-600 font-medium mt-1">Trámites creados</p>
              </div>
            </div>

            {resultado.errores.length > 0 && (
              <ErroresLista
                errores={resultado.errores}
                titulo={`${resultado.errores.length} registros no pudieron importarse`}
                tipo="warning"
              />
            )}
          </Card>

          <div className="flex gap-3">
            <Button
              onClick={() => window.location.href = '/admin/clientes'}
              className="flex-1"
            >
              <Users size={15} /> Ver clientes importados
            </Button>
            <Button variant="secondary" onClick={resetear}>
              Importar otro archivo
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
