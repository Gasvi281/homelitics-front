/**
 * Datos falsos con la MISMA forma que el API real. Todo pasa por
 * lib/schemas.ts antes de llegar a una pantalla, igual que los datos reales
 * (ver README.md de esta carpeta para el origen narrativo de estos valores).
 *
 * `resolverMock` recibe también el método HTTP y, si lo hay, el cuerpo de la
 * petición: varios endpoints comparten path entre verbos
 * (`GET/POST /leads/{id}/appointments`, `/interactions`) y sin el método no
 * hay forma de saber si hay que devolver una lista o crear un registro.
 * lib/homelitics.ts ya los reenvía.
 *
 * Guarda estado en memoria a nivel de módulo (las citas e interacciones que
 * se crean en una sesión de `npm run dev` persisten hasta que el servidor se
 * reinicia). Es justo lo que hace falta para maquetar: crear una cita en la
 * pantalla 2.2 y verla reflejada en la 2.3, por ejemplo.
 *
 * IDs fijos para reproducir cada caso de la pantalla que se está maquetando:
 *
 * | Escenario                                      | ID                        |
 * |-------------------------------------------------|---------------------------|
 * | Lead con historia (2.1 a 2.4)                    | `LEAD_ID`                 |
 * | Lead recién creado, sin nada todavía (lista vacía)| `LEAD_ID_VACIO`          |
 * | Cita pendiente, la del prototipo (jue 17, 10:30)  | `APPOINTMENT_ID`          |
 * | Cita ya cancelada (2.3: acciones deshabilitadas)  | `APPOINTMENT_ID_CANCELADA`|
 * | Visita confirmada pero no completada (2.5: 409)   | `APPOINTMENT_ID_NO_COMPLETADA` |
 * | Visita completada (2.5: la encuesta sí procede)   | `APPOINTMENT_ID_COMPLETADA` |
 * | Tablero: lead en NEGOTIATING (puede ir a WON o LOST) | `LEAD_ID_NEGOCIANDO`   |
 * | Tablero: lead ya WON (mover da 409)               | `LEAD_ID_GANADO`          |
 * | Tablero: lead ya LOST, con su STATUS_CHANGE       | `LEAD_ID_PERDIDO`         |
 * | Inmueble con dos publicaciones (filtro property_id)| `PROPERTY_ID_DOBLE`      |
 * | Agentes de la agencia (GET /agents)               | `AGENT_ID`, `AGENT_ID_PAULA`, `AGENT_ID_ANDRES`, `AGENT_ID_INACTIVO` |
 * | Bot de la agencia (solo con `include_bots=true`)  | `AGENT_ID_BOT`            |
 * | Tarea pendiente de Laura (PATCH de HU-11)         | `TASK_ID`                 |
 * | Recordatorio que vence 3 min después del arranque (2.26) | `TASK_ID_POR_VENCER` |
 * | Riesgo: creado hace 2 h, más nuevo que 24 h        | `LEAD_ID_RECIENTE`        |
 * | Riesgo: llamada humana hace 6 h, fuera a 24 h      | `LEAD_ID_ATENDIDO`        |
 * | Riesgo: solo le contestó el bot, sigue en riesgo   | `LEAD_ID_SOLO_BOT`        |
 * | Riesgo: solo tiene una nota saliente, sigue en riesgo | `LEAD_ID_SOLO_NOTA`    |
 *
 * GET /leads devuelve 15 tarjetas repartidas en las seis etapas, y
 * POST /leads/{id}/transitions aplica las reglas del API (409 y 422) y mueve
 * `current_stage` en memoria. POST /leads/{id}/reassign (HU-08) también:
 * 403 si el rol no es TEAM_ADMIN, 404 si el destino no existe, 409 si está
 * inactivo (`AGENT_ID_INACTIVO`), es un bot (`AGENT_ID_BOT`) o ya es el dueño;
 * si no, cambia `agent_id`.
 *
 * "Horario ocupado" (2.2) no necesita un id especial: alcanza con pedir dos
 * veces la misma cita para el mismo agente, o con pedir una de las casillas
 * que `slots` ya marca como ocupadas para esa semana.
 */
import { addDays } from "date-fns";
import { z } from "zod";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { HomeliticsError, type ErrorKind } from "../errores";
import { TZ } from "../format";
import { EMBUDO, destinosLegales, esTerminal, puedeMover } from "../etapas";
import {
  LostReason, Stage, TaskStatus, TERMINAL_APPOINTMENT_STATUS,
  type Agent, type AgentListItem, type Appointment, type AppointmentDetail, type Feedback,
  type Interaction, type Lead, type LeadCard, type Listing, type RiesgoAgente, type RiesgoPorAgente,
  type TareaAgencia, type Task, type Transition,
} from "../schemas";

/* ---------- ids fijos, para que capturas y demo coincidan ---------- */

