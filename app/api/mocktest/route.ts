import { NextResponse } from "next/server";
import { api, HomeliticsError } from "@/lib/homelitics";
import { MOCK_IDS, resolverMock } from "@/lib/mock";
import { diaLocal } from "@/lib/format";
import {
  AppointmentSchema, LeadCardSchema, LeadSchema, ListingSchema, NotificationPageSchema,
  type Lead, type NotificationOut, type NotificationPage,
} from "@/lib/schemas";
import { PLANTILLAS, plantillaSugerida } from "@/features/plantillas/plantillas";
import { construirContexto, rellenar } from "@/features/plantillas/rellenar";

async function probar(nombre: string, fn: () => Promise<unknown>) {
  try {
    return { nombre, ok: true, valor: await fn() };
  } catch (e) {
    if (e instanceof HomeliticsError) return { nombre, ok: false, kind: e.kind, status: e.status, detail: e.detail };
    return { nombre, ok: false, error: String(e) };
  }
}

const NOMBRE_AGENTE: Record<string, string> = {
  [MOCK_IDS.AGENT_ID]: "demo", [MOCK_IDS.AGENT_ID_PAULA]: "Paula",
  [MOCK_IDS.AGENT_ID_ANDRES]: "Andrés", [MOCK_IDS.AGENT_ID_INACTIVO]: "inactivo",
};

/** HU-10: cuántos en riesgo, de quién y si están los casos con id fijo. */
function resumenRiesgo(leads: Lead[]) {
  const ids = new Set(leads.map(l => l.id));
  const porAgente: Record<string, number> = {};
  for (const l of leads) {
    const nombre = NOMBRE_AGENTE[l.agent_id] ?? l.agent_id;
    porAgente[nombre] = (porAgente[nombre] ?? 0) + 1;
  }
  return {
    total: leads.length,
    porAgente,
    reciente: ids.has(MOCK_IDS.LEAD_ID_RECIENTE),
    atendido: ids.has(MOCK_IDS.LEAD_ID_ATENDIDO),
    soloBot: ids.has(MOCK_IDS.LEAD_ID_SOLO_BOT),
    soloNota: ids.has(MOCK_IDS.LEAD_ID_SOLO_NOTA),
    terminal: ids.has(MOCK_IDS.LEAD_ID_GANADO) || ids.has(MOCK_IDS.LEAD_ID_PERDIDO),
  };
}

/**
 * HU-12 (2.21). Funciones puras, así que van con datos fijos y no con el
 * mock, que las pruebas de arriba mutan. Pasan por los mismos esquemas de zod.
 */
const P_LEAD = LeadSchema.parse({
  id: "b20b2000-0000-4000-8000-000000000001", client_id: "b20b2000-0000-4000-8000-000000000002",
  listing_id: "b20b2000-0000-4000-8000-000000000003", agent_id: MOCK_IDS.AGENT_ID,
  source_channel: "TELEGRAM", current_stage: "VISIT_SCHEDULED",
  created_at: "2026-10-01T15:00:00Z", updated_at: "2026-10-01T15:00:00Z",
});
const P_LISTING = ListingSchema.parse({
  id: P_LEAD.listing_id, property_id: "b20b2000-0000-4000-8000-000000000004", agent_id: MOCK_IDS.AGENT_ID,
  operation_type: "SALE", asking_price: "9007199254740993.50", status: "ACTIVE",
  published_at: "2026-09-01T15:00:00Z", city: "Medellín", neighborhood: "Laureles",
  address: "Cra. 76 #33-12", property_type: "APARTMENT", area_m2: "82.00", bedrooms: 3, bathrooms: 2,
});
const pCita = (n: number, scheduled_at: string, status: string) => AppointmentSchema.parse({
  id: `b20b2000-0000-4000-8000-00000000010${n}`, lead_id: P_LEAD.id, agent_id: MOCK_IDS.AGENT_ID,
  scheduled_at, duration_min: 30, status, created_by: null,
  created_at: "2026-10-01T15:00:00Z", updated_at: "2026-10-01T15:00:00Z",
});
const P_AHORA = new Date("2026-10-20T12:00:00Z");
// 01:30 UTC del 23 es 20:30 del 22 en Bogotá: prueba que el día sale en hora local.
const P_CITAS = [
  pCita(1, "2026-10-10T15:00:00Z", "COMPLETED"),
  pCita(2, "2026-10-25T15:00:00Z", "CONFIRMED"),
  pCita(3, "2026-10-23T01:30:00Z", "PENDING_CONFIRMATION"),
  pCita(4, "2026-10-21T15:00:00Z", "CANCELLED"),
  pCita(5, "2026-10-19T15:00:00Z", "CONFIRMED"), // ya pasó y nadie la cerró
];
const P_AGENTE = { full_name: "Paula Restrepo" };

