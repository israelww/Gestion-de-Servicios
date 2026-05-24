import { Navigate, Route, Routes } from "react-router-dom";
import AdminInbox from "./AdminInbox";
import AdminActivos from "./AdminActivos";
import AdminLayout from "./AdminLayout";
import AdminUsuarios from "./AdminUsuarios";
import AdminCatalogoServicios from "./AdminCatalogoServicios";
import AdminInventarioComponentes from "./AdminInventarioComponentes";
import AdminSolicitudesCambio from "./AdminSolicitudesCambio";
import AdminProblemas from "./AdminProblemas";
import AdminTickets from "./AdminTickets";
import AdminTicketDetalle from "./AdminTicketDetalle";

export default function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to="bandeja-entrada" replace />} />
        <Route path="bandeja-entrada" element={<AdminInbox />} />
        <Route path="gestion-infraestructura" element={<AdminActivos />} />
        <Route path="catalogo-ci" element={<AdminActivos />} />
        <Route path="catalogo-servicios" element={<AdminCatalogoServicios />} />
        <Route path="inventario-componentes" element={<AdminInventarioComponentes />} />
        <Route path="solicitudes-cambio" element={<AdminSolicitudesCambio />} />
        <Route path="gestion-problemas" element={<AdminProblemas />} />
        <Route path="gestion-usuarios" element={<AdminUsuarios />} />
        <Route path="tickets" element={<AdminTickets />} />
        <Route path="tickets/:id" element={<AdminTicketDetalle />} />
        <Route path="*" element={<Navigate to="bandeja-entrada" replace />} />
      </Route>
    </Routes>
  );
}
