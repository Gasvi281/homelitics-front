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
  ]);
}