import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import { ListChecks, Plus } from "lucide-react";
import { getToken } from "../../auth/storage";

const API_BASE_URL = "http://localhost:4000/api";

const PRIORIDADES = ["Baja", "Media", "Alta", "Critica"] as const;

type ServicioRow = {
  id_servicio: string;
  nombre: string;
  id_area: string;
  descripcion: string | null;
  tiempo_servicio: number | null;
  prioridad: string;
  nombre_area: string;
};

type AreaRow = { id_area: string; nombre_area: string };

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

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-900";

export default function AdminCatalogoServicios() {
  const [loading, setLoading] = useState(true);
  const [servicios, setServicios] = useState<ServicioRow[]>([]);
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nuevaAreaNombre, setNuevaAreaNombre] = useState("");
  const [creatingArea, setCreatingArea] = useState(false);

  const [form, setForm] = useState({
    nombre: "",
    id_area: "",
    descripcion: "",
    tiempo_servicio: "" as string,
    prioridad: "" as string,
  });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [srvRes, arRes] = await Promise.all([
        axios.get<ServicioRow[]>(`${API_BASE_URL}/admin/servicios`, { headers: headers() }),
        axios.get<AreaRow[]>(`${API_BASE_URL}/areas`, { headers: headers() }),
      ]);
      setServicios(srvRes.data || []);
      setAreas(arRes.data || []);
      setErrorMessage("");
    } catch (error) {
      console.error(error);
      setErrorMessage("No se pudo cargar el catalogo de servicios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const openModal = () => {
    setForm({
      nombre: "",
      id_area: areas[0]?.id_area || "",
      descripcion: "",
      tiempo_servicio: "",
      prioridad: "",
    });
    setNuevaAreaNombre("");
    setStatusMessage("");
    setErrorMessage("");
    setModalOpen(true);
  };

  const crearArea = async () => {
    const nombre = nuevaAreaNombre.trim();
    if (!nombre) return;
    setCreatingArea(true);
    try {
      const createdRes = await axios.post<{ id_area?: string }>(
        `${API_BASE_URL}/admin/areas`,
        { nombre_area: nombre },
        { headers: headers() }
      );
      const newId = createdRes.data?.id_area;
      const arRes = await axios.get<AreaRow[]>(`${API_BASE_URL}/areas`, { headers: headers() });
      setAreas(arRes.data || []);
      if (newId) setForm((f) => ({ ...f, id_area: newId }));
      setNuevaAreaNombre("");
      setStatusMessage("Area agregada.");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudo crear el area."));
    } finally {
      setCreatingArea(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const tiempo =
        form.tiempo_servicio.trim() === "" ? null : Number.parseInt(form.tiempo_servicio, 10);
      await axios.post(
        `${API_BASE_URL}/admin/servicios`,
        {
          nombre: form.nombre.trim(),
          id_area: form.id_area,
          descripcion: form.descripcion.trim() || undefined,
          tiempo_servicio: tiempo,
          prioridad: form.prioridad,
        },
        { headers: headers() }
      );
      setStatusMessage("Servicio creado correctamente.");
      setModalOpen(false);
      await loadAll();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudo crear el servicio."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-10 rounded-[24px] bg-white p-8 text-slate-900 shadow-2xl md:p-10 xl:p-12">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#001f3f]">
            <ListChecks className="h-7 w-7" />
            Catalogo de servicios
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Define los tipos de servicio por area. La prioridad aplica a los tickets que usen cada
            servicio.
          </p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center gap-2 rounded-xl bg-[#001f3f] px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800"
        >
          <Plus className="h-4 w-4" />
          Nuevo servicio
        </button>
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
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Servicio</th>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">Prioridad</th>
                <th className="px-4 py-3">Tiempo (min)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {servicios.map((row) => (
                <tr key={row.id_servicio}>
                  <td className="px-4 py-3 font-medium">{row.nombre}</td>
                  <td className="px-4 py-3">{row.nombre_area}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                      {row.prioridad}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.tiempo_servicio != null ? row.tiempo_servicio : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!servicios.length ? (
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No hay servicios registrados. Usa &quot;Nuevo servicio&quot; para agregar el primero.
            </div>
          ) : null}
        </div>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/55 p-4">
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-slate-900">Nuevo servicio</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>

            <form className="space-y-4" onSubmit={onSubmit}>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Nombre del servicio
                <input
                  className={`${inputClass} mt-1`}
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  required
                  maxLength={150}
                />
              </label>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Categoria / Area
                </span>
                <select
                  className={`${inputClass} mt-1`}
                  value={form.id_area}
                  onChange={(e) => setForm((f) => ({ ...f, id_area: e.target.value }))}
                  required
                >
                  <option value="" disabled>
                    Selecciona area
                  </option>
                  {areas.map((a) => (
                    <option key={a.id_area} value={a.id_area}>
                      {a.nombre_area}
                    </option>
                  ))}
                </select>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    className={`${inputClass} min-w-0 flex-1`}
                    placeholder="Nombre de nueva area"
                    value={nuevaAreaNombre}
                    onChange={(e) => setNuevaAreaNombre(e.target.value)}
                    maxLength={100}
                  />
                  <button
                    type="button"
                    disabled={creatingArea || !nuevaAreaNombre.trim()}
                    onClick={() => void crearArea()}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                  >
                    {creatingArea ? "..." : "Agregar area"}
                  </button>
                </div>
              </div>

              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Descripcion
                <textarea
                  className={`${inputClass} mt-1 min-h-[100px]`}
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                />
              </label>

              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Tiempo de servicio (minutos estimados)
                <input
                  type="number"
                  min={0}
                  className={`${inputClass} mt-1`}
                  value={form.tiempo_servicio}
                  onChange={(e) => setForm((f) => ({ ...f, tiempo_servicio: e.target.value }))}
                  placeholder="Opcional"
                />
              </label>

              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Prioridad
                <select
                  className={`${inputClass} mt-1`}
                  value={form.prioridad}
                  onChange={(e) => setForm((f) => ({ ...f, prioridad: e.target.value }))}
                  required
                >
                  <option value="" disabled>
                    Selecciona prioridad
                  </option>
                  {PRIORIDADES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>

              {errorMessage ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-[#001f3f] py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {submitting ? "Guardando..." : "Guardar servicio"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
