/**
 * Tarea 2.21 — HU-12 AC2. Rellenar una plantilla con los datos del lead.
 *
 * Funciones puras, sin red ni reloj implícito: `construirContexto` recibe lo
 * que la página del lead ya carga (y la hora de referencia), y `rellenar`
 * solo sustituye. La regla que más importa: una variable sin dato **nunca se
 * inventa ni se borra**. Queda escrita en el texto como
 * `[falta: fecha de la visita]` y sale en `faltantes`, para que el botón de
 * enviar avise antes de que el mensaje llegue así al cliente.
 */
import { fechaLarga, horaLocal, precioEnTexto } from "@/lib/format";
import {
  TERMINAL_APPOINTMENT_STATUS,
  type AgentListItem, type Appointment, type Lead, type LeadCard, type Listing,
} from "@/lib/schemas";

/** Las variables que el front sabe llenar, con su nombre legible para `[falta: …]`. */
export const VARIABLES = {
  client_name: "nombre del cliente",
  agent_name: "nombre del agente",
  listing_address: "dirección del inmueble",
  neighborhood: "barrio",
  price: "precio",
  visit_date: "fecha de la visita",
  visit_time: "hora de la visita",
} as const;

export type Variable = keyof typeof VARIABLES;

/** Valores ya listos para el texto. `null` (o vacío) es "no hay dato". */
export type Contexto = Partial<Record<Variable, string | null>>;

export interface Faltante {
  /** Tal como está en la plantilla, sin llaves. */
  variable: string;
  etiqueta: string;
}

export interface Rellenado {
  texto: string;
  /** Sin repetidos, en el orden en que aparecen en el texto. */
  faltantes: Faltante[];
}

const MARCADOR = /\{([a-z_]+)\}/g;

function esVariable(nombre: string): nombre is Variable {
  return Object.prototype.hasOwnProperty.call(VARIABLES, nombre);
}

/**
 * Sustituye cada `{variable}` de `texto` por su valor en `contexto`. Una
 * variable sin dato, o que el front no conoce (un error de tipeo en la
 * plantilla), queda como `[falta: …]` y se reporta. Una sola pasada: un
 * valor que traiga llaves no se vuelve a interpretar.
 */
export function rellenar(texto: string, contexto: Contexto): Rellenado {
  const faltantes: Faltante[] = [];
  const resultado = texto.replace(MARCADOR, (_, nombre: string) => {
    const valor = esVariable(nombre) ? contexto[nombre]?.trim() : undefined;
    if (valor) return valor;
    const etiqueta = esVariable(nombre) ? VARIABLES[nombre] : nombre;
    if (!faltantes.some(f => f.variable === nombre)) faltantes.push({ variable: nombre, etiqueta });
    return `[falta: ${etiqueta}]`;
  });
  return { texto: resultado, faltantes };
}

/**
 * La cita de la que habla la plantilla: la próxima que sigue en pie (no
 * terminal y desde `ahora`) o, si no hay, la última completada (post-visita).
 * Una cita vieja que nadie cerró no cuenta: mejor faltante que una fecha
 * pasada en un mensaje de confirmación.
 */
export function citaDeReferencia(citas: readonly Appointment[], ahora: Date): Appointment | null {
  const t = ahora.getTime();
  const terminal = TERMINAL_APPOINTMENT_STATUS as readonly string[];
  const proxima = citas
    .filter(c => !terminal.includes(c.status) && Date.parse(c.scheduled_at) >= t)
    .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))[0];
  if (proxima) return proxima;
  return citas
    .filter(c => c.status === "COMPLETED")
    .sort((a, b) => Date.parse(b.scheduled_at) - Date.parse(a.scheduled_at))[0] ?? null;
}

/**
 * Arma el contexto con lo que ya carga la página del lead. `client_name` solo
 * llega si `lead` es una `LeadCard` (GET /leads); `GET /leads/{id}` devuelve
 * `LeadOut`, que no lo trae (bloqueo 12), así que ahí queda faltante.
 * `agente` es el dueño del lead, no necesariamente quien usa la app.
 */
export function construirContexto(
  lead: Lead | LeadCard,
  listing: Listing | null,
  citas: readonly Appointment[],
  agente: Pick<AgentListItem, "full_name"> | null,
  ahora: Date = new Date(),
): Contexto {
  const cita = citaDeReferencia(citas, ahora);
  return {
    client_name: "client_name" in lead ? lead.client_name : null,
    agent_name: agente?.full_name ?? null,
    listing_address: listing?.address ?? null,
    neighborhood: listing?.neighborhood ?? null,
    price: listing ? precioEnTexto(listing.asking_price) : null,
    visit_date: cita ? fechaLarga(cita.scheduled_at) : null,
    visit_time: cita ? horaLocal(cita.scheduled_at) : null,
  };
}