function uuid(n: number): string {
  return `a10a1000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

const AGENT_ID = uuid(1);
const AGENCY_ID = uuid(2);
const LISTING_ID = uuid(3);
const PROPERTY_ID = uuid(4);
const CLIENT_ID = uuid(5);
const LEAD_ID = uuid(6);
const CLIENT_ID_VACIO = uuid(7);
const LEAD_ID_VACIO = uuid(8);
const APPOINTMENT_ID = uuid(9);
const APPOINTMENT_ID_CANCELADA = uuid(10);
const APPOINTMENT_ID_NO_COMPLETADA = uuid(11);
const APPOINTMENT_ID_COMPLETADA = uuid(12);

/* Tablero (HU-06): más listings y leads repartidos en todas las etapas. */
const LISTING_ID_LAURELES_VENTA = uuid(100);
const LISTING_ID_LAURELES_ARRIENDO = uuid(101);
const LISTING_ID_POBLADO = uuid(102);
const LISTING_ID_ENVIGADO = uuid(103);
/** Un inmueble con dos publicaciones (SALE y RENT): prueba el filtro `property_id`. */
const PROPERTY_ID_DOBLE = uuid(110);
const LEAD_ID_NEGOCIANDO = uuid(126);
const LEAD_ID_GANADO = uuid(128);
const LEAD_ID_PERDIDO = uuid(130);

/*
 * Leads en riesgo (HU-10): GET /leads/at-risk cuenta hacia atrás desde AHORA,
 * así que estos casos se fechan respecto al arranque del mock y no a
 * septiembre. Con 24 h: el recién llegado no está en riesgo (es más nuevo que
 * la ventana) y el atendido tampoco (llamada humana hace 6 h); el que solo
 * contestó el bot y el que solo tiene una nota sí lo están.
 */
const LEAD_ID_RECIENTE = uuid(132);
const LEAD_ID_ATENDIDO = uuid(127);
const LEAD_ID_SOLO_BOT = uuid(121);
const LEAD_ID_SOLO_NOTA = uuid(123);
const ARRANQUE = Date.now();
const haceHoras = (h: number) => new Date(ARRANQUE - h * 3_600_000).toISOString();

/* Agentes de la misma agencia (HU-08 y HU-17). `AGENT_ID` es el demo. */
const AGENT_ID_PAULA = uuid(30);
const AGENT_ID_ANDRES = uuid(31);
/** Desactivado: no sale con `?active=true` y no puede recibir leads. */
const AGENT_ID_INACTIVO = uuid(32);
/** `AI_AGENT`: fuera de GET /agents salvo `include_bots`, y no puede tener leads. */
const AGENT_ID_BOT = uuid(33);

/** Contador para ids generados en POST (citas, interacciones, feedback nuevos). */
let siguienteId = 1000;
const nuevoId = () => uuid(siguienteId++);

/* ---------- datos base ---------- */

const agente: Agent = {
  id: AGENT_ID,
  agency_id: AGENCY_ID,
  role: "TEAM_ADMIN",
  active: true,
  full_name: "Hernando Carrillo",
  email: null,
};

/**
 * GET /agents (`AgentListItem`, sin email): el demo, tres más de su agencia
 * y el bot, en orden de creación ("oldest first", como el API).
 */
const agentes: AgentListItem[] = [
  { id: agente.id, agency_id: agente.agency_id, role: agente.role, active: agente.active, full_name: agente.full_name },
  { id: AGENT_ID_PAULA, agency_id: AGENCY_ID, role: "AGENT", active: true, full_name: "Paula Gómez" },
  { id: AGENT_ID_ANDRES, agency_id: AGENCY_ID, role: "AGENT", active: true, full_name: "Andrés Montoya" },
  { id: AGENT_ID_INACTIVO, agency_id: AGENCY_ID, role: "AGENT", active: false, full_name: "Carlos Úsuga" },
  { id: AGENT_ID_BOT, agency_id: AGENCY_ID, role: "AI_AGENT", active: true, full_name: "Asistente Homelitics" },
];

const listings: Listing[] = [
  /** Manila 206. Los mismos valores que el ejemplo de docs/API_CONTRACT.md. */
  {
    id: LISTING_ID,
    property_id: PROPERTY_ID,
    agent_id: AGENT_ID,
    operation_type: "SALE",
    asking_price: "650137717.29",
    status: "ACTIVE",
    published_at: "2026-08-01T20:52:40.861578Z",
    city: "Medellín",
    neighborhood: "Manila",
    address: "Transversal 80A # 81-57 Apto 206",
    property_type: "APARTMENT",
    area_m2: "83.80",
    bedrooms: 1,
    bathrooms: 1,
  },
  {
    id: LISTING_ID_LAURELES_VENTA,
    property_id: PROPERTY_ID_DOBLE,
    agent_id: AGENT_ID,
    operation_type: "SALE",
    asking_price: "480000000.00",
    status: "ACTIVE",
    published_at: "2026-07-20T15:00:00Z",
    city: "Medellín",
    neighborhood: "Laureles",
    address: "Circular 73B # 39-40 Casa 12",
    property_type: "HOUSE",
    area_m2: "142.00",
    bedrooms: 3,
    bathrooms: 2,
  },
  {
    id: LISTING_ID_LAURELES_ARRIENDO,
    property_id: PROPERTY_ID_DOBLE,
    agent_id: AGENT_ID,
    operation_type: "RENT",
    asking_price: "3200000.00",
    status: "ACTIVE",
    published_at: "2026-07-20T15:05:00Z",
    city: "Medellín",
    neighborhood: "Laureles",
    address: "Circular 73B # 39-40 Casa 12",
    property_type: "HOUSE",
    area_m2: "142.00",
    bedrooms: 3,
    bathrooms: 2,
  },
  {
    id: LISTING_ID_POBLADO,
    property_id: uuid(111),
    agent_id: AGENT_ID,
    operation_type: "SALE",
    asking_price: "1250000000.00",
    status: "ACTIVE",
    published_at: "2026-07-02T13:30:00Z",
    city: "Medellín",
    neighborhood: "El Poblado",
    address: "Carrera 43A # 9 Sur-91 Apto 1504",
    property_type: "APARTMENT",
    area_m2: "118.50",
    bedrooms: 3,
    bathrooms: 3,
  },
  /** Sin dirección ni ficha: el caso nullable del contrato. */
  {
    id: LISTING_ID_ENVIGADO,
    property_id: uuid(112),
    agent_id: AGENT_ID,
    operation_type: "RENT",
    asking_price: "2100000.00",
    status: "ACTIVE",
    published_at: "2026-08-05T18:00:00Z",
    city: "Envigado",
    neighborhood: "Zúñiga",
    address: null,
    property_type: null,
    area_m2: null,
    bedrooms: null,
    bathrooms: null,
  },
];

/** Un lead del mock guarda el nombre del cliente: el API lo resuelve al armar la tarjeta. */
type LeadMock = Lead & { client_name: string | null };

function leadMock(
  id: string, clientId: string, clientName: string | null, listingId: string,
  canal: Lead["source_channel"], etapa: Lead["current_stage"], creado: string, actualizado: string,
  agentId: string = AGENT_ID,
): LeadMock {
  return {
    id, client_id: clientId, client_name: clientName, listing_id: listingId, agent_id: agentId,
    source_channel: canal, current_stage: etapa, created_at: creado, updated_at: actualizado,
  };
}

/**
 * Repartidos entre los cuatro agentes para que reasignar (HU-08) tenga
 * sentido. Los que tienen citas (`LEAD_ID`, y `LEAD_ID_VACIO` para agendar
 * desde cero) se quedan con el demo: las citas semilla son suyas. El agente
 * inactivo conserva dos leads, uno abierto: el caso típico de reasignación.
 * En memoria: POST /leads/{id}/transitions cambia `current_stage` aquí.
 */
let leads: LeadMock[] = [
  /** Laura Restrepo. Primer contacto el 1 de septiembre por Telegram. */
  leadMock(LEAD_ID, CLIENT_ID, "Laura Restrepo", LISTING_ID, "TELEGRAM", "VISIT_SCHEDULED",
    "2026-09-01T14:05:00Z", "2026-09-08T16:00:00Z"),
  /** Lead recién creado, sin interacciones, tareas ni citas: el caso de lista vacía. */
  leadMock(LEAD_ID_VACIO, CLIENT_ID_VACIO, null, LISTING_ID, "IN_APP", "INTERESTED",
    "2026-09-09T20:00:00Z", "2026-09-09T20:00:00Z"),
  leadMock(uuid(120), uuid(140), "Camila Ortiz", LISTING_ID_LAURELES_VENTA, "TELEGRAM", "INTERESTED",
    "2026-09-20T13:10:00Z", "2026-09-20T13:32:00Z", AGENT_ID_PAULA),
  leadMock(uuid(121), uuid(141), "Juan Pablo Mejía", LISTING_ID_POBLADO, "CALL", "INTERESTED",
    "2026-09-24T15:00:00Z", "2026-09-24T15:12:00Z", AGENT_ID_ANDRES),
  leadMock(uuid(122), uuid(142), "Sofía Zapata", LISTING_ID_LAURELES_ARRIENDO, "TELEGRAM", "VISIT_SCHEDULED",
    "2026-09-10T16:40:00Z", "2026-09-22T14:00:00Z", AGENT_ID_PAULA),
  leadMock(uuid(123), uuid(143), null, LISTING_ID_ENVIGADO, "IN_APP", "VISIT_SCHEDULED",
    "2026-09-12T21:15:00Z", "2026-09-21T12:30:00Z", AGENT_ID_INACTIVO),
  leadMock(uuid(124), uuid(144), "Mateo Arango", LISTING_ID_LAURELES_VENTA, "TELEGRAM", "VISITED",
    "2026-08-25T17:00:00Z", "2026-09-18T19:45:00Z"),
  leadMock(uuid(125), uuid(145), "Valentina Rojas", LISTING_ID, "CALL", "VISITED",
    "2026-08-28T14:20:00Z", "2026-09-19T16:10:00Z", AGENT_ID_PAULA),
  leadMock(LEAD_ID_NEGOCIANDO, uuid(146), "Daniel Henao", LISTING_ID_POBLADO, "TELEGRAM", "NEGOTIATING",
    "2026-08-12T15:30:00Z", "2026-09-23T22:05:00Z"),
  leadMock(uuid(127), uuid(147), "Isabella Cardona", LISTING_ID_LAURELES_ARRIENDO, "IN_APP", "NEGOTIATING",
    "2026-08-18T13:00:00Z", "2026-09-15T18:20:00Z", AGENT_ID_ANDRES),
  leadMock(LEAD_ID_GANADO, uuid(148), "Santiago Posada", LISTING_ID_LAURELES_VENTA, "CALL", "WON",
    "2026-08-03T16:00:00Z", "2026-09-05T20:00:00Z"),
  leadMock(uuid(129), uuid(149), "Mariana Vélez", LISTING_ID_ENVIGADO, "TELEGRAM", "WON",
    "2026-08-06T19:30:00Z", "2026-08-30T15:00:00Z", AGENT_ID_PAULA),
  leadMock(LEAD_ID_PERDIDO, uuid(150), "Felipe Correa", LISTING_ID_POBLADO, "TELEGRAM", "LOST",
    "2026-08-10T14:00:00Z", "2026-09-02T17:30:00Z", AGENT_ID_ANDRES),
  leadMock(uuid(131), uuid(151), null, LISTING_ID, "IN_APP", "LOST",
    "2026-08-20T20:10:00Z", "2026-08-27T13:00:00Z", AGENT_ID_INACTIVO),
  /** HU-10: escribió hace 2 h y nadie le ha contestado, pero es más nuevo que la ventana de 24 h. */
  leadMock(LEAD_ID_RECIENTE, uuid(152), "Tomás Echeverri", LISTING_ID_POBLADO, "TELEGRAM", "INTERESTED",
    haceHoras(2), haceHoras(2), AGENT_ID_PAULA),
];

function buscarLead(id: string): LeadMock | undefined {
  return leads.find(l => l.id === id);
}

function buscarListing(id: string): Listing | undefined {
  return listings.find(l => l.id === id);
}

/**
 * Estados que descuentan un horario, confirmado por la línea 1 el 2026-09-03
 * (ver docs/API_CONTRACT.md, sección de `/agents/{id}/slots`).
 */
const BLOQUEA: ReadonlySet<string> = new Set(["PENDING_CONFIRMATION", "CONFIRMED", "RESCHEDULED"]);

/** Horarios ocupados de ejemplo del prototipo (README.md), hora de Bogotá. */
const OCUPADOS_SEMANALES: Record<number, string[]> = {
  1: ["09:00", "10:30"], // lunes
  2: ["11:00"], // martes
  3: ["09:00", "09:30", "10:00"], // miércoles
  5: ["10:00", "11:30"], // viernes
};

let citas: Appointment[] = [
  {
    id: APPOINTMENT_ID,
    lead_id: LEAD_ID,
    agent_id: AGENT_ID,
    scheduled_at: "2026-09-17T15:30:00Z", // jueves 17, 10:30 Bogotá
    duration_min: 30,
    status: "PENDING_CONFIRMATION",
    created_by: null,
    created_at: "2026-09-08T16:00:00Z",
    updated_at: "2026-09-08T16:00:00Z",
  },
  {
    id: APPOINTMENT_ID_CANCELADA,
    lead_id: LEAD_ID,
    agent_id: AGENT_ID,
    scheduled_at: "2026-09-03T14:00:00Z",
    duration_min: 60,
    status: "CANCELLED",
    created_by: null,
    created_at: "2026-09-01T15:00:00Z",
    updated_at: "2026-09-02T13:00:00Z",
  },
  {
    id: APPOINTMENT_ID_NO_COMPLETADA,
    lead_id: LEAD_ID,
    agent_id: AGENT_ID,
    scheduled_at: "2026-09-05T15:00:00Z",
    duration_min: 30,
    status: "CONFIRMED",
    created_by: null,
    created_at: "2026-09-02T12:00:00Z",
    updated_at: "2026-09-04T12:00:00Z",
  },
  {
    id: APPOINTMENT_ID_COMPLETADA,
    lead_id: LEAD_ID,
    agent_id: AGENT_ID,
    scheduled_at: "2026-09-02T15:00:00Z",
    duration_min: 30,
    status: "COMPLETED",
    created_by: null,
    created_at: "2026-09-01T16:00:00Z",
    updated_at: "2026-09-02T16:00:00Z",
  },
];

let interacciones: Interaction[] = [
  {
    id: uuid(13),
    lead_id: LEAD_ID,
    direction: "INBOUND",
    channel: "TELEGRAM",
    type: "MESSAGE",
    body: "Hola, vi el apartamento de Manila en el portal, ¿todavía está disponible?",
    occurred_at: "2026-09-01T14:05:00Z",
    created_by: null,
  },
  {
    id: uuid(14),
    lead_id: LEAD_ID,
    direction: "OUTBOUND",
    channel: "TELEGRAM",
    type: "MESSAGE",
    body: "Hola Laura, sí, sigue disponible. ¿Quieres que agendemos una visita?",
    occurred_at: "2026-09-01T14:22:00Z",
    created_by: AGENT_ID,
  },
  {
    id: uuid(15),
    lead_id: LEAD_ID,
    direction: "OUTBOUND",
    channel: "IN_APP",
    type: "STATUS_CHANGE",
    body: "Se agendó una visita para el jueves 17 a las 10:30.",
    occurred_at: "2026-09-08T16:00:00Z",
    created_by: AGENT_ID,
  },
  // Tablero: la última de cada lead es su `last_interaction`.
  mensaje(200, uuid(120), "INBOUND", "TELEGRAM", "Buenas, ¿la casa de Laureles tiene parqueadero?", "2026-09-20T13:10:00Z"),
  mensaje(201, uuid(120), "OUTBOUND", "TELEGRAM", "Hola Camila, sí: tiene dos parqueaderos cubiertos.", "2026-09-20T13:32:00Z"),
  mensaje(202, uuid(121), "INBOUND", "CALL", null, "2026-09-24T15:12:00Z", "CALL"),
  mensaje(203, uuid(122), "INBOUND", "TELEGRAM", "Perfecto, nos vemos el sábado en la casa.", "2026-09-22T14:00:00Z"),
  mensaje(204, uuid(123), "OUTBOUND", "IN_APP", "Llamar el viernes para confirmar la visita al de Zúñiga.", "2026-09-21T12:30:00Z", "NOTE"),
  mensaje(205, uuid(124), "INBOUND", "TELEGRAM", "Me gustó mucho, pero quiero verla otra vez con mi esposa antes de decidir.", "2026-09-18T19:45:00Z"),
  mensaje(206, uuid(125), "OUTBOUND", "CALL", null, "2026-09-19T16:10:00Z", "CALL"),
  mensaje(207, LEAD_ID_NEGOCIANDO, "INBOUND", "TELEGRAM",
    "Le ofrezco 1.180 millones si el propietario deja los muebles de la cocina y entregan antes de diciembre. Es mi última oferta, díganme esta semana por favor.",
    "2026-09-23T22:05:00Z"),
  mensaje(208, uuid(127), "OUTBOUND", "IN_APP", "El propietario acepta el canon si firman a un año.", "2026-09-15T18:20:00Z"),
  mensaje(209, LEAD_ID_GANADO, "INBOUND", "CALL", "Ya firmamos la promesa, ¡gracias!", "2026-09-05T20:00:00Z"),
  mensaje(210, uuid(129), "OUTBOUND", "TELEGRAM", "Bienvenida al apartamento, Mariana.", "2026-08-30T15:00:00Z"),
  mensaje(211, LEAD_ID_PERDIDO, "INBOUND", "TELEGRAM", "Encontré algo parecido en Envigado por menos plata.", "2026-09-02T17:00:00Z"),
  // Lo que escribe el API al pasar a LOST (docs/API_CONTRACT.md, POST .../transitions).
  mensaje(212, LEAD_ID_PERDIDO, "OUTBOUND", "IN_APP", "Lost: PRICE — Consiguió uno más barato en Envigado", "2026-09-02T17:30:00Z", "STATUS_CHANGE"),
  mensaje(213, uuid(131), "OUTBOUND", "IN_APP", "Lost: NO_RESPONSE", "2026-08-27T13:00:00Z", "STATUS_CHANGE"),
  // HU-10, relativos al arranque (ver LEAD_ID_RECIENTE).
  mensaje(214, LEAD_ID_RECIENTE, "INBOUND", "TELEGRAM", "Hola, ¿el apartamento del Poblado tiene balcón?", haceHoras(2)),
  // Lo escribe el bot: para el API no es respuesta y el lead sigue en riesgo.
  {
    ...mensaje(215, LEAD_ID_SOLO_BOT, "OUTBOUND", "TELEGRAM",
      "Hola, soy el asistente de Homelitics. Un asesor te contacta pronto.", haceHoras(3)),
    created_by: AGENT_ID_BOT,
  },
  mensaje(216, LEAD_ID_ATENDIDO, "OUTBOUND", "CALL", null, haceHoras(6), "CALL"),
];

function mensaje(
  n: number, leadId: string, direccion: Interaction["direction"], canal: Interaction["channel"],
  cuerpo: string | null, cuando: string, tipo: Interaction["type"] = "MESSAGE",
): Interaction {
  return {
    id: uuid(n), lead_id: leadId, direction: direccion, channel: canal, type: tipo,
    body: cuerpo, occurred_at: cuando,
    // Lo que sale lo escribe el dueño del lead; lo que entra, el cliente.
    created_by: direccion === "OUTBOUND" ? buscarLead(leadId)?.agent_id ?? AGENT_ID : null,
  };
}

/** Desde qué etapa se perdió cada lead LOST de la semilla. */
const PERDIDO_DESDE: Record<string, Stage> = {
  [LEAD_ID_PERDIDO]: "VISITED",
  [uuid(131)]: "INTERESTED",
};

/**
 * Log de transiciones semilla: el camino del embudo hasta la etapa actual,
 * repartido entre `created_at` y `updated_at`. La primera fila no tiene
 * etapa de origen, como en el API.
 */
function historialSemilla(l: LeadMock): Transition[] {
  const hasta = l.current_stage === "LOST" ? PERDIDO_DESDE[l.id] ?? "INTERESTED" : l.current_stage;
  const camino: Stage[] = EMBUDO.slice(0, EMBUDO.indexOf(hasta) + 1);
  if (l.current_stage === "LOST") camino.push("LOST");

  const inicio = new Date(l.created_at).getTime();
  const fin = new Date(l.updated_at).getTime();
  return camino.map((etapa, i) => ({
    id: nuevoId(),
    lead_id: l.id,
    from_stage: i === 0 ? null : camino[i - 1],
    to_stage: etapa,
    changed_by: i === 0 ? null : l.agent_id,
    changed_at: new Date(camino.length === 1 ? inicio : inicio + ((fin - inicio) * i) / (camino.length - 1)).toISOString(),
  }));
}

let transiciones: Transition[] = leads.flatMap(historialSemilla);

const TASK_ID = uuid(16);
/**
 * 2.26: vence 3 minutos después de que arranca el mock. Con
 * `NEXT_PUBLIC_USE_MOCKS=true` el mock del navegador arranca con la primera
 * petición de la página, así que la campanita la ve aparecer sin recargar.
 */
const TASK_ID_POR_VENCER = uuid(20);

/** Lo que guarda el mock: `TaskOut` más `source`, PROPUESTO (bloqueo 11). */
type TareaMock = TareaAgencia;

/** El `TaskOut` real sigue con siete campos: `source` solo sale en GET /tasks. */
function aTaskOut(t: TareaMock): Task {
  return {
    id: t.id, lead_id: t.lead_id, agent_id: t.agent_id, status: t.status,
    due_at: t.due_at, note: t.note, created_at: t.created_at,
  };
}

/**
 * En memoria: POST y PATCH de `/leads/{id}/tasks` la cambian. Las de GET
 * /tasks (2.25) van fechadas respecto al arranque, como las de riesgo: el
 * demo tiene tres pendientes vencidas (una sin nota, del barrido), una
 * pospuesta vencida y una hecha que no deben salir, y una que vence a los
 * 3 minutos; Paula tiene una vencida que tampoco es suya.
 */
let tareas: TareaMock[] = [
  {
    id: TASK_ID,
    lead_id: LEAD_ID,
    agent_id: AGENT_ID,
    status: "PENDING",
    due_at: "2026-09-16T20:00:00Z",
    note: "Confirmar con Laura la asistencia a la visita del jueves.",
    created_at: "2026-09-08T16:05:00Z",
    source: "MANUAL",
  },
  {
    id: uuid(17), lead_id: uuid(124), agent_id: AGENT_ID, status: "PENDING",
    due_at: haceHoras(1), note: null, created_at: haceHoras(1), source: "SWEEP",
  },
  {
    id: uuid(18), lead_id: LEAD_ID_VACIO, agent_id: AGENT_ID, status: "PENDING",
    due_at: haceHoras(0.25), note: "Darle la bienvenida y preguntarle qué busca.",
    created_at: haceHoras(0.5), source: "FIRST_TOUCH",
  },
  {
    id: uuid(19), lead_id: LEAD_ID, agent_id: AGENT_ID, status: "SNOOZED",
    due_at: haceHoras(5), note: "Mandarle a Laura fotos del parqueadero.",
    created_at: haceHoras(26), source: "MANUAL",
  },
  {
    id: TASK_ID_POR_VENCER, lead_id: LEAD_ID_NEGOCIANDO, agent_id: AGENT_ID, status: "PENDING",
    due_at: new Date(ARRANQUE + 3 * 60_000).toISOString(),
    note: "Enviarle a Daniel la contraoferta firmada.", created_at: haceHoras(2), source: "MANUAL",
  },
  {
    id: uuid(21), lead_id: uuid(120), agent_id: AGENT_ID_PAULA, status: "PENDING",
    due_at: haceHoras(4), note: null, created_at: haceHoras(4), source: "SWEEP",
  },
  {
    id: uuid(22), lead_id: LEAD_ID, agent_id: AGENT_ID, status: "DONE",
    due_at: haceHoras(30), note: "Llamar a Laura después de la visita.",
    created_at: haceHoras(48), source: "MANUAL",
  },
];

/** Catálogo de objeciones inventado solo para el mock: el API real no lo documenta. */
const OBJECION_A_ID: Record<string, string> = {
  PRICE: uuid(50),
  SIZE: uuid(51),
  LOCATION: uuid(52),
  CONDITION: uuid(53),
  HOA_FEE: uuid(54),
  OTHER: uuid(55),
};

/**
 * En memoria, como `citas` e `interacciones`. Como mucho una fila por
 * `(appointment_id, submitted_by)` — confirmado contra /openapi.json el
 * 2026-09-11 y documentado en docs/API_CONTRACT.md.
 */
let feedbacks: Feedback[] = [];

/* ---------- ayudas ---------- */

function noEncontrado(mensaje: string): never {
  throw new HomeliticsError("no_encontrado", mensaje, 404);
}

function seSuperponen(aInicio: Date, aFin: Date, bInicio: Date, bFin: Date): boolean {
  // Semiabiertos: una visita que termina a las 11:00 no bloquea otra que empieza a las 11:00.
  return aInicio < bFin && bInicio < aFin;
}

function finDeCita(c: Appointment): Date {
  return new Date(new Date(c.scheduled_at).getTime() + c.duration_min * 60_000);
}

function seSolapaConAlguna(inicio: Date, fin: Date, agentId: string, ignorarId?: string): boolean {
  return citas.some(c =>
    c.id !== ignorarId &&
    c.agent_id === agentId &&
    BLOQUEA.has(c.status) &&
    seSuperponen(inicio, fin, new Date(c.scheduled_at), finDeCita(c)),
  );
}

/**
 * Grilla de 30 minutos, de 08:00 a 18:00 hora de Bogotá, lunes a viernes.
 * El API real la calcula con las reglas de disponibilidad del agente
 * (`/agents/{id}/availability`, `/time-off`); acá esos horarios son fijos
 * porque esas reglas no las usa la línea 2 directamente. Ver docs/API_CONTRACT.md §7.
 */
function generarSlots(desde: Date, hasta: Date, agentId: string): string[] {
  if (desde >= hasta) {
    throw new HomeliticsError("invalido", "El rango from/to es inválido: from >= to.", 422);
  }

  const resultado: string[] = [];

  let cursor = fromZonedTime(`${diaBogotaStr(desde)}T00:00:00`, TZ);
  const ultimoDia = diaBogotaStr(hasta);

  while (diaBogotaStr(cursor) <= ultimoDia) {
    const fecha = diaBogotaStr(cursor);
    const weekday = Number(formatoDiaISO(cursor));
    if (weekday >= 1 && weekday <= 5) {
      for (let hora = 8; hora < 18; hora++) {
        for (const minuto of [0, 30]) {
          const hhmm = `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
          if (OCUPADOS_SEMANALES[weekday]?.includes(hhmm)) continue;

          const inicio = fromZonedTime(`${fecha}T${hhmm}:00`, TZ);
          if (inicio < desde || inicio >= hasta) continue;

          const fin = new Date(inicio.getTime() + 30 * 60_000);
          if (seSolapaConAlguna(inicio, fin, agentId)) continue;

          resultado.push(inicio.toISOString());
        }
      }
    }
    cursor = addDays(cursor, 1);
  }

  return resultado;
}

