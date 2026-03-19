import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import NuevoReporte from './reportes/NuevoReporte';
import UserDashboard from './dashboard/UserDashboard';
import UsuarioActivos from './UsuarioActivos';
import { usuarioPathForView, usuarioViewFromPath, type UsuarioView } from './usuarioNavigation';

export default function UsuarioApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeView = usuarioViewFromPath(location.pathname);

  const onNavigate = (view: UsuarioView) => {
    navigate(usuarioPathForView(view));
  };

  return (
    <Routes>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<UserDashboard activeView={activeView} onNavigate={onNavigate} />} />
      <Route path="nuevo-reporte" element={<NuevoReporte activeView={activeView} onNavigate={onNavigate} />} />
      <Route path="gestion-edificios" element={<UsuarioActivos activeView={activeView as 'gestion-edificios'} onNavigate={onNavigate} />} />
      <Route path="aulas-laboratorios" element={<UsuarioActivos activeView={activeView as 'aulas-laboratorios'} onNavigate={onNavigate} />} />
      <Route path="catalogo-ci" element={<UsuarioActivos activeView={activeView as 'catalogo-ci'} onNavigate={onNavigate} />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  );
}

