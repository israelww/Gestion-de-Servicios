const express = require('express')
const sql     = require('mssql')

const router = express.Router()
const { getPool }                    = require('../config/db')
const { requireAnyAuth }             = require('../middleware/auth')
const { toTrimmedString, badRequest }= require('../helpers/sqlHelpers')
const { ensureWorkflowColumns }      = require('../db/schema')
const { findNextMaintenanceId }      = require('../helpers/idGenerators')
const { autoAssignTecnico }          = require('../engine/autoAssign')

// ─── Helpers internos ─────────────────────────────────────────────────────────

function normalizeServiciosSeleccionados(raw) {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map((item) => toTrimmedString(item)).filter(Boolean))]
}

async function getServiciosByIds(requestFactory, ids) {
  if (!ids.length) return []
  const request = requestFactory()
  ids.forEach((id, index) => request.input(`srv${index}`, sql.Char(10), id))
  const params = ids.map((_, index) => `@srv${index}`).join(', ')
  const result = await request.query(`SELECT id_servicio FROM Servicios WHERE id_servicio IN (${params})`)
  return result.recordset || []
}

async function syncMantenimientoServicios(transaction, idMantenimiento, serviciosSeleccionados) {
  const ids   = normalizeServiciosSeleccionados(serviciosSeleccionados)
  const found = await getServiciosByIds(() => new sql.Request(transaction), ids)
  if (found.length !== ids.length) {
    const foundSet = new Set(found.map((row) => String(row.id_servicio).trim()))
    const missing  = ids.filter((id) => !foundSet.has(id))
    const error    = new Error(`Servicios no encontrados: ${missing.join(', ')}`)
    error.statusCode = 400
    throw error
  }

  await new sql.Request(transaction)
    .input('id_mantenimiento', sql.Char(10), idMantenimiento)
    .query(`DELETE FROM Mantenimiento_Servicios WHERE id_mantenimiento = @id_mantenimiento`)

  for (const idServicio of ids) {
    await new sql.Request(transaction)
      .input('id_mantenimiento', sql.Char(10), idMantenimiento)
      .input('id_servicio',      sql.Char(10), idServicio)
      .query(`INSERT INTO Mantenimiento_Servicios (id_mantenimiento, id_servicio) VALUES (@id_mantenimiento, @id_servicio)`)
  }

  await new sql.Request(transaction)
    .input('id_mantenimiento', sql.Char(10), idMantenimiento)
    .input('id_servicio',      sql.Char(10), ids[0] || null)
    .query(`UPDATE Mantenimientos SET id_servicio = @id_servicio WHERE id_mantenimiento = @id_mantenimiento`)

  return ids
}

// ─── Rutas ────────────────────────────────────────────────────────────────────

