"use server";

import { obtenerAgenteActual } from "@/lib/agente-actual";
import { HomeliticsError } from "@/lib/errores";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export type TokenInsights =
  | { token: string }
  | { token: null; motivo: "sin_sesion" | "no_admin" | "sin_rol" | "mocks" };

/**
 * El access token del admin para el asistente de insights (docs/INSIGHTS.md).
 *
 * Es la única excepción a "el token jamás llega al navegador": el asistente
 * puede tardar un minuto y las funciones SSR de Amplify cortan antes, así que
 * no hay proxy y el navegador llama directo al servicio. Se acota así:
 * - Solo `TEAM_ADMIN` (GET /me); a un `AGENT` no se le entrega nada.
 * - Se pide justo antes de cada mensaje y queda en memoria, nunca en storage.
 *
 * Volver a llamarla es el "refresh" del 401: la petición de la Server Action
 * pasa por `middleware.ts`, que renueva la cookie con `getClaims()` antes de
 * que esto lea la sesión.
 */
export async function tokenInsights(): Promise<TokenInsights> {
  // Modo mocks: no hay sesión de Supabase de la que sacar un token.
  if (process.env.USE_MOCKS === "true") return { token: null, motivo: "mocks" };

  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { token: null, motivo: "sin_sesion" };

  try {
    const agente = await obtenerAgenteActual();
    if (agente.role !== "TEAM_ADMIN") return { token: null, motivo: "no_admin" };
  } catch (error) {
    // Sin rol confirmado no hay token. Un API dormido no es "no eres admin".
    if (error instanceof HomeliticsError && error.kind === "no_autenticado") return { token: null, motivo: "sin_sesion" };
    if (error instanceof HomeliticsError && error.kind === "sin_permiso") return { token: null, motivo: "no_admin" };
    return { token: null, motivo: "sin_rol" };
  }
  return { token: data.session.access_token };
}
