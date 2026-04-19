import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import { ClipboardList } from "lucide-react";
import { getToken } from "../auth/storage";
import { ticketEstadoBadgeClasses } from "../utils/ticketEstadoBadge";

const API_BASE_URL = "http://localhost:4000/api";

interface ServicioTecnico {
  id_reporte: string;
  id_ci: string;
  tipo_mantenimiento: string;
  descripcion_falla: string;
  diagnostico_inicial: string | null;
  descripcion_solucion: string | null;
  fecha_reporte: string;
  fecha_asignacion: string | null;
  fecha_terminado: string | null;
  fecha_cierre: string | null;
  estado: string;
  prioridad: string;
  tiempo_servicio: number | null;
  nombre_edificio: string;
  nombre_sublocalizacion: string;
  nombre_equipo: string | null;
  numero_serie: string | null;
  usuario_reporta: string | null;
}

interface CiDetalle {
  id_ci: string;
  numero_serie: string;
  nombre_equipo: string | null;
  modelo: string | null;
  estado: string;
  fecha_ingreso: string;
  id_tipo_ci: string;
  id_marca: string;
  id_sublocalizacion: string;
  id_usuario_responsable: string | null;
  nombre_tipo: string;
  nombre_marca: string;
  nombre_sublocalizacion: string;
  nombre_edificio: string;
  usuario_responsable: string | null;
}

type HistorialCambioCI = {
  id_historial: number;
  id_ci: string;
  fecha_cambio: string;
  numero_transaccion: string | null;
  origen_transaccion: string | null;
  tecnico: string;
  detalle_cambio: string;
  fecha_registro: string;
};

interface ServicioCatalogo {
  id_servicio: string;
  nombre: string;
  descripcion: string | null;
  tiempo_servicio: number | null;
  prioridad: string;
}

interface HojaTrabajoResponse {
  ticket: ServicioTecnico & {
    id_area: string | null;
    nombre_area: string | null;
  };
  catalogo_servicios: ServicioCatalogo[];
  servicios_seleccionados: ServicioCatalogo[];
  total_minutos_estimados: number;
}

const initialHistoryForm = {
  fecha_cambio: "",
  detalle_cambio: "",
};

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

const inputClass = (disabled = false) =>
  `w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-900 ${
    disabled ? "cursor-not-allowed bg-slate-100" : "bg-white"
  }`;

