require('dotenv').config()

const express = require('express')
const cors    = require('cors')

const app  = express()
const PORT = 4000

// ─── Middlewares globales ─────────────────────────────────────────────────────
app.use(
  cors({
    origin:  'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })
)
app.use(express.json())

// ─── Rutas ────────────────────────────────────────────────────────────────────
app.use('/api', require('./src/routes/auth'))
app.use('/api', require('./src/routes/usuarios'))
app.use('/api', require('./src/routes/areas'))
app.use('/api', require('./src/routes/servicios'))
app.use('/api', require('./src/routes/edificios'))
app.use('/api', require('./src/routes/ci'))
app.use('/api', require('./src/routes/reportes'))
app.use('/api', require('./src/routes/tecnico'))
app.use('/api', require('./src/routes/admin'))

// ─── Arranque del servidor ────────────────────────────────────────────────────
const { testDatabaseConnection } = require('./src/config/db')

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`)
  testDatabaseConnection()
})
