const jwt = require('jsonwebtoken')
const { ROLE_ADMIN, ROLE_TECNICO } = require('../constants')
const { toTrimmedString } = require('../helpers/sqlHelpers')

const JWT_SECRET = process.env.JWT_SECRET || 'demo_secret'

/**
 * Extrae el token Bearer del header Authorization.
 */
function getJwtFromHeader(req) {
  const header = req.headers.authorization || ''
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

/**
 * Middleware: verifica que la petición tenga un JWT válido.
 * Adjunta el payload decodificado en req.user.
 */
function requireAuth(req, res, next) {
  const token = getJwtFromHeader(req)
  if (!token) return res.status(401).json({ message: 'No autorizado' })

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = payload
    return next()
  } catch {
    return res.status(401).json({ message: 'Token invalido' })
  }
}

/**
 * Fábrica de middleware que verifica que el usuario tenga uno de los roles permitidos.
 * Debe usarse DESPUÉS de requireAuth.
 */
function requireRole(rolesPermitidos) {
  return (req, res, next) => {
    const rol = toTrimmedString(req.user?.rol)
    if (!rol || !rolesPermitidos.includes(rol)) {
      return res.status(403).json({ message: 'No autorizado para esta accion' })
    }
    return next()
  }
}

// ─── Combinaciones pre-armadas ────────────────────────────────────────────────
const requireAnyAuth        = [requireAuth]
const requireAdmin          = [requireAuth, requireRole([ROLE_ADMIN])]
const requireTecnico        = [requireAuth, requireRole([ROLE_TECNICO])]
const requireAdminOrTecnico = [requireAuth, requireRole([ROLE_ADMIN, ROLE_TECNICO])]

module.exports = {
  JWT_SECRET,
  getJwtFromHeader,
  requireAuth,
  requireRole,
  requireAnyAuth,
  requireAdmin,
  requireTecnico,
  requireAdminOrTecnico,
}
