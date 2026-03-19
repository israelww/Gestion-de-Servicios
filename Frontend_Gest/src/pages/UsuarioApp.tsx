import { Navigate, Route, Routes } from 'react-router-dom';
import NuevoReporte from './reportes/NuevoReporte';
import UserDashboard from './dashboard/UserDashboard';
import UsuarioActivos from './UsuarioActivos';
import UsuarioLayout from './UsuarioLayout';

export default function UsuarioApp() {
  return (
    <Routes>
      <Route element={<UsuarioLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<UserDashboard />} />
        <Route path="nuevo-reporte" element={<NuevoReporte />} />
        <Route path="gestion-edificios" element={<UsuarioActivos />} />
        <Route path="aulas-laboratorios" element={<UsuarioActivos />} />
        <Route path="catalogo-ci" element={<UsuarioActivos />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Route>
    </Routes>
  );
}

