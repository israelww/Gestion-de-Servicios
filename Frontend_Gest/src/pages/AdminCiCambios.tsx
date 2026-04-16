import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import { ArrowLeft, CalendarClock, ClipboardList, Save, UserCog, Wrench } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { getToken } from "../auth/storage";

const API_BASE_URL = "http://localhost:4000/api";

type CiDetalle = {
  id_ci: string;
  numero_serie: string;
  nombre_equipo: string;
  modelo: string;
  estado: string;
  fecha_ingreso: string;
  nombre_tipo: string;
  nombre_marca: string;
  nombre_sublocalizacion: string;
  nombre_edificio: string;
  usuario_responsable: string | null;
};

type Tecnico = {
  id_usuario: string;
  nombre_completo: string;
};

type CambioCI = {
  id_historial_ci_cambio: number;
  id_ci: string;
  fecha_cambio: string;
  numero_transaccion: string | null;
  tipo_transaccion: string | null;
  componente: string;
  descripcion_cambio: string;
  detalle_anterior: string | null;
  detalle_nuevo: string | null;
  observaciones: string | null;
  id_tecnico: string;
  tecnico_nombre: string | null;
  id_usuario_registra: string | null;
  usuario_registra_nombre: string | null;
  fecha_registro: string;
};

type CambiosResponse = {
  ci: CiDetalle;
  cambios: CambioCI[];
};

