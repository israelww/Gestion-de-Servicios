USE ControlTotal;

-- Roles de Usuario
INSERT INTO Roles (id_rol, nombre_rol, descripcion_rol) VALUES 
('ROL01', 'Administrador', 'Acceso total al sistema'),
('ROL02', 'Tecnico', 'Encargado de mantenimientos');

-- Edificios
INSERT INTO Edificios (id_edificio, nombre_edificio, descripcion_edificio) VALUES 
('EA', 'Edificio A', 'Oficinas Administrativas'),
('EB', 'Edificio B', 'Aulas y Laboratorios');

-- Marcas
INSERT INTO marcas (id_marca, nombre_marca) VALUES 
('MAR01', 'Dell'),
('MAR02', 'HP'),
('MAR03', 'Cisco');

-- Sublocalizaciones (Aulas/Oficinas)
INSERT INTO Sublocalizaciones (id_sublocalizacion, nombre_sublocalizacion, id_edificio) VALUES 
('SUB01', 'Aula 01', 'ED-A'),
('SUB02', 'Laboratorio 05', 'ED-B');

-- Tipos de CI
INSERT INTO Tipo_CI (id_tipo_ci, nombre_tipo) VALUES 
('T01', 'Laptop'),
('T02', 'Switch'),
('T03', 'Proyector');

-- Usuarios (Responsables y Técnicos)
INSERT INTO Usuarios (id_usuario, nombre_completo, correo, password_hash, id_rol) VALUES 
('USR01', 'Santiago Admin 2', 'santiago@empresa.com', 'hash_secure_123', 'ROL01'),
('USR02', 'Juan Tecnico', 'juan.mant@empresa.com', 'hash_secure_456', 'ROL02');

-- Inserción de una Laptop
INSERT INTO Elementos_Configuracion (id_ci, numero_serie, nombre_equipo, modelo, estado, id_tipo_ci, id_marca, id_sublocalizacion, id_usuario_responsable) 
VALUES 
('LAP-EDA-01', 'SN-DELL-9988', 'LAP-DOCENTE-01', 'Latitude 5420', 'Activo', 'T01', 'MAR01', 'SUB01', 'USR01');

-- Inserción de un Switch de Red
INSERT INTO Elementos_Configuracion (id_ci, numero_serie, nombre_equipo, modelo, estado, id_tipo_ci, id_marca, id_sublocalizacion, id_usuario_responsable) 
VALUES 
('SW-EDB-01', 'SN-CISCO-1122', 'SW-CORE-LAB', 'Catalyst 9200', 'Activo', 'T02', 'MAR03', 'SUB02', 'USR01');

-- Reporte de Mantenimiento Preventivo
INSERT INTO Mantenimientos (
    id_mantenimiento, id_ci, tipo_mantenimiento, descripcion_tarea, 
    estado, prioridad, id_tecnico_asignado, costo, id_usuario_reporta
) VALUES (
    'MANT001', 'LAP-EDA-01', 'Preventivo', 'Limpieza interna y cambio de pasta térmica', 
    'En Proceso', 'Media', 'USR02', 25.50, 'USR01'
);

INSERT INTO Elementos_Configuracion (
    id_ci, 
    numero_serie, 
    nombre_equipo, 
    modelo, 
    estado, 
    id_tipo_ci, 
    id_marca, 
    id_sublocalizacion, -- Aquí se hace la asignación
    id_usuario_responsable
) VALUES (
    'LAP-EDB-002', 
    'SN-DELL-X100', 
    'LAP-ESTUDIANTE-02', 
    'Latitude 3420', 
    'Activo', 
    'T01',   -- Laptop
    'MAR01', -- Dell
    'SUB02', -- Laboratorio 05 (Sublocalización asignada)
    'USR01'  -- Santiago Admin 2
);

UPDATE Elementos_Configuracion
SET id_sublocalizacion = 'SUB02' -- Nueva ubicación
WHERE id_ci = 'LAP-EDA-01';      -- ID del equipo que se mueve