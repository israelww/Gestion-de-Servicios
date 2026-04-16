import { Eye } from "lucide-react";
import { useEffect, useState } from "react";
import axios from "axios";
import { getToken } from "../../auth/storage";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = "http://localhost:4000/api";

interface Reporte {
  id_reporte: string;
  id_ci: string;
  descripcion_falla: string;
  fecha_reporte: string;
  estado: string;
  nombre_edificio: string;
  nombre_sublocalizacion: string;
  nombre_equipo: string | null;
  numero_serie: string | null;
}

const headers = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === "string" && message.trim()) return message;
    const status = error.response?.status;
    if (status === 401 || status === 403) return "No autorizado";
  }
  return fallback;
};

function getEstadoClasses(estado: string) {
  if (estado.toLowerCase() === "cerrado") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (estado.toLowerCase() === "en proceso") {
    return "bg-orange-100 text-orange-800";
  }
  return "bg-blue-100 text-blue-800";
}

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

export default function UserDashboard() {
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    const loadReportes = async () => {
      try {
        setLoading(true);
        setErrorMessage(null);
        const response = await axios.get<Reporte[]>(`${API_BASE_URL}/reportes`, {
          headers: headers(),
        });
        if (isMounted) {
          setReportes(response.data || []);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(getApiErrorMessage(error, "No se pudieron cargar los reportes."));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadReportes();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section
      className="mt-10 text-slate-900 shadow-2xl"
      style={{ backgroundColor: "#ffffff", borderRadius: "24px", padding: "48px" }}
    >
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Resumen de Reportes</h2>
        <p className="text-sm text-slate-600">Tus reportes creados</p>
      </div>

      {errorMessage ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
          Cargando reportes...
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Folio</th>
              <th className="px-4 py-3">Equipo</th>
              <th className="px-4 py-3">Ubicacion</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Estado</th>
              <th className="pl-6 pr-8 py-3 text-left">Accion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {!loading && !reportes.length ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                  No hay reportes registrados.
                </td>
              </tr>
            ) : null}
            {reportes.map((reporte) => (
              <tr key={reporte.id_reporte} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{reporte.id_reporte}</td>
                <td className="px-4 py-3 text-slate-700">
                  {reporte.nombre_equipo || reporte.numero_serie || reporte.id_ci}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {reporte.nombre_edificio} / {reporte.nombre_sublocalizacion}
                </td>
                <td className="px-4 py-3 text-slate-700">{formatDate(reporte.fecha_reporte)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getEstadoClasses(
                      reporte.estado
                    )}`}
                  >
                    {reporte.estado}
                  </span>
                </td>
                <td className="pl-6 pr-8 py-3 text-left">
                  <button
                    type="button"
                    className="inline-flex items-center justify-start gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                    onClick={() => navigate(`/usuario/reportes/${reporte.id_reporte}`)}
                  >
                    <Eye className="h-4 w-4" />
                    Ver Detalle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
