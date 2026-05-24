const express = require('express')
const sql = require('mssql')

const router = express.Router()
const { getPool } = require('../config/db')
const { requireAdmin, requireTecnico, requireAdminOrTecnico } = require('../middleware/auth')
const { ROLE_TECNICO } = require('../constants')
const {
  SOLICITUD_ESTADO_PENDIENTE,
  SOLICITUD_ESTADO_PENDIENTE_INSTITUCION,
  SOLICITUD_ESTADO_AUTORIZADA_INSTITUCION,
  SOLICITUD_ESTADO_APROBADA,
  SOLICITUD_ESTADO_RECHAZADA,
  MONTO_LIMITE_INSTITUCION_MXN,
} = require('../constants')
const { toTrimmedString, badRequest, existsById } = require('../helpers/sqlHelpers')
const { ensureInventarioSchema, ensureCiHistoryTable } = require('../db/schema')
const {
  findNextComponenteId,
  findNextSolicitudId,
  findNextNumeroRfc,
} = require('../helpers/idGenerators')

function parsePrecio(value) {
  const n = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(n) ? n : NaN
}

function parseCantidad(value) {
  const n = Number.parseInt(String(value ?? ''), 10)
  return Number.isInteger(n) && n > 0 ? n : NaN
}

function parseIdCiOptional(value) {
  if (value === null || value === undefined || value === '') return null
  return toTrimmedString(value) || null
}

const COMPONENTES_SELECT_ADMIN = `
  SELECT
    c.id_componente,
    c.nombre,
    c.descripcion,
    c.cantidad_stock,
    c.precio_unitario,
    c.unidad,
    c.activo,
    c.id_ci,
    ci.nombre_equipo,
    ci.numero_serie AS ci_numero_serie
  FROM Componentes_Inventario c
  LEFT JOIN Elementos_Configuracion ci ON ci.id_ci = c.id_ci
`

async function validateIdCiOptional(pool, id_ci) {
  if (!id_ci) return null
  const exists = await existsById(pool.request(), 'Elementos_Configuracion', 'id_ci', 'id_ci', id_ci)
  if (!exists) return false
  return id_ci
}

async function loadSolicitudDetalle(pool, id_solicitud) {
  const cab = await pool
    .request()
    .input('id_solicitud', sql.Char(12), id_solicitud)
    .query(`
      SELECT
        s.*,
        u.nombre_completo AS nombre_tecnico,
        ci.nombre_equipo
      FROM Solicitud_Cambio_Componente s
      JOIN Usuarios u ON u.id_usuario = s.id_tecnico
      LEFT JOIN Elementos_Configuracion ci ON ci.id_ci = s.id_ci
      WHERE s.id_solicitud = @id_solicitud
    `)

  const row = cab.recordset?.[0]
  if (!row) return null

  const lineas = await pool
    .request()
    .input('id_solicitud', sql.Char(12), id_solicitud)
    .query(`
      SELECT
        d.id_detalle,
        d.id_componente,
        d.cantidad,
        d.precio_unitario,
        c.nombre AS nombre_componente,
        c.unidad,
        c.id_ci AS componente_id_ci,
        ci_comp.nombre_equipo AS componente_ci_nombre
      FROM Solicitud_Cambio_Detalle d
      LEFT JOIN Elementos_Configuracion ci_comp ON ci_comp.id_ci = c.id_ci
      JOIN Componentes_Inventario c ON c.id_componente = d.id_componente
      WHERE d.id_solicitud = @id_solicitud
    `)

  return { ...row, lineas: lineas.recordset || [] }
}

