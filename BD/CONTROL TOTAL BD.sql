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

-- Catálogo de áreas profesional
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
    id_ci VARCHAR(50) PRIMARY KEY,
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
    id_ci VARCHAR(50) REFERENCES Elementos_Configuracion(id_ci),
    fecha_mantenimiento DATETIME DEFAULT GETDATE(),
    tipo_mantenimiento VARCHAR(50) DEFAULT 'Correctivo', -- Preventivo, Correctivo
    descripcion_tarea TEXT,
    descripcion_solucion VARCHAR(1000),
    diagnostico_inicial VARCHAR(1000),
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
    fecha_asignacion DATETIME,
    fecha_terminado DATETIME,
    fecha_cierre DATETIME,
    id_solicitud_investigacion CHAR(10) NULL
);

CREATE TABLE Mantenimiento_Servicios (
    id_mantenimiento CHAR(10) NOT NULL REFERENCES Mantenimientos(id_mantenimiento),
    id_servicio CHAR(10) NOT NULL REFERENCES Servicios(id_servicio),
    fecha_registro DATETIME NOT NULL DEFAULT GETDATE(),
    PRIMARY KEY (id_mantenimiento, id_servicio)
);

GO

CREATE VIEW Catalogo_Servicios AS
SELECT
    id_servicio,
    COALESCE(descripcion, nombre) AS descripcion,
    tiempo_servicio AS tiempo_estimado_minutos
FROM Servicios;

GO

-- 6. Historial de cambios en CIs
CREATE TABLE Historial_Cambios_CI (
    id_historial INT IDENTITY(1,1) PRIMARY KEY,
    id_ci VARCHAR(50) NOT NULL REFERENCES Elementos_Configuracion(id_ci),
    id_mantenimiento CHAR(10) REFERENCES Mantenimientos(id_mantenimiento),
    id_solicitud CHAR(12) NULL,
    numero_rfc VARCHAR(25) NULL,
    fecha_cambio DATETIME NOT NULL DEFAULT GETDATE(),
    numero_transaccion VARCHAR(40),
    origen_transaccion VARCHAR(40), -- Ticket, Mantenimiento Preventivo, Otro
    tecnico VARCHAR(120) NOT NULL,
    detalle_cambio VARCHAR(500) NOT NULL,
    fecha_registro DATETIME NOT NULL DEFAULT GETDATE()
);

-- 7. Inventario de componentes / repuestos
CREATE TABLE Componentes_Inventario (
    id_componente CHAR(10) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion VARCHAR(500) NULL,
    cantidad_stock INT NOT NULL CONSTRAINT DF_Componentes_stock DEFAULT 0,
    precio_unitario DECIMAL(10, 2) NOT NULL,
    unidad VARCHAR(20) NULL,
    activo BIT NOT NULL CONSTRAINT DF_Componentes_activo DEFAULT 1,
    id_ci VARCHAR(50) NULL,
    CONSTRAINT PK_Componentes_Inventario PRIMARY KEY (id_componente),
    CONSTRAINT FK_Componentes_CI FOREIGN KEY (id_ci) REFERENCES Elementos_Configuracion(id_ci)
);

-- 8. Solicitudes de cambio de componentes (RFC)
CREATE TABLE Solicitud_Cambio_Componente (
    id_solicitud CHAR(12) NOT NULL,
    numero_rfc VARCHAR(25) NOT NULL,
    id_ci VARCHAR(50) NOT NULL,
    id_mantenimiento CHAR(10) NOT NULL,
    id_tecnico CHAR(15) NOT NULL,
    detalle_cambio VARCHAR(500) NOT NULL,
    fecha_solicitud DATETIME NOT NULL CONSTRAINT DF_SolicitudCambio_fecha DEFAULT GETDATE(),
    estado VARCHAR(30) NOT NULL,
    monto_total DECIMAL(12, 2) NOT NULL,
    requiere_institucion BIT NOT NULL CONSTRAINT DF_SolicitudCambio_inst DEFAULT 0,
    fecha_institucion_ok DATETIME NULL,
    comentario_admin VARCHAR(500) NULL,
    fecha_resolucion DATETIME NULL,
    id_historial INT NULL,
    CONSTRAINT PK_Solicitud_Cambio PRIMARY KEY (id_solicitud),
    CONSTRAINT UQ_Solicitud_Cambio_RFC UNIQUE (numero_rfc),
    CONSTRAINT FK_SolicitudCambio_CI FOREIGN KEY (id_ci) REFERENCES Elementos_Configuracion(id_ci),
    CONSTRAINT FK_SolicitudCambio_Mantenimiento FOREIGN KEY (id_mantenimiento) REFERENCES Mantenimientos(id_mantenimiento),
    CONSTRAINT FK_SolicitudCambio_Tecnico FOREIGN KEY (id_tecnico) REFERENCES Usuarios(id_usuario),
    CONSTRAINT FK_SolicitudCambio_Historial FOREIGN KEY (id_historial) REFERENCES Historial_Cambios_CI(id_historial)
);

-- 9. Gestion de problemas ITIL: solicitudes de investigacion de causa raiz
CREATE TABLE Solicitudes_Investigacion (
    id_solicitud CHAR(10) PRIMARY KEY,
    titulo VARCHAR(150) NOT NULL,
    descripcion_problematica TEXT NOT NULL,
    id_tipo_ci CHAR(10) NOT NULL REFERENCES Tipo_CI(id_tipo_ci),
    id_administrador CHAR(15) NOT NULL REFERENCES Usuarios(id_usuario),
    id_tecnico_especialista CHAR(15) NOT NULL REFERENCES Usuarios(id_usuario),
    fecha_creacion DATETIME NOT NULL DEFAULT GETDATE(),
    estado VARCHAR(20) NOT NULL DEFAULT 'En Investigacion',
    CONSTRAINT CK_SolicitudesInvestigacion_estado CHECK (estado IN ('En Investigacion', 'Resuelto'))
);

-- 10. KEDB: Known Error Database
CREATE TABLE Tabla_Conocimiento (
    id_conocimiento INT IDENTITY(1,1) PRIMARY KEY,
    id_solicitud CHAR(10) NOT NULL REFERENCES Solicitudes_Investigacion(id_solicitud),
    id_tipo_ci CHAR(10) NOT NULL REFERENCES Tipo_CI(id_tipo_ci),
    error_conocido VARCHAR(255) NOT NULL,
    causa_raiz TEXT NOT NULL,
    solucion TEXT NOT NULL,
    fecha_registro DATETIME NOT NULL DEFAULT GETDATE()
);

ALTER TABLE Mantenimientos
ADD CONSTRAINT FK_Mantenimientos_SolicitudInvestigacion
FOREIGN KEY (id_solicitud_investigacion) REFERENCES Solicitudes_Investigacion(id_solicitud);

CREATE TABLE Solicitud_Cambio_Detalle (
    id_detalle INT IDENTITY(1,1) PRIMARY KEY,
    id_solicitud CHAR(12) NOT NULL,
    id_componente CHAR(10) NOT NULL,
    cantidad INT NOT NULL,
    precio_unitario DECIMAL(10, 2) NOT NULL,
    CONSTRAINT FK_SolicitudDetalle_Solicitud FOREIGN KEY (id_solicitud) REFERENCES Solicitud_Cambio_Componente(id_solicitud),
    CONSTRAINT FK_SolicitudDetalle_Componente FOREIGN KEY (id_componente) REFERENCES Componentes_Inventario(id_componente)
);
