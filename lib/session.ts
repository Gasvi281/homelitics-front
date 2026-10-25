import "server-only";
import { cache } from "react";
import { crearClienteServidor } from "./supabase/servidor";
import { HomeliticsError } from "./errores";

/**
 * Etapa 2: la credencial sale de la cookie de la petición actual.
 * NO la guardes en una variable de módulo (ver PLAN.md, "Reglas").
 * `cache()` memoriza solo durante un render; cada petición empieza vacía.
 */
const obtenerToken = cache(async (): Promise<string> => {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw new HomeliticsError("no_autenticado", "No hay una sesión activa.");
  }
  return data.session.access_token;
});

export async function getAuthHeader(): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await obtenerToken()}` };
}
