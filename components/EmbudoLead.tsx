import type { Stage } from "@/lib/schemas";
import { EMBUDO, ETIQUETA_ETAPA } from "@/lib/etapas";

/**
 * Embudo completo del lead (tarea 2.4), con la etapa actual marcada encima.
 * `etapaActual` es `lead.current_stage`, caché de solo lectura
 * (docs/API_CONTRACT.md) — este componente solo la muestra, nunca la edita.
 *
 * Un lead en LOST ya no está en ninguna etapa del embudo. Hasta dónde había
 * llegado sale de `GET /leads/{id}/transitions`: `perdidoDesde` es el
 * `from_stage` de la transición a LOST (la calcula components/EtapaLead.tsx).
 * Con ese dato se marcan como alcanzadas las etapas hasta ahí y la última en
 * rojo. Sin él (el log no se pudo leer o no trae esa fila) no se adivina un
 * punto de corte: se muestra el embudo completo atenuado con la insignia
 * "Lead perdido" aparte.
 */
export function EmbudoLead({
  etapaActual,
  perdidoDesde = null,
}: {
  etapaActual: Stage;
  perdidoDesde?: Stage | null;
}) {
  const perdido = etapaActual === "LOST";
  const hastaDonde = perdido && perdidoDesde ? EMBUDO.indexOf(perdidoDesde) : -1;
  const conCorte = hastaDonde >= 0;
  const indiceActual = EMBUDO.indexOf(etapaActual);

  return (
    <div>
      {perdido && (
        <span className="mb-3 inline-block rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
          {conCorte ? `Perdido en ${ETIQUETA_ETAPA[perdidoDesde!]}` : "Lead perdido"}
        </span>
      )}
      <ol className={`flex flex-col gap-3 sm:flex-row sm:items-center ${perdido && !conCorte ? "opacity-50" : ""}`}>
        {EMBUDO.map((etapa, i) => {
          const completada = perdido ? i < hastaDonde : i < indiceActual;
          const actual = !perdido && i === indiceActual;
          const ultimaAlcanzada = conCorte && i === hastaDonde;
          const noAlcanzada = conCorte && i > hastaDonde;
          return (
            <li
              key={etapa}
              aria-current={actual ? "step" : undefined}
              className={`flex flex-1 items-center gap-2 ${noAlcanzada ? "opacity-40" : ""}`}
            >
              <span
                className={
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium " +
                  (actual
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : ultimaAlcanzada
                      ? "border-red-700 bg-red-50 text-red-700"
                      : completada
                        ? "border-neutral-400 bg-neutral-100 text-neutral-600"
                        : "border-neutral-200 bg-white text-neutral-400")
                }
              >
                {i + 1}
              </span>
              <span
                className={`text-sm ${
                  actual ? "font-semibold text-neutral-900" : ultimaAlcanzada ? "font-semibold text-red-700" : "text-neutral-500"
                }`}
              >
                {ETIQUETA_ETAPA[etapa]}
                {ultimaAlcanzada && <span className="sr-only"> (aquí se perdió)</span>}
              </span>
              {i < EMBUDO.length - 1 && (
                <span className="hidden h-px flex-1 bg-neutral-200 sm:block" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
