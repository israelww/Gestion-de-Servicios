const sql = require('mssql')

const { getPool } = require('../config/db')
const { ensureGestionProblemasCiTable, ensureItilProblemsSchema } = require('../db/schema')
const { findNextInvestigacionId } = require('../helpers/idGenerators')
const {
  badRequest,
  existsById,
  getServerErrorDetail,
  getServerErrorMessage,
  toTrimmedString,
} = require('../helpers/sqlHelpers')
const { ROLE_TECNICO } = require('../constants')

async function getProblemasByCi(req, res) {
  const id_ci = toTrimmedString(req.params?.id_ci)
  if (!id_ci) return badRequest(res, 'El id_ci es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuracion de BD' })

    await ensureGestionProblemasCiTable(pool)

    const exists = await existsById(pool.request(), 'Elementos_Configuracion', 'id_ci', 'id_ci', id_ci)
    if (!exists) return res.status(404).json({ message: 'El CI no existe' })

    const result = await pool
      .request()
      .input('id_ci', sql.VarChar(50), id_ci)
      .query(`
        SELECT
          id_problema, id_ci, id_mantenimiento, fecha_problema,
          numero_transaccion, origen_transaccion, tecnico,
          error_conocido, solucion_raiz_o_workaround, fecha_registro
        FROM Gestion_Problemas_CI
        WHERE id_ci = @id_ci
        ORDER BY fecha_problema DESC, id_problema DESC
      `)

    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/problemas/:id_ci:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
}

async function createProblema(req, res) {
  const payload = {
    id_ci: toTrimmedString(req.body?.id_ci),
    id_mantenimiento: toTrimmedString(req.body?.id_mantenimiento),
    fecha_problema: toTrimmedString(req.body?.fecha_problema),
    numero_transaccion: toTrimmedString(req.body?.numero_transaccion),
    origen_transaccion: toTrimmedString(req.body?.origen_transaccion),
    error_conocido: toTrimmedString(req.body?.error_conocido),
    solucion_raiz_o_workaround: toTrimmedString(req.body?.solucion_raiz_o_workaround),
  }

  if (!payload.id_ci) return badRequest(res, 'El id_ci es obligatorio')
  if (!payload.error_conocido || !payload.solucion_raiz_o_workaround) {
    return badRequest(res, 'error_conocido y solucion_raiz_o_workaround son obligatorios')
  }

  const parsedDate = payload.fecha_problema ? new Date(payload.fecha_problema) : new Date()
  if (Number.isNaN(parsedDate.getTime())) return badRequest(res, 'fecha_problema no es una fecha valida')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuracion de BD' })

    await ensureGestionProblemasCiTable(pool)

    const exists = await existsById(pool.request(), 'Elementos_Configuracion', 'id_ci', 'id_ci', payload.id_ci)
    if (!exists) return res.status(404).json({ message: 'El CI no existe' })

    if (payload.id_mantenimiento) {
      const mantenimientoExists = await pool
        .request()
        .input('id_mantenimiento', sql.Char(10), payload.id_mantenimiento)
        .input('id_ci', sql.VarChar(50), payload.id_ci)
        .query(`
          SELECT 1 AS found
          FROM Mantenimientos
          WHERE id_mantenimiento = @id_mantenimiento
            AND id_ci = @id_ci
        `)

      if (!mantenimientoExists.recordset?.[0]?.found) {
        return res.status(404).json({ message: 'El mantenimiento no existe para este CI' })
      }
    }

    const tecnico = toTrimmedString(req.user?.nombre_completo) || toTrimmedString(req.user?.sub) || 'Sistema'

    const result = await pool
      .request()
      .input('id_ci', sql.VarChar(50), payload.id_ci)
      .input('id_mantenimiento', sql.Char(10), payload.id_mantenimiento || null)
      .input('fecha_problema', sql.DateTime, parsedDate)
      .input('numero_transaccion', sql.VarChar(40), payload.numero_transaccion || null)
      .input('origen_transaccion', sql.VarChar(40), payload.origen_transaccion || 'Problema')
      .input('tecnico', sql.VarChar(120), tecnico)
      .input('error_conocido', sql.VarChar(500), payload.error_conocido)
      .input('solucion_raiz_o_workaround', sql.VarChar(sql.MAX), payload.solucion_raiz_o_workaround)
      .query(`
        INSERT INTO Gestion_Problemas_CI (
          id_ci, id_mantenimiento, fecha_problema,
          numero_transaccion, origen_transaccion, tecnico,
          error_conocido, solucion_raiz_o_workaround
        )
        OUTPUT INSERTED.*
        VALUES (
          @id_ci, @id_mantenimiento, @fecha_problema,
          @numero_transaccion, @origen_transaccion, @tecnico,
          @error_conocido, @solucion_raiz_o_workaround
        )
      `)

    return res.status(201).json({
      message: 'Problema registrado correctamente',
      data: result.recordset?.[0] || null,
    })
  } catch (err) {
    console.error('Error en POST /api/problemas:', err)
    return res.status(500).json({
      message: `Error en POST /api/problemas: ${getServerErrorMessage(err)}`,
      detail: getServerErrorDetail(err),
    })
  }
}

