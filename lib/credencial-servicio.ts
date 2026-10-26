import "server-only";

/**
 * Credencial de la cuenta de servicio de las pantallas de cliente (HU-23,
 * fase 6). La usan solo `apiPublico` (lib/homelitics.ts) y el proxy público
 * `/api/publico/*`, que tiene lista blanca de endpoints.
 *
 * Es el código de la etapa 1 de lib/session.ts, movido aquí: el servidor pide
 * un token a Supabase con SERVICE_AGENT_EMAIL y SERVICE_AGENT_PASSWORD y lo
 * guarda en memoria hasta que vence.
 *
 * Aquí el caché en una variable de módulo SÍ está permitido, y es la única
 * excepción del repo a la regla de PLAN.md ("ninguna variable de módulo puede
 * guardar algo que dependa del usuario"): esta credencial no depende de quién
 * hace la petición. Es una sola identidad, compartida a propósito por todos
 * los clientes, así que compartirla entre peticiones no le da a nadie lo de
 * otro. Debe ser un AGENT, no un TEAM_ADMIN: la credencial con menos
 * privilegios que sirve.
 */

type Cached = { token: string; expiresAt: number };
let cached: Cached | null = null;

/** Margen para no usar un token que vence en los próximos 60 segundos. */
const SKEW_MS = 60_000;

export async function getServiceAuthHeader(): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await getToken()}` };
}

/** Fuerza pedir un token nuevo. Se llama tras un 401. */
export function invalidarTokenServicio(): void {
  cached = null;
}

async function getToken(): Promise<string> {
  if (cached && cached.expiresAt - SKEW_MS > Date.now()) return cached.token;

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anon = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: requireEnv("SERVICE_AGENT_EMAIL"),
      password: requireEnv("SERVICE_AGENT_PASSWORD"),
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `No se pudo obtener el token de la cuenta de servicio (${res.status}). ` +
      `Revisa SERVICE_AGENT_EMAIL y SERVICE_AGENT_PASSWORD.`,
    );
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}. Ver CLAUDE.md.`);
  return v;
}
