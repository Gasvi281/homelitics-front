import { NextRequest, NextResponse } from "next/server";
import { HomeliticsError, type ErrorKind } from "@/lib/errores";
import { mockForzado } from "@/lib/interruptores";
import { getAuthHeader } from "@/lib/session";

/**
 * Proxy hacia el API de Homelitics.
 *
 * Es lo único del repo que el navegador puede llamar, y lo único que agrega la
 * credencial. Así el token nunca llega al cliente (un token de agente ve TODA
 * la agencia) y no hay problema de CORS.
 *
 * No añadas lógica de negocio aquí: solo reenvía. La única excepción son los
 * endpoints propuestos que aún no existen (lib/interruptores.ts): esos los
 * responde lib/mock/ con la forma y los códigos que tendría el API.
 */

const BASE = process.env.HOMELITICS_API_URL;

/** Para las fallas simuladas del mock, que traen `kind` pero no código. */
const STATUS_DE_KIND: Record<ErrorKind, number> = {
  conflicto: 409, no_encontrado: 404, no_autenticado: 401, sin_permiso: 403,
  invalido: 422, servidor: 500, red: 502,
};

/** Lo que respondería el API, desde lib/mock/; los errores con su código y `{ detail }`. */
async function responderMock(req: NextRequest, ruta: string) {
  const { resolverMock } = await import("@/lib/mock");
  const cuerpo = ["GET", "HEAD"].includes(req.method) ? undefined : await req.text();
  try {
    const valor = await resolverMock(ruta, req.method, cuerpo || undefined);
    // Un mock sin valor imita un 204: `NextResponse.json(undefined)` daría
    // un 200 con cuerpo vacío.
    if (valor === undefined) return new NextResponse(null, { status: 204 });
    return typeof valor === "string"
      ? new NextResponse(valor, { headers: { "Content-Type": "text/csv; charset=utf-8" } })
      : NextResponse.json(valor);
  } catch (e) {
    if (!(e instanceof HomeliticsError)) throw e;
    return NextResponse.json({ detail: e.detail }, { status: e.status ?? STATUS_DE_KIND[e.kind] });
  }
}

async function reenviar(req: NextRequest, path: string[]) {
  const ruta = `/${path.join("/")}${req.nextUrl.search}`;
  if (mockForzado(ruta)) return responderMock(req, ruta);

  if (!BASE) {
    return NextResponse.json(
      { detail: "Falta HOMELITICS_API_URL" }, { status: 500 },
    );
  }

  const destino = `${BASE}${ruta}`;
  const cuerpo = ["GET", "HEAD"].includes(req.method) ? undefined : await req.text();

  // Sin cookie de sesión (o vencida sin renovar): 401 limpio, no un 500. El
  // navegador lo traduce a `no_autenticado` y manda a /entrar.
  let auth: Record<string, string>;
  try {
    auth = await getAuthHeader();
  } catch {
    return NextResponse.json({ detail: "Sesión vencida" }, { status: 401 });
  }

  // Sin reintento tras un 401 del API: renovar la sesión es trabajo del
  // middleware, y ese 401 se devuelve tal cual.
  const res = await fetch(destino, {
    method: req.method,
    headers: { "Content-Type": "application/json", ...auth },
    body: cuerpo,
    cache: "no-store",
  });

  const texto = await res.text();
  const headers: Record<string, string> = {
    "Content-Type": res.headers.get("Content-Type") ?? "application/json",
  };
  // Las descargas (GET /analytics/funnel?format=csv) traen su nombre de archivo.
  const disposicion = res.headers.get("Content-Disposition");
  if (disposicion) headers["Content-Disposition"] = disposicion;

  return new NextResponse(texto || null, { status: res.status, headers });
}

type Ctx = { params: Promise<{ path: string[] }> };

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
