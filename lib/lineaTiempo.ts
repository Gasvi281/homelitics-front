import { ETIQUETA_MOTIVO_PERDIDA } from "./etapas";
import { LostReason, type Appointment, type Interaction, type Task } from "./schemas";

/**
 * Un solo tipo para las tres fuentes que mezcla la línea de tiempo del lead
 * (tarea 2.4): interacciones, citas y tareas. `GET /leads/{id}/transitions`
 * existe, pero no se mezcla aquí: trae solo etapas, sin nota ni motivo, y lo
 * que cuenta en el historial ya llega como interacción `STATUS_CHANGE` (LOST
 * la escribe siempre, con el motivo). El log lo usa components/EmbudoLead.tsx
 * para saber hasta dónde llegó un lead perdido.
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

/**
 * Cuerpo que escribe el API al pasar a LOST: `"Lost: <CÓDIGO>"` o
 * `"Lost: <CÓDIGO> — <nota>"` (docs/API_CONTRACT.md, POST .../transitions).
 */
const CUERPO_LOST = /^Lost: ([A-Z_]+)(?: — ([\s\S]*))?$/;

/**
 * El texto de una interacción tal como se muestra. La `STATUS_CHANGE` de un
 * LOST trae el código del motivo en inglés; se traduce a su etiqueta
 * (`"Perdido: Precio — nota"`). Cualquier otro cuerpo, o un código que no
 * se reconozca, sale tal cual: mejor el dato crudo que uno inventado.
 */
export function textoInteraccion(i: { type: Interaction["type"]; body?: string | null }): string | null {
  const cuerpo = i.body ?? null;
  if (i.type !== "STATUS_CHANGE" || !cuerpo) return cuerpo;
  const partes = CUERPO_LOST.exec(cuerpo);
  const motivo = LostReason.safeParse(partes?.[1]);
  if (!partes || !motivo.success) return cuerpo;
  const nota = partes[2]?.trim();
  return `Perdido: ${ETIQUETA_MOTIVO_PERDIDA[motivo.data]}${nota ? ` — ${nota}` : ""}`;
}
