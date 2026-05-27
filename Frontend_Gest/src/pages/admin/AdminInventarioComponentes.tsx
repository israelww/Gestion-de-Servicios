import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import { Package, Plus } from "lucide-react";
import { getToken } from "../../auth/storage";

const API_BASE_URL = "http://localhost:4000/api";

type CiOption = {
  id_ci: string;
  nombre_equipo: string | null;
  numero_serie: string;
  nombre_edificio?: string | null;
  nombre_sublocalizacion?: string | null;
  nombre_tipo?: string | null;
};

type Componente = {
  id_componente: string;
  nombre: string;
  numero_serie?: string | null;
  descripcion: string | null;
  cantidad_stock: number;
  precio_unitario: number | string;
  unidad: string | null;
  activo: boolean | number;
  id_ci?: string | null;
  nombre_equipo?: string | null;
  ci_numero_serie?: string | null;
};

type GrupoComponente = {
  nombre: string;
  total_componentes: number;
  en_almacen: number;
  asignados: number;
};

type HistorialComponente = {
  actual: {
    id_componente: string;
    nombre: string;
    numero_serie?: string | null;
    id_ci?: string | null;
    ubicacion_actual: string;
  };
  historial: Array<{
    numero_rfc: string;
    fecha_evento: string;
    id_ci: string;
    tipo_evento: string;
    detalle_cambio?: string | null;
  }>;
};

const headers = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-900";

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
};

const initialForm = {
  nombre: "",
  numero_serie: "",
  descripcion: "",
  precio_unitario: "",
  unidad: "pza",
  activo: true,
  id_ci: "",
};

