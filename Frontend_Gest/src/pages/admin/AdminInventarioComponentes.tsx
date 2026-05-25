import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import { Package, Plus } from "lucide-react";
import { getToken } from "../../auth/storage";

const API_BASE_URL = "http://localhost:4000/api";

type CiOption = {
  id_ci: string;
  nombre_equipo: string | null;
  numero_serie: string;
};

type Componente = {
  id_componente: string;
  nombre: string;
  descripcion: string | null;
  cantidad_stock: number;
  precio_unitario: number | string;
  unidad: string | null;
  activo: boolean | number;
  id_ci?: string | null;
  nombre_equipo?: string | null;
  ci_numero_serie?: string | null;
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
  descripcion: "",
  cantidad_stock: "0",
  precio_unitario: "",
  unidad: "pza",
  activo: true,
  id_ci: "",
};

export default function AdminInventarioComponentes() {
  const [items, setItems] = useState<Componente[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [cis, setCis] = useState<CiOption[]>([]);

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

  useEffect(() => {
    void load();
    void loadCis();
  }, []);

  const openNew = () => {
    setEditingId(null);
    setForm(initialForm);
    setModalOpen(true);
  };

  const openEdit = (c: Componente) => {
    setEditingId(c.id_componente);
    setForm({
      nombre: c.nombre,
      descripcion: c.descripcion || "",
      cantidad_stock: String(c.cantidad_stock),
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
    const payload = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      cantidad_stock: Number.parseInt(form.cantidad_stock, 10),
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
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudo guardar el componente."));
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

      {loading ? (
        <p className="text-sm text-slate-500">Cargando inventario...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Precio</th>
                <th className="px-4 py-3">Unidad</th>
                <th className="px-4 py-3">CI asignado</th>
                <th className="px-4 py-3">Activo</th>
                <th className="px-4 py-3">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {!items.length ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Sin componentes registrados.
                  </td>
                </tr>
              ) : null}
              {items.map((c) => (
                <tr key={c.id_componente}>
                  <td className="px-4 py-3 font-medium">{c.id_componente}</td>
                  <td className="px-4 py-3">{c.nombre}</td>
                  <td className="px-4 py-3">{c.cantidad_stock}</td>
                  <td className="px-4 py-3">
                    ${Number(c.precio_unitario).toFixed(2)}
                    {Number(c.precio_unitario) >= 1000 ? (
                      <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        ≥ $1,000
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{c.unidad || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{ciAsignadoLabel(c)}</td>
                  <td className="px-4 py-3">{Boolean(c.activo) ? "Si" : "No"}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-600">Descripcion</span>
                <textarea className={inputClass} rows={2} value={form.descripcion} onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-600">Stock</span>
                  <input type="number" min={0} className={inputClass} value={form.cantidad_stock} onChange={(e) => setForm((p) => ({ ...p, cantidad_stock: e.target.value }))} required />
                </label>
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
                  {cis.map((ci) => (
                    <option key={ci.id_ci} value={ci.id_ci.trim()}>
                      {ci.id_ci.trim()} — {ci.nombre_equipo || ci.numero_serie || "Sin nombre"}
                    </option>
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
    </section>
  );
}
