/**
 * La forma de las respuestas del API. Fuente: docs/API_CONTRACT.md.
 *
 * Todo dato que entre al front pasa por aquí. Si el API cambia un campo,
 * queremos que falle en un punto y no en diez pantallas.
 *
 * Reconciliado contra /openapi.json el 2026-09-10. Ver docs/API_CONTRACT.md
 * para el detalle de qué se confirmó y qué quedó pendiente de decisión.
 */
import { z } from "zod";

/* ---------- enumeraciones ---------- */

export const Stage = z.enum([
  "INTERESTED", "VISIT_SCHEDULED", "VISITED", "NEGOTIATING", "WON", "LOST",
]);
export const Channel = z.enum(["WHATSAPP", "IN_APP", "CALL"]);
export const Direction = z.enum(["INBOUND", "OUTBOUND"]);
export const InteractionType = z.enum(["MESSAGE", "CALL", "NOTE", "STATUS_CHANGE"]);
export const AppointmentStatus = z.enum([
  "PENDING_CONFIRMATION", "CONFIRMED", "RESCHEDULED",
  "CANCELLED", "COMPLETED", "NO_SHOW",
]);
export const TaskStatus = z.enum(["PENDING", "DONE", "SNOOZED"]);
export const OperationType = z.enum(["SALE", "RENT"]);
export const ListingStatus = z.enum(["ACTIVE", "PAUSED", "CLOSED"]);
export const Objection = z.enum([
  "PRICE", "SIZE", "LOCATION", "CONDITION", "HOA_FEE", "OTHER",
]);
export const SubmittedBy = z.enum(["AGENT", "CLIENT"]);

/** Estados de los que ya no se sale. La UI deshabilita acciones sobre ellos. */
export const TERMINAL_APPOINTMENT_STATUS = ["CANCELLED", "COMPLETED", "NO_SHOW"] as const;

/* ---------- ayudas ---------- */

/** El API manda dinero como string con dos decimales. No lo conviertas a número. */
const money = z.string().regex(/^\d+(\.\d{1,2})?$/, "monto con formato inesperado");
/** ISO-8601 en UTC con offset explícito. */
const instant = z.string().datetime({ offset: true });

/* ---------- entidades ---------- */

export const AgentSchema = z.object({
  id: z.string().uuid(),
  agency_id: z.string().uuid(),
  role: z.enum(["AGENT", "TEAM_ADMIN"]),
  active: z.boolean(),
  full_name: z.string().nullable(),
  email: z.string().nullable(),
});

/**
 * `city`, `address`, `property_type`, `area_m2`, `bedrooms` y `bathrooms` son
 * nullable en el API (confirmado en /openapi.json: solo id, property_id,
 * agent_id, operation_type, asking_price, status y published_at son
 * obligatorios). El ejemplo de docs/API_CONTRACT.md los muestra siempre
 * presentes, pero eso es una propiedad de ese listing puntual, no una
 * garantía del API.
 */
export const ListingSchema = z.object({
  id: z.string().uuid(),
  property_id: z.string().uuid(),
  agent_id: z.string().uuid(),
  operation_type: OperationType,
  asking_price: money,
  status: ListingStatus,
  published_at: instant,
  city: z.string().nullable(),
  neighborhood: z.string().nullable(),
  address: z.string().nullable(),
  property_type: z.string().nullable(),
  area_m2: money.nullable(),
  bedrooms: z.number().int().nullable(),
  bathrooms: z.number().int().nullable(),
});

/**
 * GET /agents/{id}/slots -> { agent_id, slot_minutes, duration_min, slots: [...] }.
 * `slot_minutes` confirmado en /openapi.json el 2026-09-10 (no estaba en el
 * contrato original). Hoy siempre es 30, pero el front no debe asumirlo fijo.
 * `duration_min` confirmado contra el API real el 2026-09-14 (no estaba
 * documentado): es un eco del query param `duration_min` que acepta el
 * endpoint (por defecto 30, el mismo `SLOT_MINUTES` del backend) — cada
 * horario que devuelve deja espacio para una visita de esa duración. El
 * front no manda ese parámetro todavía (siempre pide visitas de 30 min,
 * que es lo que recomienda `docs/API_CONTRACT.md`), así que hoy siempre
 * coincide con `slot_minutes`.
 */
export const SlotsSchema = z.object({
  agent_id: z.string().uuid(),
  slot_minutes: z.number().int(),
  duration_min: z.number().int(),
  slots: z.array(instant),
});

/** Confirmado contra /openapi.json (LeadOut) el 2026-09-10: son estos 8 campos. */
export const LeadSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  listing_id: z.string().uuid(),
  /** El calendario que manda al agendar es el de ESTE agente, no el del listing. */
  agent_id: z.string().uuid(),
  source_channel: Channel,
  /** Caché de solo lectura. Se mueve con POST /leads/{id}/transitions. */
  current_stage: Stage,
  created_at: instant,
  updated_at: instant,
});

/**
 * Confirmado contra /openapi.json (AppointmentOut) el 2026-09-10.
 * `created_by` confirmado contra el API real el 2026-09-14 (no estaba
 * documentado): quién agendó la cita (un agente humano o una fila AI_AGENT),
 * nulo en historial sembrado antes de que el campo existiera.
 */
