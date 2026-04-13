import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { getToken } from "../../auth/storage";

const API_BASE_URL = "http://localhost:4000/api";

interface ReporteDetalle {
  id_reporte: number;
  id_edificio: string;
  id_sublocalizacion: string;
  id_ci: string;
  descripcion_falla: string;
  fecha_reporte: string;
  estado: string;
  nombre_edificio: string;
  nombre_sublocalizacion: string;
  nombre_equipo: string | null;
  numero_serie: string | null;
  usuario_reporta: string | null;
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

function getEstadoClasses(estado: string) {
  if (estado.toLowerCase() === "cerrado") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (estado.toLowerCase() === "en proceso") {
    return "bg-orange-100 text-orange-800";
  }
  return "bg-blue-100 text-blue-800";
}

export default function ReporteDetalles() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [reporte, setReporte] = useState<ReporteDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadReporte = async () => {
      try {
        setLoading(true);
        setErrorMessage(null);
        const response = await axios.get<ReporteDetalle>(`${API_BASE_URL}/reportes/${id}`, {
          headers: headers(),
        });
        if (isMounted) {
          setReporte(response.data);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(getApiErrorMessage(error, "No se pudo cargar el reporte."));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadReporte();

    return () => {
      isMounted = false;
    };
  }, [id]);

  return (
    <section
      className="mt-10 text-slate-900 shadow-2xl"
      style={{ backgroundColor: "#ffffff", borderRadius: "24px", padding: "48px" }}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Detalle del Reporte</h2>
          <p className="text-sm text-slate-600">Folio #{id}</p>
        </div>
        <button
          type="button"
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          onClick={() => navigate(-1)}
        >
          Regresar
        </button>
      </div>

      {errorMessage ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
          Cargando reporte...
        </div>
      ) : null}

      {!loading && reporte ? (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Resumen</h3>
            <dl className="mt-4 grid gap-4 text-sm text-slate-700">
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Equipo</dt>
                <dd className="mt-1 font-medium">
                  {reporte.nombre_equipo || reporte.numero_serie || reporte.id_ci}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Ubicacion</dt>
                <dd className="mt-1">
                  {reporte.nombre_edificio} / {reporte.nombre_sublocalizacion}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Estado</dt>
                <dd className="mt-1">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getEstadoClasses(
                      reporte.estado
                    )}`}
                  >
                    {reporte.estado}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Fecha de reporte</dt>
                <dd className="mt-1">{formatDate(reporte.fecha_reporte)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Usuario que reporta</dt>
                <dd className="mt-1">{reporte.usuario_reporta || "Sin nombre"}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Descripcion de la falla</h3>
            <p className="mt-4 text-sm text-slate-700 whitespace-pre-line">
              {reporte.descripcion_falla}
            </p>
          </section>
        </div>
      ) : null}
    </section>
  );
}
