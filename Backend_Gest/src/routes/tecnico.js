const express = require('express')
const sql     = require('mssql')

const router = express.Router()
const { getPool }            = require('../config/db')
const { requireTecnico }     = require('../middleware/auth')
const { toTrimmedString, badRequest } = require('../helpers/sqlHelpers')
const { ensureWorkflowColumns }       = require('../db/schema')

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

// GET /api/tecnico/servicios
router.get('/tecnico/servicios', ...requireTecnico, async (req, res) => {
  const tecnicoId = req.user?.sub
  if (!tecnicoId) return res.status(401).json({ message: 'No autorizado' })

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    const result = await pool
      .request()
      .input('id_tecnico_asignado', sql.Char(15), tecnicoId)
      .query(`
        SELECT
          m.id_mantenimiento AS id_reporte,
          m.id_ci, m.tipo_mantenimiento,
          m.descripcion_tarea AS descripcion_falla,
          m.diagnostico_inicial, m.descripcion_solucion,
          m.fecha_mantenimiento AS fecha_reporte,
          m.fecha_asignacion, m.fecha_terminado, m.fecha_cierre,
          COALESCE(m.estado, 'Pendiente') AS estado,
          COALESCE(srv.prioridad, 'Sin priorizar') AS prioridad,
          srv.tiempo_servicio,
          e.nombre_edificio, s.nombre_sublocalizacion,
          ci.nombre_equipo, ci.numero_serie,
          u.nombre_completo AS usuario_reporta
        FROM Mantenimientos m
        JOIN Elementos_Configuracion ci ON ci.id_ci = m.id_ci
        JOIN Sublocalizaciones s ON s.id_sublocalizacion = ci.id_sublocalizacion
        JOIN Edificios e ON e.id_edificio = s.id_edificio
        LEFT JOIN Servicios srv ON srv.id_servicio = m.id_servicio
        LEFT JOIN Usuarios u ON u.id_usuario = m.id_usuario_reporta
        WHERE m.id_tecnico_asignado = @id_tecnico_asignado
        ORDER BY m.fecha_mantenimiento DESC, m.id_mantenimiento DESC
      `)
    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/tecnico/servicios:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// GET /api/tecnico/servicios/:id_reporte/hoja-trabajo
router.get('/tecnico/servicios/:id_reporte/hoja-trabajo', ...requireTecnico, async (req, res) => {
  const tecnicoId  = req.user?.sub
  const id_reporte = toTrimmedString(req.params?.id_reporte)

  if (!tecnicoId) return res.status(401).json({ message: 'No autorizado' })
  if (!id_reporte) return badRequest(res, 'El id_reporte es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    const ticketResult = await pool
      .request()
      .input('id_reporte',           sql.Char(10),  id_reporte)
      .input('id_tecnico_asignado',  sql.Char(15),  tecnicoId)
      .query(`
        SELECT
          m.id_mantenimiento AS id_reporte,
          m.id_ci, m.tipo_mantenimiento,
          m.descripcion_tarea AS descripcion_falla,
          m.diagnostico_inicial, m.descripcion_solucion,
          m.fecha_mantenimiento AS fecha_reporte,
          m.fecha_asignacion, m.fecha_terminado, m.fecha_cierre, m.id_servicio,
          COALESCE(m.estado, 'Pendiente') AS estado,
          COALESCE(srv.prioridad, 'Sin priorizar') AS prioridad,
          srv.nombre AS nombre_servicio, srv.tiempo_servicio,
          e.nombre_edificio, s.nombre_sublocalizacion,
          ci.nombre_equipo, ci.numero_serie,
          u.nombre_completo AS usuario_reporta,
          m.id_area, a.nombre_area
        FROM Mantenimientos m
        JOIN Elementos_Configuracion ci ON ci.id_ci = m.id_ci
        JOIN Sublocalizaciones s ON s.id_sublocalizacion = ci.id_sublocalizacion
        JOIN Edificios e ON e.id_edificio = s.id_edificio
        LEFT JOIN Servicios srv ON srv.id_servicio = m.id_servicio
        LEFT JOIN Areas a ON a.id_area = m.id_area
        LEFT JOIN Usuarios u ON u.id_usuario = m.id_usuario_reporta
        WHERE m.id_mantenimiento = @id_reporte
          AND m.id_tecnico_asignado = @id_tecnico_asignado
      `)

    const ticket = ticketResult.recordset?.[0]
    if (!ticket) {
      return res.status(404).json({ message: 'Servicio no encontrado o no asignado al tecnico actual' })
    }

    const catalogoResult = await pool.request().query(`
      SELECT
        srv.id_servicio, srv.nombre, srv.descripcion,
        srv.tiempo_servicio, srv.tiempo_servicio AS tiempo_estimado_minutos, srv.prioridad
      FROM Servicios srv
      ORDER BY srv.nombre
    `)

    const selectedResult = await pool
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

    let serviciosSeleccionados = selectedResult.recordset || []
    if (!serviciosSeleccionados.length && ticket.id_servicio) {
      serviciosSeleccionados = (catalogoResult.recordset || []).filter(
        (servicio) => servicio.id_servicio === ticket.id_servicio
      )
    }
    const total = serviciosSeleccionados.reduce((sum, s) => sum + (Number(s.tiempo_servicio) || 0), 0)

    return res.status(200).json({
      ticket,
      catalogo_servicios:    catalogoResult.recordset || [],
      servicios_seleccionados: serviciosSeleccionados,
      total_minutos_estimados: total,
    })
  } catch (err) {
    console.error('Error en GET /api/tecnico/servicios/:id_reporte/hoja-trabajo:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// PUT /api/tecnico/servicios/:id_reporte/hoja-trabajo
router.put('/tecnico/servicios/:id_reporte/hoja-trabajo', ...requireTecnico, async (req, res) => {
  const tecnicoId            = req.user?.sub
  const id_reporte           = toTrimmedString(req.params?.id_reporte)
  const diagnostico_inicial  = toTrimmedString(req.body?.diagnostico_inicial)
  const serviciosSeleccionados = normalizeServiciosSeleccionados(req.body?.servicios_seleccionados)

  if (!tecnicoId) return res.status(401).json({ message: 'No autorizado' })
  if (!id_reporte || !diagnostico_inicial) return badRequest(res, 'id_reporte y diagnostico_inicial son obligatorios')

  const pool = await getPool()
  if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

  await ensureWorkflowColumns(pool)

  const transaction = new sql.Transaction(pool)
  let transactionFinished = false
  try {
    await transaction.begin()

    const updateResult = await new sql.Request(transaction)
      .input('id_reporte',           sql.Char(10),    id_reporte)
      .input('id_tecnico_asignado',  sql.Char(15),    tecnicoId)
      .input('diagnostico_inicial',  sql.VarChar(1000), diagnostico_inicial)
      .query(`
        UPDATE Mantenimientos
        SET diagnostico_inicial = @diagnostico_inicial
        WHERE id_mantenimiento = @id_reporte
          AND id_tecnico_asignado = @id_tecnico_asignado
      `)

    if (!updateResult.rowsAffected?.[0]) {
      await transaction.rollback()
      transactionFinished = true
      return res.status(404).json({ message: 'Servicio no encontrado o no asignado al tecnico actual' })
    }

    const ids = await syncMantenimientoServicios(transaction, id_reporte, serviciosSeleccionados)
    await transaction.commit()
    transactionFinished = true

    return res.status(200).json({ message: 'Hoja de trabajo guardada correctamente', servicios_seleccionados: ids })
  } catch (err) {
    if (!transactionFinished) { try { await transaction.rollback() } catch {} }
    console.error('Error en PUT /api/tecnico/servicios/:id_reporte/hoja-trabajo:', err)
    return res.status(err.statusCode || 500).json({
      message: err.statusCode ? err.message : 'Error interno del servidor',
    })
  }
})

// PUT /api/tecnico/servicios/:id_reporte/completar
router.put('/tecnico/servicios/:id_reporte/completar', ...requireTecnico, async (req, res) => {
  const tecnicoId              = req.user?.sub
  const id_reporte             = toTrimmedString(req.params?.id_reporte)
  const diagnostico_inicial    = toTrimmedString(req.body?.diagnostico_inicial)
  const descripcion_solucion   = toTrimmedString(req.body?.descripcion_solucion)
  const serviciosSeleccionados = normalizeServiciosSeleccionados(req.body?.servicios_seleccionados)

  if (!tecnicoId) return res.status(401).json({ message: 'No autorizado' })
  if (!id_reporte || !diagnostico_inicial || !descripcion_solucion || !serviciosSeleccionados.length) {
    return badRequest(res, 'id_reporte, diagnostico_inicial, descripcion_solucion y servicios_seleccionados son obligatorios')
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    const transaction = new sql.Transaction(pool)
    let transactionFinished = false
    try {
      await transaction.begin()

      const updateResult = await new sql.Request(transaction)
        .input('id_reporte',            sql.Char(10),    id_reporte)
        .input('id_tecnico_asignado',   sql.Char(15),    tecnicoId)
        .input('diagnostico_inicial',   sql.VarChar(1000), diagnostico_inicial)
        .input('descripcion_solucion',  sql.VarChar(1000), descripcion_solucion)
        .input('fecha_terminado',       sql.DateTime,    new Date())
        .query(`
          UPDATE Mantenimientos
          SET
            diagnostico_inicial = @diagnostico_inicial,
            descripcion_solucion = @descripcion_solucion,
            fecha_terminado = @fecha_terminado,
            fecha_cierre = @fecha_terminado,
            estado = 'Terminado'
          WHERE id_mantenimiento = @id_reporte
            AND id_tecnico_asignado = @id_tecnico_asignado
        `)

      if (!updateResult.rowsAffected?.[0]) {
        await transaction.rollback()
        transactionFinished = true
        return res.status(404).json({ message: 'Servicio no encontrado o no asignado al tecnico actual' })
      }

      await syncMantenimientoServicios(transaction, id_reporte, serviciosSeleccionados)
      await transaction.commit()
      transactionFinished = true

      return res.status(200).json({ message: 'Ticket completado correctamente' })
    } catch (err) {
      if (!transactionFinished) { try { await transaction.rollback() } catch {} }
      throw err
    }
  } catch (err) {
    console.error('Error en PUT /api/tecnico/servicios/:id_reporte/completar:', err)
    return res.status(err.statusCode || 500).json({
      message: err.statusCode ? err.message : 'Error interno del servidor',
    })
  }
})

module.exports = router
