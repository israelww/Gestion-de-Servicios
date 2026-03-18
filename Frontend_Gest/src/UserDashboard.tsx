import { Eye } from "lucide-react";
import Sidebar from "./Sidebar";

interface Ticket {
  folio: string;
  equipo: string;
  ubicacion: string;
  tecnico: string;
  estado: "En Proceso" | "Resuelto";
}

const tickets: Ticket[] = [
  {
    folio: "3200130",
    equipo: "Laptop Dell G15",
    ubicacion: "Oficina Norte",
    tecnico: "Ing. Ramírez",
    estado: "En Proceso",
  },
  {
    folio: "3200122",
    equipo: "Impresora HP 404",
    ubicacion: "Almacén",
    tecnico: "Tec. López",
    estado: "Resuelto",
  },
  {
    folio: "3200118",
    equipo: "PC Lenovo M720",
    ubicacion: "Recepción",
    tecnico: "Ing. Torres",
    estado: "En Proceso",
  },
  {
    folio: "3200105",
    equipo: "Monitor Samsung 27”",
    ubicacion: "Sala de Juntas",
    tecnico: "Tec. Vargas",
    estado: "Resuelto",
  },
];

function getEstadoClasses(estado: Ticket["estado"]) {
  if (estado === "En Proceso") {
    return "bg-orange-100 text-orange-800";
  }
  return "bg-emerald-100 text-emerald-800";
}

type Vista = "dashboard" | "nuevo-reporte";

interface UserDashboardProps {
  activeView: Vista;
  onNavigate: (view: Vista) => void;
}

export default function UserDashboard({ activeView, onNavigate }: UserDashboardProps) {
  return (
    <div className="relative min-h-screen bg-slate-900 text-slate-100" style={{ overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url('/images/login-bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(4px)",
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
            <div className="mb-6">
              <h2 className="text-2xl font-bold">Resumen de Tickets Activos</h2>
              <p className="text-sm text-slate-600">Tus Tickets Activos</p>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Folio</th>
                    <th className="px-4 py-3">Equipo</th>
                    <th className="px-4 py-3">Ubicación</th>
                    <th className="px-4 py-3">Técnico</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="pl-6 pr-8 py-3 text-left">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {tickets.map((ticket) => (
                    <tr key={ticket.folio} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{ticket.folio}</td>
                      <td className="px-4 py-3 text-slate-700">{ticket.equipo}</td>
                      <td className="px-4 py-3 text-slate-700">{ticket.ubicacion}</td>
                      <td className="px-4 py-3 text-slate-700">{ticket.tecnico}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getEstadoClasses(
                            ticket.estado
                          )}`}
                        >
                          {ticket.estado}
                        </span>
                      </td>
                      <td className="pl-6 pr-8 py-3 text-left">
                        <button
                          type="button"
                          className="inline-flex items-center justify-start gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                        >
                          <Eye className="h-4 w-4" />
                          Ver Detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