export default function AdminInventarioComponentes() {
  const [items, setItems] = useState<Componente[]>([]);
  const [grupos, setGrupos] = useState<GrupoComponente[]>([]);
  const [selectedNombre, setSelectedNombre] = useState("");
  const [similares, setSimilares] = useState<Componente[]>([]);
  const [similaresOpen, setSimilaresOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddNombre, setQuickAddNombre] = useState("");
  const [quickAddSerie, setQuickAddSerie] = useState("");
  const [quickAddCi, setQuickAddCi] = useState("");
  const [quickAddBase, setQuickAddBase] = useState<Componente | null>(null);
  const [historialOpen, setHistorialOpen] = useState(false);
  const [historialComp, setHistorialComp] = useState<HistorialComponente | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [cis, setCis] = useState<CiOption[]>([]);

  const cisAgrupados = cis.reduce<Record<string, CiOption[]>>((acc, ci) => {
    const edificio = (ci.nombre_edificio || "Sin edificio").trim();
    const sub = (ci.nombre_sublocalizacion || "Sin aula/laboratorio").trim();
    const tipo = (ci.nombre_tipo || "Sin tipo").trim();
    const key = `${edificio} | ${sub} | ${tipo}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(ci);
    return acc;
  }, {});
  const gruposCiOrdenados = Object.entries(cisAgrupados).sort(([a], [b]) => a.localeCompare(b, "es"));

  const loadCis = async () => {
    try {
      const res = await axios.get<CiOption[]>(`${API_BASE_URL}/ci`, { headers: headers() });
      setCis(res.data || []);
    } catch {
      setCis([]);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get<Componente[]>(`${API_BASE_URL}/admin/inventario/componentes`, {
        headers: headers(),
      });
      setItems(res.data || []);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudo cargar el inventario."));
    } finally {
      setLoading(false);
    }
  };

  const loadGrupos = async () => {
    try {
      const res = await axios.get<GrupoComponente[]>(`${API_BASE_URL}/admin/inventario/componentes-agrupados`, {
        headers: headers(),
      });
      setGrupos(res.data || []);
    } catch {
      setGrupos([]);
    }
  };

  useEffect(() => {
    void load();
    void loadGrupos();
    void loadCis();
  }, []);

  const openNew = () => {
    setEditingId(null);
    setForm(initialForm);
    setModalOpen(true);
  };

  const openNewFromGroup = (nombre: string) => {
    const base =
      similares.find((c) => c.nombre === nombre) ||
      items.find((c) => c.nombre === nombre) ||
      null;
    setQuickAddNombre(nombre);
    setQuickAddBase(base);
    setQuickAddSerie("");
    setQuickAddCi("");
    setQuickAddOpen(true);
  };

  const openEdit = (c: Componente) => {
    setEditingId(c.id_componente);
    setForm({
      nombre: c.nombre,
      descripcion: c.descripcion || "",
      numero_serie: c.numero_serie || "",
      precio_unitario: String(c.precio_unitario),
      unidad: c.unidad || "pza",
      activo: Boolean(c.activo),
      id_ci: c.id_ci?.trim() || "",
    });
    setModalOpen(true);
  };

  const ciAsignadoLabel = (c: Componente) => {
    if (!c.id_ci?.trim()) return "General";
    return c.nombre_equipo?.trim() || c.ci_numero_serie?.trim() || c.id_ci.trim();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");
    const currentItem = editingId ? items.find((it) => it.id_componente === editingId) : null;
    const payload = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      numero_serie: form.numero_serie.trim() || null,
      cantidad_stock: currentItem ? Number(currentItem.cantidad_stock) || 1 : 1,
      precio_unitario: Number.parseFloat(form.precio_unitario),
      unidad: form.unidad.trim() || null,
      activo: form.activo,
      id_ci: form.id_ci.trim() || null,
    };
    try {
      if (editingId) {
        await axios.put(`${API_BASE_URL}/admin/inventario/componentes/${editingId}`, payload, {
          headers: headers(),
        });
        setStatusMessage("Componente actualizado.");
      } else {
        await axios.post(`${API_BASE_URL}/admin/inventario/componentes`, payload, {
          headers: headers(),
        });
        setStatusMessage("Componente creado.");
      }
      setModalOpen(false);
      await load();
      await loadGrupos();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudo guardar el componente."));
    } finally {
      setSubmitting(false);
    }
  };

  const openSimilares = async (nombre: string) => {
    try {
      const res = await axios.get<Componente[]>(`${API_BASE_URL}/admin/inventario/componentes/similares`, {
        headers: headers(),
        params: { nombre },
      });
      setSelectedNombre(nombre);
      setSimilares(res.data || []);
      setSimilaresOpen(true);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudo cargar la lista de componentes similares."));
    }
  };

  const openHistorial = async (idComponente: string) => {
    try {
      const res = await axios.get<HistorialComponente>(
        `${API_BASE_URL}/admin/inventario/componentes/${idComponente}/historial-ci`,
        { headers: headers() }
      );
      setHistorialComp(res.data);
      setHistorialOpen(true);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudo cargar el historial del componente."));
    }
  };

  const handleQuickAdd = async (event: FormEvent) => {
    event.preventDefault();
    if (!quickAddNombre.trim()) return;
    setSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");
    const payload = {
      nombre: quickAddNombre.trim(),
      numero_serie: quickAddSerie.trim() || null,
      descripcion: quickAddBase?.descripcion || null,
      cantidad_stock: 1,
      precio_unitario: Number(quickAddBase?.precio_unitario || 0),
      unidad: quickAddBase?.unidad || "pza",
      activo: quickAddBase ? Boolean(quickAddBase.activo) : true,
      id_ci: quickAddCi.trim() || null,
    };
    try {
      await axios.post(`${API_BASE_URL}/admin/inventario/componentes`, payload, {
        headers: headers(),
      });
      setQuickAddOpen(false);
      setStatusMessage("Componente del mismo tipo creado.");
      await Promise.all([load(), loadGrupos()]);
      if (selectedNombre) {
        await openSimilares(selectedNombre);
      }
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudo crear el componente del mismo tipo."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-10 rounded-[24px] bg-white p-8 text-slate-900 shadow-2xl md:p-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#001f3f]">
            <Package className="h-7 w-7" />
            Inventario de componentes
          </h2>
          <p className="mt-1 text-sm text-slate-600">Repuestos y consumibles vinculados a solicitudes de cambio.</p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-2 rounded-xl bg-[#001f3f] px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800"
        >
          <Plus className="h-4 w-4" />
          Nuevo componente
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

      <div className="mb-6 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Componente</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Asignados</th>
              <th className="px-4 py-3">Almacen</th>
              <th className="px-4 py-3">Accion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {!grupos.length ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Sin grupos.</td></tr>
            ) : null}
            {grupos.map((g) => (
              <tr key={g.nombre}>
                <td className="px-4 py-3 font-medium">{g.nombre}</td>
                <td className="px-4 py-3">{g.total_componentes}</td>
                <td className="px-4 py-3">{g.asignados}</td>
                <td className="px-4 py-3">{g.en_almacen}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => void openSimilares(g.nombre)}
                    className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-200"
                  >
                    Ver lista
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loading ? <p className="text-sm text-slate-500">Cargando inventario...</p> : null}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {editingId ? "Editar componente" : "Nuevo componente"}
            </h3>
            <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-600">Nombre</span>
                <input className={inputClass} value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} required />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-600">Numero de serie</span>
                <input className={inputClass} value={form.numero_serie} onChange={(e) => setForm((p) => ({ ...p, numero_serie: e.target.value }))} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-600">Descripcion</span>
                <textarea className={inputClass} rows={2} value={form.descripcion} onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} />
              </label>
              <div className="grid grid-cols-1 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-600">Precio (MXN)</span>
                  <input type="number" min={0} step="0.01" className={inputClass} value={form.precio_unitario} onChange={(e) => setForm((p) => ({ ...p, precio_unitario: e.target.value }))} required />
                </label>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-600">Unidad</span>
                <input className={inputClass} value={form.unidad} onChange={(e) => setForm((p) => ({ ...p, unidad: e.target.value }))} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-600">CI asignado</span>
                <select
                  className={inputClass}
                  value={form.id_ci}
                  onChange={(e) => setForm((p) => ({ ...p, id_ci: e.target.value }))}
                >
                  <option value="">Sin asignar (general)</option>
                  {gruposCiOrdenados.map(([grupo, itemsGrupo]) => (
                    <optgroup key={grupo} label={grupo}>
                      {itemsGrupo
                        .sort((a, b) => a.id_ci.localeCompare(b.id_ci, "es"))
                        .map((ci) => (
                          <option key={ci.id_ci} value={ci.id_ci.trim()}>
                            {ci.id_ci.trim()} — {ci.nombre_equipo || ci.numero_serie || "Sin nombre"}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.activo} onChange={(e) => setForm((p) => ({ ...p, activo: e.target.checked }))} />
                Activo en catalogo
              </label>
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={submitting} className="flex-1 rounded-xl bg-[#001f3f] py-3 text-sm font-semibold text-white disabled:opacity-60">
                  {submitting ? "Guardando..." : "Guardar"}
                </button>
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {similaresOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Lista por serie: {selectedNombre}</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSimilaresOpen(false);
                    openNewFromGroup(selectedNombre);
                  }}
                  className="rounded-xl bg-[#001f3f] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
                >
                  Nuevo de este tipo
                </button>
                <button type="button" onClick={() => setSimilaresOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Cerrar</button>
              </div>
            </div>
            {similares.length ? (
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">{similares[0].nombre}</p>
                <p className="text-xs text-slate-500">{similares[0].descripcion || "Sin descripcion"}</p>
                <p className="text-xs text-slate-500">
                  ${Number(similares[0].precio_unitario).toFixed(2)} · {similares[0].unidad || "pza"} ·{" "}
                  {Boolean(similares[0].activo) ? "Activo" : "Inactivo"}
                </p>
                <p className="text-xs font-semibold text-slate-700">
                  Stock total del tipo: {similares.length} componente(s)
                </p>
              </div>
            ) : null}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                  <tr><th className="px-4 py-3">ID</th><th className="px-4 py-3">Serie</th><th className="px-4 py-3">CI actual</th><th className="px-4 py-3">Accion</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {similares.map((c) => (
                    <tr key={c.id_componente}>
                      <td className="px-4 py-3">{c.id_componente}</td>
                      <td className="px-4 py-3">{c.numero_serie || "â€”"}</td>
                      <td className="px-4 py-3">{ciAsignadoLabel(c)}</td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => void openHistorial(c.id_componente)} className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">Historial</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {historialOpen && historialComp ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                Historial del componente {historialComp.actual.id_componente}
              </h3>
              <button type="button" onClick={() => setHistorialOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Cerrar</button>
            </div>
            <p className="mb-3 text-sm text-slate-700">
              Serie: <strong>{historialComp.actual.numero_serie || "â€”"}</strong> Â· Ubicacion actual: <strong>{historialComp.actual.ubicacion_actual}</strong>
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                  <tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">RFC</th><th className="px-4 py-3">CI</th><th className="px-4 py-3">Evento</th><th className="px-4 py-3">Detalle</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {!historialComp.historial.length ? (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Sin movimientos registrados.</td></tr>
                  ) : null}
                  {historialComp.historial.map((h, idx) => (
                    <tr key={`${h.numero_rfc}-${idx}`}>
                      <td className="px-4 py-3">{h.fecha_evento ? new Date(h.fecha_evento).toLocaleString("es-MX") : "â€”"}</td>
                      <td className="px-4 py-3">{h.numero_rfc || "ALTA"}</td>
                      <td className="px-4 py-3">{h.id_ci}</td>
                      <td className="px-4 py-3">{h.tipo_evento}</td>
                      <td className="px-4 py-3">{h.detalle_cambio || "â€”"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {quickAddOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Nuevo componente de tipo: {quickAddNombre}</h3>
            <form className="mt-4 space-y-3" onSubmit={handleQuickAdd}>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-600">Numero de serie</span>
                <input
                  className={inputClass}
                  value={quickAddSerie}
                  onChange={(e) => setQuickAddSerie(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-600">CI asignado</span>
                <select className={inputClass} value={quickAddCi} onChange={(e) => setQuickAddCi(e.target.value)}>
                  <option value="">Sin asignar (almacen)</option>
                  {gruposCiOrdenados.map(([grupo, itemsGrupo]) => (
                    <optgroup key={grupo} label={grupo}>
                      {itemsGrupo
                        .sort((a, b) => a.id_ci.localeCompare(b.id_ci, "es"))
                        .map((ci) => (
                          <option key={ci.id_ci} value={ci.id_ci.trim()}>
                            {ci.id_ci.trim()} — {ci.nombre_equipo || ci.numero_serie || "Sin nombre"}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-[#001f3f] py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {submitting ? "Guardando..." : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={() => setQuickAddOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

