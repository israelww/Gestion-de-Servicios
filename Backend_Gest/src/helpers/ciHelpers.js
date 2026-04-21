const sql = require('mssql')
const { DESKTOP_TIPO_CI_ID, ESPECIFICACIONES_HARDWARE_MAX_LEN } = require('../constants')
const { toTrimmedString } = require('./sqlHelpers')

/**
 * Valida y normaliza el campo especificaciones_hardware antes de guardarlo en BD.
 * Solo aplica a CIs de tipo Desktop (T04). Para otros tipos devuelve null.
 */
function normalizeEspecificacionesHardwareForDb(idTipoCi, raw) {
  if (toTrimmedString(idTipoCi) !== DESKTOP_TIPO_CI_ID) {
    return { ok: true, value: null }
  }
  if (raw === undefined || raw === null) {
    return { ok: true, value: null }
  }
  let jsonString
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t) return { ok: true, value: null }
    try {
      JSON.parse(t)
      jsonString = t
    } catch {
      return { ok: false, error: 'especificaciones_hardware debe ser JSON valido' }
    }
  } else if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    try {
      jsonString = JSON.stringify(raw)
    } catch {
      return { ok: false, error: 'No se pudo serializar especificaciones_hardware' }
    }
  } else {
    return { ok: false, error: 'especificaciones_hardware debe ser un objeto o string JSON' }
  }
  if (jsonString.length > ESPECIFICACIONES_HARDWARE_MAX_LEN) {
    return {
      ok: false,
      error: 'especificaciones_hardware excede el tamano maximo permitido',
    }
  }
  return { ok: true, value: jsonString }
}

/**
 * Genera el prefijo de 4 caracteres para el ID del CI a partir del nombre del tipo.
 */
function buildCiPrefix(nombreTipo) {
  const normalized = toTrimmedString(nombreTipo)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  const base = normalized.slice(0, 4) || 'CI'
  return base
}

/**
 * Construye el ID del CI con formato PREFIX-NNNN.
 */
function buildCiId(prefix, sequence) {
  return `${prefix}-${String(sequence).padStart(4, '0')}`
}

/**
 * Consulta el próximo ID disponible para un CI dado su prefijo.
 */
async function findNextCiId(request, prefix) {
  const result = await request
    .input('ciPattern', sql.VarChar, `${prefix}-%`)
    .query(
      `SELECT id_ci
       FROM Elementos_Configuracion
       WHERE id_ci LIKE @ciPattern`
    )

  const maxSequence = (result.recordset || []).reduce((max, row) => {
    const suffix = Number.parseInt(String(row.id_ci || '').split('-')[1], 10)
    return Number.isNaN(suffix) ? max : Math.max(max, suffix)
  }, 0)

  return buildCiId(prefix, maxSequence + 1)
}

/**
 * Obtiene los datos básicos de un tipo de CI.
 */
async function getCiTypeData(request, idTipoCi) {
  const result = await request
    .input('id_tipo_ci', sql.Char(10), idTipoCi)
    .query(
      `SELECT id_tipo_ci, nombre_tipo
       FROM Tipo_CI
       WHERE id_tipo_ci = @id_tipo_ci`
    )
  return result.recordset?.[0] || null
}

module.exports = {
  normalizeEspecificacionesHardwareForDb,
  buildCiPrefix,
  buildCiId,
  findNextCiId,
  getCiTypeData,
}
