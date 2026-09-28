"use client";

import {
  keepPreviousData, useMutation, useMutationState, useQuery, useQueryClient,
  type Query,
} from "@tanstack/react-query";
import { api, HomeliticsError } from "@/lib/homelitics-navegador";
import { esTerminal } from "@/lib/etapas";
import type { LeadCard, Listing, LostReason, Stage } from "@/lib/schemas";
import {
  aFiltrosApi, claveCitasLead, claveInteracciones, claveLead, claveLeadsTablero,
  clavePropiedades, claveTareasLead, claveTransiciones, prefijoLead,
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

/*
 * Detalle de un lead (app/(agente)/leads/[leadId]/page.tsx). Llegan ya
 * sembradas por el servidor (mismas keys); viven en el caché del navegador
 * para que mover el lead (`useMoverLead`) las pueda invalidar y releer.
 */

export function useLead(leadId: string) {
  return useQuery({ queryKey: claveLead(leadId), queryFn: () => api.lead(leadId) });
}

export function useTransiciones(leadId: string) {
  return useQuery({ queryKey: claveTransiciones(leadId), queryFn: () => api.transiciones(leadId) });
}

export function useInteracciones(leadId: string) {
  return useQuery({ queryKey: claveInteracciones(leadId), queryFn: () => api.interacciones(leadId) });
}

export function useCitasLead(leadId: string) {
  return useQuery({ queryKey: claveCitasLead(leadId), queryFn: () => api.citasDelLead(leadId) });
}

export function useTareasLead(leadId: string) {
  return useQuery({ queryKey: claveTareasLead(leadId), queryFn: () => api.tareas(leadId) });
}

/**
 * `lead` pide solo lo que usa el movimiento: lo cumplen tanto la tarjeta del
 * tablero (`LeadCard`) como el lead del detalle (`Lead`). `lost_reason` y
 * `note` solo viajan con `hacia: "LOST"`: con otra etapa, un `lost_reason`
 * no nulo da 422 (docs/API_CONTRACT.md).
 */
export type MoverLead = {
  lead: Pick<LeadCard, "id" | "current_stage">;
  hacia: Stage;
  lost_reason?: LostReason;
  note?: string | null;
};

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
 * - onSettled: relee el tablero y todo lo del lead bajo `prefijoLead()`
 *   (una transición con nota, o cualquier LOST, escribe una STATUS_CHANGE).
 *
 * Sirve también para LOST (2.11 — HU-09 AC1), desde el tablero y desde el
 * detalle del lead: `lost_reason` y `note` van en las variables.
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
    mutationFn: ({ lead, hacia, lost_reason, note }: MoverLead) =>
      api.moverLead(
        lead.id,
        hacia === "LOST" ? { to_stage: hacia, lost_reason, note: note || null } : { to_stage: hacia },
      ),

    onMutate: async ({ lead, hacia }) => {
      await qc.cancelQueries({ queryKey: PREFIJO_TABLERO });
      const foto = qc.getQueriesData<LeadCard[]>({ queryKey: PREFIJO_TABLERO });

      // Una key filtrada por otra etapa, o cualquier key sin filtro de etapa si
      // el destino es terminal (el tablero activo pide `active=true`), ya no
      // debe tener la tarjeta. La vista de cerrados de esa misma etapa la
      // conserva; si no la tenía, la trae la relectura de onSettled.
      const laConserva = (q: Query) => {
        const filtros = q.queryKey[2] as FiltrosTablero | undefined;
        if (filtros?.etapa) return filtros.etapa === hacia;
        return !esTerminal(hacia);
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
      // Etapa, log, historial (LOST siempre escribe una STATUS_CHANGE), citas
      // (cerrar cancela las abiertas) y tareas del lead.
      void qc.invalidateQueries({ queryKey: prefijoLead(lead.id) });
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
      return "Ese cambio de etapa no está permitido. Puede que alguien más o el calendario ya hayan movido el lead; volvimos a cargar sus datos.";
    case "red":
      return "No pudimos conectarnos con el servicio y el lead no cambió de etapa. Puede estar despertando (tarda hasta un minuto).";
    case "invalido":
      return `El servicio rechazó el cambio de etapa: ${e.detail}`;
    case "no_encontrado":
      return "Ese lead ya no existe o dejó de estar a tu cargo.";
    default:
      return e.detail;
  }
}
