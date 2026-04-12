// Ejecutar con: npx tsx scripts/generarPlantilla.ts
// O incluir en la app como descarga

// xlsx carga dinámica

export async function generarPlantillaImportacion() {
  const XLSX = await import('xlsx') as any
  const wb = XLSX.utils.book_new()

  // ── HOJA 1: CLIENTES ──────────────────────────────────────────────────────
  const clientesHeaders = [
    'apellido*', 'nombre*', 'dni*', 'cuit', 'telefono*',
    'email', 'direccion', 'localidad', 'observaciones',
  ]
  const clientesEjemplo = [
    ['García', 'Juan', '20123456', '20-20123456-3', '1145678901',
     'juan@mail.com', 'Av. San Martín 1234', 'San Martín', 'Cliente frecuente'],
    ['López', 'María', '27654321', '', '1167890123',
     '', 'Belgrano 456', 'Ramos Mejía', ''],
    ['Rodríguez', 'Carlos', '30111222', '30-30111222-5', '1134567890',
     'carlos@empresa.com', '', 'Villa Ballester', 'Empresa — factura'],
  ]
  const wsClientes = XLSX.utils.aoa_to_sheet([clientesHeaders, ...clientesEjemplo])
  wsClientes['!cols'] = clientesHeaders.map(h =>
    ({ wch: h.length < 8 ? 14 : h.length + 6 })
  )
  XLSX.utils.book_append_sheet(wb, wsClientes, 'Clientes')

  // ── HOJA 2: VEHÍCULOS ─────────────────────────────────────────────────────
  const vehiculosHeaders = [
    'patente*', 'tipo*', 'marca*', 'modelo*', 'anio*',
    'color', 'nro_motor', 'nro_chasis', 'dni_titular*',
  ]
  const vehiculosEjemplo = [
    ['AB123CD', 'auto', 'Toyota', 'Corolla', '2019',
     'Blanco', 'AB123456', '9BWZZZ377VT004251', '20123456'],
    ['ZZ987YY', 'moto', 'Honda', 'CB300', '2021',
     'Negro', 'ZZ987654', '', '27654321'],
    ['AC456DE', 'auto', 'Volkswagen', 'Gol', '2017',
     'Gris', '', '', '30111222'],
  ]
  const wsVehiculos = XLSX.utils.aoa_to_sheet([vehiculosHeaders, ...vehiculosEjemplo])
  wsVehiculos['!cols'] = vehiculosHeaders.map(() => ({ wch: 16 }))
  XLSX.utils.book_append_sheet(wb, wsVehiculos, 'Vehiculos')

  // ── HOJA 3: TRÁMITES ──────────────────────────────────────────────────────
  const tramitesHeaders = [
    'dni_cliente*', 'patente*', 'tipo_tramite*', 'estado*',
    'descripcion', 'honorarios', 'pagado', 'fecha_inicio', 'observaciones_internas',
  ]
  const tramitesEjemplo = [
    ['20123456', 'AB123CD', 'transferencia', 'entregado',
     'Transferencia VW Gol a Juan García', '45000', 'si', '15/11/2025', ''],
    ['27654321', 'ZZ987YY', 'tramite_08', 'en_proceso',
     'Cédula verde Honda CB300', '18000', 'no', '03/03/2026', 'Falta firma'],
    ['30111222', 'AC456DE', 'infraccion', 'pendiente',
     'Descargo multa PBA', '25000', 'si', '10/04/2026', ''],
  ]
  const wsTramites = XLSX.utils.aoa_to_sheet([tramitesHeaders, ...tramitesEjemplo])
  wsTramites['!cols'] = tramitesHeaders.map(() => ({ wch: 18 }))
  XLSX.utils.book_append_sheet(wb, wsTramites, 'Tramites')

  // ── HOJA 4: INSTRUCCIONES ─────────────────────────────────────────────────
  const instrucciones = [
    ['INSTRUCCIONES DE IMPORTACIÓN — GestorApp'],
    [''],
    ['IMPORTANTE: No modificar los nombres de las hojas ni las columnas con *'],
    [''],
    ['HOJA "Clientes"'],
    ['  apellido*     → Obligatorio'],
    ['  nombre*       → Obligatorio'],
    ['  dni*          → Obligatorio. Solo números, sin puntos (ej: 20123456)'],
    ['  cuit          → Opcional. Con o sin guiones'],
    ['  telefono*     → Obligatorio. Solo números (ej: 1145678901)'],
    ['  email         → Opcional'],
    ['  direccion     → Opcional'],
    ['  localidad     → Opcional (ej: San Martín, Ramos Mejía)'],
    ['  observaciones → Opcional. Notas internas del cliente'],
    [''],
    ['HOJA "Vehiculos"'],
    ['  patente*      → Obligatorio. Sin guiones (ej: AB123CD o AB123CD)'],
    ['  tipo*         → auto / moto / camion / utilitario / otro'],
    ['  marca*        → Obligatorio'],
    ['  modelo*       → Obligatorio'],
    ['  anio*         → Obligatorio. 4 dígitos (ej: 2019)'],
    ['  color         → Opcional'],
    ['  nro_motor     → Opcional'],
    ['  nro_chasis    → Opcional'],
    ['  dni_titular*  → Obligatorio. DNI del cliente titular (debe existir en hoja Clientes)'],
    [''],
    ['HOJA "Tramites" (opcional)'],
    ['  dni_cliente*  → DNI del cliente (debe existir en hoja Clientes)'],
    ['  patente*      → Patente del vehículo (debe existir en hoja Vehiculos)'],
    ['  tipo_tramite* → transferencia / tramite_08 / infraccion / radicacion / baja /'],
    ['                  alta / baja / duplicado_titulo / duplicado_cedula / cambio_radicacion /'],
    ['                  informe_dominio / certificado_dominio / inscripcion_inicial /'],
    ['                  prenda / descargo_multa / inhibicion / levantamiento_inhibicion / vtv / otro'],
    ['  estado*       → pendiente / en_proceso / documentacion_requerida /'],
    ['                  en_organismo / listo_para_retirar / entregado / cancelado'],
    ['  descripcion   → Opcional'],
    ['  honorarios    → Opcional. Solo números sin $ (ej: 45000)'],
    ['  pagado        → si / no'],
    ['  fecha_inicio  → dd/mm/yyyy (ej: 15/11/2025)'],
    [''],
    ['CONSEJOS'],
    ['  - Podés importar solo Clientes, o Clientes + Vehículos, o todo junto'],
    ['  - Si un DNI se repite en la hoja Clientes, solo se importa la primera fila'],
    ['  - Si una patente se repite, solo se importa la primera fila'],
    ['  - Los errores se muestran en detalle antes de confirmar la importación'],
  ]
  const wsInst = XLSX.utils.aoa_to_sheet(instrucciones)
  wsInst['!cols'] = [{ wch: 70 }]
  XLSX.utils.book_append_sheet(wb, wsInst, 'INSTRUCCIONES')

  return wb
}

export async function descargarPlantilla() {
  const XLSX = await import('xlsx') as any
  const wb = await generarPlantillaImportacion()
  XLSX.writeFile(wb, 'GestorApp_Plantilla_Importacion.xlsx')
}
