

create database ControlTotal
use ControlTotal
GO

create table Roles(
	id_rol char(10) PRIMARY KEY,
	nombre_rol varchar(50) NOT NULL,
	descripcion_rol varchar(255) NOT NULL
	)

create table Edificios(
	id_edificio char(10) PRIMARY KEY,
	nombre_edificio varchar(50) NOT NULL,
	descripcion_edificio varchar(255) NOT NULL
	)
create table marcas(
	id_marca char(10) PRIMARY KEY,
	nombre_marca varchar(50) NOT NULL,
	)
-- 2. Ubicaciones y Tipos
CREATE TABLE Sublocalizaciones (
    id_sublocalizacion CHAR(10) PRIMARY KEY,
    nombre_sublocalizacion VARCHAR(100) NOT NULL,
    id_edificio CHAR(10) REFERENCES Edificios(id_edificio)
);

CREATE TABLE Tipo_CI (
    id_tipo_ci CHAR(10) PRIMARY KEY,
    nombre_tipo VARCHAR(100) NOT NULL -- Ej: Laptop, Proyector
);

-- 3. Usuarios
CREATE TABLE Usuarios (
    id_usuario CHAR(15) PRIMARY KEY,
    nombre_completo VARCHAR(150) NOT NULL,
    correo VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    id_rol char(10) REFERENCES Roles(id_rol)
);

-- 4. Elementos de Configuraci�n (El n�cleo)
CREATE TABLE Elementos_Configuracion (
    id_ci VARCHAR(25) PRIMARY KEY,
    numero_serie VARCHAR(50) UNIQUE NOT NULL,
    nombre_equipo VARCHAR(100),
    modelo VARCHAR(100),
    estado VARCHAR(20) DEFAULT 'Activo', -- Activo, Inactivo, Mantenimiento, Baja
    id_tipo_ci CHAR(10) REFERENCES Tipo_CI(id_tipo_ci),
    id_marca CHAR(10) REFERENCES marcas(id_marca),
    id_sublocalizacion CHAR(10) REFERENCES Sublocalizaciones(id_sublocalizacion),
    id_usuario_responsable CHAR(15) REFERENCES Usuarios(id_usuario),
    fecha_ingreso DATE DEFAULT CURRENT_DATE
);

-- 5. NUEVA: Tabla de Mantenimientos (Lo que te faltaba)
CREATE TABLE Mantenimientos (
    id_mantenimiento char(10) PRIMARY KEY,
    id_ci VARCHAR(25) REFERENCES Elementos_Configuracion(id_ci),
    fecha_mantenimiento DATETIME,
    tipo_mantenimiento VARCHAR(50), -- Preventivo, Correctivo
    descripcion_tarea TEXT,
    tecnico_externo VARCHAR(100), -- Por si no es un usuario del sistema
    costo DECIMAL(10, 2),
    id_usuario_reporta CHAR(15) REFERENCES Usuarios(id_usuario)
);

-- 6. Reportes de fallas
CREATE TABLE Reportes (
    id_reporte INT IDENTITY(1,1) PRIMARY KEY,
    id_edificio CHAR(10) REFERENCES Edificios(id_edificio),
    id_sublocalizacion CHAR(10) REFERENCES Sublocalizaciones(id_sublocalizacion),
    id_ci VARCHAR(25) REFERENCES Elementos_Configuracion(id_ci),
    descripcion_falla VARCHAR(1000) NOT NULL,
    fecha_reporte DATETIME DEFAULT GETDATE(),
    estado VARCHAR(20) DEFAULT 'Abierto',
    id_usuario_reporta CHAR(15) REFERENCES Usuarios(id_usuario)
);

ALTER TABLE Mantenimientos
ADD id_reporte INT NULL REFERENCES Reportes(id_reporte);

ALTER TABLE Mantenimientos
ADD id_tecnico CHAR(15) NULL REFERENCES Usuarios(id_usuario);

CREATE TABLE Mantenimiento_Detalle (
  id_detalle INT IDENTITY(1,1) PRIMARY KEY,
  id_mantenimiento CHAR(10) REFERENCES Mantenimientos(id_mantenimiento),
  tipo_cambio VARCHAR(50), -- Cambio de pieza, limpieza, actualizacion, etc
  componente VARCHAR(100), -- Disco duro, RAM, Fuente, etc
  valor_anterior VARCHAR(200),
  valor_nuevo VARCHAR(200),
  notas VARCHAR(500)
);



