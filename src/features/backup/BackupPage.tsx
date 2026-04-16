import { useState } from 'react'
import {
  Download, Database, Shield, FileSpreadsheet,
  CheckCircle, Clock, Package, RefreshCw,
  Users, Car, FileText, CalendarDays,
  AlertCircle, Info,
} from 'lucide-react'
import {
  generarBackupCompleto, exportarModulo,
  type ResultadoBackup, type ProgresoBackup,
} from '@/lib/firestore/backup'
import { PageHeader, Button, Card } from '@/components/ui'
import toast from 'react-hot-toast'

// ─── BARRA DE PROGRESO ────────────────────────────────────────────────────────

function BarraProgreso({ pct, etapa }: { pct: number; etapa: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500 font-medium">{etapa}</span>
        <span className="font-bold" style={{ color: 'var(--gp-orange)' }}>{pct}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, background: 'var(--gp-orange)' }}
        />
      </div>
    </div>
  )
}

// ─── MÓDULO RÁPIDO ────────────────────────────────────────────────────────────

function ExportCard({
  icon: Icon, label, descripcion, modulo, color,
}: {
  icon:        React.ElementType
  label:       string
  descripcion: string
  modulo:      'clientes' | 'tramites' | 'vehiculos' | 'turnos'
  color:       string
}) {
  const [cargando, setCargando] = useState(false)

  const handleExportar = async () => {
    setCargando(true)
    try {
      await exportarModulo(modulo)
      toast.success(`${label} exportados`)
    } catch { toast.error('Error al exportar') }
    finally { setCargando(false) }
  }

  return (
    <button
      onClick={handleExportar}
      disabled={cargando}
      className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm
                 hover:shadow-md transition-all text-left w-full
                 disabled:opacity-60"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
             style={{ background: `${color}18` }}>
          {cargando
            ? <RefreshCw size={18} style={{ color }} className="animate-spin" />
            : <Icon size={18} style={{ color }} />
          }
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">{label}</p>
            <Download size={13} className="text-gray-300" />
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{descripcion}</p>
        </div>
      </div>
    </button>
  )
}

// ─── PÁGINA ───────────────────────────────────────────────────────────────────

