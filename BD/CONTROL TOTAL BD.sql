

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
    fecha_mantenimiento DATETIME DEFAULT GETDATE(),
    tipo_mantenimiento VARCHAR(50) DEFAULT 'Correctivo', -- Preventivo, Correctivo
    descripcion_tarea TEXT,
    estado VARCHAR(20) DEFAULT 'Pendiente', -- Pendiente, Asignado, En Proceso, Cerrado
    prioridad VARCHAR(20), -- Baja, Media, Alta, Critica
    id_tecnico_asignado CHAR(15) REFERENCES Usuarios(id_usuario),
    tecnico_externo VARCHAR(100), -- Por si no es un usuario del sistema
    costo DECIMAL(10, 2),
    id_usuario_reporta CHAR(15) REFERENCES Usuarios(id_usuario)
);
