USE ControlTotal;

-- Roles de Usuario
INSERT INTO Roles (id_rol, nombre_rol, descripcion_rol) VALUES 
('ROL01', 'Administrador', 'Acceso total al sistema'),
('ROL02', 'Tecnico', 'Encargado de mantenimientos');

-- Edificios
INSERT INTO Edificios (id_edificio, nombre_edificio, descripcion_edificio) VALUES
('EA', 'Edificio A', 'Jefatura de Sistemas'),
('EB', 'Edificio B', 'Aulas de Sistemas y TICs'),
('EC', 'Edificio C', 'Aulas de Sistemas'),
('ED', 'Edificio D', 'Aulas de Bioquímica'),
('EE', 'Edificio E', 'Laboratorio Triple de Bioquímica'),
('EF', 'Edificio F', 'Laboratorio de Operaciones Unitarias'),
('EG', 'Edificio G', 'Depto. de Promoción Deportiva y Cultural'),
('EH', 'Edificio H', 'Sala de Teleconferencias y Aulas'),
('EI', 'Edificio I', 'Centro de Información'),
('EJ', 'Edificio J', 'Aulas de Industrial y Servicios Sanitarios'),
('EK', 'Edificio K', 'Depto. de Ingeniería Bioquímica'),
('EL', 'Edificio L', 'Edificios Administrativos'),
('EM', 'Edificio M', 'Cubículos de Asesorías y Ciencias Básicas'),
('EN', 'Edificio N', 'Aulas de Ingeniería Electrónica'),
('EN1', 'Edificio Ñ', 'Coordinación de Posgrado'),
('EO', 'Edificio O', 'CELE y Aulas'),
('EP', 'Edificio P', 'Aulas y Servicios Sanitarios'),
('EQ', 'Edificio Q', 'Depto. de Ciencias Básicas y Jefatura'),
('ER', 'Edificio R', 'Depto. de Ingeniería Industrial'),
('ES', 'Edificio S', 'Lab. de Idiomas y Aulas de Dibujo'),
('ET', 'Edificio T', 'Aulas de Mecánica'),
('EU', 'Edificio U', 'Baños y Vestidores Albergue Estudiantil'),
('EV', 'Edificio V', 'Depto. de Metal-Mecánica'),
('EW', 'Edificio W', 'Lab. Máquinas y Herramientas'),
('EX', 'Edificio X', 'Almacén, Manto. y Equipo, Rec. Materiales'),
('EY', 'Edificio Y', 'Gimnasio'),
('EZ', 'Edificio Z', 'Aulas Electrónica'),
('CC', 'Edificio 1', 'Centro de Cómputo'),
('E2', 'Edificio 2', 'Cafetería'),
('E3', 'Edificio 3', 'Laboratorio de Ingeniería Electrónica'),
('E4', 'Edificio 4', 'Laboratorio de Ingeniería Electrónica'),
('E5', 'Edificio 5', 'Laboratorio de Ingeniería Industrial'),
('UA', 'Edificio 6', 'Unidad Academica'),
('UP', 'Edificio 7', 'Unidad de Posgrado');

-- Marcas
INSERT INTO marcas (id_marca, nombre_marca) VALUES 
('MAR01', 'Dell'),
('MAR02', 'HP'),
('MAR03', 'Cisco');

-- Sublocalizaciones (Aulas/Oficinas)
-- SUBLOCALIZACIONES (8 Aulas por Edificio)

