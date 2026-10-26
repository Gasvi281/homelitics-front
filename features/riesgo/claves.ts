/**
 * Query keys de los leads en riesgo (HU-10, HU-13). Sin `"use client"` y sin
 * dependencias de runtime: lo importan la página del tablero (Server
 * Component, para sembrar la query) y los hooks del navegador, y los dos
 * TIENEN que armar la misma key y la misma query, como en
 * features/tablero-leads/claves.ts.
 */
import { leerDia, leerParam, type ParamsUrl } from "@/lib/filtros-url";
import type { ParamsLeadsEnRiesgo } from "@/lib/homelitics-nucleo";

/**
 * Máximo de `limit` en GET /leads/at-risk. Siempre se pide el tope: el
 * tablero, el aviso del header y el reporte cuentan sobre la misma lista
 * (bloqueo 10 de docs/SPRINT_E3_LINEA2.md).
 */
export const LIMITE_RIESGO = 500;

/**
 * Prefijo de todas las keys de riesgo, sea cual sea el umbral. Lo invalidan
 * las mutaciones que pueden sacar o meter un lead en riesgo: mover la etapa,
 * marcarlo como perdido, reasignarlo y registrar una interacción.
 *
 * No choca con `prefijoLead(id)` (`["leads", id]`): un id es un uuid.
 */
export const PREFIJO_RIESGO = ["leads", "riesgo"] as const;

export function claveRiesgo(horas: number) {
  return [...PREFIJO_RIESGO, horas] as const;
}

/** `hours` va siempre: sin él el API usa 72 y HU-10 pide el umbral elegido. */
export function queryRiesgo(horas: number): ParamsLeadsEnRiesgo {
  return { hours: horas, limit: LIMITE_RIESGO };
}

/**
 * Filtros del reporte de riesgo (2.18 — HU-13 AC2): `?desde=&hasta=&propiedad=`.
 * GET /leads/at-risk no filtra (bloqueo 10), así que NO van en la key ni en
 * la query: se aplican en el `select`, sobre la misma lista en caché.
 */
export type FiltrosRiesgo = {
  /** Día `YYYY-MM-DD`, inclusivo, de `created_at` en hora de Bogotá. */
  desde?: string;
  /** Día `YYYY-MM-DD`, inclusivo, de `created_at` en hora de Bogotá. */
  hasta?: string;
  /** `property_id`: el inmueble, con venta y arriendo. */
  propiedad?: string;
};

/** Como `leerFiltrosEmbudo`: lo inválido se descarta y solo quedan las claves con valor. */
export function leerFiltrosRiesgo(sp: ParamsUrl): FiltrosRiesgo {
  const f: FiltrosRiesgo = {};
  const desde = leerDia(sp, "desde");
  if (desde) f.desde = desde;
  const hasta = leerDia(sp, "hasta");
  if (hasta) f.hasta = hasta;
  const propiedad = leerParam(sp, "propiedad");
  if (propiedad) f.propiedad = propiedad;
  return f;
}

/**
 * Nombre del archivo exportado, con el umbral y los filtros:
 * `riesgo_24h_2026-09-01_2026-09-30.csv`, `riesgo_48h_desde_2026-09-01_propiedad-1a2b3c4d.pdf`
 * o `riesgo_24h_todo.csv`. De la propiedad va el inicio del id: el nombre
 * de la dirección puede traer caracteres que un sistema de archivos no admite.
 */
export function nombreArchivoRiesgo(horas: number, f: FiltrosRiesgo, extension: "csv" | "pdf"): string {
  const rango =
    f.desde && f.hasta ? `${f.desde}_${f.hasta}`
    : f.desde ? `desde_${f.desde}`
    : f.hasta ? `hasta_${f.hasta}`
    : "todo";
  const propiedad = f.propiedad ? `_propiedad-${f.propiedad.slice(0, 8)}` : "";
  return `riesgo_${horas}h_${rango}${propiedad}.${extension}`;
}
