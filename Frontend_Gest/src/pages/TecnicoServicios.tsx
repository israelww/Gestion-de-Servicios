import { useEffect, useState } from "react";
import axios from "axios";
import { getToken } from "../auth/storage";

const API_BASE_URL = "http://localhost:4000/api";

interface ServicioTecnico {
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

export default function TecnicoServicios() {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [servicios, setServicios] = useState<ServicioTecnico[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const response = await axios.get<ServicioTecnico[]>(`${API_BASE_URL}/tecnico/servicios`, {
          headers: headers(),
        });
        setServicios(response.data || []);
        setErrorMessage("");
      } catch (error) {
        console.error(error);
        setErrorMessage("No se pudieron cargar tus servicios asignados.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  return (
    <section className="mt-10 rounded-[24px] bg-white p-8 text-slate-900 shadow-2xl md:p-10 xl:p-12">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[#001f3f]">Mis Servicios</h2>
        <p className="mt-1 text-sm text-slate-600">Reparaciones y reportes asignados a tu usuario tecnico.</p>
      </div>

      {errorMessage ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
          Cargando servicios...
        </div>
      ) : null}

      {!loading && !servicios.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No tienes servicios asignados por ahora.
        </div>
      ) : null}

      <div className="grid gap-4">
        {servicios.map((item) => (
          <article key={item.id_reporte} className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Servicio {item.id_reporte}</h3>
                <p className="text-sm text-slate-600">
                  {item.nombre_equipo || item.numero_serie || item.id_ci} - {item.nombre_edificio} / {item.nombre_sublocalizacion}
                </p>
                <p className="mt-1 text-xs text-slate-500">Reportado por: {item.usuario_reporta || "N/D"}</p>
              </div>
              <div className="text-right">
                <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
                  {item.estado}
                </span>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-amber-700">Prioridad: {item.prioridad}</p>
              </div>
            </div>
            <p className="mt-4 whitespace-pre-line text-sm text-slate-700">{item.descripcion_falla}</p>
            <p className="mt-2 text-xs text-slate-500">Asignado desde: {formatDate(item.fecha_reporte)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
