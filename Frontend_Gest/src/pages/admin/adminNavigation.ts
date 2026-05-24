import { Boxes, Building2, ClipboardList, FileCheck, ListChecks, Package, SearchCheck, UsersRound } from "lucide-react";
import type { SidebarNavGroup } from "../../components/layout/Sidebar";

export type AdminView =
  | "bandeja-entrada"
  | "gestion-infraestructura"
  | "catalogo-ci"
  | "catalogo-servicios"
  | "inventario-componentes"
  | "solicitudes-cambio"
  | "gestion-problemas"
  | "gestion-usuarios";

export const adminSidebarGroups: SidebarNavGroup[] = [
  {
    id: "gestion",
    items: [
      { id: "bandeja-entrada", label: "Bandeja de Entrada", icon: ClipboardList },
      { id: "gestion-infraestructura", label: "Gestion de Infraestructura", icon: Building2 },
      { id: "catalogo-ci", label: "Catalogo de CIs", icon: Boxes },
      { id: "catalogo-servicios", label: "Catalogo de servicios", icon: ListChecks },
      { id: "inventario-componentes", label: "Inventario componentes", icon: Package },
      { id: "solicitudes-cambio", label: "Solicitudes RFC", icon: FileCheck },
      { id: "gestion-problemas", label: "Gestion de Problemas", icon: SearchCheck },
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
    case "catalogo-servicios":
      return "/admin/catalogo-servicios";
    case "inventario-componentes":
      return "/admin/inventario-componentes";
    case "solicitudes-cambio":
      return "/admin/solicitudes-cambio";
    case "gestion-problemas":
      return "/admin/gestion-problemas";
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
  if (pathname.endsWith("/catalogo-servicios")) return "catalogo-servicios";
  if (pathname.endsWith("/inventario-componentes")) return "inventario-componentes";
  if (pathname.endsWith("/solicitudes-cambio")) return "solicitudes-cambio";
  if (pathname.endsWith("/gestion-problemas")) return "gestion-problemas";
  if (pathname.endsWith("/gestion-usuarios")) return "gestion-usuarios";
  return "bandeja-entrada";
}