function casosPlantillas() {
  const ctx = construirContexto(P_LEAD, P_LISTING, P_CITAS, P_AGENTE, P_AHORA);
  const caso = (nombre: string, valor: unknown, esperado: unknown) =>
    ({ nombre, pasa: JSON.stringify(valor) === JSON.stringify(esperado), valor, esperado });
  const plantilla = (clave: string) => PLANTILLAS.find(p => p.clave === clave)!.texto;
  const conFicha = construirContexto(
    LeadCardSchema.parse({
      ...P_LEAD, client_name: "Laura Gómez", listing_address: null, neighborhood: null,
      operation_type: "SALE", asking_price: "1.00", last_interaction: null,
    }),
    P_LISTING, [], P_AGENTE, P_AHORA,
  );
  return [
    caso("plantillas: cuatro, claves del back", PLANTILLAS.map(p => p.clave),
      ["welcome", "visit_confirmed", "post_visit_feedback", "re_engagement"]),
    caso("plantillas: sugerida por etapa",
      (["INTERESTED", "VISIT_SCHEDULED", "VISITED", "NEGOTIATING", "WON", "LOST"] as const)
        .map(e => plantillaSugerida(e)?.clave ?? null),
      ["welcome", "visit_confirmed", "post_visit_feedback", "re_engagement", null, "re_engagement"]),
    caso("contexto: LeadOut sin client_name, próxima cita en hora de Bogotá", ctx, {
      client_name: null, agent_name: "Paula Restrepo", listing_address: "Cra. 76 #33-12",
      neighborhood: "Laureles", price: "$9.007.199.254.740.994",
      visit_date: "jueves 22 de octubre", visit_time: "20:30",
    }),
    caso("contexto: LeadCard sí trae client_name", conFicha.client_name, "Laura Gómez"),
    caso("contexto: sin citas vigentes, la última completada",
      construirContexto(P_LEAD, P_LISTING, [P_CITAS[0], P_CITAS[3], P_CITAS[4]], P_AGENTE, P_AHORA).visit_date,
      "sábado 10 de octubre"),
    caso("contexto: sin listing ni agente", construirContexto(P_LEAD, null, [], null, P_AHORA), {
      client_name: null, agent_name: null, listing_address: null, neighborhood: null,
      price: null, visit_date: null, visit_time: null,
    }),
    caso("rellenar: confirmación con LeadOut", rellenar(plantilla("visit_confirmed"), ctx), {
      texto: "Hola, [falta: nombre del cliente]. Te confirmo la visita al inmueble de Cra. 76 #33-12, " +
        "en Laureles, el jueves 22 de octubre a las 20:30. Si necesitas cambiar la hora, me avisas " +
        "por aquí. Nos vemos allá. Paula Restrepo",
      faltantes: [{ variable: "client_name", etiqueta: "nombre del cliente" }],
    }),
    caso("rellenar: todo completo, sin faltantes", rellenar(plantilla("re_engagement"), conFicha).faltantes, []),
    caso("rellenar: repetida y vacía cuentan una vez",
      rellenar("{neighborhood} y {neighborhood}", { neighborhood: "  " }), {
        texto: "[falta: barrio] y [falta: barrio]",
        faltantes: [{ variable: "neighborhood", etiqueta: "barrio" }],
      }),
    caso("rellenar: variable desconocida no se borra",
      rellenar("Hola {clinet_name}", { client_name: "Laura" }), {
        texto: "Hola [falta: clinet_name]",
        faltantes: [{ variable: "clinet_name", etiqueta: "clinet_name" }],
      }),
    caso("rellenar: un valor con llaves no se reinterpreta",
      rellenar("{client_name}", { client_name: "{agent_name}", agent_name: "X" }),
      { texto: "{agent_name}", faltantes: [] }),
    caso("rellenar: precio con centavos redondea sin Number",
      rellenar("{price}", construirContexto(P_LEAD, { ...P_LISTING, asking_price: "650137717.29" }, [], null, P_AHORA)).texto,
      "$650.137.717"),
  ];
}

/** Recorre una bandeja con `next_before` hasta el final. */
async function todasLasPaginas(pagina: (before?: number) => Promise<NotificationPage>) {
  const items: NotificationOut[] = [];
  const unread: number[] = [];
  let before: number | undefined;
  do {
    const p = await pagina(before);
    items.push(...p.items);
    unread.push(p.unread_count);
    before = p.next_before ?? undefined;
  } while (before !== undefined);
  return { items, unread };
}

const masNuevoPrimero = (items: NotificationOut[]) => items.every((a, i) => i === 0 || items[i - 1].id > a.id);
const noLeidos = (items: NotificationOut[]) => items.filter(a => !a.read).length;