async function listSolicitudesInvestigacion(req, res) {
  const onlyMine = toTrimmedString(req.query?.asignadas) === '1'

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuracion de BD' })

    await ensureItilProblemsSchema(pool)

    const request = pool.request()
    let where = ''
    if (onlyMine || toTrimmedString(req.user?.rol) === ROLE_TECNICO) {
      request.input('id_tecnico', sql.Char(15), req.user?.sub)
      where = 'WHERE s.id_tecnico_especialista = @id_tecnico'
    }

    const result = await request.query(`
      SELECT
        s.id_solicitud, s.titulo, s.descripcion_problematica,
        s.id_tipo_ci, tc.nombre_tipo,
        s.id_administrador, admin.nombre_completo AS administrador,
        s.id_tecnico_especialista, tec.nombre_completo AS tecnico_especialista,
        s.fecha_creacion, s.estado,
        c.id_conocimiento
      FROM Solicitudes_Investigacion s
      JOIN Tipo_CI tc ON tc.id_tipo_ci = s.id_tipo_ci
      JOIN Usuarios admin ON admin.id_usuario = s.id_administrador
      JOIN Usuarios tec ON tec.id_usuario = s.id_tecnico_especialista
      LEFT JOIN Tabla_Conocimiento c ON c.id_solicitud = s.id_solicitud
      ${where}
      ORDER BY s.fecha_creacion DESC, s.id_solicitud DESC
    `)

    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/problemas/solicitudes:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
}

async function createSolicitudInvestigacion(req, res) {
  const payload = {
    titulo: toTrimmedString(req.body?.titulo),
    descripcion_problematica: toTrimmedString(req.body?.descripcion_problematica),
    id_tipo_ci: toTrimmedString(req.body?.id_tipo_ci),
    id_tecnico_especialista: toTrimmedString(req.body?.id_tecnico_especialista),
    incidencias: Array.isArray(req.body?.incidencias) ? req.body.incidencias : [],
  }

  if (!payload.titulo || !payload.descripcion_problematica || !payload.id_tipo_ci || !payload.id_tecnico_especialista) {
    return badRequest(res, 'titulo, descripcion_problematica, id_tipo_ci e id_tecnico_especialista son obligatorios')
  }

  const pool = await getPool()
  if (!pool) return res.status(500).json({ message: 'Backend sin configuracion de BD' })

  const transaction = new sql.Transaction(pool)
  let transactionFinished = false

  try {
    await ensureItilProblemsSchema(pool)

    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
    const request = new sql.Request(transaction)

    const tipoExists = await request
      .input('id_tipo_ci', sql.Char(10), payload.id_tipo_ci)
      .query(`SELECT 1 AS found FROM Tipo_CI WHERE id_tipo_ci = @id_tipo_ci`)
    if (!tipoExists.recordset?.[0]?.found) {
      await transaction.rollback()
      transactionFinished = true
      return res.status(404).json({ message: 'El tipo de CI no existe' })
    }

    const tecnicoExists = await new sql.Request(transaction)
      .input('id_tecnico', sql.Char(15), payload.id_tecnico_especialista)
      .query(`
        SELECT 1 AS found
        FROM Usuarios u
        JOIN Roles r ON r.id_rol = u.id_rol
        WHERE u.id_usuario = @id_tecnico
          AND r.nombre_rol = '${ROLE_TECNICO}'
      `)
    if (!tecnicoExists.recordset?.[0]?.found) {
      await transaction.rollback()
      transactionFinished = true
      return res.status(404).json({ message: 'El tecnico especialista no existe o no tiene rol Tecnico' })
    }

    const id_solicitud = await findNextInvestigacionId(new sql.Request(transaction))

    await new sql.Request(transaction)
      .input('id_solicitud', sql.Char(10), id_solicitud)
      .input('titulo', sql.VarChar(150), payload.titulo)
      .input('descripcion_problematica', sql.VarChar(sql.MAX), payload.descripcion_problematica)
      .input('id_tipo_ci', sql.Char(10), payload.id_tipo_ci)
      .input('id_administrador', sql.Char(15), req.user?.sub)
      .input('id_tecnico_especialista', sql.Char(15), payload.id_tecnico_especialista)
      .query(`
        INSERT INTO Solicitudes_Investigacion (
          id_solicitud, titulo, descripcion_problematica, id_tipo_ci,
          id_administrador, id_tecnico_especialista
        )
        VALUES (
          @id_solicitud, @titulo, @descripcion_problematica, @id_tipo_ci,
          @id_administrador, @id_tecnico_especialista
        )
      `)

    const incidencias = payload.incidencias
      .map((item) => toTrimmedString(item))
      .filter(Boolean)

    for (const id_mantenimiento of incidencias) {
      await new sql.Request(transaction)
        .input('id_solicitud', sql.Char(10), id_solicitud)
        .input('id_mantenimiento', sql.Char(10), id_mantenimiento)
        .input('id_tipo_ci', sql.Char(10), payload.id_tipo_ci)
        .query(`
          UPDATE m
          SET id_solicitud_investigacion = @id_solicitud
          FROM Mantenimientos m
          JOIN Elementos_Configuracion ci ON ci.id_ci = m.id_ci
          WHERE m.id_mantenimiento = @id_mantenimiento
            AND ci.id_tipo_ci = @id_tipo_ci
        `)
    }

    await transaction.commit()
    transactionFinished = true

    return res.status(201).json({
      message: 'Solicitud de investigacion creada correctamente',
      id_solicitud,
    })
  } catch (err) {
    if (!transactionFinished) { try { await transaction.rollback() } catch {} }
    console.error('Error en POST /api/problemas/solicitud:', err)
    return res.status(500).json({
      message: `Error en POST /api/problemas/solicitud: ${getServerErrorMessage(err)}`,
      detail: getServerErrorDetail(err),
    })
  }
}

