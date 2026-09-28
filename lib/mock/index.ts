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
 *
 * GET /leads devuelve 14 tarjetas repartidas en las seis etapas, y
 * POST /leads/{id}/transitions aplica las reglas del API (409 y 422) y mueve
 * `current_stage` en memoria.
 *
 * "Horario ocupado" (2.2) no necesita un id especial: alcanza con pedir dos
 * veces la misma cita para el mismo agente, o con pedir una de las casillas
 * que `slots` ya marca como ocupadas para esa semana.
 */
import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { HomeliticsError, type ErrorKind } from "../errores";
import { TZ } from "../format";
import { EMBUDO, destinosLegales, esTerminal, puedeMover } from "../etapas";
import {
  LostReason, Stage, TERMINAL_APPOINTMENT_STATUS,
  type Agent, type Appointment, type AppointmentDetail, type Feedback,
  type Interaction, type Lead, type LeadCard, type Listing, type Task, type Transition,
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
): LeadMock {
  return {
    id, client_id: clientId, client_name: clientName, listing_id: listingId, agent_id: AGENT_ID,
    source_channel: canal, current_stage: etapa, created_at: creado, updated_at: actualizado,
  };
}

/**
 * Todos del mismo agente para que /slots y las citas sigan funcionando. En
 * memoria: POST /leads/{id}/transitions cambia `current_stage` aquí.
 */
let leads: LeadMock[] = [
  /** Laura Restrepo. Primer contacto el 1 de septiembre por Telegram. */
  leadMock(LEAD_ID, CLIENT_ID, "Laura Restrepo", LISTING_ID, "TELEGRAM", "VISIT_SCHEDULED",
    "2026-09-01T14:05:00Z", "2026-09-08T16:00:00Z"),
  /** Lead recién creado, sin interacciones, tareas ni citas: el caso de lista vacía. */
  leadMock(LEAD_ID_VACIO, CLIENT_ID_VACIO, null, LISTING_ID, "IN_APP", "INTERESTED",
    "2026-09-09T20:00:00Z", "2026-09-09T20:00:00Z"),
  leadMock(uuid(120), uuid(140), "Camila Ortiz", LISTING_ID_LAURELES_VENTA, "TELEGRAM", "INTERESTED",
    "2026-09-20T13:10:00Z", "2026-09-20T13:32:00Z"),
  leadMock(uuid(121), uuid(141), "Juan Pablo Mejía", LISTING_ID_POBLADO, "CALL", "INTERESTED",
    "2026-09-24T15:00:00Z", "2026-09-24T15:12:00Z"),
  leadMock(uuid(122), uuid(142), "Sofía Zapata", LISTING_ID_LAURELES_ARRIENDO, "TELEGRAM", "VISIT_SCHEDULED",
    "2026-09-10T16:40:00Z", "2026-09-22T14:00:00Z"),
  leadMock(uuid(123), uuid(143), null, LISTING_ID_ENVIGADO, "IN_APP", "VISIT_SCHEDULED",
    "2026-09-12T21:15:00Z", "2026-09-21T12:30:00Z"),
  leadMock(uuid(124), uuid(144), "Mateo Arango", LISTING_ID_LAURELES_VENTA, "TELEGRAM", "VISITED",
    "2026-08-25T17:00:00Z", "2026-09-18T19:45:00Z"),
  leadMock(uuid(125), uuid(145), "Valentina Rojas", LISTING_ID, "CALL", "VISITED",
    "2026-08-28T14:20:00Z", "2026-09-19T16:10:00Z"),
  leadMock(LEAD_ID_NEGOCIANDO, uuid(146), "Daniel Henao", LISTING_ID_POBLADO, "TELEGRAM", "NEGOTIATING",
    "2026-08-12T15:30:00Z", "2026-09-23T22:05:00Z"),
  leadMock(uuid(127), uuid(147), "Isabella Cardona", LISTING_ID_LAURELES_ARRIENDO, "IN_APP", "NEGOTIATING",
    "2026-08-18T13:00:00Z", "2026-09-15T18:20:00Z"),
  leadMock(LEAD_ID_GANADO, uuid(148), "Santiago Posada", LISTING_ID_LAURELES_VENTA, "CALL", "WON",
    "2026-08-03T16:00:00Z", "2026-09-05T20:00:00Z"),
  leadMock(uuid(129), uuid(149), "Mariana Vélez", LISTING_ID_ENVIGADO, "TELEGRAM", "WON",
    "2026-08-06T19:30:00Z", "2026-08-30T15:00:00Z"),
  leadMock(LEAD_ID_PERDIDO, uuid(150), "Felipe Correa", LISTING_ID_POBLADO, "TELEGRAM", "LOST",
    "2026-08-10T14:00:00Z", "2026-09-02T17:30:00Z"),
  leadMock(uuid(131), uuid(151), null, LISTING_ID, "IN_APP", "LOST",
    "2026-08-20T20:10:00Z", "2026-08-27T13:00:00Z"),
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
];

