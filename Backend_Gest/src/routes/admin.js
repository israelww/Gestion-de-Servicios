const express = require('express')
const sql     = require('mssql')

const router = express.Router()
const { getPool }             = require('../config/db')
const { requireAdmin }        = require('../middleware/auth')
const { toTrimmedString, badRequest, existsById } = require('../helpers/sqlHelpers')
const { ensureWorkflowColumns, ensureCiHistoryTable } = require('../db/schema')
const { findNextMaintenanceId } = require('../helpers/idGenerators')
const { autoAssignTecnico }   = require('../engine/autoAssign')
const { ROLE_TECNICO }        = require('../constants')

// GET /api/admin/reportes/pendientes  (solo Pendiente — compatibilidad)
router.get('/admin/reportes/pendientes', ...requireAdmin, async (_req, res) => {
  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    const result = await pool.request().query(`
      SELECT
        m.id_mantenimiento AS id_reporte,
        m.id_ci,
        m.descripcion_tarea AS descripcion_falla,
        m.fecha_mantenimiento AS fecha_reporte,
        COALESCE(m.estado, 'Pendiente') AS estado,
        COALESCE(srv.prioridad, 'Sin priorizar') AS prioridad,
        e.nombre_edificio, s.nombre_sublocalizacion,
        ci.nombre_equipo, ci.numero_serie,
        m.id_area, a.nombre_area,
        u.id_usuario AS id_usuario_reporta,
        u.nombre_completo AS usuario_reporta
      FROM Mantenimientos m
      JOIN Elementos_Configuracion ci ON ci.id_ci = m.id_ci
      JOIN Sublocalizaciones s ON s.id_sublocalizacion = ci.id_sublocalizacion
      JOIN Edificios e ON e.id_edificio = s.id_edificio
      LEFT JOIN Servicios srv ON srv.id_servicio = m.id_servicio
      LEFT JOIN Areas a ON a.id_area = m.id_area
      LEFT JOIN Usuarios u ON u.id_usuario = m.id_usuario_reporta
      WHERE COALESCE(m.estado, 'Pendiente') = 'Pendiente'
      ORDER BY m.fecha_mantenimiento ASC, m.id_mantenimiento ASC
    `)
    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/admin/reportes/pendientes:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// GET /api/admin/reportes/todos  — todos los estados para la bandeja del admin
router.get('/admin/reportes/todos', ...requireAdmin, async (_req, res) => {
  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    const result = await pool.request().query(`
      SELECT
        m.id_mantenimiento AS id_reporte,
        m.id_ci,
        m.descripcion_tarea AS descripcion_falla,
        m.fecha_mantenimiento AS fecha_reporte,
        COALESCE(m.estado, 'Pendiente') AS estado,
        COALESCE(srv.prioridad, 'Sin priorizar') AS prioridad,
        e.nombre_edificio, s.nombre_sublocalizacion,
        ci.nombre_equipo, ci.numero_serie,
        m.id_area, a.nombre_area,
        m.id_tecnico_asignado,
        t.nombre_completo AS tecnico_asignado,
        u.id_usuario AS id_usuario_reporta,
        u.nombre_completo AS usuario_reporta
      FROM Mantenimientos m
      JOIN Elementos_Configuracion ci ON ci.id_ci = m.id_ci
      JOIN Sublocalizaciones s ON s.id_sublocalizacion = ci.id_sublocalizacion
      JOIN Edificios e ON e.id_edificio = s.id_edificio
      LEFT JOIN Servicios srv ON srv.id_servicio = m.id_servicio
      LEFT JOIN Areas a ON a.id_area = m.id_area
      LEFT JOIN Usuarios u ON u.id_usuario = m.id_usuario_reporta
      LEFT JOIN Usuarios t ON t.id_usuario = m.id_tecnico_asignado
      ORDER BY
        CASE COALESCE(m.estado, 'Pendiente')
          WHEN 'Pendiente'   THEN 1
          WHEN 'Asignado'    THEN 2
          WHEN 'En Proceso'  THEN 3
          WHEN 'Liberado'    THEN 4
          ELSE 5
        END,
        m.fecha_mantenimiento ASC
    `)
    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/admin/reportes/todos:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// GET /api/admin/reportes/:id_reporte  — detalle de ticket para admin
router.get('/admin/reportes/:id_reporte', ...requireAdmin, async (req, res) => {
  const id_reporte = toTrimmedString(req.params?.id_reporte)
  if (!id_reporte) return badRequest(res, 'El id_reporte es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    const result = await pool
      .request()
      .input('id_reporte', sql.Char(10), id_reporte)
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
          t.nombre_completo AS tecnico_asignado
        FROM Mantenimientos m
        JOIN Elementos_Configuracion ci ON ci.id_ci = m.id_ci
        JOIN Sublocalizaciones s ON s.id_sublocalizacion = ci.id_sublocalizacion
        JOIN Edificios e ON e.id_edificio = s.id_edificio
        LEFT JOIN Servicios srv ON srv.id_servicio = m.id_servicio
        LEFT JOIN Areas a ON a.id_area = m.id_area
        LEFT JOIN Usuarios u ON u.id_usuario = m.id_usuario_reporta
        LEFT JOIN Usuarios t ON t.id_usuario = m.id_tecnico_asignado
        WHERE m.id_mantenimiento = @id_reporte
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
        nombre: row.nombre_servicio || row.id_servicio,
        descripcion: null,
        tiempo_servicio: row.tiempo_servicio,
        tiempo_estimado_minutos: row.tiempo_servicio,
        prioridad: row.prioridad,
      }]
    }

    row.servicios_realizados = serviciosRealizados
    row.total_minutos_estimados = serviciosRealizados.reduce((sum, s) => sum + (Number(s.tiempo_servicio) || 0), 0)

    return res.status(200).json(row)
  } catch (err) {
    console.error('Error en GET /api/admin/reportes/:id_reporte:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// PUT /api/admin/reportes/:id_reporte/liberar
router.put('/admin/reportes/:id_reporte/liberar', ...requireAdmin, async (req, res) => {
  const id_reporte = toTrimmedString(req.params?.id_reporte)
  if (!id_reporte) return badRequest(res, 'El id_reporte es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    const result = await pool
      .request()
      .input('id_reporte', sql.Char(10), id_reporte)
      .input('fecha_cierre', sql.DateTime, new Date())
      .query(`
        UPDATE Mantenimientos
        SET
          estado = 'Liberado',
          fecha_cierre = COALESCE(fecha_cierre, @fecha_cierre)
        WHERE id_mantenimiento = @id_reporte
          AND COALESCE(estado, 'Pendiente') IN ('Terminado', 'Cerrado')
      `)

    if (!result.rowsAffected?.[0]) {
      return res.status(409).json({ message: 'Solo se pueden liberar tickets en estado Terminado o Cerrado' })
    }

    return res.status(200).json({ message: 'Ticket liberado correctamente' })
  } catch (err) {
    console.error('Error en PUT /api/admin/reportes/:id_reporte/liberar:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// PUT /api/admin/reportes/:id_reporte/asignacion
router.put('/admin/reportes/:id_reporte/asignacion', ...requireAdmin, async (req, res) => {
  const id_reporte          = toTrimmedString(req.params?.id_reporte)
  const id_tecnico_asignado = toTrimmedString(req.body?.id_tecnico_asignado)

  if (!id_reporte || !id_tecnico_asignado) {
    return badRequest(res, 'id_reporte e id_tecnico_asignado son obligatorios')
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    const tecnicoResult = await pool
      .request()
      .input('id_tecnico_asignado', sql.Char(15), id_tecnico_asignado)
      .query(`
        SELECT u.id_usuario
        FROM Usuarios u
        JOIN Roles r ON r.id_rol = u.id_rol
        WHERE u.id_usuario = @id_tecnico_asignado
          AND r.nombre_rol = '${ROLE_TECNICO}'
      `)
    if (!tecnicoResult.recordset?.[0]) {
      return res.status(404).json({ message: 'El tecnico seleccionado no existe' })
    }

    const updateResult = await pool
      .request()
      .input('id_reporte',           sql.Char(10),  id_reporte)
      .input('id_tecnico_asignado',  sql.Char(15),  id_tecnico_asignado)
      .input('fecha_asignacion',     sql.DateTime,  new Date())
      .query(`
        UPDATE Mantenimientos
        SET id_tecnico_asignado = @id_tecnico_asignado,
            fecha_asignacion = COALESCE(fecha_asignacion, @fecha_asignacion),
            estado = 'Asignado'
        WHERE id_mantenimiento = @id_reporte
      `)

    if (!updateResult.rowsAffected?.[0]) {
      return res.status(404).json({ message: 'Reporte no encontrado' })
    }
    return res.status(200).json({ message: 'Reporte asignado correctamente' })
  } catch (err) {
    console.error('Error en PUT /api/admin/reportes/:id_reporte/asignacion:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// POST /api/admin/reportes/:id_reporte/auto-asignar
router.post('/admin/reportes/:id_reporte/auto-asignar', ...requireAdmin, async (req, res) => {
  const id_reporte = toTrimmedString(req.params?.id_reporte)
  if (!id_reporte) return badRequest(res, 'El id_reporte es obligatorio')

  const pool = await getPool()
  if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

  await ensureWorkflowColumns(pool)

  const ticketRes = await pool
    .request()
    .input('id_reporte', sql.Char(10), id_reporte)
    .query(`
      SELECT m.id_area, m.estado, s.id_edificio
      FROM Mantenimientos m
      JOIN Elementos_Configuracion ci ON ci.id_ci = m.id_ci
      JOIN Sublocalizaciones s ON s.id_sublocalizacion = ci.id_sublocalizacion
      WHERE m.id_mantenimiento = @id_reporte
    `)

  const ticket = ticketRes.recordset?.[0]
  if (!ticket) return res.status(404).json({ message: 'Reporte no encontrado' })
  if (!ticket.id_area) return res.status(409).json({ message: 'El reporte no tiene área asignada. Actualiza el área antes de auto-asignar.' })
  if (!['Pendiente', 'Asignado'].includes(ticket.estado)) {
    return res.status(409).json({ message: `No se puede re-asignar un ticket en estado '${ticket.estado}'` })
  }

  const transaction = new sql.Transaction(pool)
  let transactionFinished = false
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)

    const asignacion = await autoAssignTecnico(transaction, id_reporte, ticket.id_area, ticket.id_edificio, new Date())

    await transaction.commit()
    transactionFinished = true

    if (!asignacion.asignado) {
      return res.status(200).json({ message: 'No se encontró técnico disponible.', asignado: false, razon: asignacion.razon })
    }
    return res.status(200).json({
      message: `Ticket asignado automaticamente al tecnico ${asignacion.id_tecnico}`,
      asignado:   true,
      id_tecnico: asignacion.id_tecnico,
      score:      asignacion.score,
    })
  } catch (err) {
    if (!transactionFinished) { try { await transaction.rollback() } catch {} }
    console.error('Error en POST /api/admin/reportes/:id_reporte/auto-asignar:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// POST /api/admin/ci/:id_ci/ticket-preventivo
router.post('/admin/ci/:id_ci/ticket-preventivo', ...requireAdmin, async (req, res) => {
  const id_ci            = toTrimmedString(req.params?.id_ci)
  const descripcion_tarea = toTrimmedString(req.body?.descripcion_tarea)

  if (!id_ci || !descripcion_tarea) {
    return badRequest(res, 'id_ci y descripcion_tarea son obligatorios')
  }

  const pool = await getPool()
  if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

  await ensureWorkflowColumns(pool)
  await ensureCiHistoryTable(pool)

  const transaction = new sql.Transaction(pool)
  let transactionFinished = false

  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)

    const exists = await existsById(new sql.Request(transaction), 'Elementos_Configuracion', 'id_ci', 'id_ci', id_ci)
    if (!exists) { await transaction.rollback(); return res.status(404).json({ message: 'El CI no existe' }) }

    const srvPick = await new sql.Request(transaction).query(`SELECT TOP 1 id_servicio FROM Servicios ORDER BY id_servicio`)
    const id_servicio = srvPick.recordset?.[0]?.id_servicio
    if (!id_servicio) {
      await transaction.rollback()
      return res.status(409).json({ message: 'No hay servicios en el catalogo; crea al menos uno desde el administrador' })
    }

    const id_mantenimiento = await findNextMaintenanceId(new sql.Request(transaction))

    await new sql.Request(transaction)
      .input('id_mantenimiento',   sql.Char(10),         id_mantenimiento)
      .input('id_ci',              sql.VarChar(50),      id_ci)
      .input('id_servicio',        sql.Char(10),         id_servicio)
      .input('fecha_mantenimiento', sql.DateTime,         new Date())
      .input('tipo_mantenimiento', sql.VarChar(50),      'Preventivo')
      .input('descripcion_tarea',  sql.VarChar(sql.MAX), descripcion_tarea)
      .input('id_usuario_reporta', sql.Char(15),         req.user?.sub)
      .input('estado',             sql.VarChar(20),      'Pendiente')
      .query(`
        INSERT INTO Mantenimientos (
          id_mantenimiento, id_ci, id_servicio, fecha_mantenimiento,
          tipo_mantenimiento, descripcion_tarea, id_usuario_reporta, estado
        ) VALUES (
          @id_mantenimiento, @id_ci, @id_servicio, @fecha_mantenimiento,
          @tipo_mantenimiento, @descripcion_tarea, @id_usuario_reporta, @estado
        )
      `)

    await new sql.Request(transaction)
      .input('id_ci',               sql.VarChar(50),  id_ci)
      .input('id_mantenimiento',    sql.Char(10),     id_mantenimiento)
      .input('fecha_cambio',        sql.DateTime,     new Date())
      .input('numero_transaccion',  sql.VarChar(40),  `PRE-${id_mantenimiento}`)
      .input('origen_transaccion',  sql.VarChar(40),  'Preventivo')
      .input('tecnico',             sql.VarChar(120), toTrimmedString(req.user?.sub))
      .input('detalle_cambio',      sql.VarChar(500), `Ticket preventivo creado: ${descripcion_tarea}`)
      .query(`
        INSERT INTO Historial_Cambios_CI (
          id_ci, id_mantenimiento, fecha_cambio,
          numero_transaccion, origen_transaccion, tecnico, detalle_cambio
        ) VALUES (
          @id_ci, @id_mantenimiento, @fecha_cambio,
          @numero_transaccion, @origen_transaccion, @tecnico, @detalle_cambio
        )
      `)

    await transaction.commit()
    transactionFinished = true

    return res.status(201).json({ message: 'Ticket preventivo creado correctamente', id_mantenimiento })
  } catch (err) {
    if (!transactionFinished) { try { await transaction.rollback() } catch {} }
    console.error('Error en POST /api/admin/ci/:id_ci/ticket-preventivo:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

module.exports = router
