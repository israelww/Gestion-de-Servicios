import { Navigate, Route, Routes } from "react-router-dom";
import AdminInbox from "./AdminInbox";
import AdminActivos from "./AdminActivos";
import AdminLayout from "./AdminLayout";
import AdminUsuarios from "./AdminUsuarios";

export default function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to="bandeja-entrada" replace />} />
        <Route path="bandeja-entrada" element={<AdminInbox />} />
        <Route path="gestion-infraestructura" element={<AdminActivos />} />
        <Route path="catalogo-ci" element={<AdminActivos />} />
        <Route path="gestion-usuarios" element={<AdminUsuarios />} />
        <Route path="*" element={<Navigate to="bandeja-entrada" replace />} />
      </Route>
    </Routes>
  );
}
