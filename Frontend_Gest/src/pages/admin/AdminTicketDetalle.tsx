import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { getToken } from "../../auth/storage";
import { ticketEstadoBadgeClasses } from "../../utils/ticketEstadoBadge";

const API_BASE_URL = "http://localhost:4000/api";

interface ServicioRealizado {
  id_servicio: string;
  nombre: string;
  descripcion: string | null;
  tiempo_servicio: number | null;
  prioridad: string;
}

interface ReporteDetalle {
  id_reporte: string;
  id_ci: string;
  descripcion_falla: string;
  diagnostico_inicial?: string | null;
  descripcion_solucion?: string | null;
  fecha_reporte: string;
  fecha_asignacion?: string | null;
  fecha_terminado?: string | null;
  fecha_cierre?: string | null;
  estado: string;
  prioridad: string;
  nombre_edificio: string;
  nombre_sublocalizacion: string;
  nombre_equipo: string | null;
  numero_serie: string | null;
  usuario_reporta: string | null;
  tecnico_asignado: string | null;
  servicios_realizados?: ServicioRealizado[];
  total_minutos_estimados?: number;
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

export default function AdminTicketDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [reporte, setReporte] = useState<ReporteDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLiberando, setIsLiberando] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadReporte = async () => {
      try {
        setLoading(true);
        setErrorMessage(null);
        setStatusMessage(null);
        const response = await axios.get<ReporteDetalle>(`${API_BASE_URL}/admin/reportes/${id}`, {
          headers: headers(),
        });
        if (isMounted) {
          setReporte(response.data);
        }
      } catch (error) {
        console.error(error);
        if (isMounted) {
          setErrorMessage("No se pudo cargar el ticket.");
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

  const liberarTicket = async () => {
    if (!reporte || isLiberando) return;

    setIsLiberando(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await axios.put(
        `${API_BASE_URL}/admin/reportes/${reporte.id_reporte}/liberar`,
        {},
        { headers: headers() }
      );

      const response = await axios.get<ReporteDetalle>(`${API_BASE_URL}/admin/reportes/${reporte.id_reporte}`, {
        headers: headers(),
      });
      setReporte(response.data);
      setStatusMessage("Ticket liberado correctamente.");
    } catch (error) {
      console.error(error);
      const message = axios.isAxiosError(error) ? error.response?.data?.message : null;
      setErrorMessage(typeof message === "string" && message.trim() ? message : "No se pudo liberar el ticket.");
    } finally {
      setIsLiberando(false);
    }
  };

  const requiereConfirmacion = Boolean(
    reporte && !["terminado", "cerrado"].includes(reporte.estado.trim().toLowerCase())
  );

  const onClickLiberar = () => {
    if (requiereConfirmacion) {
      setIsConfirmOpen(true);
      return;
    }
    void liberarTicket();
  };

  return (
    <section
      className="mt-10 text-slate-900 shadow-2xl"
      style={{ backgroundColor: "#ffffff", borderRadius: "24px", padding: "48px" }}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Detalle del Ticket</h2>
          <p className="text-sm text-slate-600">Folio #{id}</p>
        </div>
        <button
          type="button"
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          onClick={() => navigate("/admin/tickets")}
        >
          Regresar
        </button>
      </div>

      {errorMessage ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}
      {statusMessage ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {statusMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
          Cargando ticket...
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
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${ticketEstadoBadgeClasses(
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
                <dt className="text-xs font-semibold uppercase text-slate-500">Fecha de asignacion</dt>
                <dd className="mt-1">
                  {reporte.fecha_asignacion ? formatDate(reporte.fecha_asignacion) : "Sin asignacion"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Fecha de terminado</dt>
                <dd className="mt-1">
                  {reporte.fecha_terminado || reporte.fecha_cierre
                    ? formatDate(reporte.fecha_terminado || reporte.fecha_cierre || "")
                    : "Sin terminar"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Usuario que reporta</dt>
                <dd className="mt-1">{reporte.usuario_reporta || "Sin nombre"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Tecnico asignado</dt>
                <dd className="mt-1">{reporte.tecnico_asignado || "No asignado"}</dd>
              </div>
            </dl>
            <div className="mt-6">
              <button
                type="button"
                disabled={isLiberando}
                onClick={onClickLiberar}
                className="rounded-lg bg-[#001f3f] px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLiberando ? "Liberando..." : "Liberar ticket"}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Descripcion de la falla</h3>
            <p className="mt-4 whitespace-pre-line text-sm text-slate-700">{reporte.descripcion_falla}</p>

            {reporte.diagnostico_inicial ? (
              <>
                <h3 className="mt-6 text-lg font-semibold text-slate-900">Diagnostico del tecnico</h3>
                <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{reporte.diagnostico_inicial}</p>
              </>
            ) : null}

            {reporte.descripcion_solucion ? (
              <>
                <h3 className="mt-6 text-lg font-semibold text-slate-900">Trabajo realizado</h3>
                <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{reporte.descripcion_solucion}</p>
              </>
            ) : null}

            {reporte.servicios_realizados?.length ? (
              <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-slate-900">Servicios aplicados</h3>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                    {reporte.total_minutos_estimados || 0} min estimados
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {reporte.servicios_realizados.map((servicio) => (
                    <div key={servicio.id_servicio} className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700">
                      <span className="font-semibold text-slate-900">{servicio.nombre}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {servicio.tiempo_servicio ?? 0} min | {servicio.prioridad}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {isConfirmOpen && reporte ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Confirmar liberacion</h3>
            <p className="mt-2 text-sm text-slate-600">
              El ticket esta en estado <span className="font-semibold">{reporte.estado}</span>. Liberarlo en este
              estado puede afectar el flujo normal.
            </p>
            <p className="mt-2 text-sm text-slate-600">Deseas continuar de todos modos?</p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isLiberando}
                onClick={() => {
                  setIsConfirmOpen(false);
                  void liberarTicket();
                }}
                className="rounded-lg bg-[#001f3f] px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-70"
              >
                {isLiberando ? "Liberando..." : "Si, liberar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
