import type { Appointment, Interaction, Task } from "./schemas";

/**
 * Un solo tipo para las tres fuentes que mezcla la línea de tiempo del lead
 * (tarea 2.4): interacciones, citas y tareas. No hay endpoint de historial de
 * transiciones que valga usar aquí (docs/SPRINT_LINEA2.md): los cambios de
 * etapa ya llegan como interacciones `STATUS_CHANGE`, así que se leen igual
 * que cualquier otra interacción.
 *
 * Vive aparte de components/HistorialLead.tsx (que es "use client") a
 * propósito: app/(agente)/leads/[leadId]/page.tsx (Server Component) necesita
 * llamar a `construirLineaTiempo` directamente, y una función exportada desde
 * un módulo "use client" no se puede invocar desde el servidor — solo
 * renderizar como componente. Mismo motivo por el que lib/errores.ts vive
 * aparte de lib/homelitics.ts.
 *
 * `fecha` es el campo por el que se ordena. Para interacciones es
 * `occurred_at` (cuándo pasó, no cuándo se registró). Citas y tareas no
 * tienen un timestamp de "cuándo pasó el evento" — solo `created_at`/
 * `updated_at` del registro — así que se ubican en la línea de tiempo por
 * `created_at`: el momento en que ese hecho entró al sistema.
 */
export type EventoTimeline =
  | { id: string; tipo: "interaccion"; fecha: string; interaccion: Interaction }
  | { id: string; tipo: "cita"; fecha: string; cita: Appointment }
  | { id: string; tipo: "tarea"; fecha: string; tarea: Task };

export function construirLineaTiempo(args: {
  interacciones: Interaction[];
  citas: Appointment[];
  tareas: Task[];
}): EventoTimeline[] {
  const eventos: EventoTimeline[] = [
    ...args.interacciones.map((i): EventoTimeline => (
      { id: i.id, tipo: "interaccion", fecha: i.occurred_at, interaccion: i }
    )),
    ...args.citas.map((c): EventoTimeline => (
      { id: c.id, tipo: "cita", fecha: c.created_at, cita: c }
    )),
    ...args.tareas.map((t): EventoTimeline => (
      { id: t.id, tipo: "tarea", fecha: t.created_at, tarea: t }
    )),
  ];
  return eventos.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
}
