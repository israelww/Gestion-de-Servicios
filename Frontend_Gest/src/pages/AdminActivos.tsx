import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import {
  Boxes,
  ClipboardList,
  Edit3,
  Filter,
  Search,
  Trash2,
  UserRound,
  Wrench,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { getToken } from "../auth/storage";
import { adminViewFromPath } from "./adminNavigation";

const API_BASE_URL = "http://localhost:4000/api";

type AssetsView = "gestion-infraestructura" | "catalogo-ci";

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
  id_tipo_ci: string;
  id_marca: string;
  id_sublocalizacion: string;
  id_usuario_responsable: string | null;
  nombre_tipo: string;
  nombre_marca: string;
  nombre_sublocalizacion: string;
  nombre_edificio: string;
  usuario_responsable: string | null;
  especificaciones_hardware?: string | null;
};
type CatalogosCI = {
  tipos_ci: TipoCI[];
  marcas: Marca[];
  edificios: Array<Pick<Edificio, "id_edificio" | "nombre_edificio">>;
  usuarios: UsuarioResponsable[];
};
type HistorialCambioCI = {
  id_historial: number;
  id_ci: string;
  id_mantenimiento: string | null;
  fecha_cambio: string;
  numero_transaccion: string | null;
  origen_transaccion: string | null;
  tecnico: string;
  detalle_cambio: string;
  fecha_registro: string;
};

const DESKTOP_TIPO_CI_ID = "T04";

/** Los ids CHAR(n) de SQL Server llegan con espacios de relleno; normalizar antes de comparar o enviar. */
const trimTipoCiId = (id: string) => id.trim();
const isDesktopTipoCiId = (id: string) => trimTipoCiId(id) === DESKTOP_TIPO_CI_ID;

type DesktopHardwareInterno = {
  procesador: string;
  placaMadre: string;
  ram: string;
  almacenamientoPrincipal: string;
  almacenamientoSecundario: string;
  gpu: string;
  fuentePoder: string;
  gabinete: string;
  refrigeracion: string;
  redCableada: string;
};

type DesktopHardwareSpecs = {
  interno: DesktopHardwareInterno;
};

const emptyDesktopHardwareSpecs = (): DesktopHardwareSpecs => ({
  interno: {
    procesador: "",
    placaMadre: "",
    ram: "",
    almacenamientoPrincipal: "",
    almacenamientoSecundario: "",
    gpu: "",
    fuentePoder: "",
    gabinete: "",
    refrigeracion: "",
    redCableada: "",
  },
});

const parseDesktopHardwareFromApi = (raw: string | null | undefined): DesktopHardwareSpecs => {
  const base = emptyDesktopHardwareSpecs();
  if (!raw || typeof raw !== "string") return base;
  try {
    const parsed = JSON.parse(raw) as Partial<DesktopHardwareSpecs>;
    if (!parsed || typeof parsed !== "object") return base;
    if (parsed.interno && typeof parsed.interno === "object") {
      Object.assign(base.interno, parsed.interno);
    }
    return base;
  } catch {
    return base;
  }
};

const DESKTOP_HW_INTERNO_FIELDS: { key: keyof DesktopHardwareInterno; label: string }[] = [
  { key: "procesador", label: "Procesador (CPU)" },
  { key: "placaMadre", label: "Placa base" },
  { key: "ram", label: "Memoria RAM" },
  { key: "almacenamientoPrincipal", label: "Almacenamiento principal" },
  { key: "almacenamientoSecundario", label: "Almacenamiento secundario" },
  { key: "gpu", label: "GPU / Video" },
  { key: "fuentePoder", label: "Fuente de poder" },
  { key: "gabinete", label: "Gabinete" },
  { key: "refrigeracion", label: "Refrigeracion" },
  { key: "redCableada", label: "Red (cableada / NIC)" },
];

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

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === "string" && message.trim()) return message;
    const status = error.response?.status;
    if (status === 401 || status === 403) return "No autorizado";
  }
  return fallback;
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