export default function TecnicoServicios() {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [servicios, setServicios] = useState<ServicioTecnico[]>([]);
  const [selectedServicio, setSelectedServicio] = useState<ServicioTecnico | null>(null);
  const [historialCambios, setHistorialCambios] = useState<HistorialCambioCI[]>([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialSubmitting, setHistorialSubmitting] = useState(false);
  const [historyForm, setHistoryForm] = useState(initialHistoryForm);
  const [tecnicoId, setTecnicoId] = useState("");
  const [servicioACompletar, setServicioACompletar] = useState<ServicioTecnico | null>(null);
  const [hojaTrabajo, setHojaTrabajo] = useState<HojaTrabajoResponse | null>(null);
  const [hojaLoading, setHojaLoading] = useState(false);
  const [servicioSearch, setServicioSearch] = useState("");
  const [diagnosticoForm, setDiagnosticoForm] = useState("");
  const [serviciosSeleccionados, setServiciosSeleccionados] = useState<string[]>([]);
  const [solucionForm, setSolucionForm] = useState("");
  const [savingHoja, setSavingHoja] = useState(false);
  const [completingTicket, setCompletingTicket] = useState(false);
  const [detalleCi, setDetalleCi] = useState<CiDetalle | null>(null);
  const [detalleCiLoading, setDetalleCiLoading] = useState(false);
  const estadosFinales = ["Terminado", "Cerrado", "Liberado"];
  const serviciosPendientes = servicios.filter((item) => !estadosFinales.includes(item.estado));
  const serviciosCerrados = servicios.filter((item) => estadosFinales.includes(item.estado));
  const selectedSet = new Set(serviciosSeleccionados);
  const serviciosFiltrados =
    hojaTrabajo?.catalogo_servicios.filter((servicio) => {
      const term = servicioSearch.trim().toLowerCase();
      if (!term) return true;
      return `${servicio.nombre} ${servicio.descripcion || ""} ${servicio.prioridad}`
        .toLowerCase()
        .includes(term);
    }) || [];
  const totalMinutosSeleccionados =
    hojaTrabajo?.catalogo_servicios.reduce(
      (total, servicio) =>
        selectedSet.has(servicio.id_servicio) ? total + (Number(servicio.tiempo_servicio) || 0) : total,
      0
    ) || 0;

  const loadServicios = async () => {
    setLoading(true);
    try {
      const response = await axios.get<ServicioTecnico[]>(`${API_BASE_URL}/tecnico/servicios`, {
        headers: headers(),
      });
      setServicios(response.data || []);
      setErrorMessage("");
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, "No se pudieron cargar tus servicios asignados."));
    } finally {
      setLoading(false);
    }
  };

  const loadHistorial = async (idCi: string) => {
    setHistorialLoading(true);
    try {
      const response = await axios.get<HistorialCambioCI[]>(
        `${API_BASE_URL}/ci/${idCi}/historial-cambios`,
        { headers: headers() }
      );
      setHistorialCambios(response.data || []);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudo cargar el historial de cambios."));
    } finally {
      setHistorialLoading(false);
    }
  };

  useEffect(() => {
    void loadServicios();
  }, []);

  useEffect(() => {
    const loadMe = async () => {
      try {
        const response = await axios.get<{ id_usuario: string }>(`${API_BASE_URL}/me`, {
          headers: headers(),
        });
        setTecnicoId(response.data?.id_usuario || "");
      } catch {
        setTecnicoId("");
      }
    };
    void loadMe();
  }, []);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  useEffect(() => {
    if (!errorMessage) return;
    const timer = window.setTimeout(() => setErrorMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [errorMessage]);

  const openHistorialModal = async (item: ServicioTecnico) => {
    setSelectedServicio(item);
    setHistoryForm(initialHistoryForm);
    setHistorialCambios([]);
    setStatusMessage("");
    setErrorMessage("");
    await loadHistorial(item.id_ci);
  };

  const closeHistorialModal = () => {
    setSelectedServicio(null);
    setHistorialCambios([]);
    setHistoryForm(initialHistoryForm);
  };

  const submitHistorialCambio = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedServicio) return;

    setHistorialSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      await axios.post(
        `${API_BASE_URL}/ci/${selectedServicio.id_ci}/historial-cambios`,
        {
          fecha_cambio: historyForm.fecha_cambio || undefined,
          id_mantenimiento: selectedServicio.id_reporte,
          detalle_cambio: historyForm.detalle_cambio,
        },
        { headers: headers() }
      );
      setHistoryForm(initialHistoryForm);
      setStatusMessage("Cambio registrado correctamente.");
      await loadHistorial(selectedServicio.id_ci);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudo registrar el cambio."));
    } finally {
      setHistorialSubmitting(false);
    }
  };

  const openCompletarModal = async (item: ServicioTecnico) => {
    setServicioACompletar(item);
    setHojaTrabajo(null);
    setServicioSearch("");
    setDiagnosticoForm(item.diagnostico_inicial || "");
    setServiciosSeleccionados([]);
    setSolucionForm(item.descripcion_solucion || "");
    setStatusMessage("");
    setErrorMessage("");
    setHojaLoading(true);
    try {
      const response = await axios.get<HojaTrabajoResponse>(
        `${API_BASE_URL}/tecnico/servicios/${item.id_reporte}/hoja-trabajo`,
        { headers: headers() }
      );
      setHojaTrabajo(response.data);
      setDiagnosticoForm(response.data.ticket.diagnostico_inicial || "");
      setSolucionForm(response.data.ticket.descripcion_solucion || "");
      setServiciosSeleccionados(
        (response.data.servicios_seleccionados || []).map((servicio) => servicio.id_servicio)
      );
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudo cargar la hoja de trabajo."));
    } finally {
      setHojaLoading(false);
    }
  };

  const closeCompletarModal = () => {
    setServicioACompletar(null);
    setHojaTrabajo(null);
    setServicioSearch("");
    setDiagnosticoForm("");
    setServiciosSeleccionados([]);
    setSolucionForm("");
  };

  const toggleServicioSeleccionado = (idServicio: string) => {
    setServiciosSeleccionados((prev) =>
      prev.includes(idServicio)
        ? prev.filter((item) => item !== idServicio)
        : [...prev, idServicio]
    );
  };

  const saveHojaTrabajo = async () => {
    if (!servicioACompletar) return;
    if (!diagnosticoForm.trim()) {
      setErrorMessage("Escribe el diagnostico inicial antes de guardar.");
      return;
    }

    setSavingHoja(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      await axios.put(
        `${API_BASE_URL}/tecnico/servicios/${servicioACompletar.id_reporte}/hoja-trabajo`,
        {
          diagnostico_inicial: diagnosticoForm,
          servicios_seleccionados: serviciosSeleccionados,
        },
        { headers: headers() }
      );
      setStatusMessage("Hoja de trabajo guardada correctamente.");
      await loadServicios();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudo guardar la hoja de trabajo."));
    } finally {
      setSavingHoja(false);
    }
  };

  const submitCompletarTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!servicioACompletar) return;

    setCompletingTicket(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      await axios.put(
        `${API_BASE_URL}/tecnico/servicios/${servicioACompletar.id_reporte}/completar`,
        {
          diagnostico_inicial: diagnosticoForm,
          servicios_seleccionados: serviciosSeleccionados,
          descripcion_solucion: solucionForm,
        },
        { headers: headers() }
      );
      setStatusMessage(`Ticket ${servicioACompletar.id_reporte} completado correctamente.`);
      closeCompletarModal();
      await loadServicios();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudo completar el ticket."));
    } finally {
      setCompletingTicket(false);
    }
  };

  const openDetalleCiModal = async (item: ServicioTecnico) => {
    setDetalleCi(null);
    setDetalleCiLoading(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      const response = await axios.get<CiDetalle>(`${API_BASE_URL}/ci/${item.id_ci}/detalle`, {
        headers: headers(),
      });
      setDetalleCi(response.data);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudo cargar el detalle del equipo."));
    } finally {
      setDetalleCiLoading(false);
    }
  };

  const closeDetalleCiModal = () => {
    setDetalleCi(null);
    setDetalleCiLoading(false);
  };

  const renderServicioCard = (item: ServicioTecnico) => (
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
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${ticketEstadoBadgeClasses(item.estado)}`}
          >
            {item.estado}
          </span>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-amber-700">Prioridad: {item.prioridad}</p>
        </div>
      </div>
      <p className="mt-4 whitespace-pre-line text-sm text-slate-700">{item.descripcion_falla}</p>
      {item.descripcion_solucion ? (
        <p className="mt-2 whitespace-pre-line rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <strong>Solucion:</strong> {item.descripcion_solucion}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Asignado desde: {formatDate(item.fecha_asignacion || item.fecha_reporte)}
          {item.fecha_terminado || item.fecha_cierre
            ? ` | Terminado: ${formatDate(item.fecha_terminado || item.fecha_cierre || "")}`
            : ""}
        </p>
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={() => void openDetalleCiModal(item)}
            className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
          >
            Detalle del Equipo
          </button>
          <button
            type="button"
            onClick={() => void openHistorialModal(item)}
            className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
          >
            <ClipboardList className="h-4 w-4" />
            Historial y Cambio
          </button>
          <button
            type="button"
            onClick={() => void openCompletarModal(item)}
            disabled={estadosFinales.includes(item.estado)}
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
              estadosFinales.includes(item.estado)
                ? "cursor-not-allowed bg-slate-100 text-slate-400"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            Hoja de Trabajo
          </button>
        </div>
      </div>
    </article>
  );

  return (
    <section className="mt-10 rounded-[24px] bg-white p-8 text-slate-900 shadow-2xl md:p-10 xl:p-12">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[#001f3f]">Mis Servicios</h2>
        <p className="mt-1 text-sm text-slate-600">Reparaciones y reportes asignados a tu usuario tecnico.</p>
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
          Cargando servicios...
        </div>
      ) : null}

      {!loading && !servicios.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No tienes servicios asignados por ahora.
        </div>
      ) : null}

      <div className="space-y-8">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold text-[#001f3f]">Pendientes</h3>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              {serviciosPendientes.length}
            </span>
          </div>
          {!loading && !serviciosPendientes.length ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No hay tickets pendientes.
            </div>
          ) : null}
          <div className="grid gap-4">{serviciosPendientes.map(renderServicioCard)}</div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold text-[#001f3f]">Cerrados</h3>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
              {serviciosCerrados.length}
            </span>
          </div>
          {!loading && !serviciosCerrados.length ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No hay tickets cerrados.
            </div>
          ) : null}
          <div className="grid gap-4">{serviciosCerrados.map(renderServicioCard)}</div>
        </section>
      </div>

      {selectedServicio ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/55 p-4">
          <div className="modal-content-wrapper">
            <div className="mb-0 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  Historial y Cambio - {selectedServicio.id_ci}
                </h3>
                <p className="text-sm text-slate-600">
                  {selectedServicio.nombre_equipo || "Sin nombre"} |{" "}
                  {selectedServicio.nombre_edificio} / {selectedServicio.nombre_sublocalizacion}
                </p>
              </div>
              <button
                type="button"
                onClick={closeHistorialModal}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cerrar
              </button>
            </div>

            <div className="modal-grid-responsive">
              <section className="modal-history-section">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-base font-semibold text-slate-900">Historial de Cambios</h4>
                  {historialLoading ? <span className="text-xs text-slate-500">Cargando...</span> : null}
                </div>

                {!historialCambios.length && !historialLoading ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    Este CI aun no tiene cambios registrados.
                  </div>
                ) : null}

                {historialCambios.length ? (
                  <div className="max-h-[360px] overflow-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Fecha</th>
                          <th className="px-3 py-2">Transaccion</th>
                          <th className="px-3 py-2">Tecnico</th>
                          <th className="px-3 py-2">Detalle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {historialCambios.map((cambio) => (
                          <tr key={cambio.id_historial}>
                            <td className="px-3 py-2 align-top">{formatDate(cambio.fecha_cambio)}</td>
                            <td className="px-3 py-2 align-top">
                              <div className="font-medium text-slate-800">{cambio.numero_transaccion || "Sin numero"}</div>
                              <div className="text-xs text-slate-500">{cambio.origen_transaccion || "Sin origen"}</div>
                            </td>
                            <td className="px-3 py-2 align-top">{cambio.tecnico}</td>
                            <td className="px-3 py-2 align-top">{cambio.detalle_cambio}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>

              <section className="modal-form-section">
                <h4 className="text-base font-semibold text-slate-900">Registrar Nuevo Cambio</h4>
                <form className="mt-4 space-y-4" onSubmit={submitHistorialCambio}>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-700">Fecha del Cambio</span>
                    <input
                      type="datetime-local"
                      value={historyForm.fecha_cambio}
                      onChange={(e) => setHistoryForm((prev) => ({ ...prev, fecha_cambio: e.target.value }))}
                      className={inputClass()}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-700">Origen (Automatico)</span>
                    <input
                      value={
                        selectedServicio?.tipo_mantenimiento?.toLowerCase() === "preventivo"
                          ? "Preventivo"
                          : "Correctivo"
                      }
                      className={inputClass(true)}
                      readOnly
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-700">Numero de Transaccion (Automatico)</span>
                    <input
                      value={
                        selectedServicio
                          ? `${
                              selectedServicio.tipo_mantenimiento?.toLowerCase() === "preventivo"
                                ? "PRE"
                                : "COR"
                            }-${selectedServicio.id_reporte}`
                          : ""
                      }
                      className={inputClass(true)}
                      readOnly
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-700">Tecnico (Automatico)</span>
                    <input
                      value={tecnicoId}
                      className={inputClass(true)}
                      readOnly
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-700">Detalle del Cambio</span>
                    <textarea
                      value={historyForm.detalle_cambio}
                      onChange={(e) => setHistoryForm((prev) => ({ ...prev, detalle_cambio: e.target.value }))}
                      rows={4}
                      className={`${inputClass()} min-h-[120px]`}
                      placeholder="Ej. Cambio de disco duro SSD 512GB por falla."
                      required
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={historialSubmitting}
                    className="w-full rounded-xl bg-[#001f3f] px-6 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-70"
                  >
                    {historialSubmitting ? "Guardando..." : "Registrar Cambio"}
                  </button>
                </form>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {servicioACompletar ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-bold text-slate-900">
                    Hoja de Trabajo {servicioACompletar.id_reporte}
                  </h3>
                  <span
                    className={`inline-flex rounded-full px-3 py-0.5 text-xs font-semibold ${ticketEstadoBadgeClasses(servicioACompletar.estado)}`}
                  >
                    {servicioACompletar.estado}
                  </span>
                </div>
                <p className="text-sm text-slate-600">
                  {servicioACompletar.nombre_equipo || servicioACompletar.id_ci}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCompletarModal}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cerrar
              </button>
            </div>

            {hojaLoading ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                Cargando hoja de trabajo...
              </div>
            ) : null}

            {!hojaLoading ? (
              <form className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]" onSubmit={submitCompletarTicket}>
                <section className="space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">Falla reportada</p>
                    <p className="mt-2 whitespace-pre-line text-sm text-slate-700">
                      {servicioACompletar.descripcion_falla}
                    </p>
                    <p className="mt-3 text-xs text-slate-500">
                      Asignado: {formatDate(servicioACompletar.fecha_asignacion || servicioACompletar.fecha_reporte)}
                    </p>
                  </div>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-700">
                      Diagnostico inicial
                    </span>
                    <textarea
                      value={diagnosticoForm}
                      onChange={(e) => setDiagnosticoForm(e.target.value)}
                      rows={5}
                      className={`${inputClass()} min-h-[130px]`}
                      placeholder="Describe la causa probable y el estado encontrado."
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-700">
                      Solucion aplicada
                    </span>
                    <textarea
                      value={solucionForm}
                      onChange={(e) => setSolucionForm(e.target.value)}
                      rows={5}
                      className={`${inputClass()} min-h-[130px]`}
                      placeholder="Describe como resolviste el problema y que acciones realizaste."
                      required
                    />
                  </label>
                </section>

                <section className="space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h4 className="text-base font-bold text-slate-900">Catalogo de Servicios</h4>
                        <p className="text-sm text-slate-600">
                          Selecciona las acciones realizadas para sumar el tiempo estimado.
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                        {totalMinutosSeleccionados} min
                      </span>
                    </div>

                    <input
                      value={servicioSearch}
                      onChange={(e) => setServicioSearch(e.target.value)}
                      className="mt-4 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-900"
                      placeholder="Buscar por nombre, descripcion o prioridad"
                    />

                    <div className="mt-4 max-h-[320px] space-y-2 overflow-y-auto pr-1">
                      {!serviciosFiltrados.length ? (
                        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                          No hay servicios para esta busqueda.
                        </div>
                      ) : null}

                      {serviciosFiltrados.map((servicio) => (
                        <label
                          key={servicio.id_servicio}
                          className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm hover:bg-slate-100"
                        >
                          <input
                            type="checkbox"
                            checked={selectedSet.has(servicio.id_servicio)}
                            onChange={() => toggleServicioSeleccionado(servicio.id_servicio)}
                            className="mt-1 h-4 w-4"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-slate-900">{servicio.nombre}</span>
                            <span className="block text-xs text-slate-600">
                              {servicio.descripcion || "Sin descripcion"}
                            </span>
                            <span className="mt-1 block text-xs font-semibold text-amber-700">
                              {servicio.prioridad} | {servicio.tiempo_servicio ?? 0} min
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={savingHoja || !diagnosticoForm.trim()}
                      onClick={() => void saveHojaTrabajo()}
                      className="rounded-lg border border-blue-900 px-6 py-3 text-sm font-bold text-blue-900 hover:bg-blue-50 disabled:opacity-60"
                    >
                      {savingHoja ? "Guardando..." : "Guardar Avance"}
                    </button>
                    <button
                      type="submit"
                      disabled={
                        completingTicket ||
                        !diagnosticoForm.trim() ||
                        !solucionForm.trim() ||
                        serviciosSeleccionados.length === 0
                      }
                      className="rounded-lg bg-emerald-700 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
                    >
                      {completingTicket ? "Terminando..." : "Marcar Terminado"}
                    </button>
                  </div>
                </section>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}

      {detalleCiLoading || detalleCi ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Detalle del Equipo</h3>
                <p className="text-sm text-slate-600">
                  {detalleCi?.id_ci || "Cargando..."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetalleCiModal}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cerrar
              </button>
            </div>

            {detalleCiLoading ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                Cargando detalle del equipo...
              </div>
            ) : null}

            {detalleCi ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">ID CI</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{detalleCi.id_ci}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Tipo de CI</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{detalleCi.nombre_tipo}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Equipo</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{detalleCi.nombre_equipo || "Sin nombre"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Numero de Serie</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{detalleCi.numero_serie}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Modelo</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{detalleCi.modelo || "Sin modelo"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Marca</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{detalleCi.nombre_marca}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Ubicacion</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {detalleCi.nombre_edificio} / {detalleCi.nombre_sublocalizacion}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Responsable</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{detalleCi.usuario_responsable || "No asignado"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Estado</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{detalleCi.estado}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Fecha de Ingreso</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{formatDate(detalleCi.fecha_ingreso)}</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
