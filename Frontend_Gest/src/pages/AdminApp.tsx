import { Navigate, Route, Routes } from "react-router-dom";
import AdminActivos from "./AdminActivos";
import AdminCiCambios from "./AdminCiCambios";
import AdminLayout from "./AdminLayout";

export default function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to="gestion-edificios" replace />} />
        <Route path="gestion-edificios" element={<AdminActivos />} />
        <Route path="aulas-laboratorios" element={<AdminActivos />} />
        <Route path="catalogo-ci" element={<AdminActivos />} />
        <Route path="catalogo-ci/:id_ci/cambios" element={<AdminCiCambios />} />
        <Route path="*" element={<Navigate to="gestion-edificios" replace />} />
      </Route>
    </Routes>
  );
}
