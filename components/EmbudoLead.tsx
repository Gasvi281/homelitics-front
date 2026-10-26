import type { Stage } from "@/lib/schemas";
import { EMBUDO, ETIQUETA_ETAPA } from "@/lib/etapas";

/**
 * Embudo completo del lead (tarea 2.4), dibujado como una barra de cinco
 * tramos con la etapa actual en grande debajo. `etapaActual` es
 * `lead.current_stage`, caché de solo lectura (docs/API_CONTRACT.md) — este
 * componente solo la muestra, nunca la edita.
 *
 * Un lead en LOST ya no está en ninguna etapa del embudo. Hasta dónde había
 * llegado sale de `GET /leads/{id}/transitions`: `perdidoDesde` es el
 * `from_stage` de la transición a LOST (la calcula components/EtapaLead.tsx).
 * Con ese dato se pintan los tramos hasta ahí y el último en color de
 * atención. Sin él (el log no se pudo leer o no trae esa fila) no se adivina
 * un punto de corte: la barra va atenuada y se dice "Lead perdido".
 *
 * Los nombres de cada tramo van como texto para lectores de pantalla; a la
 * vista queda la etapa actual, que es lo que el agente necesita leer.
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

  const titulo = perdido
    ? conCorte
      ? `Perdido en ${ETIQUETA_ETAPA[perdidoDesde!]}`
      : "Lead perdido"
    : ETIQUETA_ETAPA[etapaActual];

  return (
    <div>
      <p className="text-sm text-tinta-tenue">Etapa</p>
      <ol aria-label="Etapas del embudo" className={`mt-2 grid grid-cols-5 gap-[3px] ${perdido && !conCorte ? "opacity-45" : ""}`}>
        {EMBUDO.map((etapa, i) => {
          const alcanzada = perdido ? i <= hastaDonde : i <= indiceActual;
          const actual = !perdido && i === indiceActual;
          const dondeSePerdio = conCorte && i === hastaDonde;
          const color = dondeSePerdio ? "bg-alerta" : alcanzada ? "bg-plano" : "bg-borde";
          return (
            <li
              key={etapa}
              aria-current={actual ? "step" : undefined}
              className={`h-2.5 first:rounded-l-full last:rounded-r-full ${color}`}
            >
              <span className="sr-only">
                {ETIQUETA_ETAPA[etapa]}
                {actual ? " (etapa actual)" : dondeSePerdio ? " (aquí se perdió)" : alcanzada ? " (alcanzada)" : ""}
              </span>
            </li>
          );
        })}
      </ol>
      <p
        className={`mt-2 font-display text-[22px] font-bold ${perdido ? "text-alerta-hondo" : "text-tinta"}`}
      >
        {titulo}
      </p>
      {!perdido && etapaActual !== "WON" && indiceActual >= 0 && (
        <p className="text-sm text-tinta-tenue">
          Paso {indiceActual + 1} de {EMBUDO.length}
        </p>
      )}
    </div>
  );
}
