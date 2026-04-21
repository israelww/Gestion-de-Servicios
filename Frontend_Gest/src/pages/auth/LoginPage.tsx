import { useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import axios from 'axios';
import { setAuth, type UserRole } from '../../auth/storage';
import '../../App.css';

interface LoginFormData {
  username: string;
  password: string;
}

interface LoginResponse {
  message: string;
  token: string;
  rol: UserRole;
}

function routeForRole(rol: UserRole): string {
  if (rol === 'Administrador') return '/admin';
  if (rol === 'Tecnico') return '/tecnico/mis-servicios';
  return '/usuario/dashboard';
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: Location } };
  const [formData, setFormData] = useState<LoginFormData>({
    username: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (field: keyof LoginFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage('');
    setErrorMessage('');

    try {
      const response = await axios.post<LoginResponse>('http://localhost:4000/api/login', {
        usuario: formData.username,
        password: formData.password,
      });

      setAuth(response.data.token, response.data.rol);
      setStatusMessage('Bienvenido');

      const from = location.state?.from;
      const redirectTo = from?.pathname ? from.pathname : routeForRole(response.data.rol);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setErrorMessage('Credenciales incorrectas');
    }
  };

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

          {statusMessage ? <p className="status-text success">{statusMessage}</p> : null}
          {errorMessage ? <p className="status-text error">{errorMessage}</p> : null}

          <button type="button" className="link-btn">
            Olvide mi contrasena
          </button>

          <p className="helper-text">No tienes cuenta? Contacta a administracion</p>
        </section>
      </main>
    </div>
  );
}

