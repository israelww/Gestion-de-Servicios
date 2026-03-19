import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import NuevoReporte from './reportes/NuevoReporte';
import UserDashboard from './dashboard/UserDashboard';

type Vista = 'dashboard' | 'nuevo-reporte';

function useVistaFromPath(pathname: string): Vista {
  if (pathname.endsWith('/nuevo-reporte')) return 'nuevo-reporte';
  return 'dashboard';
}

export default function UsuarioApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeView = useVistaFromPath(location.pathname);

  const onNavigate = (view: Vista) => {
    if (view === 'nuevo-reporte') navigate('/usuario/nuevo-reporte');
    else navigate('/usuario/dashboard');
  };

  return (
    <Routes>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<UserDashboard activeView={activeView} onNavigate={onNavigate} />} />
      <Route path="nuevo-reporte" element={<NuevoReporte activeView={activeView} onNavigate={onNavigate} />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  );
}

