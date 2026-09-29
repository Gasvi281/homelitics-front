/**
 * Filtros y query keys del tablero de leads (HU-06). Sin `"use client"` y sin
 * dependencias de runtime fuera de lib/etapas.ts: lo importan la página
 * (Server Component, para el `prefetchQuery`) y los hooks del navegador, y
 * los dos TIENEN que armar la misma key — si difieren, la hidratación no
 * encuentra el caché y el navegador vuelve a pedir todo.
 */
import { EMBUDO, ETAPAS, esTerminal } from "@/lib/etapas";
import { leerDia, leerParam, rangoAlReves, type ParamsUrl } from "@/lib/filtros-url";
import type { FiltrosLeads } from "@/lib/homelitics-nucleo";
import type { Stage } from "@/lib/schemas";

/** Lo que vive en la URL del tablero: `?etapa=&propiedad=&agente=&desde=&hasta=`. */
export type FiltrosTablero = {
  etapa?: Stage;
  /** `property_id`: el inmueble, con todas sus publicaciones (SALE y RENT). */
  propiedad?: string;
  /** `agent_id`: el dueño del lead (HU-08). El filtro solo se le ofrece al admin. */
  agente?: string;
  /** Día `YYYY-MM-DD`, inclusivo, de creación del lead. */
  desde?: string;
  /** Día `YYYY-MM-DD`, inclusivo, de creación del lead. */
  hasta?: string;
};

/**
 * Las columnas del tablero activo. `WON` y `LOST` nunca traen tarjetas con
 * `active=true`, y combinar `active=true` con `stage=WON|LOST` no está
 * documentado (docs/API_CONTRACT.md): en el tablero activo el filtro de etapa
 * solo ofrece estas.
 */
export const ETAPAS_ABIERTAS: readonly Stage[] = EMBUDO.filter(e => e !== "WON");

/**
 * La vista de cerrados (2.12 — HU-09 AC2): `?etapa=WON` o `?etapa=LOST`.
 * Pide `stage` SIN `active`, que es como el API deja consultar los cerrados.
 */
export const ETAPAS_CERRADAS: readonly Stage[] = ["WON", "LOST"];

export function esVistaCerrados(f: FiltrosTablero): boolean {
  return Boolean(f.etapa && esTerminal(f.etapa));
}

/** Máximo de `limit` en GET /leads. El tablero pide todo lo que puede de una vez. */
export const LIMITE_TABLERO = 200;

/**
 * Normaliza lo que venga en la URL: un valor inválido (etapa desconocida,
 * fecha mal formada) se descarta en vez de mandarse al API. Solo pone las claves
 * que tienen valor, para que la query key no dependa de `undefined` sueltos.
 */
export function leerFiltros(sp: ParamsUrl): FiltrosTablero {
  const f: FiltrosTablero = {};
  const etapa = leerParam(sp, "etapa");
  if (etapa && (ETAPAS as readonly string[]).includes(etapa)) f.etapa = etapa as Stage;
  const propiedad = leerParam(sp, "propiedad");
  if (propiedad) f.propiedad = propiedad;
  const agente = leerParam(sp, "agente");
  if (agente) f.agente = agente;
  const desde = leerDia(sp, "desde");
  if (desde) f.desde = desde;
  const hasta = leerDia(sp, "hasta");
  if (hasta) f.hasta = hasta;
  return f;
}

export function rangoInvalido(f: FiltrosTablero): boolean {
  return rangoAlReves(f);
}

export function aFiltrosApi(f: FiltrosTablero): FiltrosLeads {
  return {
    // Nunca `active` junto con `stage=WON|LOST`: no está documentado.
    active: esVistaCerrados(f) ? undefined : true,
    limit: LIMITE_TABLERO,
    stage: f.etapa,
    property_id: f.propiedad,
    agent_id: f.agente,
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
 * Todo lo de un lead cuelga de `["leads", id]`: mover el lead invalida ese
 * prefijo entero (etapa, log, historial, citas —cerrarlo cancela sus
 * visitas— y tareas). El detalle (app/(agente)/leads/[leadId]/page.tsx) las
 * siembra en el servidor y las lee con los hooks del navegador.
 */
export function prefijoLead(leadId: string) {
  return ["leads", leadId] as const;
}

export function claveLead(leadId: string) {
  return ["leads", leadId, "detalle"] as const;
}

export function claveCitasLead(leadId: string) {
  return ["leads", leadId, "citas"] as const;
}

export function claveTareasLead(leadId: string) {
  return ["leads", leadId, "tareas"] as const;
}

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
