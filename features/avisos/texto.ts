/**
 * Textos y destino de un aviso (2.31). Funciones puras, sin `"use client"`
 * ni React: las usan la bandeja del agente (2.33) y el monitor del admin
 * (2.35), y se prueban aparte. La tabla de textos está en
 * docs/SPRINT_NOTIFICACIONES_LINEA2.md, sección "Textos".
 */
import { fechaHoraLarga } from "@/lib/format";
import type { AppointmentStatus, NotificationOut } from "@/lib/schemas";

export type FraseAviso = {
  frase: string;
  /** "movida", "cancelada"…; `null` cuando la visita sigue como se agendó o no aplica. */
  etiqueta: string | null;
  /** Sale de `visit_status` (la visita como está ahora), nunca de `booked_status`. */
  requiereConfirmacion: boolean;
};

/**
 * `RESCHEDULED`, `COMPLETED` y `NO_SHOW` son propuesta del front; solo
 * "cancelada" viene de la guía del API (bloqueo 16).
 */
const ETIQUETA_VISITA: Record<AppointmentStatus, string | null> = {
  PENDING_CONFIRMATION: null,
  CONFIRMED: null,
  RESCHEDULED: "movida",
  CANCELLED: "cancelada",
  COMPLETED: "realizada",
  NO_SHOW: "no asistió",
};

/**
 * Quién generó el aviso: "El asistente" si es el bot; si no, `actor_name`,
 * y si es nulo, "Un administrador" (también cubre `actor_role: AGENT`,
 * bloqueo 22). En `"medio"` de una frase los genéricos van en minúscula;
 * un nombre propio queda como llega.
 */
export function nombreActor(n: NotificationOut, posicion: "inicio" | "medio" = "inicio"): string {
  const generico = n.actor_role === "AI_AGENT" ? "El asistente" : n.actor_name === null ? "Un administrador" : null;
  if (generico === null) return n.actor_name!;
  return posicion === "inicio" ? generico : generico[0].toLowerCase() + generico.slice(1);
}

/** "de" + actor, con la contracción: "del asistente", "de un administrador", "de Hernando". */
function deActor(n: NotificationOut): string {
  const actor = nombreActor(n, "medio");
  return actor.startsWith("el ") ? `del ${actor.slice(3)}` : `de ${actor}`;
}

/** "Ana Pérez, Calle 10 # 5-20"; sin dirección, solo el cliente. */
function clienteYDireccion(n: NotificationOut): string {
  const cliente = n.client_name ?? "un cliente";
  return n.listing_address === null ? cliente : `${cliente}, ${n.listing_address}`;
}

export function fraseAviso(n: NotificationOut): FraseAviso {
  if (n.type === "LEAD_ASSIGNED") {
    // `assigned_via` siempre llega en este tipo; si faltara, "Nuevo lead" no afirma nada falso.
    const frase = n.assigned_via === "REASSIGNED"
      ? `${nombreActor(n)} te asignó un lead: ${clienteYDireccion(n)}`
      : `Nuevo lead ${deActor(n)}: ${clienteYDireccion(n)}`;
    return { frase, etiqueta: null, requiereConfirmacion: false };
  }

  const cuando = n.visit_scheduled_at === null ? "" : ` el ${fechaHoraLarga(n.visit_scheduled_at)}`;
  const requiereConfirmacion = n.visit_status === "PENDING_CONFIRMATION";
  const frase = `${nombreActor(n)} agendó una visita con ${n.client_name ?? "un cliente"}${cuando}`
    + (requiereConfirmacion ? ": requiere tu confirmación" : "");
  return {
    frase,
    etiqueta: n.visit_status === null ? null : ETIQUETA_VISITA[n.visit_status],
    requiereConfirmacion,
  };
}

/**
 * A dónde lleva el clic. Una visita va a su entrada en el historial del lead
 * (`#cita-…`, tarea 2.34), no a `/citas/[id]`, que es la página del cliente.
 */
export function destinoAviso(n: NotificationOut): string {
  const lead = `/leads/${n.lead_id}`;
  return n.type === "VISIT_SCHEDULED" && n.appointment_id !== null ? `${lead}#cita-${n.appointment_id}` : lead;
}
