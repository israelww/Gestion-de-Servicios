import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import { getToken } from "../auth/storage";

const API_BASE_URL = "http://localhost:4000/api";
const NOMBRE_ROL_TECNICO = "Tecnico";

type DiaKey = "lun" | "mar" | "mie" | "jue" | "vie" | "sab" | "dom";

type SlotDia = { activo: boolean; inicio: string; fin: string };

const DIAS: { key: DiaKey; label: string }[] = [
  { key: "lun", label: "Lun" },
  { key: "mar", label: "Mar" },
  { key: "mie", label: "Mie" },
  { key: "jue", label: "Jue" },
  { key: "vie", label: "Vie" },
  { key: "sab", label: "Sab" },
  { key: "dom", label: "Dom" },
];

function defaultHorario(): Record<DiaKey, SlotDia> {
  const slot = (activo: boolean): SlotDia => ({ activo, inicio: "09:00", fin: "17:00" });
  return {
    lun: slot(true),
    mar: slot(true),
    mie: slot(true),
    jue: slot(true),
    vie: slot(true),
    sab: slot(false),
    dom: slot(false),
  };
}

function mergeHorarioFromServer(raw: string | null | undefined): Record<DiaKey, SlotDia> {
  const base = defaultHorario();
  if (!raw) return base;
  try {
    const parsed = typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : raw;
    if (!parsed || typeof parsed !== "object") return base;
    for (const { key } of DIAS) {
      const v = parsed[key];
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      const o = v as Record<string, unknown>;
      base[key] = {
        activo: Boolean(o.activo),
        inicio: typeof o.inicio === "string" ? o.inicio : base[key].inicio,
        fin: typeof o.fin === "string" ? o.fin : base[key].fin,
      };
    }
    return base;
  } catch {
    return base;
  }
}

function horarioTieneServicio(h: Record<DiaKey, SlotDia>): boolean {
  return DIAS.some(({ key }) => {
    const s = h[key];
    return s.activo && s.inicio.trim() && s.fin.trim();
  });
}

interface Usuario {
  id_usuario: string;
  nombre_completo: string;
  correo: string;
  id_rol: string;
  nombre_rol: string;
  id_tecnico?: string | null;
  tecnico_id_area?: string | null;
  tecnico_horario?: string | null;
}

interface Rol {
  id_rol: string;
  nombre_rol: string;
}

interface Area {
  id_area: string;
  nombre_area: string;
}

const initialForm = {
  nombre_completo: "",
  correo: "",
  id_rol: "",
  password: "",
};

const headers = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    const apiMessage = error.response?.data?.message;
    const url = error.config?.url;
    const suffix = url ? ` (${url})` : "";
    if (typeof apiMessage === "string" && apiMessage.trim()) return `${apiMessage}${suffix}`;
    const status = error.response?.status;
    if (status === 401 || status === 403) return `No autorizado${suffix}`;
    if (status) return `${fallback}: HTTP ${status}${suffix}`;
  }
  return fallback;
};