async function createConocimiento(req, res) {
  const payload = {
    id_solicitud: toTrimmedString(req.body?.id_solicitud),
    error_conocido: toTrimmedString(req.body?.error_conocido),
    causa_raiz: toTrimmedString(req.body?.causa_raiz),
    solucion: toTrimmedString(req.body?.solucion),
  }

  if (!payload.id_solicitud || !payload.error_conocido || !payload.causa_raiz || !payload.solucion) {
    return badRequest(res, 'id_solicitud, error_conocido, causa_raiz y solucion son obligatorios')
  }

  const pool = await getPool()
  if (!pool) return res.status(500).json({ message: 'Backend sin configuracion de BD' })

  const transaction = new sql.Transaction(pool)
  let transactionFinished = false

  try {
    await ensureItilProblemsSchema(pool)
    await transaction.begin()

    const solicitudResult = await new sql.Request(transaction)
      .input('id_solicitud', sql.Char(10), payload.id_solicitud)
      .input('id_tecnico', sql.Char(15), req.user?.sub)
      .query(`
        SELECT id_solicitud, id_tipo_ci, estado
        FROM Solicitudes_Investigacion
        WHERE id_solicitud = @id_solicitud
          AND id_tecnico_especialista = @id_tecnico
      `)

    const solicitud = solicitudResult.recordset?.[0]
    if (!solicitud) {
      await transaction.rollback()
      transactionFinished = true
      return res.status(404).json({ message: 'La solicitud no existe o no esta asignada a este tecnico' })
    }

    const inserted = await new sql.Request(transaction)
      .input('id_solicitud', sql.Char(10), payload.id_solicitud)
      .input('id_tipo_ci', sql.Char(10), solicitud.id_tipo_ci)
      .input('error_conocido', sql.VarChar(255), payload.error_conocido)
      .input('causa_raiz', sql.VarChar(sql.MAX), payload.causa_raiz)
      .input('solucion', sql.VarChar(sql.MAX), payload.solucion)
      .query(`
        INSERT INTO Tabla_Conocimiento (
          id_solicitud, id_tipo_ci, error_conocido, causa_raiz, solucion
        )
        OUTPUT INSERTED.*
        VALUES (
          @id_solicitud, @id_tipo_ci, @error_conocido, @causa_raiz, @solucion
        )
      `)

    await new sql.Request(transaction)
      .input('id_solicitud', sql.Char(10), payload.id_solicitud)
      .query(`
        UPDATE Solicitudes_Investigacion
        SET estado = 'Resuelto'
        WHERE id_solicitud = @id_solicitud
      `)

    await transaction.commit()
    transactionFinished = true

    return res.status(201).json({
      message: 'Conocimiento registrado y solicitud resuelta',
      data: inserted.recordset?.[0] || null,
    })
  } catch (err) {
    if (!transactionFinished) { try { await transaction.rollback() } catch {} }
    console.error('Error en POST /api/problemas/conocimiento:', err)
    return res.status(500).json({
      message: `Error en POST /api/problemas/conocimiento: ${getServerErrorMessage(err)}`,
      detail: getServerErrorDetail(err),
    })
  }
}

