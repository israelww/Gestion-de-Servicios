USE ControlTotal;
GO

SET NOCOUNT ON;
GO

/* =========================================================
   Catalogos base (idempotente)
   ========================================================= */

-- Marca generica para equipos de aula
IF NOT EXISTS (SELECT 1 FROM marcas WHERE id_marca = 'MAR99')
BEGIN
  INSERT INTO marcas (id_marca, nombre_marca)
  VALUES ('MAR99', 'Generica Aula');
END;
GO

-- Tipos de CI requeridos
IF NOT EXISTS (SELECT 1 FROM Tipo_CI WHERE id_tipo_ci = 'T04')
BEGIN
  INSERT INTO Tipo_CI (id_tipo_ci, nombre_tipo) VALUES ('T04', 'Computadora de escritorio');
END;

IF NOT EXISTS (SELECT 1 FROM Tipo_CI WHERE id_tipo_ci = 'T03')
BEGIN
  INSERT INTO Tipo_CI (id_tipo_ci, nombre_tipo) VALUES ('T03', 'Proyector');
END;

IF NOT EXISTS (SELECT 1 FROM Tipo_CI WHERE id_tipo_ci = 'T05')
BEGIN
  INSERT INTO Tipo_CI (id_tipo_ci, nombre_tipo) VALUES ('T05', 'Teclado');
END;

IF NOT EXISTS (SELECT 1 FROM Tipo_CI WHERE id_tipo_ci = 'T06')
BEGIN
  INSERT INTO Tipo_CI (id_tipo_ci, nombre_tipo) VALUES ('T06', 'Mouse');
END;

IF NOT EXISTS (SELECT 1 FROM Tipo_CI WHERE id_tipo_ci = 'T07')
BEGIN
  INSERT INTO Tipo_CI (id_tipo_ci, nombre_tipo) VALUES ('T07', 'Monitor');
END;
GO

/* =========================================================
   Insercion de CIs por cada Aula
   - Criterio de aula: nombre_sublocalizacion LIKE 'Aula%'
   - Inserta 5 equipos por aula
   - Sin duplicar por id_ci
   ========================================================= */
;WITH Aulas AS (
  SELECT
    RTRIM(s.id_sublocalizacion) AS id_sublocalizacion,
    RTRIM(s.nombre_sublocalizacion) AS nombre_sublocalizacion
  FROM Sublocalizaciones s
  WHERE s.nombre_sublocalizacion LIKE 'Aula%'
),
Plantilla AS (
  SELECT *
  FROM (VALUES
    ('PC',  'T04', 'Computadora de escritorio', 'PC Aula',      'Desktop Aula Estandar',
      N'{"interno":{"procesador":"Intel Core i5","placaMadre":"B660","ram":"16 GB DDR4","almacenamientoPrincipal":"SSD 512 GB","almacenamientoSecundario":"HDD 1 TB","gpu":"Integrada","fuentePoder":"550W","gabinete":"mATX","refrigeracion":"Stock","redCableada":"Gigabit"}}'),
    ('PRO', 'T03', 'Proyector',                 'Proyector Aula','Proyector Full HD',   NULL),
    ('KEY', 'T05', 'Teclado',                   'Teclado Aula',  'Teclado USB',          NULL),
    ('MOU', 'T06', 'Mouse',                     'Mouse Aula',    'Mouse USB',            NULL),
    ('MON', 'T07', 'Monitor',                   'Monitor Aula',  'Monitor 24 pulgadas',  NULL)
  ) AS p(prefijo, id_tipo_ci, nombre_tipo, nombre_base, modelo_base, especificaciones_hardware)
),
Candidatos AS (
  SELECT
    CONCAT(p.prefijo, '-', a.id_sublocalizacion) AS id_ci,
    CONCAT('SN-', p.prefijo, '-', a.id_sublocalizacion) AS numero_serie,
    CONCAT(p.nombre_base, ' ', a.id_sublocalizacion) AS nombre_equipo,
    p.modelo_base AS modelo,
    'Activo' AS estado,
    p.id_tipo_ci,
    'MAR99' AS id_marca,
    a.id_sublocalizacion,
    CAST(NULL AS CHAR(15)) AS id_usuario_responsable,
    CAST(GETDATE() AS DATE) AS fecha_ingreso,
    p.especificaciones_hardware
  FROM Aulas a
  CROSS JOIN Plantilla p
)
INSERT INTO Elementos_Configuracion (
  id_ci, numero_serie, nombre_equipo, modelo, estado,
  id_tipo_ci, id_marca, id_sublocalizacion, id_usuario_responsable,
  fecha_ingreso, especificaciones_hardware
)
SELECT
  c.id_ci, c.numero_serie, c.nombre_equipo, c.modelo, c.estado,
  c.id_tipo_ci, c.id_marca, c.id_sublocalizacion, c.id_usuario_responsable,
  c.fecha_ingreso, c.especificaciones_hardware
FROM Candidatos c
WHERE NOT EXISTS (
  SELECT 1
  FROM Elementos_Configuracion ec
  WHERE ec.id_ci = c.id_ci
);
GO

/* =========================================================
   Verificacion
   ========================================================= */
SELECT
  RTRIM(s.id_sublocalizacion) AS id_sublocalizacion,
  RTRIM(s.nombre_sublocalizacion) AS aula,
  COUNT(ec.id_ci) AS total_ci_en_aula
FROM Sublocalizaciones s
LEFT JOIN Elementos_Configuracion ec
  ON RTRIM(ec.id_sublocalizacion) = RTRIM(s.id_sublocalizacion)
WHERE s.nombre_sublocalizacion LIKE 'Aula%'
GROUP BY RTRIM(s.id_sublocalizacion), RTRIM(s.nombre_sublocalizacion)
ORDER BY id_sublocalizacion;
GO

