import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";

/**
 * Cierre de sesión forzado (HU-23, fase 4, AC4).
 *
 * Aquí llega el layout de (agente) cuando GET /me responde 403: el usuario de
 * Auth existe pero no tiene agente vinculado. El layout es un Server Component
 * y no puede escribir cookies, así que el `signOut()` se hace en este route
 * handler. El botón "Salir" no pasa por aquí: usa la Server Action `salir()`.
 */
export async function GET(): Promise<never> {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect("/entrar?error=sin-agencia");
}