async function compararIncidente(req, res) {
  const id_tipo_ci = toTrimmedString(req.body?.id_tipo_ci)
  if (!id_tipo_ci) return badRequest(res, 'El id_tipo_ci es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuracion de BD' })

    await ensureItilProblemsSchema(pool)

    const result = await pool
      .request()
      .input('id_tipo_ci', sql.Char(10), id_tipo_ci)
      .query(`
        SELECT TOP 5
          c.id_conocimiento, c.id_solicitud, c.id_tipo_ci,
          tc.nombre_tipo, c.error_conocido, c.causa_raiz,
          c.solucion, c.fecha_registro
        FROM Tabla_Conocimiento c
        JOIN Tipo_CI tc ON tc.id_tipo_ci = c.id_tipo_ci
        WHERE c.id_tipo_ci = @id_tipo_ci
        ORDER BY c.fecha_registro DESC, c.id_conocimiento DESC
      `)

    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en POST /api/incidentes/comparar:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
}

async function listIncidenciasPorTipo(req, res) {
  const id_tipo_ci = toTrimmedString(req.query?.id_tipo_ci)
  if (!id_tipo_ci) return badRequest(res, 'El id_tipo_ci es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuracion de BD' })

    await ensureItilProblemsSchema(pool)

    const result = await pool
      .request()
      .input('id_tipo_ci', sql.Char(10), id_tipo_ci)
      .query(`
        SELECT TOP 25
          m.id_mantenimiento, m.id_ci, m.fecha_mantenimiento,
          m.descripcion_tarea, m.diagnostico_inicial, m.descripcion_solucion,
          m.estado, m.id_solicitud_investigacion,
          ci.nombre_equipo, ci.numero_serie
        FROM Mantenimientos m
        JOIN Elementos_Configuracion ci ON ci.id_ci = m.id_ci
        WHERE ci.id_tipo_ci = @id_tipo_ci
        ORDER BY m.fecha_mantenimiento DESC, m.id_mantenimiento DESC
      `)

    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/problemas/incidencias:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
}

async function listIncidenciasInvestigacion(req, res) {
  const id_solicitud = toTrimmedString(req.params?.id_solicitud)
  if (!id_solicitud) return badRequest(res, 'El id_solicitud es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuracion de BD' })

    await ensureItilProblemsSchema(pool)

    const request = pool
      .request()
      .input('id_solicitud', sql.Char(10), id_solicitud)

    let assignedGuard = ''
    if (toTrimmedString(req.user?.rol) === ROLE_TECNICO) {
      request.input('id_tecnico', sql.Char(15), req.user?.sub)
      assignedGuard = 'AND s.id_tecnico_especialista = @id_tecnico'
    }

    const result = await request.query(`
      SELECT
        m.id_mantenimiento, m.id_ci, m.fecha_mantenimiento,
        m.descripcion_tarea, m.diagnostico_inicial, m.descripcion_solucion,
        m.estado, ci.nombre_equipo, ci.numero_serie
      FROM Mantenimientos m
      JOIN Solicitudes_Investigacion s ON s.id_solicitud = m.id_solicitud_investigacion
      JOIN Elementos_Configuracion ci ON ci.id_ci = m.id_ci
      WHERE m.id_solicitud_investigacion = @id_solicitud
        ${assignedGuard}
      ORDER BY m.fecha_mantenimiento DESC, m.id_mantenimiento DESC
    `)

    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/problemas/solicitudes/:id_solicitud/incidencias:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
}

module.exports = {
  compararIncidente,
  createProblema,
  createConocimiento,
  createSolicitudInvestigacion,
  getProblemasByCi,
  listIncidenciasInvestigacion,
  listIncidenciasPorTipo,
  listSolicitudesInvestigacion,
}
