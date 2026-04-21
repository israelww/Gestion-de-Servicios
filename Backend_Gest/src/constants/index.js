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

module.exports = {
  ROLE_ADMIN,
  ROLE_TECNICO,
  EXPECTED_DATABASE,
  CI_DEFAULT_STATUS,
  DESKTOP_TIPO_CI_ID,
  ESPECIFICACIONES_HARDWARE_MAX_LEN,
  PRIORIDADES_VALIDAS,
}
