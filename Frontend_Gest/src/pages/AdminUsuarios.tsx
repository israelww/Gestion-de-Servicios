import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import { getToken } from "../auth/storage";

const API_BASE_URL = "http://localhost:4000/api";

interface Usuario {
  id_usuario: string;
  nombre_completo: string;
  correo: string;
  id_rol: string;
  nombre_rol: string;
}

interface Rol {
  id_rol: string;
  nombre_rol: string;
}

const initialForm = {
  id_usuario: "",
  nombre_completo: "",
  correo: "",
  id_rol: "",
  password: "",
};

const headers = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function AdminUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        axios.get<Usuario[]>(`${API_BASE_URL}/usuarios`, { headers: headers() }),
        axios.get<Rol[]>(`${API_BASE_URL}/roles`, { headers: headers() }),
      ]);
      setUsuarios(usersRes.data || []);
      setRoles(rolesRes.data || []);
      setErrorMessage("");
    } catch (error) {
      console.error(error);
      setErrorMessage("No se pudo cargar la gestion de usuarios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      if (editingId) {
        await axios.put(
          `${API_BASE_URL}/usuarios/${editingId}`,
          {
            nombre_completo: form.nombre_completo,
            correo: form.correo,
            id_rol: form.id_rol,
            password: form.password,
          },
          { headers: headers() }
        );
        setStatusMessage("Usuario actualizado correctamente.");
      } else {
        await axios.post(
          `${API_BASE_URL}/usuarios`,
          {
            id_usuario: form.id_usuario,
            nombre_completo: form.nombre_completo,
            correo: form.correo,
            id_rol: form.id_rol,
            password: form.password,
          },
          { headers: headers() }
        );
        setStatusMessage("Usuario creado correctamente.");
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
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">ID usuario</span>
            <input
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
              value={form.id_usuario}
              onChange={(event) => setForm((prev) => ({ ...prev, id_usuario: event.target.value }))}
              disabled={Boolean(editingId)}
              required
            />
          </label>

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

          <label className="text-sm">
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
                              id_usuario: usuario.id_usuario,
                              nombre_completo: usuario.nombre_completo,
                              correo: usuario.correo,
                              id_rol: usuario.id_rol,
                              password: "",
                            });
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
