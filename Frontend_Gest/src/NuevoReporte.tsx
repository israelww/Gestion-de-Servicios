import { useEffect, useState, type FormEvent } from "react";
import { Home, MapPin, User } from "lucide-react";
import Sidebar from "./Sidebar";

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

type Vista = "dashboard" | "nuevo-reporte";

interface NuevoReporteProps {
  activeView: Vista;
  onNavigate: (view: Vista) => void;
}

export default function NuevoReporte({ activeView, onNavigate }: NuevoReporteProps) {
  const [edificios, setEdificios] = useState<OptionItem[]>([]);
  const [sublocalizaciones, setSublocalizaciones] = useState<OptionItem[]>([]);
  const [equipos, setEquipos] = useState<OptionItem[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formData, setFormData] = useState<NuevoReporteForm>({
    edificio: "",
    sublocalizacion: "",
    equipoId: "",
    descripcion: "",
  });

  const handleChange = (field: keyof NuevoReporteForm, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  useEffect(() => {
    let isMounted = true;

    const fetchEdificios = async (): Promise<OptionItem[]> =>
      Promise.resolve([
        { id: "ED-001", label: "Edificio A" },
        { id: "ED-002", label: "Edificio B" },
        { id: "ED-003", label: "Edificio C" },
      ]);

    const fetchSublocalizaciones = async (): Promise<OptionItem[]> =>
      Promise.resolve([
        { id: "SL-101", label: "Salon 101" },
        { id: "SL-204", label: "Salon 204" },
        { id: "SL-305", label: "Salon 305" },
      ]);

    const fetchEquipos = async (): Promise<OptionItem[]> =>
      Promise.resolve([
        { id: "EQ-001", label: "Proyector Epson" },
        { id: "EQ-002", label: "Laptop Dell G15" },
        { id: "EQ-003", label: "Impresora HP 404" },
      ]);

    const loadOptions = async () => {
      try {
        setLoadingOptions(true);
        setLoadError(null);
        const [edificiosData, sublocalizacionesData, equiposData] = await Promise.all([
          fetchEdificios(),
          fetchSublocalizaciones(),
          fetchEquipos(),
        ]);
        if (isMounted) {
          setEdificios(edificiosData);
          setSublocalizaciones(sublocalizacionesData);
          setEquipos(equiposData);
        }
      } catch (error) {
        if (isMounted) {
          setLoadError("No se pudieron cargar las opciones del formulario.");
        }
      } finally {
        if (isMounted) {
          setLoadingOptions(false);
        }
      }
    };

    loadOptions();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-slate-900 text-slate-100" style={{ overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url('/images/login-bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(16px)",
          transform: "scale(1.05)",
        }}
      />
      <div style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.45)" }} />

      <div className="relative z-10 flex min-h-screen">
        <Sidebar activeView={activeView} onNavigate={onNavigate} />

        <main
          className="flex-1"
          style={{ paddingTop: "32px", paddingBottom: "32px", paddingLeft: "48px", paddingRight: "48px" }}
        >
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
                    disabled={loadingOptions || Boolean(loadError)}
                  >
                    <option value="" disabled>
                      {loadingOptions ? "Cargando..." : "Selecciona un edificio"}
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
                    disabled={loadingOptions || Boolean(loadError)}
                  >
                    <option value="" disabled>
                      {loadingOptions ? "Cargando..." : "Selecciona una sublocalizacion"}
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
                    disabled={loadingOptions || Boolean(loadError)}
                  >
                    <option value="" disabled>
                      {loadingOptions ? "Cargando..." : "Selecciona un equipo"}
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

              {loadError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {loadError}
                </div>
              ) : null}

              <button
                type="submit"
                className="w-full rounded-xl bg-[#001f3f] py-4 text-sm font-bold text-white shadow-md transition hover:bg-blue-800"
              >
                Enviar Reporte
              </button>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}