export const AppointmentSchema = z.object({
  id: z.string().uuid(),
  lead_id: z.string().uuid(),
  agent_id: z.string().uuid(),
  scheduled_at: instant,
  duration_min: z.number().int(),
  status: AppointmentStatus,
  created_by: z.string().uuid().nullable(),
  created_at: instant,
  updated_at: instant,
});

/**
 * GET /appointments/{id} (solo esa ruta) devuelve esto, no `AppointmentSchema`
 * a secas — confirmado contra el API real el 2026-09-14, no estaba en
 * `docs/API_CONTRACT.md`. Trae lo que necesita el cliente para encontrar la
 * visita: `location` (dirección de la propiedad ya resuelta del lado del
 * API) y `agent_name`, que **resuelve el bloqueo #4** de
 * `docs/SPRINT_LINEA2.md` ("no hay forma de resolver un agent_id a un
 * nombre") para esta pantalla puntual — `GET /listings/{id}` sigue sin
 * traerlo, así que el bloqueo sigue vigente ahí. `GET /leads/{id}/appointments`
 * y `PATCH /appointments/{id}` siguen devolviendo el `AppointmentSchema`
 * simple, sin estos cuatro campos.
 */
export const AppointmentDetailSchema = AppointmentSchema.extend({
  listing_id: z.string().uuid(),
  location: z.string(),
  agent_name: z.string().nullable(),
  google_calendar_url: z.string(),
});

/** Confirmado contra /openapi.json (InteractionOut) el 2026-09-10. */
export const InteractionSchema = z.object({
  id: z.string().uuid(),
  lead_id: z.string().uuid(),
  direction: Direction,
  channel: Channel,
  type: InteractionType,
  body: z.string().nullable(),
  occurred_at: instant,
  created_by: z.string().uuid().nullable(),
});

/**
 * Confirmado contra /openapi.json (TaskOut) el 2026-09-10: trae `agent_id` y
 * `created_at`, ninguno documentado antes en docs/API_CONTRACT.md.
 */
export const TaskSchema = z.object({
  id: z.string().uuid(),
  lead_id: z.string().uuid(),
  agent_id: z.string().uuid(),
  status: TaskStatus,
  due_at: instant,
  note: z.string().nullable(),
  created_at: instant,
});

/* ---------- cuerpos que enviamos ---------- */

export const CreateAppointmentBody = z.object({
  scheduled_at: instant,
  /** 30 para que calce con la grilla de slots. El API acepta de 15 a 480. */
  duration_min: z.number().int().min(15).max(480).default(30),
});

export const PatchAppointmentBody = z.object({
  status: AppointmentStatus.optional(),
  scheduled_at: instant.optional(),
  duration_min: z.number().int().min(15).max(480).optional(),
}).refine(v => Object.keys(v).length > 0, "hay que enviar al menos un campo");

export const CreateInteractionBody = z.object({
  direction: Direction,
  channel: Channel,
  type: InteractionType.default("MESSAGE"),
  body: z.string().max(4000).optional(),
  occurred_at: instant.optional(),
});

export const CreateFeedbackBody = z.object({
  submitted_by: SubmittedBy,
  interest_score: z.number().int().min(1).max(5).optional(),
  objection: Objection.optional(),
  close_probability: z.number().min(0).max(1).optional(),
  free_text: z.string().max(2000).optional(),
});

/**
 * Respuesta de POST /appointments/{id}/feedback. Confirmada contra
 * /openapi.json el 2026-09-10: no estaba documentada (el contrato solo
 * describía el cuerpo que se envía).
 *
 * OJO: la objeción vuelve como `objection_id`, un uuid contra un catálogo del
 * API — NO es el mismo string (`PRICE`, `SIZE`, ...) que se manda en
 * `objection`. Si una pantalla necesita mostrar la objeción legible, esto
 * necesita resolverse contra ese catálogo, que hoy no está documentado.
 * `close_probability` también cambia de forma: se envía como número (0-1) y
 * vuelve como string, igual que los montos de dinero.
 */
export const FeedbackSchema = z.object({
  id: z.string().uuid(),
  appointment_id: z.string().uuid(),
  submitted_by: SubmittedBy,
  interest_score: z.number().int().nullable(),
  objection_id: z.string().uuid().nullable(),
  close_probability: z.string().nullable(),
  free_text: z.string().nullable(),
  created_at: instant,
});

/* ---------- tipos ---------- */

export type Agent = z.infer<typeof AgentSchema>;
export type Listing = z.infer<typeof ListingSchema>;
export type Lead = z.infer<typeof LeadSchema>;
export type Appointment = z.infer<typeof AppointmentSchema>;
export type AppointmentDetail = z.infer<typeof AppointmentDetailSchema>;
export type Interaction = z.infer<typeof InteractionSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Feedback = z.infer<typeof FeedbackSchema>;
export type AppointmentStatus = z.infer<typeof AppointmentStatus>;
export type Channel = z.infer<typeof Channel>;
export type Stage = z.infer<typeof Stage>;
export type Objection = z.infer<typeof Objection>;
