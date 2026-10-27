import { z } from "zod";
import { tokenInsights } from "@/features/insights/acciones";

/**
 * Cliente del asistente de insights (docs/INSIGHTS.md). Solo navegador: lo
 * usa `useInsightsChat`. A diferencia del API de Homelitics, aquí no hay
 * proxy: el asistente tarda hasta un minuto y las funciones SSR de Amplify
 * cortan antes. El token sale de la Server Action `tokenInsights()`.
 */

const BASE = process.env.NEXT_PUBLIC_INSIGHTS_URL ?? "";

/** Como el resto del front: lo que llega de otro servicio pasa por zod. */
const SourceSchema = z.object({
  tool: z.string(),
  endpoint: z.string(),
  params: z.record(z.string(), z.unknown()),
});

const ChatResponseSchema = z.object({
  reply: z.string(),
  conversation_id: z.string(),
  sources: z.array(SourceSchema),
});

export type Source = z.infer<typeof SourceSchema>;
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

/**
 * `status` es el HTTP del servicio; 0 si no hubo respuesta (red, timeout,
 * modo mocks, API de Homelitics dormido al confirmar el rol). Las pantallas
 * deciden solo por `status`: el `detail` del servicio nunca se muestra.
 */
export class InsightsError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "InsightsError";
  }
}

const ESTADO_SIN_TOKEN = { sin_sesion: 401, no_admin: 403, sin_rol: 0, mocks: 0 } as const;

export async function askInsights(message: string, conversationId: string | null): Promise<ChatResponse> {
  if (!BASE) throw new InsightsError(0, "Falta NEXT_PUBLIC_INSIGHTS_URL.");

  let credencial;
  try {
    credencial = await tokenInsights();
  } catch {
    throw new InsightsError(0, "No se pudo pedir el token.");
  }
  if (credencial.token === null) {
    throw new InsightsError(ESTADO_SIN_TOKEN[credencial.motivo], `Sin token: ${credencial.motivo}.`);
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(`${BASE}/insights/chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credencial.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message, conversation_id: conversationId }),
      signal: AbortSignal.timeout(65_000),
    });
  } catch {
    // Red caída o los 65 s del timeout.
    throw new InsightsError(0, "Sin respuesta del asistente.");
  }

  if (!respuesta.ok) {
    let detalle = "";
    try {
      detalle = await respuesta.text();
    } catch {
      // El cuerpo del error no importa: se decide por status.
    }
    throw new InsightsError(respuesta.status, detalle || `HTTP ${respuesta.status}`);
  }

  try {
    return ChatResponseSchema.parse(await respuesta.json());
  } catch {
    throw new InsightsError(502, "Respuesta del asistente con forma inesperada.");
  }
}

/** Despierta el servicio (Render free duerme a los ~15 min). Nunca lanza. */
export async function pingHealth(): Promise<void> {
  if (!BASE) return;
  try {
    await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(65_000) });
  } catch {
    // Solo es para despertarlo.
  }
}