function diaBogotaStr(d: Date): string {
  return formatInTimeZone(d, TZ, "yyyy-MM-dd");
}

function formatoDiaISO(d: Date): string {
  return formatInTimeZone(d, TZ, "i"); // 1 (lunes) a 7 (domingo)
}

/* ---------- handlers por recurso ---------- */

function listingsMock(params: URLSearchParams): Listing[] {
  let resultado = listings;
  const status = params.get("status");
  const operationType = params.get("operation_type");
  const city = params.get("city"); // coincidencia exacta, como documenta el contrato
  if (status) resultado = resultado.filter(l => l.status === status);
  if (operationType) resultado = resultado.filter(l => l.operation_type === operationType);
  if (city) resultado = resultado.filter(l => l.city === city);
  return resultado;
}

function listingPorIdMock(id: string): Listing {
  return buscarListing(id) ?? noEncontrado("El listing no existe o es de otra agencia.");
}

/** El API corta el avance de `last_interaction.body` a 140 caracteres en SQL. */
const AVANCE_CHARS = 140;

/** Lo que devuelve GET /leads por cada lead: lead + listing + última interacción. */
function aTarjeta(l: LeadMock): LeadCard {
  const pub = buscarListing(l.listing_id)!;
  const ultima = interacciones
    .filter(i => i.lead_id === l.id)
    .reduce<Interaction | null>((max, i) => (!max || i.occurred_at > max.occurred_at ? i : max), null);
  return {
    ...aLeadOut(l),
    client_name: l.client_name,
    listing_address: pub.address,
    neighborhood: pub.neighborhood,
    operation_type: pub.operation_type,
    asking_price: pub.asking_price,
    last_interaction: ultima && {
      occurred_at: ultima.occurred_at,
      direction: ultima.direction,
      type: ultima.type,
      body: ultima.body?.slice(0, AVANCE_CHARS) ?? null,
    },
  };
}

