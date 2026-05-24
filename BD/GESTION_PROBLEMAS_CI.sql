/* Modulo ITIL - Gestion de Problemas por CI
   Ejecutar despues de tener Elementos_Configuracion.id_ci ampliado a VARCHAR(50).
*/

IF OBJECT_ID('dbo.Gestion_Problemas_CI', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Gestion_Problemas_CI (
    id_problema INT IDENTITY(1,1) NOT NULL,
    id_ci VARCHAR(50) NOT NULL,
    id_mantenimiento CHAR(10) NULL,
    fecha_problema DATETIME NOT NULL CONSTRAINT DF_GestionProblemasCI_fecha DEFAULT GETDATE(),
    numero_transaccion VARCHAR(40) NULL,
    origen_transaccion VARCHAR(40) NULL,
    tecnico VARCHAR(120) NOT NULL,
    error_conocido VARCHAR(500) NOT NULL,
    solucion_raiz_o_workaround VARCHAR(MAX) NOT NULL,
    fecha_registro DATETIME NOT NULL CONSTRAINT DF_GestionProblemasCI_registro DEFAULT GETDATE(),
    CONSTRAINT PK_Gestion_Problemas_CI PRIMARY KEY (id_problema),
    CONSTRAINT FK_GestionProblemasCI_CI FOREIGN KEY (id_ci) REFERENCES dbo.Elementos_Configuracion(id_ci),
    CONSTRAINT FK_GestionProblemasCI_Mantenimiento FOREIGN KEY (id_mantenimiento) REFERENCES dbo.Mantenimientos(id_mantenimiento)
  );
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_GestionProblemasCI_id_ci_fecha'
    AND object_id = OBJECT_ID('dbo.Gestion_Problemas_CI')
)
BEGIN
  CREATE INDEX IX_GestionProblemasCI_id_ci_fecha
  ON dbo.Gestion_Problemas_CI (id_ci, fecha_problema DESC, id_problema DESC);
END;
GO
