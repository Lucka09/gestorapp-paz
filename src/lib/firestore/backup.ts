// Motor de backup completo de GestorApp
// Genera un ZIP con todos los datos de Firestore en formato Excel + JSON

import { getDocs, getDoc } from 'firebase/firestore'
import {
  clientesCol, vehiculosCol, tramitesCol,
  turnosCol, usersCol, configuracionDoc,
} from './collections'
import { tareasCol }       from './tareas'
import { vencimientosCol } from './vencimientos'
import { auditCol }        from './audit'
import type { Cliente, Vehiculo, Tramite, Turno } from '@/types'
import { TIPO_TRAMITE_LABELS, ESTADO_TRAMITE_LABELS, VENCIMIENTO_LABELS } from '@/types'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface ProgresoBackup {
  etapa:    string
  pct:      number     // 0–100
}

export interface ResultadoBackup {
  nombre:     string
  blob:       Blob
  filas:      Record<string, number>
  timestamp:  string
  tamanio:    string
}

// ─── HELPER: TIMESTAMP A STRING ───────────────────────────────────────────────

function ts(val: any): string {
  if (!val) return ''
  try {
    const d = val.toDate?.() ?? new Date(val)
    return d.toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return '' }
}

function pesos(n: number | undefined): string {
  if (!n && n !== 0) return ''
  return `$${n.toLocaleString('es-AR')}`
}

// ─── GENERADOR PRINCIPAL ──────────────────────────────────────────────────────

