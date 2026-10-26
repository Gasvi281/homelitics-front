"use client";

import { useCallback } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/homelitics-navegador";
import { clavePropiedades, QUERY_PROPIEDADES } from "@/features/tablero-leads/claves";
import type { Lead } from "@/lib/schemas";
import { armarReporte, indexarListings } from "./agrupar";
import { claveRiesgo, queryRiesgo, type FiltrosRiesgo } from "./claves";

/**
 * Leads sin respuesta hace más de `horas` (GET /leads/at-risk). Es de TODA
 * la agencia: quien quiera solo los de un agente filtra por `agent_id`.
 * En el tablero llega ya sembrada desde app/(agente)/tablero/page.tsx (misma
 * key). `enabled: false` en la vista de cerrados, donde ningún lead puede
 * estar en riesgo.
 *
 * `refetchInterval` y `refetchOnWindowFocus` los pide el aviso del header
 * (2.16), que está siempre montado: como la key es la misma, sus relecturas
 * refrescan también el resaltado del tablero.
 */
export function useLeadsEnRiesgo(
  horas: number,
  {
    enabled = true,
    refetchInterval,
    refetchOnWindowFocus,
  }: { enabled?: boolean; refetchInterval?: number; refetchOnWindowFocus?: boolean } = {},
) {
  return useQuery({
    queryKey: claveRiesgo(horas),
    queryFn: () => api.leadsEnRiesgo(queryRiesgo(horas)),
    enabled,
    refetchInterval,
    refetchOnWindowFocus,
  });
}

/**
 * La misma query que `useLeadsEnRiesgo` (misma key, sembrada desde
 * app/(agente)/riesgo/page.tsx), filtrada y agrupada por agente (2.17, 2.18).
 * Los filtros van en el `select`, no en la key: el API no los admite y así
 * cambiar de filtro no vuelve a pedir nada. `keepPreviousData` deja la tabla
 * vieja a la vista al cambiar el umbral.
 *
 * Con filtro por propiedad hace falta GET /listings para pasar de
 * `listing_id` a `property_id`; mientras no esté, `listings` lo dice y el
 * reporte espera (filtrar sin él dejaría la tabla vacía).
 */
export function useRiesgoPorAgente(horas: number, filtros: FiltrosRiesgo) {
  const listings = useListingsPorId();
  const { desde, hasta, propiedad } = filtros;
  const porId = listings.data;
  const select = useCallback(
    (leads: Lead[]) => armarReporte(leads, { desde, hasta, propiedad }, porId),
    [desde, hasta, propiedad, porId],
  );
  const q = useQuery({
    queryKey: claveRiesgo(horas),
    queryFn: () => api.leadsEnRiesgo(queryRiesgo(horas)),
    select,
    placeholderData: keepPreviousData,
  });
  return { q, listings, necesitaListings: Boolean(propiedad) };
}

/**
 * GET /listings por `id`, para nombrar la propiedad de un `LeadOut`. Comparte
 * key y petición con `usePropiedades()` del tablero: solo cambia el `select`.
 */
export function useListingsPorId() {
  return useQuery({
    queryKey: clavePropiedades(),
    queryFn: () => api.listings(QUERY_PROPIEDADES),
    select: indexarListings,
  });
}
