import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import { getToken } from "../../auth/storage";

const API_BASE_URL = "http://localhost:4000/api";

type TipoCI = { id_tipo_ci: string; nombre_tipo: string };
type Tecnico = { id_usuario: string; nombre_completo: string; nombre_area?: string | null };
type CatalogosCI = { tipos_ci: TipoCI[] };
type SolicitudInvestigacion = {
  id_solicitud: string;
  titulo: string;
  descripcion_problematica: string;
  id_tipo_ci: string;
  nombre_tipo: string;
  tecnico_especialista: string;
  fecha_creacion: string;
  estado: string;
};
type Incidencia = {
  id_mantenimiento: string;
  id_ci: string;
  fecha_mantenimiento: string;
  descripcion_tarea: string | null;
  estado: string;
  nombre_equipo: string | null;
  numero_serie: string | null;
  id_solicitud_investigacion: string | null;
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
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

export default function AdminProblemas() {
  const [catalogos, setCatalogos] = useState<CatalogosCI>({ tipos_ci: [] });
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [solicitudes, setSolicitudes] = useState<SolicitudInvestigacion[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [selectedIncidencias, setSelectedIncidencias] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState({
    titulo: "",
    descripcion_problematica: "",
    id_tipo_ci: "",
    id_tecnico_especialista: "",
  });

  const loadBase = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [catalogosRes, tecnicosRes, solicitudesRes] = await Promise.all([
        axios.get<CatalogosCI>(`${API_BASE_URL}/catalogos/ci`, { headers: headers() }),
        axios.get<Tecnico[]>(`${API_BASE_URL}/usuarios/tecnicos`, { headers: headers() }),
        axios.get<SolicitudInvestigacion[]>(`${API_BASE_URL}/problemas/solicitudes`, { headers: headers() }),
      ]);
      setCatalogos(catalogosRes.data);
      setTecnicos(tecnicosRes.data || []);
      setSolicitudes(solicitudesRes.data || []);
    } catch {
      setErrorMessage("No se pudo cargar la gestion de problemas.");
    } finally {
      setLoading(false);
    }
  };

  const loadIncidencias = async (idTipoCi: string) => {
    if (!idTipoCi) {
      setIncidencias([]);
      setSelectedIncidencias([]);
      return;
    }
    try {
      const response = await axios.get<Incidencia[]>(`${API_BASE_URL}/problemas/incidencias`, {
        headers: headers(),
        params: { id_tipo_ci: idTipoCi },
      });
      setIncidencias(response.data || []);
      setSelectedIncidencias([]);
    } catch {
      setIncidencias([]);
    }
  };

  useEffect(() => {
    void loadBase();
  }, []);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const submitSolicitud = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      const response = await axios.post<{ id_solicitud: string }>(
        `${API_BASE_URL}/problemas/solicitud`,
        { ...form, incidencias: selectedIncidencias },
        { headers: headers() }
      );
      setForm({ titulo: "", descripcion_problematica: "", id_tipo_ci: "", id_tecnico_especialista: "" });
      setIncidencias([]);
      setSelectedIncidencias([]);
      setStatusMessage(`Solicitud ${response.data.id_solicitud} creada correctamente.`);
      await loadBase();
    } catch {
      setErrorMessage("No se pudo crear la solicitud de investigacion.");
    } finally {
      setSaving(false);
    }
  };

  const toggleIncidencia = (id: string) => {
    setSelectedIncidencias((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  return (
    <section className="mt-10 rounded-[24px] bg-white p-8 text-slate-900 shadow-2xl md:p-10 xl:p-12">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[#001f3f]">Gestion de Problemas</h2>
        <p className="mt-1 text-sm text-slate-600">
          Crea investigaciones de causa raiz y asigna tecnicos especialistas.
        </p>
      </div>

      {statusMessage ? <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{statusMessage}</div> : null}
      {errorMessage ? <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}
      {loading ? <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm">Cargando...</div> : null}

      {!loading ? (
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]" style={{ boxSizing: "border-box" }}>
          <form className="rounded-lg border border-slate-200 bg-slate-50 p-5" onSubmit={submitSolicitud}>
            <h3 className="text-base font-bold text-slate-900">Nueva solicitud de investigacion</h3>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase text-slate-600">Tipo de equipo</span>
                <select
                  value={form.id_tipo_ci}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, id_tipo_ci: e.target.value }));
                    void loadIncidencias(e.target.value);
                  }}
                  className={inputClass}
                  required
                >
                  <option value="">Seleccione tipo</option>
                  {catalogos.tipos_ci.map((tipo) => (
                    <option key={tipo.id_tipo_ci} value={tipo.id_tipo_ci.trim()}>{tipo.nombre_tipo}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase text-slate-600">Tecnico especialista</span>
                <select
                  value={form.id_tecnico_especialista}
                  onChange={(e) => setForm((prev) => ({ ...prev, id_tecnico_especialista: e.target.value }))}
                  className={inputClass}
                  required
                >
                  <option value="">Seleccione tecnico</option>
                  {tecnicos.map((tecnico) => (
                    <option key={tecnico.id_usuario} value={tecnico.id_usuario.trim()}>
                      {tecnico.nombre_completo}{tecnico.nombre_area ? ` - ${tecnico.nombre_area}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-semibold uppercase text-slate-600">Titulo</span>
              <input
                value={form.titulo}
                onChange={(e) => setForm((prev) => ({ ...prev, titulo: e.target.value }))}
                maxLength={150}
                className={inputClass}
                required
              />
            </label>
            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-semibold uppercase text-slate-600">Problematica</span>
              <textarea
                value={form.descripcion_problematica}
                onChange={(e) => setForm((prev) => ({ ...prev, descripcion_problematica: e.target.value }))}
                rows={7}
                className={`${inputClass} min-h-[180px]`}
                required
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              className="mt-5 w-full rounded-lg bg-[#001f3f] px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-70"
            >
              {saving ? "Creando..." : "Crear investigacion"}
            </button>
          </form>

          <aside className="rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="text-base font-bold text-slate-900">Incidencias relacionadas</h3>
            <div className="mt-4 max-h-[460px] space-y-3 overflow-y-auto pr-1">
              {!incidencias.length ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Selecciona un tipo de equipo para ver incidencias recientes.
                </div>
              ) : null}
              {incidencias.map((incidencia) => (
                <label key={incidencia.id_mantenimiento} className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={selectedIncidencias.includes(incidencia.id_mantenimiento)}
                    onChange={() => toggleIncidencia(incidencia.id_mantenimiento)}
                    disabled={Boolean(incidencia.id_solicitud_investigacion)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-900">{incidencia.id_mantenimiento} · {incidencia.id_ci}</span>
                    <span className="block text-xs text-slate-500">{formatDate(incidencia.fecha_mantenimiento)} · {incidencia.estado}</span>
                    <span className="mt-1 block text-slate-700">{incidencia.descripcion_tarea || "Sin descripcion"}</span>
                    {incidencia.id_solicitud_investigacion ? (
                      <span className="mt-1 block text-xs font-semibold text-amber-700">
                        Asociada a {incidencia.id_solicitud_investigacion}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          </aside>

          <section className="xl:col-span-2">
            <h3 className="mb-3 text-base font-bold text-slate-900">Solicitudes registradas</h3>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Folio</th>
                      <th className="px-3 py-2">Titulo</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Especialista</th>
                      <th className="px-3 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {solicitudes.map((solicitud) => (
                      <tr key={solicitud.id_solicitud}>
                        <td className="px-3 py-2 font-semibold">{solicitud.id_solicitud}</td>
                        <td className="px-3 py-2">{solicitud.titulo}</td>
                        <td className="px-3 py-2">{solicitud.nombre_tipo}</td>
                        <td className="px-3 py-2">{solicitud.tecnico_especialista}</td>
                        <td className="px-3 py-2">{solicitud.estado}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
