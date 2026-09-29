import { ETIQUETA_ETAPA } from "@/lib/etapas";
import { formatPorcentaje } from "@/lib/format";
import type { Funnel } from "@/lib/schemas";
import { etapaConMayorCaida } from "../claves";

/**
 * El embudo en barras horizontales (HU-17), sin librería de gráficas: el ancho
 * de cada barra es `pct_of_first`. La etapa que peor convierte desde la
 * anterior se resalta como "Aquí se pierden más clientes" (AC1). Los perdidos
 * van aparte: no son una etapa del camino, se caen desde cualquiera.
 *
 * Es la versión visual; la accesible es TablaConversion, con los mismos datos.
 * Por eso las barras van `aria-hidden` y aquí solo se anuncia el resumen.
 */
export function GraficaEmbudo({ embudo }: { embudo: Funnel }) {
  const peor = etapaConMayorCaida(embudo.stages);

  return (
    <section aria-labelledby="titulo-grafica" className="rounded-lg border border-neutral-200 p-4">
      <h2 id="titulo-grafica" className="text-sm font-semibold text-neutral-900">
        Cuántos leads llegan a cada etapa
      </h2>
      {peor && (
        <p className="mt-1 text-sm text-neutral-600">
          La mayor caída está en <strong className="text-neutral-900">{ETIQUETA_ETAPA[peor.stage]}</strong>:
          solo {formatPorcentaje(peor.pct_from_prev)} de los que venían de la etapa anterior llegan ahí.
        </p>
      )}

      <ol aria-hidden className="mt-4 space-y-3">
        {embudo.stages.map(s => {
          const esPeor = s.stage === peor?.stage;
          const ancho = s.pct_of_first ?? 0;
          return (
            <li key={s.stage}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="font-medium text-neutral-900">
                  {ETIQUETA_ETAPA[s.stage]}
                  {esPeor && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900">
                      Aquí se pierden más clientes
                    </span>
                  )}
                </span>
                <span className="text-xs text-neutral-600">
                  <span className="font-semibold text-neutral-900">{s.leads_reached}</span> leads
                  {s.pct_from_prev !== null && <> · {formatPorcentaje(s.pct_from_prev)} desde la anterior</>}
                  {" · "}{formatPorcentaje(s.pct_of_first)} del total
                </span>
              </div>
              <div className="mt-1 h-6 w-full rounded bg-neutral-100">
                <div
                  className={`h-6 rounded ${esPeor ? "bg-amber-500" : "bg-neutral-800"}`}
                  // Una barra con leads nunca queda invisible, aunque sea el 0,4 %.
                  style={{ width: ancho > 0 ? `max(${ancho}%, 4px)` : "0" }}
                />
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2 text-sm">
        <span className="font-medium text-red-800">Perdidos</span>
        <span className="text-red-800">
          <span className="font-semibold">{embudo.lost}</span>{" "}
          {embudo.lost === 1 ? "lead de este rango se marcó" : "leads de este rango se marcaron"} como perdidos
        </span>
      </div>
    </section>
  );
}
