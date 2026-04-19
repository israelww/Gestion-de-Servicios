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

function fourCharRoleCode(nombreRol) {
  const n = toTrimmedString(nombreRol)
  if (n === ROLE_ADMIN) return 'ADMN'
  if (n === ROLE_TECNICO) return 'TECN'
  const ascii = n
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
  const four = ascii.slice(0, 4)
  if (four.length >= 4) return four
  return `${four}XXXX`.slice(0, 4)
}

async function getRolNombre(pool, idRol) {
  const r = await pool
    .request()
    .input('id_rol', sql.Char(10), idRol)
    .query(`SELECT nombre_rol FROM Roles WHERE id_rol = @id_rol`)
  return toTrimmedString(r.recordset?.[0]?.nombre_rol)
}

async function findNextUsuarioIdForRole(request, roleCode) {
  const prefix = `USR_${roleCode}_`
  const pattern = `${prefix}%`
  const result = await request.input('usrPat', sql.VarChar(32), pattern).query(`
    SELECT id_usuario FROM Usuarios WHERE id_usuario LIKE @usrPat
  `)
  let max = 0
  for (const row of result.recordset || []) {
    const id = String(row.id_usuario || '')
    if (!id.startsWith(prefix)) continue
    const suffix = id.slice(prefix.length)
    const n = Number.parseInt(suffix, 10)
    if (!Number.isNaN(n)) max = Math.max(max, n)
  }
  return `${prefix}${String(max + 1).padStart(5, '0')}`
}

async function findNextTecnicoId(request) {
  const result = await request.query(`
    SELECT id_tecnico FROM Tecnico WHERE id_tecnico LIKE 'TC%'
  `)
  const max = (result.recordset || []).reduce((m, row) => {
    const raw = String(row.id_tecnico || '').replace(/^TC/i, '')
    const n = Number.parseInt(raw, 10)
    return Number.isNaN(n) ? m : Math.max(m, n)
  }, 0)
  return `TC${String(max + 1).padStart(8, '0')}`
}

function horarioTecnicoValido(horario) {
  if (!horario || typeof horario !== 'object' || Array.isArray(horario)) return false
  const dias = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']
  for (const d of dias) {
    const v = horario[d]
    if (!v) continue
    if (Array.isArray(v)) {
      for (const slot of v) {
        if (slot && toTrimmedString(slot.inicio) && toTrimmedString(slot.fin)) return true
      }
    } else if (v.activo && toTrimmedString(v.inicio) && toTrimmedString(v.fin)) return true
  }
  return false
}

