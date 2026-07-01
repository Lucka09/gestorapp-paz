// src/features/premios/PremiosPage.tsx
import { Trophy, Users, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getDocs, query, where, collection } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useQuery } from '@tanstack/react-query'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useAuth } from '@/hooks/useAuth'
import { Spinner } from '@/components/ui'
import { useGestoria } from '@/context/GestoriaContext'
import { useCierreMensual } from '@/hooks/useCierreMensual'
import { useState } from 'react'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const formatPesos = (n: number) => new Intl.NumberFormat('es-AR', { 
  style: 'currency', 
  currency: 'ARS', 
  maximumFractionDigits: 0 
}).format(n)

// ─── SUPERVISIÓN DE PREMIOS DEL EQUIPO ─────────────────────────────────────

function SupervisionPremiosView() {
  const navigate = useNavigate()
  const { mesActual } = useCierreMensual()
  const { gestoriaId } = useGestoria()
  const [expandidoAsesores, setExpandidoAsesores] = useState(true)

  const { data: asesores, isLoading: cargandoAsesores } = useQuery({
    queryKey: ['asesores-supervisar', gestoriaId],
    enabled: !!gestoriaId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      if (!gestoriaId) return []
      const snap = await getDocs(query(
        collection(db, 'users'),
        where('gestoriaId', '==', gestoriaId),
        where('rol', '==', 'asesor_comercial'),
        where('activo', '==', true)
      ))
      const asesoresConPremios = await Promise.all(
        snap.docs.map(async (docUser) => {
          const userData = docUser.data()
          const uid = docUser.id
          const tramitesSnap = await getDocs(query(
            collection(db, 'tramites'),
            where('gestoriaId', '==', gestoriaId),
            where('creadoPor', '==', uid),
            where('pagado', '==', true)
          ))
          const tramitesPagados = tramitesSnap.docs.length
          const totalCobrado = tramitesSnap.docs.reduce(
            (sum, doc) => sum + ((doc.data() as any).totalCobradoCliente ?? 0), 0
          )
          const premiosGanados = Math.floor(tramitesPagados / 5) * 5000
          const tramitesEnCiclo = tramitesPagados % 5
          return {
            uid,
            nombre: userData.nombre || '',
            apellido: userData.apellido || '',
            email: userData.email || '',
            tramitesPagados,
            totalCobrado,
            premiosGanados,
            tramitesEnCiclo,
            progreso: (tramitesEnCiclo / 5) * 100
          }
        })
      )
      return asesoresConPremios.sort((a, b) => b.premiosGanados - a.premiosGanados)
    }
  })

  if (cargandoAsesores) return <Spinner label="Cargando supervisión..." />

  const listaAsesores = asesores || []
  const totalAPagar = listaAsesores.reduce((sum, a) => sum + a.premiosGanados, 0)
  const periodoLabel = `${MESES[mesActual.mes]} ${mesActual.anio}`

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-xl px-4 py-2.5">
        <Trophy size={14} className="text-[#D4621A] shrink-0" />
        <p className="text-xs font-bold text-[#D4621A]">Período: {periodoLabel}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <p className="text-xs font-bold text-gray-400 mb-1">Total a pagar</p>
          <p className="text-2xl font-extrabold" style={{ color: '#D4621A' }}>
            {formatPesos(totalAPagar)}
          </p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <p className="text-xs font-bold text-gray-400 mb-1">Asesores</p>
          <p className="text-2xl font-extrabold">{listaAsesores.length}</p>
        </div>
      </div>

      <div className="space-y-3">
        {listaAsesores.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-300">
            <Users size={36} className="mb-3 opacity-40" />
            <p className="text-base font-semibold text-gray-400">Sin asesores comerciales</p>
          </div>
        ) : (
          listaAsesores.map((a) => (
            <div key={a.uid} className="p-4 bg-white rounded-xl border border-gray-200">
              <div className="flex justify-between mb-2">
                <div>
                  <p className="font-semibold text-gray-900">{a.nombre} {a.apellido}</p>
                  <p className="text-xs text-gray-500">{a.email}</p>
                </div>
                <p className="text-lg font-bold" style={{ color: '#D4621A' }}>
                  {formatPesos(a.premiosGanados)}
                </p>
              </div>
              <div className="h-2 bg-gray-200 rounded w-full">
                <div 
                  className="h-full bg-orange-400 rounded transition-all" 
                  style={{ width: `${Math.min(100, a.progreso)}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-gray-600">
                {a.tramitesPagados} pagos · {Math.round(a.progreso)}% progreso
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ──────────────────────────────────────────────────────

export default function PremiosPage() {
  usePageTitle('Premios')
  const { user } = useAuth()

  const ROLES_SUPERVISORES = ['propietario', 'admin_gral']
  if (ROLES_SUPERVISORES.includes(user?.rol ?? '')) {
    return <SupervisionPremiosView />
  }

  // Vista personal (en desarrollo)
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5">
        <AlertCircle size={16} className="text-blue-400" />
        <p className="text-xs text-blue-800">
          <strong>Vista personal</strong> - En desarrollo
        </p>
      </div>
    </div>
  )
}