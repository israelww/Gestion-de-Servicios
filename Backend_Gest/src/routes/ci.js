const express = require('express')
const sql     = require('mssql')

const router = express.Router()
const { getPool }                      = require('../config/db')
const { resetSqlPool }                 = require('../config/db')
const { requireAdmin, requireAdminOrTecnico } = require('../middleware/auth')
const { toTrimmedString, badRequest, isForeignKeyError, existsById, getServerErrorMessage, getServerErrorDetail } = require('../helpers/sqlHelpers')
const { normalizeEspecificacionesHardwareForDb, buildCiPrefix, findNextCiId, getCiTypeData } = require('../helpers/ciHelpers')
const { ensureCiHistoryTable }         = require('../db/schema')
const { EXPECTED_DATABASE, CI_DEFAULT_STATUS, DESKTOP_TIPO_CI_ID } = require('../constants')

// GET /api/catalogos/ci
router.get('/catalogos/ci', async (_req, res) => {
  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    const [tipos, marcas, edificios, usuarios] = await Promise.all([
      pool.request().query(`SELECT id_tipo_ci, nombre_tipo FROM Tipo_CI ORDER BY nombre_tipo`),
      pool.request().query(`SELECT id_marca, nombre_marca FROM marcas ORDER BY nombre_marca`),
      pool.request().query(`SELECT id_edificio, nombre_edificio FROM Edificios ORDER BY nombre_edificio`),
      pool.request().query(`SELECT id_usuario, nombre_completo FROM Usuarios ORDER BY nombre_completo`),
    ])

    return res.status(200).json({
      tipos_ci:  tipos.recordset,
      marcas:    marcas.recordset,
      edificios: edificios.recordset,
      usuarios:  usuarios.recordset,
    })
  } catch (err) {
    console.error('Error en GET /api/catalogos/ci:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// GET /api/ci
router.get('/ci', async (_req, res) => {
  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    const result = await pool.request().query(`
      SELECT
        ci.id_ci,
        ci.numero_serie,
        ci.nombre_equipo,
        ci.modelo,
        ci.estado,
        ci.fecha_ingreso,
        ci.id_tipo_ci,
        ci.id_marca,
        ci.id_sublocalizacion,
        ci.id_usuario_responsable,
        ci.especificaciones_hardware,
        tc.nombre_tipo,
        m.nombre_marca,
        s.nombre_sublocalizacion,
        e.nombre_edificio,
        u.nombre_completo AS usuario_responsable
      FROM Elementos_Configuracion ci
      JOIN Tipo_CI tc ON tc.id_tipo_ci = ci.id_tipo_ci
      JOIN marcas m ON m.id_marca = ci.id_marca
      JOIN Sublocalizaciones s ON s.id_sublocalizacion = ci.id_sublocalizacion
      JOIN Edificios e ON e.id_edificio = s.id_edificio
      LEFT JOIN Usuarios u ON u.id_usuario = ci.id_usuario_responsable
      ORDER BY ci.fecha_ingreso DESC, ci.id_ci DESC
    `)
    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/ci:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// GET /api/ci/:id_ci/detalle
router.get('/ci/:id_ci/detalle', ...requireAdminOrTecnico, async (req, res) => {
  const id_ci = toTrimmedString(req.params?.id_ci)
  if (!id_ci) return badRequest(res, 'El id_ci es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    const result = await pool
      .request()
      .input('id_ci', sql.VarChar(25), id_ci)
      .query(`
        SELECT
          ci.id_ci, ci.numero_serie, ci.nombre_equipo, ci.modelo, ci.estado,
          ci.fecha_ingreso, ci.id_tipo_ci, ci.id_marca, ci.id_sublocalizacion,
          ci.id_usuario_responsable, ci.especificaciones_hardware,
          tc.nombre_tipo, m.nombre_marca, s.nombre_sublocalizacion,
          e.nombre_edificio, u.nombre_completo AS usuario_responsable
        FROM Elementos_Configuracion ci
        JOIN Tipo_CI tc ON tc.id_tipo_ci = ci.id_tipo_ci
        JOIN marcas m ON m.id_marca = ci.id_marca
        JOIN Sublocalizaciones s ON s.id_sublocalizacion = ci.id_sublocalizacion
        JOIN Edificios e ON e.id_edificio = s.id_edificio
        LEFT JOIN Usuarios u ON u.id_usuario = ci.id_usuario_responsable
        WHERE ci.id_ci = @id_ci
      `)

    const row = result.recordset?.[0]
    if (!row) return res.status(404).json({ message: 'El CI no existe' })
    return res.status(200).json(row)
  } catch (err) {
    console.error('Error en GET /api/ci/:id_ci/detalle:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// POST /api/ci
router.post('/ci', async (req, res) => {
  const payload = {
    id_ci:                 toTrimmedString(req.body?.id_ci),
    numero_serie:          toTrimmedString(req.body?.numero_serie),
    nombre_equipo:         toTrimmedString(req.body?.nombre_equipo),
    modelo:                toTrimmedString(req.body?.modelo),
    id_tipo_ci:            toTrimmedString(req.body?.id_tipo_ci),
    id_marca:              toTrimmedString(req.body?.id_marca),
    id_sublocalizacion:    toTrimmedString(req.body?.id_sublocalizacion),
    id_usuario_responsable: toTrimmedString(req.body?.id_usuario_responsable),
  }

  if (!payload.numero_serie || !payload.id_tipo_ci || !payload.id_marca || !payload.id_sublocalizacion) {
    return badRequest(res, 'numero_serie, id_tipo_ci, id_marca e id_sublocalizacion son obligatorios')
  }

  const hardwareNorm = normalizeEspecificacionesHardwareForDb(payload.id_tipo_ci, req.body?.especificaciones_hardware)
  if (!hardwareNorm.ok) return badRequest(res, hardwareNorm.error)

  const pool = await getPool()
  if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

  const dbResult     = await pool.request().query('SELECT DB_NAME() AS database_name')
  const activeDatabase = dbResult.recordset?.[0]?.database_name
  if (activeDatabase !== EXPECTED_DATABASE) {
    await resetSqlPool()
    return res.status(500).json({ message: `La conexión activa apunta a ${activeDatabase}; se esperaba ${EXPECTED_DATABASE}` })
  }
  console.log(`[POST /api/ci] DB=${activeDatabase} id_tipo_ci=${payload.id_tipo_ci} id_marca=${payload.id_marca} id_sublocalizacion=${payload.id_sublocalizacion}`)

  const transaction = new sql.Transaction(pool)
  let transactionFinished = false

  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
    const request = new sql.Request(transaction)

    const tipo = await getCiTypeData(request, payload.id_tipo_ci)
    if (!tipo) { await transaction.rollback(); return res.status(404).json({ message: 'El tipo de CI no existe' }) }

    const prefix    = buildCiPrefix(tipo.nombre_tipo)
    const finalIdCi = toTrimmedString(payload.id_ci || (await findNextCiId(new sql.Request(transaction), prefix)))

    if (finalIdCi.length > 25) { await transaction.rollback(); return badRequest(res, 'El id_ci no puede exceder 25 caracteres') }
    if (!finalIdCi.startsWith(`${prefix}-`)) { await transaction.rollback(); return badRequest(res, `El id_ci debe iniciar con el prefijo ${prefix}- según el tipo seleccionado`) }

    const duplicatedCi = await existsById(new sql.Request(transaction), 'Elementos_Configuracion', 'id_ci', 'id_ci', finalIdCi)
    if (duplicatedCi) { await transaction.rollback(); return res.status(409).json({ message: 'El id_ci ya existe' }) }

    const duplicatedSerial = await new sql.Request(transaction)
      .input('numero_serie', sql.VarChar(50), payload.numero_serie)
      .query(`SELECT 1 AS found FROM Elementos_Configuracion WHERE numero_serie = @numero_serie`)
    if (duplicatedSerial.recordset?.[0]?.found) { await transaction.rollback(); return res.status(409).json({ message: 'El número de serie ya existe' }) }

    const marcaExists = await existsById(new sql.Request(transaction), 'marcas', 'id_marca', 'id_marca', payload.id_marca)
    if (!marcaExists) { await transaction.rollback(); return res.status(404).json({ message: 'La marca seleccionada no existe' }) }

    const sublocalizacionExists = await existsById(new sql.Request(transaction), 'Sublocalizaciones', 'id_sublocalizacion', 'id_sublocalizacion', payload.id_sublocalizacion)
    if (!sublocalizacionExists) { await transaction.rollback(); return res.status(404).json({ message: 'La sublocalización seleccionada no existe' }) }

    if (payload.id_usuario_responsable) {
      const usuarioExists = await existsById(new sql.Request(transaction), 'Usuarios', 'id_usuario', 'id_usuario', payload.id_usuario_responsable)
      if (!usuarioExists) { await transaction.rollback(); return res.status(404).json({ message: 'El usuario responsable no existe' }) }
    }

    await new sql.Request(transaction)
      .input('id_ci',                  sql.VarChar(25),      finalIdCi)
      .input('numero_serie',           sql.VarChar(50),      payload.numero_serie)
      .input('nombre_equipo',          sql.VarChar(100),     payload.nombre_equipo || null)
      .input('modelo',                 sql.VarChar(100),     payload.modelo || null)
      .input('estado',                 sql.VarChar(20),      CI_DEFAULT_STATUS)
      .input('id_tipo_ci',             sql.Char(10),         payload.id_tipo_ci)
      .input('id_marca',               sql.Char(10),         payload.id_marca)
      .input('id_sublocalizacion',     sql.Char(10),         payload.id_sublocalizacion)
      .input('id_usuario_responsable', sql.Char(15),         payload.id_usuario_responsable || null)
      .input('fecha_ingreso',          sql.Date,             new Date())
      .input('especificaciones_hardware', sql.NVarChar(sql.MAX), hardwareNorm.value)
      .query(`
        INSERT INTO Elementos_Configuracion (
          id_ci, numero_serie, nombre_equipo, modelo, estado,
          id_tipo_ci, id_marca, id_sublocalizacion, id_usuario_responsable,
          fecha_ingreso, especificaciones_hardware
        ) VALUES (
          @id_ci, @numero_serie, @nombre_equipo, @modelo, @estado,
          @id_tipo_ci, @id_marca, @id_sublocalizacion, @id_usuario_responsable,
          @fecha_ingreso, @especificaciones_hardware
        )
      `)

    await transaction.commit()
    transactionFinished = true

    return res.status(201).json({
      message: 'CI creado correctamente',
      data: { ...payload, id_ci: finalIdCi, estado: CI_DEFAULT_STATUS, fecha_ingreso: new Date().toISOString().slice(0, 10) },
    })
  } catch (err) {
    if (!transactionFinished) { try { await transaction.rollback() } catch {} }
    console.error('Error en POST /api/ci:', err)
    return res.status(500).json({ message: `Error en POST /api/ci: ${getServerErrorMessage(err)}`, detail: getServerErrorDetail(err) })
  }
})

// PUT /api/ci/:id_ci
router.put('/ci/:id_ci', ...requireAdmin, async (req, res) => {
  const id_ci   = toTrimmedString(req.params?.id_ci)
  const payload = {
    numero_serie:           toTrimmedString(req.body?.numero_serie),
    nombre_equipo:          toTrimmedString(req.body?.nombre_equipo),
    modelo:                 toTrimmedString(req.body?.modelo),
    id_marca:               toTrimmedString(req.body?.id_marca),
    id_usuario_responsable: toTrimmedString(req.body?.id_usuario_responsable),
  }

  if (!id_ci || !payload.numero_serie || !payload.id_marca) {
    return badRequest(res, 'id_ci, numero_serie e id_marca son obligatorios')
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    const existingResult = await pool
      .request()
      .input('id_ci', sql.VarChar(25), id_ci)
      .query(`SELECT id_ci, id_tipo_ci FROM Elementos_Configuracion WHERE id_ci = @id_ci`)
    const existingRow = existingResult.recordset?.[0]
    if (!existingRow) return res.status(404).json({ message: 'El CI no existe' })

    const idTipoExisting = toTrimmedString(existingRow.id_tipo_ci)
    const hardwareNorm   = normalizeEspecificacionesHardwareForDb(idTipoExisting, req.body?.especificaciones_hardware)
    if (!hardwareNorm.ok) return badRequest(res, hardwareNorm.error)

    if (payload.id_usuario_responsable) {
      const usuarioExists = await existsById(pool.request(), 'Usuarios', 'id_usuario', 'id_usuario', payload.id_usuario_responsable)
      if (!usuarioExists) return res.status(404).json({ message: 'El usuario responsable no existe' })
    }

    const reqUpdate = pool.request()
      .input('id_ci',                  sql.VarChar(25),  id_ci)
      .input('numero_serie',           sql.VarChar(50),  payload.numero_serie)
      .input('nombre_equipo',          sql.VarChar(100), payload.nombre_equipo || null)
      .input('modelo',                 sql.VarChar(100), payload.modelo || null)
      .input('id_marca',               sql.Char(10),     payload.id_marca)
      .input('id_usuario_responsable', sql.Char(15),     payload.id_usuario_responsable || null)

    if (idTipoExisting === DESKTOP_TIPO_CI_ID) {
      reqUpdate.input('especificaciones_hardware', sql.NVarChar(sql.MAX), hardwareNorm.value)
      await reqUpdate.query(`
        UPDATE Elementos_Configuracion
        SET numero_serie = @numero_serie, nombre_equipo = @nombre_equipo, modelo = @modelo,
            id_marca = @id_marca, id_usuario_responsable = @id_usuario_responsable,
            especificaciones_hardware = @especificaciones_hardware
        WHERE id_ci = @id_ci
      `)
    } else {
      await reqUpdate.query(`
        UPDATE Elementos_Configuracion
        SET numero_serie = @numero_serie, nombre_equipo = @nombre_equipo, modelo = @modelo,
            id_marca = @id_marca, id_usuario_responsable = @id_usuario_responsable
        WHERE id_ci = @id_ci
      `)
    }

    return res.status(200).json({ message: 'CI actualizado correctamente' })
  } catch (err) {
    console.error('Error en PUT /api/ci/:id_ci:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// DELETE /api/ci/:id_ci
router.delete('/ci/:id_ci', ...requireAdmin, async (req, res) => {
  const id_ci = toTrimmedString(req.params?.id_ci)
  if (!id_ci) return badRequest(res, 'El id_ci es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    const deleteResult = await pool
      .request()
      .input('id_ci', sql.VarChar(25), id_ci)
      .query(`DELETE FROM Elementos_Configuracion WHERE id_ci = @id_ci`)

    if (!deleteResult.rowsAffected?.[0]) return res.status(404).json({ message: 'El CI no existe' })
    return res.status(200).json({ message: 'CI eliminado correctamente' })
  } catch (err) {
    if (isForeignKeyError(err)) {
      return res.status(409).json({ message: 'No se puede eliminar: tiene registros relacionados' })
    }
    console.error('Error en DELETE /api/ci/:id_ci:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// GET /api/ci/:id_ci/historial-cambios
router.get('/ci/:id_ci/historial-cambios', ...requireAdminOrTecnico, async (req, res) => {
  const id_ci = toTrimmedString(req.params?.id_ci)
  if (!id_ci) return badRequest(res, 'El id_ci es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureCiHistoryTable(pool)

    const exists = await existsById(pool.request(), 'Elementos_Configuracion', 'id_ci', 'id_ci', id_ci)
    if (!exists) return res.status(404).json({ message: 'El CI no existe' })

    const result = await pool
      .request()
      .input('id_ci', sql.VarChar(25), id_ci)
      .query(`
        SELECT
          id_historial, id_ci, id_mantenimiento, fecha_cambio,
          numero_transaccion, origen_transaccion, tecnico, detalle_cambio, fecha_registro
        FROM Historial_Cambios_CI
        WHERE id_ci = @id_ci
        ORDER BY fecha_cambio DESC, id_historial DESC
      `)
    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/ci/:id_ci/historial-cambios:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// POST /api/ci/:id_ci/historial-cambios
router.post('/ci/:id_ci/historial-cambios', async (req, res) => {
  const id_ci  = toTrimmedString(req.params?.id_ci)
  const payload = {
    fecha_cambio:    toTrimmedString(req.body?.fecha_cambio),
    id_mantenimiento: toTrimmedString(req.body?.id_mantenimiento),
    detalle_cambio:  toTrimmedString(req.body?.detalle_cambio),
  }

  if (!id_ci) return badRequest(res, 'El id_ci es obligatorio')
  if (!payload.id_mantenimiento || !payload.detalle_cambio) {
    return badRequest(res, 'id_mantenimiento y detalle_cambio son obligatorios')
  }

  const parsedDate = payload.fecha_cambio ? new Date(payload.fecha_cambio) : new Date()
  if (Number.isNaN(parsedDate.getTime())) return badRequest(res, 'fecha_cambio no es una fecha valida')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureCiHistoryTable(pool)

    const exists = await existsById(pool.request(), 'Elementos_Configuracion', 'id_ci', 'id_ci', id_ci)
    if (!exists) return res.status(404).json({ message: 'El CI no existe' })

    const mantenimientoResult = await pool
      .request()
      .input('id_mantenimiento',   sql.Char(10),   payload.id_mantenimiento)
      .input('id_ci',              sql.VarChar(25), id_ci)
      .input('id_tecnico_asignado', sql.Char(15),   req.user?.sub)
      .query(`
        SELECT id_mantenimiento, tipo_mantenimiento
        FROM Mantenimientos
        WHERE id_mantenimiento = @id_mantenimiento
          AND id_ci = @id_ci
          AND id_tecnico_asignado = @id_tecnico_asignado
      `)

    const mantenimiento = mantenimientoResult.recordset?.[0]
    if (!mantenimiento) {
      return res.status(404).json({ message: 'No se encontro el mantenimiento asignado para este CI' })
    }

    const tipoMantenimiento  = toTrimmedString(mantenimiento.tipo_mantenimiento)
    const origen             = tipoMantenimiento.toLowerCase() === 'preventivo' ? 'Preventivo' : 'Correctivo'
    const numeroTransaccion  = `${origen === 'Preventivo' ? 'PRE' : 'COR'}-${payload.id_mantenimiento}`

    await pool
      .request()
      .input('id_ci',               sql.VarChar(25),  id_ci)
      .input('id_mantenimiento',    sql.Char(10),     payload.id_mantenimiento)
      .input('fecha_cambio',        sql.DateTime,     parsedDate)
      .input('numero_transaccion',  sql.VarChar(40),  numeroTransaccion)
      .input('origen_transaccion',  sql.VarChar(40),  origen)
      .input('tecnico',             sql.VarChar(120), toTrimmedString(req.user?.sub))
      .input('detalle_cambio',      sql.VarChar(500), payload.detalle_cambio)
      .query(`
        INSERT INTO Historial_Cambios_CI (
          id_ci, id_mantenimiento, fecha_cambio,
          numero_transaccion, origen_transaccion, tecnico, detalle_cambio
        ) VALUES (
          @id_ci, @id_mantenimiento, @fecha_cambio,
          @numero_transaccion, @origen_transaccion, @tecnico, @detalle_cambio
        )
      `)

    return res.status(201).json({ message: 'Cambio registrado correctamente' })
  } catch (err) {
    console.error('Error en POST /api/ci/:id_ci/historial-cambios:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

module.exports = router
