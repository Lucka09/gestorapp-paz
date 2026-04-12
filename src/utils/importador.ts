import * as XLSX from 'xlsx'
import {
  writeBatch, doc, collection,
  serverTimestamp, getDocs, query,
  where, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { TipoTramite, EstadoTramite, TipoVehiculo } from '@/types'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface FilaCliente {
  rowNum:       number
  apellido:     string
  nombre:       string
  dni:          string
  cuit:         string
  telefono:     string
  email:        string
  direccion:    string
  localidad:    string
  observaciones:string
}

export interface FilaVehiculo {
  rowNum:     number
  patente:    string
  tipo:       TipoVehiculo
  marca:      string
  modelo:     string
  anio:       number
  color:      string
  nroMotor:   string
  nroChasis:  string
  dniTitular: string
}

export interface FilaTramite {
  rowNum:       number
  dniCliente:   string
  patente:      string
  tipo:         TipoTramite
  estado:       EstadoTramite
  descripcion:  string
  honorarios:   number
  pagado:       boolean
  fechaInicio:  Date | null
  obsInternas:  string
}

export interface ErrorImportacion {
  hoja:    string
  fila:    number
  campo:   string
  mensaje: string
}

export interface ResultadoValidacion {
  clientes:  FilaCliente[]
  vehiculos: FilaVehiculo[]
  tramites:  FilaTramite[]
  errores:   ErrorImportacion[]
  warnings:  ErrorImportacion[]
}

export interface ResultadoImportacion {
  clientesCreados:  number
  vehiculosCreados: number
  tramitesCreados:  number
  errores:          ErrorImportacion[]
}

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

const TIPOS_TRAMITE_VALIDOS: TipoTramite[] = [
  'transferencia','alta','baja','tramite_08',
  'duplicado_titulo','duplicado_cedula','cambio_radicacion',
  'informe_dominio','certificado_dominio','inscripcion_inicial',
  'prenda','descargo_multa','inhibicion','levantamiento_inhibicion','vtv','otro',
]

const ESTADOS_VALIDOS: EstadoTramite[] = [
  'pendiente','en_proceso','documentacion_requerida','en_organismo',
  'listo_para_retirar','entregado','cancelado',
]

const TIPOS_VEHICULO_VALIDOS: TipoVehiculo[] = [
  'auto','moto','camion','utilitario','otro',
]

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function str(val: any): string {
  if (val === null || val === undefined) return ''
  return String(val).trim()
}

function parseFecha(val: any): Date | null {
  if (!val) return null
  const s = str(val)
  // dd/mm/yyyy
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]))
  // Excel serial number
  if (typeof val === 'number') {
    return new Date((val - 25569) * 86400 * 1000)
  }
  return null
}

function normalizarPatente(p: string): string {
  return p.toUpperCase().replace(/[-\s]/g, '').trim()
}

function normalizarDNI(d: string): string {
  return d.replace(/[.\s-]/g, '').trim()
}

// ─── LEER EXCEL ───────────────────────────────────────────────────────────────

export function leerExcel(file: File): Promise<XLSX.WorkBook> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array', cellDates: false })
        resolve(wb)
      } catch (err) {
        reject(new Error('No se pudo leer el archivo. ¿Es un Excel (.xlsx) válido?'))
      }
    }
    reader.onerror = () => reject(new Error('Error al leer el archivo'))
    reader.readAsArrayBuffer(file)
  })
}

// ─── VALIDAR Y PARSEAR ────────────────────────────────────────────────────────

