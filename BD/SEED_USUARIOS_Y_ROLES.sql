USE ControlTotal
GO

-- Roles (IDs propuestos). Si ya existen en tu BD, puedes omitir esta sección
-- o ajustar los id_rol a los que ya uses.
IF NOT EXISTS (SELECT 1 FROM Roles WHERE id_rol = 'ROL_ADMIN')
  INSERT INTO Roles (id_rol, nombre_rol, descripcion_rol)
  VALUES ('ROL_ADMIN', 'Administrador', 'Acceso total al sistema');

IF NOT EXISTS (SELECT 1 FROM Roles WHERE id_rol = 'ROL_TECNIC')
  INSERT INTO Roles (id_rol, nombre_rol, descripcion_rol)
  VALUES ('ROL_TECNIC', 'Tecnico', 'Atiende y gestiona tickets');

IF NOT EXISTS (SELECT 1 FROM Roles WHERE id_rol = 'ROL_USER')
  INSERT INTO Roles (id_rol, nombre_rol, descripcion_rol)
  VALUES ('ROL_USER', 'Usuario', 'Crea y consulta sus tickets');

-- Usuarios demo
-- Contraseñas:
-- - admin@demo.com   -> Admin123*
-- - tecnico@demo.com -> Tecnico123*
-- - usuario@demo.com -> Usuario123*

IF NOT EXISTS (SELECT 1 FROM Usuarios WHERE id_usuario = 'USR_ADMIN_00001')
  INSERT INTO Usuarios (id_usuario, nombre_completo, correo, password_hash, id_rol)
  VALUES (
    'USR_ADMIN_00001',
    'Administrador Demo',
    'admin@demo.com',
    '$2b$10$GKYFEiKoj4CQO47j7IcGTOduJkl7Wkvr3nZIhO11H1Sg7WqOH5LBi',
    'ROL_ADMIN'
  );

IF NOT EXISTS (SELECT 1 FROM Usuarios WHERE id_usuario = 'USR_TECN_00001')
  INSERT INTO Usuarios (id_usuario, nombre_completo, correo, password_hash, id_rol)
  VALUES (
    'USR_TECN_00001',
    'Técnico Demo',
    'tecnico@demo.com',
    '$2b$10$F.kadpcFKXTdvLMPFlmrTeUDjDCtbHG8SI.GBOdbUiWGqjoZTrrlG',
    'ROL_TECNIC'
  );

IF NOT EXISTS (SELECT 1 FROM Usuarios WHERE id_usuario = 'USR_USER_00001')
  INSERT INTO Usuarios (id_usuario, nombre_completo, correo, password_hash, id_rol)
  VALUES (
    'USR_USER_00001',
    'Usuario Demo',
    'usuario@demo.com',
    '$2b$10$b4JfPVrtTwxO.9rV45GCfeKvJwcWG4F7XEm3MKhodKDmfg0HqMb1O',
    'ROL_USER'
  );

SELECT * FROM Usuarios