export default function BackupPage() {
  const [generando,  setGenerando]  = useState(false)
  const [progreso,   setProgreso]   = useState<ProgresoBackup | null>(null)
  const [resultado,  setResultado]  = useState<ResultadoBackup | null>(null)
  const [ultimoBack, setUltimoBack] = useState<string | null>(() =>
    localStorage.getItem('ultimo-backup')
  )

  const handleBackupCompleto = async () => {
    setGenerando(true)
    setResultado(null)
    setProgreso({ etapa: 'Iniciando...', pct: 0 })
    try {
      const res = await generarBackupCompleto(p => setProgreso(p))
      setResultado(res)
      // Descargar automáticamente
      const url = URL.createObjectURL(res.blob)
      const a   = document.createElement('a')
      a.href = url; a.download = res.nombre
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      const ahora = new Date().toLocaleString('es-AR')
      setUltimoBack(ahora)
      localStorage.setItem('ultimo-backup', ahora)
      toast.success('Backup descargado correctamente ✅')
    } catch (err: any) {
      console.error(err)
      toast.error('Error al generar el backup')
    } finally {
      setGenerando(false)
    }
  }

  const handleDescargarDeNuevo = () => {
    if (!resultado) return
    const url = URL.createObjectURL(resultado.blob)
    const a   = document.createElement('a')
    a.href = url; a.download = resultado.nombre
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  return (
    <div className="space-y-6 animate-fadein max-w-3xl">

      <PageHeader
        title="Backup y exportación"
        subtitle="Descargá todos los datos de la gestoría en cualquier momento"
      />

      {/* Backup completo */}
      <Card className="p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
               style={{ background: '#1A1A1A' }}>
            <Database size={22} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-gray-900 mb-0.5">
              Backup completo de GestorApp
            </h2>
            <p className="text-sm text-gray-500">
              Exporta todos los módulos en un ZIP con Excel por módulo + un Excel maestro
              con todas las hojas. Incluye configuración en JSON.
            </p>
          </div>
        </div>

        {/* Qué incluye */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
          {[
            { icon: Users,       label: 'Clientes'    },
            { icon: Car,         label: 'Vehículos'   },
            { icon: FileText,    label: 'Trámites'    },
            { icon: CalendarDays,label: 'Turnos'      },
            { icon: CheckCircle, label: 'Tareas'      },
            { icon: Shield,      label: 'Vencimientos'},
            { icon: Clock,       label: 'Actividad'   },
            { icon: Package,     label: 'Config.'     },
          ].map(item => (
            <div key={item.label}
              className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
              <item.icon size={13} className="text-gray-400 shrink-0" />
              <span className="text-xs text-gray-600 font-medium">{item.label}</span>
            </div>
          ))}
        </div>

        {/* Estado previo */}
        {ultimoBack && !generando && !resultado && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100
                          rounded-xl px-4 py-2.5 mb-4">
            <CheckCircle size={14} className="text-emerald-600 shrink-0" />
            <p className="text-xs text-emerald-700">
              Último backup: <span className="font-semibold">{ultimoBack}</span>
            </p>
          </div>
        )}

        {/* Progreso */}
        {generando && progreso && (
          <div className="mb-5">
            <BarraProgreso pct={progreso.pct} etapa={progreso.etapa} />
          </div>
        )}

        {/* Resultado exitoso */}
        {resultado && !generando && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
                <CheckCircle size={18} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-800">Backup generado</p>
                <p className="text-xs text-emerald-600 font-mono">{resultado.nombre}</p>
              </div>
              <span className="ml-auto text-xs font-bold text-emerald-700 bg-emerald-100
                               px-2 py-1 rounded-lg">
                {resultado.tamanio}
              </span>
            </div>

            {/* Resumen de registros */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              {Object.entries(resultado.filas).map(([modulo, n]) => (
                <div key={modulo}
                  className="bg-white rounded-xl px-3 py-2 text-center border border-emerald-100">
                  <p className="text-lg font-bold text-gray-900"
                     style={{ fontFamily: 'var(--font-display)' }}>{n}</p>
                  <p className="text-xs text-gray-400">{modulo}</p>
                </div>
              ))}
            </div>

            <button
              onClick={handleDescargarDeNuevo}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold
                         text-emerald-700 hover:text-emerald-800 transition-colors py-1"
            >
              <Download size={14} /> Descargar de nuevo
            </button>
          </div>
        )}

        {/* Botón principal */}
        <Button
          onClick={handleBackupCompleto}
          loading={generando}
          size="lg"
          className="w-full"
        >
          <Database size={16} />
          {generando ? 'Generando backup...' : 'Generar backup completo (ZIP)'}
        </Button>
      </Card>

      {/* Exportaciones rápidas por módulo */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          Exportar módulo individual — Excel
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ExportCard
            icon={Users}
            label="Clientes"
            descripcion="Nombre, DNI, teléfono, email y localidad"
            modulo="clientes"
            color="#7C3AED"
          />
          <ExportCard
            icon={FileText}
            label="Trámites"
            descripcion="Tipo, estado, patente, honorarios y cliente"
            modulo="tramites"
            color="#D4621A"
          />
          <ExportCard
            icon={Car}
            label="Vehículos"
            descripcion="Patente, marca, modelo, año y titular"
            modulo="vehiculos"
            color="#3B82F6"
          />
          <ExportCard
            icon={CalendarDays}
            label="Turnos"
            descripcion="Fecha, hora, tipo de trámite y cliente"
            modulo="turnos"
            color="#10B981"
          />
        </div>
      </div>

      {/* Info de buenas prácticas */}
      <div className="bg-[var(--gp-orange-pale)] border border-orange-100 rounded-2xl p-5
                       space-y-3">
        <div className="flex items-start gap-3">
          <Info size={16} style={{ color: 'var(--gp-orange)', flexShrink: 0, marginTop: 2 }} />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-800">
              Buenas prácticas de backup
            </p>
            <ul className="space-y-1">
              {[
                'Hacé un backup completo al menos una vez por semana.',
                'Guardá el ZIP en Google Drive, Dropbox o un disco externo.',
                'Antes de cualquier importación masiva, generá un backup de seguridad.',
                'El archivo _COMPLETO_ tiene todas las hojas — es el que más importa conservar.',
              ].map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                  <span className="text-[var(--gp-orange)] shrink-0 mt-0.5">✓</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

    </div>
  )
}
