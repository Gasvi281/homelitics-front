/**
 * Filtros y query keys del tablero de leads (HU-06). Sin `"use client"` y sin
 * dependencias de runtime fuera de lib/etapas.ts: lo importan la página
 * (Server Component, para el `prefetchQuery`) y los hooks del navegador, y
 * los dos TIENEN que armar la misma key — si difieren, la hidratación no
 * encuentra el caché y el navegador vuelve a pedir todo.
 */
import { EMBUDO } from "@/lib/etapas";
import type { FiltrosLeads } from "@/lib/homelitics-nucleo";
import type { Stage } from "@/lib/schemas";

/** Lo que vive en la URL del tablero: `?etapa=&propiedad=&desde=&hasta=`. */
export type FiltrosTablero = {
  etapa?: Stage;
  /** `property_id`: el inmueble, con todas sus publicaciones (SALE y RENT). */
  propiedad?: string;
  /** Día `YYYY-MM-DD`, inclusivo, de creación del lead. */
  desde?: string;
  /** Día `YYYY-MM-DD`, inclusivo, de creación del lead. */
  hasta?: string;
};

/**
 * Las columnas del tablero activo. `WON` y `LOST` nunca traen tarjetas con
 * `active=true`, y combinar `active=true` con `stage=WON|LOST` no está
 * documentado (docs/API_CONTRACT.md): el filtro de etapa solo ofrece estas.
 */
export const ETAPAS_ABIERTAS: readonly Stage[] = EMBUDO.filter(e => e !== "WON");

/** Máximo de `limit` en GET /leads. El tablero pide todo lo que puede de una vez. */
export const LIMITE_TABLERO = 200;

const DIA = /^\d{4}-\d{2}-\d{2}$/;

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function leer(sp: Params, clave: string): string | undefined {
  const v = sp instanceof URLSearchParams ? sp.get(clave) : sp[clave];
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || undefined;
}

/**
 * Normaliza lo que venga en la URL: un valor inválido (etapa terminal, fecha
 * mal formada) se descarta en vez de mandarse al API. Solo pone las claves
 * que tienen valor, para que la query key no dependa de `undefined` sueltos.
 */
export function leerFiltros(sp: Params): FiltrosTablero {
  const f: FiltrosTablero = {};
  const etapa = leer(sp, "etapa");
  if (etapa && (ETAPAS_ABIERTAS as readonly string[]).includes(etapa)) f.etapa = etapa as Stage;
  const propiedad = leer(sp, "propiedad");
  if (propiedad) f.propiedad = propiedad;
  const desde = leer(sp, "desde");
  if (desde && DIA.test(desde)) f.desde = desde;
  const hasta = leer(sp, "hasta");
  if (hasta && DIA.test(hasta)) f.hasta = hasta;
  return f;
}

/** Las fechas `YYYY-MM-DD` se comparan bien como texto. */
export function rangoInvalido(f: FiltrosTablero): boolean {
  return Boolean(f.desde && f.hasta && f.desde > f.hasta);
}

export function aFiltrosApi(f: FiltrosTablero): FiltrosLeads {
  return {
    active: true,
    limit: LIMITE_TABLERO,
    stage: f.etapa,
    property_id: f.propiedad,
    created_from: f.desde,
    created_to: f.hasta,
  };
}

/** Prefijo de todas las keys del tablero, sea cual sea la combinación de filtros. */
export const PREFIJO_TABLERO = ["leads", "tablero"] as const;

export function claveLeadsTablero(f: FiltrosTablero) {
  return [...PREFIJO_TABLERO, f] as const;
}

/**
 * Log de etapas e historial de un lead. Hoy los lee el detalle
 * (app/(agente)/leads/[leadId]/page.tsx) en el servidor, sin caché del
 * navegador; mover un lead las invalida igual, para que ninguna vista de
 * cliente que las use se quede atrasada.
 */
export function claveTransiciones(leadId: string) {
  return ["leads", leadId, "transiciones"] as const;
}

export function claveInteracciones(leadId: string) {
  return ["leads", leadId, "interacciones"] as const;
}

export function clavePropiedades() {
  return ["listings", "propiedades"] as const;
}

/** Mismo `limit` en servidor y navegador: es parte de lo que se cachea. */
export const QUERY_PROPIEDADES = { limit: LIMITE_TABLERO } as const;
