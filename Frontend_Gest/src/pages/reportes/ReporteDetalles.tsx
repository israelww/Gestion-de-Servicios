import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { getToken } from "../../auth/storage";
import { Star } from "lucide-react";

const API_BASE_URL = "http://localhost:4000/api";

interface ReporteDetalle {
  id_reporte: string;
  id_edificio: string;
  id_sublocalizacion: string;
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
  tiempo_servicio?: number | null;
  nombre_edificio: string;
  nombre_sublocalizacion: string;
  nombre_equipo: string | null;
  numero_serie: string | null;
  usuario_reporta: string | null;
  tecnico_asignado: string | null;
  calificacion_servicio?: number | null;
  eval_llego_tiempo_forma?: boolean | null;
  eval_termino_tiempo?: boolean | null;
  eval_area_limpia?: boolean | null;
  eval_amabilidad?: boolean | null;
  comentario_valoracion?: string | null;
  servicios_realizados?: ServicioRealizado[];
  total_minutos_estimados?: number;
}

interface ServicioRealizado {
  id_servicio: string;
  nombre: string;
  descripcion: string | null;
  tiempo_servicio: number | null;
  prioridad: string;
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
  if (estado.toLowerCase() === "terminado") {
    return "bg-teal-100 text-teal-800";
  }
  if (estado.toLowerCase() === "liberado") {
    return "bg-slate-900 text-white";
  }
  if (estado.toLowerCase() === "en proceso") {
    return "bg-orange-100 text-orange-800";
  }
  return "bg-blue-100 text-blue-800";
}

const prioridadMinutos: Record<string, number> = {
  Critica: 60,
  Alta: 120,
  Media: 240,
  Baja: 480,
};

const getMinutosTranscurridos = (reporte: ReporteDetalle) => {
  const inicio = new Date(reporte.fecha_asignacion || reporte.fecha_reporte);
  const fin = new Date(reporte.fecha_terminado || reporte.fecha_cierre || "");
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return null;
  return Math.max(0, Math.round((fin.getTime() - inicio.getTime()) / 60000));
};

