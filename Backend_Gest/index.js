require('dotenv').config()

const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const sql = require('mssql')

const app = express()
const PORT = 4000
const JWT_SECRET = process.env.JWT_SECRET || 'demo_secret'
const CI_DEFAULT_STATUS = 'Activo'

app.use(
  cors({
    origin: 'http://localhost:5173',
    methods: ['POST', 'GET', 'PUT', 'DELETE', 'OPTIONS'],
  })
)
app.use(express.json())

const sqlConfig = {
  server: process.env.DB_SERVER,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERT === 'true',
  },
}

let poolPromise = null
function hasSqlConfig() {
  return (
    typeof sqlConfig.server === 'string' &&
    sqlConfig.server.trim().length > 0 &&
    typeof sqlConfig.user === 'string' &&
    sqlConfig.user.trim().length > 0 &&
    typeof sqlConfig.password === 'string' &&
    sqlConfig.password.trim().length > 0 &&
    typeof sqlConfig.database === 'string' &&
    sqlConfig.database.trim().length > 0
  )
}

async function getPool() {
  if (!hasSqlConfig()) return null
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(sqlConfig)
      .connect()
      .then((pool) => {
        console.log('Conectado a SQL Server')
        return pool
      })
      .catch((err) => {
        console.error('Error conectando a SQL Server:', err?.message || err)
        poolPromise = null
        return null
      })
  }
  return await poolPromise
}

function toTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function buildCiPrefix(nombreTipo) {
  const normalized = toTrimmedString(nombreTipo)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

  const base = normalized.slice(0, 4) || 'CI'
  return base
}

function buildCiId(prefix, sequence) {
  return `${prefix}-${String(sequence).padStart(4, '0')}`
}

async function findNextCiId(request, prefix) {
  const result = await request
    .input('ciPattern', sql.VarChar, `${prefix}-%`)
    .query(
      `
      SELECT id_ci
      FROM Elementos_Configuracion
      WHERE id_ci LIKE @ciPattern
      `
    )

  const maxSequence = (result.recordset || []).reduce((max, row) => {
    const suffix = Number.parseInt(String(row.id_ci || '').split('-')[1], 10)
    return Number.isNaN(suffix) ? max : Math.max(max, suffix)
  }, 0)

  return buildCiId(prefix, maxSequence + 1)
}

async function existsById(request, table, column, paramName, value) {
  const result = await request
    .input(paramName, sql.VarChar, value)
    .query(`SELECT 1 AS found FROM ${table} WHERE ${column} = @${paramName}`)

  return Boolean(result.recordset?.[0]?.found)
}

async function getCiTypeData(request, idTipoCi) {
  const result = await request
    .input('id_tipo_ci', sql.Char(10), idTipoCi)
    .query(
      `
      SELECT id_tipo_ci, nombre_tipo
      FROM Tipo_CI
      WHERE id_tipo_ci = @id_tipo_ci
      `
    )

  return result.recordset?.[0] || null
}

async function getCiById(request, idCi) {
  const result = await request
    .input('id_ci', sql.Char(10), idCi)
    .query(
      `
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
      WHERE ci.id_ci = @id_ci
      `
    )

  return result.recordset?.[0] || null
}

function badRequest(res, message) {
  return res.status(400).json({ message })
}

function getJwtFromHeader(req) {
  const header = req.headers.authorization || ''
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

function requireAuth(req, res, next) {
  const token = getJwtFromHeader(req)
  if (!token) return res.status(401).json({ message: 'No autorizado' })

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = payload
    return next()
  } catch {
    return res.status(401).json({ message: 'Token invalido' })
  }
}

const requireAnyAuth = [requireAuth]

