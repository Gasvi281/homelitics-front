"use client";

import { useId, useState } from "react";
import { ETIQUETA_MOTIVO_PERDIDA } from "@/lib/etapas";
import { formatPorcentaje } from "@/lib/format";
import { Aviso } from "@/components/Aviso";
import { Cargando } from "@/components/Cargando";
import { DIAS_MOTIVOS, DIAS_MOTIVOS_DEFECTO } from "../claves";
import { mensajeErrorAnalitica, useMotivosPerdida } from "../hooks";

/**
 * Por qué se pierden los leads (HU-17, y HU-09 AC3). OJO: GET
 * /analytics/lost-reasons solo acepta `?days=` (sobre la fecha de pérdida),
 * no los filtros del embudo; por eso tiene su propio selector, que no va en
 * la URL, y lo dice en pantalla.
 */
export function MotivosPerdida() {
  const [dias, setDias] = useState<number>(DIAS_MOTIVOS_DEFECTO);
  const q = useMotivosPerdida(dias);
  const idSelector = useId();

  return (
    <section aria-labelledby="titulo-motivos" className="panel mt-5 px-7 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="titulo-motivos" className="font-display text-[22px] font-bold">
            Por qué se pierden los leads
          </h2>
          <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-tinta-tenue">
            Este bloque no sigue los filtros de arriba: el servicio solo deja elegir cuántos días
            mirar hacia atrás, contados desde que el lead se marcó como perdido.
          </p>
        </div>
        <div>
          <label htmlFor={idSelector} className="etiqueta">
            Perdidos en los últimos
          </label>
          <select
            id={idSelector}
            value={dias}
            onChange={e => setDias(Number(e.target.value))}
            className="campo w-auto"
          >
            {DIAS_MOTIVOS.map(d => (
              <option key={d} value={d}>{d} días</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        {q.isPending ? (
          <Cargando compacto mensaje="Cargando los motivos…" />
        ) : q.isError ? (
          <Aviso variante="error">
            <p>{mensajeErrorAnalitica(q.error)}</p>
            <button
              type="button"
              onClick={() => void q.refetch()}
              disabled={q.isFetching}
              className="btn btn-sm btn-peligro mt-3"
            >
              {q.isFetching ? "Intentando…" : "Intentar de nuevo"}
            </button>
          </Aviso>
        ) : q.data.length === 0 ? (
          <Aviso variante="exito">Ningún lead se marcó como perdido en los últimos {dias} días.</Aviso>
        ) : (
          <ul className={`grid gap-x-10 gap-y-4 lg:grid-cols-2 ${q.isPlaceholderData ? "opacity-60" : ""}`} aria-busy={q.isPlaceholderData}>
            {q.data.map(m => (
              <li key={m.reason}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-bold">{ETIQUETA_MOTIVO_PERDIDA[m.reason]}</span>
                  <span className="text-[13px] text-tinta-suave">
                    <span className="font-display text-lg font-bold text-tinta">{m.leads}</span>{" "}
                    {m.leads === 1 ? "lead" : "leads"} · {formatPorcentaje(m.pct)}
                  </span>
                </div>
                <div aria-hidden className="mt-1.5 h-3 w-full rounded-full bg-neblina">
                  <div className="h-3 rounded-full bg-alerta" style={{ width: `max(${m.pct}%, 4px)` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
