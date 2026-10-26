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
    <section aria-labelledby="titulo-grafica" className="panel px-7 py-6">
      <h2 id="titulo-grafica" className="font-display text-[22px] font-bold">
        Cuántos leads llegan a cada etapa
      </h2>
      {peor && (
        <p className="mt-1 max-w-[70ch] text-[15px] leading-relaxed text-tinta-suave">
          La mayor caída está en <strong className="text-tinta">{ETIQUETA_ETAPA[peor.stage]}</strong>:
          solo {formatPorcentaje(peor.pct_from_prev)} de los que venían de la etapa anterior llegan ahí.
        </p>
      )}

      <ol aria-hidden className="mt-5 space-y-4">
        {embudo.stages.map(s => {
          const esPeor = s.stage === peor?.stage;
          const ancho = s.pct_of_first ?? 0;
          return (
            <li key={s.stage}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-[15px] font-bold">
                  {ETIQUETA_ETAPA[s.stage]}
                  {esPeor && (
                    <span className="insignia ml-2 bg-alerta-claro text-alerta-hondo">Aquí se pierden más clientes</span>
                  )}
                </span>
                <span className="text-[13px] text-tinta-suave">
                  <span className="font-display text-lg font-bold text-tinta">{s.leads_reached}</span> leads
                  {s.pct_from_prev !== null && <> · {formatPorcentaje(s.pct_from_prev)} desde la anterior</>}
                  {" · "}{formatPorcentaje(s.pct_of_first)} del total
                </span>
              </div>
              <div className="mt-1.5 h-7 w-full rounded-full bg-neblina">
                <div
                  className={`h-7 rounded-full ${esPeor ? "bg-alerta" : "bg-plano"}`}
                  // Una barra con leads nunca queda invisible, aunque sea el 0,4 %.
                  style={{ width: ancho > 0 ? `max(${ancho}%, 4px)` : "0" }}
                />
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl bg-alerta-claro px-4 py-3 text-[15px] text-alerta-hondo">
        <span className="font-bold">Perdidos</span>
        <span>
          <span className="font-semibold">{embudo.lost}</span>{" "}
          {embudo.lost === 1 ? "lead de este rango se marcó" : "leads de este rango se marcaron"} como perdidos
        </span>
      </div>
    </section>
  );
}
