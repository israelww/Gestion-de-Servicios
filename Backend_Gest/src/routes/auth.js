const express = require('express')
const jwt     = require('jsonwebtoken')
const bcrypt  = require('bcryptjs')
const sql     = require('mssql')

const router     = express.Router()
const { getPool }        = require('../config/db')
const { JWT_SECRET, getJwtFromHeader } = require('../middleware/auth')

// POST /api/login
router.post('/login', async (req, res) => {
  const { usuario, password } = req.body || {}

  if (!usuario || !password) {
    return res.status(400).json({ message: 'Faltan credenciales' })
  }

  try {
    const pool = await getPool()
    if (!pool) {
      return res.status(500).json({
        message: 'Backend sin configuración de BD (crea .env con DB_SERVER/DB_USER/DB_PASSWORD/DB_DATABASE)',
      })
    }

    const result = await pool
      .request()
      .input('usuario', sql.VarChar, usuario)
      .query(`
        SELECT
          u.id_usuario,
          u.id_rol,
          u.correo,
          u.password_hash,
          r.nombre_rol
        FROM Usuarios u
        JOIN Roles r ON r.id_rol = u.id_rol
        WHERE u.correo = @usuario
      `)

    const row = result?.recordset?.[0]
    if (!row) {
      return res.status(401).json({ message: 'Credenciales incorrectas' })
    }

    const ok = await bcrypt.compare(password, row.password_hash)
    if (!ok) {
      return res.status(401).json({ message: 'Credenciales incorrectas' })
    }

    const rol   = row.nombre_rol
    const token = jwt.sign(
      { sub: row.id_usuario, correo: row.correo, rol, id_rol: row.id_rol },
      JWT_SECRET,
      { expiresIn: '1h' }
    )

    return res.status(200).json({ message: 'Login exitoso', token, rol, id_rol: row.id_rol })
  } catch (err) {
    console.error('Error en /api/login:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

// GET /api/me
router.get('/me', (req, res) => {
  const token = getJwtFromHeader(req)
  if (!token) return res.status(401).json({ message: 'No autorizado' })

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    return res.status(200).json({
      id_usuario: payload.sub,
      id_rol:     payload.id_rol,
      correo:     payload.correo,
      rol:        payload.rol,
    })
  } catch {
    return res.status(401).json({ message: 'Token inválido' })
  }
})

module.exports = router