-- Bloque 1: Edificios A al D
INSERT INTO Sublocalizaciones (id_sublocalizacion, nombre_sublocalizacion, id_edificio) VALUES 
('EAA01', 'Aula 01', 'EA'), ('EAA02', 'Aula 02', 'EA'), ('EAA03', 'Aula 03', 'EA'), ('EAA04', 'Aula 04', 'EA'), ('EAA05', 'Aula 05', 'EA'), ('EAA06', 'Aula 06', 'EA'), ('EAA07', 'Aula 07', 'EA'), ('EAA08', 'Aula 08', 'EA'),
('EBA01', 'Aula 01', 'EB'), ('EBA02', 'Aula 02', 'EB'), ('EBA03', 'Aula 03', 'EB'), ('EBA04', 'Aula 04', 'EB'), ('EBA05', 'Aula 05', 'EB'), ('EBA06', 'Aula 06', 'EB'), ('EBA07', 'Aula 07', 'EB'), ('EBA08', 'Aula 08', 'EB'),
('ECA01', 'Aula 01', 'EC'), ('ECA02', 'Aula 02', 'EC'), ('ECA03', 'Aula 03', 'EC'), ('ECA04', 'Aula 04', 'EC'), ('ECA05', 'Aula 05', 'EC'), ('ECA06', 'Aula 06', 'EC'), ('ECA07', 'Aula 07', 'EC'), ('ECA08', 'Aula 08', 'EC'),
('EDA01', 'Aula 01', 'ED'), ('EDA02', 'Aula 02', 'ED'), ('EDA03', 'Aula 03', 'ED'), ('EDA04', 'Aula 04', 'ED'), ('EDA05', 'Aula 05', 'ED'), ('EDA06', 'Aula 06', 'ED'), ('EDA07', 'Aula 07', 'ED'), ('EDA08', 'Aula 08', 'ED');

-- Bloque 2: Edificios E al I
INSERT INTO Sublocalizaciones (id_sublocalizacion, nombre_sublocalizacion, id_edificio) VALUES 
('EEA01', 'Aula 01', 'EE'), ('EEA02', 'Aula 02', 'EE'), ('EEA03', 'Aula 03', 'EE'), ('EEA04', 'Aula 04', 'EE'), ('EEA05', 'Aula 05', 'EE'), ('EEA06', 'Aula 06', 'EE'), ('EEA07', 'Aula 07', 'EE'), ('EEA08', 'Aula 08', 'EE'),
('EFA01', 'Aula 01', 'EF'), ('EFA02', 'Aula 02', 'EF'), ('EFA03', 'Aula 03', 'EF'), ('EFA04', 'Aula 04', 'EF'), ('EFA05', 'Aula 05', 'EF'), ('EFA06', 'Aula 06', 'EF'), ('EFA07', 'Aula 07', 'EF'), ('EFA08', 'Aula 08', 'EF'),
('EGA01', 'Aula 01', 'EG'), ('EGA02', 'Aula 02', 'EG'), ('EGA03', 'Aula 03', 'EG'), ('EGA04', 'Aula 04', 'EG'), ('EGA05', 'Aula 05', 'EG'), ('EGA06', 'Aula 06', 'EG'), ('EGA07', 'Aula 07', 'EG'), ('EGA08', 'Aula 08', 'EG'),
('EHA01', 'Aula 01', 'EH'), ('EHA02', 'Aula 02', 'EH'), ('EHA03', 'Aula 03', 'EH'), ('EHA04', 'Aula 04', 'EH'), ('EHA05', 'Aula 05', 'EH'), ('EHA06', 'Aula 06', 'EH'), ('EHA07', 'Aula 07', 'EH'), ('EHA08', 'Aula 08', 'EH'),
('EIA01', 'Aula 01', 'EI'), ('EIA02', 'Aula 02', 'EI'), ('EIA03', 'Aula 03', 'EI'), ('EIA04', 'Aula 04', 'EI'), ('EIA05', 'Aula 05', 'EI'), ('EIA06', 'Aula 06', 'EI'), ('EIA07', 'Aula 07', 'EI'), ('EIA08', 'Aula 08', 'EI');

