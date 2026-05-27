import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import { ClipboardList } from "lucide-react";
import { getToken } from "../../auth/storage";
import { ticketEstadoBadgeClasses } from "../../utils/ticketEstadoBadge";

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
  numero_rfc?: string | null;
  numero_transaccion: string | null;
  origen_transaccion: string | null;
  tecnico: string;
  detalle_cambio: string;
  componentes_cambio?: string;
  fecha_registro: string;
};

type ComponenteInventario = {
  id_componente: string;
  nombre: string;
  cantidad_stock: number;
  precio_unitario: number | string;
  unidad: string | null;
  id_ci?: string | null;
};

type ComponenteAsignadoCI = {
  id_componente: string;
  nombre: string;
  descripcion?: string | null;
  id_ci?: string | null;
};

type SolicitudCambioRow = {
  id_solicitud: string;
  numero_rfc: string;
  estado: string;
  monto_total: number | string;
  requiere_institucion: boolean | number;
  fecha_solicitud: string;
  detalle_cambio: string;
};

type ConocimientoKedb = {
  id_conocimiento: number;
  id_solicitud: string;
  id_tipo_ci: string;
  nombre_tipo: string;
  error_conocido: string;
  causa_raiz: string;
  solucion: string;
  fecha_registro: string;
};

type LineaSolicitud = {
  id_componente_ci: string;
  id_componente_inventario: string;
  cantidad: number;
};

const MONTO_LIMITE_INSTITUCION = 1000;

interface ServicioCatalogo {
  id_servicio: string;
  nombre: string;
  descripcion: string | null;
  tiempo_servicio: number | null;
  tiempo_estimado_minutos?: number | null;
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
  detalle_cambio: "",
};

const initialLinea = (): LineaSolicitud => ({
  id_componente_ci: "",
  id_componente_inventario: "",
  cantidad: 1,
});

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

