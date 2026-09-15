import { NextRequest, NextResponse } from "next/server";
import { getAuthHeader, invalidateToken } from "@/lib/session";

/**
 * Proxy hacia el API de Homelitics.
 *
 * Es lo único del repo que el navegador puede llamar, y lo único que agrega la
 * credencial. Así el token nunca llega al cliente (un token de agente ve TODA
 * la agencia) y no hay problema de CORS.
 *
 * No añadas lógica de negocio aquí: solo reenvía.
 */

const BASE = process.env.HOMELITICS_API_URL;

async function reenviar(req: NextRequest, path: string[]) {
  if (!BASE) {
    return NextResponse.json(
      { detail: "Falta HOMELITICS_API_URL" }, { status: 500 },
    );
  }

  const destino = `${BASE}/${path.join("/")}${req.nextUrl.search}`;
  const cuerpo = ["GET", "HEAD"].includes(req.method) ? undefined : await req.text();

  const enviar = async () =>
    fetch(destino, {
      method: req.method,
      headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
      body: cuerpo,
      cache: "no-store",
    });

  let res = await enviar();

  // Un 401 casi siempre es un token vencido: se renueva y se reintenta una vez.
  if (res.status === 401) {
    invalidateToken();
    res = await enviar();
  }

  const texto = await res.text();
  return new NextResponse(texto || null, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
  });
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
