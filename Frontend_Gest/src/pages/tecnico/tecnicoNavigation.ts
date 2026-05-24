import { ClipboardCheck, SearchCheck } from "lucide-react";
import type { SidebarNavGroup } from "../../components/layout/Sidebar";

export type TecnicoView = "mis-servicios" | "investigaciones";

export const tecnicoSidebarGroups: SidebarNavGroup[] = [
  {
    id: "principal",
    items: [
      { id: "mis-servicios", label: "Mis Servicios", icon: ClipboardCheck },
      { id: "investigaciones", label: "Investigaciones", icon: SearchCheck },
    ],
  },
];

export function tecnicoPathForView(view: TecnicoView) {
  switch (view) {
    case "investigaciones":
      return "/tecnico/investigaciones";
    case "mis-servicios":
    default:
      return "/tecnico/mis-servicios";
  }
}

export function tecnicoViewFromPath(pathname: string): TecnicoView {
  if (pathname.endsWith("/investigaciones")) return "investigaciones";
  return "mis-servicios";
}
