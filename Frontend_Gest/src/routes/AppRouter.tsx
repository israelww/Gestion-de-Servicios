import { Navigate, Route, Routes } from 'react-router-dom';
import RequireAuth from '../auth/RequireAuth';
import RequireRole from '../auth/RequireRole';
import AdminApp from '../pages/AdminApp';
import LoginPage from '../pages/LoginPage';
import TecnicoApp from '../pages/TecnicoApp';
import UsuarioApp from '../pages/UsuarioApp';

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<RequireRole allow={['Usuario']} />}>
          <Route path="/usuario/*" element={<UsuarioApp />} />
        </Route>

        <Route element={<RequireRole allow={['Administrador']} />}>
          <Route path="/admin/*" element={<AdminApp />} />
        </Route>

        <Route element={<RequireRole allow={['Tecnico']} />}>
          <Route path="/tecnico/*" element={<TecnicoApp />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