function stringifyHorario(horario) {
  try {
    return JSON.stringify(horario)
  } catch {
    return null
  }
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

async function findNextAreaId(request) {
  const result = await request.query(`
    SELECT id_area
    FROM Areas
    WHERE id_area LIKE 'AR%'
  `)

  const maxSequence = (result.recordset || []).reduce((max, row) => {
    const suffix = Number.parseInt(String(row.id_area || '').replace(/^AR/, ''), 10)
    return Number.isNaN(suffix) ? max : Math.max(max, suffix)
  }, 0)

  return `AR${String(maxSequence + 1).padStart(8, '0')}`
}

async function findNextServicioId(request) {
  const result = await request.query(`
    SELECT id_servicio
    FROM Servicios
    WHERE id_servicio LIKE 'SV%'
  `)

  const maxSequence = (result.recordset || []).reduce((max, row) => {
    const suffix = Number.parseInt(String(row.id_servicio || '').replace(/^SV/, ''), 10)
    return Number.isNaN(suffix) ? max : Math.max(max, suffix)
  }, 0)

  return `SV${String(maxSequence + 1).padStart(8, '0')}`
}

let serviciosSchemaReady = false
async function ensureServiciosCatalogSchema(pool) {
  if (serviciosSchemaReady) return

  await pool.request().query(`
    IF OBJECT_ID('Areas', 'U') IS NULL
    BEGIN
      CREATE TABLE Areas (
        id_area CHAR(10) PRIMARY KEY,
        nombre_area VARCHAR(100) NOT NULL
      );
    END
  `)

  await pool.request().query(`
    IF OBJECT_ID('Servicios', 'U') IS NULL
    BEGIN
      CREATE TABLE Servicios (
        id_servicio CHAR(10) PRIMARY KEY,
        nombre VARCHAR(150) NOT NULL,
        id_area CHAR(10) NOT NULL,
        descripcion VARCHAR(MAX) NULL,
        tiempo_servicio INT NULL,
        prioridad VARCHAR(20) NOT NULL,
        CONSTRAINT FK_Servicios_Area FOREIGN KEY (id_area) REFERENCES Areas(id_area)
      );
    END
  `)

  await pool.request().query(`
    IF COL_LENGTH('Servicios', 'id_sublocalizacion') IS NOT NULL
    BEGIN
      DECLARE @fkName sysname;
      DECLARE fk_cursor CURSOR LOCAL FAST_FORWARD FOR
        SELECT fk.name
        FROM sys.foreign_keys fk
        JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
        WHERE fk.parent_object_id = OBJECT_ID('Servicios')
          AND fkc.parent_column_id = COLUMNPROPERTY(OBJECT_ID('Servicios'), 'id_sublocalizacion', 'ColumnId');

      OPEN fk_cursor;
      FETCH NEXT FROM fk_cursor INTO @fkName;
      WHILE @@FETCH_STATUS = 0
      BEGIN
        EXEC(N'ALTER TABLE Servicios DROP CONSTRAINT [' + @fkName + N']');
        FETCH NEXT FROM fk_cursor INTO @fkName;
      END
      CLOSE fk_cursor;
      DEALLOCATE fk_cursor;

      ALTER TABLE Servicios DROP COLUMN id_sublocalizacion;
    END
  `)

  await pool.request().query(`
    IF COL_LENGTH('Mantenimientos', 'id_servicio') IS NULL
    BEGIN
      ALTER TABLE Mantenimientos ADD id_servicio CHAR(10) NULL;
    END
  `)

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM Areas WHERE id_area = 'AR00000001')
      INSERT INTO Areas (id_area, nombre_area) VALUES ('AR00000001', N'General');
  `)

  const svcCount = await pool.request().query(`SELECT COUNT(*) AS c FROM Servicios`)
  if (!(Number(svcCount.recordset?.[0]?.c) > 0)) {
    const id_servicio = await findNextServicioId(pool.request())
    await pool
      .request()
      .input('id_servicio', sql.Char(10), id_servicio)
      .query(`
        INSERT INTO Servicios (id_servicio, nombre, id_area, descripcion, tiempo_servicio, prioridad)
        VALUES (@id_servicio, N'Servicio general', 'AR00000001', NULL, NULL, 'Media')
      `)
  }

  await pool.request().query(`
    UPDATE m
    SET m.id_servicio = (
      SELECT TOP 1 s.id_servicio
      FROM Servicios s
      ORDER BY s.id_servicio
    )
    FROM Mantenimientos m
    WHERE m.id_servicio IS NULL
  `)

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.foreign_keys fk
      WHERE fk.parent_object_id = OBJECT_ID('Mantenimientos')
        AND fk.referenced_object_id = OBJECT_ID('Servicios')
    )
    AND COL_LENGTH('Mantenimientos', 'id_servicio') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM Mantenimientos WHERE id_servicio IS NULL)
    BEGIN
      ALTER TABLE Mantenimientos WITH CHECK ADD CONSTRAINT FK_Mantenimientos_Servicio
        FOREIGN KEY (id_servicio) REFERENCES Servicios(id_servicio);
    END
  `)

  await pool.request().query(`
    IF EXISTS (
      SELECT 1
      FROM sys.columns c
      WHERE c.object_id = OBJECT_ID('Mantenimientos')
        AND c.name = 'id_servicio'
        AND c.is_nullable = 1
    )
    AND NOT EXISTS (SELECT 1 FROM Mantenimientos WHERE id_servicio IS NULL)
    BEGIN
      ALTER TABLE Mantenimientos ALTER COLUMN id_servicio CHAR(10) NOT NULL;
    END
  `)

  await pool.request().query(`
    IF COL_LENGTH('Mantenimientos', 'prioridad') IS NOT NULL
    BEGIN
      ALTER TABLE Mantenimientos DROP COLUMN prioridad;
    END
  `)

  serviciosSchemaReady = true
}

