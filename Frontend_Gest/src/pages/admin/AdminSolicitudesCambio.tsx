import { useEffect, useState } from "react";
import axios from "axios";
import { AlertTriangle, FileCheck } from "lucide-react";
import { getToken } from "../../auth/storage";

const API_BASE_URL = "http://localhost:4000/api";

const TABS = [
  { id: "", label: "Todas" },
  { id: "Pendiente", label: "Pendientes" },
  { id: "PendienteInstitucion", label: "Pend. institucion" },
  { id: "AutorizadaInstitucion", label: "Institucion OK" },
  { id: "Aprobada", label: "Aprobadas" },
  { id: "Rechazada", label: "Rechazadas" },
] as const;

type SolicitudRow = {
  id_solicitud: string;
  numero_rfc: string;
  id_ci: string;
  id_mantenimiento: string;
  estado: string;
  monto_total: number | string;
  requiere_institucion: boolean | number;
  fecha_solicitud: string;
  fecha_institucion_ok?: string | null;
  nombre_tecnico: string;
  nombre_equipo: string | null;
};

type LineaDetalle = {
  id_detalle: number;
  id_componente: string;
  cantidad: number;
  precio_unitario: number | string;
  nombre_componente: string;
  unidad: string | null;
  componente_id_ci?: string | null;
  componente_ci_nombre?: string | null;
};

type SolicitudDetalle = SolicitudRow & {
  detalle_cambio: string;
  comentario_admin?: string | null;
  lineas: LineaDetalle[];
};

const headers = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
};

const formatMoney = (v: number | string) => `$${Number(v).toFixed(2)} MXN`;

const estadoLabel = (estado: string) => {
  const map: Record<string, string> = {
    Pendiente: "Pendiente",
    PendienteInstitucion: "Pendiente institucion",
    AutorizadaInstitucion: "Institucion autorizada",
    Aprobada: "Aprobada",
    Rechazada: "Rechazada",
  };
  return map[estado] || estado;
};

