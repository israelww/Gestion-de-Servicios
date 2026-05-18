import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { getToken } from "../../auth/storage";
import { ticketEstadoBadgeClasses } from "../../utils/ticketEstadoBadge";

const API_BASE_URL = "http://localhost:4000/api";

interface Reporte {
  id_reporte: string;
  id_ci: string;
  descripcion_falla: string;
  fecha_reporte: string;
  estado: string;
  prioridad: string;
  nombre_edificio: string;
  nombre_sublocalizacion: string;
  nombre_equipo: string | null;
  numero_serie: string | null;
  tecnico_asignado: string | null;
  usuario_reporta: string | null;
}

const headers = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const estados = ["Todos", "Pendiente", "Asignado", "En Proceso", "Terminado", "Cerrado", "Liberado"];

export default function AdminTickets() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [reportes, setReportes] = useState<Reporte[]>([]);

  const estadoFiltro = searchParams.get("estado") || "Todos";

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await axios.get<Reporte[]>(`${API_BASE_URL}/admin/reportes/todos`, {
        headers: headers(),
      });
      setReportes(res.data || []);
      setErrorMessage("");
    } catch (error) {
      console.error(error);
      setErrorMessage("No se pudo cargar la lista de tickets.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const reportesFiltrados = useMemo(() => {
    if (!estadoFiltro || estadoFiltro === "Todos") return reportes;
    return reportes.filter((r) => r.estado.trim().toLowerCase() === estadoFiltro.trim().toLowerCase());
  }, [reportes, estadoFiltro]);

  const onChangeEstado = (estado: string) => {
    if (estado === "Todos") {
      setSearchParams({});
      return;
    }
    setSearchParams({ estado });
  };

  return (
    <section className="mt-10 rounded-[24px] bg-white p-8 text-slate-900 shadow-2xl md:p-10 xl:p-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[#001f3f]">Todos los tickets</h2>
          <p className="mt-1 text-sm text-slate-500">Consulta y abre el detalle de cualquier ticket.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/admin/bandeja-entrada")}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          Regresar
        </button>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {estados.map((estado) => {
          const active = estadoFiltro.toLowerCase() === estado.toLowerCase();
          return (
            <button
              key={estado}
              type="button"
              onClick={() => onChangeEstado(estado)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                active ? "bg-[#001f3f] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {estado}
            </button>
          );
        })}
      </div>

      {errorMessage ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
          Cargando tickets...
        </div>
      ) : null}

      {!loading && (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Equipo</th>
                <th className="px-4 py-3">Ubicacion</th>
                <th className="px-4 py-3">Reporta</th>
                <th className="px-4 py-3">Tecnico</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {!reportesFiltrados.length ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
                    No hay tickets para el filtro seleccionado.
                  </td>
                </tr>
              ) : null}
              {reportesFiltrados.map((reporte) => (
                <tr key={reporte.id_reporte} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{reporte.id_reporte}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {reporte.nombre_equipo || reporte.numero_serie || reporte.id_ci}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {reporte.nombre_edificio} / {reporte.nombre_sublocalizacion}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{reporte.usuario_reporta || "N/D"}</td>
                  <td className="px-4 py-3 text-slate-700">{reporte.tecnico_asignado || "No asignado"}</td>
                  <td className="px-4 py-3 text-slate-700">{formatDate(reporte.fecha_reporte)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${ticketEstadoBadgeClasses(
                        reporte.estado
                      )}`}
                    >
                      {reporte.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/tickets/${reporte.id_reporte}`)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