export async function generarBackupCompleto(
  onProgreso?: (p: ProgresoBackup) => void
): Promise<ResultadoBackup> {

  const prog = (etapa: string, pct: number) => onProgreso?.({ etapa, pct })

  // ── Cargar todos los datos ─────────────────────────────────────────────────
  prog('Leyendo clientes...', 5)
  const [
    snapClientes, snapVehiculos, snapTramites,
    snapTurnos,   snapUsuarios,  snapTareas,
    snapVencim,   snapAudit,     snapConfig,
  ] = await Promise.all([
    getDocs(clientesCol),
    getDocs(vehiculosCol),
    getDocs(tramitesCol),
    getDocs(turnosCol),
    getDocs(usersCol),
    getDocs(tareasCol),
    getDocs(vencimientosCol),
    getDocs(auditCol),
    getDoc(configuracionDoc),
  ])

  prog('Procesando datos...', 30)

  const clientes  = snapClientes.docs.map(d  => ({ ...d.data(), id: d.id }) as Cliente)
  const vehiculos = snapVehiculos.docs.map(d => ({ ...d.data(), id: d.id }) as Vehiculo)
  const tramites  = snapTramites.docs.map(d  => ({ ...d.data(), id: d.id }) as Tramite)
  const turnos    = snapTurnos.docs.map(d    => ({ ...d.data(), id: d.id }) as Turno)

  // Maps para referencias cruzadas
  const clienteMap = Object.fromEntries(clientes.map(c => [c.id, c]))
  const vehiculoMap = Object.fromEntries(vehiculos.map(v => [v.id, v]))

  // ── Preparar hojas Excel ───────────────────────────────────────────────────
  prog('Generando Excel — Clientes...', 40)

  // CLIENTES
  const filasClientes = clientes.map(c => ({
    'ID':          c.id,
    'Apellido':    c.apellido,
    'Nombre':      c.nombre,
    'DNI':         c.dni,
    'Teléfono':    c.telefono,
    'Email':       c.email ?? '',
    'Dirección':   c.direccion ?? '',
    'Localidad':   c.localidad ?? '',
    'CUIT/CUIL':   c.cuit ?? '',
    'Activo':      (c as any).activo !== false ? 'Sí' : 'No',
    'Registrado':  ts(c.creadoEn),
  }))

  // VEHÍCULOS
  prog('Generando Excel — Vehículos...', 48)
  const filasVehiculos = vehiculos.map(v => {
    const c = clienteMap[v.clienteId]
    return {
      'ID':          v.id,
      'Patente':     v.patente,
      'Tipo':        v.tipo,
      'Marca':       v.marca,
      'Modelo':      v.modelo,
      'Año':         v.anio,
      'Color':       v.color,
      'Nro Motor':   v.nroMotor,
      'Nro Chasis':  v.nroChasis,
      'Titular':     c ? `${c.apellido}, ${c.nombre}` : '',
      'DNI Titular': c?.dni ?? '',
      'Registrado':  ts((v as any).creadoEn),
    }
  })

  // TRÁMITES
  prog('Generando Excel — Trámites...', 56)
  const filasTramites = tramites.map(t => {
    const c = clienteMap[t.clienteId]
    const v = vehiculoMap[t.vehiculoId]
    return {
      'Número':          t.numero,
      'Tipo':            TIPO_TRAMITE_LABELS[t.tipo] ?? t.tipo,
      'Estado':          ESTADO_TRAMITE_LABELS[t.estado] ?? t.estado,
      'Patente':         t.patente,
      'Cliente':         c ? `${c.apellido}, ${c.nombre}` : '',
      'DNI Cliente':     c?.dni ?? '',
      'Vehículo':        v ? `${v.marca} ${v.modelo} ${v.anio}` : '',
      'Honorarios':      pesos(t.honorarios),
      'Pagado':          t.pagado ? 'Sí' : 'No',
      'Forma de pago':   t.formaPago ?? '',
      'Fecha de pago':   ts(t.fechaPago),
      'Descripción':     t.descripcion,
      'Observaciones':   t.observacionesInternas,
      'Creado':          ts(t.creadoEn),
      'Actualizado':     ts(t.actualizadoEn),
    }
  })

  // TURNOS
  prog('Generando Excel — Turnos...', 63)
  const filasTurnos = turnos.map(t => {
    const c = clienteMap[t.clienteId]
    return {
      'ID':          t.id,
      'Fecha':       ts(t.fecha),
      'Hora inicio': t.horaInicio,
      'Hora fin':    t.horaFin,
      'Tipo trámite':TIPO_TRAMITE_LABELS[t.tipoTramite] ?? t.tipoTramite,
      'Estado':      t.estado,
      'Cliente':     c ? `${c.apellido}, ${c.nombre}` : '',
      'Teléfono':    c?.telefono ?? '',
      'Notas':       (t as any).notas ?? '',
      'Creado':      ts((t as any).creadoEn),
    }
  })

  // USUARIOS / EQUIPO
  prog('Generando Excel — Equipo...', 68)
  const filasUsuarios = snapUsuarios.docs
    .filter(d => d.data().rol !== 'cliente')
    .map(d => {
      const u = d.data()
      return {
        'UID':          d.id,
        'Apellido':     u.apellido,
        'Nombre':       u.nombre,
        'Email':        u.email,
        'Teléfono':     u.telefono,
        'Rol':          u.rol,
        'Activo':       u.activo ? 'Sí' : 'No',
        'Último acceso':ts(u.ultimoAcceso),
        'Creado':       ts(u.creadoEn),
      }
    })

  // TAREAS
  prog('Generando Excel — Tareas...', 73)
  const filasTareas = snapTareas.docs.map(d => {
    const t = d.data()
    return {
      'ID':           d.id,
      'Título':       t.titulo,
      'Descripción':  t.descripcion ?? '',
      'Prioridad':    t.prioridad,
      'Estado':       t.estado,
      'Asignado a':   t.asignadoNombre,
      'Cliente':      t.clienteNombre ?? '',
      'Vencimiento':  ts(t.vencimiento),
      'Completada':   ts(t.completadaEn),
      'Creado':       ts(t.creadoEn),
    }
  })

  // VENCIMIENTOS
  prog('Generando Excel — Vencimientos...', 78)
  const filasVencimientos = snapVencim.docs.map(d => {
    const v = d.data()
    const c = clienteMap[v.clienteId]
    return {
      'Patente':     v.patente,
      'Tipo':        VENCIMIENTO_LABELS[v.tipo as keyof typeof VENCIMIENTO_LABELS] ?? v.tipo,
      'Vencimiento': ts(v.fechaVencimiento),
      'Compañía':    v.compania ?? '',
      'Nro Póliza':  v.nroPóliza ?? '',
      'Cliente':     c ? `${c.apellido}, ${c.nombre}` : '',
      'Notas':       v.notas ?? '',
    }
  })

  // HISTORIAL DE ACTIVIDAD (últimas 500 entradas)
  prog('Generando Excel — Actividad...', 83)
  const filasAudit = snapAudit.docs.slice(0, 500).map(d => {
    const e = d.data()
    return {
      'Fecha':     ts(e.timestamp),
      'Usuario':   e.usuarioNombre,
      'Rol':       e.usuarioRol,
      'Acción':    e.accion,
      'Módulo':    e.entidad,
      'Registro':  e.entidadLabel,
      'Nota':      e.nota ?? '',
    }
  })

  // ── Generar ZIP ────────────────────────────────────────────────────────────
  prog('Empaquetando ZIP...', 88)

  const XLSX   = await import('xlsx') as any
  const JSZip  = (await import('jszip')).default

  const zip    = new JSZip()
  const fecha  = new Date()
  const sufijo = fecha.toISOString().slice(0,10)
  const carpeta = zip.folder(`GestoriaPaz_Backup_${sufijo}`)!

  // Función para crear Excel y agregar al ZIP
  const agregarExcel = (nombre: string, filas: Record<string, any>[]) => {
    if (filas.length === 0) {
      carpeta.file(`${nombre}.txt`, 'Sin datos')
      return 0
    }
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(filas)

    // Ancho automático de columnas
    const cols = Object.keys(filas[0]).map(k => ({
      wch: Math.max(k.length, ...filas.map(r => String(r[k] ?? '').length).slice(0,100))
    }))
    ws['!cols'] = cols

    XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 31))
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    carpeta.file(`${nombre}.xlsx`, buf)
    return filas.length
  }

  // Un Excel con todas las hojas
  prog('Generando Excel maestro...', 91)
  const wbMaestro = XLSX.utils.book_new()

  const hojas: [string, Record<string,any>[]][] = [
    ['Clientes',     filasClientes],
    ['Vehículos',    filasVehiculos],
    ['Trámites',     filasTramites],
    ['Turnos',       filasTurnos],
    ['Equipo',       filasUsuarios],
    ['Tareas',       filasTareas],
    ['Vencimientos', filasVencimientos],
    ['Actividad',    filasAudit],
  ]

  const conteo: Record<string, number> = {}

  hojas.forEach(([nombre, filas]) => {
    if (filas.length === 0) return
    const ws = XLSX.utils.json_to_sheet(filas)
    const cols = Object.keys(filas[0]).map(k => ({
      wch: Math.max(k.length + 2, ...filas.slice(0,50).map(r => String(r[k] ?? '').length + 1))
    }))
    ws['!cols'] = cols
    XLSX.utils.book_append_sheet(wbMaestro, ws, nombre)
    conteo[nombre] = filas.length

    // También guardar individual
    agregarExcel(nombre, filas)
  })

  const bufMaestro = XLSX.write(wbMaestro, { type: 'array', bookType: 'xlsx' })
  carpeta.file(`_COMPLETO_GestoriaPaz_${sufijo}.xlsx`, bufMaestro)

  // JSON de configuración
  if (snapConfig.exists()) {
    carpeta.file('configuracion.json', JSON.stringify(snapConfig.data(), null, 2))
  }

  // README
  carpeta.file('LEEME.txt',
    `BACKUP — Gestoría Paz\n` +
    `Generado: ${fecha.toLocaleDateString('es-AR', { dateStyle: 'full', timeStyle: 'short' })}\n\n` +
    `Contenido:\n` +
    Object.entries(conteo).map(([k,v]) => `  - ${k}: ${v} registros`).join('\n') + '\n\n' +
    `El archivo _COMPLETO_ contiene todas las hojas en un solo Excel.\n` +
    `Los archivos individuales separan cada módulo.\n\n` +
    `Desarrollado por JAH-NISSI Digital Studio\n`
  )

  prog('Comprimiendo...', 96)
  const blob = await zip.generateAsync({
    type:               'blob',
    compression:        'DEFLATE',
    compressionOptions: { level: 6 },
  })

  prog('Listo', 100)

  const kb = Math.round(blob.size / 1024)
  const tamanio = kb > 1024 ? `${(kb/1024).toFixed(1)} MB` : `${kb} KB`

  return {
    nombre:    `GestoriaPaz_Backup_${sufijo}.zip`,
    blob,
    filas:     conteo,
    timestamp: fecha.toLocaleString('es-AR'),
    tamanio,
  }
}

