/**
 * Query keys de los avisos (2.32 a 2.35). Sin `"use client"` y sin
 * dependencias de runtime: lo importan los hooks del navegador,
 * app/providers.tsx (la invalidación global) y la página del monitor
 * (Server Component, para sembrar la query), como features/riesgo/claves.ts.
 */
import type { FiltrosAvisosAgencia } from "@/lib/homelitics-nucleo";

/**
 * Prefijo de todo lo de avisos: la bandeja del agente y el monitor del admin.
 * El `MutationCache` de app/providers.tsx lo invalida tras cualquier mutación
 * que no sea de avisos (una acción sobre un lead o una visita puede generar uno).
 */
export const PREFIJO_AVISOS = ["avisos"] as const;

/** El máximo de `limit` en GET /me/notifications y GET /notifications. */
export const LIMITE_AVISOS = 20;

/**
 * La bandeja lleva el id del agente aunque GET /me/notifications ya sea "lo
 * mío": el `QueryClient` sobrevive a cerrar sesión (el `redirect()` de
 * app/entrar/acciones.ts navega sin recargar) y, sin el id, quien entre
 * después en la misma pestaña vería un momento los avisos del anterior.
 */
export function prefijoBandeja(agenteId: string) {
  return [...PREFIJO_AVISOS, "bandeja", agenteId] as const;
}

/** La primera página, sin filtros: la que se relee cada minuto y da el badge. */
export function claveResumen(agenteId: string) {
  return [...prefijoBandeja(agenteId), "resumen"] as const;
}

/** Prefijo de las páginas de "Ver más", sea cual sea su punto de partida. */
export function prefijoAnteriores(agenteId: string) {
  return [...prefijoBandeja(agenteId), "anteriores"] as const;
}

/** `desde` es el `next_before` del resumen cuando se pulsó "Ver más". */
export function claveAnteriores(agenteId: string, desde: number | null) {
  return [...prefijoAnteriores(agenteId), desde] as const;
}

/** El monitor del admin (2.35): GET /notifications con los filtros de la URL. */
export function claveMonitor(f: FiltrosAvisosAgencia) {
  return [...PREFIJO_AVISOS, "monitor", f] as const;
}

/**
 * `mutationKey` de marcar uno y marcar todos. Empieza por `PREFIJO_AVISOS`
 * para que la invalidación global las reconozca y no relea lo que acaban
 * de cambiar en el caché.
 */
export const CLAVE_MARCAR_AVISOS = [...PREFIJO_AVISOS, "marcar"] as const;
