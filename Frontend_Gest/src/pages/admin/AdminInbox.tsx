import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { getToken } from "../../auth/storage";
import { ticketEstadoBadgeClasses } from "../../utils/ticketEstadoBadge";

const API_BASE_URL = "http://localhost:4000/api";
const MAX_PER_COL = 3;

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
  id_tecnico_asignado: string | null;
  tecnico_asignado: string | null;
  id_usuario_reporta: string | null;
  usuario_reporta: string | null;
}

const ESTADOS: {
  key: string;
  label: string;
  icon: string;
  accent: string;
  bg: string;
  border: string;
  btnClass: string;
}[] = [
  {
    key: "Pendiente",
    label: "Pendiente",
    icon: "⏳",
    accent: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-300",
    btnClass: "text-amber-700 border-amber-300 hover:bg-amber-100",
  },
  {
    key: "Asignado",
    label: "Asignado",
    icon: "👤",
    accent: "text-sky-700",
    bg: "bg-sky-50",
    border: "border-sky-300",
    btnClass: "text-sky-700 border-sky-300 hover:bg-sky-100",
  },
  {
    key: "En Proceso",
    label: "En Proceso",
    icon: "🔧",
    accent: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-300",
    btnClass: "text-orange-700 border-orange-300 hover:bg-orange-100",
  },
  {
    key: "Liberado",
    label: "Liberado",
    icon: "✅",
    accent: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-300",
    btnClass: "text-violet-700 border-violet-300 hover:bg-violet-100",
  },
];

const PRIORIDAD_COLOR: Record<string, string> = {
  Alta: "bg-red-100 text-red-700 ring-1 ring-red-300/60",
  Media: "bg-amber-100 text-amber-700 ring-1 ring-amber-300/60",
  Baja: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300/60",
};

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
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [reportes, setReportes] = useState<Reporte[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await axios.get<Reporte[]>(
        `${API_BASE_URL}/admin/reportes/todos`,
        { headers: headers() }
      );
      setReportes(res.data || []);
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

  const byEstado = (key: string) =>
    reportes.filter(
      (r) => r.estado.trim().toLowerCase() === key.trim().toLowerCase()
    );

  const goToList = (estado?: string) =>
    navigate(
      estado
        ? `/admin/tickets?estado=${encodeURIComponent(estado)}`
        : "/admin/tickets"
    );

  const goToDetail = (id: string) =>
    navigate(`/admin/tickets/${id}`);

  return (
    <section className="mt-10 rounded-[24px] bg-white p-8 text-slate-900 shadow-2xl md:p-10 xl:p-12">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#001f3f]">Bandeja de entrada</h2>
          <p className="mt-1 text-sm text-slate-500">
            Los tickets se asignan automáticamente. Visualiza el estado de todos los reportes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => goToList()}
            className="rounded-xl border border-[#001f3f] bg-[#001f3f] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-900"
          >
            Ver todos los tickets
          </button>
          <button
            type="button"
            onClick={() => void loadData()}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
            disabled={loading}
          >
            <span className={loading ? "animate-spin inline-block" : "inline-block"}>↻</span>
            Actualizar
          </button>
        </div>
      </div>

      {/* Error */}
      {errorMessage && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-sm text-slate-500">
          <span className="mr-2 animate-spin text-lg inline-block">↻</span>
          Cargando tickets...
        </div>
      )}

      {/* Kanban columns */}
      {!loading && (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {ESTADOS.map((col) => {
            const allItems = byEstado(col.key);
            const visible = allItems.slice(0, MAX_PER_COL);
            const overflow = allItems.length - MAX_PER_COL;

            return (
              <div key={col.key} className="flex flex-col gap-3">
                {/* Column header */}
                <div
                  className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${col.bg} ${col.border}`}
                >
                  <span className={`flex items-center gap-2 text-sm font-bold ${col.accent}`}>
                    <span>{col.icon}</span>
                    {col.label}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${col.bg} ${col.accent} ring-1 ${col.border}`}
                  >
                    {allItems.length}
                  </span>
                </div>

                {/* Empty state */}
                {allItems.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs text-slate-400">
                    Sin tickets
                  </div>
                )}

                {/* Ticket cards (max 3) */}
                {visible.map((item) => (
                  <article
                    key={item.id_reporte}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
                  >
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                        #{item.id_reporte}
                      </span>
                      <span
                        className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          PRIORIDAD_COLOR[item.prioridad] ??
                          "bg-slate-100 text-slate-600 ring-1 ring-slate-300/60"
                        }`}
                      >
                        {item.prioridad}
                      </span>
                    </div>

                    {/* Equipment & location */}
                    <p className="mt-2 text-sm font-semibold text-slate-800 leading-snug">
                      {item.nombre_equipo || item.numero_serie || item.id_ci}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {item.nombre_edificio} / {item.nombre_sublocalizacion}
                    </p>

                    {/* Description */}
                    <p className="mt-3 line-clamp-2 text-xs text-slate-600 leading-relaxed">
                      {item.descripcion_falla}
                    </p>

                    <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span>🙍</span>
                        <span className="truncate">{item.usuario_reporta || item.id_usuario_reporta || "N/D"}</span>
                      </div>
                      {item.tecnico_asignado && (
                        <div className="flex items-center gap-1.5 text-xs text-sky-700 font-medium">
                          <span>🔧</span>
                          <span className="truncate">{item.tecnico_asignado}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <span>🕐</span>
                        <span>{formatDate(item.fecha_reporte)}</span>
                      </div>
                    </div>

                    {/* Estado badge + detail button */}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${ticketEstadoBadgeClasses(item.estado)}`}
                      >
                        {item.estado}
                      </span>
                      <button
                        type="button"
                        onClick={() => goToDetail(item.id_reporte)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 hover:border-slate-300"
                      >
                        Ver detalles →
                      </button>
                    </div>
                  </article>
                ))}

                {/* "Ver todos" button when there are more than MAX_PER_COL */}
                {overflow > 0 && (
                  <button
                    type="button"
                    onClick={() => goToList(col.key)}
                    className={`mt-1 w-full rounded-2xl border bg-white px-4 py-2.5 text-xs font-bold transition ${col.btnClass}`}
                  >
                    +{overflow} más — Ver todos los {col.label.toLowerCase()}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty overall */}
      {!loading && !reportes.length && !errorMessage && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
          No hay tickets registrados.
        </div>
      )}
    </section>
  );
}
