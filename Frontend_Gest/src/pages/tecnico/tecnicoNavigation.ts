import { ClipboardCheck } from "lucide-react";
import type { SidebarNavGroup } from "../../components/layout/Sidebar";

export type TecnicoView = "mis-servicios";

export const tecnicoSidebarGroups: SidebarNavGroup[] = [
  {
    id: "principal",
    items: [{ id: "mis-servicios", label: "Mis Servicios", icon: ClipboardCheck }],
  },
];

export function tecnicoPathForView(_view: TecnicoView) {
  return "/tecnico/mis-servicios";
}

export function tecnicoViewFromPath(_pathname: string): TecnicoView {
  return "mis-servicios";
}
