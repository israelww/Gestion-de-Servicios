-- Ejecutar sobre una base ControlTotal existente (alineado con ensureServiciosCatalogSchema en index.js)
USE ControlTotal;
GO

IF OBJECT_ID('Areas', 'U') IS NULL
BEGIN
  CREATE TABLE Areas (
    id_area CHAR(10) PRIMARY KEY,
    nombre_area VARCHAR(100) NOT NULL
  );
END;
GO

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
END;
GO

-- Version anterior: quitar ubicacion del catalogo de servicios
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
END;
GO

IF COL_LENGTH('Mantenimientos', 'id_servicio') IS NULL
BEGIN
  ALTER TABLE Mantenimientos ADD id_servicio CHAR(10) NULL;
END;
GO

IF COL_LENGTH('Mantenimientos', 'diagnostico_inicial') IS NULL
BEGIN
  ALTER TABLE Mantenimientos ADD diagnostico_inicial VARCHAR(1000) NULL;
END;
GO

IF COL_LENGTH('Mantenimientos', 'fecha_asignacion') IS NULL
BEGIN
  ALTER TABLE Mantenimientos ADD fecha_asignacion DATETIME NULL;
END;
GO

IF COL_LENGTH('Mantenimientos', 'fecha_terminado') IS NULL
BEGIN
  ALTER TABLE Mantenimientos ADD fecha_terminado DATETIME NULL;
END;
GO

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
GO

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
END;
GO

-- Se cambio el id_ci de CHAR a VARCHAR
-- Alinear id_ci a VARCHAR(25) en la tabla principal y tablas relacionadas.
-- Corrige bases existentes que quedaron con id_ci CHAR(10), causando error 2628.
SET XACT_ABORT ON;
GO

BEGIN TRANSACTION;

DECLARE @sqlIdCi NVARCHAR(MAX) = N'';
DECLARE @pkElementosCi SYSNAME;

-- 1. Eliminar FKs que dependen de Elementos_Configuracion(id_ci).
SELECT @sqlIdCi = @sqlIdCi + N'
ALTER TABLE ' + QUOTENAME(SCHEMA_NAME(parent.schema_id)) + N'.' + QUOTENAME(parent.name) +
N' DROP CONSTRAINT ' + QUOTENAME(fk.name) + N';'
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.tables parent ON parent.object_id = fk.parent_object_id
JOIN sys.columns parent_col
  ON parent_col.object_id = fkc.parent_object_id
 AND parent_col.column_id = fkc.parent_column_id
JOIN sys.columns referenced_col
  ON referenced_col.object_id = fkc.referenced_object_id
 AND referenced_col.column_id = fkc.referenced_column_id
WHERE fk.referenced_object_id = OBJECT_ID('dbo.Elementos_Configuracion')
  AND referenced_col.name = 'id_ci'
  AND parent_col.name = 'id_ci';

IF @sqlIdCi <> N'' EXEC sys.sp_executesql @sqlIdCi;

-- 2. Eliminar PK de Elementos_Configuracion para poder alterar id_ci.
SELECT @pkElementosCi = kc.name
FROM sys.key_constraints kc
WHERE kc.parent_object_id = OBJECT_ID('dbo.Elementos_Configuracion')
  AND kc.type = 'PK';

IF @pkElementosCi IS NOT NULL
BEGIN
  SET @sqlIdCi =
    N'ALTER TABLE dbo.Elementos_Configuracion DROP CONSTRAINT ' +
    QUOTENAME(@pkElementosCi) + N';';
  EXEC sys.sp_executesql @sqlIdCi;
END;

-- 3. Alinear todas las columnas id_ci a VARCHAR(25).
IF OBJECT_ID('dbo.Elementos_Configuracion', 'U') IS NOT NULL
BEGIN
  ALTER TABLE dbo.Elementos_Configuracion ALTER COLUMN id_ci VARCHAR(25) NOT NULL;
END;

IF OBJECT_ID('dbo.Mantenimientos', 'U') IS NOT NULL
BEGIN
  ALTER TABLE dbo.Mantenimientos ALTER COLUMN id_ci VARCHAR(25) NULL;
END;

IF OBJECT_ID('dbo.Historial_Cambios_CI', 'U') IS NOT NULL
BEGIN
  ALTER TABLE dbo.Historial_Cambios_CI ALTER COLUMN id_ci VARCHAR(25) NOT NULL;
END;

-- 4. Restaurar PK y FKs con nombres estables.
IF OBJECT_ID('dbo.Elementos_Configuracion', 'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1
  FROM sys.key_constraints
  WHERE parent_object_id = OBJECT_ID('dbo.Elementos_Configuracion')
    AND type = 'PK'
)
BEGIN
  ALTER TABLE dbo.Elementos_Configuracion
    ADD CONSTRAINT PK_Elementos_Configuracion PRIMARY KEY (id_ci);
END;

IF OBJECT_ID('dbo.Mantenimientos', 'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1
  FROM sys.foreign_keys
  WHERE parent_object_id = OBJECT_ID('dbo.Mantenimientos')
    AND name = 'FK_Mantenimientos_CI'
)
BEGIN
  ALTER TABLE dbo.Mantenimientos WITH CHECK
    ADD CONSTRAINT FK_Mantenimientos_CI
    FOREIGN KEY (id_ci) REFERENCES dbo.Elementos_Configuracion(id_ci);
END;

IF OBJECT_ID('dbo.Historial_Cambios_CI', 'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1
  FROM sys.foreign_keys
  WHERE parent_object_id = OBJECT_ID('dbo.Historial_Cambios_CI')
    AND name = 'FK_HistorialCI_CI'
)
BEGIN
  ALTER TABLE dbo.Historial_Cambios_CI WITH CHECK
    ADD CONSTRAINT FK_HistorialCI_CI
    FOREIGN KEY (id_ci) REFERENCES dbo.Elementos_Configuracion(id_ci);
END;

COMMIT TRANSACTION;
GO

SELECT
  OBJECT_SCHEMA_NAME(c.object_id) AS schema_name,
  OBJECT_NAME(c.object_id) AS table_name,
  c.name AS column_name,
  t.name AS type_name,
  c.max_length,
  c.is_nullable
FROM sys.columns c
JOIN sys.types t ON t.user_type_id = c.user_type_id
WHERE c.name = 'id_ci'
ORDER BY table_name;
GO
