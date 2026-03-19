import { Boxes, Building2, FilePlus, Home, MapPinned } from "lucide-react";
import type { SidebarNavGroup } from "../components/layout/Sidebar";

export type UsuarioView =
  | "dashboard"
  | "nuevo-reporte"
  | "gestion-edificios"
  | "aulas-laboratorios"
  | "catalogo-ci";

export const usuarioSidebarGroups: SidebarNavGroup[] = [
  {
    id: "principal",
    items: [
      { id: "dashboard", label: "Inicio", icon: Home },
      { id: "nuevo-reporte", label: "Nuevo Reporte", icon: FilePlus },
    ],
  },
  {
    id: "activos",
    label: "Gestion de Activos",
    items: [
      { id: "gestion-edificios", label: "Gestion de Edificios", icon: Building2 },
      { id: "aulas-laboratorios", label: "Aulas y Laboratorios", icon: MapPinned },
      { id: "catalogo-ci", label: "Catalogo de CIs", icon: Boxes },
    ],
  },
];

export function usuarioPathForView(view: UsuarioView) {
  switch (view) {
    case "nuevo-reporte":
      return "/usuario/nuevo-reporte";
    case "gestion-edificios":
      return "/usuario/gestion-edificios";
    case "aulas-laboratorios":
      return "/usuario/aulas-laboratorios";
    case "catalogo-ci":
      return "/usuario/catalogo-ci";
    default:
      return "/usuario/dashboard";
  }
}

export function usuarioViewFromPath(pathname: string): UsuarioView {
  if (pathname.endsWith("/nuevo-reporte")) return "nuevo-reporte";
  if (pathname.endsWith("/gestion-edificios")) return "gestion-edificios";
  if (pathname.endsWith("/aulas-laboratorios")) return "aulas-laboratorios";
  if (pathname.endsWith("/catalogo-ci")) return "catalogo-ci";
  return "dashboard";
}
