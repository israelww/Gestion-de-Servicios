import { useDeferredValue, useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import axios from "axios";
import { Boxes, Building2, Edit3, MapPinned, Search, Trash2, UserRound, Wrench } from "lucide-react";
import Sidebar, { type SidebarNavGroup } from "../components/layout/Sidebar";
import { getToken } from "../auth/storage";

const API_BASE_URL = "http://localhost:4000/api";

type AdminView = "edificios-sedes" | "sublocalizaciones" | "catalogo-ci";

interface Edificio {
  id_edificio: string;
  nombre_edificio: string;
  descripcion_edificio: string;
}

interface Sublocalizacion {
  id_sublocalizacion: string;
  nombre_sublocalizacion: string;
  id_edificio: string;
}

interface TipoCI {
  id_tipo_ci: string;
  nombre_tipo: string;
}

interface Marca {
  id_marca: string;
  nombre_marca: string;
}

interface UsuarioResponsable {
  id_usuario: string;
  nombre_completo: string;
}

interface InventarioCI {
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
}

interface CatalogosCI {
  tipos_ci: TipoCI[];
  marcas: Marca[];
  edificios: Array<Pick<Edificio, "id_edificio" | "nombre_edificio">>;
  usuarios: UsuarioResponsable[];
}

interface BuildingFormState {
  id_edificio: string;
  nombre_edificio: string;
  descripcion_edificio: string;
}

interface SublocalizacionFormState {
  id_sublocalizacion: string;
  nombre_sublocalizacion: string;
  id_edificio: string;
}

interface CiFormState {
  id_ci: string;
  numero_serie: string;
  nombre_equipo: string;
  modelo: string;
  estado: string;
  id_tipo_ci: string;
  id_marca: string;
  id_edificio: string;
  id_sublocalizacion: string;
  id_usuario_responsable: string;
}

const sidebarGroups: SidebarNavGroup[] = [
  {
    id: "activos",
    label: "Gestion de Activos",
    items: [
      { id: "edificios-sedes", label: "Edificios y Sedes", icon: Building2 },
      { id: "sublocalizaciones", label: "Sublocalizaciones", icon: MapPinned },
      { id: "catalogo-ci", label: "Catalogo de CIs", icon: Boxes },
    ],
  },
];

const initialBuildingForm: BuildingFormState = { id_edificio: "", nombre_edificio: "", descripcion_edificio: "" };
const initialSublocalizacionForm: SublocalizacionFormState = {
  id_sublocalizacion: "",
  nombre_sublocalizacion: "",
  id_edificio: "",
};
const initialCiForm: CiFormState = {
  id_ci: "",
  numero_serie: "",
  nombre_equipo: "",
  modelo: "",
  estado: "Activo",
  id_tipo_ci: "",
  id_marca: "",
  id_edificio: "",
  id_sublocalizacion: "",
  id_usuario_responsable: "",
};

function createApiHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function normalizePrefix(nombreTipo: string) {
  return (
    nombreTipo.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) ||
    "CI"
  );
}

