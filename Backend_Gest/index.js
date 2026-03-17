const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')

const app = express()
const PORT = 4000
const JWT_SECRET = process.env.JWT_SECRET || 'demo_secret'

app.use(
  cors({
    origin: 'http://localhost:5173',
    methods: ['POST'],
  })
)
app.use(express.json())

const demoUser = {
  usuario: 'admin@test.com',
  password: '123456',
}

app.post('/api/login', (req, res) => {
  const { usuario, password } = req.body || {}

  if (usuario === demoUser.usuario && password === demoUser.password) {
    const token = jwt.sign({ usuario }, JWT_SECRET, { expiresIn: '1h' })
    return res.status(200).json({
      message: 'Login exitoso',
      token,
    })
  }

  return res.status(401).json({
    message: 'Credenciales incorrectas',
  })
})

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`)
})
