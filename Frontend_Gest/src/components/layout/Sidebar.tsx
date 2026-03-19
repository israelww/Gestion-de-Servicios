import type { CSSProperties } from "react";
import { FilePlus, Home } from "lucide-react";

type Vista = "dashboard" | "nuevo-reporte";

interface SidebarProps {
  activeView: Vista;
  onNavigate: (view: Vista) => void;
}

export default function Sidebar({ activeView, onNavigate }: SidebarProps) {
  const getNavStyle = (vista: Vista): CSSProperties => ({
    display: "flex",
    width: "100%",
    alignItems: "center",
    gap: "16px",
    borderRadius: "8px",
    padding: "12px 16px",
    textAlign: "left",
    cursor: "pointer",
    border: "none",
    transition: "all 0.2s",
    ...(activeView === vista
      ? {
          background: "rgba(15, 23, 42, 0.85)",
          boxShadow: "inset 0 2px 8px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.4)",
          color: "#ffffff",
          fontWeight: 600,
        }
      : {
          background: "transparent",
          color: "#cbd5e1",
        }),
  });

  return (
    <aside className="w-[250px] backdrop-blur-xl" style={{ background: "rgba(120,120,120,0.35)" }}>
      <div className="flex h-full flex-col px-6 py-8">
        <div className="flex flex-col items-center pb-6 text-center" style={{ paddingTop: "48px" }}>
          <div
            className="shrink-0 overflow-hidden rounded-full bg-slate-700/70 ring-2 ring-white/30"
            style={{ width: 64, height: 64 }}
          >
            <img
              src="/images/logo.png"
              alt="Logo"
              className="block rounded-full object-cover"
              style={{ width: "100%", height: "100%", maxWidth: "100%", maxHeight: "100%" }}
            />
          </div>
          <p className="mt-4 text-base font-semibold uppercase tracking-wide text-slate-100/90">
            Taller de Reparación y
          </p>
          <p className="text-base font-semibold uppercase tracking-wide text-slate-100/90">
            Mantenimiento Tec
          </p>
        </div>

        <nav
          className="text-sm text-slate-200"
          style={{ display: "flex", flexDirection: "column", gap: "0", marginTop: "40px" }}
        >
          <button type="button" style={getNavStyle("dashboard")} onClick={() => onNavigate("dashboard")}>
            <Home className="h-5 w-5" />
            Inicio
          </button>
          <button type="button" style={getNavStyle("nuevo-reporte")} onClick={() => onNavigate("nuevo-reporte")}>
            <FilePlus className="h-5 w-5" />
            Nuevo Reporte
          </button>
        </nav>
      </div>
    </aside>
  );
}
