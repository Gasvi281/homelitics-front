/**
 * Filtros del monitor de avisos del admin (2.35). Sin `"use client"`: lo
 * importan la página (Server Component, para el `prefetchInfiniteQuery`) y
 * el navegador, y los dos TIENEN que armar la misma key con
 * `aFiltrosApiMonitor` — si difieren, la hidratación no encuentra el caché.
 * Mismo esquema que features/embudo/claves.ts.
 */
import { leerDia, leerParam, rangoAlReves, type ParamsUrl } from "@/lib/filtros-url";
import type { FiltrosAvisosAgencia } from "@/lib/homelitics-nucleo";
import type { NotificationType } from "@/lib/schemas";
import { LIMITE_AVISOS } from "./claves";

/** Lo que vive en la URL: `?agente=&tipo=&por=&estado=&desde=&hasta=`. */
export type FiltrosMonitor = {
  /** `recipient_agent_id`: a quién le llegó el aviso. */
  agente?: string;
  tipo?: NotificationType;
  /** Quién lo causó: el bot o un administrador (`by_bot`). */
  por?: "asistente" | "administrador";
  estado?: "sin-leer" | "leidos";
  /** Día `YYYY-MM-DD`, inclusivo, de creación del aviso. */
  desde?: string;
  /** Día `YYYY-MM-DD`, inclusivo, de creación del aviso. */
  hasta?: string;
};

const TIPOS: readonly string[] = ["LEAD_ASSIGNED", "VISIT_SCHEDULED"];
const POR: readonly string[] = ["asistente", "administrador"];
const ESTADOS: readonly string[] = ["sin-leer", "leidos"];

/** Lo inválido se descarta, y solo se ponen las claves con valor (la key no depende de `undefined`). */
export function leerFiltrosMonitor(sp: ParamsUrl): FiltrosMonitor {
  const f: FiltrosMonitor = {};
  const agente = leerParam(sp, "agente");
  if (agente) f.agente = agente;
  const tipo = leerParam(sp, "tipo");
  if (tipo && TIPOS.includes(tipo)) f.tipo = tipo as NotificationType;
  const por = leerParam(sp, "por");
  if (por && POR.includes(por)) f.por = por as FiltrosMonitor["por"];
  const estado = leerParam(sp, "estado");
  if (estado && ESTADOS.includes(estado)) f.estado = estado as FiltrosMonitor["estado"];
  const desde = leerDia(sp, "desde");
  if (desde) f.desde = desde;
  const hasta = leerDia(sp, "hasta");
  if (hasta) f.hasta = hasta;
  return f;
}

export function rangoInvalidoMonitor(f: FiltrosMonitor): boolean {
  return rangoAlReves(f);
}

/**
 * La query de GET /notifications, sin `before` (lo pone cada página de "Ver
 * más"). Solo con las claves que tienen valor, porque es también la key.
 */
export function aFiltrosApiMonitor(f: FiltrosMonitor): FiltrosAvisosAgencia {
  const q: FiltrosAvisosAgencia = { limit: LIMITE_AVISOS };
  if (f.agente) q.recipient_agent_id = f.agente;
  if (f.tipo) q.type = f.tipo;
  if (f.por) q.by_bot = f.por === "asistente";
  if (f.estado) q.read = f.estado === "leidos";
  if (f.desde) q.created_from = f.desde;
  if (f.hasta) q.created_to = f.hasta;
  return q;
}
