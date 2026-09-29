/**
 * Filtros y query keys del embudo (HU-17). Sin `"use client"`: lo importan la
 * página (Server Component, para el `prefetchQuery`) y los hooks del
 * navegador, y los dos TIENEN que armar la misma key — si difieren, la
 * hidratación no encuentra el caché y el navegador vuelve a pedir todo.
 */
import { leerDia, leerParam, rangoAlReves, type ParamsUrl } from "@/lib/filtros-url";
import type { FiltrosEmbudoApi } from "@/lib/homelitics-nucleo";
import type { FunnelStage, OperationType } from "@/lib/schemas";

/** Lo que vive en la URL: `?desde=&hasta=&propiedad=&operacion=&agente=`. */
export type FiltrosEmbudo = {
  /** Día `YYYY-MM-DD`, inclusivo, de creación del lead. */
  desde?: string;
  /** Día `YYYY-MM-DD`, inclusivo, de creación del lead. */
  hasta?: string;
  /** `property_id`: el inmueble, con venta y arriendo. */
  propiedad?: string;
  operacion?: OperationType;
  /** `agent_id`: el dueño del lead. */
  agente?: string;
};

const OPERACIONES: readonly string[] = ["SALE", "RENT"];

/**
 * Normaliza la URL igual que el tablero: lo inválido se descarta, y solo se
 * ponen las claves con valor para que la query key no dependa de `undefined`.
 */
export function leerFiltrosEmbudo(sp: ParamsUrl): FiltrosEmbudo {
  const f: FiltrosEmbudo = {};
  const desde = leerDia(sp, "desde");
  if (desde) f.desde = desde;
  const hasta = leerDia(sp, "hasta");
  if (hasta) f.hasta = hasta;
  const propiedad = leerParam(sp, "propiedad");
  if (propiedad) f.propiedad = propiedad;
  const operacion = leerParam(sp, "operacion");
  if (operacion && OPERACIONES.includes(operacion)) f.operacion = operacion as OperationType;
  const agente = leerParam(sp, "agente");
  if (agente) f.agente = agente;
  return f;
}

export function rangoInvalido(f: FiltrosEmbudo): boolean {
  return rangoAlReves(f);
}

export function aFiltrosApiEmbudo(f: FiltrosEmbudo): FiltrosEmbudoApi {
  return {
    created_from: f.desde,
    created_to: f.hasta,
    property_id: f.propiedad,
    operation_type: f.operacion,
    agent_id: f.agente,
  };
}

export function claveEmbudo(f: FiltrosEmbudo) {
  return ["analytics", "embudo", f] as const;
}

export function claveMotivos(dias: number) {
  return ["analytics", "motivos", dias] as const;
}

/** Ventanas que ofrece el bloque de motivos de pérdida (`?days=` del API). */
export const DIAS_MOTIVOS = [30, 90, 180] as const;
export const DIAS_MOTIVOS_DEFECTO = 90;

/**
 * La etapa con la peor conversión desde la anterior: "Aquí se pierden más
 * clientes" (HU-17 AC1). Ignora los `null` (primera etapa, o sin leads en la
 * anterior); en un empate gana la más temprana. `undefined` si no hay con qué
 * comparar.
 */
export function etapaConMayorCaida(stages: readonly FunnelStage[]): FunnelStage | undefined {
  let peor: FunnelStage | undefined;
  for (const s of stages) {
    if (s.pct_from_prev === null) continue;
    if (!peor || s.pct_from_prev < peor.pct_from_prev!) peor = s;
  }
  return peor;
}

/**
 * Nombre del archivo exportado, con el rango de creación:
 * `embudo_2026-09-01_2026-09-30.csv`, `embudo_desde_2026-09-01.pdf`,
 * `embudo_hasta_2026-09-30.csv` o `embudo_todo.csv` sin fechas.
 */
export function nombreArchivoEmbudo(f: FiltrosEmbudo, extension: "csv" | "pdf"): string {
  const rango =
    f.desde && f.hasta ? `${f.desde}_${f.hasta}`
    : f.desde ? `desde_${f.desde}`
    : f.hasta ? `hasta_${f.hasta}`
    : "todo";
  return `embudo_${rango}.${extension}`;
}
