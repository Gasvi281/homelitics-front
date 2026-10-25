"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { rutaSegura } from "@/lib/redireccion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

/**
 * Server Actions del login del agente (HU-23, fase 3).
 *
 * La sesión se escribe en cookies `httpOnly` desde aquí (vía
 * `crearClienteServidor`): el token nunca pasa por el JavaScript del
 * navegador.
 */

export type EstadoEntrar = {
  error: string | null;
  /** El correo que se intentó, para no hacer escribirlo otra vez. */
  correo: string;
};

// AC1: un solo mensaje para todo. Distinguir "correo no existe" de
// "contraseña mala" le diría a cualquiera qué correos tienen cuenta.
const MENSAJE_FALLO = "El correo o la contraseña no coinciden.";

const Credenciales = z.object({
  correo: z.string().trim().min(1),
  // Sin trim: un espacio puede ser parte de la contraseña.
  contrasena: z.string().min(1),
});

export async function entrar(_previo: EstadoEntrar, formData: FormData): Promise<EstadoEntrar> {
  const correo = String(formData.get("correo") ?? "");
  const datos = Credenciales.safeParse({ correo, contrasena: formData.get("contrasena") });
  if (!datos.success) return { error: MENSAJE_FALLO, correo };

  try {
    const supabase = await crearClienteServidor();
    const { error } = await supabase.auth.signInWithPassword({
      email: datos.data.correo,
      password: datos.data.contrasena,
    });
    if (error) return { error: MENSAJE_FALLO, correo };
  } catch {
    return { error: MENSAJE_FALLO, correo };
  }

  // Fuera del try: redirect() lanza a propósito y el catch se lo comería.
  const siguiente = formData.get("siguiente");
  redirect(rutaSegura(typeof siguiente === "string" ? siguiente : null));
}

export async function salir(): Promise<never> {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect("/entrar");
}
