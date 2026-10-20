/**
 * Tarea 2.21 — HU-12. Las cuatro plantillas base de mensajes al cliente.
 *
 * Viven en el código porque no hay dónde guardarlas (bloqueo 8): su lugar
 * definitivo es `agency_settings.bot.templates`. Para que migren sin
 * traducir, la `clave` y las variables son las de la propuesta del back
 * (homelitics-crm, docs/PROPOSAL_agency_bots_notifications.md §3.3):
 * `welcome`, `visit_confirmed`, `post_visit_feedback` y `re_engagement`,
 * con `{client_name}`, `{agent_name}`, etc. Las variables que el front sabe
 * llenar están en `VARIABLES` (rellenar.ts).
 *
 * Sin dependencias en tiempo de ejecución: se importa desde Server y Client
 * Components.
 */
import type { Stage } from "@/lib/schemas";

export type ClavePlantilla = "welcome" | "visit_confirmed" | "post_visit_feedback" | "re_engagement";

export interface Plantilla {
  clave: ClavePlantilla;
  titulo: string;
  texto: string;
  /** Etapas del lead en las que el panel la ofrece primero. */
  etapas: readonly Stage[];
}

export const PLANTILLAS: readonly Plantilla[] = [
  {
    clave: "welcome",
    titulo: "Bienvenida",
    texto:
      "Hola, {client_name}. Soy {agent_name}. Vi que te interesó el inmueble de " +
      "{listing_address}, en {neighborhood}. ¿Quieres que agendemos una visita " +
      "o prefieres que primero te cuente más detalles?",
    etapas: ["INTERESTED"],
  },
  {
    clave: "visit_confirmed",
    titulo: "Confirmación de visita",
    texto:
      "Hola, {client_name}. Te confirmo la visita al inmueble de {listing_address}, " +
      "en {neighborhood}, el {visit_date} a las {visit_time}. Si necesitas cambiar " +
      "la hora, me avisas por aquí. Nos vemos allá. {agent_name}",
    etapas: ["VISIT_SCHEDULED"],
  },
  {
    clave: "post_visit_feedback",
    titulo: "Después de la visita",
    texto:
      "Hola, {client_name}. Gracias por venir el {visit_date} a conocer el inmueble " +
      "de {listing_address}. ¿Qué te pareció? De 1 a 5, ¿qué tanto te gustó? Si te " +
      "quedó alguna duda sobre el precio o el sector, con gusto te ayudo. {agent_name}",
    etapas: ["VISITED"],
  },
  {
    clave: "re_engagement",
    titulo: "Reactivación",
    texto:
      "Hola, {client_name}. Hace un tiempo hablamos del inmueble de {listing_address}, " +
      "en {neighborhood}, y sigue disponible por {price}. ¿Todavía estás buscando? " +
      "Si quieres, te muestro otras opciones parecidas. {agent_name}",
    etapas: ["NEGOTIATING", "LOST"],
  },
];

/**
 * La plantilla que se ofrece primero para un lead en `etapa`, o `null` si
 * ninguna aplica (`WON`). El agente igual puede elegir cualquiera.
 */
export function plantillaSugerida(etapa: Stage): Plantilla | null {
  return PLANTILLAS.find(p => p.etapas.includes(etapa)) ?? null;
}
