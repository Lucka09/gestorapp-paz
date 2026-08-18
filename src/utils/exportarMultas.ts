// src/utils/exportarMultas.ts
// ─── EXPORT DE MULTAS A EXCEL (autocontenido) ────────────────────────────────
// Genera un .xlsx de las multas con columnas de trazabilidad por paso (P1→P7),
// pensado para el conteo/auditoría de fin de mes (p. ej. qué hizo el Asistente
// de Multas): filtrando/pivoteando por operador en Excel se ve todo.
//
// No depende de utils/exportar.ts: trae su propio helper de descarga y de fechas,
// y carga xlsx dinámicamente (no suma al bundle inicial).

import { estadoMultaEfectivo, ESTADO_MULTA_OP_LABELS, type MultaWorkflow } from '@/types/multa_types'
import type { Tramite } from '@/types'

function fmtTs(v: any): string {
  const d = v?.toDate?.() ?? (v instanceof Date ? v : null)
  return d ? d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'
}

export async function exportarMultas(multas: MultaWorkflow[], tramites: Tramite[]) {
  const XLSX = await import('xlsx') as any

  const tramiteMap = Object.fromEntries(
    tramites.filter(t => t.tipo === 'descargo_multa').map(t => [t.id, t]),
  )

  const filas = multas.map(w => {
    const t  = tramiteMap[w.id]
    // Acceso defensivo a campos que pueden no existir en toda versión del tipo.
    const wa = w as any
    const p1 = w.paso1 as any
    return {
      'Número':          t?.numero ?? w.id.slice(-6).toUpperCase(),
      'Cliente':         p1?.nombreCompleto || '—',
      'DNI':             p1?.dni || '—',
      'Patente':         (p1?.patente || '—').toUpperCase(),
      'Estado':          ESTADO_MULTA_OP_LABELS[estadoMultaEfectivo(w)] ?? '—',
      'Fecha entrega':   wa.fechaTramiteActual ?? p1?.fechaTramite ?? '—',
      'Requiere SUATS':  p1?.requiereSUATS ? 'Sí' : 'No',
      'Honorarios':      (t?.honorarios ?? (w.paso2 as any)?.montoTotal ?? 0) || 0,
      'Pagado':          t?.pagado ? 'Sí' : 'No',
      'Iniciado por':    wa.iniciadoPorNombre || '—',
      'Admin asignado':  wa.asignadoAdminNombre || '—',
      // ─── Trazabilidad: quién completó cada paso ───────────────────────────
      'P1 Recepción · por':    (wa.paso1)?.completadoPorNombre || '—',
      'P2 Doc+Pago · por':     (wa.paso2)?.completadoPorNombre || '—',
      'P3 Pre-revisión · por': (wa.paso3)?.completadoPorNombre || '—',
      'P4 Revisión · por':     (wa.paso4)?.completadoPorNombre || '—',
      'P5 Descargo · por':     (wa.paso5)?.completadoPorNombre || '—',
      'P6 SUATS · por':        (wa.paso6)?.completadoPorNombre || '—',
      'P7 Cierre · por':       (wa.paso7)?.completadoPorNombre || '—',
      'Fecha de cierre':       fmtTs((wa.paso7)?.completadoEn),
      'Creado':                fmtTs(t?.creadoEn ?? (w as any).creadoEn),
    }
  })

  const ws = XLSX.utils.json_to_sheet(filas)
  ws['!cols'] = [
    { wch: 14 }, { wch: 24 }, { wch: 12 }, { wch: 10 }, { wch: 20 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 20 }, { wch: 20 },
    { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
    { wch: 16 }, { wch: 14 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Multas')
  XLSX.writeFile(wb, `GestorApp_Multas_${new Date().toISOString().split('T')[0]}.xlsx`)
}