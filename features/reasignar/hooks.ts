"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, HomeliticsError } from "@/lib/homelitics-navegador";
import { CLAVE_AGENTES } from "@/features/agentes/hooks";
import { PREFIJO_TABLERO, prefijoLead } from "@/features/tablero-leads/claves";

export type ReasignarLead = { leadId: string; toAgentId: string };

/**
 * Reasignar un lead a otro agente (HU-08). NO es optimista, a diferencia de
 * `useMoverLead`: la tarjeta no cambia de columna, solo de dueño, y un
 * nombre que salta y vuelve a su sitio confunde más que esperar al API.
 *
 * Al terminar bien relee el tablero (el nombre en la tarjeta y el filtro por
 * agente) y todo lo del lead bajo `prefijoLead()` (el detalle muestra el
 * dueño nuevo). Con un 409 relee además la lista de agentes: el destino pudo
 * desactivarse mientras el modal estaba abierto (docs/API_CONTRACT.md §4).
 */
export function useReasignarLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, toAgentId }: ReasignarLead) =>
      api.reasignarLead(leadId, { to_agent_id: toAgentId }),
    onSuccess: (_lead, { leadId }) => {
      void qc.invalidateQueries({ queryKey: PREFIJO_TABLERO });
      void qc.invalidateQueries({ queryKey: prefijoLead(leadId) });
    },
    onError: error => {
      if (error instanceof HomeliticsError && error.kind === "conflicto") {
        void qc.invalidateQueries({ queryKey: CLAVE_AGENTES });
      }
    },
  });
}

/** Un 403 no se arregla reintentando: el contrato pide decirlo y ya. */
export function esSinPermiso(e: unknown): boolean {
  return e instanceof HomeliticsError && e.kind === "sin_permiso";
}

export function mensajeErrorReasignar(e: unknown): string {
  if (!(e instanceof HomeliticsError)) return "No se pudo reasignar el lead. Intenta de nuevo.";
  switch (e.kind) {
    case "sin_permiso":
      return "Solo un administrador del equipo puede reasignar";
    case "no_encontrado":
      return "Ese agente no es de tu agencia";
    case "conflicto":
      return e.detail;
    case "red":
      return "No pudimos conectarnos con el servicio y el lead no cambió de agente. Puede estar despertando (tarda hasta un minuto).";
    default:
      return e.detail;
  }
}
