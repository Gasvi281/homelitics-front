"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ETIQUETA_MOTIVO_PERDIDA } from "@/lib/etapas";
import { LostReason } from "@/lib/schemas";

/** Tope de `note` en POST /leads/{id}/transitions (docs/API_CONTRACT.md). */
const MAX_NOTA = 2000;

export type DatosPerdido = { lost_reason: LostReason; note: string | null };

/**
 * Diálogo para cerrar un lead como perdido (2.11 — HU-09 AC1). Lo abren el
 * tablero (al soltar en "Perdido") y el detalle del lead (botón "Marcar como
 * perdido"); no llama a la red: devuelve el motivo y la nota por
 * `alConfirmar` y quien lo abre decide cómo mover el lead.
 *
 * `<dialog>` modal nativo, como la confirmación de "Ganado": atrapa el foco y
 * Escape dispara `cancel`, que aquí se traduce en `alCancelar`. El foco
 * arranca en el motivo, que es obligatorio. Avisa antes de confirmar que es
 * definitivo y que cancela las visitas abiertas del lead.
 */
export function ModalPerdido({
  cliente,
  alConfirmar,
  alCancelar,
  enviando = false,
  error,
}: {
  /** Nombre del cliente, si se conoce, para decir a quién se cierra. */
  cliente?: string | null;
  alConfirmar: (datos: DatosPerdido) => void;
  alCancelar: () => void;
  /** Hay un envío en vuelo: no se puede cerrar ni volver a confirmar. */
  enviando?: boolean;
  /** Mensaje de un intento fallido, para mostrarlo dentro del diálogo. */
  error?: string | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [motivo, setMotivo] = useState<LostReason | "">("");
  const [nota, setNota] = useState("");

  useEffect(() => {
    const dialogo = ref.current;
    dialogo?.showModal();
    return () => dialogo?.close();
  }, []);

  function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!motivo || enviando) return;
    alConfirmar({ lost_reason: motivo, note: nota.trim() || null });
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="perdido-titulo"
      aria-describedby="perdido-aviso"
      onCancel={e => {
        e.preventDefault();
        if (!enviando) alCancelar();
      }}
      className="m-auto w-[min(30rem,calc(100%-2rem))] rounded-lg bg-white p-6 shadow-xl backdrop:bg-black/40"
    >
      <form onSubmit={confirmar}>
        <h2 id="perdido-titulo" className="text-base font-semibold text-neutral-900">
          Marcar {cliente ?? "este lead"} como perdido
        </h2>
        <p id="perdido-aviso" className="mt-2 text-sm text-neutral-600">
          Es definitivo: el lead sale del tablero activo, no se puede volver a mover de etapa y
          se cancelan sus visitas abiertas.
        </p>

        <label className="mt-5 block text-sm font-medium text-neutral-700">
          Motivo
          <select
            autoFocus
            required
            value={motivo}
            onChange={e => setMotivo(e.target.value as LostReason | "")}
            disabled={enviando}
            className="mt-1 w-full rounded border border-neutral-300 bg-white p-2 text-sm text-neutral-900 disabled:opacity-60"
          >
            <option value="">Elige un motivo</option>
            {LostReason.options.map(codigo => (
              <option key={codigo} value={codigo}>{ETIQUETA_MOTIVO_PERDIDA[codigo]}</option>
            ))}
          </select>
        </label>

        <label className="mt-4 block text-sm font-medium text-neutral-700">
          Nota <span className="font-normal text-neutral-500">(opcional)</span>
          <textarea
            value={nota}
            onChange={e => setNota(e.target.value)}
            maxLength={MAX_NOTA}
            rows={3}
            disabled={enviando}
            aria-describedby="perdido-contador"
            placeholder="Qué pasó, para tenerlo en el historial…"
            className="mt-1 w-full rounded border border-neutral-300 p-2 text-sm text-neutral-900 disabled:opacity-60"
          />
        </label>
        <p id="perdido-contador" className="mt-1 text-right text-xs text-neutral-500">
          {nota.length} / {MAX_NOTA}
        </p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>
        )}

        <div className="mt-6 flex justify-end gap-2">
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
            disabled={!motivo || enviando}
            className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {enviando ? "Marcando…" : "Marcar como perdido"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