/** GET /leads/{id} sigue siendo `LeadOut`: los 8 campos, sin los de la tarjeta. */
function aLeadOut(l: LeadMock): Lead {
  return {
    id: l.id, client_id: l.client_id, listing_id: l.listing_id, agent_id: l.agent_id,
    source_channel: l.source_channel, current_stage: l.current_stage,
    created_at: l.created_at, updated_at: l.updated_at,
  };
}

/**
 * Filtros de docs/API_CONTRACT.md §3. Los días de `created_from`/`created_to`
 * son inclusivos y se leen en hora de Bogotá, como `APP_TIMEZONE` del API.
 */
function leadsMock(params: URLSearchParams): LeadCard[] {
  const desde = params.get("created_from");
  const hasta = params.get("created_to");
  if (desde && hasta && desde > hasta) {
    throw new HomeliticsError("invalido", "created_from is after created_to", 422);
  }

  let resultado = leads;
  const stage = params.get("stage");
  const agentId = params.get("agent_id");
  const listingId = params.get("listing_id");
  const propertyId = params.get("property_id");
  const clientId = params.get("client_id");
  if (stage) resultado = resultado.filter(l => l.current_stage === stage);
  if (agentId) resultado = resultado.filter(l => l.agent_id === agentId);
  if (listingId) resultado = resultado.filter(l => l.listing_id === listingId);
  if (propertyId) resultado = resultado.filter(l => buscarListing(l.listing_id)?.property_id === propertyId);
  if (clientId) resultado = resultado.filter(l => l.client_id === clientId);
  if (params.get("active") === "true") resultado = resultado.filter(l => !esTerminal(l.current_stage));
  if (desde) resultado = resultado.filter(l => diaBogotaStr(new Date(l.created_at)) >= desde);
  if (hasta) resultado = resultado.filter(l => diaBogotaStr(new Date(l.created_at)) <= hasta);

  const limit = Number(params.get("limit") ?? 50);
  const offset = Number(params.get("offset") ?? 0);
  return [...resultado]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(offset, offset + limit)
    .map(aTarjeta);
}

function leadPorIdMock(id: string): Lead {
  return aLeadOut(buscarLead(id) ?? noEncontrado("El lead no existe o es de otra agencia."));
}

function transicionesMock(leadId: string): Transition[] {
  if (!buscarLead(leadId)) noEncontrado("El lead no existe o es de otra agencia.");
  return transiciones
    .filter(t => t.lead_id === leadId)
    .sort((a, b) => a.changed_at.localeCompare(b.changed_at));
}

/**
 * Mismas reglas que POST /leads/{id}/transitions del API, en el mismo orden:
 * primero la validación del cuerpo (422, en el API la hace Pydantic), luego
 * las reglas del embudo (409). Los mensajes imitan los del API.
 */
function moverLeadMock(leadId: string, cuerpo: Record<string, unknown> | undefined): Transition {
  const leadActual = buscarLead(leadId) ?? noEncontrado("El lead no existe o es de otra agencia.");

  const destino = Stage.safeParse(cuerpo?.to_stage);
  if (!destino.success) throw new HomeliticsError("invalido", "to_stage: etapa desconocida", 422);
  const motivoCrudo = cuerpo?.lost_reason ?? null;
  const motivo = motivoCrudo === null ? null : LostReason.safeParse(motivoCrudo).data;
  if (motivo === undefined) throw new HomeliticsError("invalido", "lost_reason: motivo desconocido", 422);
  if (destino.data === "LOST" && motivo === null) {
    throw new HomeliticsError("invalido", "Value error, lost_reason is required when moving to LOST", 422);
  }
  if (destino.data !== "LOST" && motivo !== null) {
    throw new HomeliticsError("invalido", "Value error, lost_reason is only valid when moving to LOST", 422);
  }
  const nota = typeof cuerpo?.note === "string" && cuerpo.note ? cuerpo.note : null;

  const desde = leadActual.current_stage;
  if (esTerminal(desde)) {
    throw new HomeliticsError("conflicto", `Lead is already in terminal stage ${desde} and cannot be moved`, 409);
  }
  if (!puedeMover(desde, destino.data)) {
    throw new HomeliticsError(
      "conflicto",
      `Illegal transition ${desde} -> ${destino.data}. Allowed from ${desde}: [${destinosLegales(desde).join(", ")}]`,
      409,
    );
  }

  const ahora = new Date().toISOString();
  const nueva: Transition = {
    id: nuevoId(),
    lead_id: leadId,
    from_stage: desde,
    to_stage: destino.data,
    changed_by: AGENT_ID,
    changed_at: ahora,
  };
  transiciones = [...transiciones, nueva];
  leads = leads.map(l => (l.id === leadId ? { ...l, current_stage: destino.data, updated_at: ahora } : l));

  // Efectos colaterales documentados en docs/API_CONTRACT.md: LOST siempre
  // deja una interacción STATUS_CHANGE; las demás etapas solo si hay nota.
  const cuerpoInteraccion = destino.data === "LOST"
    ? `Lost: ${motivo}${nota ? ` — ${nota}` : ""}`
    : nota;
  if (cuerpoInteraccion) {
    interacciones = [...interacciones, {
      id: nuevoId(), lead_id: leadId, direction: "OUTBOUND", channel: "IN_APP",
      type: "STATUS_CHANGE", body: cuerpoInteraccion, occurred_at: ahora, created_by: AGENT_ID,
    }];
  }
  // Cerrar el lead cancela sus visitas abiertas y libera el horario del agente.
  if (esTerminal(destino.data)) {
    citas = citas.map(c =>
      c.lead_id === leadId && BLOQUEA.has(c.status) ? { ...c, status: "CANCELLED" as const, updated_at: ahora } : c,
    );
  }
  return nueva;
}

