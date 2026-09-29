"use client";

import { useQuery } from "@tanstack/react-query";
import { api, HomeliticsError } from "@/lib/homelitics-navegador";
import type { Agent } from "@/lib/schemas";

/**
 * Lo que puede pasar con la lista de agentes de la agencia (HU-08, HU-17).
 * `"pendiente"` no es un error: es que el API todavía no tiene GET /agents.
 * `"cargando"` es la primera carga (o el API despertando, hasta un minuto).
 */
export type EstadoAgentes =
  | { estado: "disponible"; agentes: Agent[]; porId: ReadonlyMap<string, Agent> }
  | { estado: "pendiente" }
  | { estado: "cargando" }
  | { estado: "error"; error: Error };

export const CLAVE_AGENTES = ["agentes"] as const;

/** Lo que guarda el caché cuando la ruta no existe: un valor, no un error. */
const PENDIENTE = "pendiente" as const;

/**
 * Todos los agentes de la agencia, activos e inactivos, en una sola petición:
 * el selector filtra los activos del caché y `NombreAgente` necesita también
 * el nombre de los inactivos (dueños viejos de un lead).
 *
 * TODO: quitar cuando GET /agents exista en el API — la traducción del 404 a
 * "pendiente" de abajo (docs/API_CONTRACT.md §3 bis, docs/SPRINT_LINEA2.md
 * bloqueo 7). Cuando la ruta exista, un 404 aquí vuelve a ser un error real.
 *
 * El 404 se atrapa dentro de `queryFn` y se guarda como un resultado, no como
 * un error: así TanStack Query no reintenta (su `retry` solo ve errores), no
 * vuelve a pedir en cada montaje y respeta `staleTime` como con cualquier dato.
 * Solo se traduce el 404 de ESTA llamada; cualquier otro error sale tal cual.
 */
export function useAgentes(): EstadoAgentes {
  const q = useQuery({
    queryKey: CLAVE_AGENTES,
    queryFn: async () => {
      try {
        return await api.agentes();
      } catch (e) {
        if (e instanceof HomeliticsError && e.kind === "no_encontrado") return PENDIENTE;
        throw e;
      }
    },
    // La lista de agentes casi no cambia en una sesión.
    staleTime: 5 * 60_000,
    select: aEstado,
  });

  if (q.isPending) return { estado: "cargando" };
  if (q.isError) return { estado: "error", error: q.error };
  return q.data;
}

function aEstado(datos: Agent[] | typeof PENDIENTE): EstadoAgentes {
  if (datos === PENDIENTE) return { estado: "pendiente" };
  return { estado: "disponible", agentes: datos, porId: new Map(datos.map(a => [a.id, a])) };
}

/** Cómo se nombra un agente en la interfaz. `full_name` y `email` son nullable. */
export function nombreAgente(a: Agent): string {
  return a.full_name ?? a.email ?? "Agente sin nombre";
}
