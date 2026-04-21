import { Navigate, Route, Routes } from "react-router-dom";
import TecnicoLayout from "./TecnicoLayout";
import TecnicoServicios from "./TecnicoServicios";

export default function TecnicoApp() {
  return (
    <Routes>
      <Route element={<TecnicoLayout />}>
        <Route index element={<Navigate to="mis-servicios" replace />} />
        <Route path="mis-servicios" element={<TecnicoServicios />} />
        <Route path="*" element={<Navigate to="mis-servicios" replace />} />
      </Route>
    </Routes>
  );
}
