/**
 * Fuente única de las etapas del lead: orden, etiquetas en español y qué
 * saltos son legales. Sin dependencias en tiempo de ejecución (solo tipos),
 * así que se puede importar tanto desde Server como desde Client Components.
 *
 * Las reglas replican las del API, docs/API_CONTRACT.md §3
 * (`POST /leads/{lead_id}/transitions`): el embudo avanza de a una etapa y
 * solo hacia adelante, cualquier etapa no terminal puede saltar a `LOST`, y
 * `WON`/`LOST` son terminales. El API sigue siendo la autoridad: esto sirve
 * para no ofrecer en la UI un movimiento que va a dar 409.
 */
import type { LostReason, Stage } from "./schemas";

/** El camino hacia adelante, sin `LOST`. */
export const EMBUDO: readonly Stage[] = [
  "INTERESTED", "VISIT_SCHEDULED", "VISITED", "NEGOTIATING", "WON",
];

/** Todas las etapas, en el orden de las columnas del tablero. */
export const ETAPAS: readonly Stage[] = [...EMBUDO, "LOST"];

export const ETIQUETA_ETAPA: Record<Stage, string> = {
  INTERESTED: "Interesado",
  VISIT_SCHEDULED: "Visita agendada",
  VISITED: "Visitó",
  NEGOTIATING: "Negociando",
  WON: "Ganado",
  LOST: "Perdido",
};

export const ETIQUETA_MOTIVO_PERDIDA: Record<LostReason, string> = {
  PRICE: "Precio",
  LOCATION: "Ubicación",
  BOUGHT_ELSEWHERE: "Compró en otro lado",
  NO_RESPONSE: "Dejó de responder",
  FINANCING: "Financiación",
  OTHER: "Otro motivo",
};

export function esTerminal(etapa: Stage): boolean {
  return etapa === "WON" || etapa === "LOST";
}

/** ¿El API acepta mover un lead de `desde` a `hacia`? */
export function puedeMover(desde: Stage, hacia: Stage): boolean {
  if (esTerminal(desde) || desde === hacia) return false;
  if (hacia === "LOST") return true;
  return EMBUDO.indexOf(hacia) === EMBUDO.indexOf(desde) + 1;
}

/** Las etapas a las que se puede mover un lead que está en `desde`. */
export function destinosLegales(desde: Stage): Stage[] {
  return ETAPAS.filter(hacia => puedeMover(desde, hacia));
}
