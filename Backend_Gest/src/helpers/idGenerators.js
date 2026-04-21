const sql  = require('mssql')
const { ROLE_ADMIN, ROLE_TECNICO } = require('../constants')
const { toTrimmedString } = require('./sqlHelpers')

// ─── Generadores de IDs ───────────────────────────────────────────────────────

async function findNextMaintenanceId(request) {
  const result = await request.query(
    `SELECT id_mantenimiento
     FROM Mantenimientos
     WHERE id_mantenimiento LIKE 'MT%'`
  )
  const maxSequence = (result.recordset || []).reduce((max, row) => {
    const suffix = Number.parseInt(String(row.id_mantenimiento || '').replace(/^MT/, ''), 10)
    return Number.isNaN(suffix) ? max : Math.max(max, suffix)
  }, 0)
  return `MT${String(maxSequence + 1).padStart(8, '0')}`
}

async function findNextAreaId(request) {
  const result = await request.query(
    `SELECT id_area
     FROM Areas
     WHERE id_area LIKE 'AR%'`
  )
  const maxSequence = (result.recordset || []).reduce((max, row) => {
    const suffix = Number.parseInt(String(row.id_area || '').replace(/^AR/, ''), 10)
    return Number.isNaN(suffix) ? max : Math.max(max, suffix)
  }, 0)
  return `AR${String(maxSequence + 1).padStart(8, '0')}`
}

async function findNextServicioId(request) {
  const result = await request.query(
    `SELECT id_servicio
     FROM Servicios
     WHERE id_servicio LIKE 'SV%'`
  )
  const maxSequence = (result.recordset || []).reduce((max, row) => {
    const suffix = Number.parseInt(String(row.id_servicio || '').replace(/^SV/, ''), 10)
    return Number.isNaN(suffix) ? max : Math.max(max, suffix)
  }, 0)
  return `SV${String(maxSequence + 1).padStart(8, '0')}`
}

async function findNextTecnicoId(request) {
  const result = await request.query(
    `SELECT id_tecnico FROM Tecnico WHERE id_tecnico LIKE 'TC%'`
  )
  const max = (result.recordset || []).reduce((m, row) => {
    const raw = String(row.id_tecnico || '').replace(/^TC/i, '')
    const n   = Number.parseInt(raw, 10)
    return Number.isNaN(n) ? m : Math.max(m, n)
  }, 0)
  return `TC${String(max + 1).padStart(8, '0')}`
}

async function findNextUsuarioIdForRole(request, roleCode) {
  const prefix  = `USR_${roleCode}_`
  const pattern = `${prefix}%`
  const result  = await request
    .input('usrPat', sql.VarChar(32), pattern)
    .query(`SELECT id_usuario FROM Usuarios WHERE id_usuario LIKE @usrPat`)
  let max = 0
  for (const row of result.recordset || []) {
    const id     = String(row.id_usuario || '')
    if (!id.startsWith(prefix)) continue
    const suffix = id.slice(prefix.length)
    const n      = Number.parseInt(suffix, 10)
    if (!Number.isNaN(n)) max = Math.max(max, n)
  }
  return `${prefix}${String(max + 1).padStart(5, '0')}`
}

// ─── Helpers de roles / técnicos ─────────────────────────────────────────────

/**
 * Devuelve un código de 4 caracteres para el rol (usado en la generación de IDs).
 */
function fourCharRoleCode(nombreRol) {
  const n = toTrimmedString(nombreRol)
  if (n === ROLE_ADMIN)   return 'ADMN'
  if (n === ROLE_TECNICO) return 'TECN'
  const ascii = n
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
  const four = ascii.slice(0, 4)
  if (four.length >= 4) return four
  return `${four}XXXX`.slice(0, 4)
}

/**
 * Recupera el nombre del rol dado su ID.
 */
async function getRolNombre(pool, idRol) {
  const r = await pool
    .request()
    .input('id_rol', sql.Char(10), idRol)
    .query(`SELECT nombre_rol FROM Roles WHERE id_rol = @id_rol`)
  return toTrimmedString(r.recordset?.[0]?.nombre_rol)
}

/**
 * Valida que el objeto de horario tenga al menos un día con inicio y fin.
 */
function horarioTecnicoValido(horario) {
  if (!horario || typeof horario !== 'object' || Array.isArray(horario)) return false
  const dias = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']
  for (const d of dias) {
    const v = horario[d]
    if (!v) continue
    if (Array.isArray(v)) {
      for (const slot of v) {
        if (slot && toTrimmedString(slot.inicio) && toTrimmedString(slot.fin)) return true
      }
    } else if (v.activo && toTrimmedString(v.inicio) && toTrimmedString(v.fin)) return true
  }
  return false
}

/**
 * Serializa el objeto de horario a JSON string.
 */
function stringifyHorario(horario) {
  try {
    return JSON.stringify(horario)
  } catch {
    return null
  }
}

module.exports = {
  findNextMaintenanceId,
  findNextAreaId,
  findNextServicioId,
  findNextTecnicoId,
  findNextUsuarioIdForRole,
  fourCharRoleCode,
  getRolNombre,
  horarioTecnicoValido,
  stringifyHorario,
}
