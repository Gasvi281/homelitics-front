import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { rutaSegura } from "@/lib/redireccion";

/**
 * Protección de rutas y renovación de la sesión del agente (HU-23, fase 1).
 *
 * Política cerrada por defecto: toda ruta exige sesión salvo RUTAS_PUBLICAS.
 * La sesión se verifica con `getClaims()`, que valida la firma del JWT y
 * renueva el token si está por vencer. `getSession()` no sirve aquí: no
 * verifica nada y una cookie fabricada a mano pasaría.
 */

// Se comparan por prefijo completo ("/citas" y "/citas/...", no "/citasx").
// /api/homelitics responde su propio 401: no se redirige una llamada fetch.
const RUTAS_PUBLICAS = ["/entrar", "/propiedades", "/citas", "/api/publico", "/api/homelitics"];

function coincide(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(base + "/");
}

function esPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some(base => coincide(pathname, base));
}

/**
 * Redirección que conserva las cookies que Supabase haya renovado. 302 y no
 * el 307 por defecto: un 307 reenviaría un POST (Server Action) a /entrar.
 */
function redirigir(destino: URL, respuesta: NextResponse): NextResponse {
  const redireccion = NextResponse.redirect(destino, 302);
  respuesta.cookies.getAll().forEach(cookie => redireccion.cookies.set(cookie));
  return redireccion;
}

export async function middleware(request: NextRequest) {
  // Modo mocks: no hay credenciales que pedir (fase 7).
  if (process.env.USE_MOCKS === "true") return NextResponse.next();

  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (lista) => {
          lista.forEach(({ name, value }) => request.cookies.set(name, value));
          respuesta = NextResponse.next({ request });
          lista.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
        },
      },
      cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const conSesion = Boolean(data?.claims);
  const { pathname, search, searchParams } = request.nextUrl;

  if (!conSesion && !esPublica(pathname)) {
    const destino = new URL("/entrar", request.url);
    destino.searchParams.set("siguiente", pathname + search);
    return redirigir(destino, respuesta);
  }

  // Exacto: /entrar/salir (fase 4) se usa con sesión.
  if (conSesion && pathname === "/entrar") {
    return redirigir(new URL(rutaSegura(searchParams.get("siguiente")), request.url), respuesta);
  }

  return respuesta;
}

export const config = {
  // Todo menos los estáticos de Next, el favicon y archivos con extensión.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
