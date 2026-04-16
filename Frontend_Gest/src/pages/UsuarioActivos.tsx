import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import {
  Boxes,
  Edit3,
  Filter,
  Search,
  Trash2,
  UserRound,
  Wrench,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { getToken } from "../auth/storage";
import { usuarioViewFromPath } from "./usuarioNavigation";

const API_BASE_URL = "http://localhost:4000/api";

type AssetsView = "gestion-edificios" | "aulas-laboratorios" | "catalogo-ci";

type Edificio = { id_edificio: string; nombre_edificio: string; descripcion_edificio: string };
type Sublocalizacion = { id_sublocalizacion: string; nombre_sublocalizacion: string; id_edificio: string };
type TipoCI = { id_tipo_ci: string; nombre_tipo: string };
type Marca = { id_marca: string; nombre_marca: string };
type UsuarioResponsable = { id_usuario: string; nombre_completo: string };
type InventarioCI = {
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
type CatalogosCI = {
  tipos_ci: TipoCI[];
  marcas: Marca[];
  edificios: Array<Pick<Edificio, "id_edificio" | "nombre_edificio">>;
  usuarios: UsuarioResponsable[];
};

const initialBuilding = { id_edificio: "", nombre_edificio: "", descripcion_edificio: "" };
const initialSub = { id_edificio: "", nombre_sublocalizacion: "", codigo_area: "" };
const initialCi = {
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

const headers = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const norm = (value: string, max = 4) =>
  value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, max);

const initialsFromName = (value: string) => {
  const fragments = value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  if (!fragments.length) return "";

  return fragments
    .map((fragment) => fragment[0])
    .join("")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
};

const inputClass = (disabled = false) =>
  `w-full rounded-xl border border-gray-300 px-4 py-4 text-sm text-gray-700 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-900 ${
    disabled ? "cursor-not-allowed bg-slate-100" : "bg-white"
  }`;

const Label = ({ children }: { children: string }) => (
  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-700">{children}</span>
);

const ActionButtons = () => (
  <div className="inline-flex items-center gap-2">
    <button type="button" className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200">
      <Edit3 className="h-4 w-4" />
      Editar
    </button>
    <button type="button" className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100">
      <Trash2 className="h-4 w-4" />
      Eliminar
    </button>
  </div>
);

const Preview = ({ text, value }: { text: string; value: string }) => (
  <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
    <span className="font-semibold">{text}</span> {value || "Pendiente"}
  </div>
);

const getEstadoClasses = (estado: string) =>
  estado === "Activo" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700";

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

export default function UsuarioActivos() {
  const location = useLocation();
  const activeView = usuarioViewFromPath(location.pathname) as AssetsView;
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [buildingForm, setBuildingForm] = useState(initialBuilding);
  const [subForm, setSubForm] = useState(initialSub);
  const [ciForm, setCiForm] = useState(initialCi);
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [sublocalizaciones, setSublocalizaciones] = useState<Sublocalizacion[]>([]);
  const [catalogos, setCatalogos] = useState<CatalogosCI>({ tipos_ci: [], marcas: [], edificios: [], usuarios: [] });
  const [inventario, setInventario] = useState<InventarioCI[]>([]);
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [filterBuilding, setFilterBuilding] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const deferredInventoryQuery = useDeferredValue(inventoryQuery.trim().toLowerCase());

  const generatedBuildingId = useMemo(
    () => initialsFromName(buildingForm.nombre_edificio),
    [buildingForm.nombre_edificio]
  );

  const buildingCode = useMemo(() => {
    const building = edificios.find((item) => item.id_edificio === subForm.id_edificio);
    return building ? norm(building.id_edificio, 4) || norm(building.nombre_edificio, 4) : "";
  }, [edificios, subForm.id_edificio]);

  const generatedSubId = `${buildingCode}${norm(subForm.codigo_area, 6)}`.slice(0, 10);

  const sublocalizacionesFiltradas = sublocalizaciones.filter((item) => item.id_edificio === ciForm.id_edificio);

  const typeCode = useMemo(() => {
    const tipo = catalogos.tipos_ci.find((item) => item.id_tipo_ci === ciForm.id_tipo_ci);
    return tipo ? norm(tipo.nombre_tipo, 4) : "";
  }, [catalogos.tipos_ci, ciForm.id_tipo_ci]);

  const locationCode = useMemo(() => {
    const sub = sublocalizaciones.find((item) => item.id_sublocalizacion === ciForm.id_sublocalizacion);
    return sub?.id_sublocalizacion || "";
  }, [ciForm.id_sublocalizacion, sublocalizaciones]);

  const ciCorrelative = useMemo(() => {
    if (!typeCode || !locationCode) return "01";
    const prefix = `${typeCode}-${locationCode}-`;
    const max = inventario.reduce((acc, item) => {
      if (!item.id_ci.startsWith(prefix)) return acc;
      const n = Number.parseInt(item.id_ci.slice(prefix.length), 10);
      return Number.isNaN(n) ? acc : Math.max(acc, n);
    }, 0);
    return String(max + 1).padStart(2, "0");
  }, [inventario, locationCode, typeCode]);

  const generatedCiId = typeCode && locationCode ? `${typeCode}-${locationCode}-${ciCorrelative}` : "";

  const inventoryRows = inventario.filter((item) => {
    if (filterBuilding && item.nombre_edificio !== filterBuilding) return false;
    if (filterTipo && item.nombre_tipo !== filterTipo) return false;
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

  useEffect(() => {
    if (
      ciForm.id_sublocalizacion &&
      !sublocalizacionesFiltradas.some((item) => item.id_sublocalizacion === ciForm.id_sublocalizacion)
    ) {
      setCiForm((prev) => ({ ...prev, id_sublocalizacion: "" }));
    }
  }, [ciForm.id_sublocalizacion, sublocalizacionesFiltradas]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMessage("");
      try {
        const [edificiosRes, catalogosRes, ciRes] = await Promise.all([
          axios.get<Edificio[]>(`${API_BASE_URL}/edificios`, { headers: headers() }),
          axios.get<CatalogosCI>(`${API_BASE_URL}/catalogos/ci`, { headers: headers() }),
          axios.get<InventarioCI[]>(`${API_BASE_URL}/ci`, { headers: headers() }),
        ]);
        setEdificios(edificiosRes.data);
        setCatalogos(catalogosRes.data);
        setInventario(ciRes.data);
        const subRes = await Promise.all(
          edificiosRes.data.map((item) =>
            axios.get<Sublocalizacion[]>(`${API_BASE_URL}/edificios/${item.id_edificio}/sublocalizaciones`, {
              headers: headers(),
            })
          )
        );
        setSublocalizaciones(subRes.flatMap((item) => item.data));
      } catch (error) {
        console.error(error);
        setErrorMessage("No se pudo cargar la gestion de activos.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const reload = async () => {
    const [edificiosRes, catalogosRes, ciRes] = await Promise.all([
      axios.get<Edificio[]>(`${API_BASE_URL}/edificios`, { headers: headers() }),
      axios.get<CatalogosCI>(`${API_BASE_URL}/catalogos/ci`, { headers: headers() }),
      axios.get<InventarioCI[]>(`${API_BASE_URL}/ci`, { headers: headers() }),
    ]);
    setEdificios(edificiosRes.data);
    setCatalogos(catalogosRes.data);
    setInventario(ciRes.data);
    const subRes = await Promise.all(
      edificiosRes.data.map((item) =>
        axios.get<Sublocalizacion[]>(`${API_BASE_URL}/edificios/${item.id_edificio}/sublocalizaciones`, {
          headers: headers(),
        })
      )
    );
    setSublocalizaciones(subRes.flatMap((item) => item.data));
  };

  const submitBuilding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");
    if (!generatedBuildingId) {
      setSubmitting(false);
      setErrorMessage("Escribe un nombre de edificio valido para generar el ID.");
      return;
    }
    try {
      await axios.post(
        `${API_BASE_URL}/edificios`,
        { ...buildingForm, id_edificio: generatedBuildingId },
        { headers: headers() }
      );
      setBuildingForm(initialBuilding);
      setStatusMessage(`Edificio registrado correctamente con ID ${generatedBuildingId}.`);
      await reload();
    } catch {
      setErrorMessage("No se pudo registrar el edificio.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitSub = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      await axios.post(
        `${API_BASE_URL}/sublocalizaciones`,
        {
          id_sublocalizacion: generatedSubId,
          nombre_sublocalizacion: subForm.nombre_sublocalizacion,
          id_edificio: subForm.id_edificio,
        },
        { headers: headers() }
      );
      setSubForm(initialSub);
      setStatusMessage(`Sublocalizacion registrada correctamente con ID ${generatedSubId}.`);
      await reload();
    } catch {
      setErrorMessage("No se pudo registrar la sublocalizacion.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitCi = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");
    if (!generatedCiId) {
      setSubmitting(false);
      setErrorMessage("Completa tipo y ubicacion para generar el ID del CI.");
      return;
    }
    try {
      await axios.post(`${API_BASE_URL}/ci`, { ...ciForm, id_ci: generatedCiId }, { headers: headers() });
      setCiForm(initialCi);
      setStatusMessage(`Elemento de configuracion registrado correctamente con ID ${generatedCiId}.`);
      await reload();
    } catch {
      setErrorMessage("No se pudo registrar el elemento de configuracion.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-10 rounded-[24px] bg-white p-8 text-slate-900 shadow-2xl md:p-10 xl:p-12">
            {statusMessage ? <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{statusMessage}</div> : null}
            {errorMessage ? <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}
            {loading ? <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">Cargando gestion de activos...</div> : null}

            {!loading && activeView === "gestion-edificios" ? (
              <div className="grid gap-8 xl:grid-cols-[1.1fr_1fr]">
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-2xl font-bold text-[#001f3f]">Gestion de Edificios</h2>
                  <form className="mt-6 space-y-5" onSubmit={submitBuilding}>
                    <div className="grid gap-5 md:grid-cols-2">
                      <label><Label>Nombre</Label><input value={buildingForm.nombre_edificio} onChange={(e) => setBuildingForm((p) => ({ ...p, nombre_edificio: e.target.value }))} maxLength={50} className={inputClass()} required /></label>
                      <label><Label>ID autogenerado</Label><input value={generatedBuildingId} readOnly className={inputClass(true)} /></label>
                    </div>
                    <label className="block"><Label>Descripcion</Label><textarea value={buildingForm.descripcion_edificio} onChange={(e) => setBuildingForm((p) => ({ ...p, descripcion_edificio: e.target.value }))} rows={4} className={`${inputClass()} min-h-[140px]`} required /></label>
                    <Preview text="El ID generado para este edificio sera:" value={generatedBuildingId} />
                    <button type="submit" disabled={submitting} className="rounded-xl bg-[#001f3f] px-6 py-4 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-70">Guardar Edificio</button>
                  </form>
                </section>
                <section className="w-full max-w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-xl font-bold text-slate-900">Edificios registrados</h3>
                  <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">ID</th><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Descripcion</th><th className="pl-6 pr-8 py-3 text-left">Accion</th></tr></thead>
                      <tbody className="divide-y divide-slate-200 bg-white">{edificios.map((item) => <tr key={item.id_edificio}><td className="px-4 py-3 font-medium">{item.id_edificio}</td><td className="px-4 py-3">{item.nombre_edificio}</td><td className="px-4 py-3">{item.descripcion_edificio}</td><td className="pl-6 pr-8 py-3"><ActionButtons /></td></tr>)}</tbody>
                    </table>
                  </div>
                </section>
              </div>
            ) : null}

            {!loading && activeView === "aulas-laboratorios" ? (
              <div className="grid gap-8 xl:grid-cols-[1.05fr_1fr]">
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-2xl font-bold text-[#001f3f]">Aulas y Laboratorios</h2>
                  <form className="mt-6 space-y-5" onSubmit={submitSub}>
                    <div className="grid gap-5 md:grid-cols-2">
                      <label><Label>Edificio asociado</Label><select value={subForm.id_edificio} onChange={(e) => setSubForm((p) => ({ ...p, id_edificio: e.target.value }))} className={inputClass()} required><option value="">Selecciona un edificio</option>{edificios.map((item) => <option key={item.id_edificio} value={item.id_edificio}>{item.nombre_edificio}</option>)}</select></label>
                      <label><Label>Codigo de aula o tipo</Label><input value={subForm.codigo_area} onChange={(e) => setSubForm((p) => ({ ...p, codigo_area: e.target.value }))} maxLength={6} className={inputClass()} required /></label>
                    </div>
                    <label className="block"><Label>Nombre</Label><input value={subForm.nombre_sublocalizacion} onChange={(e) => setSubForm((p) => ({ ...p, nombre_sublocalizacion: e.target.value }))} className={inputClass()} required /></label>
                    <label className="block"><Label>ID autogenerado</Label><input value={generatedSubId} readOnly className={inputClass(true)} /></label>
                    <Preview text="El ID generado para esta sublocalizacion sera:" value={generatedSubId} />
                    <button type="submit" disabled={submitting} className="rounded-xl bg-[#001f3f] px-6 py-4 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-70">Guardar Sublocalizacion</button>
                  </form>
                </section>
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-xl font-bold text-slate-900">Sublocalizaciones registradas</h3>
                  <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">ID</th><th className="px-4 py-3">Sublocalizacion</th><th className="px-4 py-3">Edificio</th><th className="pl-6 pr-8 py-3 text-left">Accion</th></tr></thead>
                      <tbody className="divide-y divide-slate-200 bg-white">{sublocalizaciones.map((item) => <tr key={item.id_sublocalizacion}><td className="px-4 py-3 font-medium">{item.id_sublocalizacion}</td><td className="px-4 py-3">{item.nombre_sublocalizacion}</td><td className="px-4 py-3">{edificios.find((edificio) => edificio.id_edificio === item.id_edificio)?.nombre_edificio || item.id_edificio}</td><td className="pl-6 pr-8 py-3"><ActionButtons /></td></tr>)}</tbody>
                    </table>
                  </div>
                </section>
              </div>
            ) : null}

            {!loading && activeView === "catalogo-ci" ? (
              <div className="space-y-8">
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold text-[#001f3f]">Catalogo de CIs</h2>
                    <p className="mt-1 text-sm text-slate-600">Patron [TIPO]-[UBICACION]-[CORRELATIVO] con vista previa.</p>
                  </div>
                  <form className="mt-6 space-y-5" onSubmit={submitCi}>
                    <div className="grid gap-5 xl:grid-cols-2">
                      <label><Label>Tipo de CI</Label><div className="relative"><Wrench className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><select value={ciForm.id_tipo_ci} onChange={(e) => setCiForm((p) => ({ ...p, id_tipo_ci: e.target.value }))} className={`${inputClass()} pl-12`} required><option value="">Selecciona un tipo</option>{catalogos.tipos_ci.map((item) => <option key={item.id_tipo_ci} value={item.id_tipo_ci}>{item.nombre_tipo}</option>)}</select></div></label>
                      <label><Label>Edificio</Label><select value={ciForm.id_edificio} onChange={(e) => setCiForm((p) => ({ ...p, id_edificio: e.target.value }))} className={inputClass()} required><option value="">Selecciona un edificio</option>{catalogos.edificios.map((item) => <option key={item.id_edificio} value={item.id_edificio}>{item.nombre_edificio}</option>)}</select></label>
                    </div>
                    <div className="grid gap-5 xl:grid-cols-2">
                      <label><Label>Sublocalizacion</Label><select value={ciForm.id_sublocalizacion} onChange={(e) => setCiForm((p) => ({ ...p, id_sublocalizacion: e.target.value }))} className={inputClass(!ciForm.id_edificio)} disabled={!ciForm.id_edificio} required><option value="">{ciForm.id_edificio ? "Selecciona una sublocalizacion" : "Primero selecciona un edificio"}</option>{sublocalizacionesFiltradas.map((item) => <option key={item.id_sublocalizacion} value={item.id_sublocalizacion}>{item.nombre_sublocalizacion}</option>)}</select></label>
                      <label><Label>Marca</Label><select value={ciForm.id_marca} onChange={(e) => setCiForm((p) => ({ ...p, id_marca: e.target.value }))} className={inputClass()} required><option value="">Selecciona una marca</option>{catalogos.marcas.map((item) => <option key={item.id_marca} value={item.id_marca}>{item.nombre_marca}</option>)}</select></label>
                    </div>
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      <label><Label>ID autogenerado</Label><input value={generatedCiId} readOnly className={inputClass(true)} /></label>
                      <label><Label>Numero de serie</Label><input value={ciForm.numero_serie} onChange={(e) => setCiForm((p) => ({ ...p, numero_serie: e.target.value }))} className={inputClass()} required /></label>
                    </div>
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      <label><Label>Correlativo sugerido</Label><input value={ciCorrelative} readOnly className={inputClass(true)} /></label>
                      <label><Label>Estado</Label><select value={ciForm.estado} disabled className={inputClass(true)}><option value="Activo">Activo</option></select></label>
                    </div>
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      <label><Label>Nombre del equipo</Label><input value={ciForm.nombre_equipo} onChange={(e) => setCiForm((p) => ({ ...p, nombre_equipo: e.target.value }))} className={inputClass()} /></label>
                      <label><Label>Modelo</Label><input value={ciForm.modelo} onChange={(e) => setCiForm((p) => ({ ...p, modelo: e.target.value }))} className={inputClass()} /></label>
                    </div>
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      <label><Label>Usuario responsable</Label><div className="relative"><UserRound className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><select value={ciForm.id_usuario_responsable} onChange={(e) => setCiForm((p) => ({ ...p, id_usuario_responsable: e.target.value }))} className={`${inputClass()} pl-12`}><option value="">Sin asignar</option>{catalogos.usuarios.map((item) => <option key={item.id_usuario} value={item.id_usuario}>{item.nombre_completo}</option>)}</select></div></label>
                      <div />
                    </div>
                    <Preview text="El ID generado para este activo sera:" value={generatedCiId} />
                    <button type="submit" disabled={submitting} className="rounded-xl bg-[#001f3f] px-6 py-4 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-70">Registrar Elemento de Configuracion</button>
                  </form>
                </section>

                <section className="w-full max-w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-4">
                    <h3 className="text-xl font-bold text-slate-900">Inventario registrado</h3>
                    <p className="mt-1 text-sm text-slate-600">Misma estructura visual que la vista de edificios.</p>
                  </div>
                  <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <label className="relative md:min-w-0"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={inventoryQuery} onChange={(e) => setInventoryQuery(e.target.value)} placeholder="Buscar por ID, serie, tipo o ubicacion" className={`${inputClass()} py-3 pl-11`} /></label>
                    <label className="relative"><Filter className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><select value={filterBuilding} onChange={(e) => setFilterBuilding(e.target.value)} className={`${inputClass()} py-3 pl-11`}><option value="">Todos los edificios</option>{[...new Set(inventario.map((item) => item.nombre_edificio))].map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
                    <label className="relative"><Boxes className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} className={`${inputClass()} py-3 pl-11`}><option value="">Todos los tipos</option>{[...new Set(inventario.map((item) => item.nombre_tipo))].map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
                  </div>
                  {!inventoryRows.length ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      No hay CIs registrados con los filtros actuales.
                    </div>
                  ) : null}
                  <div className="hidden w-full max-w-full overflow-hidden rounded-xl border border-slate-200 lg:block">
                    <div className="w-full max-w-full overflow-x-auto">
                      <table className="w-full min-w-[860px] text-left text-[0.85rem]">
                        <thead className="bg-slate-100 text-[11px] uppercase text-slate-500"><tr><th className="px-3 py-2.5">ID CI</th><th className="px-3 py-2.5">Tipo</th><th className="px-3 py-2.5">Serie</th><th className="px-3 py-2.5">Equipo</th><th className="px-3 py-2.5">Marca</th><th className="px-3 py-2.5">Ubicacion</th><th className="px-3 py-2.5">Estado</th><th className="px-4 py-2.5 text-left">Accion</th></tr></thead>
                        <tbody className="divide-y divide-slate-200 bg-white">{inventoryRows.map((item) => <tr key={item.id_ci}><td className="px-3 py-2.5 font-medium">{item.id_ci}</td><td className="px-3 py-2.5">{item.nombre_tipo}</td><td className="px-3 py-2.5">{item.numero_serie}</td><td className="px-3 py-2.5"><div className="font-medium">{item.nombre_equipo || "Sin nombre"}</div><div className="text-xs text-slate-500">{item.modelo || "Sin modelo"}</div></td><td className="px-3 py-2.5">{item.nombre_marca}</td><td className="px-3 py-2.5"><div className="font-medium">{item.nombre_edificio}</div><div className="text-xs text-slate-500">{item.nombre_sublocalizacion}</div></td><td className="px-3 py-2.5"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${getEstadoClasses(item.estado)}`}>{item.estado}</span></td><td className="px-4 py-2.5"><ActionButtons /></td></tr>)}</tbody>
                      </table>
                    </div>
                  </div>
                  <div className="grid gap-4 lg:hidden">
                    {inventoryRows.map((item) => (
                      <article key={item.id_ci} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div><h4 className="font-bold text-slate-900">{item.id_ci}</h4><p className="text-sm text-slate-600">{item.nombre_tipo}</p></div>
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getEstadoClasses(item.estado)}`}>{item.estado}</span>
                        </div>
                        <div className="mt-4 grid gap-2 text-sm text-slate-700">
                          <p><strong className="text-slate-900">Serie:</strong> {item.numero_serie}</p>
                          <p><strong className="text-slate-900">Equipo:</strong> {item.nombre_equipo || "Sin nombre"}</p>
                          <p><strong className="text-slate-900">Modelo:</strong> {item.modelo || "Sin modelo"}</p>
                          <p><strong className="text-slate-900">Marca:</strong> {item.nombre_marca}</p>
                          <p><strong className="text-slate-900">Edificio:</strong> {item.nombre_edificio}</p>
                          <p><strong className="text-slate-900">Sublocalizacion:</strong> {item.nombre_sublocalizacion}</p>
                          <p><strong className="text-slate-900">Responsable:</strong> {item.usuario_responsable || "No asignado"}</p>
                          <p><strong className="text-slate-900">Ingreso:</strong> {formatDate(item.fecha_ingreso)}</p>
                        </div>
                        <div className="mt-4"><ActionButtons /></div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}
    </section>
  );
}