function slotsMock(
  agentId: string,
  params: URLSearchParams,
): { agent_id: string; slot_minutes: number; duration_min: number; slots: string[] } {
  if (!agentes.some(a => a.id === agentId)) noEncontrado("El agente no existe o es de otra agencia.");
  const desdeRaw = params.get("from");
  const hastaRaw = params.get("to");
  if (!desdeRaw || !hastaRaw) {
    throw new HomeliticsError("invalido", "Faltan from y/o to.", 422);
  }
  // El API real acepta un query param `duration_min` (por defecto 30, igual
  // que `slot_minutes`) y lo devuelve tal cual; el front no lo manda todavía.
  const duracion = Number(params.get("duration_min") ?? 30);
  const slots = generarSlots(new Date(desdeRaw), new Date(hastaRaw), agentId);
  return { agent_id: agentId, slot_minutes: 30, duration_min: duracion, slots };
}

function citasDelLeadMock(leadId: string): Appointment[] {
  if (!buscarLead(leadId)) noEncontrado("El lead no existe o es de otra agencia.");
  return citas.filter(c => c.lead_id === leadId);
}

function crearCitaMock(leadId: string, cuerpo: Record<string, unknown> | undefined): Appointment {
  const leadActual = buscarLead(leadId);
  if (!leadActual) noEncontrado("El lead no existe o es de otra agencia.");

  const scheduledAt = String(cuerpo?.scheduled_at ?? "");
  const duracion = typeof cuerpo?.duration_min === "number" ? cuerpo.duration_min : 60;
  const inicio = new Date(scheduledAt);
  if (!scheduledAt || Number.isNaN(inicio.getTime())) {
    throw new HomeliticsError("invalido", "scheduled_at es inválido.", 422);
  }
  if (inicio.getTime() < Date.now()) {
    throw new HomeliticsError("invalido", "scheduled_at está en el pasado.", 422);
  }
  const fin = new Date(inicio.getTime() + duracion * 60_000);
  if (seSolapaConAlguna(inicio, fin, leadActual.agent_id)) {
    throw new HomeliticsError("conflicto", "El horario se ocupó entre la carga y el envío.", 409);
  }

  const ahora = new Date().toISOString();
  const nueva: Appointment = {
    id: nuevoId(),
    lead_id: leadId,
    agent_id: leadActual.agent_id,
    scheduled_at: scheduledAt,
    duration_min: duracion,
    status: "PENDING_CONFIRMATION",
    // El API real la pone en el agente autenticado que hace el POST (nuestro
    // proxy siempre pega como el agente demo) — ver services/appointment.py.
    created_by: AGENT_ID,
    created_at: ahora,
    updated_at: ahora,
  };
  citas = [...citas, nueva];
  return nueva;
}

/**
 * GET /appointments/{id} (a diferencia de `citasDelLeadMock`) trae más que la
 * cita: `location`, `agent_name` y `google_calendar_url` ya resueltos del
 * lado del API — ver `AppointmentDetailSchema` en lib/schemas.ts. El mock
 * resuelve el nombre del agente de la cita; el listing sale del lead de la cita.
 */
function citaPorIdMock(id: string): AppointmentDetail {
  const encontrada = citas.find(c => c.id === id);
  if (!encontrada) noEncontrado("La cita no existe o es de otra agencia.");
  const pub = buscarListing(buscarLead(encontrada.lead_id)!.listing_id)!;
  return {
    ...encontrada,
    listing_id: pub.id,
    location: [pub.address, pub.neighborhood, pub.city].filter(Boolean).join(", "),
    agent_name: agentes.find(a => a.id === encontrada.agent_id)?.full_name ?? null,
    google_calendar_url:
      `https://calendar.google.com/calendar/render?action=TEMPLATE&text=Visita+Homelitics`,
  };
}

function actualizarCitaMock(id: string, cuerpo: Record<string, unknown> | undefined): Appointment {
  const cita = citas.find(c => c.id === id);
  if (!cita) noEncontrado("La cita no existe o es de otra agencia.");

  if (TERMINAL_APPOINTMENT_STATUS.includes(cita.status as (typeof TERMINAL_APPOINTMENT_STATUS)[number])) {
    throw new HomeliticsError("conflicto", `La cita ya está en estado terminal (${cita.status}).`, 409);
  }

  const nuevoScheduled = typeof cuerpo?.scheduled_at === "string" ? cuerpo.scheduled_at : undefined;
  const nuevaDuracion = typeof cuerpo?.duration_min === "number" ? cuerpo.duration_min : undefined;
  const nuevoEstado = typeof cuerpo?.status === "string" ? cuerpo.status : undefined;

  if (nuevoScheduled) {
    const inicio = new Date(nuevoScheduled);
    if (Number.isNaN(inicio.getTime())) {
      throw new HomeliticsError("invalido", "scheduled_at es inválido.", 422);
    }
    if (inicio.getTime() < Date.now()) {
      throw new HomeliticsError("invalido", "El nuevo scheduled_at está en el pasado.", 422);
    }
  }

  if (nuevoScheduled || nuevaDuracion) {
    const inicio = new Date(nuevoScheduled ?? cita.scheduled_at);
    const duracion = nuevaDuracion ?? cita.duration_min;
    const fin = new Date(inicio.getTime() + duracion * 60_000);
    if (seSolapaConAlguna(inicio, fin, cita.agent_id, cita.id)) {
      throw new HomeliticsError("conflicto", "El nuevo horario se solapa con otra visita.", 409);
    }
  }

  const estadoFinal = nuevoEstado ?? (nuevoScheduled && cita.status === "CONFIRMED" ? "RESCHEDULED" : cita.status);

  const actualizada: Appointment = {
    ...cita,
    scheduled_at: nuevoScheduled ?? cita.scheduled_at,
    duration_min: nuevaDuracion ?? cita.duration_min,
    status: estadoFinal as Appointment["status"],
    updated_at: new Date().toISOString(),
  };
  citas = citas.map(c => (c.id === id ? actualizada : c));
  return actualizada;
}

function interaccionesDelLeadMock(leadId: string): Interaction[] {
  if (!buscarLead(leadId)) noEncontrado("El lead no existe o es de otra agencia.");
  return interacciones.filter(i => i.lead_id === leadId);
}

function crearInteraccionMock(leadId: string, cuerpo: Record<string, unknown> | undefined): Interaction {
  if (!buscarLead(leadId)) noEncontrado("El lead no existe o es de otra agencia.");
  const direccion = cuerpo?.direction === "OUTBOUND" ? "OUTBOUND" : "INBOUND";
  const nueva: Interaction = {
    id: nuevoId(),
    lead_id: leadId,
    direction: direccion,
    channel: (cuerpo?.channel as Interaction["channel"]) ?? "IN_APP",
    type: (cuerpo?.type as Interaction["type"]) ?? "MESSAGE",
    body: typeof cuerpo?.body === "string" ? cuerpo.body : null,
    occurred_at: typeof cuerpo?.occurred_at === "string" ? cuerpo.occurred_at : new Date().toISOString(),
    created_by: direccion === "OUTBOUND" ? AGENT_ID : null,
  };
  interacciones = [...interacciones, nueva];
  return nueva;
}

function tareasDelLeadMock(leadId: string): Task[] {
  if (!buscarLead(leadId)) noEncontrado("El lead no existe o es de otra agencia.");
  return tareas.filter(t => t.lead_id === leadId).map(aTaskOut);
}

/*
 * Tareas (HU-11). Como en el API, el cuerpo se valida antes de buscar el lead
 * (FastAPI corre Pydantic antes del handler): un PATCH vacío da 422 aunque el
 * lead no exista. Los `detail` son los `msg` de Pydantic, que es lo que deja
 * `traducirError` de un 422 real.
 */

function invalido(detail: string): never {
  throw new HomeliticsError("invalido", detail, 422);
}

/** `null` y ausente valen lo mismo, como `datetime | None = None` en Pydantic. */
function fechaOpcional(valor: unknown, campo: string): string | null {
  if (valor == null) return null;
  if (typeof valor !== "string" || Number.isNaN(Date.parse(valor))) {
    invalido(`${campo}: Input should be a valid datetime`);
  }
  return valor;
}

function notaOpcional(valor: unknown): string | null {
  if (valor == null) return null;
  if (typeof valor !== "string") invalido("note: Input should be a valid string");
  if (valor.length > 1000) invalido("note: String should have at most 1000 characters");
  return valor;
}

function crearTareaMock(leadId: string, cuerpo: Record<string, unknown> | undefined): Task {
  if (cuerpo?.due_at == null) invalido("due_at: Field required");
  const dueAt = fechaOpcional(cuerpo.due_at, "due_at")!;
  const nota = notaOpcional(cuerpo.note);
  // El dueño de la tarea es el del lead, no quien la crea (services/lead.py).
  const leadActual = buscarLead(leadId) ?? noEncontrado("El lead no existe o es de otra agencia.");

  // Lo que crea un agente con POST es siempre `MANUAL` (bloqueo 11).
  const nueva: TareaMock = {
    id: nuevoId(), lead_id: leadId, agent_id: leadActual.agent_id,
    status: "PENDING", due_at: dueAt, note: nota, created_at: new Date().toISOString(),
    source: "MANUAL",
  };
  tareas = [...tareas, nueva];
  return aTaskOut(nueva);
}

function actualizarTareaMock(leadId: string, taskId: string, cuerpo: Record<string, unknown> | undefined): Task {
  const estadoCrudo = cuerpo?.status ?? null;
  const estado = estadoCrudo === null ? null : TaskStatus.safeParse(estadoCrudo).data;
  if (estado === undefined) invalido("status: Input should be 'PENDING', 'DONE' or 'SNOOZED'");
  const dueAt = fechaOpcional(cuerpo?.due_at, "due_at");
  const nota = notaOpcional(cuerpo?.note);
  if (estado === null && dueAt === null && nota === null) {
    // El `model_validator` de `TaskPatch`: loc ["body"], así que sin prefijo de campo.
    invalido("Value error, provide at least one of: status, due_at, note");
  }

  if (!buscarLead(leadId)) noEncontrado("El lead no existe o es de otra agencia.");
  const tarea = tareas.find(t => t.id === taskId && t.lead_id === leadId) ?? noEncontrado("Task not found");

  // Solo pisa lo que no es null, como `patch_task` del API.
  const actualizada: TareaMock = {
    ...tarea,
    status: estado ?? tarea.status,
    due_at: dueAt ?? tarea.due_at,
    note: nota ?? tarea.note,
  };
  tareas = tareas.map(t => (t.id === taskId ? actualizada : t));
  return aTaskOut(actualizada);
}

