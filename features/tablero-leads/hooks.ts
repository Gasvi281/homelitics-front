"use client";

import {
  keepPreviousData, useMutation, useMutationState, useQuery, useQueryClient,
  type Query,
} from "@tanstack/react-query";
import { api, HomeliticsError } from "@/lib/homelitics-navegador";
import { esTerminal } from "@/lib/etapas";
import type { LeadCard, Listing, Stage } from "@/lib/schemas";
import {
  aFiltrosApi, claveInteracciones, claveLeadsTablero, clavePropiedades, claveTransiciones,
  PREFIJO_TABLERO, QUERY_PROPIEDADES,
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

export type MoverLead = { lead: LeadCard; hacia: Stage };

const CLAVE_MOVER = ["leads", "mover"] as const;

/**
 * Mover un lead de etapa (tarea 2.10 — HU-06 AC2) con actualización
 * optimista: la tarjeta cambia de columna antes de que responda el API.
 *
 * - onMutate: cancela las lecturas del tablero en vuelo (una respuesta vieja
 *   pisaría el cambio), guarda la foto de TODAS las keys del tablero —hay
 *   una por combinación de filtros— y mueve la tarjeta en cada una.
 * - onError: devuelve la tarjeta a como estaba en la foto y avisa con
 *   `alFallar` (va aquí y no en las opciones de `mutate()`, que solo corren
 *   para la última llamada: con dos tarjetas en vuelo, se perdería el error
 *   de la primera).
 * - onSettled: relee el tablero, el log de transiciones y las interacciones
 *   del lead (una transición con nota escribe una STATUS_CHANGE).
 *
 * `puedeMover()` se revisa antes de llamar a esto; el 409 sigue siendo
 * posible porque el calendario u otra persona pudieron mover el lead.
 */
export function useMoverLead({
  alFallar,
}: { alFallar?: (error: unknown, vars: MoverLead) => void } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: CLAVE_MOVER,
    mutationFn: ({ lead, hacia }: MoverLead) => api.moverLead(lead.id, { to_stage: hacia }),

    onMutate: async ({ lead, hacia }) => {
      await qc.cancelQueries({ queryKey: PREFIJO_TABLERO });
      const foto = qc.getQueriesData<LeadCard[]>({ queryKey: PREFIJO_TABLERO });

      // Una key filtrada por otra etapa, o cualquier key si el destino es
      // terminal (el tablero pide `active=true`), ya no debe tener la tarjeta.
      const laConserva = (q: Query) => {
        const filtros = q.queryKey[2] as FiltrosTablero | undefined;
        return !esTerminal(hacia) && (!filtros?.etapa || filtros.etapa === hacia);
      };
      qc.setQueriesData<LeadCard[]>(
        { queryKey: PREFIJO_TABLERO, predicate: laConserva },
        viejos => viejos?.map(l => (l.id === lead.id ? { ...l, current_stage: hacia } : l)),
      );
      qc.setQueriesData<LeadCard[]>(
        { queryKey: PREFIJO_TABLERO, predicate: q => !laConserva(q) },
        viejos => viejos?.filter(l => l.id !== lead.id),
      );
      return { foto };
    },

    onError: (error, vars, contexto) => {
      for (const [key, antes] of contexto?.foto ?? []) {
        qc.setQueryData<LeadCard[]>(key, ahora => devolverTarjeta(ahora, antes, vars.lead.id));
      }
      alFallar?.(error, vars);
    },

    // Sin `return` de las relecturas a propósito: la tarjeta queda "pendiente"
    // solo mientras el POST está en vuelo, no también mientras se relee.
    onSettled: (_datos, _error, { lead }) => {
      void qc.invalidateQueries({ queryKey: claveTransiciones(lead.id) });
      void qc.invalidateQueries({ queryKey: claveInteracciones(lead.id) });
      // Con otro movimiento todavía en vuelo, releer ahora traería el tablero
      // sin ese cambio y la otra tarjeta saltaría atrás un momento: relee el
      // último que termine (este todavía cuenta como en vuelo aquí).
      if (qc.isMutating({ mutationKey: CLAVE_MOVER }) === 1) {
        void qc.invalidateQueries({ queryKey: PREFIJO_TABLERO });
      }
    },
  });
}

/**
 * Deshace el movimiento de UNA tarjeta con la foto de onMutate: la vuelve a
 * poner como estaba y en su posición. No se reemplaza la lista entera por la
 * foto porque, con dos movimientos en vuelo, la foto del segundo ya trae el
 * primero movido, y restaurarla lo re-aplicaría después de haberlo deshecho.
 */
function devolverTarjeta(
  ahora: LeadCard[] | undefined,
  antes: LeadCard[] | undefined,
  leadId: string,
): LeadCard[] | undefined {
  if (!ahora || !antes) return antes;
  const sinElla = ahora.filter(l => l.id !== leadId);
  const indice = antes.findIndex(l => l.id === leadId);
  if (indice === -1) return sinElla;
  return [...sinElla.slice(0, indice), antes[indice], ...sinElla.slice(indice)];
}

/** Ids de los leads con un movimiento en vuelo: su tarjeta no se puede volver a arrastrar. */
export function useLeadsMoviendose(): Set<string> {
  const ids = useMutationState({
    filters: { mutationKey: CLAVE_MOVER, status: "pending" },
    select: m => (m.state.variables as MoverLead | undefined)?.lead.id,
  });
  return new Set(ids.filter((id): id is string => Boolean(id)));
}

export function mensajeErrorMover(e: unknown): string {
  if (!(e instanceof HomeliticsError)) return "No se pudo mover el lead. Intenta de nuevo.";
  switch (e.kind) {
    case "conflicto":
      return "Ese cambio de etapa no está permitido. Puede que alguien más o el calendario ya hayan movido el lead; volvimos a cargar el tablero.";
    case "red":
      return "No pudimos conectarnos con el servicio y la tarjeta volvió a su columna. Puede estar despertando (tarda hasta un minuto).";
    case "no_encontrado":
      return "Ese lead ya no existe o dejó de estar a tu cargo.";
    default:
      return e.detail;
  }
}
