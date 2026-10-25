import { NextRequest, NextResponse } from "next/server";
import { getServiceAuthHeader, invalidarTokenServicio } from "@/lib/credencial-servicio";

/**
 * Proxy público hacia el API de Homelitics (HU-23, fase 6).
 *
 * Lo usan los Client Components de las pantallas de cliente, que no tienen
 * sesión, con `apiPublico` de lib/homelitics-navegador.ts. Agrega la
 * credencial de la cuenta de servicio (lib/credencial-servicio.ts), que ve
 * toda su agencia: por eso solo deja pasar la LISTA BLANCA de abajo, y todo
 * lo demás responde 404 sin tocar la red (misma convención que el API para
 * "no existe o no es tuyo").
 *
 * Solo entra lo que llama un Client Component; los Server Components usan
 * `apiPublico` directo contra el API y no pasan por aquí. Nunca abrir
 * `/leads`, `/leads/{id}`, `/listings/{id}`, `/me`, `/analytics/*`,
 * `/interactions` ni `/transitions`. Ver PLAN.md, "Reconocimiento (fase 0)".
 *
 * No añadas lógica de negocio aquí: solo filtra y reenvía.
 */

const BASE = process.env.HOMELITICS_API_URL;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ruta = (patron: string) => new RegExp(`^${patron}$`, "i");

/** Método + ruta, sin query. Anclada: `/appointments/{id}/x` no pasa. */
const LISTA_BLANCA: { metodo: string; patron: RegExp }[] = [
  { metodo: "GET", patron: ruta("/health") }, // /entrar, despertar el API
  { metodo: "GET", patron: ruta(`/agents/${UUID}/slots`) }, // 2.1, 2.3
  { metodo: "POST", patron: ruta(`/leads/${UUID}/appointments`) }, // 2.2
  { metodo: "GET", patron: ruta(`/appointments/${UUID}`) }, // 2.3, 2.5
  { metodo: "PATCH", patron: ruta(`/appointments/${UUID}`) }, // 2.3, parche de 2.5
  { metodo: "GET", patron: ruta(`/appointments/${UUID}/feedback`) }, // 2.5
  { metodo: "POST", patron: ruta(`/appointments/${UUID}/feedback`) }, // 2.5
];

function permitida(metodo: string, path: string[]): boolean {
  const sinQuery = `/${path.join("/")}`;
  return LISTA_BLANCA.some(r => r.metodo === metodo && r.patron.test(sinQuery));
}

/**
 * Si la cuenta de servicio no sirve, es un problema del servidor, no del
 * cliente: 502 y no 401, para que el navegador no lo trate como sesión
 * vencida y mande a /entrar a quien nunca tuvo sesión.
 */
const servicioRechazado = () =>
  NextResponse.json({ detail: "La cuenta de servicio no fue aceptada" }, { status: 502 });

async function reenviar(req: NextRequest, path: string[]) {
  if (!permitida(req.method, path)) {
    return NextResponse.json({ detail: "No encontrado" }, { status: 404 });
  }

  if (!BASE) {
    return NextResponse.json(
      { detail: "Falta HOMELITICS_API_URL" }, { status: 500 },
    );
  }

  const destino = `${BASE}/${path.join("/")}${req.nextUrl.search}`;
  const cuerpo = ["GET", "HEAD"].includes(req.method) ? undefined : await req.text();

  /** `null` si el password grant de la cuenta de servicio falló. */
  const credencial = () => getServiceAuthHeader().catch(() => null);

  const enviar = (auth: Record<string, string>) =>
    fetch(destino, {
      method: req.method,
      headers: { "Content-Type": "application/json", ...auth },
      body: cuerpo,
      cache: "no-store",
    });

  let auth = await credencial();
  if (!auth) return servicioRechazado();
  let res = await enviar(auth);

  // Un 401 casi siempre es el token de servicio vencido: se renueva y se
  // reintenta una vez. Aquí sí aplica: es una sola identidad cacheada.
  if (res.status === 401) {
    invalidarTokenServicio();
    auth = await credencial();
    if (!auth) return servicioRechazado();
    res = await enviar(auth);
  }

  if (res.status === 401) return servicioRechazado();

  const texto = await res.text();
  return new NextResponse(texto || null, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

// DELETE no está en la lista blanca: se exporta para que responda 404 y no 405.
export async function GET(req: NextRequest, ctx: Ctx) {
  return reenviar(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return reenviar(req, (await ctx.params).path);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return reenviar(req, (await ctx.params).path);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return reenviar(req, (await ctx.params).path);
}