function getPrefixFromTypeId(tipoId: string, tipos: TipoCI[]) {
  const selectedType = tipos.find((item) => item.id_tipo_ci === tipoId);
  return selectedType ? `${normalizePrefix(selectedType.nombre_tipo)}-` : "";
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return Number.isNaN(date.getTime())
    ? dateString
    : new Intl.DateTimeFormat("es-MX", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function getEstadoClasses(estado: string) {
  if (estado === "Activo") return "bg-emerald-100 text-emerald-800";
  if (estado === "Mantenimiento") return "bg-orange-100 text-orange-800";
  if (estado === "Baja") return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-700";
}

function cardInputClass(disabled = false) {
  return `w-full rounded-xl border border-gray-300 px-4 py-4 text-sm text-gray-700 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-900 ${
    disabled ? "cursor-not-allowed bg-slate-100" : "bg-white"
  }`;
}

function FieldLabel({ children }: { children: string }) {
  return <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-700">{children}</span>;
}

function ActionButtons() {
  return (
    <div className="inline-flex items-center gap-2">
      <button type="button" className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200">
        <Edit3 className="h-4 w-4" />
        Editar
      </button>
      <button type="button" className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">
        <Trash2 className="h-4 w-4" />
        Eliminar
      </button>
    </div>
  );
}

export default function AdminDashboard() {
  const [activeView, setActiveView] = useState<AdminView>("edificios-sedes");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [buildingForm, setBuildingForm] = useState(initialBuildingForm);
  const [sublocalizacionForm, setSublocalizacionForm] = useState(initialSublocalizacionForm);
  const [ciForm, setCiForm] = useState(initialCiForm);
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [sublocalizaciones, setSublocalizaciones] = useState<Sublocalizacion[]>([]);
  const [catalogos, setCatalogos] = useState<CatalogosCI>({ tipos_ci: [], marcas: [], edificios: [], usuarios: [] });
  const [inventario, setInventario] = useState<InventarioCI[]>([]);
  const [inventoryQuery, setInventoryQuery] = useState("");
  const deferredInventoryQuery = useDeferredValue(inventoryQuery.trim().toLowerCase());

  const ciPrefix = getPrefixFromTypeId(ciForm.id_tipo_ci, catalogos.tipos_ci);
  const sublocalizacionesFiltradas = sublocalizaciones.filter((item) => item.id_edificio === ciForm.id_edificio);
  const inventoryRows = inventario.filter((item) => {
    if (!deferredInventoryQuery) return true;
    return [
      item.id_ci,
      item.numero_serie,
      item.nombre_equipo,
      item.modelo,
      item.nombre_tipo,
      item.nombre_marca,
      item.nombre_edificio,
      item.nombre_sublocalizacion,
      item.usuario_responsable || "",
      item.estado,
    ]
      .join(" ")
      .toLowerCase()
      .includes(deferredInventoryQuery);
  });

  async function loadDashboardData() {
    setLoading(true);
    setErrorMessage("");
    try {
      const headers = createApiHeaders();
      const [buildingsResponse, catalogosResponse, ciResponse] = await Promise.all([
        axios.get<Edificio[]>(`${API_BASE_URL}/edificios`, { headers }),
        axios.get<CatalogosCI>(`${API_BASE_URL}/catalogos/ci`, { headers }),
        axios.get<InventarioCI[]>(`${API_BASE_URL}/ci`, { headers }),
      ]);
      setEdificios(buildingsResponse.data);
      setCatalogos(catalogosResponse.data);
      setInventario(ciResponse.data);
      if (!buildingsResponse.data.length) {
        setSublocalizaciones([]);
      } else {
        const responses = await Promise.all(
          buildingsResponse.data.map((building) =>
            axios.get<Sublocalizacion[]>(`${API_BASE_URL}/edificios/${building.id_edificio}/sublocalizaciones`, { headers })
          )
        );
        setSublocalizaciones(responses.flatMap((response) => response.data));
      }
    } catch (error) {
      console.error("Error cargando gestion de activos:", error);
      setErrorMessage("No se pudo cargar el modulo de gestion de activos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboardData();
  }, []);

  useEffect(() => {
    if (!ciForm.id_tipo_ci) {
      setCiForm((prev) => ({ ...prev, id_ci: "" }));
      return;
    }
    setCiForm((prev) => {
      const nextPrefix = getPrefixFromTypeId(prev.id_tipo_ci, catalogos.tipos_ci);
      if (!nextPrefix) return prev;
      const currentValue = prev.id_ci.trim().toUpperCase();
      if (!currentValue) return { ...prev, id_ci: nextPrefix };
      const knownPrefixes = catalogos.tipos_ci.map((item) => getPrefixFromTypeId(item.id_tipo_ci, catalogos.tipos_ci));
      const matchedPrefix = knownPrefixes.find((prefix) => currentValue.startsWith(prefix));
      return matchedPrefix ? { ...prev, id_ci: `${nextPrefix}${currentValue.slice(matchedPrefix.length)}` } : { ...prev, id_ci: nextPrefix };
    });
  }, [ciForm.id_tipo_ci, catalogos.tipos_ci]);

  useEffect(() => {
    if (ciForm.id_sublocalizacion && !sublocalizacionesFiltradas.some((item) => item.id_sublocalizacion === ciForm.id_sublocalizacion)) {
      setCiForm((prev) => ({ ...prev, id_sublocalizacion: "" }));
    }
  }, [ciForm.id_edificio, ciForm.id_sublocalizacion, sublocalizacionesFiltradas]);

  async function handleBuildingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      await axios.post(`${API_BASE_URL}/edificios`, buildingForm, { headers: createApiHeaders() });
      setBuildingForm(initialBuildingForm);
      setStatusMessage("Edificio registrado correctamente.");
      await loadDashboardData();
    } catch (error) {
      console.error("Error creando edificio:", error);
      setErrorMessage("No se pudo registrar el edificio.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSublocalizacionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      await axios.post(`${API_BASE_URL}/sublocalizaciones`, sublocalizacionForm, { headers: createApiHeaders() });
      setSublocalizacionForm(initialSublocalizacionForm);
      setStatusMessage("Sublocalizacion registrada correctamente.");
      await loadDashboardData();
    } catch (error) {
      console.error("Error creando sublocalizacion:", error);
      setErrorMessage("No se pudo registrar la sublocalizacion.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCiSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");
    const normalizedCiId = ciForm.id_ci.trim().toUpperCase();
    if (normalizedCiId.length > 10) {
      setSubmitting(false);
      setErrorMessage("El ID del CI no puede exceder 10 caracteres.");
      return;
    }
    if (normalizedCiId && ciPrefix && !normalizedCiId.startsWith(ciPrefix)) {
      setSubmitting(false);
      setErrorMessage(`El ID del CI debe iniciar con ${ciPrefix}`);
      return;
    }
    try {
      await axios.post(`${API_BASE_URL}/ci`, { ...ciForm, id_ci: normalizedCiId === ciPrefix ? "" : normalizedCiId }, { headers: createApiHeaders() });
      setCiForm(initialCiForm);
      setStatusMessage("Equipo registrado correctamente en el catalogo.");
      await loadDashboardData();
    } catch (error) {
      console.error("Error creando CI:", error);
      setErrorMessage("No se pudo registrar el elemento de configuracion.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCiIdInput(event: ChangeEvent<HTMLInputElement>) {
    const rawValue = event.target.value.toUpperCase().replace(/\s/g, "");
    if (!ciPrefix) {
      setCiForm((prev) => ({ ...prev, id_ci: rawValue.slice(0, 10) }));
      return;
    }
    if (!rawValue) {
      setCiForm((prev) => ({ ...prev, id_ci: ciPrefix }));
      return;
    }
    if (!rawValue.startsWith(ciPrefix)) {
      const suffixCandidate = rawValue.replace(/^[A-Z0-9]{0,4}-?/, "");
      setCiForm((prev) => ({ ...prev, id_ci: `${ciPrefix}${suffixCandidate}`.slice(0, 10) }));
      return;
    }
    setCiForm((prev) => ({ ...prev, id_ci: rawValue.slice(0, 10) }));
  }

  return (
    <div className="relative min-h-screen bg-slate-900 text-slate-100" style={{ overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "url('/images/login-bg.png')", backgroundSize: "cover", backgroundPosition: "center", filter: "blur(4px)", transform: "scale(1.05)" }} />
      <div style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.45)" }} />
      <div className="relative z-10 flex min-h-screen">
        <Sidebar activeView={activeView} onNavigate={(view) => setActiveView(view as AdminView)} groups={sidebarGroups} headingLines={["Control Total", "Gestion de Activos"]} />
        <main className="flex-1" style={{ paddingTop: "32px", paddingBottom: "32px", paddingLeft: "48px", paddingRight: "48px" }}>
          <section className="mt-10 rounded-[24px] bg-white p-12 text-slate-900 shadow-2xl">
            <div className="mb-8 flex flex-wrap items-start justify-between gap-6">
              <div>
                <h1 className="text-3xl font-bold text-[#001f3f]">Gestion de Activos</h1>
                <p className="mt-2 text-sm text-slate-600">Integracion con la misma estetica y estructura visual del resto del sistema.</p>
              </div>
              <div className="grid min-w-[320px] grid-cols-1 gap-3 md:grid-cols-3">
                {[{ label: "Edificios", value: edificios.length, icon: Building2 }, { label: "Sublocalizaciones", value: sublocalizaciones.length, icon: MapPinned }, { label: "CIs", value: inventario.length, icon: Boxes }].map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <article key={stat.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{stat.label}</span>
                        <Icon className="h-5 w-5 text-[#001f3f]" />
                      </div>
                      <strong className="mt-3 block text-3xl font-bold text-slate-900">{stat.value}</strong>
                    </article>
                  );
                })}
              </div>
            </div>

            {statusMessage ? <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{statusMessage}</div> : null}
            {errorMessage ? <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}
            {loading ? <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">Cargando informacion de gestion de activos...</div> : null}

            {!loading && activeView === "edificios-sedes" ? (
              <div className="grid gap-8 xl:grid-cols-[1.1fr_1fr]">
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-2xl font-bold text-[#001f3f]">Edificios y Sedes</h2>
                  <form className="mt-6 space-y-5" onSubmit={handleBuildingSubmit}>
                    <div className="grid gap-5 md:grid-cols-2">
                      <label><FieldLabel>ID del edificio</FieldLabel><input value={buildingForm.id_edificio} onChange={(event) => setBuildingForm((prev) => ({ ...prev, id_edificio: event.target.value }))} maxLength={10} className={cardInputClass()} required /></label>
                      <label><FieldLabel>Nombre</FieldLabel><input value={buildingForm.nombre_edificio} onChange={(event) => setBuildingForm((prev) => ({ ...prev, nombre_edificio: event.target.value }))} maxLength={50} className={cardInputClass()} required /></label>
                    </div>
                    <label className="block"><FieldLabel>Descripcion</FieldLabel><textarea value={buildingForm.descripcion_edificio} onChange={(event) => setBuildingForm((prev) => ({ ...prev, descripcion_edificio: event.target.value }))} rows={4} className={`${cardInputClass()} min-h-[140px]`} required /></label>
                    <button type="submit" disabled={submitting} className="rounded-xl bg-[#001f3f] px-6 py-4 text-sm font-bold text-white shadow-md transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-70">Guardar Edificio</button>
                  </form>
                </section>
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-xl font-bold text-slate-900">Edificios registrados</h3>
                  <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">ID</th><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Descripcion</th><th className="pl-6 pr-8 py-3 text-left">Accion</th></tr></thead>
                      <tbody className="divide-y divide-slate-200 bg-white">{edificios.map((item) => <tr key={item.id_edificio} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium text-slate-900">{item.id_edificio}</td><td className="px-4 py-3 text-slate-700">{item.nombre_edificio}</td><td className="px-4 py-3 text-slate-700">{item.descripcion_edificio}</td><td className="pl-6 pr-8 py-3 text-left"><ActionButtons /></td></tr>)}</tbody>
                    </table>
                  </div>
                </section>
              </div>
            ) : null}

            {!loading && activeView === "sublocalizaciones" ? (
              <div className="grid gap-8 xl:grid-cols-[1.05fr_1fr]">
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-2xl font-bold text-[#001f3f]">Sublocalizaciones</h2>
                  <form className="mt-6 space-y-5" onSubmit={handleSublocalizacionSubmit}>
                    <div className="grid gap-5 md:grid-cols-2">
                      <label><FieldLabel>ID de sublocalizacion</FieldLabel><input value={sublocalizacionForm.id_sublocalizacion} onChange={(event) => setSublocalizacionForm((prev) => ({ ...prev, id_sublocalizacion: event.target.value }))} maxLength={10} className={cardInputClass()} required /></label>
                      <label><FieldLabel>Nombre</FieldLabel><input value={sublocalizacionForm.nombre_sublocalizacion} onChange={(event) => setSublocalizacionForm((prev) => ({ ...prev, nombre_sublocalizacion: event.target.value }))} maxLength={100} className={cardInputClass()} required /></label>
                    </div>
                    <label className="block"><FieldLabel>Edificio asociado</FieldLabel><select value={sublocalizacionForm.id_edificio} onChange={(event) => setSublocalizacionForm((prev) => ({ ...prev, id_edificio: event.target.value }))} className={cardInputClass()} required><option value="">Selecciona un edificio</option>{edificios.map((item) => <option key={item.id_edificio} value={item.id_edificio}>{item.nombre_edificio}</option>)}</select></label>
                    <button type="submit" disabled={submitting} className="rounded-xl bg-[#001f3f] px-6 py-4 text-sm font-bold text-white shadow-md transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-70">Guardar Sublocalizacion</button>
                  </form>
                </section>
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-xl font-bold text-slate-900">Mapa de sublocalizaciones</h3>
                  <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">ID</th><th className="px-4 py-3">Sublocalizacion</th><th className="px-4 py-3">Edificio</th><th className="pl-6 pr-8 py-3 text-left">Accion</th></tr></thead>
                      <tbody className="divide-y divide-slate-200 bg-white">{sublocalizaciones.map((item) => <tr key={item.id_sublocalizacion} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium text-slate-900">{item.id_sublocalizacion}</td><td className="px-4 py-3 text-slate-700">{item.nombre_sublocalizacion}</td><td className="px-4 py-3 text-slate-700">{edificios.find((edificio) => edificio.id_edificio === item.id_edificio)?.nombre_edificio || item.id_edificio}</td><td className="pl-6 pr-8 py-3 text-left"><ActionButtons /></td></tr>)}</tbody>
                    </table>
                  </div>
                </section>
              </div>
            ) : null}

            {!loading && activeView === "catalogo-ci" ? (
              <div className="space-y-8">
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-bold text-[#001f3f]">Catalogo de CIs</h2>
                      <p className="mt-1 text-sm text-slate-600">Formulario con selector dependiente y prefijo automatico.</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">Flujo: edificio - sublocalizacion - elemento</div>
                  </div>
                  <form className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" onSubmit={handleCiSubmit}>
                    <label><FieldLabel>Tipo de CI</FieldLabel><div className="relative"><Wrench className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><select value={ciForm.id_tipo_ci} onChange={(event) => setCiForm((prev) => ({ ...prev, id_tipo_ci: event.target.value }))} className={`${cardInputClass()} pl-12`} required><option value="">Selecciona un tipo</option>{catalogos.tipos_ci.map((item) => <option key={item.id_tipo_ci} value={item.id_tipo_ci}>{item.nombre_tipo}</option>)}</select></div></label>
                    <label><FieldLabel>ID del CI</FieldLabel><input value={ciForm.id_ci} onChange={handleCiIdInput} maxLength={10} placeholder={ciPrefix || "CI-000001"} disabled={!ciForm.id_tipo_ci} className={cardInputClass(!ciForm.id_tipo_ci)} /><span className="mt-2 block text-xs text-slate-500">Prefijo sugerido: {ciPrefix || "Selecciona un tipo"} | {ciForm.id_ci.length}/10</span></label>
                    <label><FieldLabel>Numero de serie</FieldLabel><input value={ciForm.numero_serie} onChange={(event) => setCiForm((prev) => ({ ...prev, numero_serie: event.target.value }))} maxLength={50} className={cardInputClass()} required /></label>
                    <label><FieldLabel>Nombre del equipo</FieldLabel><input value={ciForm.nombre_equipo} onChange={(event) => setCiForm((prev) => ({ ...prev, nombre_equipo: event.target.value }))} maxLength={100} className={cardInputClass()} /></label>
                    <label><FieldLabel>Modelo</FieldLabel><input value={ciForm.modelo} onChange={(event) => setCiForm((prev) => ({ ...prev, modelo: event.target.value }))} maxLength={100} className={cardInputClass()} /></label>
                    <label><FieldLabel>Estado</FieldLabel><select value={ciForm.estado} disabled className={cardInputClass(true)}><option value="Activo">Activo</option></select></label>
                    <label><FieldLabel>Marca</FieldLabel><select value={ciForm.id_marca} onChange={(event) => setCiForm((prev) => ({ ...prev, id_marca: event.target.value }))} className={cardInputClass()} required><option value="">Selecciona una marca</option>{catalogos.marcas.map((item) => <option key={item.id_marca} value={item.id_marca}>{item.nombre_marca}</option>)}</select></label>
                    <label><FieldLabel>Edificio</FieldLabel><select value={ciForm.id_edificio} onChange={(event) => setCiForm((prev) => ({ ...prev, id_edificio: event.target.value }))} className={cardInputClass()} required><option value="">Selecciona un edificio</option>{catalogos.edificios.map((item) => <option key={item.id_edificio} value={item.id_edificio}>{item.nombre_edificio}</option>)}</select></label>
                    <label><FieldLabel>Sublocalizacion</FieldLabel><select value={ciForm.id_sublocalizacion} onChange={(event) => setCiForm((prev) => ({ ...prev, id_sublocalizacion: event.target.value }))} className={cardInputClass(!ciForm.id_edificio)} disabled={!ciForm.id_edificio} required><option value="">{ciForm.id_edificio ? "Selecciona una sublocalizacion" : "Primero selecciona un edificio"}</option>{sublocalizacionesFiltradas.map((item) => <option key={item.id_sublocalizacion} value={item.id_sublocalizacion}>{item.nombre_sublocalizacion}</option>)}</select></label>
                    <label><FieldLabel>Usuario responsable</FieldLabel><div className="relative"><UserRound className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><select value={ciForm.id_usuario_responsable} onChange={(event) => setCiForm((prev) => ({ ...prev, id_usuario_responsable: event.target.value }))} className={`${cardInputClass()} pl-12`}><option value="">Sin asignar</option>{catalogos.usuarios.map((item) => <option key={item.id_usuario} value={item.id_usuario}>{item.nombre_completo}</option>)}</select></div></label>
                    <div className="md:col-span-2 xl:col-span-3"><button type="submit" disabled={submitting} className="rounded-xl bg-[#001f3f] px-6 py-4 text-sm font-bold text-white shadow-md transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-70">Registrar Elemento de Configuracion</button></div>
                  </form>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                    <div><h3 className="text-xl font-bold text-slate-900">Inventario registrado</h3><p className="mt-1 text-sm text-slate-600">Tabla con el mismo patron visual del modulo de tickets.</p></div>
                    <label className="relative min-w-[280px]"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={inventoryQuery} onChange={(event) => setInventoryQuery(event.target.value)} placeholder="Buscar por ID, serie, tipo o ubicacion" className={`${cardInputClass()} py-3 pl-11`} /></label>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-slate-200"><div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">ID CI</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Serie</th><th className="px-4 py-3">Equipo</th><th className="px-4 py-3">Marca</th><th className="px-4 py-3">Ubicacion</th><th className="px-4 py-3">Responsable</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Ingreso</th><th className="pl-6 pr-8 py-3 text-left">Accion</th></tr></thead><tbody className="divide-y divide-slate-200 bg-white">{inventoryRows.map((item) => <tr key={item.id_ci} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium text-slate-900">{item.id_ci}</td><td className="px-4 py-3 text-slate-700">{item.nombre_tipo}</td><td className="px-4 py-3 text-slate-700">{item.numero_serie}</td><td className="px-4 py-3 text-slate-700"><div className="font-medium text-slate-900">{item.nombre_equipo || "Sin nombre"}</div><div className="text-xs text-slate-500">{item.modelo || "Sin modelo"}</div></td><td className="px-4 py-3 text-slate-700">{item.nombre_marca}</td><td className="px-4 py-3 text-slate-700"><div className="font-medium text-slate-900">{item.nombre_edificio}</div><div className="text-xs text-slate-500">{item.nombre_sublocalizacion}</div></td><td className="px-4 py-3 text-slate-700">{item.usuario_responsable || "No asignado"}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getEstadoClasses(item.estado)}`}>{item.estado}</span></td><td className="px-4 py-3 text-slate-700">{formatDate(item.fecha_ingreso)}</td><td className="pl-6 pr-8 py-3 text-left"><ActionButtons /></td></tr>)}</tbody></table></div></div>
                  {inventoryRows.length === 0 ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">No hay activos que coincidan con la busqueda actual.</div> : null}
                </section>
              </div>
            ) : null}
          </section>
        </main>
      </div>
    </div>
  );
}
