/**
 * Agrupación del reporte de riesgo por agente (2.17 — HU-13 AC1). Funciones
 * puras, sin `"use client"` ni dependencias de runtime, para usarlas como
 * `select` de `useQuery` y probarlas aparte.
 *
 * PROVISIONAL hasta `GET /analytics/at-risk-by-agent` (2.27): mientras no
 * exista, se agrupa en el cliente la lista de `GET /leads/at-risk`, que tiene
 * tope de 500 (bloqueo 10 de docs/SPRINT_E3_LINEA2.md).
 */
import { diaLocal } from "@/lib/format";
import type { Lead, Listing } from "@/lib/schemas";
import { LIMITE_RIESGO, type FiltrosRiesgo } from "./claves";

export type GrupoRiesgo = {
  agentId: string;
  /** Del más antiguo al más nuevo por `created_at`. Nunca vacío. */
  leads: Lead[];
  /** `leads[0]`, aparte para no indexar en la pantalla. */
  masAntiguo: Lead;
};

const instante = (l: Lead) => Date.parse(l.created_at);

/**
 * Los leads en riesgo agrupados por `agent_id`. Primero el agente con más
 * leads; en un empate, el que tiene el lead más antiguo, y si también
 * empatan, por id, para que el orden no cambie entre relecturas.
 */
export function agruparPorAgente(leads: readonly Lead[]): GrupoRiesgo[] {
  const grupos = new Map<string, Lead[]>();
  for (const l of leads) {
    (grupos.get(l.agent_id) ?? grupos.set(l.agent_id, []).get(l.agent_id)!).push(l);
  }
  return [...grupos.entries()]
    .map(([agentId, ls]) => {
      const ordenados = [...ls].sort((a, b) => instante(a) - instante(b) || a.id.localeCompare(b.id));
      return { agentId, leads: ordenados, masAntiguo: ordenados[0] };
    })
    .sort(
      (a, b) =>
        b.leads.length - a.leads.length ||
        instante(a.masAntiguo) - instante(b.masAntiguo) ||
        a.agentId.localeCompare(b.agentId),
    );
}

/**
 * GET /listings indexado por `id`, para cruzar el `listing_id` de un
 * `LeadOut`. No agrupa por `property_id` como el selector del tablero:
 * aquí hace falta la publicación exacta del lead.
 */
export function indexarListings(listings: readonly Listing[]): ReadonlyMap<string, Listing> {
  return new Map(listings.map(l => [l.id, l]));
}

/** Cómo se nombra la propiedad de una publicación, sin inventar dirección. */
export function etiquetaListing(l: Listing): string {
  const lugar = l.address ?? ([l.neighborhood, l.city].filter(Boolean).join(", ") || "Propiedad sin dirección");
  return `${lugar} · ${l.operation_type === "SALE" ? "venta" : "arriendo"}`;
}

/** Lo que pinta el reporte (y exportan los archivos) después de filtrar y agrupar. */
export type DatosRiesgo = {
  grupos: GrupoRiesgo[];
  /** Leads que quedan después de los filtros. */
  total: number;
  /**
   * GET /leads/at-risk llegó al tope (`limit` = 500): puede faltar algo, y un
   * filtro no lo recupera porque se aplica después (bloqueo 10).
   */
  incompleto: boolean;
  /**
   * Con filtro por propiedad: leads cuya publicación no está en GET /listings
   * (pide 200), así que no se sabe de qué inmueble son y quedan fuera.
   */
  sinUbicar: number;
};

/**
 * Filtra por día de creación (Bogotá) y por `property_id` y luego agrupa
 * (2.18 — HU-13 AC2). `listings` solo hace falta con filtro por propiedad:
 * `LeadOut` trae `listing_id`, y el `property_id` sale de la publicación.
 * Un rango al revés no llega aquí: la pantalla avisa y pasa `{}`.
 */
export function armarReporte(
  leads: readonly Lead[],
  f: FiltrosRiesgo,
  listings?: ReadonlyMap<string, Listing>,
): DatosRiesgo {
  let sinUbicar = 0;
  const filtrados = leads.filter(l => {
    if (f.desde || f.hasta) {
      const dia = diaLocal(l.created_at);
      if (f.desde && dia < f.desde) return false;
      if (f.hasta && dia > f.hasta) return false;
    }
    if (f.propiedad) {
      const listing = listings?.get(l.listing_id);
      if (!listing) {
        sinUbicar++;
        return false;
      }
      if (listing.property_id !== f.propiedad) return false;
    }
    return true;
  });
  return {
    grupos: agruparPorAgente(filtrados),
    total: filtrados.length,
    incompleto: leads.length >= LIMITE_RIESGO,
    sinUbicar,
  };
}

const DIA_MS = 86_400_000;

/**
 * Días completos desde que se creó el lead. GET /leads/at-risk no da la
 * fecha de la última respuesta (bloqueo 15), así que es el MÁXIMO que puede
 * llevar sin respuesta: si alguien le contestó antes del corte, lleva menos
 * (pero nunca menos que el umbral).
 */
export function diasMaximosSinRespuesta(l: Lead, ahora: Date = new Date()): number {
  return Math.max(0, Math.floor((ahora.getTime() - Date.parse(l.created_at)) / DIA_MS));
}
