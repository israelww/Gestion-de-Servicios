USE ControlTotal;
GO

SET NOCOUNT ON;
GO

/* =========================================================
   Insercion base de componentes de inventario (idempotente)
   ========================================================= */
INSERT INTO Componentes_Inventario (
  id_componente,
  nombre,
  descripcion,
  cantidad_stock,
  precio_unitario,
  unidad,
  activo,
  id_ci
)
SELECT
  v.id_componente,
  v.nombre,
  v.descripcion,
  v.cantidad_stock,
  v.precio_unitario,
  v.unidad,
  1 AS activo,
  NULL AS id_ci
FROM (
  VALUES
    ('CMP0000001', 'Memoria RAM 8GB DDR4', 'Modulo DDR4 para desktop', 60, 650.00, 'Pieza'),
    ('CMP0000002', 'Memoria RAM 16GB DDR4', 'Modulo DDR4 para desktop', 40, 1100.00, 'Pieza'),
    ('CMP0000003', 'SSD NVMe 512GB', 'Unidad estado solido M.2 NVMe', 35, 890.00, 'Pieza'),
    ('CMP0000004', 'SSD SATA 1TB', 'Unidad estado solido 2.5 pulgadas', 25, 1450.00, 'Pieza'),
    ('CMP0000005', 'Disco Duro 1TB', 'Disco duro mecanico 3.5 pulgadas', 20, 980.00, 'Pieza'),
    ('CMP0000006', 'Fuente de Poder 550W', 'Fuente ATX certificacion 80+ Bronze', 18, 1200.00, 'Pieza'),
    ('CMP0000007', 'Fuente de Poder 750W', 'Fuente ATX certificacion 80+ Gold', 10, 2100.00, 'Pieza'),
    ('CMP0000008', 'Teclado USB', 'Teclado alfanumerico USB', 90, 180.00, 'Pieza'),
    ('CMP0000009', 'Mouse USB', 'Mouse optico USB', 95, 160.00, 'Pieza'),
    ('CMP0000010', 'Monitor 24 pulgadas', 'Monitor LED Full HD', 30, 2650.00, 'Pieza'),
    ('CMP0000011', 'Cable HDMI 2m', 'Cable de video HDMI', 70, 120.00, 'Pieza'),
    ('CMP0000012', 'Cable de Red Cat6 3m', 'Patch cord RJ45 categoria 6', 120, 85.00, 'Pieza'),
    ('CMP0000013', 'Pasta Termica 4g', 'Compuesto termico para CPU', 45, 95.00, 'Pieza'),
    ('CMP0000014', 'Kit Limpieza Electronica', 'Aire comprimido y paño antiestatico', 22, 210.00, 'Kit'),
    ('CMP0000015', 'Regulador 1200VA', 'Regulador de voltaje para equipo de computo', 16, 1450.00, 'Pieza')
) AS v(
  id_componente,
  nombre,
  descripcion,
  cantidad_stock,
  precio_unitario,
  unidad
)
WHERE NOT EXISTS (
  SELECT 1
  FROM Componentes_Inventario c
  WHERE c.id_componente = v.id_componente
);
GO

/* Verificacion */
SELECT
  id_componente,
  nombre,
  cantidad_stock,
  precio_unitario,
  unidad,
  activo
FROM Componentes_Inventario
WHERE id_componente BETWEEN 'CMP0000001' AND 'CMP0000015'
ORDER BY id_componente;
GO

