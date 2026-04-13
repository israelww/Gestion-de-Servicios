import { useEffect, useState, type FormEvent } from "react";
import { Home, MapPin, User } from "lucide-react";
import axios from "axios";
import { getToken } from "../../auth/storage";

const API_BASE_URL = "http://localhost:4000/api";

interface OptionItem {
  id: string;
  label: string;
}

interface NuevoReporteForm {
  edificio: string;
  sublocalizacion: string;
  equipoId: string;
  descripcion: string;
}

export default function NuevoReporte() {
  const [edificios, setEdificios] = useState<OptionItem[]>([]);
  const [sublocalizaciones, setSublocalizaciones] = useState<OptionItem[]>([]);
  const [equipos, setEquipos] = useState<OptionItem[]>([]);
  const [loadingEdificios, setLoadingEdificios] = useState(true);
  const [loadingSublocalizaciones, setLoadingSublocalizaciones] = useState(false);
  const [loadingEquipos, setLoadingEquipos] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<NuevoReporteForm>({
    edificio: "",
    sublocalizacion: "",
    equipoId: "",
    descripcion: "",
  });

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

  const handleChange = (field: keyof NuevoReporteForm, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setStatusMessage(null);
    setSubmitting(true);
    try {
      await axios.post(
        `${API_BASE_URL}/reportes`,
        {
          id_edificio: formData.edificio,
          id_sublocalizacion: formData.sublocalizacion,
          id_ci: formData.equipoId,
          descripcion_falla: formData.descripcion,
        },
        { headers: headers() }
      );
      setFormData({
        edificio: "",
        sublocalizacion: "",
        equipoId: "",
        descripcion: "",
      });
      setSublocalizaciones([]);
      setEquipos([]);
      setStatusMessage("Reporte creado correctamente.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error, "No se pudo crear el reporte."));
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadOptions = async () => {
      try {
        setLoadingEdificios(true);
        setLoadError(null);
        const response = await axios.get(`${API_BASE_URL}/edificios`, { headers: headers() });
        const edificiosData = (response.data || []).map((item: { id_edificio: string; nombre_edificio: string }) => ({
          id: item.id_edificio,
          label: item.nombre_edificio,
        }));
        if (isMounted) {
          setEdificios(edificiosData);
        }
      } catch (error) {
        if (isMounted) {
          setLoadError(getApiErrorMessage(error, "No se pudieron cargar los edificios."));
        }
      } finally {
        if (isMounted) {
          setLoadingEdificios(false);
        }
      }
    };

    loadOptions();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadSublocalizaciones = async () => {
      if (!formData.edificio) {
        setSublocalizaciones([]);
        setFormData((prev) => ({ ...prev, sublocalizacion: "", equipoId: "" }));
        return;
      }

      try {
        setLoadingSublocalizaciones(true);
        setLoadError(null);
        const response = await axios.get(
          `${API_BASE_URL}/edificios/${formData.edificio}/sublocalizaciones`,
          { headers: headers() }
        );
        const data = (response.data || []).map(
          (item: { id_sublocalizacion: string; nombre_sublocalizacion: string }) => ({
            id: item.id_sublocalizacion,
            label: item.nombre_sublocalizacion,
          })
        );
        if (isMounted) {
          setSublocalizaciones(data);
          setFormData((prev) => ({ ...prev, sublocalizacion: "", equipoId: "" }));
        }
      } catch (error) {
        if (isMounted) {
          setLoadError(getApiErrorMessage(error, "No se pudieron cargar las sublocalizaciones."));
        }
      } finally {
        if (isMounted) {
          setLoadingSublocalizaciones(false);
        }
      }
    };

    void loadSublocalizaciones();

    return () => {
      isMounted = false;
    };
  }, [formData.edificio]);

  useEffect(() => {
    let isMounted = true;

    const loadEquipos = async () => {
      if (!formData.sublocalizacion) {
        setEquipos([]);
        setFormData((prev) => ({ ...prev, equipoId: "" }));
        return;
      }

      try {
        setLoadingEquipos(true);
        setLoadError(null);
        const response = await axios.get(
          `${API_BASE_URL}/sublocalizaciones/${formData.sublocalizacion}/ci`,
          { headers: headers() }
        );
        const data = (response.data || []).map(
          (item: { id_ci: string; nombre_equipo: string | null; numero_serie: string }) => ({
            id: item.id_ci,
            label: `${item.id_ci} - ${item.nombre_equipo || item.numero_serie || "Sin nombre"}`,
          })
        );
        if (isMounted) {
          setEquipos(data);
          setFormData((prev) => ({ ...prev, equipoId: "" }));
        }
      } catch (error) {
        if (isMounted) {
          setLoadError(getApiErrorMessage(error, "No se pudieron cargar los equipos."));
        }
      } finally {
        if (isMounted) {
          setLoadingEquipos(false);
        }
      }
    };

    void loadEquipos();

    return () => {
      isMounted = false;
    };
  }, [formData.sublocalizacion]);

  return (
    <section
      className="mt-10 text-slate-900 shadow-2xl"
      style={{ backgroundColor: "#ffffff", borderRadius: "24px", padding: "48px" }}
    >
            <h2 className="text-2xl font-bold text-[#001f3f]">Formulario para Reportar Fallas</h2>
            <p className="mt-1 text-sm text-slate-600">
              Completa la informacion para generar un folio nuevo.
            </p>

            <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
              <div>
                <label className="mb-2 block text-xs font-semibold text-gray-700">EDIFICIO</label>
                <div className="relative">
                  <Home className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <select
                    value={formData.edificio}
                    onChange={(event) => handleChange("edificio", event.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white py-4 pl-12 pr-4 text-sm text-gray-700 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-900"
                    required
                    disabled={loadingEdificios || Boolean(loadError)}
                  >
                    <option value="" disabled>
                      {loadingEdificios ? "Cargando..." : "Selecciona un edificio"}
                    </option>
                    {edificios.map((edificio) => (
                      <option key={edificio.id} value={edificio.id}>
                        {edificio.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold text-gray-700">SUBLOCALIZACION</label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <select
                    value={formData.sublocalizacion}
                    onChange={(event) => handleChange("sublocalizacion", event.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white py-4 pl-12 pr-4 text-sm text-gray-700 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-900"
                    required
                    disabled={!formData.edificio || loadingSublocalizaciones || Boolean(loadError)}
                  >
                    <option value="" disabled>
                      {loadingSublocalizaciones ? "Cargando..." : "Selecciona una sublocalizacion"}
                    </option>
                    {sublocalizaciones.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold text-gray-700">ID DEL EQUIPO</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <select
                    value={formData.equipoId}
                    onChange={(event) => handleChange("equipoId", event.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white py-4 pl-12 pr-4 text-sm text-gray-700 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-900"
                    required
                    disabled={!formData.sublocalizacion || loadingEquipos || Boolean(loadError)}
                  >
                    <option value="" disabled>
                      {loadingEquipos ? "Cargando..." : "Selecciona un equipo"}
                    </option>
                    {equipos.map((equipo) => (
                      <option key={equipo.id} value={equipo.id}>
                        {equipo.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold text-gray-700">DESCRIPCION DE LA FALLA</label>
                <textarea
                  value={formData.descripcion}
                  onChange={(event) => handleChange("descripcion", event.target.value)}
                  className="min-h-[140px] w-full rounded-xl border border-gray-300 bg-white px-4 py-4 text-sm text-gray-700 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-900"
                  placeholder="Describe el problema..."
                  required
                />
              </div>

              {statusMessage ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {statusMessage}
                </div>
              ) : null}

              {submitError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {submitError}
                </div>
              ) : null}

              {loadError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {loadError}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting || Boolean(loadError)}
                className="w-full rounded-xl bg-[#001f3f] py-4 text-sm font-bold text-white shadow-md transition hover:bg-blue-800 disabled:opacity-70"
              >
                {submitting ? "Enviando..." : "Enviar Reporte"}
              </button>
            </form>
    </section>
  );
}
