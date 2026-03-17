import { useState } from 'react'
import type { FormEvent } from 'react'
import { Eye, EyeOff, Lock, User } from 'lucide-react'
import './App.css'

interface LoginFormData {
  username: string
  password: string
}

function App() {
  const [formData, setFormData] = useState<LoginFormData>({
    username: '',
    password: '',
  })
  const [showPassword, setShowPassword] = useState(false)

  const handleChange = (field: keyof LoginFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // Aqui podrias conectar con tu API de autenticacion
    // console.log(formData)
  }

  return (
    <div className="login-page">
      <div className="login-overlay" />

      <main className="login-shell">
        <section className="login-card" aria-label="Inicio de sesion">
          <div className="logo-wrap" aria-hidden="true">
            <img src="/images/logo.png" alt="Logo" />
          </div>

          <h1 className="login-title">Iniciar Sesion</h1>

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="input-field">
              <span className="input-icon" aria-hidden="true">
                <User size={18} />
              </span>
              <input
                type="text"
                value={formData.username}
                onChange={(event) => handleChange('username', event.target.value)}
                placeholder="Usuario / Correo"
                required
              />
            </label>

            <label className="input-field">
              <span className="input-icon" aria-hidden="true">
                <Lock size={18} />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(event) => handleChange('password', event.target.value)}
                placeholder="Contrasena"
                required
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </label>

            <button type="submit" className="primary-btn">
              Iniciar Sesion
            </button>
          </form>

          <button type="button" className="link-btn">
            Olvide mi contrasena
          </button>

          <p className="helper-text">No tienes cuenta? Contacta a administracion</p>
        </section>
      </main>
    </div>
  )
}

export default App