/**
 * PROPUESTO (2.25, bloqueo 9). GET /tasks como en docs/API_CONTRACT.md §8:
 * toda la agencia (el mock solo tiene una, así que un `agent_id` ajeno da
 * lista vacía), `due_at < due_before`, `due_at` ascendente y `limit` 1–200
 * (50 por defecto). 422 con `status` fuera del enum o `due_before` sin zona.
 * `SNOOZED` vencidas no salen con `status=PENDING` (punto abierto con L1).
 */
function tareasAgenciaMock(params: URLSearchParams): TareaAgencia[] {
  const estado = params.get("status");
  if (estado !== null && !TaskStatus.safeParse(estado).success) {
    invalido("status: Input should be 'PENDING', 'DONE' or 'SNOOZED'");
  }
  const dueBefore = params.get("due_before");
  if (dueBefore !== null && !z.string().datetime({ offset: true }).safeParse(dueBefore).success) {
    invalido("due_before: Input should be a valid datetime with timezone");
  }
  const agentId = params.get("agent_id");
  const limit = enteroDeQuery(params, "limit", 50, 1, 200);

  return tareas
    .filter(t => estado === null || t.status === estado)
    .filter(t => dueBefore === null || Date.parse(t.due_at) < Date.parse(dueBefore))
    .filter(t => agentId === null || t.agent_id === agentId)
    .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at))
    .slice(0, limit);
}

/* ---------- leads en riesgo (HU-10, HU-13) ---------- */

/** `RESPONSE_TYPES` del API: lo único que cuenta como contestarle al cliente. */
const TIPOS_RESPUESTA: ReadonlySet<string> = new Set(["MESSAGE", "CALL"]);

/**
 * Mismo predicado que `leads_at_risk` en services/lead.py (leído el
 * 2026-10-13): `OUTBOUND`, `MESSAGE` o `CALL`, y que no lo escribió un
 * `AI_AGENT`. Un `created_by` nulo cuenta como humano (allá es un outer join).
 */
function esRespuestaHumana(i: Interaction): boolean {
  return i.direction === "OUTBOUND"
    && TIPOS_RESPUESTA.has(i.type)
    && agentes.find(a => a.id === i.created_by)?.role !== "AI_AGENT";
}

/** Un entero de la query con los límites de `Query(ge=, le=)` del API. */
function enteroDeQuery(params: URLSearchParams, clave: string, porDefecto: number, min: number, max: number): number {
  const crudo = params.get(clave);
  if (crudo === null) return porDefecto;
  const n = Number(crudo);
  if (!crudo.trim() || !Number.isInteger(n)) {
    invalido(`${clave}: Input should be a valid integer, unable to parse string as an integer`);
  }
  if (n < min) invalido(`${clave}: Input should be greater than or equal to ${min}`);
  if (n > max) invalido(`${clave}: Input should be less than or equal to ${max}`);
  return n;
}

/**
 * GET /leads/at-risk. Sin `hours` usa 72 (`INACTIVITY_HOURS` del API); el
 * front siempre lo manda. No terminales, creados antes del corte y sin
 * respuesta humana desde el corte; más viejos primero y cortado en `limit`.
 * Toda la agencia: el mock solo tiene una.
 */
function leadsEnRiesgoMock(params: URLSearchParams): Lead[] {
  const hours = enteroDeQuery(params, "hours", 72, 1, 8760);
  const limit = enteroDeQuery(params, "limit", 100, 1, 500);
  return leadsSinRespuesta(hours).slice(0, limit).map(aLeadOut);
}

