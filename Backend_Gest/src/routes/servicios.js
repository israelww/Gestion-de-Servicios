const express = require('express')
const sql     = require('mssql')

const router = express.Router()
const { getPool }       = require('../config/db')
const { requireAdmin, requireAnyAuth } = require('../middleware/auth')
const { toTrimmedString, badRequest, existsById } = require('../helpers/sqlHelpers')
const { ensureWorkflowColumns }      = require('../db/schema')
const { findNextServicioId }         = require('../helpers/idGenerators')
const { PRIORIDADES_VALIDAS }        = require('../constants')

// GET /api/servicios  (usuario autenticado)
router.get('/servicios', ...requireAnyAuth, async (_req, res) => {
  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    const result = await pool.request().query(`
      IF OBJECT_ID('Catalogo_Servicios') IS NOT NULL
      BEGIN
        SELECT
          cs.id_servicio,
          COALESCE(srv.nombre, cs.descripcion) AS nombre,
          srv.id_area,
          cs.descripcion,
          cs.tiempo_estimado_minutos AS tiempo_servicio,
          cs.tiempo_estimado_minutos,
          COALESCE(srv.prioridad, 'Media') AS prioridad,
          a.nombre_area
        FROM Catalogo_Servicios cs
        LEFT JOIN Servicios srv ON srv.id_servicio = cs.id_servicio
        LEFT JOIN Areas a ON a.id_area = srv.id_area
        ORDER BY COALESCE(a.nombre_area, ''), COALESCE(srv.nombre, cs.descripcion)
      END
      ELSE
      BEGIN
        SELECT
          srv.id_servicio,
          srv.nombre,
          srv.id_area,
          srv.descripcion,
          srv.tiempo_servicio,
          srv.tiempo_servicio AS tiempo_estimado_minutos,
          srv.prioridad,
          a.nombre_area
        FROM Servicios srv
        JOIN Areas a ON a.id_area = srv.id_area
        ORDER BY a.nombre_area, srv.nombre
      END
    `)
    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/servicios:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// GET /api/admin/servicios
router.get('/admin/servicios', ...requireAdmin, async (_req, res) => {
  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    const result = await pool.request().query(`
      SELECT
        srv.id_servicio,
        srv.nombre,
        srv.id_area,
        srv.descripcion,
        srv.tiempo_servicio,
        srv.prioridad,
        a.nombre_area
      FROM Servicios srv
      JOIN Areas a ON a.id_area = srv.id_area
      ORDER BY a.nombre_area, srv.nombre
    `)
    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/admin/servicios:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// POST /api/admin/servicios
router.post('/admin/servicios', ...requireAdmin, async (req, res) => {
  const nombre      = toTrimmedString(req.body?.nombre)
  const id_area     = toTrimmedString(req.body?.id_area)
  const descripcion = toTrimmedString(req.body?.descripcion)
  const tiempoRaw   = req.body?.tiempo_servicio
  const tiempo_servicio =
    tiempoRaw === '' || tiempoRaw === null || tiempoRaw === undefined
      ? null
      : Number.parseInt(String(tiempoRaw), 10)
  const prioridad = toTrimmedString(req.body?.prioridad)

  if (!nombre || !id_area || !prioridad) {
    return badRequest(res, 'nombre, id_area y prioridad son obligatorios')
  }
  if (!PRIORIDADES_VALIDAS.includes(prioridad)) {
    return badRequest(res, 'La prioridad no es valida')
  }
  if (tiempo_servicio !== null && (!Number.isInteger(tiempo_servicio) || tiempo_servicio < 0)) {
    return badRequest(res, 'tiempo_servicio debe ser un entero de minutos >= 0 o vacio')
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    const areaOk = await existsById(pool.request(), 'Areas', 'id_area', 'id_area', id_area)
    if (!areaOk) return res.status(404).json({ message: 'El area no existe' })

    const id_servicio = await findNextServicioId(pool.request())
    await pool
      .request()
      .input('id_servicio',    sql.Char(10),         id_servicio)
      .input('nombre',         sql.VarChar(150),      nombre)
      .input('id_area',        sql.Char(10),         id_area)
      .input('descripcion',    sql.VarChar(sql.MAX),  descripcion || null)
      .input('tiempo_servicio', sql.Int,              tiempo_servicio)
      .input('prioridad',      sql.VarChar(20),       prioridad)
      .query(`
        INSERT INTO Servicios (id_servicio, nombre, id_area, descripcion, tiempo_servicio, prioridad)
        VALUES (@id_servicio, @nombre, @id_area, @descripcion, @tiempo_servicio, @prioridad)
      `)

    return res.status(201).json({ message: 'Servicio creado correctamente', id_servicio })
  } catch (err) {
    console.error('Error en POST /api/admin/servicios:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

module.exports = router
