const sql = require('mssql')

/**
 * Convierte un valor a string recortado. Devuelve '' si no es string.
 */
function toTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Responde con HTTP 400 y el mensaje indicado.
 */
function badRequest(res, message) {
  return res.status(400).json({ message })
}

/**
 * Extrae el mensaje legible del error de mssql.
 */
function getServerErrorMessage(err) {
  return (
    err?.originalError?.info?.message ||
    err?.precedingErrors?.[0]?.originalError?.info?.message ||
    err?.message ||
    'Error desconocido'
  )
}

/**
 * Extrae el detalle técnico del error de mssql.
 */
function getServerErrorDetail(err) {
  const info = err?.originalError?.info || err?.precedingErrors?.[0]?.originalError?.info || {}
  return {
    code:       err?.code,
    number:     err?.number     || info.number,
    state:      err?.state      || info.state,
    class:      err?.class      || info.class,
    serverName: err?.serverName || info.serverName,
    procName:   err?.procName   || info.procName,
    lineNumber: err?.lineNumber || info.lineNumber,
  }
}

/**
 * Devuelve true si el error de mssql corresponde a una violación de FK (error 547).
 */
function isForeignKeyError(err) {
  return Number(err?.number) === 547
}

/**
 * Comprueba si existe un registro en la tabla indicada para el valor de columna dado.
 * @param {sql.Request} request
 */
async function existsById(request, table, column, paramName, value) {
  const result = await request
    .input(paramName, sql.VarChar, value)
    .query(`SELECT 1 AS found FROM ${table} WHERE ${column} = @${paramName}`)
  return Boolean(result.recordset?.[0]?.found)
}

module.exports = {
  toTrimmedString,
  badRequest,
  getServerErrorMessage,
  getServerErrorDetail,
  isForeignKeyError,
  existsById,
}