/** El predicado de riesgo, sin tope: más viejos primero. */
function leadsSinRespuesta(hours: number): LeadMock[] {
  const corte = Date.now() - hours * 3_600_000;
  const respondidoDesdeElCorte = (leadId: string) =>
    interacciones.some(i => i.lead_id === leadId && esRespuestaHumana(i) && Date.parse(i.occurred_at) >= corte);

  return leads
    .filter(l => !esTerminal(l.current_stage))
    .filter(l => Date.parse(l.created_at) < corte)
    .filter(l => !respondidoDesdeElCorte(l.id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function enviarEncuestaMock(citaId: string, cuerpo: Record<string, unknown> | undefined): Feedback {
  const cita = citas.find(c => c.id === citaId);
  if (!cita) noEncontrado("La cita no existe o es de otra agencia.");
  if (cita.status !== "COMPLETED") {
    throw new HomeliticsError("conflicto", "La visita todavía no está marcada como realizada (COMPLETED).", 409);
  }

  const submittedBy = (cuerpo?.submitted_by as Feedback["submitted_by"]) ?? "CLIENT";

  // Como mucho una fila por lado: un segundo POST del mismo `submitted_by`
  // devuelve la que ya existía (200 en el API real), no crea otra.
  const existente = feedbacks.find(f => f.appointment_id === citaId && f.submitted_by === submittedBy);
  if (existente) return existente;

  const objecion = typeof cuerpo?.objection === "string" ? cuerpo.objection : undefined;
  const nueva: Feedback = {
    id: nuevoId(),
    appointment_id: citaId,
    submitted_by: submittedBy,
    interest_score: typeof cuerpo?.interest_score === "number" ? cuerpo.interest_score : null,
    objection_id: objecion ? OBJECION_A_ID[objecion] ?? null : null,
    close_probability: cuerpo?.close_probability != null ? String(cuerpo.close_probability) : null,
    free_text: typeof cuerpo?.free_text === "string" ? cuerpo.free_text : null,
    created_at: new Date().toISOString(),
  };
  feedbacks = [...feedbacks, nueva];
  return nueva;
}

/** Tarea 2.5, endpoint sin documentar hasta esta tarea. Ver docs/API_CONTRACT.md. */
function feedbackDeCitaMock(citaId: string): Feedback[] {
  if (!citas.some(c => c.id === citaId)) noEncontrado("La cita no existe o es de otra agencia.");
  return feedbacks.filter(f => f.appointment_id === citaId);
}

/**
 * GET /agents, mismas reglas que `app/routers/agents.py` del back: otra
 * `agency_id` da 404; sin bots salvo `include_bots=true` o `role=AI_AGENT`;
 * `active` y `role` filtran; `offset`/`limit` (default 100) paginan.
 */
function agentesMock(params: URLSearchParams): AgentListItem[] {
  const agencia = params.get("agency_id");
  if (agencia && agencia !== AGENCY_ID) noEncontrado("Agency not found");
  const active = params.get("active");
  const role = params.get("role");
  const conBots = params.get("include_bots") === "true" || role === "AI_AGENT";
  const offset = Number(params.get("offset") ?? 0);
  const limit = Number(params.get("limit") ?? 100);
  return agentes
    .filter(a => conBots || a.role !== "AI_AGENT")
    .filter(a => active === null || a.active === (active === "true"))
    .filter(a => !role || a.role === role)
    .slice(offset, offset + limit);
}

/** El rol con el que responde el mock: el de `agente`, salvo que `{ rol }` lo cambie. */
function rolActual(prueba: PruebaMock | undefined): Agent["role"] {
  return prueba?.rol ?? agente.role;
}

/**
 * POST /leads/{id}/reassign (HU-08), mismas reglas y mismo orden que el API
 * (docs/API_CONTRACT.md): 403, 404 del lead, 422 del cuerpo, 404 del destino,
 * 409. Solo cambia `agent_id`: el API escribe `assignment_audit`, que el
 * front no lee, y NO deja interacción en el historial.
 */
function reasignarLeadMock(
  leadId: string, cuerpo: Record<string, unknown> | undefined, prueba: PruebaMock | undefined,
): Lead {
  if (rolActual(prueba) !== "TEAM_ADMIN") {
    throw new HomeliticsError("sin_permiso", "Only a TEAM_ADMIN can reassign leads", 403);
  }
  const leadActual = buscarLead(leadId) ?? noEncontrado("El lead no existe o es de otra agencia.");
  const destinoId = cuerpo?.to_agent_id;
  if (typeof destinoId !== "string" || !destinoId) {
    throw new HomeliticsError("invalido", "to_agent_id: Field required", 422);
  }
  const destino = agentes.find(a => a.id === destinoId) ?? noEncontrado("Target agent not found in this agency");
  if (!destino.active) {
    throw new HomeliticsError("conflicto", "Target agent is deactivated", 409);
  }
  if (destino.role === "AI_AGENT") {
    throw new HomeliticsError("conflicto", "Cannot assign a lead to an AI agent", 409);
  }
  if (leadActual.agent_id === destino.id) {
    throw new HomeliticsError("conflicto", "Lead is already assigned to that agent", 409);
  }
  leads = leads.map(l => (l.id === leadId ? { ...l, agent_id: destino.id } : l));
  return aLeadOut(buscarLead(leadId)!);
}

/* ---------- analítica (HU-17) ---------- */

/**
 * Lo que necesitan GET /analytics/funnel y /lost-reasons de un lead: de qué
 * agente y publicación es, cuándo se creó, hasta qué etapa del embudo llegó
 * alguna vez y, si se perdió, por qué y cuándo.
 */
type RegistroAnalitica = {
  agentId: string;
  listingId: string;
  creado: string;
  /** La etapa más avanzada de `EMBUDO` a la que llegó (nunca `LOST`). */
  alcanzo: Stage;
  perdido: { motivo: LostReason; en: string } | null;
};

/**
 * "Hoy" fijo del mock: la cohorte histórica se generó contra esta fecha, y la
 * ventana de /lost-reasons cuenta hacia atrás desde aquí (o desde ahora, si
 * es más tarde, para que un LOST hecho en la sesión entre en la cuenta).
 */
const HOY_ANALITICA = "2026-09-27T17:00:00Z";

/** PRNG con semilla (mulberry32): la cohorte sale igual en cada arranque. */
function prng(semilla: number) {
  let a = semilla;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function elegir<T>(azar: () => number, opciones: readonly (readonly [T, number])[]): T {
  const total = opciones.reduce((s, [, peso]) => s + peso, 0);
  let r = azar() * total;
  for (const [valor, peso] of opciones) {
    if ((r -= peso) < 0) return valor;
  }
  return opciones[opciones.length - 1][0];
}

/** Motivo más probable según la etapa en la que se cayó el lead. */
const MOTIVOS_POR_ETAPA: Record<string, readonly (readonly [LostReason, number])[]> = {
  INTERESTED: [["NO_RESPONSE", 6], ["LOCATION", 2], ["PRICE", 1], ["OTHER", 1]],
  VISIT_SCHEDULED: [["NO_RESPONSE", 3], ["LOCATION", 3], ["PRICE", 2], ["OTHER", 1]],
  VISITED: [["PRICE", 6], ["LOCATION", 2], ["BOUGHT_ELSEWHERE", 2], ["OTHER", 1]],
  NEGOTIATING: [["FINANCING", 4], ["BOUGHT_ELSEWHERE", 3], ["PRICE", 2]],
};

/**
 * Cohorte histórica SOLO para analítica: ~120 leads de junio a septiembre
 * que no aparecen en GET /leads (el tablero muestra 14; con eso no hay
 * embudo que leer). Diseñada para que la caída clara esté en
 * VISITED → NEGOTIATING (~30 %), frente a 55–75 % en las demás, y para que
 * cada filtro cambie la foto: el arriendo convierte mejor a visita, Paula
 * negocia más y Andrés cierra menos.
 */
const COHORTE_HISTORICA: readonly RegistroAnalitica[] = (() => {
  const azar = prng(17);
  const inicio = Date.parse("2026-06-01T13:00:00Z");
  const fin = Date.parse("2026-09-20T23:00:00Z");
  const hoy = Date.parse(HOY_ANALITICA);
  const dia = 86_400_000;
  const registros: RegistroAnalitica[] = [];

  for (let i = 0; i < 120; i++) {
    const agentId = elegir(azar, [
      [AGENT_ID, 4], [AGENT_ID_PAULA, 3], [AGENT_ID_ANDRES, 3], [AGENT_ID_INACTIVO, 1],
    ] as const);
    const listing = elegir(azar, listings.map(l => [l, 1] as const));
    const creado = inicio + azar() * (fin - inicio);

    const pasos = [
      listing.operation_type === "RENT" ? 0.75 : 0.62, // INTERESTED → VISIT_SCHEDULED
      0.72, //                                            VISIT_SCHEDULED → VISITED
      agentId === AGENT_ID_PAULA ? 0.45 : 0.27, //        VISITED → NEGOTIATING
      agentId === AGENT_ID_ANDRES ? 0.35 : 0.6, //        NEGOTIATING → WON
    ];
    let indice = 0;
    while (indice < pasos.length && azar() < pasos[indice]) indice++;
    const alcanzo = EMBUDO[indice];

    let perdido: RegistroAnalitica["perdido"] = null;
    const viejo = hoy - creado > 21 * dia;
    if (alcanzo !== "WON" && azar() < (viejo ? 0.75 : 0.25)) {
      const en = Math.min(creado + (3 + azar() * 40) * dia, hoy - dia);
      perdido = {
        motivo: elegir(azar, MOTIVOS_POR_ETAPA[alcanzo]),
        en: new Date(Math.max(en, creado)).toISOString(),
      };
    }
    registros.push({ agentId, listingId: listing.id, creado: new Date(creado).toISOString(), alcanzo, perdido });
  }
  return registros;
})();

/**
 * Los 15 leads del tablero, leídos del estado en memoria: hasta dónde llegaron
 * sale del log de transiciones y el motivo de pérdida de su STATUS_CHANGE,
 * así que mover un lead en el tablero cambia el embudo, como en el API.
 */
function registrosDeLeads(): RegistroAnalitica[] {
  return leads.map(l => {
    const log = transiciones.filter(t => t.lead_id === l.id);
    const indice = Math.max(0, ...log.map(t => EMBUDO.indexOf(t.to_stage)));
    let perdido: RegistroAnalitica["perdido"] = null;
    if (l.current_stage === "LOST") {
      const cierre = [...interacciones]
        .reverse()
        .find(x => x.lead_id === l.id && x.type === "STATUS_CHANGE" && x.body?.startsWith("Lost: "));
      const codigo = cierre?.body?.slice("Lost: ".length).split(" ")[0];
      const en = [...log].reverse().find(t => t.to_stage === "LOST")?.changed_at ?? l.updated_at;
      perdido = { motivo: LostReason.safeParse(codigo).data ?? "OTHER", en };
    }
    return { agentId: l.agent_id, listingId: l.listing_id, creado: l.created_at, alcanzo: EMBUDO[indice], perdido };
  });
}

function registrosAnalitica(): RegistroAnalitica[] {
  return [...COHORTE_HISTORICA, ...registrosDeLeads()];
}

/**
 * `100 * n / de` con dos decimales, mitad hacia arriba: lo mismo que `pct()`
 * en app/services/analytics.py del back (leído el 2026-09-27). `null` si
 * `de` es 0.
 */
function pct(n: number, de: number): number | null {
  if (!de) return null;
  return Math.round(((100 * n) / de) * 100 + 1e-9) / 100;
}

/** Las claves de filtro que el back devuelve en `filters` (nunca `format`). */
const CLAVES_FILTRO_EMBUDO = [
  "created_from", "created_to", "agent_id", "listing_id", "property_id", "operation_type",
] as const;

/**
 * GET /analytics/funnel. Mismos filtros y errores que el API
 * (docs/API_CONTRACT.md): 403 sin TEAM_ADMIN, 422 con el rango al revés. Los
 * porcentajes se calculan de `leads_reached`, así que siempre cuadran; con
 * denominador 0 van en `null`.
 */
function embudoMock(params: URLSearchParams, prueba: PruebaMock | undefined) {
  if (rolActual(prueba) !== "TEAM_ADMIN") {
    throw new HomeliticsError("sin_permiso", "Only a TEAM_ADMIN can read the funnel", 403);
  }
  const desde = params.get("created_from");
  const hasta = params.get("created_to");
  if (desde && hasta && desde > hasta) {
    throw new HomeliticsError("invalido", "created_from is after created_to", 422);
  }
  const agentId = params.get("agent_id");
  const listingId = params.get("listing_id");
  const propertyId = params.get("property_id");
  const operacion = params.get("operation_type");

  const cohorte = registrosAnalitica().filter(r => {
    const listing = buscarListing(r.listingId);
    const dia = diaBogotaStr(new Date(r.creado));
    return (!agentId || r.agentId === agentId)
      && (!listingId || r.listingId === listingId)
      && (!propertyId || listing?.property_id === propertyId)
      && (!operacion || listing?.operation_type === operacion)
      && (!desde || dia >= desde)
      && (!hasta || dia <= hasta);
  });

  const alcanzados = EMBUDO.map((_, i) => cohorte.filter(r => EMBUDO.indexOf(r.alcanzo) >= i).length);
  const primero = alcanzados[0];
  return {
    stages: EMBUDO.map((stage, i) => ({
      stage,
      leads_reached: alcanzados[i],
      pct_from_prev: i === 0 ? null : pct(alcanzados[i], alcanzados[i - 1]),
      pct_of_first: pct(alcanzados[i], primero),
    })),
    lost: cohorte.filter(r => r.perdido).length,
    filters: Object.fromEntries(
      CLAVES_FILTRO_EMBUDO.flatMap(k => (params.get(k) ? [[k, params.get(k)!]] : [])),
    ),
  };
}

/** Un float como lo escribe `str()` de Python: `100.0`, `45.5`, `None` → vacío. */
function floatPython(n: number | null): string {
  if (n === null) return "";
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

/**
 * GET /analytics/funnel?format=csv: el mismo CSV que arma el router del back
 * (`csv.writer` de Python, líneas con `\r\n`). Cabecera, una fila por etapa y
 * una fila `LOST` con los perdidos y su porcentaje sobre la primera etapa
 * (`round(…, 2)`; vacío si no hay leads).
 */
function embudoCsvMock(embudo: ReturnType<typeof embudoMock>): string {
  const filas: (string | number)[][] = [["stage", "leads_reached", "pct_from_prev", "pct_of_first"]];
  for (const s of embudo.stages) {
    filas.push([s.stage, s.leads_reached, floatPython(s.pct_from_prev), floatPython(s.pct_of_first)]);
  }
  const primero = embudo.stages[0].leads_reached;
  filas.push(["LOST", embudo.lost, "", floatPython(pct(embudo.lost, primero))]);
  return filas.map(f => f.join(",") + "\r\n").join("");
}

/**
 * PROPUESTO (2.25, bloqueos 10 y 15). GET /analytics/at-risk-by-agent como
 * en docs/API_CONTRACT.md §8: el mismo predicado que GET /leads/at-risk, sin
 * tope, filtrado por día de creación en Bogotá (`from`/`to`) y por inmueble,
 * agrupado por dueño. Agentes por `leads_at_risk` descendente (empate: el
 * que tiene el lead más viejo), leads más viejos primero. 403 sin
 * `TEAM_ADMIN`; 422 con `hours` fuera de rango, `from > to` o `format`
 * desconocido.
 */
function riesgoPorAgenteMock(params: URLSearchParams, prueba: PruebaMock | undefined): RiesgoPorAgente {
  if (rolActual(prueba) !== "TEAM_ADMIN") {
    throw new HomeliticsError("sin_permiso", "This action requires the TEAM_ADMIN role", 403);
  }
  const hours = enteroDeQuery(params, "hours", 72, 1, 8760);
  const formato = params.get("format") ?? "json";
  if (formato !== "json" && formato !== "csv") invalido("format: Input should be 'json' or 'csv'");
  const desde = params.get("from");
  const hasta = params.get("to");
  if (desde && hasta && desde > hasta) {
    throw new HomeliticsError("invalido", "from is after to", 422);
  }
  const propertyId = params.get("property_id");

  const porAgente = new Map<string, LeadMock[]>();
  for (const l of leadsSinRespuesta(hours)) {
    const dia = diaBogotaStr(new Date(l.created_at));
    if ((desde && dia < desde) || (hasta && dia > hasta)) continue;
    if (propertyId && buscarListing(l.listing_id)?.property_id !== propertyId) continue;
    porAgente.set(l.agent_id, [...(porAgente.get(l.agent_id) ?? []), l]);
  }

  const grupos: RiesgoAgente[] = [...porAgente.entries()]
    .map(([agentId, suyos]) => ({
      agent_id: agentId,
      full_name: agentes.find(a => a.id === agentId)?.full_name ?? null,
      leads_at_risk: suyos.length,
      oldest_created_at: suyos[0].created_at,
      leads: suyos.map(aTarjeta),
    }))
    .sort((a, b) => b.leads_at_risk - a.leads_at_risk || a.oldest_created_at.localeCompare(b.oldest_created_at));

  return {
    hours,
    total: grupos.reduce((suma, g) => suma + g.leads_at_risk, 0),
    agents: grupos,
    filters: Object.fromEntries(
      (["from", "to", "property_id"] as const).flatMap(k => (params.get(k) ? [[k, params.get(k)!]] : [])),
    ),
  };
}

/** Una celda como la escribe `csv.writer`: entre comillas solo si hace falta. */
function celdaCsv(valor: string | null): string {
  if (valor === null) return "";
  return /[",\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

/**
 * GET /analytics/at-risk-by-agent?format=csv (PROPUESTO): una fila por lead,
 * agrupadas por agente en el orden del JSON, con la cabecera de la propuesta.
 */
function riesgoPorAgenteCsvMock(reporte: RiesgoPorAgente): string {
  const filas: (string | null)[][] = [
    ["agent_id", "agent_name", "lead_id", "client_name", "listing_address", "current_stage", "created_at"],
  ];
  for (const g of reporte.agents) {
    for (const l of g.leads) {
      filas.push([g.agent_id, g.full_name, l.id, l.client_name, l.listing_address, l.current_stage, l.created_at]);
    }
  }
  return filas.map(f => f.map(celdaCsv).join(",") + "\r\n").join("");
}

/**
 * GET /analytics/lost-reasons?days=. Solo `days` (1–730, 90 por defecto),
 * contado sobre la fecha de pérdida; sin 403, como el API.
 */
function motivosPerdidaMock(params: URLSearchParams) {
  const days = Number(params.get("days") ?? 90);
  if (!Number.isInteger(days) || days < 1 || days > 730) {
    throw new HomeliticsError("invalido", "days: Input should be between 1 and 730", 422);
  }
  const fin = Math.max(Date.now(), Date.parse(HOY_ANALITICA));
  const inicio = fin - days * 86_400_000;
  const perdidos = registrosAnalitica()
    .map(r => r.perdido)
    .filter((p): p is NonNullable<typeof p> => p !== null && Date.parse(p.en) >= inicio && Date.parse(p.en) <= fin);

  const conteo = new Map<LostReason, number>();
  for (const p of perdidos) conteo.set(p.motivo, (conteo.get(p.motivo) ?? 0) + 1);
  return [...conteo.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => ({ reason, leads: n, pct: pct(n, perdidos.length)! }));
}

/* ---------- router ---------- */

/**
 * Para probar a mano estados que los mocks no producen solos (ver README):
 * desde la consola del navegador, o del servidor, se pone
 * `globalThis.__homeliticsMock = { latenciaMs: 2000, falla: "red" }`.
 * `latenciaMs` demora todas las respuestas; `falla` hace fallar las
 * escrituras (no los GET) con ese `kind`. Se borra con `= undefined`.
 * `rol: "AGENT"` cambia el rol que devuelve GET /me y hace que reasignar dé
 * 403. Ojo: el layout de (agente) lee /me en el SERVIDOR, así que desde la
 * consola del navegador solo cambia el POST (sirve para ver el 403 dentro del
 * modal); para esconder los botones de admin hay que cambiar `agente.role`.
 * `fallaAnalitica` hace fallar los GET de `/analytics/*` (HU-17) con ese
 * `kind`: `falla` solo toca escrituras y el embudo solo lee.
 */
type PruebaMock = {
  latenciaMs?: number; falla?: ErrorKind; fallaAnalitica?: ErrorKind; rol?: Agent["role"];
};

export async function resolverMock(path: string, method: string = "GET", body?: string): Promise<unknown> {
  const url = new URL(path, "http://mock");
  const { pathname, searchParams } = url;
  const cuerpo = body ? (JSON.parse(body) as Record<string, unknown>) : undefined;
  const m = method.toUpperCase();
  let match: RegExpMatchArray | null;

  const prueba = (globalThis as { __homeliticsMock?: PruebaMock }).__homeliticsMock;
  if (prueba?.latenciaMs) await new Promise(r => setTimeout(r, prueba.latenciaMs));
  if (prueba?.falla && m !== "GET") {
    throw prueba.falla === "red"
      ? new HomeliticsError("red", "No se pudo contactar el servicio.")
      : new HomeliticsError(prueba.falla, `Falla simulada (${prueba.falla}) en ${m} ${pathname}`);
  }

  if (pathname === "/health" && m === "GET") return { status: "ok" };
  if (pathname === "/me" && m === "GET") return { ...agente, role: rolActual(prueba) };
  if (pathname === "/agents" && m === "GET") return agentesMock(searchParams);
  if (pathname === "/listings" && m === "GET") return listingsMock(searchParams);

  if (pathname.startsWith("/analytics/") && prueba?.fallaAnalitica) {
    throw new HomeliticsError(prueba.fallaAnalitica, `Falla simulada (${prueba.fallaAnalitica}) en ${m} ${pathname}`);
  }
  if (pathname === "/analytics/funnel" && m === "GET") {
    const embudo = embudoMock(searchParams, prueba);
    return searchParams.get("format") === "csv" ? embudoCsvMock(embudo) : embudo;
  }
  if (pathname === "/analytics/lost-reasons" && m === "GET") return motivosPerdidaMock(searchParams);
  if (pathname === "/analytics/at-risk-by-agent" && m === "GET") {
    const reporte = riesgoPorAgenteMock(searchParams, prueba);
    return searchParams.get("format") === "csv" ? riesgoPorAgenteCsvMock(reporte) : reporte;
  }
  if (pathname === "/tasks" && m === "GET") return tareasAgenciaMock(searchParams);

  if ((match = pathname.match(/^\/listings\/([^/]+)$/)) && m === "GET") {
    return listingPorIdMock(match[1]);
  }
  if ((match = pathname.match(/^\/agents\/([^/]+)\/slots$/)) && m === "GET") {
    return slotsMock(match[1], searchParams);
  }
  if (pathname === "/leads" && m === "GET") return leadsMock(searchParams);
  // Antes de `/leads/{id}`, que si no se lo come como un id.
  if (pathname === "/leads/at-risk" && m === "GET") return leadsEnRiesgoMock(searchParams);
  if ((match = pathname.match(/^\/leads\/([^/]+)$/)) && m === "GET") {
    return leadPorIdMock(match[1]);
  }
  if ((match = pathname.match(/^\/leads\/([^/]+)\/appointments$/))) {
    if (m === "GET") return citasDelLeadMock(match[1]);
    if (m === "POST") return crearCitaMock(match[1], cuerpo);
  }
  if ((match = pathname.match(/^\/appointments\/([^/]+)$/))) {
    if (m === "GET") return citaPorIdMock(match[1]);
    if (m === "PATCH") return actualizarCitaMock(match[1], cuerpo);
  }
  if ((match = pathname.match(/^\/leads\/([^/]+)\/transitions$/))) {
    if (m === "GET") return transicionesMock(match[1]);
    if (m === "POST") return moverLeadMock(match[1], cuerpo);
  }
  if ((match = pathname.match(/^\/leads\/([^/]+)\/reassign$/)) && m === "POST") {
    return reasignarLeadMock(match[1], cuerpo, prueba);
  }
  if ((match = pathname.match(/^\/leads\/([^/]+)\/interactions$/))) {
    if (m === "GET") return interaccionesDelLeadMock(match[1]);
    if (m === "POST") return crearInteraccionMock(match[1], cuerpo);
  }
  if ((match = pathname.match(/^\/leads\/([^/]+)\/tasks$/))) {
    if (m === "GET") return tareasDelLeadMock(match[1]);
    if (m === "POST") return crearTareaMock(match[1], cuerpo);
  }
  if ((match = pathname.match(/^\/leads\/([^/]+)\/tasks\/([^/]+)$/)) && m === "PATCH") {
    return actualizarTareaMock(match[1], match[2], cuerpo);
  }
  if ((match = pathname.match(/^\/appointments\/([^/]+)\/feedback$/))) {
    if (m === "POST") return enviarEncuestaMock(match[1], cuerpo);
    if (m === "GET") return feedbackDeCitaMock(match[1]);
  }

  throw new HomeliticsError("servidor", `Mock no implementado para ${m} ${pathname}`, 500);
}

export const MOCK_IDS = {
  AGENT_ID, LISTING_ID, CLIENT_ID, LEAD_ID, LEAD_ID_VACIO,
  APPOINTMENT_ID, APPOINTMENT_ID_CANCELADA, APPOINTMENT_ID_NO_COMPLETADA, APPOINTMENT_ID_COMPLETADA,
  LEAD_ID_NEGOCIANDO, LEAD_ID_GANADO, LEAD_ID_PERDIDO, PROPERTY_ID_DOBLE,
  AGENT_ID_PAULA, AGENT_ID_ANDRES, AGENT_ID_INACTIVO, AGENT_ID_BOT,
  TASK_ID, TASK_ID_POR_VENCER, LEAD_ID_RECIENTE, LEAD_ID_ATENDIDO, LEAD_ID_SOLO_BOT, LEAD_ID_SOLO_NOTA,
};
