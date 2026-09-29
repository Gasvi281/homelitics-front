import { NextResponse } from "next/server";
import { api, HomeliticsError } from "@/lib/homelitics";
import { MOCK_IDS } from "@/lib/mock";

async function probar(nombre: string, fn: () => Promise<unknown>) {
  try {
    return { nombre, ok: true, valor: await fn() };
  } catch (e) {
    if (e instanceof HomeliticsError) return { nombre, ok: false, kind: e.kind, detail: e.detail };
    return { nombre, ok: false, error: String(e) };
  }
}

export async function GET() {
  return NextResponse.json([
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
  ]);
}