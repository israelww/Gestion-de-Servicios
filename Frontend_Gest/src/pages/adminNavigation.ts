import { Boxes, Building2, ClipboardList, UsersRound } from "lucide-react";
import type { SidebarNavGroup } from "../components/layout/Sidebar";

export type AdminView =
  | "bandeja-entrada"
  | "gestion-infraestructura"
  | "catalogo-ci"
  | "gestion-usuarios";

export const adminSidebarGroups: SidebarNavGroup[] = [
  {
    id: "gestion",
    items: [
      { id: "bandeja-entrada", label: "Bandeja de Entrada", icon: ClipboardList },
      { id: "gestion-infraestructura", label: "Gestion de Infraestructura", icon: Building2 },
      { id: "catalogo-ci", label: "Catalogo de CIs", icon: Boxes },
      { id: "gestion-usuarios", label: "Gestion de Usuarios", icon: UsersRound },
    ],
  },
];

export function adminPathForView(view: AdminView) {
  switch (view) {
    case "bandeja-entrada":
      return "/admin/bandeja-entrada";
    case "gestion-infraestructura":
      return "/admin/gestion-infraestructura";
    case "catalogo-ci":
      return "/admin/catalogo-ci";
    case "gestion-usuarios":
      return "/admin/gestion-usuarios";
    default:
      return "/admin/bandeja-entrada";
  }
}

export function adminViewFromPath(pathname: string): AdminView {
  if (pathname.endsWith("/bandeja-entrada")) return "bandeja-entrada";
  if (pathname.endsWith("/gestion-infraestructura")) return "gestion-infraestructura";
  if (pathname.endsWith("/catalogo-ci")) return "catalogo-ci";
  if (pathname.endsWith("/gestion-usuarios")) return "gestion-usuarios";
  return "bandeja-entrada";
}