let tecnicoTableReady = false
async function ensureTecnicoTable(pool) {
  if (tecnicoTableReady) return

  await pool.request().query(`
    IF OBJECT_ID('Tecnico', 'U') IS NULL
    BEGIN
      CREATE TABLE Tecnico (
        id_tecnico CHAR(10) NOT NULL,
        id_usuario CHAR(15) NOT NULL,
        id_area CHAR(10) NOT NULL,
        horario VARCHAR(500) NULL,
        CONSTRAINT PK_Tecnico PRIMARY KEY (id_tecnico),
        CONSTRAINT UQ_Tecnico_Usuario UNIQUE (id_usuario),
        CONSTRAINT FK_Tecnico_Usuario FOREIGN KEY (id_usuario) REFERENCES Usuarios(id_usuario),
        CONSTRAINT FK_Tecnico_Area FOREIGN KEY (id_area) REFERENCES Areas(id_area)
      );
    END
    ELSE IF COL_LENGTH('Tecnico', 'id_tecnico') IS NULL
    BEGIN
      IF COL_LENGTH('Tecnico', 'horario') IS NOT NULL AND COL_LENGTH('Tecnico', 'horario') < 500
        ALTER TABLE Tecnico ALTER COLUMN horario VARCHAR(500) NULL;

      ALTER TABLE Tecnico ADD id_tecnico CHAR(10) NULL;

      ;WITH c AS (SELECT id_usuario, ROW_NUMBER() OVER (ORDER BY id_usuario) AS rn FROM Tecnico)
      UPDATE t
      SET t.id_tecnico = 'TC' + RIGHT('00000000' + CAST(c.rn AS VARCHAR(8)), 8)
      FROM Tecnico t
      INNER JOIN c ON c.id_usuario = t.id_usuario;

      ALTER TABLE Tecnico ALTER COLUMN id_tecnico CHAR(10) NOT NULL;

      DECLARE @pkName SYSNAME;
      SELECT @pkName = kc.name
      FROM sys.key_constraints kc
      WHERE kc.parent_object_id = OBJECT_ID('Tecnico') AND kc.type = 'PK';

      IF @pkName IS NOT NULL
      BEGIN
        DECLARE @dropPkSql NVARCHAR(500) = N'ALTER TABLE Tecnico DROP CONSTRAINT ' + QUOTENAME(@pkName);
        EXEC(@dropPkSql);
      END

      ALTER TABLE Tecnico ADD CONSTRAINT PK_Tecnico PRIMARY KEY (id_tecnico);

      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes i
        WHERE i.object_id = OBJECT_ID('Tecnico') AND i.name = 'UQ_Tecnico_Usuario' AND i.is_unique_constraint = 1
      )
        ALTER TABLE Tecnico ADD CONSTRAINT UQ_Tecnico_Usuario UNIQUE (id_usuario);
    END
    ELSE IF COL_LENGTH('Tecnico', 'horario') IS NOT NULL AND COL_LENGTH('Tecnico', 'horario') < 500
      ALTER TABLE Tecnico ALTER COLUMN horario VARCHAR(500) NULL;
  `)

  tecnicoTableReady = true
}

