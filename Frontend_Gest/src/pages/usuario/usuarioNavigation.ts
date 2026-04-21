import { FilePlus, Home } from "lucide-react";
import type { SidebarNavGroup } from "../../components/layout/Sidebar";

export type UsuarioView =
  | "dashboard"
  | "nuevo-reporte";

export const usuarioSidebarGroups: SidebarNavGroup[] = [
  {
    id: "principal",
    items: [
      { id: "dashboard", label: "Inicio", icon: Home },
      { id: "nuevo-reporte", label: "Nuevo Reporte", icon: FilePlus },
    ],
  },
];

export function usuarioPathForView(view: UsuarioView) {
  switch (view) {
    case "nuevo-reporte":
      return "/usuario/nuevo-reporte";
    default:
      return "/usuario/dashboard";
  }
}

export function usuarioViewFromPath(pathname: string): UsuarioView {
  if (pathname.endsWith("/nuevo-reporte")) return "nuevo-reporte";
  return "dashboard";
}
