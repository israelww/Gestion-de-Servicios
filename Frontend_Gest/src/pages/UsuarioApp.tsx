import { Navigate, Route, Routes } from 'react-router-dom';
import NuevoReporte from './reportes/NuevoReporte';
import ReporteDetalles from './reportes/ReporteDetalles';
import UserDashboard from './dashboard/UserDashboard';
import UsuarioLayout from './UsuarioLayout';

export default function UsuarioApp() {
  return (
    <Routes>
      <Route element={<UsuarioLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<UserDashboard />} />
        <Route path="nuevo-reporte" element={<NuevoReporte />} />
        <Route path="reportes/:id" element={<ReporteDetalles />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Route>
    </Routes>
  );
}