const ActionButtons = ({
  onEdit,
  onDelete,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
}) => (
  <div className="inline-flex items-center gap-2">
    <button
      type="button"
      onClick={onEdit}
      disabled={!onEdit}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
        onEdit
          ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
          : "cursor-not-allowed bg-slate-50 text-slate-400"
      }`}
    >
      <Edit3 className="h-4 w-4" />
      Editar
    </button>
    <button
      type="button"
      onClick={onDelete}
      disabled={!onDelete}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
        onDelete
          ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
          : "cursor-not-allowed bg-rose-50/60 text-rose-300"
      }`}
    >
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

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export default function AdminActivos() {
  const location = useLocation();
  const activeView = adminViewFromPath(location.pathname) as AssetsView;
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [buildingForm, setBuildingForm] = useState(initialBuilding);
  const [editingBuildingId, setEditingBuildingId] = useState<string | null>(null);
  const [subForm, setSubForm] = useState(initialSub);
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [ciForm, setCiForm] = useState(initialCi);
  const [hardwareSpecs, setHardwareSpecs] = useState<DesktopHardwareSpecs>(() => emptyDesktopHardwareSpecs());
  const [editingCiId, setEditingCiId] = useState<string | null>(null);
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [sublocalizaciones, setSublocalizaciones] = useState<Sublocalizacion[]>([]);
  const [catalogos, setCatalogos] = useState<CatalogosCI>({ tipos_ci: [], marcas: [], edificios: [], usuarios: [] });
  const [inventario, setInventario] = useState<InventarioCI[]>([]);
  const [selectedCiHistorial, setSelectedCiHistorial] = useState<InventarioCI | null>(null);
  const [historialCambios, setHistorialCambios] = useState<HistorialCambioCI[]>([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [creatingPreventivo, setCreatingPreventivo] = useState(false);
  const [preventivoDescripcion, setPreventivoDescripcion] = useState("");
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [filterBuilding, setFilterBuilding] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const deferredInventoryQuery = useDeferredValue(inventoryQuery.trim().toLowerCase());

  const generatedBuildingId = useMemo(
    () => initialsFromName(buildingForm.nombre_edificio),
    [buildingForm.nombre_edificio]
  );
  const displayBuildingId = editingBuildingId ?? generatedBuildingId;

  const buildingCode = useMemo(() => {
    const building = edificios.find((item) => item.id_edificio === subForm.id_edificio);
    return building ? norm(building.id_edificio, 4) || norm(building.nombre_edificio, 4) : "";
  }, [edificios, subForm.id_edificio]);

  const generatedSubId = `${buildingCode}${norm(subForm.codigo_area, 6)}`.slice(0, 10);
  const displaySubId = editingSubId ?? generatedSubId;
  const isEditingSub = Boolean(editingSubId);

  const sublocalizacionesFiltradas = sublocalizaciones.filter((item) => item.id_edificio === ciForm.id_edificio);

  const typeCode = useMemo(() => {
    const tid = trimTipoCiId(ciForm.id_tipo_ci);
    const tipo = catalogos.tipos_ci.find((item) => trimTipoCiId(item.id_tipo_ci) === tid);
    return tipo ? norm(tipo.nombre_tipo, 4) : "";
  }, [catalogos.tipos_ci, ciForm.id_tipo_ci]);

  const cleanId = (value: string) => value.trim();

  const locationCode = useMemo(() => {
    const sub = sublocalizaciones.find((item) => item.id_sublocalizacion === ciForm.id_sublocalizacion);
    return sub ? cleanId(sub.id_sublocalizacion) : "";
  }, [ciForm.id_sublocalizacion, sublocalizaciones]);

  const ciCorrelative = useMemo(() => {
    if (!typeCode || !locationCode) return "01";
    const prefix = `${typeCode}-${locationCode}-`;
    const max = inventario.reduce((acc, item) => {
      const trimmedId = cleanId(item.id_ci);
      if (!trimmedId.startsWith(prefix)) return acc;
      const n = Number.parseInt(trimmedId.slice(prefix.length), 10);
      return Number.isNaN(n) ? acc : Math.max(acc, n);
    }, 0);
    return String(max + 1).padStart(2, "0");
  }, [inventario, locationCode, typeCode]);

  const generatedCiId = typeCode && locationCode ? `${typeCode}-${locationCode}-${ciCorrelative}` : "";
  const displayCiId = editingCiId ?? generatedCiId;
  const isEditingCi = Boolean(editingCiId);
  const isDesktopCi = isDesktopTipoCiId(ciForm.id_tipo_ci);

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
        setErrorMessage(getApiErrorMessage(error, "No se pudo cargar la gestion de activos."));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  useEffect(() => {
    if (!errorMessage) return;
    const timer = window.setTimeout(() => setErrorMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [errorMessage]);

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
    if (!editingBuildingId && !generatedBuildingId) {
      setSubmitting(false);
      setErrorMessage("Escribe un nombre de edificio valido para generar el ID.");
      return;
    }
    try {
      if (editingBuildingId) {
        await axios.put(
          `${API_BASE_URL}/edificios/${editingBuildingId}`,
          {
            nombre_edificio: buildingForm.nombre_edificio,
            descripcion_edificio: buildingForm.descripcion_edificio,
          },
          { headers: headers() }
        );
        setStatusMessage("Edificio actualizado correctamente.");
      } else {
        await axios.post(
          `${API_BASE_URL}/edificios`,
          { ...buildingForm, id_edificio: generatedBuildingId },
          { headers: headers() }
        );
        setStatusMessage(`Edificio registrado correctamente con ID ${generatedBuildingId}.`);
      }
      setBuildingForm(initialBuilding);
      setEditingBuildingId(null);
      await reload();
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(
          error,
          editingBuildingId ? "No se pudo actualizar el edificio." : "No se pudo registrar el edificio."
        )
      );
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
      if (editingSubId) {
        await axios.put(
          `${API_BASE_URL}/sublocalizaciones/${editingSubId}`,
          {
            nombre_sublocalizacion: subForm.nombre_sublocalizacion,
          },
          { headers: headers() }
        );
        setStatusMessage("Sublocalizacion actualizada correctamente.");
      } else {
        await axios.post(
          `${API_BASE_URL}/sublocalizaciones`,
          {
            id_sublocalizacion: generatedSubId,
            nombre_sublocalizacion: subForm.nombre_sublocalizacion,
            id_edificio: subForm.id_edificio,
          },
          { headers: headers() }
        );
        setStatusMessage(`Sublocalizacion registrada correctamente con ID ${generatedSubId}.`);
      }
      setSubForm(initialSub);
      setEditingSubId(null);
      await reload();
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(
          error,
          editingSubId
            ? "No se pudo actualizar la sublocalizacion."
            : "No se pudo registrar la sublocalizacion."
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  const submitCi = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");
    if (!editingCiId && !generatedCiId) {
      setSubmitting(false);
      setErrorMessage("Completa tipo y ubicacion para generar el ID del CI.");
      return;
    }
    try {
      const hardwarePayload =
        isDesktopCi ? { especificaciones_hardware: hardwareSpecs } : {};
      if (editingCiId) {
        await axios.put(
          `${API_BASE_URL}/ci/${editingCiId}`,
          {
            numero_serie: ciForm.numero_serie,
            nombre_equipo: ciForm.nombre_equipo,
            modelo: ciForm.modelo,
            id_marca: ciForm.id_marca,
            id_usuario_responsable: ciForm.id_usuario_responsable,
            ...hardwarePayload,
          },
          { headers: headers() }
        );
        setStatusMessage("Elemento de configuracion actualizado correctamente.");
      } else {
        await axios.post(
          `${API_BASE_URL}/ci`,
          { ...ciForm, id_ci: generatedCiId, ...hardwarePayload },
          { headers: headers() }
        );
        setStatusMessage(`Elemento de configuracion registrado correctamente con ID ${generatedCiId}.`);
      }
      setCiForm(initialCi);
      setHardwareSpecs(emptyDesktopHardwareSpecs());
      setEditingCiId(null);
      await reload();
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(
          error,
          editingCiId
            ? "No se pudo actualizar el elemento de configuracion."
            : "No se pudo registrar el elemento de configuracion."
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  const loadHistorialCambios = async (idCi: string) => {
    setHistorialLoading(true);
    try {
      const response = await axios.get<HistorialCambioCI[]>(
        `${API_BASE_URL}/ci/${cleanId(idCi)}/historial-cambios`,
        { headers: headers() }
      );
      setHistorialCambios(response.data || []);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudo cargar el historial de cambios."));
    } finally {
      setHistorialLoading(false);
    }
  };

  const openHistorialModal = async (item: InventarioCI) => {
    setSelectedCiHistorial(item);
    setHistorialCambios([]);
    setPreventivoDescripcion("");
    setStatusMessage("");
    setErrorMessage("");
    await loadHistorialCambios(item.id_ci);
  };

  const closeHistorialModal = () => {
    setSelectedCiHistorial(null);
    setHistorialCambios([]);
    setPreventivoDescripcion("");
  };

  const beginEditCi = (item: InventarioCI) => {
    const sub = sublocalizaciones.find((s) => s.id_sublocalizacion === item.id_sublocalizacion);
    const edificioId = sub?.id_edificio || "";
    setCiForm({
      numero_serie: item.numero_serie,
      nombre_equipo: item.nombre_equipo || "",
      modelo: item.modelo || "",
      estado: item.estado,
      id_tipo_ci: trimTipoCiId(item.id_tipo_ci),
      id_marca: item.id_marca,
      id_edificio: edificioId,
      id_sublocalizacion: item.id_sublocalizacion,
      id_usuario_responsable: item.id_usuario_responsable || "",
    });
    if (isDesktopTipoCiId(item.id_tipo_ci)) {
      setHardwareSpecs(parseDesktopHardwareFromApi(item.especificaciones_hardware));
    } else {
      setHardwareSpecs(emptyDesktopHardwareSpecs());
    }
    setEditingCiId(cleanId(item.id_ci));
    setStatusMessage("");
    setErrorMessage("");
  };

  const submitTicketPreventivo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCiHistorial) return;

    setCreatingPreventivo(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      await axios.post(
        `${API_BASE_URL}/admin/ci/${cleanId(selectedCiHistorial.id_ci)}/ticket-preventivo`,
        { descripcion_tarea: preventivoDescripcion },
        { headers: headers() }
      );
      setPreventivoDescripcion("");
      setStatusMessage("Ticket preventivo creado y registrado en el historial.");
      await loadHistorialCambios(selectedCiHistorial.id_ci);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudo crear el ticket preventivo."));
    } finally {
      setCreatingPreventivo(false);
    }
  };

  return (
    <section className="mt-10 rounded-[24px] bg-white p-8 text-slate-900 shadow-2xl md:p-10 xl:p-12">
            {statusMessage ? <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{statusMessage}</div> : null}
            {errorMessage ? <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}
            {loading ? <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">Cargando gestion de activos...</div> : null}

            {!loading && activeView === "gestion-infraestructura" ? (
              <div className="space-y-8">
                <div className="infrastructure-grid-row">
                  <section className="infrastructure-card">
                    <h2 className="text-2xl font-bold text-[#001f3f]">Gestion de Edificios</h2>
                    <form className="mt-6 space-y-5" onSubmit={submitBuilding}>
                      <div className="grid gap-5 md:grid-cols-2">
                        <label><Label>Nombre</Label><input value={buildingForm.nombre_edificio} onChange={(e) => setBuildingForm((p) => ({ ...p, nombre_edificio: e.target.value }))} maxLength={50} className={inputClass()} required /></label>
                      <label><Label>ID autogenerado</Label><input value={displayBuildingId} readOnly className={inputClass(true)} /></label>
                    </div>
                      <label className="block"><Label>Descripcion</Label><textarea value={buildingForm.descripcion_edificio} onChange={(e) => setBuildingForm((p) => ({ ...p, descripcion_edificio: e.target.value }))} rows={4} className={`${inputClass()} min-h-[140px]`} required /></label>
                      <Preview text="El ID generado para este edificio sera:" value={displayBuildingId} />
                      <div className="flex flex-wrap gap-3">
                        <button type="submit" disabled={submitting} className="rounded-xl bg-[#001f3f] px-6 py-4 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-70">
                          {editingBuildingId ? "Actualizar Edificio" : "Guardar Edificio"}
                        </button>
                        {editingBuildingId ? (
                          <button
                            type="button"
                            className="rounded-xl border border-slate-300 px-6 py-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                            onClick={() => {
                              setBuildingForm(initialBuilding);
                              setEditingBuildingId(null);
                              setStatusMessage("");
                              setErrorMessage("");
                            }}
                          >
                            Cancelar
                          </button>
                        ) : null}
                      </div>
                    </form>
                  </section>
                  <section className="infrastructure-card">
                    <h3 className="text-xl font-bold text-slate-900">Edificios registrados</h3>
                    <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">ID</th><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Descripcion</th><th className="pl-6 pr-8 py-3 text-left">Accion</th></tr></thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                          {edificios.map((item) => (
                            <tr key={item.id_edificio}>
                              <td className="px-4 py-3 font-medium">{item.id_edificio}</td>
                              <td className="px-4 py-3">{item.nombre_edificio}</td>
                              <td className="px-4 py-3">{item.descripcion_edificio}</td>
                              <td className="pl-6 pr-8 py-3">
                                <ActionButtons
                                  onEdit={() => {
                                    setBuildingForm({
                                      id_edificio: item.id_edificio,
                                      nombre_edificio: item.nombre_edificio,
                                      descripcion_edificio: item.descripcion_edificio,
                                    });
                                    setEditingBuildingId(item.id_edificio);
                                    setStatusMessage("");
                                    setErrorMessage("");
                                  }}
                                  onDelete={async () => {
                                    if (!window.confirm("Eliminar este edificio? Esta accion no se puede deshacer.")) {
                                      return;
                                    }
                                    try {
                                      await axios.delete(`${API_BASE_URL}/edificios/${item.id_edificio}`, {
                                        headers: headers(),
                                      });
                                      setStatusMessage("Edificio eliminado correctamente.");
                                      await reload();
                                    } catch (error) {
                                      setErrorMessage(
                                        getApiErrorMessage(error, "No se pudo eliminar el edificio.")
                                      );
                                    }
                                  }}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
                <div className="infrastructure-grid-row">
                  <section className="infrastructure-card">
                    <h2 className="text-2xl font-bold text-[#001f3f]">Aulas y Laboratorios</h2>
                    <form className="mt-6 space-y-5" onSubmit={submitSub}>
                      <div className="grid gap-5 md:grid-cols-2">
                        <label><Label>Edificio asociado</Label><select value={subForm.id_edificio} onChange={(e) => setSubForm((p) => ({ ...p, id_edificio: e.target.value }))} className={inputClass(isEditingSub)} disabled={isEditingSub} required><option value="">Selecciona un edificio</option>{edificios.map((item) => <option key={item.id_edificio} value={item.id_edificio}>{item.nombre_edificio}</option>)}</select></label>
                        <label><Label>Codigo de aula o tipo</Label><input value={subForm.codigo_area} onChange={(e) => setSubForm((p) => ({ ...p, codigo_area: e.target.value }))} maxLength={6} className={inputClass(isEditingSub)} disabled={isEditingSub} required /></label>
                      </div>
                      <label className="block"><Label>Nombre</Label><input value={subForm.nombre_sublocalizacion} onChange={(e) => setSubForm((p) => ({ ...p, nombre_sublocalizacion: e.target.value }))} className={inputClass()} required /></label>
                      <label className="block"><Label>ID autogenerado</Label><input value={displaySubId} readOnly className={inputClass(true)} /></label>
                      <Preview text="El ID generado para esta sublocalizacion sera:" value={displaySubId} />
                      <div className="flex flex-wrap gap-3">
                        <button type="submit" disabled={submitting} className="rounded-xl bg-[#001f3f] px-6 py-4 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-70">
                          {isEditingSub ? "Actualizar Sublocalizacion" : "Guardar Sublocalizacion"}
                        </button>
                        {isEditingSub ? (
                          <button
                            type="button"
                            className="rounded-xl border border-slate-300 px-6 py-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                            onClick={() => {
                              setSubForm(initialSub);
                              setEditingSubId(null);
                              setStatusMessage("");
                              setErrorMessage("");
                            }}
                          >
                            Cancelar
                          </button>
                        ) : null}
                      </div>
                    </form>
                  </section>
                  <section className="infrastructure-card">
                    <h3 className="text-xl font-bold text-slate-900">Sublocalizaciones registradas</h3>
                    <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">ID</th><th className="px-4 py-3">Sublocalizacion</th><th className="px-4 py-3">Edificio</th><th className="pl-6 pr-8 py-3 text-left">Accion</th></tr></thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                          {sublocalizaciones.map((item) => (
                            <tr key={item.id_sublocalizacion}>
                              <td className="px-4 py-3 font-medium">{item.id_sublocalizacion}</td>
                              <td className="px-4 py-3">{item.nombre_sublocalizacion}</td>
                              <td className="px-4 py-3">
                                {edificios.find((edificio) => edificio.id_edificio === item.id_edificio)?.nombre_edificio ||
                                  item.id_edificio}
                              </td>
                              <td className="pl-6 pr-8 py-3">
                                <ActionButtons
                                  onEdit={() => {
                                    const building = edificios.find((edificio) => edificio.id_edificio === item.id_edificio);
                                    const buildingCodeForItem = building
                                      ? norm(building.id_edificio, 4) || norm(building.nombre_edificio, 4)
                                      : "";
                                    const suffix = cleanId(item.id_sublocalizacion).slice(buildingCodeForItem.length);
                                    setSubForm({
                                      id_edificio: item.id_edificio,
                                      nombre_sublocalizacion: item.nombre_sublocalizacion,
                                      codigo_area: suffix,
                                    });
                                    setEditingSubId(cleanId(item.id_sublocalizacion));
                                    setStatusMessage("");
                                    setErrorMessage("");
                                  }}
                                  onDelete={async () => {
                                    if (!window.confirm("Eliminar esta sublocalizacion? Esta accion no se puede deshacer.")) {
                                      return;
                                    }
                                    try {
                                      await axios.delete(
                                        `${API_BASE_URL}/sublocalizaciones/${cleanId(item.id_sublocalizacion)}`,
                                        { headers: headers() }
                                      );
                                      setStatusMessage("Sublocalizacion eliminada correctamente.");
                                      await reload();
                                    } catch (error) {
                                      setErrorMessage(
                                        getApiErrorMessage(error, "No se pudo eliminar la sublocalizacion.")
                                      );
                                    }
                                  }}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              </div>
            ) : null}

            {!loading && activeView === "catalogo-ci" ? (
              <div className="space-y-8">
                <section className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold text-[#001f3f]">Catalogo de CIs</h2>
                    <p className="mt-1 text-sm text-slate-600">Patron [TIPO]-[UBICACION]-[CORRELATIVO] con vista previa.</p>
                  </div>
                  <form className="mt-6 space-y-5" onSubmit={submitCi}>
                    <div className="grid gap-5 xl:grid-cols-2">
                      <label><Label>Tipo de CI</Label><div className="relative"><Wrench className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><select value={ciForm.id_tipo_ci ? trimTipoCiId(ciForm.id_tipo_ci) : ""} onChange={(e) => { const v = e.target.value; setCiForm((p) => ({ ...p, id_tipo_ci: v })); if (!isDesktopTipoCiId(v)) setHardwareSpecs(emptyDesktopHardwareSpecs()); }} className={`${inputClass(isEditingCi)} pl-12`} disabled={isEditingCi} required><option value="">Selecciona un tipo</option>{catalogos.tipos_ci.map((item) => <option key={trimTipoCiId(item.id_tipo_ci)} value={trimTipoCiId(item.id_tipo_ci)}>{item.nombre_tipo}</option>)}</select></div></label>
                      <label><Label>Edificio</Label><select value={ciForm.id_edificio} onChange={(e) => setCiForm((p) => ({ ...p, id_edificio: e.target.value }))} className={inputClass(isEditingCi)} disabled={isEditingCi} required><option value="">Selecciona un edificio</option>{catalogos.edificios.map((item) => <option key={item.id_edificio} value={item.id_edificio}>{item.nombre_edificio}</option>)}</select></label>
                    </div>
                    <div className="grid gap-5 xl:grid-cols-2">
                      <label><Label>Sublocalizacion</Label><select value={ciForm.id_sublocalizacion} onChange={(e) => setCiForm((p) => ({ ...p, id_sublocalizacion: e.target.value }))} className={inputClass(!ciForm.id_edificio || isEditingCi)} disabled={!ciForm.id_edificio || isEditingCi} required><option value="">{ciForm.id_edificio ? "Selecciona una sublocalizacion" : "Primero selecciona un edificio"}</option>{sublocalizacionesFiltradas.map((item) => <option key={item.id_sublocalizacion} value={item.id_sublocalizacion}>{item.nombre_sublocalizacion}</option>)}</select></label>
                      <label><Label>Marca</Label><select value={ciForm.id_marca} onChange={(e) => setCiForm((p) => ({ ...p, id_marca: e.target.value }))} className={inputClass()} required><option value="">Selecciona una marca</option>{catalogos.marcas.map((item) => <option key={item.id_marca} value={item.id_marca}>{item.nombre_marca}</option>)}</select></label>
                    </div>
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      <label><Label>ID autogenerado</Label><input value={displayCiId} readOnly className={inputClass(true)} /></label>
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
                    {isDesktopCi ? (
                      <div className="space-y-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
                        <h4 className="text-sm font-bold uppercase tracking-wide text-[#001f3f]">
                          Componentes internos (computadora de escritorio)
                        </h4>
                        <div className="grid gap-4 md:grid-cols-2">
                          {DESKTOP_HW_INTERNO_FIELDS.map(({ key, label }) => (
                            <label key={key} className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {label}
                              <input
                                className={`${inputClass()} mt-1`}
                                value={hardwareSpecs.interno[key]}
                                onChange={(e) =>
                                  setHardwareSpecs((s) => ({
                                    ...s,
                                    interno: { ...s.interno, [key]: e.target.value },
                                  }))
                                }
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <Preview text="El ID generado para este activo sera:" value={displayCiId} />
                    <div className="flex flex-wrap gap-3">
                      <button type="submit" disabled={submitting} className="rounded-xl bg-[#001f3f] px-6 py-4 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-70">
                        {isEditingCi ? "Actualizar Elemento de Configuracion" : "Registrar Elemento de Configuracion"}
                      </button>
                      {isEditingCi ? (
                        <button
                          type="button"
                          className="rounded-xl border border-slate-300 px-6 py-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                          onClick={() => {
                            setCiForm(initialCi);
                            setHardwareSpecs(emptyDesktopHardwareSpecs());
                            setEditingCiId(null);
                            setStatusMessage("");
                            setErrorMessage("");
                          }}
                        >
                          Cancelar
                        </button>
                      ) : null}
                    </div>
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
                  <div className="w-full max-w-full overflow-hidden rounded-xl border border-slate-200">
                    <div className="w-full max-w-full overflow-x-auto">
                      <table className="w-full min-w-[860px] text-left text-[0.85rem]">
                        <thead className="bg-slate-100 text-[11px] uppercase text-slate-500"><tr><th className="px-3 py-2.5">ID CI</th><th className="px-3 py-2.5">Tipo</th><th className="px-3 py-2.5">Serie</th><th className="px-3 py-2.5">Equipo</th><th className="px-3 py-2.5">Marca</th><th className="px-3 py-2.5">Ubicacion</th><th className="px-3 py-2.5">Estado</th><th className="px-4 py-2.5 text-left">Accion</th></tr></thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                          {inventoryRows.map((item) => (
                            <tr key={item.id_ci}>
                              <td className="px-3 py-2.5 font-medium">{item.id_ci}</td>
                              <td className="px-3 py-2.5">{item.nombre_tipo}</td>
                              <td className="px-3 py-2.5">{item.numero_serie}</td>
                              <td className="px-3 py-2.5">
                                <div className="font-medium">{item.nombre_equipo || "Sin nombre"}</div>
                                <div className="text-xs text-slate-500">{item.modelo || "Sin modelo"}</div>
                              </td>
                              <td className="px-3 py-2.5">{item.nombre_marca}</td>
                              <td className="px-3 py-2.5">
                                <div className="font-medium">{item.nombre_edificio}</div>
                                <div className="text-xs text-slate-500">{item.nombre_sublocalizacion}</div>
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${getEstadoClasses(item.estado)}`}>
                                  {item.estado}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void openHistorialModal(item)}
                                    className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                                  >
                                    <ClipboardList className="h-4 w-4" />
                                    Historial
                                  </button>
                                  <ActionButtons
                                    onEdit={() => beginEditCi(item)}
                                    onDelete={async () => {
                                      if (!window.confirm("Eliminar este CI? Esta accion no se puede deshacer.")) {
                                        return;
                                      }
                                      try {
                                        await axios.delete(`${API_BASE_URL}/ci/${cleanId(item.id_ci)}`, {
                                          headers: headers(),
                                        });
                                        setStatusMessage("CI eliminado correctamente.");
                                        await reload();
                                      } catch (error) {
                                        setErrorMessage(
                                          getApiErrorMessage(error, "No se pudo eliminar el CI.")
                                        );
                                      }
                                    }}
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="hidden">
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
                        <div className="mt-4">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void openHistorialModal(item)}
                              className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                            >
                              <ClipboardList className="h-4 w-4" />
                              Historial
                            </button>
                            <ActionButtons
                              onEdit={() => beginEditCi(item)}
                              onDelete={async () => {
                                if (!window.confirm("Eliminar este CI? Esta accion no se puede deshacer.")) {
                                  return;
                                }
                                try {
                                  await axios.delete(`${API_BASE_URL}/ci/${cleanId(item.id_ci)}`, {
                                    headers: headers(),
                                  });
                                  setStatusMessage("CI eliminado correctamente.");
                                  await reload();
                                } catch (error) {
                                  setErrorMessage(getApiErrorMessage(error, "No se pudo eliminar el CI."));
                                }
                              }}
                            />
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}

            {selectedCiHistorial ? (
              <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/55 p-4">
                <div className="modal-content-wrapper">
                  <div className="mb-0 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">
                        Historial de Cambios - {selectedCiHistorial.id_ci}
                      </h3>
                      <p className="text-sm text-slate-600">
                        {selectedCiHistorial.nombre_equipo || "Sin nombre"} |{" "}
                        {selectedCiHistorial.nombre_edificio} / {selectedCiHistorial.nombre_sublocalizacion}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeHistorialModal}
                      className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Cerrar
                    </button>
                  </div>

                  <div className="modal-grid-responsive">
                    <section className="modal-history-section">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="text-base font-semibold text-slate-900">Cambios Registrados</h4>
                        {historialLoading ? <span className="text-xs text-slate-500">Cargando...</span> : null}
                      </div>

                      {!historialCambios.length && !historialLoading ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                          Este CI aun no tiene cambios registrados.
                        </div>
                      ) : null}

                      {historialCambios.length ? (
                        <div className="max-h-[380px] overflow-auto rounded-xl border border-slate-200">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                              <tr>
                                <th className="px-3 py-2">Fecha</th>
                                <th className="px-3 py-2">Transaccion</th>
                                <th className="px-3 py-2">Tecnico</th>
                                <th className="px-3 py-2">Detalle</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 bg-white">
                              {historialCambios.map((cambio) => (
                                <tr key={cambio.id_historial}>
                                  <td className="px-3 py-2 align-top">{formatDateTime(cambio.fecha_cambio)}</td>
                                  <td className="px-3 py-2 align-top">
                                    <div className="font-medium text-slate-800">
                                      {cambio.numero_transaccion || "Sin numero"}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      {cambio.origen_transaccion || "Sin origen"}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 align-top">{cambio.tecnico}</td>
                                  <td className="px-3 py-2 align-top">{cambio.detalle_cambio}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </section>

                    <section className="modal-form-section">
                      <h4 className="text-base font-semibold text-slate-900">
                        Crear Ticket Preventivo
                      </h4>
                      <p className="mt-1 text-xs text-slate-500">
                        Al crearlo, el origen y numero de transaccion se generan automaticamente.
                      </p>

                      <form className="mt-4 space-y-4" onSubmit={submitTicketPreventivo}>
                        <label className="block">
                          <Label>Descripcion del Mantenimiento Preventivo</Label>
                          <textarea
                            value={preventivoDescripcion}
                            onChange={(e) => setPreventivoDescripcion(e.target.value)}
                            rows={5}
                            className={`${inputClass()} min-h-[130px]`}
                            placeholder="Ej. Revisión preventiva semestral del equipo, limpieza y diagnóstico."
                            required
                          />
                        </label>

                        <button
                          type="submit"
                          disabled={creatingPreventivo}
                          className="w-full rounded-xl bg-[#001f3f] px-6 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-70"
                        >
                          {creatingPreventivo ? "Creando..." : "Crear Ticket Preventivo"}
                        </button>
                      </form>
                    </section>
                  </div>
                </div>
              </div>
            ) : null}
    </section>
  );
}

