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

-- Nota: backfill, FK NOT NULL y DROP prioridad suelen hacerse desde la app o scripts dedicados
-- para evitar estados inconsistentes. Ver Backend ensureServiciosCatalogSchema.
