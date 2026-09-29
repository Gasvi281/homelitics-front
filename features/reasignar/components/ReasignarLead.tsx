"use client";

import { useState } from "react";
import type { Lead } from "@/lib/schemas";
import { esSinPermiso, mensajeErrorReasignar, useReasignarLead } from "../hooks";
import { ModalReasignar } from "./ModalReasignar";

/**
 * Botón "Reasignar" del detalle del lead (HU-08) con su diálogo. Quien lo
 * pone decide si se muestra (solo `useEsAdmin()` y lead no terminal); el API
 * igual responde 403 a quien no es admin, y el diálogo lo dice.
 *
 * El diálogo queda abierto mientras se envía y muestra el error adentro;
 * al terminar bien se cierra y el hook ya invalidó el lead y el tablero.
 */
export function ReasignarLead({ lead }: { lead: Pick<Lead, "id" | "agent_id"> }) {
  const reasignar = useReasignarLead();
  const [abierto, setAbierto] = useState(false);

  function cerrar() {
    setAbierto(false);
    reasignar.reset();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      >
        Reasignar
      </button>

      {abierto && (
        <ModalReasignar
          dueñoId={lead.agent_id}
          enviando={reasignar.isPending}
          error={reasignar.error ? mensajeErrorReasignar(reasignar.error) : null}
          sinReintento={esSinPermiso(reasignar.error)}
          alCancelar={cerrar}
          alConfirmar={toAgentId =>
            reasignar.mutate({ leadId: lead.id, toAgentId }, { onSuccess: cerrar })
          }
        />
      )}
    </>
  );
}
