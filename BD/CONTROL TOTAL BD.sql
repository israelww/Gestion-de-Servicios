IF DB_ID('ControlTotal') IS NULL
BEGIN
    CREATE DATABASE ControlTotal;
END
GO

USE ControlTotal;
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
	nombre_marca varchar(50) NOT NULL
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

-- Catálogo de áreas y servicios (tickets)
CREATE TABLE Areas (
    id_area CHAR(10) PRIMARY KEY,
    nombre_area VARCHAR(100) NOT NULL
);

CREATE TABLE Servicios (
    id_servicio CHAR(10) PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    id_area CHAR(10) NOT NULL REFERENCES Areas(id_area),
    descripcion VARCHAR(MAX) NULL,
    tiempo_servicio INT NULL,
    prioridad VARCHAR(20) NOT NULL
);

-- 3. Usuarios
CREATE TABLE Usuarios (
    id_usuario CHAR(15) PRIMARY KEY,
    nombre_completo VARCHAR(150) NOT NULL,
    correo VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    id_rol char(10) REFERENCES Roles(id_rol)
);

-- Perfil de tecnicos (area de cobertura y horario)
CREATE TABLE Tecnico (
    id_tecnico CHAR(10) NOT NULL,
    id_usuario CHAR(15) NOT NULL,
    id_area CHAR(10) NOT NULL,
    horario VARCHAR(500) NULL,
    CONSTRAINT PK_Tecnico PRIMARY KEY (id_tecnico),
    CONSTRAINT UQ_Tecnico_Usuario UNIQUE (id_usuario),
    CONSTRAINT FK_Tecnico_Usuario FOREIGN KEY (id_usuario) REFERENCES Usuarios(id_usuario),
    CONSTRAINT FK_Tecnico_Area FOREIGN KEY (id_area) REFERENCES Areas(id_area)
);

-- 4. Elementos de Configuración (El núcleo)
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
    fecha_ingreso DATE DEFAULT CURRENT_DATE,
    especificaciones_hardware NVARCHAR(MAX) NULL
);
ALTER TABLE Elementos_Configuracion ADD especificaciones_hardware NVARCHAR(MAX) NULL;

-- 5. NUEVA: Tabla de Mantenimientos (Lo que te faltaba)
CREATE TABLE Mantenimientos (
    id_mantenimiento char(10) PRIMARY KEY,
    id_ci VARCHAR(25) REFERENCES Elementos_Configuracion(id_ci),
    fecha_mantenimiento DATETIME DEFAULT GETDATE(),
    tipo_mantenimiento VARCHAR(50) DEFAULT 'Correctivo', -- Preventivo, Correctivo
    descripcion_tarea TEXT,
    descripcion_solucion VARCHAR(1000),
    calificacion_servicio TINYINT,
    comentario_valoracion VARCHAR(500),
    fecha_valoracion DATETIME,
    estado VARCHAR(20) DEFAULT 'Pendiente', -- Pendiente, Asignado, En Proceso, Cerrado
    id_servicio CHAR(10) NULL REFERENCES Servicios(id_servicio),
    id_area CHAR(10) NULL REFERENCES Areas(id_area),
    id_tecnico_asignado CHAR(15) REFERENCES Usuarios(id_usuario),
    tecnico_externo VARCHAR(100), -- Por si no es un usuario del sistema
    costo DECIMAL(10, 2),
    id_usuario_reporta CHAR(15) REFERENCES Usuarios(id_usuario),
    fecha_cierre DATETIME
);

-- 6. Historial de cambios en CIs
CREATE TABLE Historial_Cambios_CI (
    id_historial INT IDENTITY(1,1) PRIMARY KEY,
    id_ci VARCHAR(25) NOT NULL REFERENCES Elementos_Configuracion(id_ci),
    id_mantenimiento CHAR(10) REFERENCES Mantenimientos(id_mantenimiento),
    fecha_cambio DATETIME NOT NULL DEFAULT GETDATE(),
    numero_transaccion VARCHAR(40),
    origen_transaccion VARCHAR(40), -- Ticket, Mantenimiento Preventivo, Otro
    tecnico VARCHAR(120) NOT NULL,
    detalle_cambio VARCHAR(500) NOT NULL,
    fecha_registro DATETIME NOT NULL DEFAULT GETDATE()
);
