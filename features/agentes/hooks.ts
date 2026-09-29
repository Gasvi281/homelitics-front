"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/homelitics-navegador";
import type { AgentListItem } from "@/lib/schemas";

/**
 * Lo que puede pasar con la lista de agentes de la agencia (HU-08, HU-17).
 * `"cargando"` es la primera carga (o el API despertando, hasta un minuto).
 */
export type EstadoAgentes =
  | { estado: "disponible"; agentes: AgentListItem[]; porId: ReadonlyMap<string, AgentListItem> }
  | { estado: "cargando" }
  | { estado: "error"; error: Error };

export const CLAVE_AGENTES = ["agentes"] as const;

/**
 * Todos los agentes de la agencia, activos e inactivos, en una sola petición:
 * el selector filtra los activos del caché y `NombreAgente` necesita también
 * el nombre de los inactivos (dueños viejos de un lead). Se piden 200, el
 * máximo del API (su default es 100), para no perder dueños en una agencia
 * grande. Sin bots: nunca son dueños de un lead ni destino de reasignación.
 */
export function useAgentes(): EstadoAgentes {
  const q = useQuery({
    queryKey: CLAVE_AGENTES,
    queryFn: () => api.agentes({ limit: 200 }),
    // La lista de agentes casi no cambia en una sesión.
    staleTime: 5 * 60_000,
    select: aEstado,
  });

  if (q.isPending) return { estado: "cargando" };
  if (q.isError) return { estado: "error", error: q.error };
  return q.data;
}

function aEstado(agentes: AgentListItem[]): EstadoAgentes {
  return { estado: "disponible", agentes, porId: new Map(agentes.map(a => [a.id, a])) };
}

/** Cómo se nombra un agente en la interfaz. `full_name` es nullable. */
export function nombreAgente(a: AgentListItem): string {
  return a.full_name ?? "Agente sin nombre";
}