function mensaje(
  n: number, leadId: string, direccion: Interaction["direction"], canal: Interaction["channel"],
  cuerpo: string | null, cuando: string, tipo: Interaction["type"] = "MESSAGE",
): Interaction {
  return {
    id: uuid(n), lead_id: leadId, direction: direccion, channel: canal, type: tipo,
    body: cuerpo, occurred_at: cuando, created_by: direccion === "OUTBOUND" ? AGENT_ID : null,
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
    changed_by: i === 0 ? null : AGENT_ID,
    changed_at: new Date(camino.length === 1 ? inicio : inicio + ((fin - inicio) * i) / (camino.length - 1)).toISOString(),
  }));
}

let transiciones: Transition[] = leads.flatMap(historialSemilla);

const tareas: Task[] = [
  {
    id: uuid(16),
    lead_id: LEAD_ID,
    agent_id: AGENT_ID,
    status: "PENDING",
    due_at: "2026-09-16T20:00:00Z",
    note: "Confirmar con Laura la asistencia a la visita del jueves.",
    created_at: "2026-09-08T16:05:00Z",
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
  if (agentId !== AGENT_ID) noEncontrado("El agente no existe o es de otra agencia.");
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
 * tiene un solo agente; el listing sale del lead de la cita.
 */
function citaPorIdMock(id: string): AppointmentDetail {
  const encontrada = citas.find(c => c.id === id);
  if (!encontrada) noEncontrado("La cita no existe o es de otra agencia.");
  const pub = buscarListing(buscarLead(encontrada.lead_id)!.listing_id)!;
  return {
    ...encontrada,
    listing_id: pub.id,
    location: [pub.address, pub.neighborhood, pub.city].filter(Boolean).join(", "),
    agent_name: agente.full_name,
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
  return tareas.filter(t => t.lead_id === leadId);
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

/* ---------- router ---------- */

/**
 * Para probar a mano estados que los mocks no producen solos (ver README):
 * desde la consola del navegador, o del servidor, se pone
 * `globalThis.__homeliticsMock = { latenciaMs: 2000, falla: "red" }`.
 * `latenciaMs` demora todas las respuestas; `falla` hace fallar las
 * escrituras (no los GET) con ese `kind`. Se borra con `= undefined`.
 */
type PruebaMock = { latenciaMs?: number; falla?: ErrorKind };

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
  if (pathname === "/me" && m === "GET") return agente;
  if (pathname === "/listings" && m === "GET") return listingsMock(searchParams);

  if ((match = pathname.match(/^\/listings\/([^/]+)$/)) && m === "GET") {
    return listingPorIdMock(match[1]);
  }
  if ((match = pathname.match(/^\/agents\/([^/]+)\/slots$/)) && m === "GET") {
    return slotsMock(match[1], searchParams);
  }
  if (pathname === "/leads" && m === "GET") return leadsMock(searchParams);
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
  if ((match = pathname.match(/^\/leads\/([^/]+)\/interactions$/))) {
    if (m === "GET") return interaccionesDelLeadMock(match[1]);
    if (m === "POST") return crearInteraccionMock(match[1], cuerpo);
  }
  if ((match = pathname.match(/^\/leads\/([^/]+)\/tasks$/)) && m === "GET") {
    return tareasDelLeadMock(match[1]);
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
};
