import { Boxes, Building2, MapPinned } from "lucide-react";
import type { SidebarNavGroup } from "../components/layout/Sidebar";

export type AdminView = "gestion-edificios" | "aulas-laboratorios" | "catalogo-ci";

export const adminSidebarGroups: SidebarNavGroup[] = [
  {
    id: "activos",
    items: [
      { id: "gestion-edificios", label: "Gestion de Edificios", icon: Building2 },
      { id: "aulas-laboratorios", label: "Aulas y Laboratorios", icon: MapPinned },
      { id: "catalogo-ci", label: "Catalogo de CIs", icon: Boxes },
    ],
  },
];

export function adminPathForView(view: AdminView) {
  switch (view) {
    case "gestion-edificios":
      return "/admin/gestion-edificios";
    case "aulas-laboratorios":
      return "/admin/aulas-laboratorios";
    case "catalogo-ci":
      return "/admin/catalogo-ci";
    default:
      return "/admin/gestion-edificios";
  }
}

export function adminViewFromPath(pathname: string): AdminView {
  if (pathname.endsWith("/aulas-laboratorios")) return "aulas-laboratorios";
  if (pathname.endsWith("/catalogo-ci")) return "catalogo-ci";
  return "gestion-edificios";
}
