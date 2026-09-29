"use client";

import { useId, useState } from "react";
import { ETIQUETA_MOTIVO_PERDIDA } from "@/lib/etapas";
import { formatPorcentaje } from "@/lib/format";
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
    <section aria-labelledby="titulo-motivos" className="mt-6 rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="titulo-motivos" className="text-sm font-semibold text-neutral-900">
            Por qué se pierden los leads
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Este bloque no sigue los filtros de arriba: el servicio solo deja elegir cuántos días
            mirar hacia atrás, contados desde que el lead se marcó como perdido.
          </p>
        </div>
        <div>
          <label htmlFor={idSelector} className="block text-sm font-medium text-neutral-700">
            Perdidos en los últimos
          </label>
          <select
            id={idSelector}
            value={dias}
            onChange={e => setDias(Number(e.target.value))}
            className="mt-1 rounded border border-neutral-300 bg-white p-2 text-sm text-neutral-900"
          >
            {DIAS_MOTIVOS.map(d => (
              <option key={d} value={d}>{d} días</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        {q.isPending ? (
          <p className="text-sm text-neutral-500">Cargando los motivos…</p>
        ) : q.isError ? (
          <div className="text-sm text-red-700">
            <p>{mensajeErrorAnalitica(q.error)}</p>
            <button
              type="button"
              onClick={() => void q.refetch()}
              disabled={q.isFetching}
              className="mt-2 rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-800 disabled:opacity-40"
            >
              {q.isFetching ? "Intentando…" : "Intentar de nuevo"}
            </button>
          </div>
        ) : q.data.length === 0 ? (
          <p className="text-sm text-neutral-600">Ningún lead se marcó como perdido en los últimos {dias} días.</p>
        ) : (
          <ul className={`space-y-3 ${q.isPlaceholderData ? "opacity-60" : ""}`} aria-busy={q.isPlaceholderData}>
            {q.data.map(m => (
              <li key={m.reason}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-neutral-900">{ETIQUETA_MOTIVO_PERDIDA[m.reason]}</span>
                  <span className="text-xs text-neutral-600">
                    <span className="font-semibold text-neutral-900">{m.leads}</span>{" "}
                    {m.leads === 1 ? "lead" : "leads"} · {formatPorcentaje(m.pct)}
                  </span>
                </div>
                <div aria-hidden className="mt-1 h-3 w-full rounded bg-neutral-100">
                  <div className="h-3 rounded bg-red-400" style={{ width: `max(${m.pct}%, 4px)` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
