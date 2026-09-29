"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAgentes } from "@/features/agentes/hooks";
import { NombreAgente } from "@/features/agentes/components/NombreAgente";
import { SelectorAgente } from "@/features/agentes/components/SelectorAgente";

/**
 * Diálogo para pasar un lead a otro agente (HU-08). Mismo patrón que
 * components/ModalPerdido.tsx: `<dialog>` modal nativo que atrapa el foco,
 * Escape dispara `cancel` (→ `alCancelar`), el foco arranca en el selector y
 * no llama a la red: devuelve el agente elegido por `alConfirmar` y quien lo
 * abre (ReasignarLead) hace la petición y le pasa `enviando` y `error`.
 *
 * El selector no ofrece al dueño actual ni a los inactivos: los dos darían
 * 409. Si la lista de agentes no cargó no hay de dónde elegir: Confirmar
 * queda deshabilitado y dice por qué.
 */
export function ModalReasignar({
  dueñoId,
  cliente,
  alConfirmar,
  alCancelar,
  enviando = false,
  error,
  sinReintento = false,
}: {
  /** `agent_id` actual del lead. */
  dueñoId: string;
  /** Nombre del cliente, si se conoce, para decir de quién es el lead. */
  cliente?: string | null;
  alConfirmar: (toAgentId: string) => void;
  alCancelar: () => void;
  /** Hay un envío en vuelo: no se puede cerrar ni volver a confirmar. */
  enviando?: boolean;
  /** Mensaje de un intento fallido, para mostrarlo dentro del diálogo. */
  error?: string | null;
  /** El error no se arregla reintentando (403): Confirmar queda deshabilitado. */
  sinReintento?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [destino, setDestino] = useState("");
  const agentes = useAgentes();

  useEffect(() => {
    const dialogo = ref.current;
    dialogo?.showModal();
    return () => dialogo?.close();
  }, []);

  // Tras un 409 se relee la lista: si el elegido se desactivó, ya no cuenta.
  const destinoValido =
    agentes.estado === "disponible" &&
    agentes.agentes.some(a => a.id === destino && a.active && a.id !== dueñoId);

  const motivoBloqueo =
    agentes.estado === "error" ? "No se puede reasignar sin la lista de agentes." : null;

  function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!destinoValido || enviando || sinReintento) return;
    alConfirmar(destino);
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="reasignar-titulo"
      aria-describedby="reasignar-nota"
      onCancel={e => {
        e.preventDefault();
        if (!enviando) alCancelar();
      }}
      className="m-auto w-[min(30rem,calc(100%-2rem))] rounded-lg bg-white p-6 shadow-xl backdrop:bg-black/40"
    >
      <form onSubmit={confirmar}>
        <h2 id="reasignar-titulo" className="text-base font-semibold text-neutral-900">
          Reasignar {cliente ?? "este lead"}
        </h2>
        <NombreAgente
          agentId={dueñoId}
          prefijo="Hoy lo atiende "
          className="mt-1 block text-sm text-neutral-600"
        />

        <div className="mt-5">
          <SelectorAgente
            etiqueta="Nuevo agente"
            valor={destino}
            alCambiar={setDestino}
            excluir={[dueñoId]}
            soloActivos
            requerido
            autoFocus
            deshabilitado={enviando}
          />
        </div>

        <p id="reasignar-nota" className="mt-4 rounded bg-neutral-50 p-3 text-sm text-neutral-600">
          El nuevo agente no recibe notificación; verá el lead en su tablero. Las tareas de
          seguimiento abiertas se quedan con el agente anterior.
        </p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          {motivoBloqueo && (
            <p id="reasignar-bloqueo" className="mr-auto text-xs text-neutral-500">{motivoBloqueo}</p>
          )}
          <button
            type="button"
            onClick={alCancelar}
            disabled={enviando}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!destinoValido || enviando || sinReintento}
            aria-describedby={motivoBloqueo ? "reasignar-bloqueo" : undefined}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {enviando ? "Reasignando…" : "Reasignar el lead"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