// POST /api/reportes
router.post('/reportes', ...requireAnyAuth, async (req, res) => {
  const payload = {
    id_edificio:        toTrimmedString(req.body?.id_edificio),
    id_sublocalizacion: toTrimmedString(req.body?.id_sublocalizacion),
    id_ci:              toTrimmedString(req.body?.id_ci),
    id_area:            toTrimmedString(req.body?.id_area),
    descripcion_falla:  toTrimmedString(req.body?.descripcion_falla),
  }

  if (!payload.id_edificio || !payload.id_sublocalizacion || !payload.id_ci || !payload.id_area || !payload.descripcion_falla) {
    return badRequest(res, 'id_edificio, id_sublocalizacion, id_ci, id_area y descripcion_falla son obligatorios')
  }

  const pool = await getPool()
  if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

  await ensureWorkflowColumns(pool)

  const transaction = new sql.Transaction(pool)
  let transactionFinished = false

  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
    const request = new sql.Request(transaction)

    const ciCheck = await request
      .input('id_ci',              sql.VarChar(25), payload.id_ci)
      .input('id_sublocalizacion', sql.Char(10),    payload.id_sublocalizacion)
      .input('id_edificio',        sql.Char(10),    payload.id_edificio)
      .query(`
        SELECT ci.id_ci
        FROM Elementos_Configuracion ci
        JOIN Sublocalizaciones s ON s.id_sublocalizacion = ci.id_sublocalizacion
        WHERE ci.id_ci = @id_ci
          AND s.id_sublocalizacion = @id_sublocalizacion
          AND s.id_edificio = @id_edificio
      `)

    if (!ciCheck.recordset?.[0]) {
      await transaction.rollback()
      return res.status(409).json({ message: 'El CI no pertenece a la sublocalizacion y edificio seleccionados' })
    }

    const areaCheck = await new sql.Request(transaction)
      .input('id_area', sql.Char(10), payload.id_area)
      .query(`SELECT id_area FROM Areas WHERE id_area = @id_area`)
    if (!areaCheck.recordset?.[0]) {
      await transaction.rollback()
      return res.status(409).json({ message: 'El area seleccionada no existe' })
    }
    const id_area = payload.id_area

    const id_mantenimiento = await findNextMaintenanceId(new sql.Request(transaction))

    await new sql.Request(transaction)
      .input('id_mantenimiento',   sql.Char(10),         id_mantenimiento)
      .input('id_ci',              sql.VarChar(25),      payload.id_ci)
      .input('id_area',            sql.Char(10),         id_area)
      .input('fecha_mantenimiento', sql.DateTime,         new Date())
      .input('tipo_mantenimiento', sql.VarChar(50),      'Correctivo')
      .input('descripcion_tarea',  sql.VarChar(sql.MAX), payload.descripcion_falla)
      .input('id_usuario_reporta', sql.Char(15),         req.user?.sub)
      .input('estado',             sql.VarChar(20),      'Pendiente')
      .query(`
        INSERT INTO Mantenimientos (
          id_mantenimiento, id_ci, id_area, fecha_mantenimiento,
          tipo_mantenimiento, descripcion_tarea, id_usuario_reporta, estado
        ) VALUES (
          @id_mantenimiento, @id_ci, @id_area, @fecha_mantenimiento,
          @tipo_mantenimiento, @descripcion_tarea, @id_usuario_reporta, @estado
        )
      `)

    const edificioRes = await new sql.Request(transaction)
      .input('id_sublocalizacion', sql.Char(10), payload.id_sublocalizacion)
      .query(`SELECT id_edificio FROM Sublocalizaciones WHERE id_sublocalizacion = @id_sublocalizacion`)
    const id_edificioAsign = edificioRes.recordset?.[0]?.id_edificio || payload.id_edificio

    let asignacion = { asignado: false, razon: 'error_interno' }
    try {
      asignacion = await autoAssignTecnico(transaction, id_mantenimiento, id_area, id_edificioAsign, new Date())
    } catch (assignErr) {
      console.warn('Motor de asignación falló (ticket queda Pendiente):', assignErr?.message)
      asignacion = { asignado: false, razon: 'error_motor' }
    }

    await transaction.commit()
    transactionFinished = true

    return res.status(201).json({
      message: asignacion.asignado
        ? `Reporte creado y asignado automaticamente al tecnico ${asignacion.id_tecnico}`
        : 'Reporte creado correctamente. Pendiente de asignacion manual.',
      id_reporte:        id_mantenimiento,
      estado:            asignacion.asignado ? 'Asignado' : 'Pendiente',
      asignado:          asignacion.asignado,
      id_tecnico:        asignacion.id_tecnico || null,
      razon_no_asignado: asignacion.asignado ? undefined : asignacion.razon,
    })
  } catch (err) {
    if (!transactionFinished) { try { await transaction.rollback() } catch {} }
    console.error('Error en POST /api/reportes:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// GET /api/reportes
router.get('/reportes', ...requireAnyAuth, async (req, res) => {
  const userId = req.user?.sub
  if (!userId) return res.status(401).json({ message: 'No autorizado' })

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    const result = await pool
      .request()
      .input('id_usuario_reporta', sql.Char(15), userId)
      .query(`
        SELECT
          m.id_mantenimiento AS id_reporte,
          m.id_ci, m.tipo_mantenimiento,
          m.descripcion_tarea AS descripcion_falla,
          m.descripcion_solucion, m.fecha_cierre,
          m.calificacion_servicio, m.comentario_valoracion, m.fecha_valoracion,
          m.fecha_mantenimiento AS fecha_reporte,
          COALESCE(m.estado, 'Pendiente') AS estado,
          COALESCE(srv.prioridad, 'Sin priorizar') AS prioridad,
          e.nombre_edificio, s.nombre_sublocalizacion,
          ci.nombre_equipo, ci.numero_serie,
          m.id_area, a.nombre_area,
          t.nombre_completo AS tecnico_asignado
        FROM Mantenimientos m
        JOIN Elementos_Configuracion ci ON ci.id_ci = m.id_ci
        JOIN Sublocalizaciones s ON s.id_sublocalizacion = ci.id_sublocalizacion
        JOIN Edificios e ON e.id_edificio = s.id_edificio
        LEFT JOIN Servicios srv ON srv.id_servicio = m.id_servicio
        LEFT JOIN Areas a ON a.id_area = m.id_area
        LEFT JOIN Usuarios t ON t.id_usuario = m.id_tecnico_asignado
        WHERE m.id_usuario_reporta = @id_usuario_reporta
        ORDER BY m.fecha_mantenimiento DESC, m.id_mantenimiento DESC
      `)
    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/reportes:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// GET /api/reportes/:id_reporte
router.get('/reportes/:id_reporte', ...requireAnyAuth, async (req, res) => {
  const id_reporte = toTrimmedString(req.params?.id_reporte)
  const userId     = req.user?.sub

  if (!userId) return res.status(401).json({ message: 'No autorizado' })
  if (!id_reporte) return badRequest(res, 'El id_reporte es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    const result = await pool
      .request()
      .input('id_reporte',        sql.Char(10),  id_reporte)
      .input('id_usuario_reporta', sql.Char(15),  userId)
      .query(`
        SELECT
          m.id_mantenimiento AS id_reporte,
          e.id_edificio, s.id_sublocalizacion, m.id_ci,
          m.tipo_mantenimiento,
          m.descripcion_tarea AS descripcion_falla,
          m.diagnostico_inicial, m.descripcion_solucion,
          m.fecha_mantenimiento AS fecha_reporte,
          m.fecha_asignacion, m.fecha_terminado, m.fecha_cierre, m.id_servicio,
          COALESCE(m.estado, 'Pendiente') AS estado,
          COALESCE(srv.prioridad, 'Sin priorizar') AS prioridad,
          srv.nombre AS nombre_servicio, srv.tiempo_servicio,
          e.nombre_edificio, s.nombre_sublocalizacion,
          ci.nombre_equipo, ci.numero_serie,
          m.id_area, a.nombre_area,
          u.nombre_completo AS usuario_reporta,
          t.nombre_completo AS tecnico_asignado,
          m.calificacion_servicio, m.comentario_valoracion, m.fecha_valoracion
        FROM Mantenimientos m
        JOIN Elementos_Configuracion ci ON ci.id_ci = m.id_ci
        JOIN Sublocalizaciones s ON s.id_sublocalizacion = ci.id_sublocalizacion
        JOIN Edificios e ON e.id_edificio = s.id_edificio
        LEFT JOIN Servicios srv ON srv.id_servicio = m.id_servicio
        LEFT JOIN Areas a ON a.id_area = m.id_area
        LEFT JOIN Usuarios u ON u.id_usuario = m.id_usuario_reporta
        LEFT JOIN Usuarios t ON t.id_usuario = m.id_tecnico_asignado
        WHERE m.id_mantenimiento = @id_reporte
          AND m.id_usuario_reporta = @id_usuario_reporta
      `)

    const row = result.recordset?.[0]
    if (!row) return res.status(404).json({ message: 'Reporte no encontrado' })

    const serviciosResult = await pool
      .request()
      .input('id_reporte', sql.Char(10), id_reporte)
      .query(`
        SELECT
          srv.id_servicio, srv.nombre, srv.descripcion,
          srv.tiempo_servicio, srv.tiempo_servicio AS tiempo_estimado_minutos, srv.prioridad
        FROM Mantenimiento_Servicios ms
        JOIN Servicios srv ON srv.id_servicio = ms.id_servicio
        WHERE ms.id_mantenimiento = @id_reporte
        ORDER BY srv.nombre
      `)
    let serviciosRealizados = serviciosResult.recordset || []
    if (!serviciosRealizados.length && row.id_servicio) {
      serviciosRealizados = [{
        id_servicio: row.id_servicio,
        nombre:      row.nombre_servicio || row.id_servicio,
        descripcion: null,
        tiempo_servicio:        row.tiempo_servicio,
        tiempo_estimado_minutos: row.tiempo_servicio,
        prioridad: row.prioridad,
      }]
    }

    row.servicios_realizados    = serviciosRealizados
    row.total_minutos_estimados = serviciosRealizados.reduce((sum, s) => sum + (Number(s.tiempo_servicio) || 0), 0)

    return res.status(200).json(row)
  } catch (err) {
    console.error('Error en GET /api/reportes/:id_reporte:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// PUT /api/reportes/:id_reporte/valoracion
router.put('/reportes/:id_reporte/valoracion', ...requireAnyAuth, async (req, res) => {
  const id_reporte  = toTrimmedString(req.params?.id_reporte)
  const userId      = req.user?.sub
  const calificacion = Number.parseInt(String(req.body?.calificacion_servicio ?? ''), 10)
  const comentario   = toTrimmedString(req.body?.comentario_valoracion)

  if (!userId) return res.status(401).json({ message: 'No autorizado' })
  if (!id_reporte) return badRequest(res, 'El id_reporte es obligatorio')
  if (!Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) {
    return badRequest(res, 'calificacion_servicio debe estar entre 1 y 5')
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    const result = await pool
      .request()
      .input('id_reporte',           sql.Char(10),  id_reporte)
      .input('id_usuario_reporta',   sql.Char(15),  userId)
      .input('calificacion_servicio', sql.TinyInt,  calificacion)
      .input('comentario_valoracion', sql.VarChar(500), comentario || null)
      .input('fecha_valoracion',     sql.DateTime,  new Date())
      .query(`
        UPDATE Mantenimientos
        SET
          calificacion_servicio = @calificacion_servicio,
          comentario_valoracion = @comentario_valoracion,
          fecha_valoracion = @fecha_valoracion,
          estado = 'Liberado'
        WHERE id_mantenimiento = @id_reporte
          AND id_usuario_reporta = @id_usuario_reporta
          AND COALESCE(estado, 'Pendiente') IN ('Terminado', 'Cerrado')
      `)

    if (!result.rowsAffected?.[0]) {
      return res.status(404).json({ message: 'Reporte no encontrado, no es tuyo o aun no esta cerrado' })
    }

    const ciResult = await pool
      .request()
      .input('id_reporte', sql.Char(10), id_reporte)
      .query(`SELECT id_ci FROM Mantenimientos WHERE id_mantenimiento = @id_reporte`)

    if (ciResult.recordset?.[0]?.id_ci) {
      await pool
        .request()
        .input('id_ci', sql.VarChar(25), ciResult.recordset[0].id_ci)
        .query(`UPDATE Elementos_Configuracion SET estado = 'Activo' WHERE id_ci = @id_ci`)
    }

    return res.status(200).json({ message: 'Evaluacion completada y folio liberado correctamente' })
  } catch (err) {
    console.error('Error en PUT /api/reportes/:id_reporte/valoracion:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

module.exports = router