-- Bloque 3: Edificios J al N (Incluye Ñ como EN1)
INSERT INTO Sublocalizaciones (id_sublocalizacion, nombre_sublocalizacion, id_edificio) VALUES 
('EJA01', 'Aula 01', 'EJ'), ('EJA02', 'Aula 02', 'EJ'), ('EJA03', 'Aula 03', 'EJ'), ('EJA04', 'Aula 04', 'EJ'), ('EJA05', 'Aula 05', 'EJ'), ('EJA06', 'Aula 06', 'EJ'), ('EJA07', 'Aula 07', 'EJ'), ('EJA08', 'Aula 08', 'EJ'),
('EKA01', 'Aula 01', 'EK'), ('EKA02', 'Aula 02', 'EK'), ('EKA03', 'Aula 03', 'EK'), ('EKA04', 'Aula 04', 'EK'), ('EKA05', 'Aula 05', 'EK'), ('EKA06', 'Aula 06', 'EK'), ('EKA07', 'Aula 07', 'EK'), ('EKA08', 'Aula 08', 'EK'),
('ELA01', 'Aula 01', 'EL'), ('ELA02', 'Aula 02', 'EL'), ('ELA03', 'Aula 03', 'EL'), ('ELA04', 'Aula 04', 'EL'), ('ELA05', 'Aula 05', 'EL'), ('ELA06', 'Aula 06', 'EL'), ('ELA07', 'Aula 07', 'EL'), ('ELA08', 'Aula 08', 'EL'),
('EMA01', 'Aula 01', 'EM'), ('EMA02', 'Aula 02', 'EM'), ('EMA03', 'Aula 03', 'EM'), ('EMA04', 'Aula 04', 'EM'), ('EMA05', 'Aula 05', 'EM'), ('EMA06', 'Aula 06', 'EM'), ('EMA07', 'Aula 07', 'EM'), ('EMA08', 'Aula 08', 'EM'),
('ENA01', 'Aula 01', 'EN'), ('ENA02', 'Aula 02', 'EN'), ('ENA03', 'Aula 03', 'EN'), ('ENA04', 'Aula 04', 'EN'), ('ENA05', 'Aula 05', 'EN'), ('ENA06', 'Aula 06', 'EN'), ('ENA07', 'Aula 07', 'EN'), ('ENA08', 'Aula 08', 'EN'),
('EN1A01', 'Aula 01', 'EN1'), ('EN1A02', 'Aula 02', 'EN1'), ('EN1A03', 'Aula 03', 'EN1'), ('EN1A04', 'Aula 04', 'EN1'), ('EN1A05', 'Aula 05', 'EN1'), ('EN1A06', 'Aula 06', 'EN1'), ('EN1A07', 'Aula 07', 'EN1'), ('EN1A08', 'Aula 08', 'EN1');

-- Bloque 4: Edificios O al S
INSERT INTO Sublocalizaciones (id_sublocalizacion, nombre_sublocalizacion, id_edificio) VALUES 
('EOA01', 'Aula 01', 'EO'), ('EOA02', 'Aula 02', 'EO'), ('EOA03', 'Aula 03', 'EO'), ('EOA04', 'Aula 04', 'EO'), ('EOA05', 'Aula 05', 'EO'), ('EOA06', 'Aula 06', 'EO'), ('EOA07', 'Aula 07', 'EO'), ('EOA08', 'Aula 08', 'EO'),
('EPA01', 'Aula 01', 'EP'), ('EPA02', 'Aula 02', 'EP'), ('EPA03', 'Aula 03', 'EP'), ('EPA04', 'Aula 04', 'EP'), ('EPA05', 'Aula 05', 'EP'), ('EPA06', 'Aula 06', 'EP'), ('EPA07', 'Aula 07', 'EP'), ('EPA08', 'Aula 08', 'EP'),
('EQA01', 'Aula 01', 'EQ'), ('EQA02', 'Aula 02', 'EQ'), ('EQA03', 'Aula 03', 'EQ'), ('EQA04', 'Aula 04', 'EQ'), ('EQA05', 'Aula 05', 'EQ'), ('EQA06', 'Aula 06', 'EQ'), ('EQA07', 'Aula 07', 'EQ'), ('EQA08', 'Aula 08', 'EQ'),
('ERA01', 'Aula 01', 'ER'), ('ERA02', 'Aula 02', 'ER'), ('ERA03', 'Aula 03', 'ER'), ('ERA04', 'Aula 04', 'ER'), ('ERA05', 'Aula 05', 'ER'), ('ERA06', 'Aula 06', 'ER'), ('ERA07', 'Aula 07', 'ER'), ('ERA08', 'Aula 08', 'ER'),
('ESA01', 'Aula 01', 'ES'), ('ESA02', 'Aula 02', 'ES'), ('ESA03', 'Aula 03', 'ES'), ('ESA04', 'Aula 04', 'ES'), ('ESA05', 'Aula 05', 'ES'), ('ESA06', 'Aula 06', 'ES'), ('ESA07', 'Aula 07', 'ES'), ('ESA08', 'Aula 08', 'ES');

