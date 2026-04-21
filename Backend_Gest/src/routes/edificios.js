const express = require('express')
const sql     = require('mssql')

const router = express.Router()
const { getPool }       = require('../config/db')
const { requireAdmin }  = require('../middleware/auth')
const { toTrimmedString, badRequest, isForeignKeyError, existsById } = require('../helpers/sqlHelpers')

// GET /api/edificios
router.get('/edificios', async (_req, res) => {
  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    const result = await pool.request().query(`
      SELECT id_edificio, nombre_edificio, descripcion_edificio
      FROM Edificios
      ORDER BY nombre_edificio
    `)
    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/edificios:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// POST /api/edificios
router.post('/edificios', async (req, res) => {
  const id_edificio          = toTrimmedString(req.body?.id_edificio)
  const nombre_edificio      = toTrimmedString(req.body?.nombre_edificio)
  const descripcion_edificio = toTrimmedString(req.body?.descripcion_edificio)

  if (!id_edificio || !nombre_edificio || !descripcion_edificio) {
    return badRequest(res, 'id_edificio, nombre_edificio y descripcion_edificio son obligatorios')
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    const duplicated = await existsById(pool.request(), 'Edificios', 'id_edificio', 'id_edificio', id_edificio)
    if (duplicated) return res.status(409).json({ message: 'El edificio ya existe' })

    await pool
      .request()
      .input('id_edificio',          sql.Char(10),    id_edificio)
      .input('nombre_edificio',      sql.VarChar(50),  nombre_edificio)
      .input('descripcion_edificio', sql.VarChar(255), descripcion_edificio)
      .query(`
        INSERT INTO Edificios (id_edificio, nombre_edificio, descripcion_edificio)
        VALUES (@id_edificio, @nombre_edificio, @descripcion_edificio)
      `)

    return res.status(201).json({
      message: 'Edificio creado correctamente',
      data: { id_edificio, nombre_edificio, descripcion_edificio },
    })
  } catch (err) {
    console.error('Error en POST /api/edificios:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// PUT /api/edificios/:id_edificio
router.put('/edificios/:id_edificio', ...requireAdmin, async (req, res) => {
  const id_edificio          = toTrimmedString(req.params?.id_edificio)
  const nombre_edificio      = toTrimmedString(req.body?.nombre_edificio)
  const descripcion_edificio = toTrimmedString(req.body?.descripcion_edificio)

  if (!id_edificio || !nombre_edificio || !descripcion_edificio) {
    return badRequest(res, 'id_edificio, nombre_edificio y descripcion_edificio son obligatorios')
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    const updateResult = await pool
      .request()
      .input('id_edificio',          sql.Char(10),    id_edificio)
      .input('nombre_edificio',      sql.VarChar(50),  nombre_edificio)
      .input('descripcion_edificio', sql.VarChar(255), descripcion_edificio)
      .query(`
        UPDATE Edificios
        SET nombre_edificio = @nombre_edificio,
            descripcion_edificio = @descripcion_edificio
        WHERE id_edificio = @id_edificio
      `)

    if (!updateResult.rowsAffected?.[0]) {
      return res.status(404).json({ message: 'El edificio no existe' })
    }
    return res.status(200).json({ message: 'Edificio actualizado correctamente' })
  } catch (err) {
    console.error('Error en PUT /api/edificios/:id_edificio:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// DELETE /api/edificios/:id_edificio
router.delete('/edificios/:id_edificio', ...requireAdmin, async (req, res) => {
  const id_edificio = toTrimmedString(req.params?.id_edificio)
  if (!id_edificio) return badRequest(res, 'El id_edificio es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    const deleteResult = await pool
      .request()
      .input('id_edificio', sql.Char(10), id_edificio)
      .query(`DELETE FROM Edificios WHERE id_edificio = @id_edificio`)

    if (!deleteResult.rowsAffected?.[0]) {
      return res.status(404).json({ message: 'El edificio no existe' })
    }
    return res.status(200).json({ message: 'Edificio eliminado correctamente' })
  } catch (err) {
    if (isForeignKeyError(err)) {
      return res.status(409).json({ message: 'No se puede eliminar: tiene registros relacionados' })
    }
    console.error('Error en DELETE /api/edificios/:id_edificio:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// GET /api/edificios/:id_edificio/sublocalizaciones
router.get('/edificios/:id_edificio/sublocalizaciones', async (req, res) => {
  const id_edificio = toTrimmedString(req.params?.id_edificio)
  if (!id_edificio) return badRequest(res, 'El id_edificio es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    const result = await pool
      .request()
      .input('id_edificio', sql.Char(10), id_edificio)
      .query(`
        SELECT id_sublocalizacion, nombre_sublocalizacion, id_edificio
        FROM Sublocalizaciones
        WHERE id_edificio = @id_edificio
        ORDER BY nombre_sublocalizacion
      `)
    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/edificios/:id_edificio/sublocalizaciones:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// POST /api/sublocalizaciones
router.post('/sublocalizaciones', async (req, res) => {
  const id_sublocalizacion      = toTrimmedString(req.body?.id_sublocalizacion)
  const nombre_sublocalizacion  = toTrimmedString(req.body?.nombre_sublocalizacion)
  const id_edificio             = toTrimmedString(req.body?.id_edificio)

  if (!id_sublocalizacion || !nombre_sublocalizacion || !id_edificio) {
    return badRequest(res, 'id_sublocalizacion, nombre_sublocalizacion e id_edificio son obligatorios')
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    const duplicated = await existsById(pool.request(), 'Sublocalizaciones', 'id_sublocalizacion', 'id_sublocalizacion', id_sublocalizacion)
    if (duplicated) return res.status(409).json({ message: 'La sublocalización ya existe' })

    const buildingExists = await existsById(pool.request(), 'Edificios', 'id_edificio', 'id_edificio', id_edificio)
    if (!buildingExists) {
      return res.status(404).json({ message: 'No existe el edificio asociado a la sublocalización' })
    }

    await pool
      .request()
      .input('id_sublocalizacion',     sql.Char(10),    id_sublocalizacion)
      .input('nombre_sublocalizacion', sql.VarChar(100), nombre_sublocalizacion)
      .input('id_edificio',            sql.Char(10),    id_edificio)
      .query(`
        INSERT INTO Sublocalizaciones (id_sublocalizacion, nombre_sublocalizacion, id_edificio)
        VALUES (@id_sublocalizacion, @nombre_sublocalizacion, @id_edificio)
      `)

    return res.status(201).json({
      message: 'Sublocalización creada correctamente',
      data: { id_sublocalizacion, nombre_sublocalizacion, id_edificio },
    })
  } catch (err) {
    console.error('Error en POST /api/sublocalizaciones:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// PUT /api/sublocalizaciones/:id_sublocalizacion
router.put('/sublocalizaciones/:id_sublocalizacion', ...requireAdmin, async (req, res) => {
  const id_sublocalizacion     = toTrimmedString(req.params?.id_sublocalizacion)
  const nombre_sublocalizacion = toTrimmedString(req.body?.nombre_sublocalizacion)

  if (!id_sublocalizacion || !nombre_sublocalizacion) {
    return badRequest(res, 'id_sublocalizacion y nombre_sublocalizacion son obligatorios')
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    const updateResult = await pool
      .request()
      .input('id_sublocalizacion',     sql.Char(10),    id_sublocalizacion)
      .input('nombre_sublocalizacion', sql.VarChar(100), nombre_sublocalizacion)
      .query(`
        UPDATE Sublocalizaciones
        SET nombre_sublocalizacion = @nombre_sublocalizacion
        WHERE id_sublocalizacion = @id_sublocalizacion
      `)

    if (!updateResult.rowsAffected?.[0]) {
      return res.status(404).json({ message: 'La sublocalizacion no existe' })
    }
    return res.status(200).json({ message: 'Sublocalizacion actualizada correctamente' })
  } catch (err) {
    console.error('Error en PUT /api/sublocalizaciones/:id_sublocalizacion:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// DELETE /api/sublocalizaciones/:id_sublocalizacion
router.delete('/sublocalizaciones/:id_sublocalizacion', ...requireAdmin, async (req, res) => {
  const id_sublocalizacion = toTrimmedString(req.params?.id_sublocalizacion)
  if (!id_sublocalizacion) return badRequest(res, 'El id_sublocalizacion es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    const deleteResult = await pool
      .request()
      .input('id_sublocalizacion', sql.Char(10), id_sublocalizacion)
      .query(`DELETE FROM Sublocalizaciones WHERE id_sublocalizacion = @id_sublocalizacion`)

    if (!deleteResult.rowsAffected?.[0]) {
      return res.status(404).json({ message: 'La sublocalizacion no existe' })
    }
    return res.status(200).json({ message: 'Sublocalizacion eliminada correctamente' })
  } catch (err) {
    if (isForeignKeyError(err)) {
      return res.status(409).json({ message: 'No se puede eliminar: tiene registros relacionados' })
    }
    console.error('Error en DELETE /api/sublocalizaciones/:id_sublocalizacion:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// GET /api/sublocalizaciones/:id_sublocalizacion/ci
router.get('/sublocalizaciones/:id_sublocalizacion/ci', async (req, res) => {
  const id_sublocalizacion = toTrimmedString(req.params?.id_sublocalizacion)
  if (!id_sublocalizacion) return badRequest(res, 'El id_sublocalizacion es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    const result = await pool
      .request()
      .input('id_sublocalizacion', sql.Char(10), id_sublocalizacion)
      .query(`
        SELECT
          ci.id_ci,
          ci.nombre_equipo,
          ci.numero_serie,
          tc.nombre_tipo
        FROM Elementos_Configuracion ci
        JOIN Tipo_CI tc ON tc.id_tipo_ci = ci.id_tipo_ci
        WHERE ci.id_sublocalizacion = @id_sublocalizacion
        ORDER BY id_ci
      `)
    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/sublocalizaciones/:id_sublocalizacion/ci:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

module.exports = router