export function validarExcel(wb: XLSX.WorkBook): ResultadoValidacion {
  const errores:  ErrorImportacion[] = []
  const warnings: ErrorImportacion[] = []
  const clientes:  FilaCliente[]  = []
  const vehiculos: FilaVehiculo[] = []
  const tramites:  FilaTramite[]  = []

  const dniVistos     = new Set<string>()
  const patenteVistas = new Set<string>()

  // ── HOJA CLIENTES ──────────────────────────────────────────────────────────
  const wsC = wb.Sheets['Clientes']
  if (!wsC) {
    errores.push({ hoja: 'Clientes', fila: 0, campo: 'hoja',
      mensaje: 'No se encontró la hoja "Clientes". ¿Usaste la plantilla correcta?' })
  } else {
    const filas = XLSX.utils.sheet_to_json(wsC, { header: 1 }) as any[][]
    const headers = (filas[0] ?? []).map(h => str(h).toLowerCase().replace('*',''))

    const col = (name: string) => headers.indexOf(name)

    for (let i = 1; i < filas.length; i++) {
      const row  = filas[i]
      const rn   = i + 1
      if (!row || row.every(c => !c)) continue  // fila vacía

      const apellido  = str(row[col('apellido')])
      const nombre    = str(row[col('nombre')])
      const dniRaw    = str(row[col('dni')])
      const dni       = normalizarDNI(dniRaw)
      const cuit      = str(row[col('cuit')])
      const telefono  = str(row[col('telefono')]).replace(/\s/g,'')
      const email     = str(row[col('email')])
      const direccion = str(row[col('direccion')])
      const localidad = str(row[col('localidad')])
      const obs       = str(row[col('observaciones')])

      // Validaciones obligatorias
      if (!apellido) errores.push({ hoja:'Clientes', fila:rn, campo:'apellido', mensaje:'Apellido vacío' })
      if (!nombre)   errores.push({ hoja:'Clientes', fila:rn, campo:'nombre',   mensaje:'Nombre vacío' })
      if (!dni)      errores.push({ hoja:'Clientes', fila:rn, campo:'dni',      mensaje:'DNI vacío' })
      if (!telefono) warnings.push({ hoja:'Clientes', fila:rn, campo:'telefono', mensaje:'Teléfono vacío — se recomienda completarlo' })

      // Validaciones de formato
      if (dni && !/^\d{7,8}$/.test(dni))
        errores.push({ hoja:'Clientes', fila:rn, campo:'dni', mensaje:`DNI inválido: "${dniRaw}" (debe tener 7 u 8 dígitos)` })

      // Duplicados
      if (dniVistos.has(dni))
        warnings.push({ hoja:'Clientes', fila:rn, campo:'dni', mensaje:`DNI ${dni} duplicado — solo se importará la primera ocurrencia` })
      else
        dniVistos.add(dni)

      if (apellido && nombre && dni && /^\d{7,8}$/.test(dni) && !dniVistos.has(dni + '_dup')) {
        dniVistos.add(dni + '_dup')
        clientes.push({ rowNum:rn, apellido, nombre, dni, cuit, telefono, email, direccion, localidad, observaciones:obs })
      }
    }
  }

  // ── HOJA VEHICULOS ─────────────────────────────────────────────────────────
  const wsV = wb.Sheets['Vehiculos']
  if (wsV) {
    const filas = XLSX.utils.sheet_to_json(wsV, { header: 1 }) as any[][]
    const headers = (filas[0] ?? []).map(h => str(h).toLowerCase().replace('*',''))
    const col = (name: string) => headers.indexOf(name)

    for (let i = 1; i < filas.length; i++) {
      const row = filas[i]
      const rn  = i + 1
      if (!row || row.every(c => !c)) continue

      const patenteRaw = str(row[col('patente')])
      const patente    = normalizarPatente(patenteRaw)
      const tipoRaw    = str(row[col('tipo')]).toLowerCase()
      const tipo       = tipoRaw as TipoVehiculo
      const marca      = str(row[col('marca')])
      const modelo     = str(row[col('modelo')])
      const anioRaw    = str(row[col('anio')])
      const anio       = parseInt(anioRaw)
      const color      = str(row[col('color')])
      const nroMotor   = str(row[col('nro_motor')])
      const nroChasis  = str(row[col('nro_chasis')])
      const dniTitular = normalizarDNI(str(row[col('dni_titular')]))

      if (!patente)  errores.push({ hoja:'Vehiculos', fila:rn, campo:'patente',    mensaje:'Patente vacía' })
      if (!marca)    errores.push({ hoja:'Vehiculos', fila:rn, campo:'marca',      mensaje:'Marca vacía' })
      if (!modelo)   errores.push({ hoja:'Vehiculos', fila:rn, campo:'modelo',     mensaje:'Modelo vacío' })
      if (isNaN(anio) || anio < 1900 || anio > 2027)
        errores.push({ hoja:'Vehiculos', fila:rn, campo:'anio', mensaje:`Año inválido: "${anioRaw}"` })
      if (!TIPOS_VEHICULO_VALIDOS.includes(tipo))
        errores.push({ hoja:'Vehiculos', fila:rn, campo:'tipo', mensaje:`Tipo inválido: "${tipoRaw}". Usar: ${TIPOS_VEHICULO_VALIDOS.join(' / ')}` })
      if (!dniTitular)
        errores.push({ hoja:'Vehiculos', fila:rn, campo:'dni_titular', mensaje:'DNI titular vacío' })
      else if (!dniVistos.has(dniTitular) && !dniVistos.has(dniTitular + '_dup'))
        warnings.push({ hoja:'Vehiculos', fila:rn, campo:'dni_titular', mensaje:`DNI ${dniTitular} no encontrado en hoja Clientes — se intentará vincular si ya existe en la base de datos` })

      if (patenteVistas.has(patente))
        warnings.push({ hoja:'Vehiculos', fila:rn, campo:'patente', mensaje:`Patente ${patente} duplicada — solo se importará la primera` })
      else
        patenteVistas.add(patente)

      if (patente && marca && modelo && !isNaN(anio) && TIPOS_VEHICULO_VALIDOS.includes(tipo)) {
        vehiculos.push({ rowNum:rn, patente, tipo, marca, modelo, anio, color, nroMotor, nroChasis, dniTitular })
      }
    }
  }

  // ── HOJA TRAMITES ──────────────────────────────────────────────────────────
  const wsT = wb.Sheets['Tramites']
  if (wsT) {
    const filas = XLSX.utils.sheet_to_json(wsT, { header: 1 }) as any[][]
    const headers = (filas[0] ?? []).map(h => str(h).toLowerCase().replace('*',''))
    const col = (name: string) => headers.indexOf(name)

    for (let i = 1; i < filas.length; i++) {
      const row = filas[i]
      const rn  = i + 1
      if (!row || row.every(c => !c)) continue

      const dniCliente = normalizarDNI(str(row[col('dni_cliente')]))
      const patente    = normalizarPatente(str(row[col('patente')]))
      const tipoRaw    = str(row[col('tipo_tramite')]).toLowerCase()
      const estadoRaw  = str(row[col('estado')]).toLowerCase()
      const desc       = str(row[col('descripcion')])
      const honRaw     = str(row[col('honorarios')]).replace(/[$.\s]/g,'').replace(',','.')
      const honorarios = parseFloat(honRaw) || 0
      const pagadoRaw  = str(row[col('pagado')]).toLowerCase()
      const pagado     = pagadoRaw === 'si' || pagadoRaw === 'sí' || pagadoRaw === 'yes' || pagadoRaw === '1'
      const fechaInicio = parseFecha(row[col('fecha_inicio')])
      const obsInt     = str(row[col('observaciones_internas')])

      if (!dniCliente) errores.push({ hoja:'Tramites', fila:rn, campo:'dni_cliente', mensaje:'DNI cliente vacío' })
      if (!patente)    errores.push({ hoja:'Tramites', fila:rn, campo:'patente',    mensaje:'Patente vacía' })
      if (!TIPOS_TRAMITE_VALIDOS.includes(tipoRaw as TipoTramite))
        errores.push({ hoja:'Tramites', fila:rn, campo:'tipo_tramite', mensaje:`Tipo inválido: "${tipoRaw}"` })
      if (!ESTADOS_VALIDOS.includes(estadoRaw as EstadoTramite))
        errores.push({ hoja:'Tramites', fila:rn, campo:'estado', mensaje:`Estado inválido: "${estadoRaw}"` })

      if (dniCliente && patente &&
          TIPOS_TRAMITE_VALIDOS.includes(tipoRaw as TipoTramite) &&
          ESTADOS_VALIDOS.includes(estadoRaw as EstadoTramite)) {
        tramites.push({
          rowNum: rn,
          dniCliente, patente,
          tipo:    tipoRaw as TipoTramite,
          estado:  estadoRaw as EstadoTramite,
          descripcion: desc,
          honorarios, pagado, fechaInicio,
          obsInternas: obsInt,
        })
      }
    }
  }

  return { clientes, vehiculos, tramites, errores, warnings }
}

