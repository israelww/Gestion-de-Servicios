// ─── Roles ───────────────────────────────────────────────────────────────────
const ROLE_ADMIN   = 'Administrador'
const ROLE_TECNICO = 'Tecnico'

// ─── Base de datos ────────────────────────────────────────────────────────────
const EXPECTED_DATABASE = 'ControlTotal'

// ─── CI ───────────────────────────────────────────────────────────────────────
const CI_DEFAULT_STATUS              = 'Activo'
const DESKTOP_TIPO_CI_ID             = 'T04'
const ESPECIFICACIONES_HARDWARE_MAX_LEN = 65536

// ─── Mantenimientos ───────────────────────────────────────────────────────────
const PRIORIDADES_VALIDAS = ['Baja', 'Media', 'Alta', 'Critica']

// ─── Solicitudes de cambio / inventario ───────────────────────────────────────
const SOLICITUD_ESTADO_PENDIENTE = 'Pendiente'
const SOLICITUD_ESTADO_PENDIENTE_INSTITUCION = 'PendienteInstitucion'
const SOLICITUD_ESTADO_AUTORIZADA_INSTITUCION = 'AutorizadaInstitucion'
const SOLICITUD_ESTADO_APROBADA = 'Aprobada'
const SOLICITUD_ESTADO_RECHAZADA = 'Rechazada'
const MONTO_LIMITE_INSTITUCION_MXN = 1000

module.exports = {
  ROLE_ADMIN,
  ROLE_TECNICO,
  EXPECTED_DATABASE,
  CI_DEFAULT_STATUS,
  DESKTOP_TIPO_CI_ID,
  ESPECIFICACIONES_HARDWARE_MAX_LEN,
  PRIORIDADES_VALIDAS,
  SOLICITUD_ESTADO_PENDIENTE,
  SOLICITUD_ESTADO_PENDIENTE_INSTITUCION,
  SOLICITUD_ESTADO_AUTORIZADA_INSTITUCION,
  SOLICITUD_ESTADO_APROBADA,
  SOLICITUD_ESTADO_RECHAZADA,
  MONTO_LIMITE_INSTITUCION_MXN,
}