export default function ReporteDetalles() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [reporte, setReporte] = useState<ReporteDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isValorarOpen, setIsValorarOpen] = useState(false);
  const [calificacion, setCalificacion] = useState(0);
  const [areaLimpia, setAreaLimpia] = useState(false);
  const [amabilidad, setAmabilidad] = useState(false);
  const [comentario, setComentario] = useState("");
  const [submittingValoracion, setSubmittingValoracion] = useState(false);
  const minutosTranscurridos = reporte ? getMinutosTranscurridos(reporte) : null;
  const limitePrioridad = reporte ? prioridadMinutos[reporte.prioridad] || prioridadMinutos.Media : 0;
  const totalCatalogo = reporte?.total_minutos_estimados || reporte?.tiempo_servicio || 0;
  const llegoTiempoForma = minutosTranscurridos != null ? minutosTranscurridos <= limitePrioridad : false;
  const terminoTiempo =
    minutosTranscurridos != null && totalCatalogo > 0 ? minutosTranscurridos <= totalCatalogo : false;

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

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const openValorarModal = () => {
    if (!reporte) return;
    setCalificacion(reporte.calificacion_servicio || 0);
    setAreaLimpia(Boolean(reporte.eval_area_limpia));
    setAmabilidad(Boolean(reporte.eval_amabilidad));
    setComentario(reporte.comentario_valoracion || "");
    setIsValorarOpen(true);
  };

  const closeValorarModal = () => {
    setIsValorarOpen(false);
    setCalificacion(0);
    setAreaLimpia(false);
    setAmabilidad(false);
    setComentario("");
  };

  const submitValoracion = async () => {
    if (!reporte) return;
    if (!calificacion) {
      setErrorMessage("Selecciona una calificacion en estrellas.");
      return;
    }

    setSubmittingValoracion(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await axios.put(
        `${API_BASE_URL}/reportes/${reporte.id_reporte}/valoracion`,
        {
          calificacion_servicio: calificacion,
          eval_area_limpia: areaLimpia,
          eval_amabilidad: amabilidad,
          comentario_valoracion: comentario,
        },
        { headers: headers() }
      );
      setStatusMessage("Valoracion guardada correctamente.");
      closeValorarModal();

      const response = await axios.get<ReporteDetalle>(`${API_BASE_URL}/reportes/${reporte.id_reporte}`, {
        headers: headers(),
      });
      setReporte(response.data);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudo guardar la valoracion."));
    } finally {
      setSubmittingValoracion(false);
    }
  };

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
      {statusMessage ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {statusMessage}
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
            {["terminado", "cerrado"].includes(reporte.estado.toLowerCase()) ? (
              <button
                type="button"
                className="mt-6 inline-flex items-center justify-start gap-2 rounded-full bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                onClick={openValorarModal}
              >
                <Star className="h-4 w-4" />
                {reporte.calificacion_servicio ? "Editar Evaluacion" : "Verificar y Liberar"}
              </button>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Descripcion de la falla</h3>
            <p className="mt-4 text-sm text-slate-700 whitespace-pre-line">
              {reporte.descripcion_falla}
            </p>

            {reporte.diagnostico_inicial ? (
              <>
                <h3 className="mt-6 text-lg font-semibold text-slate-900">Diagnostico del tecnico</h3>
                <p className="mt-3 whitespace-pre-line text-sm text-slate-700">
                  {reporte.diagnostico_inicial}
                </p>
              </>
            ) : null}

            {reporte.descripcion_solucion ? (
              <>
                <h3 className="mt-6 text-lg font-semibold text-slate-900">Trabajo realizado</h3>
                <p className="mt-3 whitespace-pre-line text-sm text-slate-700">
                  {reporte.descripcion_solucion}
                </p>
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

      {isValorarOpen && reporte ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Verificar y Liberar</h3>
                <p className="text-sm text-slate-600">
                  Tecnico: {reporte.tecnico_asignado || "No asignado"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeValorarModal}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cerrar
              </button>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Llegó en tiempo y forma</p>
                <p className={`mt-2 text-sm font-bold ${llegoTiempoForma ? "text-emerald-700" : "text-red-700"}`}>
                  {llegoTiempoForma ? "Cumple" : "No cumple"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {minutosTranscurridos ?? 0} min contra {limitePrioridad} min por prioridad {reporte.prioridad}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Terminó en tiempo</p>
                <p className={`mt-2 text-sm font-bold ${terminoTiempo ? "text-emerald-700" : "text-red-700"}`}>
                  {terminoTiempo ? "Cumple" : "No cumple"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {minutosTranscurridos ?? 0} min contra {totalCatalogo || 0} min del catalogo
                </p>
              </div>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={areaLimpia}
                  onChange={(e) => setAreaLimpia(e.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="block font-semibold text-slate-900">Dejó limpia el área de trabajo</span>
                  <span className="block text-xs text-slate-500">Confirma el estado físico del lugar.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={amabilidad}
                  onChange={(e) => setAmabilidad(e.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="block font-semibold text-slate-900">Mostró amabilidad</span>
                  <span className="block text-xs text-slate-500">Confirma el trato durante la atención.</span>
                </span>
              </label>
            </div>

            <div className="mb-4">
              <p className="mb-2 text-sm font-semibold text-slate-700">Calificacion general</p>
              <div className="inline-flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCalificacion(value)}
                    className="rounded-full p-1 hover:bg-slate-100"
                    aria-label={`Calificar con ${value} estrella${value > 1 ? "s" : ""}`}
                  >
                    <Star
                      className={`h-7 w-7 ${
                        value <= calificacion
                          ? "fill-amber-400 text-amber-500"
                          : "text-slate-300"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-700">
                Comentario (opcional)
              </span>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-900"
                placeholder="Comparte tu experiencia sobre la solucion aplicada."
              />
            </label>

            <button
              type="button"
              disabled={submittingValoracion || !calificacion}
              onClick={() => void submitValoracion()}
              className="mt-4 w-full rounded-lg bg-[#001f3f] py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-70"
            >
              {submittingValoracion ? "Guardando..." : "Finalizar y Liberar Folio"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
