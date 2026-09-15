import type { Stage } from "@/lib/schemas";

/** Orden estricto de saltos legales, docs/API_CONTRACT.md §3 (POST .../transitions). */
const ETAPAS: Stage[] = ["INTERESTED", "VISIT_SCHEDULED", "VISITED", "NEGOTIATING", "WON"];

const ETIQUETA_ETAPA: Record<Stage, string> = {
  INTERESTED: "Interesado",
  VISIT_SCHEDULED: "Visita agendada",
  VISITED: "Visitó",
  NEGOTIATING: "Negociando",
  WON: "Ganado",
  LOST: "Perdido",
};

/**
 * Embudo completo del lead (tarea 2.4), con la etapa actual marcada encima.
 * `etapaActual` es `lead.current_stage`, caché de solo lectura
 * (docs/API_CONTRACT.md) — este componente solo la muestra, nunca la edita.
 *
 * Si el lead está en LOST no hay forma de saber hasta dónde había avanzado
 * antes de perderse sin el historial de transiciones, y esta pantalla no lo
 * consulta (la tarea pide leer los cambios de etapa como interacciones
 * STATUS_CHANGE, no `GET /leads/{id}/transitions`). En vez de adivinar un
 * punto de corte, se muestra el embudo completo atenuado con una insignia de
 * "Lead perdido" aparte.
 */
export function EmbudoLead({ etapaActual }: { etapaActual: Stage }) {
  const perdido = etapaActual === "LOST";
  const indiceActual = ETAPAS.indexOf(etapaActual);

  return (
    <div>
      {perdido && (
        <span className="mb-3 inline-block rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
          Lead perdido
        </span>
      )}
      <ol className={`flex flex-col gap-3 sm:flex-row sm:items-center ${perdido ? "opacity-50" : ""}`}>
        {ETAPAS.map((etapa, i) => {
          const completada = !perdido && i < indiceActual;
          const actual = !perdido && i === indiceActual;
          return (
            <li key={etapa} className="flex flex-1 items-center gap-2">
              <span
                className={
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium " +
                  (actual
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : completada
                      ? "border-neutral-400 bg-neutral-100 text-neutral-600"
                      : "border-neutral-200 bg-white text-neutral-400")
                }
              >
                {i + 1}
              </span>
              <span className={`text-sm ${actual ? "font-semibold text-neutral-900" : "text-neutral-500"}`}>
                {ETIQUETA_ETAPA[etapa]}
              </span>
              {i < ETAPAS.length - 1 && (
                <span className="hidden h-px flex-1 bg-neutral-200 sm:block" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
