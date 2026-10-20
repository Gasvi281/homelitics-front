/**
 * Umbral de horas sin respuesta a partir del cual un lead está "en riesgo"
 * (HU-10 AC1, tarea 2.14). Lo leen el tablero, el aviso del header y el
 * reporte de riesgo, y todos lo mandan como `hours` a `GET /leads/at-risk`:
 * el API usa 72 si no llega, la historia pide 24, así que nunca se omite.
 *
 * PROVISIONAL hasta la migración 012 (bloqueo 8 de docs/SPRINT_E3_LINEA2.md).
 * Hoy vive en una cookie del navegador, `umbral_horas`. Cuando exista
 * `agency_settings.notify.unanswered_threshold_hours`, `leerUmbral()` pasa a
 * leerlo del API y el setter de `useUmbral()` queda solo para el admin
 * (`PUT /agency/settings/notify`). El cambio se hace solo aquí y en la mitad
 * navegador (lib/umbral-navegador.ts): ninguna pantalla sabe de dónde sale
 * el número.
 *
 * Cookie y no URL: lo leen tres pantallas, incluido el layout del agente, y
 * un parámetro de URL no viaja entre ellas. No es `httpOnly` porque la
 * escribe el cliente, y no lleva nada sensible: es solo un número.
 *
 * Dos archivos, como lib/homelitics.ts y lib/homelitics-navegador.ts: este
 * (validación compartida y `leerUmbral()` para Server Components) y
 * lib/umbral-navegador.ts (`useUmbral()`, `"use client"`). Next niega el
 * build si un archivo que alcanza un Server Component importa `useRouter` o
 * `useSyncExternalStore`, así nunca se llamen ahí. `next/headers` entra con
 * `import()` dentro de `leerUmbral()` para que la mitad navegador pueda
 * importar de aquí sin arrastrarlo.
 */
import { z } from "zod";

export const COOKIE_UMBRAL = "umbral_horas";
/** Un año: el umbral es una preferencia, no una sesión. */
export const MAX_AGE_UMBRAL = 60 * 60 * 24 * 365;
export const UMBRAL_POR_DEFECTO = 24;
/** El mismo rango que acepta `hours` en `GET /leads/at-risk`. */
export const UMBRAL_MIN = 1;
export const UMBRAL_MAX = 8760;

export const UmbralSchema = z.coerce.number().int().min(UMBRAL_MIN).max(UMBRAL_MAX);

/**
 * Cualquier cosa (el texto de la cookie, lo que escribieron en "otro") a un
 * umbral válido. Lo que no sirve vuelve a 24 sin romper la página.
 */
export function normalizarUmbral(valor: unknown): number {
  // `coerce` convierte "" y null en 0; el min ya los saca, pero mejor explícito.
  if (valor === undefined || valor === null || valor === "") return UMBRAL_POR_DEFECTO;
  const r = UmbralSchema.safeParse(valor);
  return r.success ? r.data : UMBRAL_POR_DEFECTO;
}

/** `true` si el valor se puede guardar tal cual, sin caer al defecto. */
export function esUmbralValido(valor: unknown): valor is number {
  return typeof valor === "number" && UmbralSchema.safeParse(valor).success;
}

/** El umbral para un Server Component, de la cookie de la petición. */
export async function leerUmbral(): Promise<number> {
  const { cookies } = await import("next/headers");
  const almacen = await cookies();
  return normalizarUmbral(almacen.get(COOKIE_UMBRAL)?.value);
}
