-- Ejecutar sobre una base ControlTotal existente.
-- Columna JSON (texto) para especificaciones de PC de escritorio (Tipo_CI T04).
USE ControlTotal;
GO

IF COL_LENGTH('Elementos_Configuracion', 'especificaciones_hardware') IS NULL
BEGIN
  ALTER TABLE Elementos_Configuracion
    ADD especificaciones_hardware NVARCHAR(MAX) NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM Tipo_CI WHERE id_tipo_ci = 'T04')
BEGIN
  INSERT INTO Tipo_CI (id_tipo_ci, nombre_tipo)
  VALUES ('T04', N'Computadora de escritorio');
END;
GO
