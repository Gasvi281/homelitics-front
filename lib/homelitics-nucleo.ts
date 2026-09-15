/**
 * El motor y la superficie del API, compartidos entre las dos mitades
 * isomórficas (lib/homelitics.ts para servidor, lib/homelitics-navegador.ts
 * para Client Components). Sin ninguna dependencia de lib/session.ts, para
 * que sea seguro importarlo desde el navegador — ver lib/errores.ts.
 *
 * lib/homelitics.ts y lib/homelitics-navegador.ts solo difieren en CÓMO se
 * arma la URL y de dónde sale la credencial (`crearPedir`); la lista de
 * operaciones (`crearApi`) es una sola, para no mantenerla dos veces.
 */
import { z } from "zod";
import { HomeliticsError } from "./errores";
import {
  AgentSchema, AppointmentSchema, AppointmentDetailSchema, FeedbackSchema,
  InteractionSchema, LeadSchema, ListingSchema, SlotsSchema, TaskSchema,
  CreateAppointmentBody, CreateFeedbackBody, CreateInteractionBody,
  PatchAppointmentBody,
} from "./schemas";

export type Pedir = <T>(path: string, schema: z.ZodType<T>, init?: RequestInit) => Promise<T>;

async function traducirError(res: Response): Promise<HomeliticsError> {
  let detail = res.statusText;
  try {
    const body = await res.json();
    detail = Array.isArray(body?.detail)
      ? body.detail.map((d: { msg: string }) => d.msg).join("; ")
      : String(body?.detail ?? detail);
  } catch { /* respuesta sin cuerpo JSON */ }

  const kind: ErrorKindDeStatus = statusAKind(res.status);
  return new HomeliticsError(kind, detail, res.status);
}

type ErrorKindDeStatus = HomeliticsError["kind"];
function statusAKind(status: number): ErrorKindDeStatus {
  switch (status) {
    case 409: return "conflicto";
    case 404: return "no_encontrado";
    case 401: return "no_autenticado";
    case 403: return "sin_permiso";
    case 422: return "invalido";
    default: return "servidor";
  }
}

/** `new URLSearchParams({ city: undefined })` manda `city=undefined`; esto lo omite. */
export function query(q: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined) p.set(k, String(v));
  return p.toString();
}

/**
 * Arma la función `pedir()` de una de las dos mitades. `urlPara` decide el
 * destino real (API directo o proxy) y `credenciales` de dónde sale el
 * header `Authorization`, si aplica. Ninguna de las dos cosas vive aquí:
 * eso es justo lo que cambia entre servidor y navegador.
 *
 * `usarMocks` también lo decide cada mitad, y no `process.env.USE_MOCKS`
 * leído aquí: Next solo mete al bundle del navegador las variables de
 * entorno con prefijo `NEXT_PUBLIC_`, así que un `process.env.USE_MOCKS`
 * evaluado en este archivo (compartido con el navegador) sería siempre
 * `undefined` del lado del cliente aunque el `.env` diga `true`.
 */
