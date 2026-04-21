const express = require('express')
const sql     = require('mssql')

const router = express.Router()
const { getPool }                   = require('../config/db')
const { requireAdmin }              = require('../middleware/auth')
const { toTrimmedString, badRequest, isForeignKeyError, existsById } = require('../helpers/sqlHelpers')
const { getRolNombre, fourCharRoleCode, findNextUsuarioIdForRole, findNextTecnicoId, horarioTecnicoValido, stringifyHorario } = require('../helpers/idGenerators')
const { ensureWorkflowColumns }     = require('../db/schema')
const { ROLE_TECNICO }              = require('../constants')

// GET /api/usuarios/tecnicos  (debe ir ANTES de /:id_usuario)
router.get('/usuarios/tecnicos', ...requireAdmin, async (_req, res) => {
  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    const result = await pool.request().query(`
      SELECT u.id_usuario, u.nombre_completo
      FROM Usuarios u
      JOIN Roles r ON r.id_rol = u.id_rol
      WHERE r.nombre_rol = '${ROLE_TECNICO}'
      ORDER BY u.nombre_completo
    `)
    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/usuarios/tecnicos:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// GET /api/roles
router.get('/roles', ...requireAdmin, async (_req, res) => {
  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    const result = await pool.request().query(`
      SELECT id_rol, nombre_rol
      FROM Roles
      ORDER BY nombre_rol
    `)
    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/roles:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// GET /api/usuarios
router.get('/usuarios', ...requireAdmin, async (_req, res) => {
  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    const result = await pool.request().query(`
      SELECT
        u.id_usuario,
        u.nombre_completo,
        u.correo,
        u.id_rol,
        r.nombre_rol,
        t.id_tecnico,
        t.id_area AS tecnico_id_area,
        t.horario AS tecnico_horario
      FROM Usuarios u
      JOIN Roles r ON r.id_rol = u.id_rol
      LEFT JOIN Tecnico t ON t.id_usuario = u.id_usuario
      ORDER BY u.nombre_completo
    `)
    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/usuarios:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// POST /api/usuarios
router.post('/usuarios', ...requireAdmin, async (req, res) => {
  const payload = {
    nombre_completo: toTrimmedString(req.body?.nombre_completo),
    correo:          toTrimmedString(req.body?.correo),
    password:        toTrimmedString(req.body?.password),
    id_rol:          toTrimmedString(req.body?.id_rol),
    tecnico:         req.body?.tecnico,
  }

  if (!payload.nombre_completo || !payload.correo || !payload.password || !payload.id_rol) {
    return badRequest(res, 'nombre_completo, correo, password e id_rol son obligatorios')
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    const nombreRol = await getRolNombre(pool, payload.id_rol)
    if (!nombreRol) return badRequest(res, 'Rol no valido')

    const esTecnico = nombreRol === ROLE_TECNICO
    let idAreaTec   = ''
    let horarioStr  = null

    if (esTecnico) {
      const t = payload.tecnico || {}
      idAreaTec = toTrimmedString(t.id_area)
      if (!idAreaTec) return badRequest(res, 'Para rol Tecnico, tecnico.id_area es obligatorio')
      if (!horarioTecnicoValido(t.horario)) {
        return badRequest(res, 'Para rol Tecnico, indique horario valido (al menos un dia con inicio y fin)')
      }
      horarioStr = stringifyHorario(t.horario)
      if (!horarioStr) return badRequest(res, 'Horario invalido')

      const areaOk = await pool
        .request()
        .input('id_area', sql.Char(10), idAreaTec)
        .query(`SELECT 1 AS found FROM Areas WHERE id_area = @id_area`)
      if (!areaOk.recordset?.[0]?.found) {
        return badRequest(res, 'El area indicada no existe')
      }
    }

    const duplicatedMail = await pool
      .request()
      .input('correo', sql.VarChar(100), payload.correo)
      .query(`SELECT 1 AS found FROM Usuarios WHERE correo = @correo`)
    if (duplicatedMail.recordset?.[0]?.found) {
      return res.status(409).json({ message: 'El correo ya existe' })
    }

    const bcrypt     = require('bcryptjs')
    const roleCode   = fourCharRoleCode(nombreRol)
    const password_hash = await bcrypt.hash(payload.password, 10)

    const transaction = new sql.Transaction(pool)
    await transaction.begin()
    try {
      let id_usuario = await findNextUsuarioIdForRole(new sql.Request(transaction), roleCode)
      for (let i = 0; i < 5; i++) {
        const dup = await existsById(new sql.Request(transaction), 'Usuarios', 'id_usuario', 'id_usuario', id_usuario)
        if (!dup) break
        id_usuario = await findNextUsuarioIdForRole(new sql.Request(transaction), roleCode)
      }

      await new sql.Request(transaction)
        .input('id_usuario',      sql.Char(15),    id_usuario)
        .input('nombre_completo', sql.VarChar(150), payload.nombre_completo)
        .input('correo',          sql.VarChar(100), payload.correo)
        .input('password_hash',   sql.VarChar(255), password_hash)
        .input('id_rol',          sql.Char(10),    payload.id_rol)
        .query(`
          INSERT INTO Usuarios (id_usuario, nombre_completo, correo, password_hash, id_rol)
          VALUES (@id_usuario, @nombre_completo, @correo, @password_hash, @id_rol)
        `)

      let id_tecnico = null
      if (esTecnico) {
        id_tecnico = await findNextTecnicoId(new sql.Request(transaction))
        await new sql.Request(transaction)
          .input('id_tecnico', sql.Char(10),    id_tecnico)
          .input('id_usuario', sql.Char(15),    id_usuario)
          .input('id_area',    sql.Char(10),    idAreaTec)
          .input('horario',    sql.VarChar(500), horarioStr)
          .query(`
            INSERT INTO Tecnico (id_tecnico, id_usuario, id_area, horario)
            VALUES (@id_tecnico, @id_usuario, @id_area, @horario)
          `)
      }

      await transaction.commit()
      return res.status(201).json({ message: 'Usuario creado correctamente', id_usuario, id_tecnico })
    } catch (innerErr) {
      await transaction.rollback()
      throw innerErr
    }
  } catch (err) {
    console.error('Error en POST /api/usuarios:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// PUT /api/usuarios/:id_usuario
router.put('/usuarios/:id_usuario', ...requireAdmin, async (req, res) => {
  const id_usuario = toTrimmedString(req.params?.id_usuario)
  const payload = {
    nombre_completo: toTrimmedString(req.body?.nombre_completo),
    correo:          toTrimmedString(req.body?.correo),
    password:        toTrimmedString(req.body?.password),
    id_rol:          toTrimmedString(req.body?.id_rol),
    tecnico:         req.body?.tecnico,
  }

  if (!id_usuario || !payload.nombre_completo || !payload.correo || !payload.id_rol) {
    return badRequest(res, 'id_usuario, nombre_completo, correo e id_rol son obligatorios')
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    const nombreRolNuevo = await getRolNombre(pool, payload.id_rol)
    if (!nombreRolNuevo) return badRequest(res, 'Rol no valido')
    const esTecnico = nombreRolNuevo === ROLE_TECNICO

    let idAreaTec  = ''
    let horarioStr = null
    if (esTecnico) {
      const t = payload.tecnico || {}
      idAreaTec = toTrimmedString(t.id_area)
      if (!idAreaTec) return badRequest(res, 'Para rol Tecnico, tecnico.id_area es obligatorio')
      if (!horarioTecnicoValido(t.horario)) {
        return badRequest(res, 'Para rol Tecnico, indique horario valido (al menos un dia con inicio y fin)')
      }
      horarioStr = stringifyHorario(t.horario)
      if (!horarioStr) return badRequest(res, 'Horario invalido')

      const areaOk = await pool
        .request()
        .input('id_area', sql.Char(10), idAreaTec)
        .query(`SELECT 1 AS found FROM Areas WHERE id_area = @id_area`)
      if (!areaOk.recordset?.[0]?.found) {
        return badRequest(res, 'El area indicada no existe')
      }
    }

    const bcrypt = require('bcryptjs')
    const password_hash = payload.password ? await bcrypt.hash(payload.password, 10) : null

    const transaction = new sql.Transaction(pool)
    await transaction.begin()
    try {
      const upd = new sql.Request(transaction)
        .input('id_usuario',      sql.Char(15),    id_usuario)
        .input('nombre_completo', sql.VarChar(150), payload.nombre_completo)
        .input('correo',          sql.VarChar(100), payload.correo)
        .input('id_rol',          sql.Char(10),    payload.id_rol)

      let setPasswordClause = ''
      if (password_hash) {
        upd.input('password_hash', sql.VarChar(255), password_hash)
        setPasswordClause = ', password_hash = @password_hash'
      }

      const result = await upd.query(`
        UPDATE Usuarios
        SET nombre_completo = @nombre_completo,
            correo = @correo,
            id_rol = @id_rol
            ${setPasswordClause}
        WHERE id_usuario = @id_usuario
      `)

      if (!result.rowsAffected?.[0]) {
        await transaction.rollback()
        return res.status(404).json({ message: 'Usuario no encontrado' })
      }

      if (esTecnico) {
        const rowTec = await new sql.Request(transaction)
          .input('id_usuario', sql.Char(15), id_usuario)
          .query(`SELECT id_tecnico FROM Tecnico WHERE id_usuario = @id_usuario`)

        if (rowTec.recordset?.[0]?.id_tecnico) {
          await new sql.Request(transaction)
            .input('id_usuario', sql.Char(15),    id_usuario)
            .input('id_area',    sql.Char(10),    idAreaTec)
            .input('horario',    sql.VarChar(500), horarioStr)
            .query(`UPDATE Tecnico SET id_area = @id_area, horario = @horario WHERE id_usuario = @id_usuario`)
        } else {
          const id_tecnico = await findNextTecnicoId(new sql.Request(transaction))
          await new sql.Request(transaction)
            .input('id_tecnico', sql.Char(10),    id_tecnico)
            .input('id_usuario', sql.Char(15),    id_usuario)
            .input('id_area',    sql.Char(10),    idAreaTec)
            .input('horario',    sql.VarChar(500), horarioStr)
            .query(`
              INSERT INTO Tecnico (id_tecnico, id_usuario, id_area, horario)
              VALUES (@id_tecnico, @id_usuario, @id_area, @horario)
            `)
        }
      } else {
        await new sql.Request(transaction)
          .input('id_usuario', sql.Char(15), id_usuario)
          .query(`DELETE FROM Tecnico WHERE id_usuario = @id_usuario`)
      }

      await transaction.commit()
      return res.status(200).json({ message: 'Usuario actualizado correctamente' })
    } catch (innerErr) {
      await transaction.rollback()
      throw innerErr
    }
  } catch (err) {
    console.error('Error en PUT /api/usuarios/:id_usuario:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// DELETE /api/usuarios/:id_usuario
router.delete('/usuarios/:id_usuario', ...requireAdmin, async (req, res) => {
  const id_usuario = toTrimmedString(req.params?.id_usuario)
  if (!id_usuario) return badRequest(res, 'El id_usuario es obligatorio')
  if (id_usuario === req.user?.sub) {
    return res.status(409).json({ message: 'No puedes eliminar tu propio usuario' })
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    await pool.request()
      .input('id_usuario', sql.Char(15), id_usuario)
      .query(`DELETE FROM Tecnico WHERE id_usuario = @id_usuario`)

    const result = await pool.request()
      .input('id_usuario', sql.Char(15), id_usuario)
      .query(`DELETE FROM Usuarios WHERE id_usuario = @id_usuario`)

    if (!result.rowsAffected?.[0]) {
      return res.status(404).json({ message: 'Usuario no encontrado' })
    }

    return res.status(200).json({ message: 'Usuario eliminado correctamente' })
  } catch (err) {
    if (isForeignKeyError(err)) {
      return res.status(409).json({ message: 'No se puede eliminar: tiene registros relacionados' })
    }
    console.error('Error en DELETE /api/usuarios/:id_usuario:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

module.exports = router
