import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { getToken } from "../../auth/storage";
import { ticketEstadoBadgeClasses } from "../../utils/ticketEstadoBadge";

const API_BASE_URL = "http://localhost:4000/api";

interface ReportePendiente {
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
  id_usuario_reporta: string | null;
  usuario_reporta: string | null;
}

interface Tecnico {
  id_usuario: string;
  nombre_completo: string;
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

export default function AdminInbox() {
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [reportes, setReportes] = useState<ReportePendiente[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [selectedTech, setSelectedTech] = useState<Record<string, string>>({});

  const canAssign = useMemo(
    () => (idReporte: string) => Boolean(selectedTech[idReporte]),
    [selectedTech]
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const [reportesRes, tecnicosRes] = await Promise.all([
        axios.get<ReportePendiente[]>(`${API_BASE_URL}/admin/reportes/pendientes`, { headers: headers() }),
        axios.get<Tecnico[]>(`${API_BASE_URL}/usuarios/tecnicos`, { headers: headers() }),
      ]);

      setReportes(reportesRes.data || []);
      setTecnicos(tecnicosRes.data || []);
      setErrorMessage("");
    } catch (error) {
      console.error(error);
      setErrorMessage("No se pudo cargar la bandeja de entrada.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const assignReport = async (idReporte: string) => {
    const id_tecnico_asignado = selectedTech[idReporte];
    if (!id_tecnico_asignado) return;

    setSubmittingId(idReporte);
    setErrorMessage("");
    setStatusMessage("");
    try {
      await axios.put(
        `${API_BASE_URL}/admin/reportes/${idReporte}/asignacion`,
        { id_tecnico_asignado },
        { headers: headers() }
      );
      setStatusMessage(`Reporte ${idReporte} asignado correctamente.`);
      await loadData();
    } catch (error) {
      console.error(error);
      setErrorMessage("No se pudo asignar el reporte.");
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <section className="mt-10 rounded-[24px] bg-white p-8 text-slate-900 shadow-2xl md:p-10 xl:p-12">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[#001f3f]">Bandeja de Entrada</h2>
        <p className="mt-1 text-sm text-slate-600">
          Reportes pendientes: la prioridad viene del catalogo de servicios. Asigna un tecnico para
          continuar.
        </p>
      </div>

      {statusMessage ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {statusMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
          Cargando reportes pendientes...
        </div>
      ) : null}

      {!loading && !reportes.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No hay reportes pendientes por asignar.
        </div>
      ) : null}

      <div className="grid gap-4">
        {reportes.map((item) => (
          <article key={item.id_reporte} className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Reporte {item.id_reporte}</h3>
                <p className="text-sm text-slate-600">
                  {item.nombre_equipo || item.numero_serie || item.id_ci} - {item.nombre_edificio} / {item.nombre_sublocalizacion}
                </p>
                <p className="mt-1 text-xs text-slate-500">Reporta: {item.usuario_reporta || item.id_usuario_reporta || "N/D"}</p>
              </div>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${ticketEstadoBadgeClasses(item.estado)}`}
              >
                {item.estado}
              </span>
            </div>

            <p className="mt-4 whitespace-pre-line text-sm text-slate-700">{item.descripcion_falla}</p>
            <p className="mt-2 text-xs text-slate-500">Fecha: {formatDate(item.fecha_reporte)}</p>
            <p className="mt-2 text-xs font-semibold text-amber-800">
              Prioridad (catalogo): {item.prioridad}
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Tecnico</span>
                <select
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                  value={selectedTech[item.id_reporte] || ""}
                  onChange={(event) =>
                    setSelectedTech((prev) => ({ ...prev, [item.id_reporte]: event.target.value }))
                  }
                >
                  <option value="">Selecciona tecnico</option>
                  {tecnicos.map((tecnico) => (
                    <option key={tecnico.id_usuario} value={tecnico.id_usuario}>
                      {tecnico.nombre_completo}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="rounded-xl bg-[#001f3f] px-6 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canAssign(item.id_reporte) || submittingId === item.id_reporte}
                onClick={() => void assignReport(item.id_reporte)}
              >
                {submittingId === item.id_reporte ? "Asignando..." : "Asignar"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
