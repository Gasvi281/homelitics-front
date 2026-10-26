/**
 * Lo que comparten el CSV y el PDF del reporte de riesgo (2.18 — HU-13 AC3).
 * Funciones puras, sin `"use client"`: los dos archivos salen de los MISMOS
 * `DatosRiesgo` que pinta la pantalla, así no pueden decir otra cosa.
 */
import { ETIQUETA_ETAPA } from "@/lib/etapas";
import { diaLargo, fechaHoraConAnio } from "@/lib/format";
import type { Listing } from "@/lib/schemas";
import { diasMaximosSinRespuesta, etiquetaListing, type DatosRiesgo } from "./agrupar";
import { LIMITE_RIESGO, type FiltrosRiesgo } from "./claves";

/** Cómo nombrar agentes y propiedades. Lo que no esté se escribe como falta. */
export type NombresRiesgo = {
  /** `agent_id` → nombre (GET /agents). */
  agentes: ReadonlyMap<string, string>;
  /** `listing_id` → publicación (GET /listings). */
  listings: ReadonlyMap<string, Listing>;
  /** `property_id` → etiqueta del selector, para describir el filtro. */
  propiedades: ReadonlyMap<string, string>;
};

export const COLUMNAS_DETALLE = [
  "Agente", "Propiedad", "Etapa", "Creado", "Días sin respuesta (máximo)",
] as const;

export function nombreAgenteO(nombres: NombresRiesgo, agentId: string): string {
  return nombres.agentes.get(agentId) ?? `Agente fuera de la lista (id terminado en ${agentId.slice(-8)})`;
}

function propiedadDe(nombres: NombresRiesgo, listingId: string): string {
  const l = nombres.listings.get(listingId);
  return l ? etiquetaListing(l) : `Publicación fuera del listado (id terminado en ${listingId.slice(-8)})`;
}

/** Una fila por lead, en el orden de la pantalla: por agente y, dentro, del más antiguo al más nuevo. */
export function filasDetalle(datos: DatosRiesgo, nombres: NombresRiesgo, ahora: Date): string[][] {
  return datos.grupos.flatMap(g =>
    g.leads.map(l => [
      nombreAgenteO(nombres, g.agentId),
      propiedadDe(nombres, l.listing_id),
      ETIQUETA_ETAPA[l.current_stage],
      fechaHoraConAnio(l.created_at),
      String(diasMaximosSinRespuesta(l, ahora)),
    ]),
  );
}

/** Los filtros en español, para el encabezado de los archivos. */
export function filtrosEnEspanol(f: FiltrosRiesgo, horas: number, nombres: NombresRiesgo): string[] {
  const lineas = [`Sin respuesta hace más de ${horas} h`];
  if (f.desde) lineas.push(`Creados desde: ${diaLargo(f.desde)}`);
  if (f.hasta) lineas.push(`Creados hasta: ${diaLargo(f.hasta)}`);
  if (f.propiedad) lineas.push(`Propiedad: ${nombres.propiedades.get(f.propiedad) ?? f.propiedad}`);
  return lineas;
}

/** Los avisos que tienen que ir en los dos archivos, igual que en la pantalla. */
export function avisosRiesgo(datos: DatosRiesgo, horas: number): string[] {
  const avisos: string[] = [];
  if (datos.incompleto) {
    avisos.push(
      `Puede estar incompleto: el servicio devolvió el máximo de ${LIMITE_RIESGO} leads en riesgo y no dice si hay más.`,
    );
  }
  if (datos.sinUbicar > 0) {
    avisos.push(
      `${datos.sinUbicar === 1 ? "1 lead quedó" : `${datos.sinUbicar} leads quedaron`} fuera del filtro ` +
        "por propiedad: su publicación no está en el listado.",
    );
  }
  avisos.push(
    "Los días sin respuesta se cuentan desde que se creó el lead: el servicio no da la fecha de la última " +
      `respuesta, así que es el máximo posible. Todos llevan al menos ${horas} h sin respuesta.`,
  );
  return avisos;
}

/** Un campo de CSV: entre comillas si trae separador, comillas o saltos de línea. */
function campo(valor: string): string {
  return /[";\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

/**
 * El CSV del reporte. Separador `;`: es el de Excel con la configuración
 * regional de Colombia (la coma es el separador decimal), y con `,` abriría
 * todo en una sola columna. Lleva BOM UTF-8 para que Excel lea las tildes, y
 * los avisos arriba, antes de la cabecera, para que no pasen desapercibidos.
 */
export function csvRiesgo({
  datos, horas, filtros, nombres, ahora = new Date(),
}: {
  datos: DatosRiesgo;
  horas: number;
  filtros: FiltrosRiesgo;
  nombres: NombresRiesgo;
  ahora?: Date;
}): string {
  // El encabezado va en la primera columna, una línea por dato.
  const encabezado = [
    `Leads en riesgo, generado el ${fechaHoraConAnio(ahora.toISOString())} (hora de Bogotá)`,
    ...filtrosEnEspanol(filtros, horas, nombres),
    ...avisosRiesgo(datos, horas).map(a => `Aviso: ${a}`),
  ].map(campo);
  const lineas = [
    ...encabezado,
    "",
    COLUMNAS_DETALLE.join(";"),
    ...filasDetalle(datos, nombres, ahora).map(fila => fila.map(campo).join(";")),
  ];
  return "﻿" + lineas.join("\r\n") + "\r\n";
}
