<<<<<<< HEAD
import type { CSSProperties, ComponentType, SVGProps } from "react";
import { FilePlus, Home } from "lucide-react";
=======
import type { CSSProperties } from "react";
import { FilePlus, Home, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { clearAuth } from "./auth/storage";
>>>>>>> 5fdced8c4a5df6deb4ffd8a853801e8bcf7dd48a

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

export interface SidebarNavItem {
  id: string;
  label: string;
  icon: IconType;
}

<<<<<<< HEAD
export interface SidebarNavGroup {
  id: string;
  label?: string;
  items: SidebarNavItem[];
}

interface SidebarProps {
  activeView: string;
  onNavigate: (view: string) => void;
  groups?: SidebarNavGroup[];
  headingLines?: [string, string?];
}

const defaultGroups: SidebarNavGroup[] = [
  {
    id: "principal",
    items: [
      { id: "dashboard", label: "Inicio", icon: Home },
      { id: "nuevo-reporte", label: "Nuevo Reporte", icon: FilePlus },
    ],
  },
];

export default function Sidebar({
  activeView,
  onNavigate,
  groups = defaultGroups,
  headingLines = ["Taller de Reparacion y", "Mantenimiento Tec"],
}: SidebarProps) {
  const getNavStyle = (vista: string): CSSProperties => ({
=======
export default function Sidebar({ activeView, onNavigate }: SidebarProps) {
  const navigate = useNavigate();
  const getNavStyle = (vista: Vista): CSSProperties => ({
>>>>>>> 5fdced8c4a5df6deb4ffd8a853801e8bcf7dd48a
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

  const logoutStyle: CSSProperties = {
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
    background: "rgba(15, 23, 42, 0.55)",
    color: "#ffffff",
    fontWeight: 600,
    marginTop: "16px",
  };

  const handleLogout = () => {
    clearAuth();
    navigate("/login", { replace: true });
  };

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
            {headingLines[0]}
          </p>
          {headingLines[1] ? (
            <p className="text-base font-semibold uppercase tracking-wide text-slate-100/90">
              {headingLines[1]}
            </p>
          ) : null}
        </div>

        <nav
          className="text-sm text-slate-200"
          style={{ display: "flex", flexDirection: "column", gap: "20px", marginTop: "40px" }}
        >
          {groups.map((group) => (
            <div key={group.id} className="flex flex-col gap-2">
              {group.label ? (
                <p className="px-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300/80">
                  {group.label}
                </p>
              ) : null}

              <div className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      style={getNavStyle(item.id)}
                      onClick={() => onNavigate(item.id)}
                    >
                      <Icon className="h-5 w-5" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div style={{ marginTop: "auto" }}>
          <button type="button" style={logoutStyle} onClick={handleLogout}>
            <LogOut className="h-5 w-5" />
            Cerrar sesión
          </button>
        </div>
      </div>
    </aside>
  );
}