-- Bloque 5: Edificios T al Z
INSERT INTO Sublocalizaciones (id_sublocalizacion, nombre_sublocalizacion, id_edificio) VALUES 
('ETA01', 'Aula 01', 'ET'), ('ETA02', 'Aula 02', 'ET'), ('ETA03', 'Aula 03', 'ET'), ('ETA04', 'Aula 04', 'ET'), ('ETA05', 'Aula 05', 'ET'), ('ETA06', 'Aula 06', 'ET'), ('ETA07', 'Aula 07', 'ET'), ('ETA08', 'Aula 08', 'ET'),
('EUA01', 'Aula 01', 'EU'), ('EUA02', 'Aula 02', 'EU'), ('EUA03', 'Aula 03', 'EU'), ('EUA04', 'Aula 04', 'EU'), ('EUA05', 'Aula 05', 'EU'), ('EUA06', 'Aula 06', 'EU'), ('EUA07', 'Aula 07', 'EU'), ('EUA08', 'Aula 08', 'EU'),
('EVA01', 'Aula 01', 'EV'), ('EVA02', 'Aula 02', 'EV'), ('EVA03', 'Aula 03', 'EV'), ('EVA04', 'Aula 04', 'EV'), ('EVA05', 'Aula 05', 'EV'), ('EVA06', 'Aula 06', 'EV'), ('EVA07', 'Aula 07', 'EV'), ('EVA08', 'Aula 08', 'EV'),
('EWA01', 'Aula 01', 'EW'), ('EWA02', 'Aula 02', 'EW'), ('EWA03', 'Aula 03', 'EW'), ('EWA04', 'Aula 04', 'EW'), ('EWA05', 'Aula 05', 'EW'), ('EWA06', 'Aula 06', 'EW'), ('EWA07', 'Aula 07', 'EW'), ('EWA08', 'Aula 08', 'EW'),
('EXA01', 'Aula 01', 'EX'), ('EXA02', 'Aula 02', 'EX'), ('EXA03', 'Aula 03', 'EX'), ('EXA04', 'Aula 04', 'EX'), ('EXA05', 'Aula 05', 'EX'), ('EXA06', 'Aula 06', 'EX'), ('EXA07', 'Aula 07', 'EX'), ('EXA08', 'Aula 08', 'EX'),
('EYA01', 'Aula 01', 'EY'), ('EYA02', 'Aula 02', 'EY'), ('EYA03', 'Aula 03', 'EY'), ('EYA04', 'Aula 04', 'EY'), ('EYA05', 'Aula 05', 'EY'), ('EYA06', 'Aula 06', 'EY'), ('EYA07', 'Aula 07', 'EY'), ('EYA08', 'Aula 08', 'EY'),
('EZA01', 'Aula 01', 'EZ'), ('EZA02', 'Aula 02', 'EZ'), ('EZA03', 'Aula 03', 'EZ'), ('EZA04', 'Aula 04', 'EZ'), ('EZA05', 'Aula 05', 'EZ'), ('EZA06', 'Aula 06', 'EZ'), ('EZA07', 'Aula 07', 'EZ'), ('EZA08', 'Aula 08', 'EZ');