// GET /api/admin/inventario/componentes
router.get('/admin/inventario/componentes', ...requireAdmin, async (req, res) => {
  const filterCi = parseIdCiOptional(req.query?.id_ci)

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureInventarioSchema(pool)

    const request = pool.request()
    let where = ''
    if (filterCi) {
      request.input('id_ci', sql.VarChar(50), filterCi)
      where = 'WHERE c.id_ci = @id_ci'
    }

    const result = await request.query(`
      ${COMPONENTES_SELECT_ADMIN}
      ${where}
      ORDER BY c.nombre
    `)
    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/admin/inventario/componentes:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// POST /api/admin/inventario/componentes
router.post('/admin/inventario/componentes', ...requireAdmin, async (req, res) => {
  const nombre = toTrimmedString(req.body?.nombre)
  const descripcion = toTrimmedString(req.body?.descripcion) || null
  const cantidad_stock = Number.parseInt(String(req.body?.cantidad_stock ?? '0'), 10)
  const precio_unitario = parsePrecio(req.body?.precio_unitario)
  const unidad = toTrimmedString(req.body?.unidad) || null
  const id_ci = parseIdCiOptional(req.body?.id_ci)

  if (!nombre) return badRequest(res, 'nombre es obligatorio')
  if (!Number.isInteger(cantidad_stock) || cantidad_stock < 0) {
    return badRequest(res, 'cantidad_stock debe ser un entero >= 0')
  }
  if (Number.isNaN(precio_unitario) || precio_unitario < 0) {
    return badRequest(res, 'precio_unitario invalido')
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureInventarioSchema(pool)

    const idCiValid = await validateIdCiOptional(pool, id_ci)
    if (id_ci && idCiValid === false) return res.status(404).json({ message: 'El CI asignado no existe' })

    const id_componente = await findNextComponenteId(pool.request())
    await pool
      .request()
      .input('id_componente', sql.Char(10), id_componente)
      .input('nombre', sql.VarChar(150), nombre)
      .input('descripcion', sql.VarChar(500), descripcion)
      .input('cantidad_stock', sql.Int, cantidad_stock)
      .input('precio_unitario', sql.Decimal(10, 2), precio_unitario)
      .input('unidad', sql.VarChar(20), unidad)
      .input('id_ci', sql.VarChar(50), idCiValid)
      .query(`
        INSERT INTO Componentes_Inventario (
          id_componente, nombre, descripcion, cantidad_stock, precio_unitario, unidad, activo, id_ci
        ) VALUES (
          @id_componente, @nombre, @descripcion, @cantidad_stock, @precio_unitario, @unidad, 1, @id_ci
        )
      `)

    return res.status(201).json({ message: 'Componente creado', id_componente })
  } catch (err) {
    console.error('Error en POST /api/admin/inventario/componentes:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// PUT /api/admin/inventario/componentes/:id_componente
router.put('/admin/inventario/componentes/:id_componente', ...requireAdmin, async (req, res) => {
  const id_componente = toTrimmedString(req.params?.id_componente)
  const nombre = toTrimmedString(req.body?.nombre)
  const descripcion = toTrimmedString(req.body?.descripcion) || null
  const cantidad_stock =
    req.body?.cantidad_stock !== undefined ? parseCantidad(req.body.cantidad_stock) : null
  const precio_unitario =
    req.body?.precio_unitario !== undefined ? parsePrecio(req.body.precio_unitario) : null
  const unidad = req.body?.unidad !== undefined ? toTrimmedString(req.body.unidad) || null : undefined
  const activo = req.body?.activo
  const id_ci =
    req.body?.id_ci !== undefined ? parseIdCiOptional(req.body.id_ci) : undefined

  if (!id_componente || !nombre) return badRequest(res, 'id_componente y nombre son obligatorios')
  if (cantidad_stock !== null && (Number.isNaN(cantidad_stock) || cantidad_stock < 0)) {
    return badRequest(res, 'cantidad_stock invalida')
  }
  if (precio_unitario !== null && (Number.isNaN(precio_unitario) || precio_unitario < 0)) {
    return badRequest(res, 'precio_unitario invalido')
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureInventarioSchema(pool)

    const exists = await existsById(pool.request(), 'Componentes_Inventario', 'id_componente', 'id_componente', id_componente)
    if (!exists) return res.status(404).json({ message: 'Componente no encontrado' })

    if (id_ci !== undefined) {
      const idCiValid = await validateIdCiOptional(pool, id_ci)
      if (id_ci && idCiValid === false) return res.status(404).json({ message: 'El CI asignado no existe' })
    }

    const request = pool
      .request()
      .input('id_componente', sql.Char(10), id_componente)
      .input('nombre', sql.VarChar(150), nombre)
      .input('descripcion', sql.VarChar(500), descripcion)

    let sets = 'nombre = @nombre, descripcion = @descripcion'
    if (cantidad_stock !== null) {
      request.input('cantidad_stock', sql.Int, cantidad_stock)
      sets += ', cantidad_stock = @cantidad_stock'
    }
    if (precio_unitario !== null) {
      request.input('precio_unitario', sql.Decimal(10, 2), precio_unitario)
      sets += ', precio_unitario = @precio_unitario'
    }
    if (unidad !== undefined) {
      request.input('unidad', sql.VarChar(20), unidad)
      sets += ', unidad = @unidad'
    }
    if (typeof activo === 'boolean') {
      request.input('activo', sql.Bit, activo ? 1 : 0)
      sets += ', activo = @activo'
    }
    if (id_ci !== undefined) {
      const idCiValid = await validateIdCiOptional(pool, id_ci)
      request.input('id_ci', sql.VarChar(50), idCiValid)
      sets += ', id_ci = @id_ci'
    }

    await request.query(`UPDATE Componentes_Inventario SET ${sets} WHERE id_componente = @id_componente`)

    return res.status(200).json({ message: 'Componente actualizado' })
  } catch (err) {
    console.error('Error en PUT /api/admin/inventario/componentes:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// GET /api/ci/:id_ci/componentes-inventario (admin)
router.get('/ci/:id_ci/componentes-inventario', ...requireAdmin, async (req, res) => {
  const id_ci = toTrimmedString(req.params?.id_ci)
  if (!id_ci) return badRequest(res, 'id_ci es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureInventarioSchema(pool)

    const result = await pool
      .request()
      .input('id_ci', sql.VarChar(50), id_ci)
      .query(`
        ${COMPONENTES_SELECT_ADMIN}
        WHERE c.id_ci = @id_ci
        ORDER BY c.nombre
      `)

    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/ci/:id_ci/componentes-inventario:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// GET /api/inventario/componentes (técnico)
router.get('/inventario/componentes', ...requireTecnico, async (req, res) => {
  const id_ci = toTrimmedString(req.query?.id_ci)
  if (!id_ci) return badRequest(res, 'id_ci es obligatorio como parametro de consulta')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureInventarioSchema(pool)

    const result = await pool
      .request()
      .input('id_ci', sql.VarChar(50), id_ci)
      .query(`
        SELECT
          c.id_componente,
          c.nombre,
          c.descripcion,
          c.cantidad_stock,
          c.precio_unitario,
          c.unidad,
          c.id_ci
        FROM Componentes_Inventario c
        WHERE c.activo = 1
          AND c.cantidad_stock > 0
          AND (c.id_ci IS NULL OR c.id_ci = @id_ci)
        ORDER BY c.nombre
      `)
    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/inventario/componentes:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// GET /api/ci/:id_ci/solicitudes-cambio
router.get('/ci/:id_ci/solicitudes-cambio', ...requireAdminOrTecnico, async (req, res) => {
  const id_ci = toTrimmedString(req.params?.id_ci)
  if (!id_ci) return badRequest(res, 'id_ci es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureInventarioSchema(pool)

    const result = await pool
      .request()
      .input('id_ci', sql.VarChar(50), id_ci)
      .query(`
        SELECT
          s.id_solicitud,
          s.numero_rfc,
          s.estado,
          s.monto_total,
          s.requiere_institucion,
          s.fecha_solicitud,
          s.fecha_resolucion,
          s.detalle_cambio,
          u.nombre_completo AS nombre_tecnico
        FROM Solicitud_Cambio_Componente s
        JOIN Usuarios u ON u.id_usuario = s.id_tecnico
        WHERE s.id_ci = @id_ci
        ORDER BY s.fecha_solicitud DESC
      `)

    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/ci/:id_ci/solicitudes-cambio:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// POST /api/ci/:id_ci/solicitudes-cambio
router.post('/ci/:id_ci/solicitudes-cambio', ...requireTecnico, async (req, res) => {
  const id_ci = toTrimmedString(req.params?.id_ci)
  const id_mantenimiento = toTrimmedString(req.body?.id_mantenimiento)
  const detalle_cambio = toTrimmedString(req.body?.detalle_cambio)
  const lineas = Array.isArray(req.body?.lineas) ? req.body.lineas : []

  if (!id_ci) return badRequest(res, 'id_ci es obligatorio')
  if (!id_mantenimiento || !detalle_cambio) {
    return badRequest(res, 'id_mantenimiento y detalle_cambio son obligatorios')
  }
  if (!lineas.length) return badRequest(res, 'Debe incluir al menos un componente')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureInventarioSchema(pool)

    const ciExists = await existsById(pool.request(), 'Elementos_Configuracion', 'id_ci', 'id_ci', id_ci)
    if (!ciExists) return res.status(404).json({ message: 'El CI no existe' })

    const mantenimientoResult = await pool
      .request()
      .input('id_mantenimiento', sql.Char(10), id_mantenimiento)
      .input('id_ci', sql.VarChar(50), id_ci)
      .input('id_tecnico_asignado', sql.Char(15), req.user?.sub)
      .query(`
        SELECT id_mantenimiento, tipo_mantenimiento
        FROM Mantenimientos
        WHERE id_mantenimiento = @id_mantenimiento
          AND id_ci = @id_ci
          AND id_tecnico_asignado = @id_tecnico_asignado
      `)

    if (!mantenimientoResult.recordset?.[0]) {
      return res.status(404).json({ message: 'No se encontro el mantenimiento asignado para este CI' })
    }

    const lineasNormalizadas = []
    let monto_total = 0
    let requiere_institucion = false

    for (const raw of lineas) {
      const id_componente = toTrimmedString(raw?.id_componente)
      const cantidad = parseCantidad(raw?.cantidad)
      if (!id_componente || Number.isNaN(cantidad)) {
        return badRequest(res, 'Cada linea requiere id_componente y cantidad valida')
      }

      const comp = await pool
        .request()
        .input('id_componente', sql.Char(10), id_componente)
        .query(`
          SELECT id_componente, cantidad_stock, precio_unitario, activo, id_ci
          FROM Componentes_Inventario
          WHERE id_componente = @id_componente
        `)

      const row = comp.recordset?.[0]
      if (!row || !row.activo) return badRequest(res, `Componente ${id_componente} no disponible`)

      const compIdCi = toTrimmedString(row.id_ci) || null
      if (compIdCi && compIdCi !== id_ci) {
        return badRequest(
          res,
          `El componente ${id_componente} esta asignado a otro CI y no puede usarse en esta solicitud`
        )
      }

      if (row.cantidad_stock < cantidad) {
        return badRequest(res, `Stock insuficiente para ${id_componente} (disponible: ${row.cantidad_stock})`)
      }

      const precio = Number(row.precio_unitario)
      if (precio >= MONTO_LIMITE_INSTITUCION_MXN) requiere_institucion = true
      monto_total += precio * cantidad
      lineasNormalizadas.push({ id_componente, cantidad, precio_unitario: precio })
    }

    const estadoInicial = requiere_institucion
      ? SOLICITUD_ESTADO_PENDIENTE_INSTITUCION
      : SOLICITUD_ESTADO_PENDIENTE

    const transaction = new sql.Transaction(pool)
    await transaction.begin()
    try {
      const id_solicitud = await findNextSolicitudId(new sql.Request(transaction))
      const numero_rfc = await findNextNumeroRfc(new sql.Request(transaction))

      await new sql.Request(transaction)
        .input('id_solicitud', sql.Char(12), id_solicitud)
        .input('numero_rfc', sql.VarChar(25), numero_rfc)
        .input('id_ci', sql.VarChar(50), id_ci)
        .input('id_mantenimiento', sql.Char(10), id_mantenimiento)
        .input('id_tecnico', sql.Char(15), req.user?.sub)
        .input('detalle_cambio', sql.VarChar(500), detalle_cambio)
        .input('estado', sql.VarChar(30), estadoInicial)
        .input('monto_total', sql.Decimal(12, 2), monto_total)
        .input('requiere_institucion', sql.Bit, requiere_institucion ? 1 : 0)
        .query(`
          INSERT INTO Solicitud_Cambio_Componente (
            id_solicitud, numero_rfc, id_ci, id_mantenimiento, id_tecnico,
            detalle_cambio, estado, monto_total, requiere_institucion
          ) VALUES (
            @id_solicitud, @numero_rfc, @id_ci, @id_mantenimiento, @id_tecnico,
            @detalle_cambio, @estado, @monto_total, @requiere_institucion
          )
        `)

      for (const linea of lineasNormalizadas) {
        await new sql.Request(transaction)
          .input('id_solicitud', sql.Char(12), id_solicitud)
          .input('id_componente', sql.Char(10), linea.id_componente)
          .input('cantidad', sql.Int, linea.cantidad)
          .input('precio_unitario', sql.Decimal(10, 2), linea.precio_unitario)
          .query(`
            INSERT INTO Solicitud_Cambio_Detalle (id_solicitud, id_componente, cantidad, precio_unitario)
            VALUES (@id_solicitud, @id_componente, @cantidad, @precio_unitario)
          `)
      }

      await transaction.commit()
      return res.status(201).json({
        message: 'Solicitud de cambio registrada',
        id_solicitud,
        numero_rfc,
        estado: estadoInicial,
        requiere_institucion,
        monto_total,
      })
    } catch (innerErr) {
      await transaction.rollback()
      throw innerErr
    }
  } catch (err) {
    console.error('Error en POST /api/ci/:id_ci/solicitudes-cambio:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// GET /api/admin/solicitudes-cambio
router.get('/admin/solicitudes-cambio', ...requireAdmin, async (req, res) => {
  const estado = toTrimmedString(req.query?.estado)

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureInventarioSchema(pool)

    const request = pool.request()
    let where = ''
    if (estado) {
      request.input('estado', sql.VarChar(30), estado)
      where = 'WHERE s.estado = @estado'
    }

    const result = await request.query(`
      SELECT
        s.id_solicitud,
        s.numero_rfc,
        s.id_ci,
        s.id_mantenimiento,
        s.estado,
        s.monto_total,
        s.requiere_institucion,
        s.fecha_solicitud,
        s.fecha_institucion_ok,
        u.nombre_completo AS nombre_tecnico,
        ci.nombre_equipo
      FROM Solicitud_Cambio_Componente s
      JOIN Usuarios u ON u.id_usuario = s.id_tecnico
      LEFT JOIN Elementos_Configuracion ci ON ci.id_ci = s.id_ci
      ${where}
      ORDER BY s.fecha_solicitud DESC
    `)

    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/admin/solicitudes-cambio:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// GET /api/admin/solicitudes-cambio/:id_solicitud
router.get('/admin/solicitudes-cambio/:id_solicitud', ...requireAdmin, async (req, res) => {
  const id_solicitud = toTrimmedString(req.params?.id_solicitud)
  if (!id_solicitud) return badRequest(res, 'id_solicitud es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureInventarioSchema(pool)

    const solicitud = await loadSolicitudDetalle(pool, id_solicitud)
    if (!solicitud) return res.status(404).json({ message: 'Solicitud no encontrada' })

    return res.status(200).json(solicitud)
  } catch (err) {
    console.error('Error en GET /api/admin/solicitudes-cambio/:id:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// POST /api/admin/solicitudes-cambio/:id/institucion-ok
router.post('/admin/solicitudes-cambio/:id_solicitud/institucion-ok', ...requireAdmin, async (req, res) => {
  const id_solicitud = toTrimmedString(req.params?.id_solicitud)
  if (!id_solicitud) return badRequest(res, 'id_solicitud es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureInventarioSchema(pool)

    const result = await pool
      .request()
      .input('id_solicitud', sql.Char(12), id_solicitud)
      .input('estado_ok', sql.VarChar(30), SOLICITUD_ESTADO_AUTORIZADA_INSTITUCION)
      .input('estado_req', sql.VarChar(30), SOLICITUD_ESTADO_PENDIENTE_INSTITUCION)
      .query(`
        UPDATE Solicitud_Cambio_Componente
        SET estado = @estado_ok,
            fecha_institucion_ok = GETDATE()
        WHERE id_solicitud = @id_solicitud
          AND estado = @estado_req
          AND requiere_institucion = 1
      `)

    if (!result.rowsAffected?.[0]) {
      return res.status(404).json({
        message: 'Solicitud no encontrada o no esta pendiente de autorizacion institucional',
      })
    }

    return res.status(200).json({ message: 'Institucion autorizada; puede aprobar el cambio' })
  } catch (err) {
    console.error('Error en POST institucion-ok:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// POST /api/admin/solicitudes-cambio/:id/rechazar
router.post('/admin/solicitudes-cambio/:id_solicitud/rechazar', ...requireAdmin, async (req, res) => {
  const id_solicitud = toTrimmedString(req.params?.id_solicitud)
  const comentario_admin = toTrimmedString(req.body?.comentario_admin)

  if (!id_solicitud) return badRequest(res, 'id_solicitud es obligatorio')
  if (!comentario_admin) return badRequest(res, 'comentario_admin es obligatorio al rechazar')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureInventarioSchema(pool)

    const result = await pool
      .request()
      .input('id_solicitud', sql.Char(12), id_solicitud)
      .input('estado', sql.VarChar(30), SOLICITUD_ESTADO_RECHAZADA)
      .input('comentario_admin', sql.VarChar(500), comentario_admin)
      .query(`
        UPDATE Solicitud_Cambio_Componente
        SET estado = @estado,
            comentario_admin = @comentario_admin,
            fecha_resolucion = GETDATE()
        WHERE id_solicitud = @id_solicitud
          AND estado IN (
            '${SOLICITUD_ESTADO_PENDIENTE}',
            '${SOLICITUD_ESTADO_PENDIENTE_INSTITUCION}',
            '${SOLICITUD_ESTADO_AUTORIZADA_INSTITUCION}'
          )
      `)

    if (!result.rowsAffected?.[0]) {
      return res.status(404).json({ message: 'Solicitud no encontrada o ya fue resuelta' })
    }

    return res.status(200).json({ message: 'Solicitud rechazada' })
  } catch (err) {
    console.error('Error en POST rechazar solicitud:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// POST /api/admin/solicitudes-cambio/:id/aprobar
router.post('/admin/solicitudes-cambio/:id_solicitud/aprobar', ...requireAdmin, async (req, res) => {
  const id_solicitud = toTrimmedString(req.params?.id_solicitud)
  const comentario_admin = toTrimmedString(req.body?.comentario_admin) || null

  if (!id_solicitud) return badRequest(res, 'id_solicitud es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureInventarioSchema(pool)

    const solicitud = await loadSolicitudDetalle(pool, id_solicitud)
    if (!solicitud) return res.status(404).json({ message: 'Solicitud no encontrada' })

    if (solicitud.estado === SOLICITUD_ESTADO_APROBADA || solicitud.estado === SOLICITUD_ESTADO_RECHAZADA) {
      return res.status(409).json({ message: 'La solicitud ya fue resuelta' })
    }

    const puedeAprobar =
      (!solicitud.requiere_institucion && solicitud.estado === SOLICITUD_ESTADO_PENDIENTE) ||
      (solicitud.requiere_institucion && solicitud.estado === SOLICITUD_ESTADO_AUTORIZADA_INSTITUCION)

    if (!puedeAprobar) {
      const msg =
        solicitud.estado === SOLICITUD_ESTADO_PENDIENTE_INSTITUCION
          ? 'Debe marcar la autorizacion de la institucion antes de aprobar (componente >= $1000 MXN)'
          : 'Estado de solicitud no permite aprobacion'
      return res.status(409).json({ message: msg })
    }

    const mantRow = await pool
      .request()
      .input('id_mantenimiento', sql.Char(10), solicitud.id_mantenimiento)
      .query(`SELECT tipo_mantenimiento FROM Mantenimientos WHERE id_mantenimiento = @id_mantenimiento`)

    const tipoMantenimiento = toTrimmedString(mantRow.recordset?.[0]?.tipo_mantenimiento)
    const origen =
      tipoMantenimiento.toLowerCase() === 'preventivo' ? 'Preventivo' : 'Correctivo'

    const transaction = new sql.Transaction(pool)
    let finished = false
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
    try {
      for (const linea of solicitud.lineas) {
        const stockRes = await new sql.Request(transaction)
          .input('id_componente', sql.Char(10), linea.id_componente)
          .input('cantidad', sql.Int, linea.cantidad)
          .query(`
            UPDATE Componentes_Inventario
            SET cantidad_stock = cantidad_stock - @cantidad
            WHERE id_componente = @id_componente
              AND cantidad_stock >= @cantidad
          `)

        if (!stockRes.rowsAffected?.[0]) {
          await transaction.rollback()
          finished = true
          return res.status(409).json({
            message: `Stock insuficiente para ${linea.nombre_componente || linea.id_componente}`,
          })
        }
      }

      const historialRes = await new sql.Request(transaction)
        .input('id_ci', sql.VarChar(50), solicitud.id_ci)
        .input('id_mantenimiento', sql.Char(10), solicitud.id_mantenimiento)
        .input('id_solicitud', sql.Char(12), solicitud.id_solicitud)
        .input('numero_rfc', sql.VarChar(25), solicitud.numero_rfc)
        .input('numero_transaccion', sql.VarChar(40), solicitud.numero_rfc)
        .input('origen_transaccion', sql.VarChar(40), origen)
        .input('tecnico', sql.VarChar(120), solicitud.id_tecnico)
        .input('detalle_cambio', sql.VarChar(500), solicitud.detalle_cambio)
        .query(`
          INSERT INTO Historial_Cambios_CI (
            id_ci, id_mantenimiento, id_solicitud, numero_rfc,
            numero_transaccion, origen_transaccion, tecnico, detalle_cambio
          )
          OUTPUT INSERTED.id_historial
          VALUES (
            @id_ci, @id_mantenimiento, @id_solicitud, @numero_rfc,
            @numero_transaccion, @origen_transaccion, @tecnico, @detalle_cambio
          )
        `)

      const id_historial = historialRes.recordset?.[0]?.id_historial

      await new sql.Request(transaction)
        .input('id_solicitud', sql.Char(12), id_solicitud)
        .input('estado', sql.VarChar(30), SOLICITUD_ESTADO_APROBADA)
        .input('comentario_admin', sql.VarChar(500), comentario_admin)
        .input('id_historial', sql.Int, id_historial)
        .query(`
          UPDATE Solicitud_Cambio_Componente
          SET estado = @estado,
              comentario_admin = @comentario_admin,
              fecha_resolucion = GETDATE(),
              id_historial = @id_historial
          WHERE id_solicitud = @id_solicitud
        `)

      await transaction.commit()
      finished = true

      return res.status(200).json({
        message: 'Solicitud aprobada; inventario actualizado e historial registrado',
        id_historial,
        numero_rfc: solicitud.numero_rfc,
      })
    } catch (innerErr) {
      if (!finished) {
        try {
          await transaction.rollback()
        } catch {}
      }
      throw innerErr
    }
  } catch (err) {
    console.error('Error en POST aprobar solicitud:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

module.exports = router