// ─── EXPORTACIONES RÁPIDAS (módulo individual) ────────────────────────────────

export async function exportarModulo(
  modulo: 'clientes' | 'tramites' | 'vehiculos' | 'turnos'
): Promise<void> {
  const XLSX = await import('xlsx') as any

  let filas: Record<string, any>[] = []
  let nombre = ''

  if (modulo === 'clientes') {
    const snap = await getDocs(clientesCol)
    filas = snap.docs.map(d => {
      const c = d.data() as Cliente
      return {
        Apellido: c.apellido, Nombre: c.nombre, DNI: c.dni,
        Teléfono: c.telefono, Email: c.email ?? '',
        Localidad: c.localidad ?? '', Registrado: ts(c.creadoEn),
      }
    })
    nombre = 'Clientes'
  }

  if (modulo === 'tramites') {
    const [snapT, snapC] = await Promise.all([getDocs(tramitesCol), getDocs(clientesCol)])
    const cm = Object.fromEntries(snapC.docs.map(d => [d.id, d.data() as Cliente]))
    filas = snapT.docs.map(d => {
      const t = d.data() as Tramite
      const c = cm[t.clienteId]
      return {
        Número: t.numero, Tipo: TIPO_TRAMITE_LABELS[t.tipo],
        Estado: ESTADO_TRAMITE_LABELS[t.estado],
        Patente: t.patente,
        Cliente: c ? `${c.apellido}, ${c.nombre}` : '',
        Honorarios: pesos(t.honorarios), Pagado: t.pagado ? 'Sí' : 'No',
        Creado: ts(t.creadoEn),
      }
    })
    nombre = 'Tramites'
  }

  if (modulo === 'vehiculos') {
    const [snapV, snapC] = await Promise.all([getDocs(vehiculosCol), getDocs(clientesCol)])
    const cm = Object.fromEntries(snapC.docs.map(d => [d.id, d.data() as Cliente]))
    filas = snapV.docs.map(d => {
      const v = d.data() as Vehiculo
      const c = cm[v.clienteId]
      return {
        Patente: v.patente, Marca: v.marca, Modelo: v.modelo, Año: v.anio,
        Titular: c ? `${c.apellido}, ${c.nombre}` : '',
        'Nro Chasis': v.nroChasis, 'Nro Motor': v.nroMotor,
      }
    })
    nombre = 'Vehiculos'
  }

  if (modulo === 'turnos') {
    const [snapTu, snapC] = await Promise.all([getDocs(turnosCol), getDocs(clientesCol)])
    const cm = Object.fromEntries(snapC.docs.map(d => [d.id, d.data() as Cliente]))
    filas = snapTu.docs.map(d => {
      const t = d.data() as Turno
      const c = cm[t.clienteId]
      return {
        Fecha: ts(t.fecha), Hora: t.horaInicio,
        Tipo: TIPO_TRAMITE_LABELS[t.tipoTramite],
        Estado: t.estado,
        Cliente: c ? `${c.apellido}, ${c.nombre}` : '',
        Teléfono: c?.telefono ?? '',
      }
    })
    nombre = 'Turnos'
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(filas)
  XLSX.utils.book_append_sheet(wb, ws, nombre)
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `${nombre}_${new Date().toISOString().slice(0,10)}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}