// ─── IMPORTAR A FIRESTORE ─────────────────────────────────────────────────────

export async function importarAFirestore(
  datos:    ResultadoValidacion,
  creadoPor: string
): Promise<ResultadoImportacion> {
  const errores: ErrorImportacion[] = []
  let clientesCreados  = 0
  let vehiculosCreados = 0
  let tramitesCreados  = 0

  // Mapa dni → clienteId (para vincular vehículos y trámites)
  const dniToId   = new Map<string, string>()
  const patenteToId = new Map<string, string>()

  // Verificar clientes existentes en Firestore
  const clientesCol = collection(db, 'clientes')
  const existentesSnap = await getDocs(clientesCol)
  existentesSnap.docs.forEach(d => {
    const data = d.data()
    if (data.dni) dniToId.set(String(data.dni), d.id)
  })

  // Verificar vehículos existentes
  const vehiculosCol = collection(db, 'vehiculos')
  const vehiculosSnap = await getDocs(vehiculosCol)
  vehiculosSnap.docs.forEach(d => {
    const data = d.data()
    if (data.patente) patenteToId.set(data.patente, d.id)
  })

  // ── IMPORTAR CLIENTES (batches de 500) ────────────────────────────────────
  const clientesNuevos = datos.clientes.filter(c => !dniToId.has(c.dni))
  const BATCH_SIZE = 400

  for (let i = 0; i < clientesNuevos.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = clientesNuevos.slice(i, i + BATCH_SIZE)

    chunk.forEach(c => {
      const ref = doc(clientesCol)
      batch.set(ref, {
        nombre:       c.nombre,
        apellido:     c.apellido,
        dni:          c.dni,
        cuit:         c.cuit || '',
        telefono:     c.telefono,
        email:        c.email || '',
        direccion:    c.direccion || '',
        localidad:    c.localidad || '',
        observaciones: c.observaciones || '',
        userId:       null,
        vehiculosIds: [],
        creadoPor,
        creadoEn:     serverTimestamp(),
      })
      dniToId.set(c.dni, ref.id)
      clientesCreados++
    })

    await batch.commit()
  }

  // ── IMPORTAR VEHÍCULOS ────────────────────────────────────────────────────
  const vehiculosNuevos = datos.vehiculos.filter(v => !patenteToId.has(v.patente))

  for (let i = 0; i < vehiculosNuevos.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = vehiculosNuevos.slice(i, i + BATCH_SIZE)

    for (const v of chunk) {
      const clienteId = dniToId.get(v.dniTitular)
      if (!clienteId) {
        errores.push({
          hoja: 'Vehiculos', fila: v.rowNum, campo: 'dni_titular',
          mensaje: `No se encontró cliente con DNI ${v.dniTitular} — vehículo ${v.patente} no importado`,
        })
        continue
      }

      const ref = doc(vehiculosCol)
      batch.set(ref, {
        patente:    v.patente,
        tipo:       v.tipo,
        marca:      v.marca,
        modelo:     v.modelo,
        anio:       v.anio,
        color:      v.color || '',
        nroMotor:   v.nroMotor || '',
        nroChasis:  v.nroChasis || '',
        clienteId,
        historialTitulares: [{ clienteId, desde: serverTimestamp(), hasta: null }],
        tramitesIds: [],
        creadoEn:    serverTimestamp(),
      })
      patenteToId.set(v.patente, ref.id)
      vehiculosCreados++

      // Actualizar vehiculosIds del cliente
      const clienteRef = doc(db, 'clientes', clienteId)
      batch.update(clienteRef, {
        vehiculosIds: [...([] as string[]), ref.id],
      })
    }

    await batch.commit()
  }

  // ── IMPORTAR TRÁMITES ─────────────────────────────────────────────────────
  const tramitesCol = collection(db, 'tramites')

  for (let i = 0; i < datos.tramites.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = datos.tramites.slice(i, i + BATCH_SIZE)

    for (const t of chunk) {
      const clienteId = dniToId.get(t.dniCliente)
      const vehiculoId = patenteToId.get(t.patente)

      if (!clienteId) {
        errores.push({
          hoja: 'Tramites', fila: t.rowNum, campo: 'dni_cliente',
          mensaje: `Cliente DNI ${t.dniCliente} no encontrado — trámite no importado`,
        })
        continue
      }
      if (!vehiculoId) {
        errores.push({
          hoja: 'Tramites', fila: t.rowNum, campo: 'patente',
          mensaje: `Vehículo ${t.patente} no encontrado — trámite no importado`,
        })
        continue
      }

      const year  = new Date().getFullYear()
      const rand  = String(Math.floor(Math.random() * 9000) + 1000)
      const numero = `TRM-${year}-${rand}`

      const ref = doc(tramitesCol)
      batch.set(ref, {
        numero,
        tipo:                  t.tipo,
        estado:                t.estado,
        clienteId,
        vehiculoId,
        patente:               t.patente,
        descripcion:           t.descripcion || '',
        observacionesInternas: t.obsInternas || '',
        documentos:            [],
        historialEstados:      [],
        honorarios:            t.honorarios,
        pagado:                t.pagado,
        fechaPago:             t.pagado && t.fechaInicio ? Timestamp.fromDate(t.fechaInicio) : null,
        turnoId:               null,
        asignadoA:             null,
        creadoPor,
        creadoEn:              t.fechaInicio
          ? Timestamp.fromDate(t.fechaInicio)
          : serverTimestamp(),
        actualizadoEn:         serverTimestamp(),
      })
      tramitesCreados++
    }

    await batch.commit()
  }

  return { clientesCreados, vehiculosCreados, tramitesCreados, errores }
}