const headers = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const toDatetimeLocal = (value: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = value.getFullYear();
  const mm = pad(value.getMonth() + 1);
  const dd = pad(value.getDate());
  const hh = pad(value.getHours());
  const mi = pad(value.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

const formatDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

const initialForm = () => ({
  fecha_cambio: toDatetimeLocal(new Date()),
  numero_transaccion: "",
  tipo_transaccion: "Ticket",
  id_tecnico: "",
  componente: "",
  detalle_anterior: "",
  detalle_nuevo: "",
  descripcion_cambio: "",
  observaciones: "",
});

export default function AdminCiCambios() {
  const navigate = useNavigate();
  const { id_ci = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [ci, setCi] = useState<CiDetalle | null>(null);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [cambios, setCambios] = useState<CambioCI[]>([]);
  const [form, setForm] = useState(initialForm);

  const safeCiId = useMemo(() => id_ci.trim(), [id_ci]);

  const loadData = async () => {
    if (!safeCiId) {
      setErrorMessage("No se recibio el ID del CI.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");
    try {
      const [cambiosRes, tecnicosRes] = await Promise.all([
        axios.get<CambiosResponse>(`${API_BASE_URL}/ci/${encodeURIComponent(safeCiId)}/cambios`, {
          headers: headers(),
        }),
        axios.get<Tecnico[]>(`${API_BASE_URL}/catalogos/tecnicos`, { headers: headers() }),
      ]);
      setCi(cambiosRes.data.ci);
      setCambios(cambiosRes.data.cambios);
      setTecnicos(tecnicosRes.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setErrorMessage(error.response?.data?.message || "No se pudo cargar el historial del CI.");
      } else {
        setErrorMessage("No se pudo cargar el historial del CI.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [safeCiId]);

  useEffect(() => {
    if (!statusMessage) return;
    const t = window.setTimeout(() => setStatusMessage(""), 3500);
    return () => window.clearTimeout(t);
  }, [statusMessage]);

  const submitCambio = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      await axios.post(
        `${API_BASE_URL}/ci/${encodeURIComponent(safeCiId)}/cambios`,
        {
          fecha_cambio: new Date(form.fecha_cambio).toISOString(),
          numero_transaccion: form.numero_transaccion,
          tipo_transaccion: form.tipo_transaccion,
          id_tecnico: form.id_tecnico,
          componente: form.componente,
          detalle_anterior: form.detalle_anterior,
          detalle_nuevo: form.detalle_nuevo,
          descripcion_cambio: form.descripcion_cambio,
          observaciones: form.observaciones,
        },
        { headers: headers() }
      );
      setForm(initialForm());
      setStatusMessage("Cambio registrado correctamente.");
      await loadData();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setErrorMessage(error.response?.data?.message || "No se pudo guardar el cambio.");
      } else {
        setErrorMessage("No se pudo guardar el cambio.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-10 space-y-6 rounded-[24px] bg-white p-8 text-slate-900 shadow-2xl md:p-10 xl:p-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[#001f3f]">Historial de cambios de CI</h2>
          <p className="mt-1 text-sm text-slate-600">Registra reemplazos o modificaciones de componentes.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/admin/catalogo-ci")}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al inventario
        </button>
      </div>

      {statusMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {statusMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
          Cargando historial...
        </div>
      ) : null}

      {!loading && ci ? (
        <>
          <section className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">ID CI</p>
              <p className="font-semibold text-slate-900">{ci.id_ci}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Equipo</p>
              <p className="font-semibold text-slate-900">{ci.nombre_equipo || "Sin nombre"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Serie</p>
              <p className="font-semibold text-slate-900">{ci.numero_serie}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Ubicacion</p>
              <p className="font-semibold text-slate-900">
                {ci.nombre_edificio} / {ci.nombre_sublocalizacion}
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Registrar cambio</h3>
            <form className="mt-4 space-y-4" onSubmit={submitCambio}>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-700">Fecha del cambio</span>
                  <div className="relative">
                    <CalendarClock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="datetime-local"
                      required
                      value={form.fecha_cambio}
                      onChange={(e) => setForm((p) => ({ ...p, fecha_cambio: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 py-3 pl-10 pr-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-900"
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-700">Numero de transaccion</span>
                  <input
                    value={form.numero_transaccion}
                    onChange={(e) => setForm((p) => ({ ...p, numero_transaccion: e.target.value }))}
                    placeholder="Ticket o folio"
                    className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-900"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-700">Origen</span>
                  <select
                    value={form.tipo_transaccion}
                    onChange={(e) => setForm((p) => ({ ...p, tipo_transaccion: e.target.value }))}
                    className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-900"
                  >
                    <option value="Ticket">Ticket</option>
                    <option value="Mantenimiento preventivo">Mantenimiento preventivo</option>
                    <option value="Mantenimiento correctivo">Mantenimiento correctivo</option>
                    <option value="Otro">Otro</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-700">Tecnico que realizo el cambio</span>
                  <div className="relative">
                    <UserCog className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <select
                      required
                      value={form.id_tecnico}
                      onChange={(e) => setForm((p) => ({ ...p, id_tecnico: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 py-3 pl-10 pr-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-900"
                    >
                      <option value="">Selecciona tecnico</option>
                      {tecnicos.map((tecnico) => (
                        <option key={tecnico.id_usuario} value={tecnico.id_usuario}>
                          {tecnico.nombre_completo}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-700">Componente</span>
                  <div className="relative">
                    <Wrench className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      required
                      value={form.componente}
                      onChange={(e) => setForm((p) => ({ ...p, componente: e.target.value }))}
                      placeholder="RAM, Disco duro, Fuente..."
                      className="w-full rounded-xl border border-gray-300 py-3 pl-10 pr-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-900"
                    />
                  </div>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-700">Detalle anterior</span>
                  <input
                    value={form.detalle_anterior}
                    onChange={(e) => setForm((p) => ({ ...p, detalle_anterior: e.target.value }))}
                    placeholder="Ej. 8 GB DDR4"
                    className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-900"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-700">Detalle nuevo</span>
                  <input
                    value={form.detalle_nuevo}
                    onChange={(e) => setForm((p) => ({ ...p, detalle_nuevo: e.target.value }))}
                    placeholder="Ej. 16 GB DDR4"
                    className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-900"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-700">Descripcion del cambio</span>
                <textarea
                  required
                  rows={3}
                  value={form.descripcion_cambio}
                  onChange={(e) => setForm((p) => ({ ...p, descripcion_cambio: e.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-900"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-700">Observaciones</span>
                <textarea
                  rows={2}
                  value={form.observaciones}
                  onChange={(e) => setForm((p) => ({ ...p, observaciones: e.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-900"
                />
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-[#001f3f] px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-70"
              >
                <Save className="h-4 w-4" />
                Guardar cambio
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-slate-700" />
              <h3 className="text-lg font-bold text-slate-900">Movimientos registrados</h3>
            </div>

            {!cambios.length ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                Este CI todavia no tiene cambios registrados.
              </div>
            ) : (
              <div className="space-y-3">
                {cambios.map((cambio) => (
                  <article key={cambio.id_historial_ci_cambio} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">{cambio.componente}</p>
                        <p className="text-xs text-slate-600">{formatDateTime(cambio.fecha_cambio)}</p>
                      </div>
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                        {cambio.tipo_transaccion || "Sin origen"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-700">{cambio.descripcion_cambio}</p>
                    <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-2">
                      <p><strong className="text-slate-800">Transaccion:</strong> {cambio.numero_transaccion || "No capturada"}</p>
                      <p><strong className="text-slate-800">Tecnico:</strong> {cambio.tecnico_nombre || cambio.id_tecnico}</p>
                      <p><strong className="text-slate-800">Anterior:</strong> {cambio.detalle_anterior || "Sin detalle"}</p>
                      <p><strong className="text-slate-800">Nuevo:</strong> {cambio.detalle_nuevo || "Sin detalle"}</p>
                    </div>
                    {cambio.observaciones ? (
                      <p className="mt-2 text-xs text-slate-600">
                        <strong className="text-slate-800">Observaciones:</strong> {cambio.observaciones}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
