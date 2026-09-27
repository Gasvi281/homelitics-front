"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/homelitics-navegador";
import type { Listing } from "@/lib/schemas";
import {
  aFiltrosApi, claveLeadsTablero, clavePropiedades, QUERY_PROPIEDADES,
  type FiltrosTablero,
} from "./claves";

/**
 * Las tarjetas del tablero. La primera vez llegan ya hidratadas desde
 * app/(agente)/tablero/page.tsx (misma key); `keepPreviousData` deja las
 * columnas viejas a la vista mientras llegan las de un filtro nuevo.
 */
export function useLeadsTablero(filtros: FiltrosTablero) {
  return useQuery({
    queryKey: claveLeadsTablero(filtros),
    queryFn: () => api.leads(aFiltrosApi(filtros)),
    placeholderData: keepPreviousData,
  });
}

export type OpcionPropiedad = { propertyId: string; etiqueta: string };

/**
 * No hay GET /properties: el selector se arma con GET /listings agrupando
 * por `property_id` (docs/SPRINT_LINEA2.md, "Filtro por propiedad"). Un
 * inmueble con venta y arriendo sale una sola vez.
 */
export function usePropiedades() {
  return useQuery({
    queryKey: clavePropiedades(),
    queryFn: () => api.listings(QUERY_PROPIEDADES),
    select: agruparPorPropiedad,
  });
}

function agruparPorPropiedad(listings: Listing[]): OpcionPropiedad[] {
  const grupos = new Map<string, Listing[]>();
  for (const l of listings) {
    (grupos.get(l.property_id) ?? grupos.set(l.property_id, []).get(l.property_id)!).push(l);
  }
  return [...grupos.entries()]
    .map(([propertyId, ls]) => {
      const l = ls[0];
      const lugar =
        l.address ?? ([l.neighborhood, l.city].filter(Boolean).join(", ") || "Propiedad sin dirección");
      const operaciones = new Set(ls.map(x => x.operation_type));
      const sufijo = operaciones.size > 1 ? " · venta y arriendo" : "";
      return { propertyId, etiqueta: `${lugar}${sufijo}` };
    })
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));
}