export function crearPedir(opts: {
  usarMocks: boolean;
  urlPara: (path: string) => string;
  credenciales: () => Promise<Record<string, string>>;
}): Pedir {
  return async function pedir<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {},
  ): Promise<T> {
    if (opts.usarMocks) {
      const { resolverMock } = await import("./mock");
      const valor = await resolverMock(
        path,
        init.method ?? "GET",
        typeof init.body === "string" ? init.body : undefined,
      );
      return schema.parse(valor);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(await opts.credenciales()),
      ...(init.headers as Record<string, string> | undefined),
    };

    let res: Response;
    try {
      // El servicio duerme a los 15 min: la primera petición puede tardar 60 s.
      res = await fetch(opts.urlPara(path), { ...init, headers, cache: "no-store" });
    } catch {
      throw new HomeliticsError("red", "No se pudo contactar el servicio.");
    }

    if (!res.ok) throw await traducirError(res);
    if (res.status === 204) return schema.parse(undefined);

    const json = await res.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      // Falla acá y no tres pantallas más adelante. Si es real, hay que
      // actualizar lib/schemas.ts Y docs/API_CONTRACT.md.
      throw new HomeliticsError(
        "servidor",
        `El API devolvió una forma inesperada en ${path}: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  };
}

/** La lista de operaciones del API que usa la línea 2. Ver docs/API_CONTRACT.md. */
export function crearApi(pedir: Pedir) {
  return {
    /** Despierta el servicio y comprueba conectividad. Sin token. */
    salud: () => pedir("/health", z.object({ status: z.string() })),

    yo: () => pedir("/me", AgentSchema),

    listings: (q: { city?: string; limit?: number } = {}) =>
      pedir(`/listings?${query(q)}`, z.array(ListingSchema)),

    listing: (id: string) => pedir(`/listings/${id}`, ListingSchema),

    lead: (id: string) => pedir(`/leads/${id}`, LeadSchema),

    leads: (q: { stage?: string; agent_id?: string; limit?: number } = {}) =>
      pedir(`/leads?${query(q)}`, z.array(LeadSchema)),

    /**
     * Tarea 2.1. OJO: el agente correcto es el del LEAD, no el del listing.
     * `desde` y `hasta` en ISO UTC; el API responde 422 si desde >= hasta.
     */
    slots: (agentId: string, desde: string, hasta: string) =>
      pedir(
        `/agents/${agentId}/slots?from=${encodeURIComponent(desde)}&to=${encodeURIComponent(hasta)}`,
        SlotsSchema,
      ),

    /** Tarea 2.2. Un 409 aquí significa "alguien tomó el horario", no un error del usuario. */
    crearCita: (leadId: string, body: z.input<typeof CreateAppointmentBody>) =>
      pedir(`/leads/${leadId}/appointments`, AppointmentSchema, {
        method: "POST",
        body: JSON.stringify(CreateAppointmentBody.parse(body)),
      }),

    citasDelLead: (leadId: string) =>
      pedir(`/leads/${leadId}/appointments`, z.array(AppointmentSchema)),

    /**
     * Ojo: esta ruta SÍ trae más que `AppointmentSchema` (confirmado contra
     * el API real el 2026-09-14, ver `AppointmentDetailSchema`): también
     * `listing_id`, `location`, `agent_name` y `google_calendar_url`.
     * `citasDelLead()` y `actualizarCita()` no lo hacen, esos siguen con la
     * forma simple.
     */
    cita: (id: string) => pedir(`/appointments/${id}`, AppointmentDetailSchema),

    /** Tarea 2.3. Mover una CONFIRMED sin nombrar estado la deja en RESCHEDULED. */
    actualizarCita: (id: string, body: z.input<typeof PatchAppointmentBody>) =>
      pedir(`/appointments/${id}`, AppointmentSchema, {
        method: "PATCH",
        body: JSON.stringify(PatchAppointmentBody.parse(body)),
      }),

    /** Tarea 2.4. Vienen del más viejo al más nuevo. */
    interacciones: (leadId: string) =>
      pedir(`/leads/${leadId}/interactions`, z.array(InteractionSchema)),

    crearInteraccion: (leadId: string, body: z.input<typeof CreateInteractionBody>) =>
      pedir(`/leads/${leadId}/interactions`, InteractionSchema, {
        method: "POST",
        body: JSON.stringify(CreateInteractionBody.parse(body)),
      }),

    tareas: (leadId: string) => pedir(`/leads/${leadId}/tasks`, z.array(TaskSchema)),

    /** Tarea 2.5. Devuelve 409 si la visita no está en COMPLETED. Ver bloqueo 2. */
    enviarEncuesta: (citaId: string, body: z.input<typeof CreateFeedbackBody>) =>
      pedir(`/appointments/${citaId}/feedback`, FeedbackSchema, {
        method: "POST",
        body: JSON.stringify(CreateFeedbackBody.parse(body)),
      }),

    /**
     * Tarea 2.5. No estaba en docs/API_CONTRACT.md antes de esta tarea — se
     * encontró al verificar /openapi.json. Como mucho una fila por
     * `submitted_by` (AGENT, CLIENT); la pantalla de encuesta la usa para
     * saber si el cliente ya respondió antes de mostrar el formulario.
     */
    feedbackDeCita: (citaId: string) =>
      pedir(`/appointments/${citaId}/feedback`, z.array(FeedbackSchema)),
  };
}