app.get('/api/edificios', async (_req, res) => {
  try {
    const pool = await getPool()
    if (!pool) {
      return res.status(500).json({ message: 'Backend sin configuración de BD' })
    }

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

app.post('/api/edificios', async (req, res) => {
  const id_edificio = toTrimmedString(req.body?.id_edificio)
  const nombre_edificio = toTrimmedString(req.body?.nombre_edificio)
  const descripcion_edificio = toTrimmedString(req.body?.descripcion_edificio)

  if (!id_edificio || !nombre_edificio || !descripcion_edificio) {
    return badRequest(
      res,
      'id_edificio, nombre_edificio y descripcion_edificio son obligatorios'
    )
  }

  try {
    const pool = await getPool()
    if (!pool) {
      return res.status(500).json({ message: 'Backend sin configuración de BD' })
    }

    const request = pool.request()
    const duplicated = await existsById(
      request,
      'Edificios',
      'id_edificio',
      'id_edificio',
      id_edificio
    )

    if (duplicated) {
      return res.status(409).json({ message: 'El edificio ya existe' })
    }

    await pool
      .request()
      .input('id_edificio', sql.Char(10), id_edificio)
      .input('nombre_edificio', sql.VarChar(50), nombre_edificio)
      .input('descripcion_edificio', sql.VarChar(255), descripcion_edificio)
      .query(
        `
        INSERT INTO Edificios (id_edificio, nombre_edificio, descripcion_edificio)
        VALUES (@id_edificio, @nombre_edificio, @descripcion_edificio)
        `
      )

    return res.status(201).json({
      message: 'Edificio creado correctamente',
      data: { id_edificio, nombre_edificio, descripcion_edificio },
    })
  } catch (err) {
    console.error('Error en POST /api/edificios:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.get('/api/edificios/:id_edificio/sublocalizaciones', async (req, res) => {
  const id_edificio = toTrimmedString(req.params?.id_edificio)

  if (!id_edificio) {
    return badRequest(res, 'El id_edificio es obligatorio')
  }

  try {
    const pool = await getPool()
    if (!pool) {
      return res.status(500).json({ message: 'Backend sin configuración de BD' })
    }

    const result = await pool
      .request()
      .input('id_edificio', sql.Char(10), id_edificio)
      .query(
        `
        SELECT id_sublocalizacion, nombre_sublocalizacion, id_edificio
        FROM Sublocalizaciones
        WHERE id_edificio = @id_edificio
        ORDER BY nombre_sublocalizacion
        `
      )

    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/edificios/:id_edificio/sublocalizaciones:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.post('/api/sublocalizaciones', async (req, res) => {
  const id_sublocalizacion = toTrimmedString(req.body?.id_sublocalizacion)
  const nombre_sublocalizacion = toTrimmedString(req.body?.nombre_sublocalizacion)
  const id_edificio = toTrimmedString(req.body?.id_edificio)

  if (!id_sublocalizacion || !nombre_sublocalizacion || !id_edificio) {
    return badRequest(
      res,
      'id_sublocalizacion, nombre_sublocalizacion e id_edificio son obligatorios'
    )
  }

  try {
    const pool = await getPool()
    if (!pool) {
      return res.status(500).json({ message: 'Backend sin configuración de BD' })
    }

    const duplicated = await existsById(
      pool.request(),
      'Sublocalizaciones',
      'id_sublocalizacion',
      'id_sublocalizacion',
      id_sublocalizacion
    )

    if (duplicated) {
      return res.status(409).json({ message: 'La sublocalización ya existe' })
    }

    const buildingExists = await existsById(
      pool.request(),
      'Edificios',
      'id_edificio',
      'id_edificio',
      id_edificio
    )

    if (!buildingExists) {
      return res
        .status(404)
        .json({ message: 'No existe el edificio asociado a la sublocalización' })
    }

    await pool
      .request()
      .input('id_sublocalizacion', sql.Char(10), id_sublocalizacion)
      .input('nombre_sublocalizacion', sql.VarChar(100), nombre_sublocalizacion)
      .input('id_edificio', sql.Char(10), id_edificio)
      .query(
        `
        INSERT INTO Sublocalizaciones (
          id_sublocalizacion,
          nombre_sublocalizacion,
          id_edificio
        )
        VALUES (@id_sublocalizacion, @nombre_sublocalizacion, @id_edificio)
        `
      )

    return res.status(201).json({
      message: 'Sublocalización creada correctamente',
      data: { id_sublocalizacion, nombre_sublocalizacion, id_edificio },
    })
  } catch (err) {
    console.error('Error en POST /api/sublocalizaciones:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.get('/api/sublocalizaciones/:id_sublocalizacion/ci', ...requireAnyAuth, async (req, res) => {
  const id_sublocalizacion = toTrimmedString(req.params?.id_sublocalizacion)

  if (!id_sublocalizacion) {
    return badRequest(res, 'El id_sublocalizacion es obligatorio')
  }

  try {
    const pool = await getPool()
    if (!pool) {
      return res.status(500).json({ message: 'Backend sin configuración de BD' })
    }

    const result = await pool
      .request()
      .input('id_sublocalizacion', sql.Char(10), id_sublocalizacion)
      .query(
        `
        SELECT id_ci, nombre_equipo, numero_serie
        FROM Elementos_Configuracion
        WHERE id_sublocalizacion = @id_sublocalizacion
        ORDER BY id_ci
        `
      )

    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/sublocalizaciones/:id_sublocalizacion/ci:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.get('/api/catalogos/ci', async (_req, res) => {
  try {
    const pool = await getPool()
    if (!pool) {
      return res.status(500).json({ message: 'Backend sin configuración de BD' })
    }

    const [tipos, marcas, edificios, usuarios] = await Promise.all([
      pool.request().query(`
        SELECT id_tipo_ci, nombre_tipo
        FROM Tipo_CI
        ORDER BY nombre_tipo
      `),
      pool.request().query(`
        SELECT id_marca, nombre_marca
        FROM marcas
        ORDER BY nombre_marca
      `),
      pool.request().query(`
        SELECT id_edificio, nombre_edificio
        FROM Edificios
        ORDER BY nombre_edificio
      `),
      pool.request().query(`
        SELECT id_usuario, nombre_completo
        FROM Usuarios
        ORDER BY nombre_completo
      `),
    ])

    return res.status(200).json({
      tipos_ci: tipos.recordset,
      marcas: marcas.recordset,
      edificios: edificios.recordset,
      usuarios: usuarios.recordset,
    })
  } catch (err) {
    console.error('Error en GET /api/catalogos/ci:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.get('/api/ci', async (_req, res) => {
  try {
    const pool = await getPool()
    if (!pool) {
      return res.status(500).json({ message: 'Backend sin configuración de BD' })
    }

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

app.get('/api/ci/:id_ci', ...requireAnyAuth, async (req, res) => {
  const id_ci = toTrimmedString(req.params?.id_ci)
  if (!id_ci) return badRequest(res, 'El id_ci es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) {
      return res.status(500).json({ message: 'Backend sin configuraciÃ³n de BD' })
    }

    const row = await getCiById(pool.request(), id_ci)
    if (!row) {
      return res.status(404).json({ message: 'El CI no existe' })
    }

    return res.status(200).json(row)
  } catch (err) {
    console.error('Error en GET /api/ci/:id_ci:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.get('/api/ci/:id_ci/cambios', ...requireAnyAuth, async (req, res) => {
  const id_ci = toTrimmedString(req.params?.id_ci)
  if (!id_ci) return badRequest(res, 'El id_ci es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) {
      return res.status(500).json({ message: 'Backend sin configuraciÃ³n de BD' })
    }

    const ci = await getCiById(pool.request(), id_ci)
    if (!ci) {
      return res.status(404).json({ message: 'El CI no existe' })
    }

    const cambiosResult = await pool
      .request()
      .input('id_ci', sql.Char(10), id_ci)
      .query(
        `
        SELECT
          h.id_historial_ci_cambio,
          h.id_ci,
          h.fecha_cambio,
          h.numero_transaccion,
          h.tipo_transaccion,
          h.componente,
          h.descripcion_cambio,
          h.detalle_anterior,
          h.detalle_nuevo,
          h.observaciones,
          h.id_tecnico,
          tec.nombre_completo AS tecnico_nombre,
          h.id_usuario_registra,
          reg.nombre_completo AS usuario_registra_nombre,
          h.fecha_registro
        FROM CI_Historial_Cambios h
        LEFT JOIN Usuarios tec ON tec.id_usuario = h.id_tecnico
        LEFT JOIN Usuarios reg ON reg.id_usuario = h.id_usuario_registra
        WHERE h.id_ci = @id_ci
        ORDER BY h.fecha_cambio DESC, h.id_historial_ci_cambio DESC
        `
      )

    return res.status(200).json({
      ci,
      cambios: cambiosResult.recordset,
    })
  } catch (err) {
    console.error('Error en GET /api/ci/:id_ci/cambios:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.post('/api/ci/:id_ci/cambios', ...requireAnyAuth, async (req, res) => {
  const id_ci = toTrimmedString(req.params?.id_ci)
  const payload = {
    fecha_cambio: toTrimmedString(req.body?.fecha_cambio),
    numero_transaccion: toTrimmedString(req.body?.numero_transaccion),
    tipo_transaccion: toTrimmedString(req.body?.tipo_transaccion),
    componente: toTrimmedString(req.body?.componente),
    descripcion_cambio: toTrimmedString(req.body?.descripcion_cambio),
    detalle_anterior: toTrimmedString(req.body?.detalle_anterior),
    detalle_nuevo: toTrimmedString(req.body?.detalle_nuevo),
    observaciones: toTrimmedString(req.body?.observaciones),
    id_tecnico: toTrimmedString(req.body?.id_tecnico),
  }

  if (!id_ci) return badRequest(res, 'El id_ci es obligatorio')
  if (!payload.fecha_cambio) return badRequest(res, 'fecha_cambio es obligatorio')
  if (!payload.componente) return badRequest(res, 'componente es obligatorio')
  if (!payload.descripcion_cambio) return badRequest(res, 'descripcion_cambio es obligatorio')
  if (!payload.id_tecnico) return badRequest(res, 'id_tecnico es obligatorio')

  const fechaCambio = new Date(payload.fecha_cambio)
  if (Number.isNaN(fechaCambio.getTime())) {
    return badRequest(res, 'fecha_cambio no es una fecha valida')
  }

  const pool = await getPool()
  if (!pool) {
    return res.status(500).json({ message: 'Backend sin configuraciÃ³n de BD' })
  }

  const transaction = new sql.Transaction(pool)
  let transactionFinished = false

  try {
    await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED)

    const ci = await getCiById(new sql.Request(transaction), id_ci)
    if (!ci) {
      await transaction.rollback()
      return res.status(404).json({ message: 'El CI no existe' })
    }

    const tecnicoResult = await new sql.Request(transaction)
      .input('id_tecnico', sql.Char(15), payload.id_tecnico)
      .query(
        `
        SELECT
          u.id_usuario,
          u.nombre_completo
        FROM Usuarios u
        JOIN Roles r ON r.id_rol = u.id_rol
        WHERE u.id_usuario = @id_tecnico
          AND r.nombre_rol = 'Tecnico'
        `
      )

    const tecnico = tecnicoResult.recordset?.[0]
    if (!tecnico) {
      await transaction.rollback()
      return res.status(404).json({ message: 'El tecnico seleccionado no existe' })
    }

    const userId = toTrimmedString(req.user?.sub)
    const insertResult = await new sql.Request(transaction)
      .input('id_ci', sql.Char(10), id_ci)
      .input('fecha_cambio', sql.DateTime, fechaCambio)
      .input('numero_transaccion', sql.VarChar(50), payload.numero_transaccion || null)
      .input('tipo_transaccion', sql.VarChar(40), payload.tipo_transaccion || null)
      .input('componente', sql.VarChar(100), payload.componente)
      .input('descripcion_cambio', sql.VarChar(1000), payload.descripcion_cambio)
      .input('detalle_anterior', sql.VarChar(255), payload.detalle_anterior || null)
      .input('detalle_nuevo', sql.VarChar(255), payload.detalle_nuevo || null)
      .input('observaciones', sql.VarChar(500), payload.observaciones || null)
      .input('id_tecnico', sql.Char(15), payload.id_tecnico)
      .input('id_usuario_registra', sql.Char(15), userId || null)
      .query(
        `
        INSERT INTO CI_Historial_Cambios (
          id_ci,
          fecha_cambio,
          numero_transaccion,
          tipo_transaccion,
          componente,
          descripcion_cambio,
          detalle_anterior,
          detalle_nuevo,
          observaciones,
          id_tecnico,
          id_usuario_registra
        )
        OUTPUT INSERTED.id_historial_ci_cambio, INSERTED.fecha_registro
        VALUES (
          @id_ci,
          @fecha_cambio,
          @numero_transaccion,
          @tipo_transaccion,
          @componente,
          @descripcion_cambio,
          @detalle_anterior,
          @detalle_nuevo,
          @observaciones,
          @id_tecnico,
          @id_usuario_registra
        )
        `
      )

    await transaction.commit()
    transactionFinished = true

    return res.status(201).json({
      message: 'Cambio de CI registrado correctamente',
      data: {
        id_historial_ci_cambio: insertResult.recordset?.[0]?.id_historial_ci_cambio,
        id_ci,
        fecha_cambio: fechaCambio.toISOString(),
      },
    })
  } catch (err) {
    if (!transactionFinished) {
      try {
        await transaction.rollback()
      } catch {}
    }
    console.error('Error en POST /api/ci/:id_ci/cambios:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.post('/api/ci', async (req, res) => {
  const payload = {
    id_ci: toTrimmedString(req.body?.id_ci),
    numero_serie: toTrimmedString(req.body?.numero_serie),
    nombre_equipo: toTrimmedString(req.body?.nombre_equipo),
    modelo: toTrimmedString(req.body?.modelo),
    id_tipo_ci: toTrimmedString(req.body?.id_tipo_ci),
    id_marca: toTrimmedString(req.body?.id_marca),
    id_sublocalizacion: toTrimmedString(req.body?.id_sublocalizacion),
    id_usuario_responsable: toTrimmedString(req.body?.id_usuario_responsable),
  }

  if (!payload.numero_serie || !payload.id_tipo_ci || !payload.id_marca || !payload.id_sublocalizacion) {
    return badRequest(
      res,
      'numero_serie, id_tipo_ci, id_marca e id_sublocalizacion son obligatorios'
    )
  }

  const pool = await getPool()
  if (!pool) {
    return res.status(500).json({ message: 'Backend sin configuración de BD' })
  }

  const transaction = new sql.Transaction(pool)
  let transactionFinished = false

  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
    const request = new sql.Request(transaction)

    const tipo = await getCiTypeData(request, payload.id_tipo_ci)
    if (!tipo) {
      await transaction.rollback()
      return res.status(404).json({ message: 'El tipo de CI no existe' })
    }

    const prefix = buildCiPrefix(tipo.nombre_tipo)
    const finalIdCi = payload.id_ci || (await findNextCiId(new sql.Request(transaction), prefix))

    if (!finalIdCi.startsWith(`${prefix}-`)) {
      await transaction.rollback()
      return badRequest(
        res,
        `El id_ci debe iniciar con el prefijo ${prefix}- según el tipo seleccionado`
      )
    }

    const duplicatedCi = await existsById(
      new sql.Request(transaction),
      'Elementos_Configuracion',
      'id_ci',
      'id_ci',
      finalIdCi
    )

    if (duplicatedCi) {
      await transaction.rollback()
      return res.status(409).json({ message: 'El id_ci ya existe' })
    }

    const duplicatedSerial = await new sql.Request(transaction)
      .input('numero_serie', sql.VarChar(50), payload.numero_serie)
      .query(
        `
        SELECT 1 AS found
        FROM Elementos_Configuracion
        WHERE numero_serie = @numero_serie
        `
      )

    if (duplicatedSerial.recordset?.[0]?.found) {
      await transaction.rollback()
      return res.status(409).json({ message: 'El número de serie ya existe' })
    }

    const marcaExists = await existsById(
      new sql.Request(transaction),
      'marcas',
      'id_marca',
      'id_marca',
      payload.id_marca
    )
    if (!marcaExists) {
      await transaction.rollback()
      return res.status(404).json({ message: 'La marca seleccionada no existe' })
    }

    const sublocalizacionExists = await existsById(
      new sql.Request(transaction),
      'Sublocalizaciones',
      'id_sublocalizacion',
      'id_sublocalizacion',
      payload.id_sublocalizacion
    )
    if (!sublocalizacionExists) {
      await transaction.rollback()
      return res
        .status(404)
        .json({ message: 'La sublocalización seleccionada no existe' })
    }

    if (payload.id_usuario_responsable) {
      const usuarioExists = await existsById(
        new sql.Request(transaction),
        'Usuarios',
        'id_usuario',
        'id_usuario',
        payload.id_usuario_responsable
      )

      if (!usuarioExists) {
        await transaction.rollback()
        return res
          .status(404)
          .json({ message: 'El usuario responsable no existe' })
      }
    }

    await new sql.Request(transaction)
      .input('id_ci', sql.Char(10), finalIdCi)
      .input('numero_serie', sql.VarChar(50), payload.numero_serie)
      .input('nombre_equipo', sql.VarChar(100), payload.nombre_equipo || null)
      .input('modelo', sql.VarChar(100), payload.modelo || null)
      .input('estado', sql.VarChar(20), CI_DEFAULT_STATUS)
      .input('id_tipo_ci', sql.Char(10), payload.id_tipo_ci)
      .input('id_marca', sql.Char(10), payload.id_marca)
      .input('id_sublocalizacion', sql.Char(10), payload.id_sublocalizacion)
      .input(
        'id_usuario_responsable',
        sql.Char(15),
        payload.id_usuario_responsable || null
      )
      .input('fecha_ingreso', sql.Date, new Date())
      .query(
        `
        INSERT INTO Elementos_Configuracion (
          id_ci,
          numero_serie,
          nombre_equipo,
          modelo,
          estado,
          id_tipo_ci,
          id_marca,
          id_sublocalizacion,
          id_usuario_responsable,
          fecha_ingreso
        )
        VALUES (
          @id_ci,
          @numero_serie,
          @nombre_equipo,
          @modelo,
          @estado,
          @id_tipo_ci,
          @id_marca,
          @id_sublocalizacion,
          @id_usuario_responsable,
          @fecha_ingreso
        )
        `
      )

    await transaction.commit()
    transactionFinished = true

    return res.status(201).json({
      message: 'CI creado correctamente',
      data: {
        ...payload,
        id_ci: finalIdCi,
        estado: CI_DEFAULT_STATUS,
        fecha_ingreso: new Date().toISOString().slice(0, 10),
      },
    })
  } catch (err) {
    if (!transactionFinished) {
      try {
        await transaction.rollback()
      } catch {}
    }

    console.error('Error en POST /api/ci:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.post('/api/reportes', ...requireAnyAuth, async (req, res) => {
  const payload = {
    id_edificio: toTrimmedString(req.body?.id_edificio),
    id_sublocalizacion: toTrimmedString(req.body?.id_sublocalizacion),
    id_ci: toTrimmedString(req.body?.id_ci),
    descripcion_falla: toTrimmedString(req.body?.descripcion_falla),
  }

  if (!payload.id_edificio || !payload.id_sublocalizacion || !payload.id_ci || !payload.descripcion_falla) {
    return badRequest(
      res,
      'id_edificio, id_sublocalizacion, id_ci y descripcion_falla son obligatorios'
    )
  }

  const pool = await getPool()
  if (!pool) {
    return res.status(500).json({ message: 'Backend sin configuración de BD' })
  }

  const transaction = new sql.Transaction(pool)
  let transactionFinished = false

  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
    const request = new sql.Request(transaction)

    const buildingExists = await existsById(
      request,
      'Edificios',
      'id_edificio',
      'id_edificio',
      payload.id_edificio
    )
    if (!buildingExists) {
      await transaction.rollback()
      return res.status(404).json({ message: 'El edificio no existe' })
    }

    const subCheck = await new sql.Request(transaction)
      .input('id_sublocalizacion', sql.Char(10), payload.id_sublocalizacion)
      .query(
        `
        SELECT id_sublocalizacion, id_edificio
        FROM Sublocalizaciones
        WHERE id_sublocalizacion = @id_sublocalizacion
        `
      )

    const sub = subCheck.recordset?.[0]
    if (!sub) {
      await transaction.rollback()
      return res.status(404).json({ message: 'La sublocalizacion no existe' })
    }
    if (toTrimmedString(sub.id_edificio) !== payload.id_edificio) {
      await transaction.rollback()
      return res.status(409).json({ message: 'La sublocalizacion no pertenece al edificio' })
    }

    const ciCheck = await new sql.Request(transaction)
      .input('id_ci', sql.VarChar(25), payload.id_ci)
      .query(
        `
        SELECT id_ci, id_sublocalizacion
        FROM Elementos_Configuracion
        WHERE id_ci = @id_ci
        `
      )

    const ci = ciCheck.recordset?.[0]
    if (!ci) {
      await transaction.rollback()
      return res.status(404).json({ message: 'El CI no existe' })
    }
    if (toTrimmedString(ci.id_sublocalizacion) !== payload.id_sublocalizacion) {
      await transaction.rollback()
      return res.status(409).json({ message: 'El CI no pertenece a la sublocalizacion' })
    }

    const userId = req.user?.sub
    await new sql.Request(transaction)
      .input('id_edificio', sql.Char(10), payload.id_edificio)
      .input('id_sublocalizacion', sql.Char(10), payload.id_sublocalizacion)
      .input('id_ci', sql.VarChar(25), payload.id_ci)
      .input('descripcion_falla', sql.VarChar(1000), payload.descripcion_falla)
      .input('id_usuario_reporta', sql.Char(15), userId)
      .query(
        `
        INSERT INTO Reportes (
          id_edificio,
          id_sublocalizacion,
          id_ci,
          descripcion_falla,
          id_usuario_reporta
        )
        VALUES (
          @id_edificio,
          @id_sublocalizacion,
          @id_ci,
          @descripcion_falla,
          @id_usuario_reporta
        )
        `
      )

    await transaction.commit()
    transactionFinished = true

    return res.status(201).json({ message: 'Reporte creado correctamente' })
  } catch (err) {
    if (!transactionFinished) {
      try {
        await transaction.rollback()
      } catch {}
    }
    console.error('Error en POST /api/reportes:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.get('/api/catalogos/tecnicos', ...requireAnyAuth, async (_req, res) => {
  try {
    const pool = await getPool()
    if (!pool) {
      return res.status(500).json({ message: 'Backend sin configuraciÃ³n de BD' })
    }

    const result = await pool.request().query(`
      SELECT
        u.id_usuario,
        u.nombre_completo
      FROM Usuarios u
      JOIN Roles r ON r.id_rol = u.id_rol
      WHERE r.nombre_rol = 'Tecnico'
      ORDER BY u.nombre_completo
    `)

    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/catalogos/tecnicos:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.get('/api/reportes', ...requireAnyAuth, async (req, res) => {
  const userId = req.user?.sub
  if (!userId) return res.status(401).json({ message: 'No autorizado' })

  try {
    const pool = await getPool()
    if (!pool) {
      return res.status(500).json({ message: 'Backend sin configuración de BD' })
    }

    const result = await pool
      .request()
      .input('id_usuario_reporta', sql.Char(15), userId)
      .query(
        `
        SELECT
          r.id_reporte,
          r.id_ci,
          r.descripcion_falla,
          r.fecha_reporte,
          r.estado,
          e.nombre_edificio,
          s.nombre_sublocalizacion,
          ci.nombre_equipo,
          ci.numero_serie
        FROM Reportes r
        JOIN Edificios e ON e.id_edificio = r.id_edificio
        JOIN Sublocalizaciones s ON s.id_sublocalizacion = r.id_sublocalizacion
        LEFT JOIN Elementos_Configuracion ci ON ci.id_ci = r.id_ci
        WHERE r.id_usuario_reporta = @id_usuario_reporta
        ORDER BY r.fecha_reporte DESC, r.id_reporte DESC
        `
      )

    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/reportes:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.get('/api/reportes/:id_reporte', ...requireAnyAuth, async (req, res) => {
  const id_reporte = Number.parseInt(String(req.params?.id_reporte || ''), 10)
  const userId = req.user?.sub

  if (!userId) return res.status(401).json({ message: 'No autorizado' })
  if (Number.isNaN(id_reporte)) {
    return badRequest(res, 'El id_reporte es obligatorio')
  }

  try {
    const pool = await getPool()
    if (!pool) {
      return res.status(500).json({ message: 'Backend sin configuración de BD' })
    }

    const result = await pool
      .request()
      .input('id_reporte', sql.Int, id_reporte)
      .input('id_usuario_reporta', sql.Char(15), userId)
      .query(
        `
        SELECT
          r.id_reporte,
          r.id_edificio,
          r.id_sublocalizacion,
          r.id_ci,
          r.descripcion_falla,
          r.fecha_reporte,
          r.estado,
          e.nombre_edificio,
          s.nombre_sublocalizacion,
          ci.nombre_equipo,
          ci.numero_serie,
          u.nombre_completo AS usuario_reporta
        FROM Reportes r
        JOIN Edificios e ON e.id_edificio = r.id_edificio
        JOIN Sublocalizaciones s ON s.id_sublocalizacion = r.id_sublocalizacion
        LEFT JOIN Elementos_Configuracion ci ON ci.id_ci = r.id_ci
        LEFT JOIN Usuarios u ON u.id_usuario = r.id_usuario_reporta
        WHERE r.id_reporte = @id_reporte AND r.id_usuario_reporta = @id_usuario_reporta
        `
      )

    const row = result.recordset?.[0]
    if (!row) {
      return res.status(404).json({ message: 'Reporte no encontrado' })
    }

    return res.status(200).json(row)
  } catch (err) {
    console.error('Error en GET /api/reportes/:id_reporte:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body || {}

  if (!usuario || !password) {
    return res.status(400).json({ message: 'Faltan credenciales' })
  }

  try {
    const pool = await getPool()
    if (!pool) {
      return res.status(500).json({
        message:
          'Backend sin configuración de BD (crea .env con DB_SERVER/DB_USER/DB_PASSWORD/DB_DATABASE)',
      })
    }

    const result = await pool
      .request()
      .input('usuario', sql.VarChar, usuario)
      .query(
        `
        SELECT
          u.id_usuario,
          u.correo,
          u.password_hash,
          r.nombre_rol
        FROM Usuarios u
        JOIN Roles r ON r.id_rol = u.id_rol
        WHERE u.correo = @usuario
        `
      )

    const row = result?.recordset?.[0]
    if (!row) {
      return res.status(401).json({ message: 'Credenciales incorrectas' })
    }

    const ok = await bcrypt.compare(password, row.password_hash)
    if (!ok) {
      return res.status(401).json({ message: 'Credenciales incorrectas' })
    }

    const rol = row.nombre_rol
    const token = jwt.sign(
      { sub: row.id_usuario, correo: row.correo, rol },
      JWT_SECRET,
      { expiresIn: '1h' }
    )

    return res.status(200).json({
      message: 'Login exitoso',
      token,
      rol,
    })
  } catch (err) {
    console.error('Error en /api/login:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.get('/api/me', (req, res) => {
  const token = getJwtFromHeader(req)
  if (!token) return res.status(401).json({ message: 'No autorizado' })

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    return res.status(200).json({
      id_usuario: payload.sub,
      correo: payload.correo,
      rol: payload.rol,
    })
  } catch {
    return res.status(401).json({ message: 'Token inválido' })
  }
})

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`)
})
