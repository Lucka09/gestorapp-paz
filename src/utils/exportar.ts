// xlsx se carga dinámicamente al exportar — no suma al bundle inicial
import type { Cliente, Tramite } from '@/types'
import { TIPO_TRAMITE_LABELS, ESTADO_TRAMITE_LABELS, ESTADO_TRAMITE_EMOJI } from '@/types'
import type { Seguimiento } from '@/lib/firestore/seguimientos'
import { TIPO_CONTACTO_LABELS } from '@/lib/firestore/seguimientos'
import { formatFecha } from '@/utils'
// ─── HELPERS ──────────────────────────────────────────────────────────────────

function descargar(XLSX: any, wb: any, nombre: string) {
  XLSX.writeFile(wb, `${nombre}_${new Date().toISOString().split('T')[0]}.xlsx`)
}

function ts(val: any): string {
  if (!val) return '—'
  try { return formatFecha(val) }
  catch { return '—' }
}

// ─── EXPORTAR CLIENTES ────────────────────────────────────────────────────────

export async function exportarClientes(clientes: Cliente[]) {
  const XLSX = await import('xlsx') as any
  const filas = clientes.map(c => ({
    'Apellido':       c.apellido,
    'Nombre':         c.nombre,
    'DNI':            c.dni,
    'CUIT':           c.cuit || '—',
    'Teléfono':       c.telefono,
    'Email':          c.email || '—',
    'Dirección':      c.direccion || '—',
    'Localidad':      c.localidad || '—',
    'Portal activo':  c.userId ? 'Sí' : 'No',
    'Vehículos':      c.vehiculosIds?.length ?? 0,
    'Observaciones':  c.observaciones || '—',
    'Alta':           ts(c.creadoEn),
  }))

  const ws = XLSX.utils.json_to_sheet(filas)

  // Ancho de columnas
  ws['!cols'] = [
    { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 16 },
    { wch: 16 }, { wch: 28 }, { wch: 24 }, { wch: 16 },
    { wch: 14 }, { wch: 10 }, { wch: 30 }, { wch: 14 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
  descargar(XLSX, wb, 'GestorApp_Clientes')
}

// ─── EXPORTAR SEGUIMIENTOS ────────────────────────────────────────────────────

export async function exportarSeguimientos(
  clientes: Cliente[],
  seguimientosMap: Record<string, Seguimiento[]>
) {
  const XLSX = await import('xlsx') as any
  const filas: Record<string, string>[] = []

  clientes.forEach(c => {
    const segs = seguimientosMap[c.id] ?? []
    if (segs.length === 0) {
      filas.push({
        'Apellido':        c.apellido,
        'Nombre':          c.nombre,
        'Teléfono':        c.telefono,
        'Email':           c.email || '—',
        'Fecha contacto':  '—',
        'Tipo':            '—',
        'Estado':          'Sin contactos',
        'Nota':            '—',
        'Resultado':       '—',
      })
    } else {
      segs.forEach(s => {
        filas.push({
          'Apellido':        c.apellido,
          'Nombre':          c.nombre,
          'Teléfono':        c.telefono,
          'Email':           c.email || '—',
          'Fecha contacto':  ts(s.fechaContacto),
          'Tipo':            TIPO_CONTACTO_LABELS[s.tipo],
          'Estado':          s.estado,
          'Nota':            s.nota || '—',
          'Resultado':       s.resultado || '—',
        })
      })
    }
  })

  const ws = XLSX.utils.json_to_sheet(filas)
  ws['!cols'] = [
    { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 26 },
    { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 36 }, { wch: 36 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Seguimientos')
  descargar(XLSX, wb, 'GestorApp_Seguimientos')
}

// ─── EXPORTAR TRÁMITES ────────────────────────────────────────────────────────

export async function exportarTramites(tramites: Tramite[], clientes: Cliente[]) {
  const XLSX = await import('xlsx') as any
  const clienteMap = Object.fromEntries(clientes.map(c => [c.id, c]))

  const filas = tramites.map(t => {
    const c = clienteMap[t.clienteId]
    return {
      'Número':          t.numero,
      'Tipo':            TIPO_TRAMITE_LABELS[t.tipo],
      'Estado':          `${ESTADO_TRAMITE_EMOJI[t.estado]} ${ESTADO_TRAMITE_LABELS[t.estado]}`,
      'Patente':         t.patente,
      'Cliente':         c ? `${c.apellido}, ${c.nombre}` : '—',
      'DNI':             c?.dni || '—',
      'Teléfono':        c?.telefono || '—',
      'Honorarios':      t.honorarios > 0 ? `$${t.honorarios.toLocaleString('es-AR')}` : '—',
      'Pagado':          t.pagado ? 'Sí' : 'No',
      'Fecha pago':      t.pagado ? ts(t.fechaPago) : '—',
      'Descripción':     t.descripcion || '—',
      'Creado':          ts(t.creadoEn),
      'Actualizado':     ts(t.actualizadoEn),
    }
  })

  const ws = XLSX.utils.json_to_sheet(filas)
  ws['!cols'] = [
    { wch: 16 }, { wch: 22 }, { wch: 20 }, { wch: 12 },
    { wch: 24 }, { wch: 12 }, { wch: 16 }, { wch: 14 },
    { wch: 8 },  { wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 14 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Trámites')
  descargar(XLSX, wb, 'GestorApp_Tramites')
}

// ─── REPORTE COMPLETO (múltiples hojas) ───────────────────────────────────────

export async function exportarReporteCompleto(
  clientes:        Cliente[],
  tramites:        Tramite[],
  seguimientosMap: Record<string, Seguimiento[]>
) {
  const XLSX = await import('xlsx') as any
  const wb = XLSX.utils.book_new()
  const clienteMap = Object.fromEntries(clientes.map(c => [c.id, c]))
  const hoy = new Date().toLocaleDateString('es-AR')

  // Hoja 1 — Resumen
  const resumen = [
    { 'Reporte GestorApp': `Generado el ${hoy}` },
    { 'Reporte GestorApp': '' },
    { 'Reporte GestorApp': `Total clientes: ${clientes.length}` },
    { 'Reporte GestorApp': `Total trámites: ${tramites.length}` },
    { 'Reporte GestorApp': `Trámites activos: ${tramites.filter(t => !['entregado','cancelado'].includes(t.estado)).length}` },
    { 'Reporte GestorApp': `Trámites entregados: ${tramites.filter(t => t.estado === 'entregado').length}` },
    { 'Reporte GestorApp': `Sin cobrar: ${tramites.filter(t => !t.pagado && t.honorarios > 0 && t.estado !== 'cancelado').length}` },
    { 'Reporte GestorApp': `Ingresos cobrados: $${tramites.filter(t => t.pagado).reduce((a, t) => a + t.honorarios, 0).toLocaleString('es-AR')}` },
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen')

  // Hoja 2 — Clientes
  const filasClientes = clientes.map(c => ({
    'Apellido': c.apellido, 'Nombre': c.nombre,
    'DNI': c.dni, 'Teléfono': c.telefono, 'Email': c.email || '—',
    'Localidad': c.localidad || '—', 'Portal': c.userId ? 'Sí' : 'No',
    'Vehículos': c.vehiculosIds?.length ?? 0, 'Alta': ts(c.creadoEn),
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasClientes), 'Clientes')

  // Hoja 3 — Trámites
  const filasTramites = tramites.map(t => {
    const c = clienteMap[t.clienteId]
    return {
      'Número': t.numero, 'Tipo': TIPO_TRAMITE_LABELS[t.tipo],
      'Estado': `${ESTADO_TRAMITE_EMOJI[t.estado]} ${ESTADO_TRAMITE_LABELS[t.estado]}`,
      'Patente': t.patente,
      'Cliente': c ? `${c.apellido}, ${c.nombre}` : '—',
      'Honorarios': t.honorarios > 0 ? t.honorarios : 0,
      'Pagado': t.pagado ? 'Sí' : 'No',
      'Creado': ts(t.creadoEn),
    }
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasTramites), 'Trámites')

  // Hoja 4 — Seguimientos
  const filasSeg: Record<string, string>[] = []
  clientes.forEach(c => {
    const segs = seguimientosMap[c.id] ?? []
    segs.forEach(s => {
      filasSeg.push({
        'Cliente': `${c.apellido}, ${c.nombre}`,
        'Teléfono': c.telefono,
        'Fecha': ts(s.fechaContacto),
        'Tipo': TIPO_CONTACTO_LABELS[s.tipo],
        'Nota': s.nota || '—',
        'Resultado': s.resultado || '—',
      })
    })
  })
  if (filasSeg.length > 0)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasSeg), 'Seguimientos')

  descargar(XLSX, wb, 'GestorApp_Reporte_Completo')
}