-- Bloque 6: Edificios con Números (1, 3, 4, 5, 6, 7)
INSERT INTO Sublocalizaciones (id_sublocalizacion, nombre_sublocalizacion, id_edificio) VALUES 
('CCA01', 'Aula 01', 'CC'), ('CCA02', 'Aula 02', 'CC'), ('CCA03', 'Aula 03', 'CC'), ('CCA04', 'Aula 04', 'CC'), ('CCA05', 'Aula 05', 'CC'), ('CCA06', 'Aula 06', 'CC'), ('CCA07', 'Aula 07', 'CC'), ('CCA08', 'Aula 08', 'CC'),
('E3A01', 'Aula 01', 'E3'), ('E3A02', 'Aula 02', 'E3'), ('E3A03', 'Aula 03', 'E3'), ('E3A04', 'Aula 04', 'E3'), ('E3A05', 'Aula 05', 'E3'), ('E3A06', 'Aula 06', 'E3'), ('E3A07', 'Aula 07', 'E3'), ('E3A08', 'Aula 08', 'E3'),
('E4A01', 'Aula 01', 'E4'), ('E4A02', 'Aula 02', 'E4'), ('E4A03', 'Aula 03', 'E4'), ('E4A04', 'Aula 04', 'E4'), ('E4A05', 'Aula 05', 'E4'), ('E4A06', 'Aula 06', 'E4'), ('E4A07', 'Aula 07', 'E4'), ('E4A08', 'Aula 08', 'E4'),
('E5A01', 'Aula 01', 'E5'), ('E5A02', 'Aula 02', 'E5'), ('E5A03', 'Aula 03', 'E5'), ('E5A04', 'Aula 04', 'E5'), ('E5A05', 'Aula 05', 'E5'), ('E5A06', 'Aula 06', 'E5'), ('E5A07', 'Aula 07', 'E5'), ('E5A08', 'Aula 08', 'E5'),
('UAA01', 'Aula 01', 'UA'), ('UAA02', 'Aula 02', 'UA'), ('UAA03', 'Aula 03', 'UA'), ('UAA04', 'Aula 04', 'UA'), ('UAA05', 'Aula 05', 'UA'), ('UAA06', 'Aula 06', 'UA'), ('UAA07', 'Aula 07', 'UA'), ('UAA08', 'Aula 08', 'UA'),
('UPA01', 'Aula 01', 'UP'), ('UPA02', 'Aula 02', 'UP'), ('UPA03', 'Aula 03', 'UP'), ('UPA04', 'Aula 04', 'UP'), ('UPA05', 'Aula 05', 'UP'), ('UPA06', 'Aula 06', 'UP'), ('UPA07', 'Aula 07', 'UP'), ('UPA08', 'Aula 08', 'UP');

-- Tipos de CI
INSERT INTO Tipo_CI (id_tipo_ci, nombre_tipo) VALUES 
('T01', 'Laptop'),
('T02', 'Switch'),
('T03', 'Proyector');

-- Areas y servicios (catalogo)
INSERT INTO Areas (id_area, nombre_area) VALUES 
('AR00000001', 'General');

INSERT INTO Servicios (id_servicio, nombre, id_area, descripcion, tiempo_servicio, prioridad) VALUES 
('SV00000001', N'Servicio general', 'AR00000001', NULL, NULL, 'Media');

-- Usuarios (Responsables y Técnicos)
INSERT INTO Usuarios (id_usuario, nombre_completo, correo, password_hash, id_rol) VALUES 
('USR01', 'Santiago Admin 2', 'santiago@empresa.com', 'hash_secure_123', 'ROL01'),
('USR02', 'Juan Tecnico', 'juan.mant@empresa.com', 'hash_secure_456', 'ROL02');

INSERT INTO Tecnico (id_tecnico, id_usuario, id_area, horario) VALUES
('TC00000001', 'USR02', 'AR00000001', NULL);

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
    id_mantenimiento, id_ci, id_servicio, tipo_mantenimiento, descripcion_tarea, 
    estado, id_tecnico_asignado, costo, id_usuario_reporta
) VALUES (
    'MANT001', 'LAP-EDA-01', 'SV00000001', 'Preventivo', 'Limpieza interna y cambio de pasta térmica', 
    'En Proceso', 'USR02', 25.50, 'USR01'
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