export default function AdminSolicitudesCambio() {
  const [tab, setTab] = useState("");
  const [lista, setLista] = useState<SolicitudRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<SolicitudDetalle | null>(null);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [comentario, setComentario] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadLista = async (estadoFiltro = tab) => {
    setLoading(true);
    try {
      const url = estadoFiltro
        ? `${API_BASE_URL}/admin/solicitudes-cambio?estado=${encodeURIComponent(estadoFiltro)}`
        : `${API_BASE_URL}/admin/solicitudes-cambio`;
      const res = await axios.get<SolicitudRow[]>(url, { headers: headers() });
      setLista(res.data || []);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudieron cargar las solicitudes."));
    } finally {
      setLoading(false);
    }
  };

  const loadDetalle = async (id: string) => {
    setDetalleLoading(true);
    try {
      const res = await axios.get<SolicitudDetalle>(
        `${API_BASE_URL}/admin/solicitudes-cambio/${id}`,
        { headers: headers() }
      );
      setDetalle(res.data);
      setComentario(res.data.comentario_admin || "");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudo cargar el detalle."));
      setDetalle(null);
    } finally {
      setDetalleLoading(false);
    }
  };

  useEffect(() => {
    void loadLista();
  }, [tab]);

  const selectSolicitud = (id: string) => {
    setSelectedId(id);
    setStatusMessage("");
    void loadDetalle(id);
  };

  const runAction = async (path: string, body?: Record<string, string>) => {
    if (!selectedId) return;
    setActionLoading(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      await axios.post(`${API_BASE_URL}/admin/solicitudes-cambio/${selectedId}/${path}`, body || {}, {
        headers: headers(),
      });
      setStatusMessage("Accion realizada correctamente.");
      await loadLista();
      await loadDetalle(selectedId);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudo completar la accion."));
    } finally {
      setActionLoading(false);
    }
  };

  const puedeInstitucion = detalle?.estado === "PendienteInstitucion";
  const puedeAprobar =
    detalle?.estado === "Pendiente" ||
    (detalle?.estado === "AutorizadaInstitucion" && Boolean(detalle.requiere_institucion));
  const puedeRechazar =
    detalle &&
    ["Pendiente", "PendienteInstitucion", "AutorizadaInstitucion"].includes(detalle.estado);

  return (
    <section className="mt-10 rounded-[24px] bg-white p-8 text-slate-900 shadow-2xl md:p-10">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-[#001f3f]">
          <FileCheck className="h-7 w-7" />
          Solicitudes de cambio (RFC)
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Apruebe o rechace solicitudes de componentes enviadas por tecnicos.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id || "all"}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-2 text-xs font-semibold ${
              tab === t.id ? "bg-[#001f3f] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
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

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200">
          {loading ? (
            <p className="p-4 text-sm text-slate-500">Cargando...</p>
          ) : !lista.length ? (
            <p className="p-4 text-sm text-slate-500">No hay solicitudes en este filtro.</p>
          ) : (
            <ul className="max-h-[520px] divide-y divide-slate-200 overflow-y-auto">
              {lista.map((s) => (
                <li key={s.id_solicitud}>
                  <button
                    type="button"
                    onClick={() => selectSolicitud(s.id_solicitud)}
                    className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${
                      selectedId === s.id_solicitud ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#001f3f]">{s.numero_rfc}</span>
                      <span className="text-xs text-slate-500">{estadoLabel(s.estado)}</span>
                    </div>
                    <p className="text-xs text-slate-600">
                      {s.id_ci} · {s.nombre_tecnico} · {formatMoney(s.monto_total)}
                    </p>
                    {Boolean(s.requiere_institucion) ? (
                      <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                        <AlertTriangle className="h-3 w-3" />
                        Requiere institucion (≥ $1,000)
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          {!selectedId ? (
            <p className="text-sm text-slate-500">Seleccione una solicitud para ver el detalle.</p>
          ) : detalleLoading ? (
            <p className="text-sm text-slate-500">Cargando detalle...</p>
          ) : detalle ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{detalle.numero_rfc}</h3>
                <p className="text-sm text-slate-600">
                  {detalle.nombre_equipo || detalle.id_ci} · Ticket {detalle.id_mantenimiento}
                </p>
                <p className="mt-1 text-sm">
                  <span className="font-semibold">Estado:</span> {estadoLabel(detalle.estado)}
                </p>
                <p className="text-sm">
                  <span className="font-semibold">Tecnico:</span> {detalle.nombre_tecnico}
                </p>
                <p className="text-sm">
                  <span className="font-semibold">Monto total:</span> {formatMoney(detalle.monto_total)}
                </p>
              </div>

              {Boolean(detalle.requiere_institucion) && detalle.estado === "PendienteInstitucion" ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-semibold">Atencion administrador</p>
                  <p className="mt-1">
                    Uno o mas componentes superan $1,000 MXN. Contacte a la institucion correspondiente y
                    marque la autorizacion antes de aprobar.
                  </p>
                </div>
              ) : null}

              <p className="text-sm text-slate-800">
                <span className="font-semibold">Detalle:</span> {detalle.detalle_cambio}
              </p>

              <div>
                <h4 className="text-sm font-semibold text-slate-700">Componentes solicitados</h4>
                <table className="mt-2 w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-1">Componente</th>
                      <th className="py-1">Asignacion</th>
                      <th className="py-1">Cant.</th>
                      <th className="py-1">Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.lineas.map((l) => (
                      <tr key={l.id_detalle} className="border-t border-slate-100">
                        <td className="py-2">{l.nombre_componente}</td>
                        <td className="py-2 text-slate-600">
                          {l.componente_id_ci?.trim()
                            ? l.componente_ci_nombre?.trim() || l.componente_id_ci.trim()
                            : "General"}
                        </td>
                        <td className="py-2">{l.cantidad}</td>
                        <td className="py-2">
                          {formatMoney(l.precio_unitario)}
                          {Number(l.precio_unitario) >= 1000 ? " ⚠" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {puedeRechazar ? (
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-600">
                    Comentario (obligatorio al rechazar)
                  </span>
                  <textarea
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    rows={2}
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                  />
                </label>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {puedeInstitucion ? (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => void runAction("institucion-ok")}
                    className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                  >
                    Institucion autorizo
                  </button>
                ) : null}
                {puedeAprobar ? (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => void runAction("aprobar", { comentario_admin: comentario })}
                    className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                  >
                    Aprobar cambio
                  </button>
                ) : null}
                {puedeRechazar ? (
                  <button
                    type="button"
                    disabled={actionLoading || !comentario.trim()}
                    onClick={() => void runAction("rechazar", { comentario_admin: comentario })}
                    className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                  >
                    Rechazar
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
