"use client";

import { useState } from "react";
import { esTerminal } from "@/lib/etapas";
import type { Lead, Transition } from "@/lib/schemas";
import { EmbudoLead } from "@/components/EmbudoLead";
import { ModalPerdido } from "@/components/ModalPerdido";
import {
  mensajeErrorMover, useLead, useMoverLead, useTransiciones,
} from "@/features/tablero-leads/hooks";

/**
 * Etapa del lead en su detalle: el embudo (2.4) y el botón "Marcar como
 * perdido" (2.11 — HU-09 AC1), que abre el mismo ModalPerdido del tablero y
 * mueve con el mismo `useMoverLead`.
 *
 * Lee el lead y su log de transiciones del caché que sembró la página
 * (Server Component). Aquí el diálogo queda abierto mientras se envía y
 * muestra el error adentro (un 422 deja corregir y reintentar). Al terminar,
 * el `onSettled` del hook invalida todo lo del lead: se releen la etapa, el
 * log (el embudo pasa a "Perdido en …") y el historial, donde aparece la
 * línea "Perdido: <motivo>".
 */
export function EtapaLead({ leadInicial }: { leadInicial: Lead }) {
  const { data: lead = leadInicial } = useLead(leadInicial.id);
  const { data: transiciones } = useTransiciones(leadInicial.id);
  const moverLead = useMoverLead();
  const [abierto, setAbierto] = useState(false);

  function cerrar() {
    setAbierto(false);
    moverLead.reset();
  }

  return (
    <div>
      <EmbudoLead etapaActual={lead.current_stage} perdidoDesde={perdidoDesde(transiciones)} />

      {!esTerminal(lead.current_stage) && (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="mt-4 rounded border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Marcar como perdido
        </button>
      )}

      {abierto && (
        <ModalPerdido
          enviando={moverLead.isPending}
          error={moverLead.error ? mensajeErrorMover(moverLead.error) : null}
          alCancelar={cerrar}
          alConfirmar={({ lost_reason, note }) =>
            moverLead.mutate(
              { lead, hacia: "LOST", lost_reason, note },
              { onSuccess: cerrar },
            )
          }
        />
      )}
    </div>
  );
}

/** Desde qué etapa pasó a LOST, según el log (del más viejo al más nuevo). */
function perdidoDesde(transiciones: Transition[] | undefined) {
  const aLost = transiciones?.filter(t => t.to_stage === "LOST").at(-1);
  return aLost?.from_stage ?? null;
}