export default function AdminUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [form, setForm] = useState(initialForm);
  const [tecnicoAreaId, setTecnicoAreaId] = useState("");
  const [horario, setHorario] = useState<Record<DiaKey, SlotDia>>(() => defaultHorario());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showNuevaArea, setShowNuevaArea] = useState(false);
  const [nuevaAreaNombre, setNuevaAreaNombre] = useState("");
  const [savingArea, setSavingArea] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes, areasRes] = await Promise.all([
        axios.get<Usuario[]>(`${API_BASE_URL}/usuarios`, { headers: headers() }),
        axios.get<Rol[]>(`${API_BASE_URL}/roles`, { headers: headers() }),
        axios.get<Area[]>(`${API_BASE_URL}/areas`, { headers: headers() }),
      ]);
      setUsuarios(Array.isArray(usersRes.data) ? usersRes.data : []);
      setRoles(Array.isArray(rolesRes.data) ? rolesRes.data : []);
      setAreas(Array.isArray(areasRes.data) ? areasRes.data : []);
      setErrorMessage("");
    } catch (error) {
      console.error("Error cargando gestion de usuarios:", error);
      setUsuarios([]);
      setRoles([]);
      setAreas([]);
      setErrorMessage(getApiErrorMessage(error, "No se pudo cargar la gestion de usuarios."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const resetForm = () => {
    setForm(initialForm);
    setTecnicoAreaId("");
    setHorario(defaultHorario());
    setEditingId(null);
    setShowNuevaArea(false);
    setNuevaAreaNombre("");
  };

  const handleCrearArea = async () => {
    const nombre = nuevaAreaNombre.trim();
    if (!nombre) return;
    setSavingArea(true);
    try {
      const res = await axios.post<{ id_area: string; nombre_area: string }>(
        `${API_BASE_URL}/admin/areas`,
        { nombre_area: nombre },
        { headers: headers() }
      );
      await loadData();
      const newId = res.data?.id_area;
      if (newId) setTecnicoAreaId(newId);
      setShowNuevaArea(false);
      setNuevaAreaNombre("");
    } catch {
      setErrorMessage("No se pudo crear el area. Intente de nuevo.");
    } finally {
      setSavingArea(false);
    }
  };

  const rolSeleccionadoNombre = roles.find((r) => r.id_rol === form.id_rol)?.nombre_rol;
  const esRolTecnico = rolSeleccionadoNombre === NOMBRE_ROL_TECNICO;

  const setDiaHorario = (key: DiaKey, patch: Partial<SlotDia>) => {
    setHorario((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const buildHorarioPayload = (): Record<DiaKey, SlotDia> => {
    const out = {} as Record<DiaKey, SlotDia>;
    for (const { key } of DIAS) {
      out[key] = { ...horario[key] };
    }
    return out;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");

    if (esRolTecnico) {
      if (!tecnicoAreaId) {
        setErrorMessage("Seleccione el area del tecnico.");
        setSubmitting(false);
        return;
      }
      if (!horarioTieneServicio(horario)) {
        setErrorMessage("Indique al menos un dia activo con hora de inicio y fin.");
        setSubmitting(false);
        return;
      }
    }

    try {
      if (editingId) {
        await axios.put(
          `${API_BASE_URL}/usuarios/${editingId}`,
          {
            nombre_completo: form.nombre_completo,
            correo: form.correo,
            id_rol: form.id_rol,
            password: form.password || undefined,
            ...(esRolTecnico
              ? { tecnico: { id_area: tecnicoAreaId, horario: buildHorarioPayload() } }
              : {}),
          },
          { headers: headers() }
        );
        setStatusMessage("Usuario actualizado correctamente.");
      } else {
        const res = await axios.post<{
          message: string;
          id_usuario: string;
          id_tecnico?: string | null;
        }>(
          `${API_BASE_URL}/usuarios`,
          {
            nombre_completo: form.nombre_completo,
            correo: form.correo,
            id_rol: form.id_rol,
            password: form.password,
            ...(esRolTecnico
              ? { tecnico: { id_area: tecnicoAreaId, horario: buildHorarioPayload() } }
              : {}),
          },
          { headers: headers() }
        );
        const ids = res.data?.id_usuario
          ? ` ID usuario: ${res.data.id_usuario}${
              res.data.id_tecnico ? ` · ID tecnico: ${res.data.id_tecnico}` : ""
            }.`
          : "";
        setStatusMessage(`Usuario creado correctamente.${ids}`);
      }

      resetForm();
      await loadData();
    } catch (error) {
      console.error(error);
      setErrorMessage(editingId ? "No se pudo actualizar el usuario." : "No se pudo crear el usuario.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (idUsuario: string) => {
    if (!window.confirm("Eliminar este usuario? Esta accion no se puede deshacer.")) return;

    try {
      await axios.delete(`${API_BASE_URL}/usuarios/${idUsuario}`, { headers: headers() });
      setStatusMessage("Usuario eliminado correctamente.");
      await loadData();
    } catch (error) {
      console.error(error);
      setErrorMessage("No se pudo eliminar el usuario.");
    }
  };

  return (
    <section className="mt-10 rounded-[24px] bg-white p-8 text-slate-900 shadow-2xl md:p-10 xl:p-12">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[#001f3f]">Gestion de Usuarios</h2>
        <p className="mt-1 text-sm text-slate-600">Alta, edicion y baja del personal del sistema.</p>
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

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">{editingId ? "Editar usuario" : "Nuevo usuario"}</h3>

        <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          {editingId ? (
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                ID usuario (no editable)
              </span>
              <input
                className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-3 text-sm text-slate-700"
                value={editingId}
                readOnly
              />
            </label>
          ) : (
            <p className="text-sm text-slate-600 md:col-span-2">
              El identificador de usuario se genera automaticamente al crear la cuenta (formato USR_XXXX_00001).
            </p>
          )}

          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Nombre completo</span>
            <input
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
              value={form.nombre_completo}
              onChange={(event) => setForm((prev) => ({ ...prev, nombre_completo: event.target.value }))}
              required
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Correo</span>
            <input
              type="email"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
              value={form.correo}
              onChange={(event) => setForm((prev) => ({ ...prev, correo: event.target.value }))}
              required
            />
          </label>

          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Rol</span>
            <select
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
              value={form.id_rol}
              onChange={(event) => setForm((prev) => ({ ...prev, id_rol: event.target.value }))}
              required
            >
              <option value="">Selecciona rol</option>
              {roles.map((rol) => (
                <option key={rol.id_rol} value={rol.id_rol}>
                  {rol.nombre_rol}
                </option>
              ))}
            </select>
          </label>

          {esRolTecnico ? (
            <div className="md:col-span-2 rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
              <h4 className="text-sm font-semibold text-[#001f3f]">Perfil de tecnico</h4>
              <p className="mt-1 text-xs text-slate-600">Area de cobertura y disponibilidad semanal.</p>

              <label className="mt-3 block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Area</span>
                <select
                  className="w-full max-w-md rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                  value={showNuevaArea ? "__nueva__" : tecnicoAreaId}
                  onChange={(e) => {
                    if (e.target.value === "__nueva__") {
                      setShowNuevaArea(true);
                      setTecnicoAreaId("");
                    } else {
                      setShowNuevaArea(false);
                      setTecnicoAreaId(e.target.value);
                    }
                  }}
                  required={esRolTecnico && !showNuevaArea}
                >
                  <option value="">Seleccione area</option>
                  {areas.map((a) => (
                    <option key={a.id_area} value={a.id_area}>
                      {a.nombre_area}
                    </option>
                  ))}
                  <option value="__nueva__">＋ Nueva area...</option>
                </select>
              </label>

              {showNuevaArea ? (
                <div className="mt-2 flex max-w-md items-center gap-2">
                  <input
                    autoFocus
                    className="flex-1 rounded-xl border border-blue-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Nombre del nueva area"
                    value={nuevaAreaNombre}
                    onChange={(e) => setNuevaAreaNombre(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleCrearArea(); } }}
                    disabled={savingArea}
                  />
                  <button
                    type="button"
                    onClick={() => void handleCrearArea()}
                    disabled={savingArea || !nuevaAreaNombre.trim()}
                    className="rounded-xl bg-[#001f3f] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    {savingArea ? "Guardando..." : "Guardar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowNuevaArea(false); setNuevaAreaNombre(""); }}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                  >
                    Cancelar
                  </button>
                </div>
              ) : null}

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-[640px] w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                      <th className="py-2 pr-2">Dia</th>
                      <th className="py-2 pr-2">Activo</th>
                      <th className="py-2 pr-2">Inicio</th>
                      <th className="py-2 pr-2">Fin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DIAS.map(({ key, label }) => (
                      <tr key={key} className="border-b border-slate-100">
                        <td className="py-2 pr-2 font-medium text-slate-700">{label}</td>
                        <td className="py-2 pr-2">
                          <input
                            type="checkbox"
                            checked={horario[key].activo}
                            onChange={(e) => setDiaHorario(key, { activo: e.target.checked })}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="time"
                            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                            value={horario[key].inicio}
                            onChange={(e) => setDiaHorario(key, { inicio: e.target.value })}
                            disabled={!horario[key].activo}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="time"
                            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                            value={horario[key].fin}
                            onChange={(e) => setDiaHorario(key, { fin: e.target.value })}
                            disabled={!horario[key].activo}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              {editingId ? "Nueva contrasena (opcional)" : "Contrasena"}
            </span>
            <input
              type="password"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              required={!editingId}
            />
          </label>

          <div className="md:col-span-2 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[#001f3f] px-6 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {editingId ? "Actualizar Usuario" : "Crear Usuario"}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Usuarios registrados</h3>

        {loading ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
            Cargando usuarios...
          </div>
        ) : null}

        {!loading ? (
          <div className="mt-4 w-full max-w-full overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Correo</th>
                  <th className="px-4 py-3">Rol</th>
                  <th className="px-4 py-3 text-left">Accion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {!usuarios.length ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                      No hay usuarios registrados.
                    </td>
                  </tr>
                ) : null}
                {usuarios.map((usuario) => (
                  <tr key={usuario.id_usuario}>
                    <td className="px-4 py-3 font-medium">{usuario.id_usuario}</td>
                    <td className="px-4 py-3">{usuario.nombre_completo}</td>
                    <td className="px-4 py-3">{usuario.correo}</td>
                    <td className="px-4 py-3">{usuario.nombre_rol}</td>
                    <td className="px-4 py-3">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                          onClick={() => {
                            setEditingId(usuario.id_usuario);
                            setForm({
                              nombre_completo: usuario.nombre_completo,
                              correo: usuario.correo,
                              id_rol: usuario.id_rol,
                              password: "",
                            });
                            setTecnicoAreaId(usuario.tecnico_id_area || "");
                            setHorario(mergeHorarioFromServer(usuario.tecnico_horario));
                            setStatusMessage("");
                            setErrorMessage("");
                          }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          onClick={() => void handleDelete(usuario.id_usuario)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </section>
  );
}
