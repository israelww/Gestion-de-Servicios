const express = require('express')
const sql     = require('mssql')

const router = express.Router()
const { getPool }         = require('../config/db')
const { requireAdmin }    = require('../middleware/auth')
const { toTrimmedString, badRequest, isForeignKeyError, existsById } = require('../helpers/sqlHelpers')
const { ensureWorkflowColumns } = require('../db/schema')
const { findNextAreaId }  = require('../helpers/idGenerators')

// GET /api/areas
router.get('/areas', async (_req, res) => {
  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    const result = await pool.request().query(`
      SELECT id_area, nombre_area
      FROM Areas
      ORDER BY nombre_area
    `)
    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/areas:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// POST /api/admin/areas
router.post('/admin/areas', ...requireAdmin, async (req, res) => {
  const nombre_area = toTrimmedString(req.body?.nombre_area)
  if (!nombre_area) return badRequest(res, 'nombre_area es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    const id_area = await findNextAreaId(pool.request())
    await pool
      .request()
      .input('id_area',     sql.Char(10),    id_area)
      .input('nombre_area', sql.VarChar(100), nombre_area)
      .query(`INSERT INTO Areas (id_area, nombre_area) VALUES (@id_area, @nombre_area)`)

    return res.status(201).json({ message: 'Area creada correctamente', id_area })
  } catch (err) {
    console.error('Error en POST /api/admin/areas:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

module.exports = router
