import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import { getToken } from "../../auth/storage";
import { ticketEstadoBadgeClasses } from "../../utils/ticketEstadoBadge";

const API_BASE_URL = "http://localhost:4000/api";

type SolicitudInvestigacion = {
  id_solicitud: string;
  titulo: string;
  descripcion_problematica: string;
  id_tipo_ci: string;
  nombre_tipo: string;
  administrador: string;
  fecha_creacion: string;
  estado: string;
};
type Incidencia = {
  id_mantenimiento: string;
  id_ci: string;
  fecha_mantenimiento: string;
  descripcion_tarea: string | null;
  diagnostico_inicial: string | null;
  descripcion_solucion: string | null;
  estado: string;
  nombre_equipo: string | null;
  numero_serie: string | null;
};

const headers = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-900 focus:ring-2 focus:ring-blue-900/20";

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const problemStatusBadgeClasses = (estado: string) => {
  const normalized = estado.trim().toLowerCase();
  if (normalized === "en investigacion") return ticketEstadoBadgeClasses("Pendiente");
  if (normalized === "resuelto") return ticketEstadoBadgeClasses("Liberado");
  return ticketEstadoBadgeClasses(estado);
};

export default function TecnicoInvestigaciones() {
  const [solicitudes, setSolicitudes] = useState<SolicitudInvestigacion[]>([]);
  const [selected, setSelected] = useState<SolicitudInvestigacion | null>(null);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState({ error_conocido: "", causa_raiz: "", solucion: "" });

  const loadSolicitudes = async () => {
    setLoading(true);
    try {
      const response = await axios.get<SolicitudInvestigacion[]>(
        `${API_BASE_URL}/problemas/solicitudes?asignadas=1`,
        { headers: headers() }
      );
      setSolicitudes(response.data || []);
      setErrorMessage("");
    } catch {
      setErrorMessage("No se pudieron cargar tus investigaciones.");
    } finally {
      setLoading(false);
    }
  };

  const selectSolicitud = async (solicitud: SolicitudInvestigacion) => {
    setSelected(solicitud);
    setIncidencias([]);
    setForm({ error_conocido: "", causa_raiz: "", solucion: "" });
    try {
      const response = await axios.get<Incidencia[]>(
        `${API_BASE_URL}/problemas/solicitudes/${solicitud.id_solicitud}/incidencias`,
        { headers: headers() }
      );
      setIncidencias(response.data || []);
    } catch {
      setIncidencias([]);
    }
  };

  useEffect(() => {
    void loadSolicitudes();
  }, []);

  const submitConocimiento = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      await axios.post(
        `${API_BASE_URL}/problemas/conocimiento`,
        { id_solicitud: selected.id_solicitud, ...form },
        { headers: headers() }
      );
      setStatusMessage(`Solicitud ${selected.id_solicitud} resuelta y registrada en KEDB.`);
      setSelected(null);
      setForm({ error_conocido: "", causa_raiz: "", solucion: "" });
      await loadSolicitudes();
    } catch {
      setErrorMessage("No se pudo registrar la base de conocimiento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-10 rounded-[24px] bg-white p-8 text-slate-900 shadow-2xl md:p-10 xl:p-12">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[#001f3f]">Investigaciones de Problemas</h2>
        <p className="mt-1 text-sm text-slate-600">Documenta causa raiz y solucion definitiva en la KEDB.</p>
      </div>

      {statusMessage ? <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{statusMessage}</div> : null}
      {errorMessage ? <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}
      {loading ? <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm">Cargando...</div> : null}

      {!loading ? (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]" style={{ boxSizing: "border-box" }}>
          <aside className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-bold uppercase text-slate-600">Asignadas</h3>
            <div className="mt-3 space-y-2">
              {!solicitudes.length ? <p className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">Sin investigaciones asignadas.</p> : null}
              {solicitudes.map((solicitud) => (
                <button
                  key={solicitud.id_solicitud}
                  type="button"
                  onClick={() => void selectSolicitud(solicitud)}
                  className={`w-full rounded-lg border p-3 text-left text-sm ${
                    selected?.id_solicitud === solicitud.id_solicitud
                      ? "border-blue-900 bg-white text-blue-950"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="block font-semibold">{solicitud.id_solicitud}</span>
                  <span className="block">{solicitud.titulo}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500">{solicitud.nombre_tipo}</span>
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${problemStatusBadgeClasses(
                        solicitud.estado
                      )}`}
                    >
                      {solicitud.estado}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <div className="min-w-0">
            {!selected ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-16 text-center text-sm text-slate-500">
                Selecciona una investigacion para trabajarla.
              </div>
            ) : (
              <div className="grid gap-6 xl:grid-cols-2">
                <section className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                  <h3 className="text-lg font-bold text-slate-900">{selected.titulo}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {selected.id_solicitud} · {selected.nombre_tipo} · {formatDate(selected.fecha_creacion)}
                  </p>
                  <span
                    className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${problemStatusBadgeClasses(
                      selected.estado
                    )}`}
                  >
                    {selected.estado}
                  </span>
                  <p className="mt-4 whitespace-pre-line text-sm text-slate-700">{selected.descripcion_problematica}</p>

                  <h4 className="mt-6 text-sm font-bold uppercase text-slate-600">Incidencias relacionadas</h4>
                  <div className="mt-3 max-h-[360px] space-y-3 overflow-y-auto pr-1">
                    {!incidencias.length ? <p className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">Sin incidencias vinculadas.</p> : null}
                    {incidencias.map((incidencia) => (
                      <article key={incidencia.id_mantenimiento} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">{incidencia.id_mantenimiento} · {incidencia.id_ci}</span>
                          <span className="text-xs text-slate-500">{formatDate(incidencia.fecha_mantenimiento)}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-line text-slate-700">{incidencia.descripcion_tarea || "Sin descripcion"}</p>
                        {incidencia.diagnostico_inicial ? <p className="mt-2 text-xs text-slate-500">Diagnostico: {incidencia.diagnostico_inicial}</p> : null}
                      </article>
                    ))}
                  </div>
                </section>

                <form className="rounded-lg border border-slate-200 bg-white p-5" onSubmit={submitConocimiento}>
                  <h3 className="text-lg font-bold text-slate-900">Base de Conocimiento</h3>
                  <label className="mt-4 block">
                    <span className="mb-2 block text-xs font-semibold uppercase text-slate-600">Error conocido</span>
                    <input
                      value={form.error_conocido}
                      onChange={(e) => setForm((prev) => ({ ...prev, error_conocido: e.target.value }))}
                      maxLength={255}
                      className={inputClass}
                      required
                    />
                  </label>
                  <label className="mt-4 block">
                    <span className="mb-2 block text-xs font-semibold uppercase text-slate-600">Causa raiz</span>
                    <textarea
                      value={form.causa_raiz}
                      onChange={(e) => setForm((prev) => ({ ...prev, causa_raiz: e.target.value }))}
                      rows={6}
                      className={`${inputClass} min-h-[150px]`}
                      required
                    />
                  </label>
                  <label className="mt-4 block">
                    <span className="mb-2 block text-xs font-semibold uppercase text-slate-600">Solucion definitiva</span>
                    <textarea
                      value={form.solucion}
                      onChange={(e) => setForm((prev) => ({ ...prev, solucion: e.target.value }))}
                      rows={7}
                      className={`${inputClass} min-h-[170px]`}
                      required
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={saving || selected.estado === "Resuelto"}
                    className="mt-5 w-full rounded-lg bg-[#001f3f] px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60"
                  >
                    {saving ? "Guardando..." : "Registrar conocimiento y resolver"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
