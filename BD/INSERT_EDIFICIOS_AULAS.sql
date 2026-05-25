USE ControlTotal;
GO

SET NOCOUNT ON;
GO

/* =========================================================
   Insercion segura de Edificios (sin duplicados por id)
   ========================================================= */
INSERT INTO Edificios (id_edificio, nombre_edificio, descripcion_edificio)
SELECT v.id_edificio, v.nombre_edificio, v.descripcion_edificio
FROM (
  VALUES
    ('A1', 'Edificio A1', 'Aulas de Ingenieria'),
    ('B1', 'Edificio B1', 'Laboratorios de Computo'),
    ('C1', 'Edificio C1', 'Aulas de Electronica')
) AS v(id_edificio, nombre_edificio, descripcion_edificio)
WHERE NOT EXISTS (
  SELECT 1
  FROM Edificios e
  WHERE e.id_edificio = v.id_edificio
);
GO

/* =========================================================
   Insercion segura de Aulas/Sublocalizaciones
   - Requiere que el edificio exista
   - Sin duplicados por id_sublocalizacion
   ========================================================= */
INSERT INTO Sublocalizaciones (id_sublocalizacion, nombre_sublocalizacion, id_edificio)
SELECT v.id_sublocalizacion, v.nombre_sublocalizacion, v.id_edificio
FROM (
  VALUES
    ('A1A01', 'Aula 01', 'A1'),
    ('A1A02', 'Aula 02', 'A1'),
    ('A1A03', 'Aula 03', 'A1'),
    ('A1A04', 'Aula 04', 'A1'),
    ('B1A01', 'Aula 01', 'B1'),
    ('B1A02', 'Aula 02', 'B1'),
    ('B1L01', 'Laboratorio 01', 'B1'),
    ('B1L02', 'Laboratorio 02', 'B1'),
    ('C1A01', 'Aula 01', 'C1'),
    ('C1A02', 'Aula 02', 'C1'),
    ('C1A03', 'Aula 03', 'C1'),
    ('C1L01', 'Laboratorio 01', 'C1')
) AS v(id_sublocalizacion, nombre_sublocalizacion, id_edificio)
WHERE EXISTS (
  SELECT 1
  FROM Edificios e
  WHERE e.id_edificio = v.id_edificio
)
AND NOT EXISTS (
  SELECT 1
  FROM Sublocalizaciones s
  WHERE s.id_sublocalizacion = v.id_sublocalizacion
);
GO

/* Verificacion rapida */
SELECT id_edificio, nombre_edificio, descripcion_edificio
FROM Edificios
WHERE id_edificio IN ('A1', 'B1', 'C1')
ORDER BY id_edificio;

SELECT id_sublocalizacion, nombre_sublocalizacion, id_edificio
FROM Sublocalizaciones
WHERE id_edificio IN ('A1', 'B1', 'C1')
ORDER BY id_edificio, id_sublocalizacion;
GO

