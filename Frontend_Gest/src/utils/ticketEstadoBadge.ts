/**
 * Clases Tailwind para el badge de estado de ticket / mantenimiento.
 * Valores alineados con el backend (VARCHAR en Mantenimientos.estado).
 */
export function ticketEstadoBadgeClasses(estado: string): string {
  const e = estado.trim().toLowerCase();

  if (e === "pendiente") {
    return "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-300/80";
  }
  if (e === "asignado") {
    return "bg-sky-100 text-sky-900 ring-1 ring-inset ring-sky-300/80";
  }
  if (e === "en proceso") {
    return "bg-orange-100 text-orange-900 ring-1 ring-inset ring-orange-300/80";
  }
  if (e === "terminado") {
    return "bg-teal-100 text-teal-900 ring-1 ring-inset ring-teal-300/80";
  }
  if (e === "cerrado") {
    return "bg-emerald-100 text-emerald-900 ring-1 ring-inset ring-emerald-300/80";
  }
  if (e === "liberado") {
    return "bg-violet-100 text-violet-900 ring-1 ring-inset ring-violet-300/80";
  }

  return "bg-slate-100 text-slate-800 ring-1 ring-inset ring-slate-300/80";
}