/** Con `{ rol }` en el interruptor del mock, como "riesgo por agente como AGENT". */
async function comoRol<T>(rol: "AGENT" | "TEAM_ADMIN", fn: () => Promise<T>): Promise<T> {
  const g = globalThis as { __homeliticsMock?: unknown };
  g.__homeliticsMock = { rol };
  try {
    return await fn();
  } finally {
    g.__homeliticsMock = undefined;
  }
}

/**
 * 2.30. Avisos. Van todos por `api` (zod) salvo los 422 que el cliente ya
 * ataja antes de salir: esos van al mock directo para ver lo que diría el
 * API. El orden importa: primero lecturas, después las marcas.
 */
async function casosAvisos() {
  const hoy = diaLocal(new Date().toISOString());
  const agencia = await todasLasPaginas(before => api.avisosAgencia({ before }));
  const deOtro = agencia.items.find(a => a.recipient_agent_id !== MOCK_IDS.AGENT_ID)!;
  const casos = [
    await probar("avisos: página 1", async () => {
      const p = await api.avisos();
      return {
        items: p.items.length, unread_count: p.unread_count, next_before: p.next_before,
        ultimoId: p.items.at(-1)?.id, masNuevoPrimero: masNuevoPrimero(p.items),
        todosDelDemo: p.items.every(a => a.recipient_agent_id === MOCK_IDS.AGENT_ID),
      };
    }),
    await probar("avisos: página 2 con before", async () => {
      const p1 = await api.avisos();
      const p2 = await api.avisos({ before: p1.next_before! });
      return {
        items: p2.items.length, next_before: p2.next_before, unreadIgual: p2.unread_count === p1.unread_count,
        sinRepetir: p2.items.every(a => a.id < p1.items.at(-1)!.id),
      };
    }),
    await probar("avisos: limit 5 recorre todo, unread_count igual en cada página", async () => {
      const todo = await todasLasPaginas(before => api.avisos({ limit: 5, before }));
      return {
        total: todo.items.length, paginas: todo.unread.length, unread: todo.unread,
        cuadra: todo.unread.every(n => n === noLeidos(todo.items)), masNuevoPrimero: masNuevoPrimero(todo.items),
      };
    }),
    await probar("avisos: type=VISIT_SCHEDULED", async () => {
      const todo = await todasLasPaginas(before => api.avisos({ type: "VISIT_SCHEDULED", before }));
      return { total: todo.items.length, soloEseTipo: todo.items.every(a => a.type === "VISIT_SCHEDULED"), unread: todo.unread[0] };
    }),
    await probar("avisos: read=false", async () => {
      const p = await api.avisos({ read: false });
      return { items: p.items.length, unread_count: p.unread_count, todosSinLeer: p.items.every(a => !a.read && a.read_at === null) };
    }),
    await probar("avisos: read=true da unread_count 0", async () => {
      const p = await api.avisos({ read: true, limit: 3 });
      return { items: p.items.length, unread_count: p.unread_count, todosLeidos: p.items.every(a => a.read && a.read_at !== null) };
    }),
    await probar("avisos: limit 21 (cliente)", () => api.avisos({ limit: 21 })),
    await probar("avisos: limit 21 (mock directo)", () => resolverMock("/me/notifications?limit=21")),
    await probar("avisos: limit 0 (mock directo)", () => resolverMock("/me/notifications?limit=0")),
    await probar("avisos: type malo (mock directo)", () => resolverMock("/me/notifications?type=LEAD_LOST")),
    await probar("avisos: read malo (mock directo)", () => resolverMock("/me/notifications?read=quizas")),
    await probar("avisos: cobertura de la semilla (toda la agencia)", async () => {
      const it = agencia.items;
      const unicos = <T,>(xs: T[]) => [...new Set(xs)].sort();
      const conCita = it.filter(a => a.appointment_id);
      const citasDelLead = await Promise.all(conCita.map(a => api.citasDelLead(a.lead_id)));
      return {
        total: it.length,
        porDestinatario: Object.fromEntries(unicos(it.map(a => a.recipient_name)).map(n => [n, it.filter(a => a.recipient_name === n).length])),
        assigned_via: unicos(it.map(a => a.assigned_via ?? "—")),
        reasignadosConFrom: it.filter(a => a.assigned_via === "REASSIGNED").every(a => a.from_agent_id !== null),
        visit_status: unicos(conCita.map(a => a.visit_status!)),
        bookedDistintoDelActual: conCita.filter(a => a.booked_status !== a.visit_status).length,
        actor_role: unicos(it.map(a => a.actor_role ?? "—")),
        actorNameNulo: it.filter(a => a.actor_name === null).length,
        clientNameNulo: it.filter(a => a.client_name === null).length,
        leidos: it.filter(a => a.read).length, noLeidos: noLeidos(it),
        // Lo que necesita /leads/{lead_id}#cita-{appointment_id}.
        citaEnSuLead: conCita.every((a, i) => citasDelLead[i].some(c => c.id === a.appointment_id)),
        nulosPorTipo: it.every(a => a.type === "LEAD_ASSIGNED"
          ? a.appointment_id === null && a.visit_status === null && a.booked_status === null && a.assigned_via !== null
          : a.assigned_via === null && a.from_agent_id === null && a.visit_scheduled_at !== null),
      };
    }),
    // Va después de "mover ok": Daniel ya es WON y su visita abierta se canceló.
    await probar("avisos: visit_status es el de ahora, booked_status el de entonces", async () =>
      agencia.items.filter(a => a.lead_id === MOCK_IDS.LEAD_ID_NEGOCIANDO && a.type === "VISIT_SCHEDULED")
        .map(a => [a.booked_status, a.visit_status])),
    // Monitor (solo TEAM_ADMIN).
    await probar("monitor: como AGENT", () => comoRol("AGENT", () => api.avisosAgencia())),
    await probar("monitor: como AGENT con limit 21 (403 antes que 422, mock directo)", () =>
      comoRol("AGENT", () => resolverMock("/notifications?limit=21"))),
    await probar("monitor: sin filtros", async () => ({
      total: agencia.items.length, paginas: agencia.unread.length, unread_count: agencia.unread[0],
      cuadra: agencia.unread[0] === noLeidos(agencia.items), masNuevoPrimero: masNuevoPrimero(agencia.items),
    })),
    ...(await Promise.all(([
      ["monitor: de Paula", { recipient_agent_id: MOCK_IDS.AGENT_ID_PAULA }, (a: NotificationOut) => a.recipient_agent_id === MOCK_IDS.AGENT_ID_PAULA],
      ["monitor: causados por Hernando", { actor_agent_id: MOCK_IDS.AGENT_ID }, (a: NotificationOut) => a.actor_agent_id === MOCK_IDS.AGENT_ID],
      ["monitor: by_bot=true", { by_bot: true }, (a: NotificationOut) => a.actor_role === "AI_AGENT"],
      ["monitor: by_bot=false", { by_bot: false }, (a: NotificationOut) => a.actor_role === "TEAM_ADMIN"],
      ["monitor: LEAD_ASSIGNED sin leer", { type: "LEAD_ASSIGNED", read: false }, (a: NotificationOut) => a.type === "LEAD_ASSIGNED" && !a.read],
      ["monitor: un lead", { lead_id: MOCK_IDS.LEAD_ID }, (a: NotificationOut) => a.lead_id === MOCK_IDS.LEAD_ID],
      ["monitor: hoy (día de Bogotá)", { created_from: hoy, created_to: hoy }, (a: NotificationOut) => diaLocal(a.created_at) === hoy],
      ["monitor: septiembre", { created_from: "2026-09-01", created_to: "2026-09-30" },
        (a: NotificationOut) => diaLocal(a.created_at) >= "2026-09-01" && diaLocal(a.created_at) <= "2026-09-30"],
    ] as const).map(([nombre, f, esperado]) => probar(nombre, async () => {
      const todo = await todasLasPaginas(before => api.avisosAgencia({ ...f, before }));
      const debian = agencia.items.filter(esperado);
      return {
        total: todo.items.length,
        exacto: todo.items.length === debian.length && todo.items.every(a => esperado(a)),
        unread_count: todo.unread[0], cuadra: todo.unread[0] === noLeidos(debian),
      };
    })))),
    // 01:30 UTC del 8 de agosto todavía es 7 en Bogotá: el día se lee en hora local.
    await probar("monitor: el 7 de agosto en hora de Bogotá", async () =>
      (await api.avisosAgencia({ created_from: "2026-08-07", created_to: "2026-08-07" })).items.map(a => a.created_at)),
    await probar("monitor: el 8 de agosto en hora de Bogotá (vacío)", async () =>
      (await api.avisosAgencia({ created_from: "2026-08-08", created_to: "2026-08-08" })).items.length),
    await probar("monitor: rango al revés (cliente)", () => api.avisosAgencia({ created_from: "2026-09-10", created_to: "2026-09-01" })),
    await probar("monitor: rango al revés (mock directo)", () => resolverMock("/notifications?created_from=2026-09-10&created_to=2026-09-01")),
    await probar("monitor: limit 21 (mock directo)", () => resolverMock("/notifications?limit=21")),
    await probar("monitor: type malo (mock directo)", () => resolverMock("/notifications?type=VISIT_CANCELLED")),
    await probar("monitor: by_bot malo (mock directo)", () => resolverMock("/notifications?by_bot=quizas")),
    await probar("monitor: lead_id malo (mock directo)", () => resolverMock("/notifications?lead_id=123")),
    await probar("monitor: día malo (mock directo)", () => resolverMock("/notifications?created_from=2026-13-01")),
    await probar("monitor: forma de zod (mock directo)", async () =>
      NotificationPageSchema.safeParse(await resolverMock("/notifications?limit=20")).success),
  ];

  // Marcas: cambian el estado, así que van al final.
  casos.push(
    await probar("marcar leído: 204, resta 1 y guarda read_at", async () => {
      const antes = await api.avisos({ read: false });
      const id = antes.items[0].id;
      const respuesta = await api.marcarAvisoLeido(id);
      const despues = await api.avisos();
      const marcado = despues.items.find(a => a.id === id)!;
      return {
        respuesta: respuesta === undefined ? "sin cuerpo" : respuesta,
        resta1: despues.unread_count === antes.unread_count - 1, read: marcado.read, conReadAt: marcado.read_at !== null,
      };
    }),
    await probar("marcar leído dos veces: read_at conserva la primera", async () => {
      const id = (await api.avisos({ read: true, limit: 1 })).items[0].id;
      const primera = (await api.avisos()).items.find(a => a.id === id)?.read_at;
      await new Promise(r => setTimeout(r, 5));
      await api.marcarAvisoLeido(id);
      return (await api.avisos()).items.find(a => a.id === id)?.read_at === primera;
    }),
    await probar("marcar leído uno ajeno", () => api.marcarAvisoLeido(deOtro.id)),
    await probar("marcar leído uno ajeno no lo cambia", async () =>
      (await api.avisosAgencia({ recipient_agent_id: deOtro.recipient_agent_id })).items.find(a => a.id === deOtro.id)?.read === deOtro.read),
    await probar("marcar leído inexistente", () => api.marcarAvisoLeido(999_999)),
    await probar("marcar leído id no entero (mock directo)", () => resolverMock("/me/notifications/abc/read", "POST")),
    await probar("mirar el monitor no marca nada", async () => {
      const antes = (await api.avisosAgencia()).unread_count;
      await api.avisosAgencia({ read: false });
      return (await api.avisosAgencia()).unread_count === antes;
    }),
    await probar("marcar todos: marked = los que faltaban", async () => {
      const antes = (await api.avisos()).unread_count;
      const { marked } = await api.marcarTodosLeidos();
      const despues = await api.avisos();
      const otros = await api.avisosAgencia({ recipient_agent_id: MOCK_IDS.AGENT_ID_PAULA, read: false });
      return { antes, marked, despues: despues.unread_count, otrosIntactos: otros.unread_count > 0 };
    }),
    await probar("marcar todos otra vez: marked 0", () => api.marcarTodosLeidos()),
  );
  return casos;
}

