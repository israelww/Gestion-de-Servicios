const sql = require('mssql')
const { findNextServicioId } = require('../helpers/idGenerators')

// ─── Flags de "ya se ejecutó" para evitar re-ejecutar en caliente ─────────────
let serviciosSchemaReady = false
let tecnicoTableReady    = false
let workflowSchemaReady  = false
let ciHistorySchemaReady = false

// ─── ensureServiciosCatalogSchema ─────────────────────────────────────────────

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
    IF OBJECT_ID('Catalogo_Servicios') IS NULL
    BEGIN
      EXEC(N'
        CREATE VIEW Catalogo_Servicios AS
        SELECT
          id_servicio,
          COALESCE(descripcion, nombre) AS descripcion,
          tiempo_servicio AS tiempo_estimado_minutos
        FROM Servicios
      ');
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
      ALTER TABLE Mantenimientos ALTER COLUMN id_servicio CHAR(10) NULL;
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

// ─── ensureTecnicoTable ───────────────────────────────────────────────────────

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

// ─── ensureWorkflowColumns ────────────────────────────────────────────────────

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

    IF COL_LENGTH('Mantenimientos', 'diagnostico_inicial') IS NULL
    BEGIN
      ALTER TABLE Mantenimientos
      ADD diagnostico_inicial VARCHAR(1000) NULL
    END;

    IF COL_LENGTH('Mantenimientos', 'fecha_asignacion') IS NULL
    BEGIN
      ALTER TABLE Mantenimientos
      ADD fecha_asignacion DATETIME NULL
    END;

    IF COL_LENGTH('Mantenimientos', 'fecha_terminado') IS NULL
    BEGIN
      ALTER TABLE Mantenimientos
      ADD fecha_terminado DATETIME NULL
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

  // Segunda batch: quitar NOT NULL de id_servicio si aún lo tiene
  await pool.request().query(`
    IF EXISTS (
      SELECT 1
      FROM sys.columns c
      WHERE c.object_id = OBJECT_ID('Mantenimientos')
        AND c.name      = 'id_servicio'
        AND c.is_nullable = 0
    )
    BEGIN
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

      ALTER TABLE Mantenimientos ALTER COLUMN id_servicio CHAR(10) NULL;

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

  await pool.request().query(`
    IF OBJECT_ID('Mantenimiento_Servicios', 'U') IS NULL
    BEGIN
      CREATE TABLE Mantenimiento_Servicios (
        id_mantenimiento CHAR(10) NOT NULL,
        id_servicio CHAR(10) NOT NULL,
        fecha_registro DATETIME NOT NULL CONSTRAINT DF_MantenimientoServicios_fecha DEFAULT GETDATE(),
        CONSTRAINT PK_Mantenimiento_Servicios PRIMARY KEY (id_mantenimiento, id_servicio),
        CONSTRAINT FK_MantenimientoServicios_Mantenimiento FOREIGN KEY (id_mantenimiento) REFERENCES Mantenimientos(id_mantenimiento),
        CONSTRAINT FK_MantenimientoServicios_Servicio FOREIGN KEY (id_servicio) REFERENCES Servicios(id_servicio)
      );
    END;
  `)

  workflowSchemaReady = true
}

// ─── ensureCiHistoryTable ─────────────────────────────────────────────────────

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

module.exports = {
  ensureServiciosCatalogSchema,
  ensureTecnicoTable,
  ensureWorkflowColumns,
  ensureCiHistoryTable,
}