let workflowSchemaReady = false
async function ensureWorkflowColumns(pool) {
  if (workflowSchemaReady) return

  await ensureServiciosCatalogSchema(pool)
  await ensureTecnicoTable(pool)

  await pool.request().query(`
    IF COL_LENGTH('Mantenimientos', 'estado') IS NULL
    BEGIN
      ALTER TABLE Mantenimientos
      ADD estado VARCHAR(20) NOT NULL CONSTRAINT DF_Mantenimientos_estado DEFAULT 'Pendiente'
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

    IF COL_LENGTH('Mantenimientos', 'id_area') IS NULL
    BEGIN
      ALTER TABLE Mantenimientos
      ADD id_area CHAR(10) NULL
        CONSTRAINT FK_Mantenimientos_Area FOREIGN KEY REFERENCES Areas(id_area)
    END;
  `)

  // Separar en una segunda llamada para que el batch anterior ya esté comprometido
  // antes de intentar ALTER COLUMN (SQL Server requiere que no haya FKs activas)
  await pool.request().query(`
    -- Quitar NOT NULL de id_servicio si aún lo tiene
    IF EXISTS (
      SELECT 1
      FROM sys.columns c
      WHERE c.object_id = OBJECT_ID('Mantenimientos')
        AND c.name      = 'id_servicio'
        AND c.is_nullable = 0
    )
    BEGIN
      -- 1. Eliminar la FK que apunta a Servicios desde id_servicio (si existe)
      DECLARE @fkSrv SYSNAME;
      SELECT @fkSrv = fk.name
      FROM sys.foreign_keys fk
      JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
      WHERE fk.parent_object_id    = OBJECT_ID('Mantenimientos')
        AND fkc.parent_column_id   = COLUMNPROPERTY(OBJECT_ID('Mantenimientos'), 'id_servicio', 'ColumnId')
        AND fk.referenced_object_id = OBJECT_ID('Servicios');

      IF @fkSrv IS NOT NULL
      BEGIN
        DECLARE @dropSrv NVARCHAR(500) =
          N'ALTER TABLE Mantenimientos DROP CONSTRAINT ' + QUOTENAME(@fkSrv);
        EXEC(@dropSrv);
      END

      -- 2. Cambiar la columna a nullable
      ALTER TABLE Mantenimientos ALTER COLUMN id_servicio CHAR(10) NULL;

      -- 3. Volver a agregar la FK como nullable
      IF NOT EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE parent_object_id    = OBJECT_ID('Mantenimientos')
          AND referenced_object_id = OBJECT_ID('Servicios')
      )
        ALTER TABLE Mantenimientos
        ADD CONSTRAINT FK_Mantenimientos_Servicio
        FOREIGN KEY (id_servicio) REFERENCES Servicios(id_servicio);
    END
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

// ─── Auto-Assignment Engine ──────────────────────────────────────────────────
// Límite máximo de tickets activos por técnico antes de excluirlo
const MAX_TICKETS_POR_TECNICO = 5

// Mapea el número de día JS (0=Dom … 6=Sáb) a la clave del JSON de horario
const DIA_KEY = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']

/**
 * Determina si un técnico está disponible ahora según su horario JSON.
 * @param {string|null} horarioJson  - Valor del campo Tecnico.horario
 * @param {Date}        now          - Fecha/hora actual
 * @returns {boolean}
 */
function tecnicoEstaEnHorario(horarioJson, now) {
  if (!horarioJson) return false
  let horario
  try {
    horario = typeof horarioJson === 'string' ? JSON.parse(horarioJson) : horarioJson
  } catch {
    return false
  }

  const diaKey = DIA_KEY[now.getDay()]   // 'lun', 'mar', ...
  const slot = horario[diaKey]
  if (!slot || !slot.activo) return false

  // Comparar hora actual con inicio y fin del slot (formato 'HH:MM')
  const toMinutes = (hhmm) => {
    const [h, m] = String(hhmm || '').split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }
  const nowMin = now.getHours() * 60 + now.getMinutes()
  return nowMin >= toMinutes(slot.inicio) && nowMin < toMinutes(slot.fin)
}

/**
 * Motor de asignación automática.
 *
 * Debe llamarse DENTRO de una transacción activa (SERIALIZABLE).
 * Usa UPDLOCK + HOLDLOCK para evitar que dos tickets concurrentes
 * asignen al mismo técnico simultáneamente.
 *
 * @param {sql.Transaction} transaction
 * @param {string}          id_mantenimiento  - Ticket recién creado
 * @param {string}          id_area           - Área del problema (filtro obligatorio)
 * @param {string}          id_edificio       - Edificio del CI (para bono de proximidad)
 * @param {Date}            now               - Momento de la asignación
 * @returns {Promise<{asignado: boolean, id_tecnico?: string, razon?: string}>}
 */
async function autoAssignTecnico(transaction, id_mantenimiento, id_area, id_edificio, now) {
  // 1. Consultar candidatos bloqueando filas para evitar doble asignación.
  //    UPDLOCK sobre Tecnico y HOLDLOCK sobre la lectura de Mantenimientos
  //    garantizan serialización frente a peticiones concurrentes.
  const candidatesResult = await new sql.Request(transaction)
    .input('id_area',     sql.Char(10),  id_area)
    .input('id_edificio', sql.Char(10),  id_edificio)
    .input('max_tickets', sql.Int,       MAX_TICKETS_POR_TECNICO)
    .query(`
      SELECT
        tc.id_usuario       AS id_tecnico,
        tc.horario,
        -- Carga actual: tickets en estados activos asignados a este técnico
        COUNT(m.id_mantenimiento)                                    AS carga_activa,
        -- Bono de proximidad: ¿ya tiene un ticket en el mismo edificio?
        MAX(CASE WHEN e.id_edificio = @id_edificio THEN 1 ELSE 0 END) AS mismo_edificio
      FROM Tecnico tc WITH (UPDLOCK, HOLDLOCK)
      LEFT JOIN Mantenimientos m WITH (UPDLOCK)
        ON  m.id_tecnico_asignado = tc.id_usuario
        AND m.estado IN ('Pendiente', 'Asignado', 'En Proceso')
      LEFT JOIN Elementos_Configuracion ci_m
        ON  ci_m.id_ci = m.id_ci
      LEFT JOIN Sublocalizaciones s_m
        ON  s_m.id_sublocalizacion = ci_m.id_sublocalizacion
      LEFT JOIN Edificios e
        ON  e.id_edificio = s_m.id_edificio
      WHERE tc.id_area = @id_area
      GROUP BY tc.id_usuario, tc.horario
      HAVING COUNT(m.id_mantenimiento) < @max_tickets
      ORDER BY tc.id_usuario
    `)

  const candidatos = candidatesResult.recordset || []

  // 2. Filtrar por horario laboral vigente en JS
  const disponibles = candidatos.filter((c) =>
    tecnicoEstaEnHorario(c.horario, now)
  )

  if (candidatos.length === 0) {
    console.log(`[AutoAsign] Ticket ${id_mantenimiento} | area=${id_area} edificio=${id_edificio} | Sin tecnicos con esa area o todos en carga maxima (>${MAX_TICKETS_POR_TECNICO})`)
    return { asignado: false, razon: 'sin_tecnicos_area_o_carga_maxima' }
  }
  if (disponibles.length === 0) {
    console.log(`[AutoAsign] Ticket ${id_mantenimiento} | ${candidatos.length} tecnico(s) con area correcta pero NINGUNO en horario ahora (${new Date().toLocaleTimeString()})`)
    candidatos.forEach(c => console.log(`  - ${c.id_tecnico} | carga=${c.carga_activa}`))
    return { asignado: false, razon: 'fuera_de_horario' }
  }

  // 3. Calcular Score de disponibilidad para cada candidato disponible:
  //    Score = (carga_activa * -10) + (mismo_edificio * 5)
  //    → Mayor score = mayor prioridad
  const scored = disponibles.map((c) => ({
    id_tecnico:    c.id_tecnico,
    score:         (Number(c.carga_activa) * -10) + (Number(c.mismo_edificio) * 5),
    carga_activa:  Number(c.carga_activa),
    mismo_edificio: Number(c.mismo_edificio),
  }))

  // Ordenar: mayor score primero; empate → menor id_tecnico (estabilidad)
  scored.sort((a, b) => b.score - a.score || a.id_tecnico.localeCompare(b.id_tecnico))
  const mejor = scored[0]

  // ── Log de decisión de asignación ──────────────────────────────────────────
  console.log(`\n╔═══ AutoAsign | Ticket: ${id_mantenimiento} ═══════════════════════════`)
  console.log(`║  Area del problema : ${id_area}`)
  console.log(`║  Edificio del CI   : ${id_edificio}`)
  console.log(`║  Hora de asignacion: ${new Date().toLocaleTimeString()}`)
  console.log(`║  Candidatos evaluados (${scored.length}):`) 
  scored.forEach((c, i) => {
    const marca = i === 0 ? '★ ELEGIDO' : '         '
    console.log(`║    ${marca} ${c.id_tecnico} | carga=${c.carga_activa} | mismo_edificio=${c.mismo_edificio} | score=${c.score}`)
  })
  console.log(`╚══ Asignado a: ${mejor.id_tecnico} (score ${mejor.score}) ${'═'.repeat(20)}\n`)
  // ────────────────────────────────────────────────────────────────────────────

  // 4. Asignar el ticket al mejor candidato
  await new sql.Request(transaction)
    .input('id_mantenimiento',   sql.Char(10),  id_mantenimiento)
    .input('id_tecnico_asignado', sql.Char(15), mejor.id_tecnico)
    .query(`
      UPDATE Mantenimientos
      SET id_tecnico_asignado = @id_tecnico_asignado,
          estado              = 'Asignado'
      WHERE id_mantenimiento = @id_mantenimiento
    `)

  return {
    asignado: true,
    id_tecnico: mejor.id_tecnico,
    score: mejor.score,
    candidatos_evaluados: scored,
  }
}
// ─── Fin Motor de Asignación ─────────────────────────────────────────────────

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

app.get('/api/areas', ...requireAnyAuth, async (_req, res) => {
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

app.post('/api/admin/areas', ...requireAdmin, async (req, res) => {
  const nombre_area = toTrimmedString(req.body?.nombre_area)
  if (!nombre_area) return badRequest(res, 'nombre_area es obligatorio')

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    const id_area = await findNextAreaId(pool.request())
    await pool
      .request()
      .input('id_area', sql.Char(10), id_area)
      .input('nombre_area', sql.VarChar(100), nombre_area)
      .query(`INSERT INTO Areas (id_area, nombre_area) VALUES (@id_area, @nombre_area)`)

    return res.status(201).json({ message: 'Area creada correctamente', id_area })
  } catch (err) {
    console.error('Error en POST /api/admin/areas:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.get('/api/servicios', ...requireAnyAuth, async (_req, res) => {
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
    console.error('Error en GET /api/servicios:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.get('/api/admin/servicios', ...requireAdmin, async (_req, res) => {
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

app.post('/api/admin/servicios', ...requireAdmin, async (req, res) => {
  const nombre = toTrimmedString(req.body?.nombre)
  const id_area = toTrimmedString(req.body?.id_area)
  const descripcion = toTrimmedString(req.body?.descripcion)
  const tiempoRaw = req.body?.tiempo_servicio
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
      .input('id_servicio', sql.Char(10), id_servicio)
      .input('nombre', sql.VarChar(150), nombre)
      .input('id_area', sql.Char(10), id_area)
      .input('descripcion', sql.VarChar(sql.MAX), descripcion || null)
      .input('tiempo_servicio', sql.Int, tiempo_servicio)
      .input('prioridad', sql.VarChar(20), prioridad)
      .query(`
        INSERT INTO Servicios (
          id_servicio,
          nombre,
          id_area,
          descripcion,
          tiempo_servicio,
          prioridad
        )
        VALUES (
          @id_servicio,
          @nombre,
          @id_area,
          @descripcion,
          @tiempo_servicio,
          @prioridad
        )
      `)

    return res.status(201).json({ message: 'Servicio creado correctamente', id_servicio })
  } catch (err) {
    console.error('Error en POST /api/admin/servicios:', err)
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

    const srvPick = await new sql.Request(transaction).query(
      `SELECT TOP 1 id_servicio FROM Servicios ORDER BY id_servicio`
    )
    const id_servicio = srvPick.recordset?.[0]?.id_servicio
    if (!id_servicio) {
      await transaction.rollback()
      return res.status(409).json({
        message: 'No hay servicios en el catalogo; crea al menos uno desde el administrador',
      })
    }

    const id_mantenimiento = await findNextMaintenanceId(new sql.Request(transaction))

    await new sql.Request(transaction)
      .input('id_mantenimiento', sql.Char(10), id_mantenimiento)
      .input('id_ci', sql.VarChar(25), id_ci)
      .input('id_servicio', sql.Char(10), id_servicio)
      .input('fecha_mantenimiento', sql.DateTime, new Date())
      .input('tipo_mantenimiento', sql.VarChar(50), 'Preventivo')
      .input('descripcion_tarea', sql.VarChar(sql.MAX), descripcion_tarea)
      .input('id_usuario_reporta', sql.Char(15), req.user?.sub)
      .input('estado', sql.VarChar(20), 'Pendiente')
      .query(`
        INSERT INTO Mantenimientos (
          id_mantenimiento,
          id_ci,
          id_servicio,
          fecha_mantenimiento,
          tipo_mantenimiento,
          descripcion_tarea,
          id_usuario_reporta,
          estado
        )
        VALUES (
          @id_mantenimiento,
          @id_ci,
          @id_servicio,
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
    id_area: toTrimmedString(req.body?.id_area),
    descripcion_falla: toTrimmedString(req.body?.descripcion_falla),
  }

  if (
    !payload.id_edificio ||
    !payload.id_sublocalizacion ||
    !payload.id_ci ||
    !payload.id_area ||
    !payload.descripcion_falla
  ) {
    return badRequest(
      res,
      'id_edificio, id_sublocalizacion, id_ci, id_area y descripcion_falla son obligatorios'
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

    // Validate that the provided id_area exists
    const areaCheck = await new sql.Request(transaction)
      .input('id_area', sql.Char(10), payload.id_area)
      .query(`SELECT id_area FROM Areas WHERE id_area = @id_area`)
    if (!areaCheck.recordset?.[0]) {
      await transaction.rollback()
      return res.status(409).json({ message: 'El area seleccionada no existe' })
    }
    const id_area = payload.id_area

    const id_mantenimiento = await findNextMaintenanceId(new sql.Request(transaction))

    await new sql.Request(transaction)
      .input('id_mantenimiento', sql.Char(10), id_mantenimiento)
      .input('id_ci', sql.VarChar(25), payload.id_ci)
      .input('id_area', sql.Char(10), id_area)
      .input('fecha_mantenimiento', sql.DateTime, new Date())
      .input('tipo_mantenimiento', sql.VarChar(50), 'Correctivo')
      .input('descripcion_tarea', sql.VarChar(sql.MAX), payload.descripcion_falla)
      .input('id_usuario_reporta', sql.Char(15), req.user?.sub)
      .input('estado', sql.VarChar(20), 'Pendiente')
      .query(`
        INSERT INTO Mantenimientos (
          id_mantenimiento,
          id_ci,
          id_area,
          fecha_mantenimiento,
          tipo_mantenimiento,
          descripcion_tarea,
          id_usuario_reporta,
          estado
        )
        VALUES (
          @id_mantenimiento,
          @id_ci,
          @id_area,
          @fecha_mantenimiento,
          @tipo_mantenimiento,
          @descripcion_tarea,
          @id_usuario_reporta,
          @estado
        )
      `)

    // Obtener el id_edificio para calcular bono de proximidad
    const edificioRes = await new sql.Request(transaction)
      .input('id_sublocalizacion', sql.Char(10), payload.id_sublocalizacion)
      .query(`SELECT id_edificio FROM Sublocalizaciones WHERE id_sublocalizacion = @id_sublocalizacion`)
    const id_edificioAsign = edificioRes.recordset?.[0]?.id_edificio || payload.id_edificio

    // 🤖 Motor de asignación automática (dentro de la misma transacción SERIALIZABLE)
    let asignacion = { asignado: false, razon: 'error_interno' }
    try {
      asignacion = await autoAssignTecnico(
        transaction,
        id_mantenimiento,
        id_area,
        id_edificioAsign,
        new Date()
      )
    } catch (assignErr) {
      // Si el motor falla, el ticket queda Pendiente pero no se aborta el commit
      console.warn('Motor de asignación falló (ticket queda Pendiente):', assignErr?.message)
      asignacion = { asignado: false, razon: 'error_motor' }
    }

    await transaction.commit()
    transactionFinished = true

    return res.status(201).json({
      message: asignacion.asignado
        ? `Reporte creado y asignado automaticamente al tecnico ${asignacion.id_tecnico}`
        : 'Reporte creado correctamente. Pendiente de asignacion manual.',
      id_reporte:  id_mantenimiento,
      estado:      asignacion.asignado ? 'Asignado' : 'Pendiente',
      asignado:    asignacion.asignado,
      id_tecnico:  asignacion.id_tecnico || null,
      razon_no_asignado: asignacion.asignado ? undefined : asignacion.razon,
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
          COALESCE(srv.prioridad, 'Sin priorizar') AS prioridad,
          e.nombre_edificio,
          s.nombre_sublocalizacion,
          ci.nombre_equipo,
          ci.numero_serie,
          m.id_area,
          a.nombre_area,
          t.nombre_completo AS tecnico_asignado
        FROM Mantenimientos m
        JOIN Elementos_Configuracion ci ON ci.id_ci = m.id_ci
        JOIN Sublocalizaciones s ON s.id_sublocalizacion = ci.id_sublocalizacion
        JOIN Edificios e ON e.id_edificio = s.id_edificio
        LEFT JOIN Servicios srv ON srv.id_servicio = m.id_servicio
        LEFT JOIN Areas a ON a.id_area = m.id_area
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
          COALESCE(srv.prioridad, 'Sin priorizar') AS prioridad,
          e.nombre_edificio,
          s.nombre_sublocalizacion,
          ci.nombre_equipo,
          ci.numero_serie,
          m.id_area,
          a.nombre_area,
          u.nombre_completo AS usuario_reporta,
          t.nombre_completo AS tecnico_asignado,
          m.calificacion_servicio,
          m.comentario_valoracion,
          m.fecha_valoracion
        FROM Mantenimientos m
        JOIN Elementos_Configuracion ci ON ci.id_ci = m.id_ci
        JOIN Sublocalizaciones s ON s.id_sublocalizacion = ci.id_sublocalizacion
        JOIN Edificios e ON e.id_edificio = s.id_edificio
        LEFT JOIN Servicios srv ON srv.id_servicio = m.id_servicio
        LEFT JOIN Areas a ON a.id_area = m.id_area
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
        COALESCE(srv.prioridad, 'Sin priorizar') AS prioridad,
        e.nombre_edificio,
        s.nombre_sublocalizacion,
        ci.nombre_equipo,
        ci.numero_serie,
        m.id_area,
        a.nombre_area,
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

app.put('/api/admin/reportes/:id_reporte/asignacion', ...requireAdmin, async (req, res) => {
  const id_reporte = toTrimmedString(req.params?.id_reporte)
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
      .input('id_reporte', sql.Char(10), id_reporte)
      .input('id_tecnico_asignado', sql.Char(15), id_tecnico_asignado)
      .query(`
        UPDATE Mantenimientos
        SET id_tecnico_asignado = @id_tecnico_asignado,
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

// ── Asignación automática manual (admin): permite re-disparar el motor
//    sobre un ticket que quedó en Pendiente sin ser asignado.
app.post('/api/admin/reportes/:id_reporte/auto-asignar', ...requireAdmin, async (req, res) => {
  const id_reporte = toTrimmedString(req.params?.id_reporte)
  if (!id_reporte) return badRequest(res, 'El id_reporte es obligatorio')

  const pool = await getPool()
  if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

  await ensureWorkflowColumns(pool)

  // Obtener datos del ticket necesarios para el motor
  const ticketRes = await pool
    .request()
    .input('id_reporte', sql.Char(10), id_reporte)
    .query(`
      SELECT
        m.id_area,
        m.estado,
        s.id_edificio
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

    const asignacion = await autoAssignTecnico(
      transaction,
      id_reporte,
      ticket.id_area,
      ticket.id_edificio,
      new Date()
    )

    await transaction.commit()
    transactionFinished = true

    if (!asignacion.asignado) {
      return res.status(200).json({
        message: 'No se encontró técnico disponible.',
        asignado: false,
        razon: asignacion.razon,
      })
    }

    return res.status(200).json({
      message: `Ticket asignado automaticamente al tecnico ${asignacion.id_tecnico}`,
      asignado: true,
      id_tecnico: asignacion.id_tecnico,
      score: asignacion.score,
    })
  } catch (err) {
    if (!transactionFinished) {
      try { await transaction.rollback() } catch {}
    }
    console.error('Error en POST /api/admin/reportes/:id_reporte/auto-asignar:', err)
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
          COALESCE(srv.prioridad, 'Sin priorizar') AS prioridad,
          e.nombre_edificio,
          s.nombre_sublocalizacion,
          ci.nombre_equipo,
          ci.numero_serie,
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

app.post('/api/usuarios', ...requireAdmin, async (req, res) => {
  const payload = {
    nombre_completo: toTrimmedString(req.body?.nombre_completo),
    correo: toTrimmedString(req.body?.correo),
    password: toTrimmedString(req.body?.password),
    id_rol: toTrimmedString(req.body?.id_rol),
    tecnico: req.body?.tecnico,
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
    let idAreaTec = ''
    let horarioStr = null

    if (esTecnico) {
      const t = payload.tecnico || {}
      idAreaTec = toTrimmedString(t.id_area)
      if (!idAreaTec) return badRequest(res, 'Para rol Tecnico, tecnico.id_area es obligatorio')
      if (!horarioTecnicoValido(t.horario)) {
        return badRequest(
          res,
          'Para rol Tecnico, indique horario valido (al menos un dia con inicio y fin)'
        )
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

    const roleCode = fourCharRoleCode(nombreRol)
    const password_hash = await bcrypt.hash(payload.password, 10)

    const transaction = new sql.Transaction(pool)
    await transaction.begin()
    try {
      let id_usuario = await findNextUsuarioIdForRole(new sql.Request(transaction), roleCode)
      for (let i = 0; i < 5; i++) {
        const dup = await existsById(
          new sql.Request(transaction),
          'Usuarios',
          'id_usuario',
          'id_usuario',
          id_usuario
        )
        if (!dup) break
        id_usuario = await findNextUsuarioIdForRole(new sql.Request(transaction), roleCode)
      }

      await new sql.Request(transaction)
        .input('id_usuario', sql.Char(15), id_usuario)
        .input('nombre_completo', sql.VarChar(150), payload.nombre_completo)
        .input('correo', sql.VarChar(100), payload.correo)
        .input('password_hash', sql.VarChar(255), password_hash)
        .input('id_rol', sql.Char(10), payload.id_rol)
        .query(`
          INSERT INTO Usuarios (id_usuario, nombre_completo, correo, password_hash, id_rol)
          VALUES (@id_usuario, @nombre_completo, @correo, @password_hash, @id_rol)
        `)

      let id_tecnico = null
      if (esTecnico) {
        id_tecnico = await findNextTecnicoId(new sql.Request(transaction))
        await new sql.Request(transaction)
          .input('id_tecnico', sql.Char(10), id_tecnico)
          .input('id_usuario', sql.Char(15), id_usuario)
          .input('id_area', sql.Char(10), idAreaTec)
          .input('horario', sql.VarChar(500), horarioStr)
          .query(`
            INSERT INTO Tecnico (id_tecnico, id_usuario, id_area, horario)
            VALUES (@id_tecnico, @id_usuario, @id_area, @horario)
          `)
      }

      await transaction.commit()
      return res.status(201).json({
        message: 'Usuario creado correctamente',
        id_usuario,
        id_tecnico,
      })
    } catch (innerErr) {
      await transaction.rollback()
      throw innerErr
    }
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
    tecnico: req.body?.tecnico,
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

    let idAreaTec = ''
    let horarioStr = null
    if (esTecnico) {
      const t = payload.tecnico || {}
      idAreaTec = toTrimmedString(t.id_area)
      if (!idAreaTec) return badRequest(res, 'Para rol Tecnico, tecnico.id_area es obligatorio')
      if (!horarioTecnicoValido(t.horario)) {
        return badRequest(
          res,
          'Para rol Tecnico, indique horario valido (al menos un dia con inicio y fin)'
        )
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

    const password_hash = payload.password ? await bcrypt.hash(payload.password, 10) : null

    const transaction = new sql.Transaction(pool)
    await transaction.begin()
    try {
      const upd = new sql.Request(transaction)
        .input('id_usuario', sql.Char(15), id_usuario)
        .input('nombre_completo', sql.VarChar(150), payload.nombre_completo)
        .input('correo', sql.VarChar(100), payload.correo)
        .input('id_rol', sql.Char(10), payload.id_rol)

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
            .input('id_usuario', sql.Char(15), id_usuario)
            .input('id_area', sql.Char(10), idAreaTec)
            .input('horario', sql.VarChar(500), horarioStr)
            .query(
              `UPDATE Tecnico SET id_area = @id_area, horario = @horario WHERE id_usuario = @id_usuario`
            )
        } else {
          const id_tecnico = await findNextTecnicoId(new sql.Request(transaction))
          await new sql.Request(transaction)
            .input('id_tecnico', sql.Char(10), id_tecnico)
            .input('id_usuario', sql.Char(15), id_usuario)
            .input('id_area', sql.Char(10), idAreaTec)
            .input('horario', sql.VarChar(500), horarioStr)
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

app.delete('/api/usuarios/:id_usuario', ...requireAdmin, async (req, res) => {
  const id_usuario = toTrimmedString(req.params?.id_usuario)
  if (!id_usuario) return badRequest(res, 'El id_usuario es obligatorio')
  if (id_usuario === req.user?.sub) {
    return res.status(409).json({ message: 'No puedes eliminar tu propio usuario' })
  }

  try {
    const pool = await getPool()
    if (!pool) return res.status(500).json({ message: 'Backend sin configuración de BD' })

    await ensureWorkflowColumns(pool)

    await pool.request().input('id_usuario', sql.Char(15), id_usuario).query(`
      DELETE FROM Tecnico WHERE id_usuario = @id_usuario
    `)

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
