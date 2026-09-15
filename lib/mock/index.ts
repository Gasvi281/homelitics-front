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
 *
 * "Horario ocupado" (2.2) no necesita un id especial: alcanza con pedir dos
 * veces la misma cita para el mismo agente, o con pedir una de las casillas
 * que `slots` ya marca como ocupadas para esa semana.
 */
import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { HomeliticsError } from "../errores";
import { TZ } from "../format";
import {
  TERMINAL_APPOINTMENT_STATUS,
  type Agent, type Appointment, type AppointmentDetail, type Feedback,
  type Interaction, type Lead, type Listing, type Task,
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

/** Manila 206. Los mismos valores que el ejemplo de docs/API_CONTRACT.md. */
const listing: Listing = {
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
};

/** Laura Restrepo. Primer contacto el 1 de septiembre por Telegram. */
const lead: Lead = {
  id: LEAD_ID,
  client_id: CLIENT_ID,
  listing_id: LISTING_ID,
  agent_id: AGENT_ID,
  source_channel: "TELEGRAM",
  current_stage: "VISIT_SCHEDULED",
  created_at: "2026-09-01T14:05:00Z",
  updated_at: "2026-09-08T16:00:00Z",
};

/** Lead recién creado, sin interacciones, tareas ni citas: el caso de lista vacía. */
const leadVacio: Lead = {
  id: LEAD_ID_VACIO,
  client_id: CLIENT_ID_VACIO,
  listing_id: LISTING_ID,
  agent_id: AGENT_ID,
  source_channel: "IN_APP",
  current_stage: "INTERESTED",
  created_at: "2026-09-09T20:00:00Z",
  updated_at: "2026-09-09T20:00:00Z",
};

const leadsPorId: Record<string, Lead> = {
  [LEAD_ID]: lead,
  [LEAD_ID_VACIO]: leadVacio,
};

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
];

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
  let resultado = [listing];
  const status = params.get("status");
  const operationType = params.get("operation_type");
  const city = params.get("city"); // coincidencia exacta, como documenta el contrato
  if (status) resultado = resultado.filter(l => l.status === status);
  if (operationType) resultado = resultado.filter(l => l.operation_type === operationType);
  if (city) resultado = resultado.filter(l => l.city === city);
  return resultado;
}

function listingPorIdMock(id: string): Listing {
  if (id !== LISTING_ID) noEncontrado("El listing no existe o es de otra agencia.");
  return listing;
}

function leadsMock(params: URLSearchParams): Lead[] {
  let resultado = Object.values(leadsPorId);
  const stage = params.get("stage");
  const agentId = params.get("agent_id");
  const listingId = params.get("listing_id");
  if (stage) resultado = resultado.filter(l => l.current_stage === stage);
  if (agentId) resultado = resultado.filter(l => l.agent_id === agentId);
  if (listingId) resultado = resultado.filter(l => l.listing_id === listingId);
  return resultado;
}

function leadPorIdMock(id: string): Lead {
  const encontrado = leadsPorId[id];
  if (!encontrado) noEncontrado("El lead no existe o es de otra agencia.");
  return encontrado;
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
  if (!leadsPorId[leadId]) noEncontrado("El lead no existe o es de otra agencia.");
  return citas.filter(c => c.lead_id === leadId);
}

function crearCitaMock(leadId: string, cuerpo: Record<string, unknown> | undefined): Appointment {
  const leadActual = leadsPorId[leadId];
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
 * solo tiene un listing y un agente, así que siempre usa esos.
 */
function citaPorIdMock(id: string): AppointmentDetail {
  const encontrada = citas.find(c => c.id === id);
  if (!encontrada) noEncontrado("La cita no existe o es de otra agencia.");
  return {
    ...encontrada,
    listing_id: listing.id,
    location: `${listing.address}, ${listing.neighborhood}, ${listing.city}`,
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
  if (!leadsPorId[leadId]) noEncontrado("El lead no existe o es de otra agencia.");
  return interacciones.filter(i => i.lead_id === leadId);
}

function crearInteraccionMock(leadId: string, cuerpo: Record<string, unknown> | undefined): Interaction {
  if (!leadsPorId[leadId]) noEncontrado("El lead no existe o es de otra agencia.");
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
  if (!leadsPorId[leadId]) noEncontrado("El lead no existe o es de otra agencia.");
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

export async function resolverMock(path: string, method: string = "GET", body?: string): Promise<unknown> {
  const url = new URL(path, "http://mock");
  const { pathname, searchParams } = url;
  const cuerpo = body ? (JSON.parse(body) as Record<string, unknown>) : undefined;
  const m = method.toUpperCase();
  let match: RegExpMatchArray | null;

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
};
