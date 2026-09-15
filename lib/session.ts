import "server-only";

/**
 * El ÚNICO lugar del repo que sabe de dónde sale una credencial.
 *
 * Etapa 1 (actual): un agente demo. El servidor pide un token a Supabase con
 *   email y contraseña de .env y lo guarda en memoria hasta que vence.
 * Etapa 2 (pendiente): el agente inicia sesión en /entrar, @supabase/ssr guarda
 *   la sesión en cookie y esta función la lee.
 *
 * Al cambiar de etapa NO se toca ninguna pantalla ni el proxy: solo este archivo.
 */

type Cached = { token: string; expiresAt: number };
let cached: Cached | null = null;

/** Margen para no usar un token que vence en los próximos 60 segundos. */
const SKEW_MS = 60_000;

export async function getAuthHeader(): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await getToken()}` };
}

/** Fuerza pedir un token nuevo. Se llama tras un 401. */
export function invalidateToken(): void {
  cached = null;
}

async function getToken(): Promise<string> {
  if (cached && cached.expiresAt - SKEW_MS > Date.now()) return cached.token;

  // ETAPA 2, cuando exista el login:
  //   const supabase = createServerClient(...)
  //   const { data } = await supabase.auth.getSession()
  //   if (!data.session) redirect("/entrar")
  //   return data.session.access_token

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anon = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: requireEnv("DEMO_AGENT_EMAIL"),
      password: requireEnv("DEMO_AGENT_PASSWORD"),
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `No se pudo obtener el token del agente demo (${res.status}). ` +
      `Revisa DEMO_AGENT_EMAIL y DEMO_AGENT_PASSWORD.`,
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