const splitCambioComponentes = (value?: string) => {
  const text = value?.trim();
  if (!text) return { componente: "—", reemplazo: "—" };
  const pares = text.split(/\s*,\s*/).filter(Boolean);
  const componentes: string[] = [];
  const reemplazos: string[] = [];

  for (const par of pares) {
    const [origen, nuevo] = par.split(/\s*->\s*/);
    componentes.push(origen?.trim() || "—");
    reemplazos.push(nuevo?.trim() || "—");
  }

  return {
    componente: componentes.join(", "),
    reemplazo: reemplazos.join(", "),
  };
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
  const [componentesAsignadosCi, setComponentesAsignadosCi] = useState<ComponenteAsignadoCI[]>([]);
  const [componentesInventario, setComponentesInventario] = useState<ComponenteInventario[]>([]);
  const [lineasSolicitud, setLineasSolicitud] = useState<LineaSolicitud[]>([initialLinea()]);
  const [solicitudesCambio, setSolicitudesCambio] = useState<SolicitudCambioRow[]>([]);
  const [tecnicoId, setTecnicoId] = useState("");
  const [servicioACompletar, setServicioACompletar] = useState<ServicioTecnico | null>(null);
  const [hojaTrabajo, setHojaTrabajo] = useState<HojaTrabajoResponse | null>(null);
  const [catalogoServicios, setCatalogoServicios] = useState<ServicioCatalogo[]>([]);
  const [hojaLoading, setHojaLoading] = useState(false);
  const [servicioSearch, setServicioSearch] = useState("");
  const [diagnosticoForm, setDiagnosticoForm] = useState("");
  const [serviciosSeleccionados, setServiciosSeleccionados] = useState<string[]>([]);
  const [solucionForm, setSolucionForm] = useState("");
  const [savingHoja, setSavingHoja] = useState(false);
  const [completingTicket, setCompletingTicket] = useState(false);
  const [detalleCi, setDetalleCi] = useState<CiDetalle | null>(null);
  const [detalleCiLoading, setDetalleCiLoading] = useState(false);
  const [sugerenciasKedb, setSugerenciasKedb] = useState<ConocimientoKedb[]>([]);
  const [sugerenciasLoading, setSugerenciasLoading] = useState(false);
  const estadosFinales = ["Terminado", "Cerrado", "Liberado"];
  const serviciosPendientes = servicios.filter((item) => !estadosFinales.includes(item.estado));
  const serviciosCerrados = servicios.filter((item) => estadosFinales.includes(item.estado));
  const selectedSet = new Set(serviciosSeleccionados);
  const catalogoHoja =
    catalogoServicios.length > 0 ? catalogoServicios : hojaTrabajo?.catalogo_servicios || [];
  const serviciosFiltrados =
    catalogoHoja.filter((servicio) => {
      const term = servicioSearch.trim().toLowerCase();
      if (!term) return true;
      return `${servicio.nombre} ${servicio.descripcion || ""} ${servicio.prioridad}`
        .toLowerCase()
        .includes(term);
    }) || [];
  const totalMinutosSeleccionados =
    catalogoHoja.reduce(
      (total, servicio) =>
        selectedSet.has(servicio.id_servicio)
          ? total + (Number(servicio.tiempo_estimado_minutos ?? servicio.tiempo_servicio) || 0)
          : total,
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

  const loadSolicitudes = async (idCi: string) => {
    try {
      const response = await axios.get<SolicitudCambioRow[]>(
        `${API_BASE_URL}/ci/${idCi}/solicitudes-cambio`,
        { headers: headers() }
      );
      setSolicitudesCambio(response.data || []);
    } catch {
      setSolicitudesCambio([]);
    }
  };

  const loadComponentesInventario = async (idCi: string) => {
    try {
      const response = await axios.get<ComponenteInventario[]>(
        `${API_BASE_URL}/inventario/componentes`,
        {
          headers: headers(),
          params: { id_ci: idCi.trim() },
        }
      );
      setComponentesInventario(response.data || []);
    } catch {
      setComponentesInventario([]);
    }
  };

  const loadComponentesAsignadosCi = async (idCi: string) => {
    try {
      const response = await axios.get<ComponenteAsignadoCI[]>(
        `${API_BASE_URL}/ci/${idCi.trim()}/componentes-inventario`,
        {
          headers: headers(),
        }
      );
      setComponentesAsignadosCi(response.data || []);
    } catch {
      setComponentesAsignadosCi([]);
    }
  };

  const componenteOptionLabel = (c: ComponenteInventario) => {
    const base = `${c.nombre} (stock: ${c.cantidad_stock}) — $${Number(c.precio_unitario).toFixed(2)}`;
    if (c.id_ci?.trim()) return `${base} · asignado a este CI`;
    return `${base} · general`;
  };

  const openHistorialModal = async (item: ServicioTecnico) => {
    setSelectedServicio(item);
    setHistoryForm(initialHistoryForm);
    setLineasSolicitud([initialLinea()]);
    setHistorialCambios([]);
    setComponentesAsignadosCi([]);
    setSolicitudesCambio([]);
    setStatusMessage("");
    setErrorMessage("");
    await Promise.all([
      loadHistorial(item.id_ci),
      loadSolicitudes(item.id_ci),
      loadComponentesAsignadosCi(item.id_ci),
      loadComponentesInventario(item.id_ci),
    ]);
  };

  const closeHistorialModal = () => {
    setSelectedServicio(null);
    setHistorialCambios([]);
    setComponentesAsignadosCi([]);
    setSolicitudesCambio([]);
    setHistoryForm(initialHistoryForm);
    setLineasSolicitud([initialLinea()]);
  };

  const montoEstimadoSolicitud = lineasSolicitud.reduce((sum, linea) => {
    const comp = componentesInventario.find(
      (c) => c.id_componente === linea.id_componente_inventario
    );
    if (!comp || !linea.cantidad) return sum;
    return sum + Number(comp.precio_unitario) * linea.cantidad;
  }, 0);

  const requiereInstitucionEstimado = lineasSolicitud.some((linea) => {
    const comp = componentesInventario.find(
      (c) => c.id_componente === linea.id_componente_inventario
    );
    return comp && Number(comp.precio_unitario) >= MONTO_LIMITE_INSTITUCION;
  });

  const submitSolicitudCambio = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedServicio) return;

    const lineas = lineasSolicitud.filter(
      (l) => l.id_componente_ci && l.id_componente_inventario && l.cantidad > 0
    );
    if (!lineas.length) {
      setErrorMessage("Seleccione componente actual, reemplazo y cantidad en al menos una linea.");
      return;
    }

    setHistorialSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      const res = await axios.post<{
        message: string;
        numero_rfc: string;
        estado: string;
      }>(
        `${API_BASE_URL}/ci/${selectedServicio.id_ci}/solicitudes-cambio`,
        {
          id_mantenimiento: selectedServicio.id_reporte,
          detalle_cambio: historyForm.detalle_cambio,
          lineas: lineas.map((l) => ({
            id_componente_origen: l.id_componente_ci,
            id_componente: l.id_componente_inventario,
            cantidad: l.cantidad,
          })),
        },
        { headers: headers() }
      );
      setHistoryForm(initialHistoryForm);
      setLineasSolicitud([initialLinea()]);
      setStatusMessage(
        `Solicitud enviada. RFC: ${res.data.numero_rfc || ""} (${res.data.estado || "Pendiente"}).`
      );
      await Promise.all([loadHistorial(selectedServicio.id_ci), loadSolicitudes(selectedServicio.id_ci)]);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudo enviar la solicitud de cambio."));
    } finally {
      setHistorialSubmitting(false);
    }
  };

  const openCompletarModal = async (item: ServicioTecnico) => {
    setServicioACompletar(item);
    setHojaTrabajo(null);
    setCatalogoServicios([]);
    setServicioSearch("");
    setDiagnosticoForm(item.diagnostico_inicial || "");
    setServiciosSeleccionados([]);
    setSolucionForm(item.descripcion_solucion || "");
    setSugerenciasKedb([]);
    setStatusMessage("");
    setErrorMessage("");
    setHojaLoading(true);
    setSugerenciasLoading(true);
    try {
      const [hojaResponse, catalogoResponse, ciResponse] = await Promise.all([
        axios.get<HojaTrabajoResponse>(
          `${API_BASE_URL}/tecnico/servicios/${item.id_reporte}/hoja-trabajo`,
          { headers: headers() }
        ),
        axios.get<ServicioCatalogo[]>(`${API_BASE_URL}/servicios`, { headers: headers() }),
        axios.get<CiDetalle>(`${API_BASE_URL}/ci/${item.id_ci}/detalle`, { headers: headers() }),
      ]);
      setHojaTrabajo(hojaResponse.data);
      setCatalogoServicios(catalogoResponse.data || hojaResponse.data.catalogo_servicios || []);
      setDiagnosticoForm(hojaResponse.data.ticket.diagnostico_inicial || "");
      setSolucionForm(hojaResponse.data.ticket.descripcion_solucion || "");
      setServiciosSeleccionados(
        (hojaResponse.data.servicios_seleccionados || []).map((servicio) => servicio.id_servicio)
      );
      try {
        const comparacion = await axios.post<ConocimientoKedb[]>(
          `${API_BASE_URL}/incidentes/comparar`,
          { id_tipo_ci: ciResponse.data.id_tipo_ci },
          { headers: headers() }
        );
        setSugerenciasKedb(comparacion.data || []);
      } catch {
        setSugerenciasKedb([]);
      }
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudo cargar la hoja de trabajo."));
    } finally {
      setHojaLoading(false);
      setSugerenciasLoading(false);
    }
  };

  const closeCompletarModal = () => {
    setServicioACompletar(null);
    setHojaTrabajo(null);
    setCatalogoServicios([]);
    setServicioSearch("");
    setDiagnosticoForm("");
    setServiciosSeleccionados([]);
    setSolucionForm("");
    setSugerenciasKedb([]);
    setSugerenciasLoading(false);
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

                {solicitudesCambio.length ? (
                  <div className="mb-4">
                    <h5 className="text-sm font-semibold text-slate-800">Solicitudes enviadas</h5>
                    <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-xs text-slate-600">
                      {solicitudesCambio.map((s) => (
                        <li key={s.id_solicitud} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                          <span className="font-semibold text-[#001f3f]">{s.numero_rfc}</span> · {s.estado} · $
                          {Number(s.monto_total).toFixed(2)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {!historialCambios.length && !historialLoading ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    Este CI aun no tiene cambios aprobados en historial.
                  </div>
                ) : null}

                {historialCambios.length ? (
                  <div className="max-h-[360px] overflow-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Fecha</th>
                          <th className="px-3 py-2">RFC</th>
                          <th className="px-3 py-2">Componente</th>
                          <th className="px-3 py-2">Reemplazo</th>
                          <th className="px-3 py-2">Detalle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {historialCambios.map((cambio) => {
                          const compCambio = splitCambioComponentes(cambio.componentes_cambio);
                          return (
                          <tr key={cambio.id_historial}>
                            <td className="px-3 py-2 align-top">{formatDate(cambio.fecha_cambio)}</td>
                            <td className="px-3 py-2 align-top font-medium text-slate-800">
                              {cambio.numero_rfc || cambio.numero_transaccion || "—"}
                            </td>
                            <td className="px-3 py-2 align-top whitespace-normal">
                              {compCambio.componente}
                            </td>
                            <td className="px-3 py-2 align-top whitespace-normal">
                              {compCambio.reemplazo}
                            </td>
                            <td className="px-3 py-2 align-top">{cambio.detalle_cambio}</td>
                          </tr>
                        )})}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>

              <section className="modal-form-section">
                <h4 className="text-base font-semibold text-slate-900">Solicitar cambio de componentes</h4>
                <p className="mt-1 text-xs text-slate-500">
                  Ticket {selectedServicio.id_reporte} · Tecnico {tecnicoId}
                </p>
                <form className="mt-4 space-y-4" onSubmit={submitSolicitudCambio}>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-700">
                      Detalle del cambio
                    </span>
                    <textarea
                      value={historyForm.detalle_cambio}
                      onChange={(e) => setHistoryForm((prev) => ({ ...prev, detalle_cambio: e.target.value }))}
                      rows={3}
                      className={`${inputClass()} min-h-[90px]`}
                      placeholder="Ej. Cambio de disco duro SSD 512GB por falla."
                      required
                    />
                  </label>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                        Componentes a reemplazar
                      </span>
                      <button
                        type="button"
                        className="text-xs font-semibold text-blue-800 hover:underline"
                        onClick={() => setLineasSolicitud((prev) => [...prev, initialLinea()])}
                      >
                        + Agregar linea
                      </button>
                    </div>
                    <div className="space-y-2">
                      {!componentesAsignadosCi.length ? (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          Este CI no tiene componentes asignados actualmente.
                        </p>
                      ) : null}
                      {lineasSolicitud.map((linea, idx) => (
                        <div key={idx} className="grid grid-cols-[1fr_1fr_80px_32px] gap-2">
                          <select
                            className={inputClass()}
                            value={linea.id_componente_ci}
                            onChange={(e) =>
                              setLineasSolicitud((prev) =>
                                prev.map((l, i) =>
                                  i === idx
                                    ? {
                                        ...l,
                                        id_componente_ci: e.target.value,
                                        id_componente_inventario: "",
                                      }
                                    : l
                                )
                              )
                            }
                            required
                          >
                            <option value="">Componente actual del CI</option>
                            {componentesAsignadosCi.map((c) => (
                              <option key={c.id_componente} value={c.id_componente}>
                                {c.nombre}
                              </option>
                            ))}
                          </select>
                          <select
                            className={inputClass(!linea.id_componente_ci)}
                            value={linea.id_componente_inventario}
                            onChange={(e) =>
                              setLineasSolicitud((prev) =>
                                prev.map((l, i) =>
                                  i === idx ? { ...l, id_componente_inventario: e.target.value } : l
                                )
                              )
                            }
                            disabled={!linea.id_componente_ci}
                            required
                          >
                            <option value="">Repuesto disponible en inventario</option>
                            {componentesInventario.map((c) => (
                              <option key={c.id_componente} value={c.id_componente}>
                                {componenteOptionLabel(c)}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={1}
                            className={inputClass()}
                            value={linea.cantidad}
                            onChange={(e) =>
                              setLineasSolicitud((prev) =>
                                prev.map((l, i) =>
                                  i === idx
                                    ? {
                                        ...l,
                                        cantidad: Math.max(1, Number.parseInt(e.target.value, 10) || 1),
                                      }
                                    : l
                                )
                              )
                            }
                          />
                          <button
                            type="button"
                            className="rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100"
                            onClick={() =>
                              setLineasSolicitud((prev) =>
                                prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="text-sm font-semibold text-slate-700">
                    Monto estimado: ${montoEstimadoSolicitud.toFixed(2)} MXN
                  </p>
                  {requiereInstitucionEstimado ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Incluye componente(s) de $1,000 o mas: requiere autorizacion institucional antes de que el
                      administrador apruebe.
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={historialSubmitting}
                    className="w-full rounded-xl bg-[#001f3f] px-6 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-70"
                  >
                    {historialSubmitting ? "Enviando..." : "Enviar solicitud (RFC)"}
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
              <form className="grid gap-5 lg:grid-cols-2" onSubmit={submitCompletarTicket}>
                <section className="lg:col-span-2">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-bold uppercase text-amber-900">
                        Sugerencias de Base de Conocimiento
                      </h4>
                      {sugerenciasLoading ? <span className="text-xs text-amber-800">Consultando...</span> : null}
                    </div>
                    {!sugerenciasKedb.length && !sugerenciasLoading ? (
                      <p className="mt-2 text-sm text-amber-900">
                        No hay soluciones documentadas para este tipo de equipo.
                      </p>
                    ) : null}
                    {sugerenciasKedb.length ? (
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {sugerenciasKedb.map((item) => (
                          <article key={item.id_conocimiento} className="rounded-lg border border-amber-200 bg-white p-3 text-sm">
                            <p className="font-semibold text-slate-900">{item.error_conocido}</p>
                            <p className="mt-2 text-xs font-semibold uppercase text-slate-500">Causa raiz</p>
                            <p className="mt-1 whitespace-pre-line text-slate-700">{item.causa_raiz}</p>
                            <p className="mt-2 text-xs font-semibold uppercase text-slate-500">Solucion documentada</p>
                            <p className="mt-1 whitespace-pre-line text-slate-700">{item.solucion}</p>
                          </article>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </section>
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
                        <h4 className="text-base font-bold text-slate-900">Acciones a Realizar</h4>
                        <p className="text-sm text-slate-600">
                          Selecciona las acciones realizadas para sumar el tiempo estimado.
                        </p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 px-3 py-2 text-right">
                        <span className="block text-[11px] font-semibold uppercase text-emerald-700">
                          Duracion Estimada del Trabajo
                        </span>
                        <span className="block text-sm font-bold text-emerald-800">
                          {totalMinutosSeleccionados} min
                        </span>
                      </div>
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

                      {serviciosFiltrados.map((servicio) => {
                        const tiempoEstimado =
                          servicio.tiempo_estimado_minutos ?? servicio.tiempo_servicio ?? 0;
                        return (
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
                              {servicio.prioridad} | Tiempo estimado: {tiempoEstimado} min
                            </span>
                          </span>
                        </label>
                        );
                      })}
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

