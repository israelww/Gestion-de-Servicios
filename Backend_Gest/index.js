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
const ROLE_ADMIN = 'Administrador'
const ROLE_TECNICO = 'Tecnico'
const PRIORIDADES_VALIDAS = ['Baja', 'Media', 'Alta', 'Critica']

app.use(
  cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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
const requireAdmin = [requireAuth, requireRole([ROLE_ADMIN])]
const requireTecnico = [requireAuth, requireRole([ROLE_TECNICO])]
const requireAdminOrTecnico = [requireAuth, requireRole([ROLE_ADMIN, ROLE_TECNICO])]

function requireRole(rolesPermitidos) {
  return (req, res, next) => {
    const rol = toTrimmedString(req.user?.rol)
    if (!rol || !rolesPermitidos.includes(rol)) {
      return res.status(403).json({ message: 'No autorizado para esta accion' })
    }
    return next()
  }
}

function isForeignKeyError(err) {
  return Number(err?.number) === 547
}

async function findNextMaintenanceId(request) {
  const result = await request.query(`
    SELECT id_mantenimiento
    FROM Mantenimientos
    WHERE id_mantenimiento LIKE 'MT%'
  `)

  const maxSequence = (result.recordset || []).reduce((max, row) => {
    const suffix = Number.parseInt(String(row.id_mantenimiento || '').replace(/^MT/, ''), 10)
    return Number.isNaN(suffix) ? max : Math.max(max, suffix)
  }, 0)

  return `MT${String(maxSequence + 1).padStart(8, '0')}`
}

let workflowSchemaReady = false
async function ensureWorkflowColumns(pool) {
  if (workflowSchemaReady) return

  await pool.request().query(`
    IF COL_LENGTH('Mantenimientos', 'estado') IS NULL
    BEGIN
      ALTER TABLE Mantenimientos
      ADD estado VARCHAR(20) NOT NULL CONSTRAINT DF_Mantenimientos_estado DEFAULT 'Pendiente'
    END;

    IF COL_LENGTH('Mantenimientos', 'prioridad') IS NULL
    BEGIN
      ALTER TABLE Mantenimientos
      ADD prioridad VARCHAR(20) NULL
    END;

    IF COL_LENGTH('Mantenimientos', 'id_tecnico_asignado') IS NULL
    BEGIN
      ALTER TABLE Mantenimientos
      ADD id_tecnico_asignado CHAR(15) NULL
    END;

    IF COL_LENGTH('Mantenimientos', 'descripcion_solucion') IS NULL
    BEGIN
      ALTER TABLE Mantenimientos
      ADD descripcion_solucion VARCHAR(1000) NULL
    END;

    IF COL_LENGTH('Mantenimientos', 'fecha_cierre') IS NULL
    BEGIN
      ALTER TABLE Mantenimientos
      ADD fecha_cierre DATETIME NULL
    END;

    IF COL_LENGTH('Mantenimientos', 'calificacion_servicio') IS NULL
    BEGIN
      ALTER TABLE Mantenimientos
      ADD calificacion_servicio TINYINT NULL
    END;

    IF COL_LENGTH('Mantenimientos', 'comentario_valoracion') IS NULL
    BEGIN
      ALTER TABLE Mantenimientos
      ADD comentario_valoracion VARCHAR(500) NULL
    END;

    IF COL_LENGTH('Mantenimientos', 'fecha_valoracion') IS NULL
    BEGIN
      ALTER TABLE Mantenimientos
      ADD fecha_valoracion DATETIME NULL
    END;
  `)

  workflowSchemaReady = true
}

let ciHistorySchemaReady = false
async function ensureCiHistoryTable(pool) {
  if (ciHistorySchemaReady) return

  await pool.request().query(`
    IF OBJECT_ID('Historial_Cambios_CI', 'U') IS NULL
    BEGIN
      CREATE TABLE Historial_Cambios_CI (
        id_historial INT IDENTITY(1,1) PRIMARY KEY,
        id_ci VARCHAR(25) NOT NULL,
        id_mantenimiento CHAR(10) NULL,
        fecha_cambio DATETIME NOT NULL CONSTRAINT DF_HistorialCI_fecha DEFAULT GETDATE(),
        numero_transaccion VARCHAR(40) NULL,
        origen_transaccion VARCHAR(40) NULL,
        tecnico VARCHAR(120) NOT NULL,
        detalle_cambio VARCHAR(500) NOT NULL,
        fecha_registro DATETIME NOT NULL CONSTRAINT DF_HistorialCI_registro DEFAULT GETDATE(),
        CONSTRAINT FK_HistorialCI_CI FOREIGN KEY (id_ci) REFERENCES Elementos_Configuracion(id_ci),
        CONSTRAINT FK_HistorialCI_Mantenimiento FOREIGN KEY (id_mantenimiento) REFERENCES Mantenimientos(id_mantenimiento)
      );
    END;

    IF COL_LENGTH('Historial_Cambios_CI', 'id_mantenimiento') IS NULL
    BEGIN
      ALTER TABLE Historial_Cambios_CI
      ADD id_mantenimiento CHAR(10) NULL
    END;

    IF NOT EXISTS (
      SELECT 1
      FROM sys.foreign_keys
      WHERE name = 'FK_HistorialCI_Mantenimiento'
    )
    BEGIN
      ALTER TABLE Historial_Cambios_CI
      ADD CONSTRAINT FK_HistorialCI_Mantenimiento
      FOREIGN KEY (id_mantenimiento) REFERENCES Mantenimientos(id_mantenimiento)
    END;
  `)

  ciHistorySchemaReady = true
}

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

app.put('/api/edificios/:id_edificio', ...requireAdmin, async (req, res) => {
  const id_edificio = toTrimmedString(req.params?.id_edificio)
  const nombre_edificio = toTrimmedString(req.body?.nombre_edificio)
  const descripcion_edificio = toTrimmedString(req.body?.descripcion_edificio)

  if (!id_edificio || !nombre_edificio || !descripcion_edificio) {
    return badRequest(res, 'id_edificio, nombre_edificio y descripcion_edificio son obligatorios')
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuraciÃ³n de BD' })

    const updateResult = await pool
      .request()
      .input('id_edificio', sql.Char(10), id_edificio)
      .input('nombre_edificio', sql.VarChar(50), nombre_edificio)
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

app.delete('/api/edificios/:id_edificio', ...requireAdmin, async (req, res) => {
  const id_edificio = toTrimmedString(req.params?.id_edificio)
  if (!id_edificio) return badRequest(res, 'El id_edificio es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuraciÃ³n de BD' })

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

app.put('/api/sublocalizaciones/:id_sublocalizacion', ...requireAdmin, async (req, res) => {
  const id_sublocalizacion = toTrimmedString(req.params?.id_sublocalizacion)
  const nombre_sublocalizacion = toTrimmedString(req.body?.nombre_sublocalizacion)

  if (!id_sublocalizacion || !nombre_sublocalizacion) {
    return badRequest(res, 'id_sublocalizacion y nombre_sublocalizacion son obligatorios')
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuraciÃ³n de BD' })

    const updateResult = await pool
      .request()
      .input('id_sublocalizacion', sql.Char(10), id_sublocalizacion)
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

app.delete('/api/sublocalizaciones/:id_sublocalizacion', ...requireAdmin, async (req, res) => {
  const id_sublocalizacion = toTrimmedString(req.params?.id_sublocalizacion)
  if (!id_sublocalizacion) return badRequest(res, 'El id_sublocalizacion es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuraciÃ³n de BD' })

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
        SELECT
          ci.id_ci,
          ci.nombre_equipo,
          ci.numero_serie,
          tc.nombre_tipo
        FROM Elementos_Configuracion ci
        JOIN Tipo_CI tc ON tc.id_tipo_ci = ci.id_tipo_ci
        WHERE ci.id_sublocalizacion = @id_sublocalizacion
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

app.get('/api/ci/:id_ci/detalle', ...requireAdminOrTecnico, async (req, res) => {
  const id_ci = toTrimmedString(req.params?.id_ci)
  if (!id_ci) return badRequest(res, 'El id_ci es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) {
      return res.status(500).json({ message: 'Backend sin configuraciÃ³n de BD' })
    }

    const result = await pool
      .request()
      .input('id_ci', sql.VarChar(25), id_ci)
      .query(`
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
      `)

    const row = result.recordset?.[0]
    if (!row) return res.status(404).json({ message: 'El CI no existe' })

    return res.status(200).json(row)
  } catch (err) {
    console.error('Error en GET /api/ci/:id_ci/detalle:', err)
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
      .input('id_ci', sql.VarChar(25), finalIdCi)
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

app.put('/api/ci/:id_ci', ...requireAdmin, async (req, res) => {
  const id_ci = toTrimmedString(req.params?.id_ci)
  const payload = {
    numero_serie: toTrimmedString(req.body?.numero_serie),
    nombre_equipo: toTrimmedString(req.body?.nombre_equipo),
    modelo: toTrimmedString(req.body?.modelo),
    id_marca: toTrimmedString(req.body?.id_marca),
    id_usuario_responsable: toTrimmedString(req.body?.id_usuario_responsable),
  }

  if (!id_ci || !payload.numero_serie || !payload.id_marca) {
    return badRequest(res, 'id_ci, numero_serie e id_marca son obligatorios')
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuraciÃ³n de BD' })

    const existingResult = await pool
      .request()
      .input('id_ci', sql.VarChar(25), id_ci)
      .query(`
        SELECT id_ci
        FROM Elementos_Configuracion
        WHERE id_ci = @id_ci
      `)
    if (!existingResult.recordset?.[0]) {
      return res.status(404).json({ message: 'El CI no existe' })
    }

    if (payload.id_usuario_responsable) {
      const usuarioExists = await existsById(
        pool.request(),
        'Usuarios',
        'id_usuario',
        'id_usuario',
        payload.id_usuario_responsable
      )
      if (!usuarioExists) {
        return res.status(404).json({ message: 'El usuario responsable no existe' })
      }
    }

    await pool
      .request()
      .input('id_ci', sql.VarChar(25), id_ci)
      .input('numero_serie', sql.VarChar(50), payload.numero_serie)
      .input('nombre_equipo', sql.VarChar(100), payload.nombre_equipo || null)
      .input('modelo', sql.VarChar(100), payload.modelo || null)
      .input('id_marca', sql.Char(10), payload.id_marca)
      .input('id_usuario_responsable', sql.Char(15), payload.id_usuario_responsable || null)
      .query(`
        UPDATE Elementos_Configuracion
        SET numero_serie = @numero_serie,
            nombre_equipo = @nombre_equipo,
            modelo = @modelo,
            id_marca = @id_marca,
            id_usuario_responsable = @id_usuario_responsable
        WHERE id_ci = @id_ci
      `)

    return res.status(200).json({ message: 'CI actualizado correctamente' })
  } catch (err) {
    console.error('Error en PUT /api/ci/:id_ci:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.delete('/api/ci/:id_ci', ...requireAdmin, async (req, res) => {
  const id_ci = toTrimmedString(req.params?.id_ci)
  if (!id_ci) return badRequest(res, 'El id_ci es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuraciÃ³n de BD' })

    const deleteResult = await pool
      .request()
      .input('id_ci', sql.VarChar(25), id_ci)
      .query(`DELETE FROM Elementos_Configuracion WHERE id_ci = @id_ci`)

    if (!deleteResult.rowsAffected?.[0]) {
      return res.status(404).json({ message: 'El CI no existe' })
    }

    return res.status(200).json({ message: 'CI eliminado correctamente' })
  } catch (err) {
    if (isForeignKeyError(err)) {
      return res.status(409).json({ message: 'No se puede eliminar: tiene registros relacionados' })
    }
    console.error('Error en DELETE /api/ci/:id_ci:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.get('/api/ci/:id_ci/historial-cambios', ...requireAdminOrTecnico, async (req, res) => {
  const id_ci = toTrimmedString(req.params?.id_ci)
  if (!id_ci) return badRequest(res, 'El id_ci es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuraciÃ³n de BD' })

    await ensureCiHistoryTable(pool)

    const exists = await existsById(
      pool.request(),
      'Elementos_Configuracion',
      'id_ci',
      'id_ci',
      id_ci
    )
    if (!exists) return res.status(404).json({ message: 'El CI no existe' })

      const result = await pool
        .request()
        .input('id_ci', sql.VarChar(25), id_ci)
        .query(`
          SELECT
            id_historial,
            id_ci,
            id_mantenimiento,
            fecha_cambio,
            numero_transaccion,
            origen_transaccion,
            tecnico,
            detalle_cambio,
          fecha_registro
        FROM Historial_Cambios_CI
        WHERE id_ci = @id_ci
        ORDER BY fecha_cambio DESC, id_historial DESC
      `)

    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/ci/:id_ci/historial-cambios:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.post('/api/ci/:id_ci/historial-cambios', ...requireTecnico, async (req, res) => {
  const id_ci = toTrimmedString(req.params?.id_ci)
  const payload = {
    fecha_cambio: toTrimmedString(req.body?.fecha_cambio),
    id_mantenimiento: toTrimmedString(req.body?.id_mantenimiento),
    detalle_cambio: toTrimmedString(req.body?.detalle_cambio),
  }

  if (!id_ci) return badRequest(res, 'El id_ci es obligatorio')
  if (!payload.id_mantenimiento || !payload.detalle_cambio) {
    return badRequest(res, 'id_mantenimiento y detalle_cambio son obligatorios')
  }

  const parsedDate = payload.fecha_cambio ? new Date(payload.fecha_cambio) : new Date()
  if (Number.isNaN(parsedDate.getTime())) {
    return badRequest(res, 'fecha_cambio no es una fecha valida')
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuraciÃ³n de BD' })

    await ensureCiHistoryTable(pool)

    const exists = await existsById(
      pool.request(),
      'Elementos_Configuracion',
      'id_ci',
      'id_ci',
      id_ci
      )
      if (!exists) return res.status(404).json({ message: 'El CI no existe' })

      const mantenimientoResult = await pool
        .request()
        .input('id_mantenimiento', sql.Char(10), payload.id_mantenimiento)
        .input('id_ci', sql.VarChar(25), id_ci)
        .input('id_tecnico_asignado', sql.Char(15), req.user?.sub)
        .query(`
          SELECT id_mantenimiento, tipo_mantenimiento
          FROM Mantenimientos
          WHERE id_mantenimiento = @id_mantenimiento
            AND id_ci = @id_ci
            AND id_tecnico_asignado = @id_tecnico_asignado
        `)

      const mantenimiento = mantenimientoResult.recordset?.[0]
      if (!mantenimiento) {
        return res.status(404).json({
          message: 'No se encontro el mantenimiento asignado para este CI',
        })
      }

      const tipoMantenimiento = toTrimmedString(mantenimiento.tipo_mantenimiento)
      const origen = tipoMantenimiento.toLowerCase() === 'preventivo' ? 'Preventivo' : 'Correctivo'
      const numeroTransaccion = `${origen === 'Preventivo' ? 'PRE' : 'COR'}-${payload.id_mantenimiento}`

      await pool
        .request()
        .input('id_ci', sql.VarChar(25), id_ci)
        .input('id_mantenimiento', sql.Char(10), payload.id_mantenimiento)
        .input('fecha_cambio', sql.DateTime, parsedDate)
        .input('numero_transaccion', sql.VarChar(40), numeroTransaccion)
        .input('origen_transaccion', sql.VarChar(40), origen)
        .input('tecnico', sql.VarChar(120), toTrimmedString(req.user?.sub))
        .input('detalle_cambio', sql.VarChar(500), payload.detalle_cambio)
        .query(`
          INSERT INTO Historial_Cambios_CI (
            id_ci,
            id_mantenimiento,
            fecha_cambio,
            numero_transaccion,
            origen_transaccion,
            tecnico,
            detalle_cambio
          )
          VALUES (
            @id_ci,
            @id_mantenimiento,
            @fecha_cambio,
            @numero_transaccion,
            @origen_transaccion,
            @tecnico,
            @detalle_cambio
          )
        `)

      return res.status(201).json({ message: 'Cambio registrado correctamente' })
  } catch (err) {
    console.error('Error en POST /api/ci/:id_ci/historial-cambios:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.post('/api/admin/ci/:id_ci/ticket-preventivo', ...requireAdmin, async (req, res) => {
  const id_ci = toTrimmedString(req.params?.id_ci)
  const descripcion_tarea = toTrimmedString(req.body?.descripcion_tarea)

  if (!id_ci || !descripcion_tarea) {
    return badRequest(res, 'id_ci y descripcion_tarea son obligatorios')
  }

  const pool = await getPool()
  if (!pool) return res.status(500).json({ message: 'Backend sin configuraciÃ³n de BD' })

  await ensureWorkflowColumns(pool)
  await ensureCiHistoryTable(pool)

  const transaction = new sql.Transaction(pool)
  let transactionFinished = false

  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)

    const exists = await existsById(
      new sql.Request(transaction),
      'Elementos_Configuracion',
      'id_ci',
      'id_ci',
      id_ci
    )
    if (!exists) {
      await transaction.rollback()
      return res.status(404).json({ message: 'El CI no existe' })
    }

    const id_mantenimiento = await findNextMaintenanceId(new sql.Request(transaction))

    await new sql.Request(transaction)
      .input('id_mantenimiento', sql.Char(10), id_mantenimiento)
      .input('id_ci', sql.VarChar(25), id_ci)
      .input('fecha_mantenimiento', sql.DateTime, new Date())
      .input('tipo_mantenimiento', sql.VarChar(50), 'Preventivo')
      .input('descripcion_tarea', sql.VarChar(sql.MAX), descripcion_tarea)
      .input('id_usuario_reporta', sql.Char(15), req.user?.sub)
      .input('estado', sql.VarChar(20), 'Pendiente')
      .query(`
        INSERT INTO Mantenimientos (
          id_mantenimiento,
          id_ci,
          fecha_mantenimiento,
          tipo_mantenimiento,
          descripcion_tarea,
          id_usuario_reporta,
          estado
        )
        VALUES (
          @id_mantenimiento,
          @id_ci,
          @fecha_mantenimiento,
          @tipo_mantenimiento,
          @descripcion_tarea,
          @id_usuario_reporta,
          @estado
        )
      `)

    await new sql.Request(transaction)
      .input('id_ci', sql.VarChar(25), id_ci)
      .input('id_mantenimiento', sql.Char(10), id_mantenimiento)
      .input('fecha_cambio', sql.DateTime, new Date())
      .input('numero_transaccion', sql.VarChar(40), `PRE-${id_mantenimiento}`)
      .input('origen_transaccion', sql.VarChar(40), 'Preventivo')
      .input('tecnico', sql.VarChar(120), toTrimmedString(req.user?.sub))
      .input('detalle_cambio', sql.VarChar(500), `Ticket preventivo creado: ${descripcion_tarea}`)
      .query(`
        INSERT INTO Historial_Cambios_CI (
          id_ci,
          id_mantenimiento,
          fecha_cambio,
          numero_transaccion,
          origen_transaccion,
          tecnico,
          detalle_cambio
        )
        VALUES (
          @id_ci,
          @id_mantenimiento,
          @fecha_cambio,
          @numero_transaccion,
          @origen_transaccion,
          @tecnico,
          @detalle_cambio
        )
      `)

    await transaction.commit()
    transactionFinished = true

    return res.status(201).json({
      message: 'Ticket preventivo creado correctamente',
      id_mantenimiento,
    })
  } catch (err) {
    if (!transactionFinished) {
      try {
        await transaction.rollback()
      } catch {}
    }
    console.error('Error en POST /api/admin/ci/:id_ci/ticket-preventivo:', err)
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

  await ensureWorkflowColumns(pool)

  const transaction = new sql.Transaction(pool)
  let transactionFinished = false

  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
    const request = new sql.Request(transaction)

    const ciCheck = await request
      .input('id_ci', sql.VarChar(25), payload.id_ci)
      .input('id_sublocalizacion', sql.Char(10), payload.id_sublocalizacion)
      .input('id_edificio', sql.Char(10), payload.id_edificio)
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
      return res.status(409).json({
        message: 'El CI no pertenece a la sublocalizacion y edificio seleccionados',
      })
    }

    const id_mantenimiento = await findNextMaintenanceId(new sql.Request(transaction))

    await new sql.Request(transaction)
      .input('id_mantenimiento', sql.Char(10), id_mantenimiento)
      .input('id_ci', sql.VarChar(25), payload.id_ci)
      .input('fecha_mantenimiento', sql.DateTime, new Date())
      .input('tipo_mantenimiento', sql.VarChar(50), 'Correctivo')
      .input('descripcion_tarea', sql.VarChar(sql.MAX), payload.descripcion_falla)
      .input('id_usuario_reporta', sql.Char(15), req.user?.sub)
      .input('estado', sql.VarChar(20), 'Pendiente')
      .query(`
        INSERT INTO Mantenimientos (
          id_mantenimiento,
          id_ci,
          fecha_mantenimiento,
          tipo_mantenimiento,
          descripcion_tarea,
          id_usuario_reporta,
          estado
        )
        VALUES (
          @id_mantenimiento,
          @id_ci,
          @fecha_mantenimiento,
          @tipo_mantenimiento,
          @descripcion_tarea,
          @id_usuario_reporta,
          @estado
        )
      `)

    await transaction.commit()
    transactionFinished = true

    return res.status(201).json({
      message: 'Reporte creado correctamente',
      id_reporte: id_mantenimiento,
      estado: 'Pendiente',
    })
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

app.get('/api/reportes', ...requireAnyAuth, async (req, res) => {
  const userId = req.user?.sub
  if (!userId) return res.status(401).json({ message: 'No autorizado' })

  try {
    const pool = await getPool()
    if (!pool) {
      return res.status(500).json({ message: 'Backend sin configuración de BD' })
    }

    await ensureWorkflowColumns(pool)

    const result = await pool
      .request()
      .input('id_usuario_reporta', sql.Char(15), userId)
      .query(`
        SELECT
          m.id_mantenimiento AS id_reporte,
          m.id_ci,
          m.tipo_mantenimiento,
          m.descripcion_tarea AS descripcion_falla,
          m.descripcion_solucion,
          m.fecha_cierre,
          m.calificacion_servicio,
          m.comentario_valoracion,
          m.fecha_valoracion,
          m.fecha_mantenimiento AS fecha_reporte,
          COALESCE(m.estado, 'Pendiente') AS estado,
          COALESCE(m.prioridad, 'Sin priorizar') AS prioridad,
          e.nombre_edificio,
          s.nombre_sublocalizacion,
          ci.nombre_equipo,
          ci.numero_serie,
          t.nombre_completo AS tecnico_asignado
        FROM Mantenimientos m
        JOIN Elementos_Configuracion ci ON ci.id_ci = m.id_ci
        JOIN Sublocalizaciones s ON s.id_sublocalizacion = ci.id_sublocalizacion
        JOIN Edificios e ON e.id_edificio = s.id_edificio
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

app.put('/api/tecnico/servicios/:id_reporte/completar', ...requireTecnico, async (req, res) => {
  const tecnicoId = req.user?.sub
  const id_reporte = toTrimmedString(req.params?.id_reporte)
  const descripcion_solucion = toTrimmedString(req.body?.descripcion_solucion)

  if (!tecnicoId) return res.status(401).json({ message: 'No autorizado' })
  if (!id_reporte || !descripcion_solucion) {
    return badRequest(res, 'id_reporte y descripcion_solucion son obligatorios')
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuraciÃ³n de BD' })

    await ensureWorkflowColumns(pool)

    const updateResult = await pool
      .request()
      .input('id_reporte', sql.Char(10), id_reporte)
      .input('id_tecnico_asignado', sql.Char(15), tecnicoId)
      .input('descripcion_solucion', sql.VarChar(1000), descripcion_solucion)
      .input('fecha_cierre', sql.DateTime, new Date())
      .query(`
        UPDATE Mantenimientos
        SET
          descripcion_solucion = @descripcion_solucion,
          fecha_cierre = @fecha_cierre,
          estado = 'Cerrado'
        WHERE id_mantenimiento = @id_reporte
          AND id_tecnico_asignado = @id_tecnico_asignado
      `)

    if (!updateResult.rowsAffected?.[0]) {
      return res.status(404).json({
        message: 'Servicio no encontrado o no asignado al tecnico actual',
      })
    }

    return res.status(200).json({ message: 'Ticket completado correctamente' })
  } catch (err) {
    console.error('Error en PUT /api/tecnico/servicios/:id_reporte/completar:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.get('/api/reportes/:id_reporte', ...requireAnyAuth, async (req, res) => {
  const id_reporte = toTrimmedString(req.params?.id_reporte)
  const userId = req.user?.sub

  if (!userId) return res.status(401).json({ message: 'No autorizado' })
  if (!id_reporte) return badRequest(res, 'El id_reporte es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) {
      return res.status(500).json({ message: 'Backend sin configuración de BD' })
    }

    await ensureWorkflowColumns(pool)

    const result = await pool
      .request()
      .input('id_reporte', sql.Char(10), id_reporte)
      .input('id_usuario_reporta', sql.Char(15), userId)
      .query(`
        SELECT
          m.id_mantenimiento AS id_reporte,
          e.id_edificio,
          s.id_sublocalizacion,
          m.id_ci,
          m.descripcion_tarea AS descripcion_falla,
          m.fecha_mantenimiento AS fecha_reporte,
          COALESCE(m.estado, 'Pendiente') AS estado,
          COALESCE(m.prioridad, 'Sin priorizar') AS prioridad,
          e.nombre_edificio,
          s.nombre_sublocalizacion,
          ci.nombre_equipo,
          ci.numero_serie,
          u.nombre_completo AS usuario_reporta,
          t.nombre_completo AS tecnico_asignado,
          m.calificacion_servicio,
          m.comentario_valoracion,
          m.fecha_valoracion
        FROM Mantenimientos m
        JOIN Elementos_Configuracion ci ON ci.id_ci = m.id_ci
        JOIN Sublocalizaciones s ON s.id_sublocalizacion = ci.id_sublocalizacion
        JOIN Edificios e ON e.id_edificio = s.id_edificio
        LEFT JOIN Usuarios u ON u.id_usuario = m.id_usuario_reporta
        LEFT JOIN Usuarios t ON t.id_usuario = m.id_tecnico_asignado
        WHERE m.id_mantenimiento = @id_reporte
          AND m.id_usuario_reporta = @id_usuario_reporta
      `)

    const row = result.recordset?.[0]
    if (!row) return res.status(404).json({ message: 'Reporte no encontrado' })

    return res.status(200).json(row)
  } catch (err) {
    console.error('Error en GET /api/reportes/:id_reporte:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.put('/api/reportes/:id_reporte/valoracion', ...requireAnyAuth, async (req, res) => {
  const id_reporte = toTrimmedString(req.params?.id_reporte)
  const userId = req.user?.sub
  const calificacion = Number.parseInt(String(req.body?.calificacion_servicio ?? ''), 10)
  const comentario = toTrimmedString(req.body?.comentario_valoracion)

  if (!userId) return res.status(401).json({ message: 'No autorizado' })
  if (!id_reporte) return badRequest(res, 'El id_reporte es obligatorio')
  if (!Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) {
    return badRequest(res, 'calificacion_servicio debe estar entre 1 y 5')
  }

  try {
    const pool = await getPool()
    if (!pool) {
      return res.status(500).json({ message: 'Backend sin configuraciÃ³n de BD' })
    }

    await ensureWorkflowColumns(pool)

    const result = await pool
      .request()
      .input('id_reporte', sql.Char(10), id_reporte)
      .input('id_usuario_reporta', sql.Char(15), userId)
      .input('calificacion_servicio', sql.TinyInt, calificacion)
      .input('comentario_valoracion', sql.VarChar(500), comentario || null)
      .input('fecha_valoracion', sql.DateTime, new Date())
      .query(`
        UPDATE Mantenimientos
        SET
          calificacion_servicio = @calificacion_servicio,
          comentario_valoracion = @comentario_valoracion,
          fecha_valoracion = @fecha_valoracion,
          estado = 'Liberado'
        WHERE id_mantenimiento = @id_reporte
          AND id_usuario_reporta = @id_usuario_reporta
          AND COALESCE(estado, 'Pendiente') = 'Cerrado'
      `)

    if (!result.rowsAffected?.[0]) {
      return res.status(404).json({
        message: 'Reporte no encontrado, no es tuyo o aun no esta cerrado',
      })
    }

    // Obtener id_ci para actualizar el activo
    const ciResult = await pool
      .request()
      .input('id_reporte', sql.Char(10), id_reporte)
      .query(`
        SELECT id_ci FROM Mantenimientos WHERE id_mantenimiento = @id_reporte
      `)

    if (ciResult.recordset?.[0]?.id_ci) {
      await pool
        .request()
        .input('id_ci', sql.VarChar(25), ciResult.recordset[0].id_ci)
        .query(`
          UPDATE Elementos_Configuracion SET estado = 'Activo' WHERE id_ci = @id_ci
        `)
    }

    return res.status(200).json({ message: 'Evaluacion completada y folio liberado correctamente' })
  } catch (err) {
    console.error('Error en PUT /api/reportes/:id_reporte/valoracion:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.get('/api/admin/reportes/pendientes', ...requireAdmin, async (_req, res) => {
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
        COALESCE(m.prioridad, 'Sin priorizar') AS prioridad,
        e.nombre_edificio,
        s.nombre_sublocalizacion,
        ci.nombre_equipo,
        ci.numero_serie,
        u.id_usuario AS id_usuario_reporta,
        u.nombre_completo AS usuario_reporta
      FROM Mantenimientos m
      JOIN Elementos_Configuracion ci ON ci.id_ci = m.id_ci
      JOIN Sublocalizaciones s ON s.id_sublocalizacion = ci.id_sublocalizacion
      JOIN Edificios e ON e.id_edificio = s.id_edificio
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

app.put('/api/admin/reportes/:id_reporte/asignacion', ...requireAdmin, async (req, res) => {
  const id_reporte = toTrimmedString(req.params?.id_reporte)
  const prioridad = toTrimmedString(req.body?.prioridad)
  const id_tecnico_asignado = toTrimmedString(req.body?.id_tecnico_asignado)

  if (!id_reporte || !prioridad || !id_tecnico_asignado) {
    return badRequest(res, 'id_reporte, prioridad e id_tecnico_asignado son obligatorios')
  }
  if (!PRIORIDADES_VALIDAS.includes(prioridad)) {
    return badRequest(res, 'La prioridad no es valida')
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
      .input('id_reporte', sql.Char(10), id_reporte)
      .input('prioridad', sql.VarChar(20), prioridad)
      .input('id_tecnico_asignado', sql.Char(15), id_tecnico_asignado)
      .query(`
        UPDATE Mantenimientos
        SET prioridad = @prioridad,
            id_tecnico_asignado = @id_tecnico_asignado,
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

app.get('/api/tecnico/servicios', ...requireTecnico, async (req, res) => {
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
          m.id_ci,
          m.descripcion_tarea AS descripcion_falla,
          m.fecha_mantenimiento AS fecha_reporte,
          COALESCE(m.estado, 'Pendiente') AS estado,
          COALESCE(m.prioridad, 'Sin priorizar') AS prioridad,
          e.nombre_edificio,
          s.nombre_sublocalizacion,
          ci.nombre_equipo,
          ci.numero_serie,
          u.nombre_completo AS usuario_reporta
        FROM Mantenimientos m
        JOIN Elementos_Configuracion ci ON ci.id_ci = m.id_ci
        JOIN Sublocalizaciones s ON s.id_sublocalizacion = ci.id_sublocalizacion
        JOIN Edificios e ON e.id_edificio = s.id_edificio
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

app.get('/api/usuarios/tecnicos', ...requireAdmin, async (_req, res) => {
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

app.get('/api/roles', ...requireAdmin, async (_req, res) => {
  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuraciÃ³n de BD' })

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

app.get('/api/usuarios', ...requireAdmin, async (_req, res) => {
  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    const result = await pool.request().query(`
      SELECT
        u.id_usuario,
        u.nombre_completo,
        u.correo,
        u.id_rol,
        r.nombre_rol
      FROM Usuarios u
      JOIN Roles r ON r.id_rol = u.id_rol
      ORDER BY u.nombre_completo
    `)
    return res.status(200).json(result.recordset)
  } catch (err) {
    console.error('Error en GET /api/usuarios:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.post('/api/usuarios', ...requireAdmin, async (req, res) => {
  const payload = {
    id_usuario: toTrimmedString(req.body?.id_usuario),
    nombre_completo: toTrimmedString(req.body?.nombre_completo),
    correo: toTrimmedString(req.body?.correo),
    password: toTrimmedString(req.body?.password),
    id_rol: toTrimmedString(req.body?.id_rol),
  }

  if (!payload.id_usuario || !payload.nombre_completo || !payload.correo || !payload.password || !payload.id_rol) {
    return badRequest(res, 'id_usuario, nombre_completo, correo, password e id_rol son obligatorios')
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    const duplicatedUser = await existsById(
      pool.request(),
      'Usuarios',
      'id_usuario',
      'id_usuario',
      payload.id_usuario
    )
    if (duplicatedUser) return res.status(409).json({ message: 'El id_usuario ya existe' })

    const duplicatedMail = await pool
      .request()
      .input('correo', sql.VarChar(100), payload.correo)
      .query(`SELECT 1 AS found FROM Usuarios WHERE correo = @correo`)
    if (duplicatedMail.recordset?.[0]?.found) {
      return res.status(409).json({ message: 'El correo ya existe' })
    }

    const password_hash = await bcrypt.hash(payload.password, 10)
    await pool
      .request()
      .input('id_usuario', sql.Char(15), payload.id_usuario)
      .input('nombre_completo', sql.VarChar(150), payload.nombre_completo)
      .input('correo', sql.VarChar(100), payload.correo)
      .input('password_hash', sql.VarChar(255), password_hash)
      .input('id_rol', sql.Char(10), payload.id_rol)
      .query(`
        INSERT INTO Usuarios (id_usuario, nombre_completo, correo, password_hash, id_rol)
        VALUES (@id_usuario, @nombre_completo, @correo, @password_hash, @id_rol)
      `)

    return res.status(201).json({ message: 'Usuario creado correctamente' })
  } catch (err) {
    console.error('Error en POST /api/usuarios:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.put('/api/usuarios/:id_usuario', ...requireAdmin, async (req, res) => {
  const id_usuario = toTrimmedString(req.params?.id_usuario)
  const payload = {
    nombre_completo: toTrimmedString(req.body?.nombre_completo),
    correo: toTrimmedString(req.body?.correo),
    password: toTrimmedString(req.body?.password),
    id_rol: toTrimmedString(req.body?.id_rol),
  }

  if (!id_usuario || !payload.nombre_completo || !payload.correo || !payload.id_rol) {
    return badRequest(res, 'id_usuario, nombre_completo, correo e id_rol son obligatorios')
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    const request = pool
      .request()
      .input('id_usuario', sql.Char(15), id_usuario)
      .input('nombre_completo', sql.VarChar(150), payload.nombre_completo)
      .input('correo', sql.VarChar(100), payload.correo)
      .input('id_rol', sql.Char(10), payload.id_rol)

    let setPasswordClause = ''
    if (payload.password) {
      const password_hash = await bcrypt.hash(payload.password, 10)
      request.input('password_hash', sql.VarChar(255), password_hash)
      setPasswordClause = ', password_hash = @password_hash'
    }

    const result = await request.query(`
      UPDATE Usuarios
      SET nombre_completo = @nombre_completo,
          correo = @correo,
          id_rol = @id_rol
          ${setPasswordClause}
      WHERE id_usuario = @id_usuario
    `)

    if (!result.rowsAffected?.[0]) {
      return res.status(404).json({ message: 'Usuario no encontrado' })
    }

    return res.status(200).json({ message: 'Usuario actualizado correctamente' })
  } catch (err) {
    console.error('Error en PUT /api/usuarios/:id_usuario:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.delete('/api/usuarios/:id_usuario', ...requireAdmin, async (req, res) => {
  const id_usuario = toTrimmedString(req.params?.id_usuario)
  if (!id_usuario) return badRequest(res, 'El id_usuario es obligatorio')
  if (id_usuario === req.user?.sub) {
    return res.status(409).json({ message: 'No puedes eliminar tu propio usuario' })
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    const result = await pool
      .request()
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
          u.id_rol,
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
    const token = jwt.sign({ sub: row.id_usuario, correo: row.correo, rol, id_rol: row.id_rol }, JWT_SECRET, {
      expiresIn: '1h',
    })

    return res.status(200).json({
      message: 'Login exitoso',
      token,
      rol,
      id_rol: row.id_rol,
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
      id_rol: payload.id_rol,
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
