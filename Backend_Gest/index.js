require('dotenv').config()

const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const sql = require('mssql')

const app = express()
const PORT = 4000
const JWT_SECRET = process.env.JWT_SECRET || 'demo_secret'

app.use(
  cors({
    origin: 'http://localhost:5173',
    methods: ['POST', 'GET'],
  })
)
app.use(express.json())

const sqlConfig = {
  server: process.env.DB_SERVER,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERT === 'true',
  },
}

let poolPromise = null
function hasSqlConfig() {
  return (
    typeof sqlConfig.server === 'string' &&
    sqlConfig.server.trim().length > 0 &&
    typeof sqlConfig.user === 'string' &&
    sqlConfig.user.trim().length > 0 &&
    typeof sqlConfig.password === 'string' &&
    sqlConfig.password.trim().length > 0 &&
    typeof sqlConfig.database === 'string' &&
    sqlConfig.database.trim().length > 0
  )
}

async function getPool() {
  if (!hasSqlConfig()) return null
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(sqlConfig)
      .connect()
      .then((pool) => {
        console.log('Conectado a SQL Server')
        return pool
      })
      .catch((err) => {
        console.error('Error conectando a SQL Server:', err?.message || err)
        poolPromise = null
        return null
      })
  }
  return await poolPromise
}

function getJwtFromHeader(req) {
  const header = req.headers.authorization || ''
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body || {}

  if (!usuario || !password) {
    return res.status(400).json({ message: 'Faltan credenciales' })
  }

  try {
    const pool = await getPool()
    if (!pool) {
      return res.status(500).json({
        message:
          'Backend sin configuración de BD (crea .env con DB_SERVER/DB_USER/DB_PASSWORD/DB_DATABASE)',
      })
    }

    const result = await pool
      .request()
      .input('usuario', sql.VarChar, usuario)
      .query(
        `
        SELECT
          u.id_usuario,
          u.correo,
          u.password_hash,
          r.nombre_rol
        FROM Usuarios u
        JOIN Roles r ON r.id_rol = u.id_rol
        WHERE u.correo = @usuario
        `
      )

    const row = result?.recordset?.[0]
    if (!row) {
      return res.status(401).json({ message: 'Credenciales incorrectas' })
    }

    const ok = await bcrypt.compare(password, row.password_hash)
    if (!ok) {
      return res.status(401).json({ message: 'Credenciales incorrectas' })
    }

    const rol = row.nombre_rol
    const token = jwt.sign(
      { sub: row.id_usuario, correo: row.correo, rol },
      JWT_SECRET,
      { expiresIn: '1h' }
    )

    return res.status(200).json({
      message: 'Login exitoso',
      token,
      rol,
    })
  } catch (err) {
    console.error('Error en /api/login:', err)
    return res.status(500).json({ message: 'Error interno del servidor' })
  }
})

app.get('/api/me', (req, res) => {
  const token = getJwtFromHeader(req)
  if (!token) return res.status(401).json({ message: 'No autorizado' })

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    return res.status(200).json({
      id_usuario: payload.sub,
      correo: payload.correo,
      rol: payload.rol,
    })
  } catch {
    return res.status(401).json({ message: 'Token inválido' })
  }
})

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`)
})