export async function GET() {
  return NextResponse.json([
    ...casosPlantillas(),
    await probar("slots", () => api.slots(MOCK_IDS.AGENT_ID, "2026-09-14T00:00:00Z", "2026-09-19T00:00:00Z")),
    await probar("interacciones", () => api.interacciones(MOCK_IDS.LEAD_ID)),
    await probar("lista vacía", () => api.interacciones(MOCK_IDS.LEAD_ID_VACIO)),
    await probar("cita ok", () => api.crearCita(MOCK_IDS.LEAD_ID, { scheduled_at: "2030-01-06T14:00:00Z", duration_min: 30 })),
    await probar("horario ocupado", () => api.crearCita(MOCK_IDS.LEAD_ID, { scheduled_at: "2030-01-06T14:00:00Z", duration_min: 30 })),
    await probar("cita cancelada", () => api.actualizarCita(MOCK_IDS.APPOINTMENT_ID_CANCELADA, { status: "CONFIRMED" })),
    await probar("encuesta bloqueada", () => api.enviarEncuesta(MOCK_IDS.APPOINTMENT_ID_NO_COMPLETADA, { submitted_by: "CLIENT" })),
    await probar("tablero activo", async () => (await api.leads({ active: true })).map(l => l.current_stage)),
    await probar("por inmueble", async () => (await api.leads({ property_id: MOCK_IDS.PROPERTY_ID_DOBLE })).map(l => l.operation_type)),
    await probar("fechas al revés", () => api.leads({ created_from: "2026-09-10", created_to: "2026-09-01" })),
    await probar("historial", () => api.transiciones(MOCK_IDS.LEAD_ID)),
    await probar("salto ilegal", () => api.moverLead(MOCK_IDS.LEAD_ID_VACIO, { to_stage: "VISITED" })),
    await probar("perdido sin motivo", () => api.moverLead(MOCK_IDS.LEAD_ID_NEGOCIANDO, { to_stage: "LOST" })),
    await probar("motivo fuera de LOST", () => api.moverLead(MOCK_IDS.LEAD_ID_NEGOCIANDO, { to_stage: "WON", lost_reason: "PRICE" })),
    await probar("ya ganado", () => api.moverLead(MOCK_IDS.LEAD_ID_GANADO, { to_stage: "LOST", lost_reason: "OTHER" })),
    await probar("mover ok", () => api.moverLead(MOCK_IDS.LEAD_ID_NEGOCIANDO, { to_stage: "WON", note: "Firmó la promesa" })),
    await probar("ya no está activo", async () => (await api.leads({ active: true })).some(l => l.id === MOCK_IDS.LEAD_ID_NEGOCIANDO)),
    // GET /agents: sin bots por defecto; `role=AI_AGENT` los trae solo.
    await probar("agentes", async () => (await api.agentes()).map(a => a.full_name)),
    await probar("agentes activos", async () => (await api.agentes({ active: true })).length),
    await probar("agentes con bots", async () => (await api.agentes({ include_bots: true })).map(a => a.role)),
    await probar("agentes solo bots", async () => (await api.agentes({ role: "AI_AGENT" })).length),
    await probar("agentes paginados", async () => (await api.agentes({ limit: 2, offset: 1 })).map(a => a.full_name)),
    // HU-08. `LEAD_ID` es del agente demo (`AGENT_ID`).
    await probar("reasignar al bot", () => api.reasignarLead(MOCK_IDS.LEAD_ID, { to_agent_id: MOCK_IDS.AGENT_ID_BOT })),
    await probar("reasignar al dueño", () => api.reasignarLead(MOCK_IDS.LEAD_ID, { to_agent_id: MOCK_IDS.AGENT_ID })),
    await probar("reasignar a inactivo", () => api.reasignarLead(MOCK_IDS.LEAD_ID, { to_agent_id: MOCK_IDS.AGENT_ID_INACTIVO })),
    await probar("reasignar a desconocido", () => api.reasignarLead(MOCK_IDS.LEAD_ID, { to_agent_id: "a10a1000-0000-4000-8000-00000000ffff" })),
    await probar("reasignar sin uuid", () => api.reasignarLead(MOCK_IDS.LEAD_ID, { to_agent_id: "" })),
    await probar("reasignar ok", async () => (await api.reasignarLead(MOCK_IDS.LEAD_ID, { to_agent_id: MOCK_IDS.AGENT_ID_PAULA })).agent_id === MOCK_IDS.AGENT_ID_PAULA),
    await probar("sin interacción nueva", async () => (await api.interacciones(MOCK_IDS.LEAD_ID)).length),
    await probar("devolver al demo", async () => (await api.reasignarLead(MOCK_IDS.LEAD_ID, { to_agent_id: MOCK_IDS.AGENT_ID })).agent_id),
    // HU-17. Cada fila: [etapa, leads_reached, pct_from_prev, pct_of_first].
    ...(await Promise.all(([
      ["embudo sin filtros", {}],
      ["embudo septiembre", { created_from: "2026-09-01", created_to: "2026-09-30" }],
      ["embudo inmueble doble", { property_id: MOCK_IDS.PROPERTY_ID_DOBLE }],
      ["embudo venta", { operation_type: "SALE" }],
      ["embudo arriendo", { operation_type: "RENT" }],
      ["embudo Paula", { agent_id: MOCK_IDS.AGENT_ID_PAULA }],
      ["embudo Andrés", { agent_id: MOCK_IDS.AGENT_ID_ANDRES }],
      ["embudo vacío", { created_from: "2030-01-01" }],
      ["embudo fechas al revés", { created_from: "2026-09-10", created_to: "2026-09-01" }],
    ] as const).map(([nombre, f]) => probar(nombre, async () => {
      const e = await api.embudo(f);
      return { perdidos: e.lost, etapas: e.stages.map(s => [s.stage, s.leads_reached, s.pct_from_prev, s.pct_of_first]) };
    })))),
    await probar("embudo csv", () => api.embudoCsv({ created_from: "2026-09-01", created_to: "2026-09-30" })),
    await probar("embudo csv vacío", () => api.embudoCsv({ created_from: "2030-01-01" })),
    await probar("embudo csv fechas al revés", () => api.embudoCsv({ created_from: "2026-09-10", created_to: "2026-09-01" })),
    await probar("embudo filters (eco)", async () => (await api.embudo({ created_from: "2026-09-01", operation_type: "RENT" })).filters),
    ...(await Promise.all([30, 90, 180, 0].map(d => probar(`motivos ${d} días`, () => api.motivosPerdida(d))))),
    // HU-10 y HU-13. Va después de "mover ok", así que NEGOCIANDO ya es WON.
    // 24 h: reciente y atendido fuera; soloBot y soloNota dentro; sin terminales.
    await probar("en riesgo 24 h", async () => resumenRiesgo(await api.leadsEnRiesgo({ hours: 24 }))),
    // 1 h: el reciente (2 h) y el atendido (llamada hace 6 h) ya entran.
    await probar("en riesgo 1 h", async () => resumenRiesgo(await api.leadsEnRiesgo({ hours: 1 }))),
    // Un año: todos los leads del mock son más nuevos que la ventana.
    await probar("en riesgo 8760 h", async () => resumenRiesgo(await api.leadsEnRiesgo({ hours: 8760 }))),
    await probar("en riesgo limit 3 (más viejos primero)", async () =>
      (await api.leadsEnRiesgo({ hours: 24, limit: 3 })).map(l => l.created_at)),
    await probar("en riesgo hours 0", () => api.leadsEnRiesgo({ hours: 0 })),
    await probar("en riesgo hours 9000", () => api.leadsEnRiesgo({ hours: 9000 })),
    await probar("en riesgo limit 501", () => api.leadsEnRiesgo({ hours: 24, limit: 501 })),
    // Sin hours solo se puede llegar al mock directo: el API usa 72.
    await probar("en riesgo sin hours (mock directo, 72 h)", async () =>
      resumenRiesgo((await resolverMock("/leads/at-risk")) as Lead[])),
    await probar("en riesgo hours=abc (mock directo)", () => resolverMock("/leads/at-risk?hours=abc")),
    await probar("una nota no saca del riesgo", async () => {
      await api.crearInteraccion(MOCK_IDS.LEAD_ID_VACIO, { direction: "OUTBOUND", channel: "IN_APP", type: "NOTE", body: "Llamar mañana" });
      return (await api.leadsEnRiesgo({ hours: 24 })).some(l => l.id === MOCK_IDS.LEAD_ID_VACIO);
    }),
    await probar("un mensaje saliente sí lo saca", async () => {
      await api.crearInteraccion(MOCK_IDS.LEAD_ID_VACIO, { direction: "OUTBOUND", channel: "TELEGRAM", type: "MESSAGE", body: "Hola, ¿cuándo te queda bien la visita?" });
      return (await api.leadsEnRiesgo({ hours: 24 })).some(l => l.id === MOCK_IDS.LEAD_ID_VACIO);
    }),
    // HU-11. Tareas del lead.
    await probar("crear tarea", () => api.crearTarea(MOCK_IDS.LEAD_ID_SOLO_BOT, { due_at: "2030-01-07T15:00:00Z", note: "Llamar a Juan Pablo" })),
    await probar("crear tarea sin nota", async () => (await api.crearTarea(MOCK_IDS.LEAD_ID, { due_at: "2030-01-08T15:00:00Z" })).note),
    await probar("crear tarea nota larga", () => api.crearTarea(MOCK_IDS.LEAD_ID, { due_at: "2030-01-08T15:00:00Z", note: "x".repeat(1001) })),
    await probar("crear tarea fecha mala", () => api.crearTarea(MOCK_IDS.LEAD_ID, { due_at: "mañana" })),
    await probar("crear tarea lead inexistente", () => api.crearTarea("a10a1000-0000-4000-8000-00000000ffff", { due_at: "2030-01-08T15:00:00Z" })),
    await probar("posponer tarea", () => api.actualizarTarea(MOCK_IDS.LEAD_ID, MOCK_IDS.TASK_ID, { status: "SNOOZED", due_at: "2030-01-09T15:00:00Z" })),
    await probar("tarea hecha", async () => {
      const t = await api.actualizarTarea(MOCK_IDS.LEAD_ID, MOCK_IDS.TASK_ID, { status: "DONE" });
      return [t.status, t.due_at, t.note];
    }),
    await probar("patch vacío (cliente)", () => api.actualizarTarea(MOCK_IDS.LEAD_ID, MOCK_IDS.TASK_ID, {})),
    await probar("patch todo null (cliente)", () => api.actualizarTarea(MOCK_IDS.LEAD_ID, MOCK_IDS.TASK_ID, { status: null, note: null })),
    await probar("patch vacío (mock directo, forma del API)", () =>
      resolverMock(`/leads/${MOCK_IDS.LEAD_ID}/tasks/${MOCK_IDS.TASK_ID}`, "PATCH", "{}")),
    await probar("patch vacío a lead inexistente (422 antes que 404)", () =>
      resolverMock(`/leads/a10a1000-0000-4000-8000-00000000ffff/tasks/${MOCK_IDS.TASK_ID}`, "PATCH", "{}")),
    await probar("patch tarea de otro lead", () => api.actualizarTarea(MOCK_IDS.LEAD_ID_VACIO, MOCK_IDS.TASK_ID, { status: "DONE" })),
    await probar("tareas del lead", async () => (await api.tareas(MOCK_IDS.LEAD_ID)).map(t => [t.status, t.due_at])),
    // 2.25 (PROPUESTO). GET /tasks. Va después de "tarea hecha": TASK_ID ya es DONE.
    await probar("tareas agencia: vencidas del demo (lo que pide la campanita)", async () =>
      (await api.tareasAgencia({ status: "PENDING", due_before: new Date().toISOString(), agent_id: MOCK_IDS.AGENT_ID }))
        .map(t => [t.source, t.note, t.due_at])),
    await probar("tareas agencia: la que vence en 3 min sale con due_before más tarde", async () =>
      (await api.tareasAgencia({ status: "PENDING", due_before: new Date(Date.now() + 10 * 60_000).toISOString(), agent_id: MOCK_IDS.AGENT_ID }))
        .some(t => t.id === MOCK_IDS.TASK_ID_POR_VENCER)),
    await probar("tareas agencia: sin filtros, due_at ascendente", async () => {
      const t = await api.tareasAgencia();
      return { total: t.length, ordenadas: t.every((x, i) => i === 0 || Date.parse(t[i - 1].due_at) <= Date.parse(x.due_at)) };
    }),
    await probar("tareas agencia: SNOOZED", async () => (await api.tareasAgencia({ status: "SNOOZED" })).map(t => t.note)),
    await probar("tareas agencia: de Paula", async () => (await api.tareasAgencia({ agent_id: MOCK_IDS.AGENT_ID_PAULA })).map(t => t.source)),
    await probar("tareas agencia: agente ajeno da lista vacía", () => api.tareasAgencia({ agent_id: "a10a1000-0000-4000-8000-00000000ffff" })),
    await probar("tareas agencia: limit 2", async () => (await api.tareasAgencia({ limit: 2 })).length),
    await probar("tareas agencia: limit 201 (cliente)", () => api.tareasAgencia({ limit: 201 })),
    await probar("tareas agencia: due_before sin zona (cliente)", () => api.tareasAgencia({ due_before: "2026-10-20T12:00:00" })),
    await probar("tareas agencia: due_before sin zona (mock directo)", () => resolverMock("/tasks?due_before=2026-10-20T12:00:00")),
    await probar("tareas agencia: status malo (mock directo)", () => resolverMock("/tasks?status=OPEN")),
    await probar("source no sale en GET /leads/{id}/tasks", async () =>
      ((await resolverMock(`/leads/${MOCK_IDS.LEAD_ID}/tasks`)) as object[]).some(t => "source" in t)),
    // 2.25 (PROPUESTO). GET /analytics/at-risk-by-agent: mismos números que 2.17 con el mismo umbral.
    ...(await Promise.all(([
      ["riesgo por agente 24 h", { hours: 24 }],
      ["riesgo por agente 1 h", { hours: 1 }],
      ["riesgo por agente 8760 h", { hours: 8760 }],
      ["riesgo por agente inmueble doble", { hours: 24, property_id: MOCK_IDS.PROPERTY_ID_DOBLE }],
      ["riesgo por agente septiembre", { hours: 24, from: "2026-09-01", to: "2026-09-30" }],
    ] as const).map(([nombre, f]) => probar(nombre, async () => {
      const r = await api.riesgoPorAgente(f);
      const cliente = (await api.leadsEnRiesgo({ hours: f.hours, limit: 500 })).length;
      return {
        total: r.total,
        sumaCuadra: r.total === r.agents.reduce((s, g) => s + g.leads.length, 0),
        agentes: r.agents.map(g => [g.full_name, g.leads_at_risk]),
        igualQueAtRiskSinFiltros: Object.keys(r.filters).length ? "con filtros" : r.total === cliente,
        filters: r.filters,
      };
    })))),
    await probar("riesgo por agente hours 0", () => api.riesgoPorAgente({ hours: 0 })),
    await probar("riesgo por agente fechas al revés", () => api.riesgoPorAgente({ hours: 24, from: "2026-09-10", to: "2026-09-01" })),
    await probar("riesgo por agente fechas al revés (mock directo)", () => resolverMock("/analytics/at-risk-by-agent?hours=24&from=2026-09-10&to=2026-09-01")),
    await probar("riesgo por agente format=xml (mock directo)", () => resolverMock("/analytics/at-risk-by-agent?hours=24&format=xml")),
    await probar("riesgo por agente csv (mock directo)", async () =>
      ((await resolverMock("/analytics/at-risk-by-agent?hours=24&format=csv")) as string).split("\r\n").slice(0, 3)),
    await probar("riesgo por agente como AGENT", async () => {
      const g = globalThis as { __homeliticsMock?: unknown };
      g.__homeliticsMock = { rol: "AGENT" };
      try {
        return await api.riesgoPorAgente({ hours: 24 });
      } finally {
        g.__homeliticsMock = undefined;
      }
    }),
    ...(await casosAvisos()),
  ]);
}