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
      className="dialogo"
    >
      <form onSubmit={confirmar}>
        <h2 id="perdido-titulo" className="font-display text-[30px] leading-tight font-extrabold tracking-[-0.025em]">
          Marcar {cliente ?? "este lead"} como perdido
        </h2>
        <p id="perdido-aviso" className="mt-2 text-base leading-relaxed text-tinta-suave">
          Es definitivo: el lead sale del tablero activo, no se puede volver a mover de etapa y
          se cancelan sus visitas abiertas.
        </p>

        <label className="etiqueta mt-6">
          Motivo
          <select
            autoFocus
            required
            value={motivo}
            onChange={e => setMotivo(e.target.value as LostReason | "")}
            disabled={enviando}
            className="campo"
          >
            <option value="">Elige un motivo</option>
            {LostReason.options.map(codigo => (
              <option key={codigo} value={codigo}>{ETIQUETA_MOTIVO_PERDIDA[codigo]}</option>
            ))}
          </select>
        </label>

        <label className="etiqueta mt-5">
          Nota <span className="font-normal text-tinta-tenue">(opcional)</span>
          <textarea
            value={nota}
            onChange={e => setNota(e.target.value)}
            maxLength={MAX_NOTA}
            rows={3}
            disabled={enviando}
            aria-describedby="perdido-contador"
            placeholder="Qué pasó, para tenerlo en el historial…"
            className="campo"
          />
        </label>
        <p id="perdido-contador" className="mt-1 text-right text-xs text-tinta-tenue">
          {nota.length} / {MAX_NOTA}
        </p>

        {error && (
          <p role="alert" className="mt-3 text-sm font-semibold text-alerta-hondo">{error}</p>
        )}

        <div className="mt-7 flex justify-end gap-2.5">
          <button type="button" onClick={alCancelar} disabled={enviando} className="btn btn-secundario">
            Volver
          </button>
          <button type="submit" disabled={!motivo || enviando} className="btn btn-peligro-lleno">
            {enviando ? "Marcando…" : "Marcar como perdido"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
