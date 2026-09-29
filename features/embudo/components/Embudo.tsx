"use client";

import { Aviso } from "@/components/Aviso";
import { HomeliticsError } from "@/lib/homelitics-navegador";
import type { FiltrosEmbudo } from "../claves";
import { mensajeErrorAnalitica, useEmbudo } from "../hooks";
import { GraficaEmbudo } from "./GraficaEmbudo";
import { TablaConversion } from "./TablaConversion";

/**
 * Los estados del embudo: cargando (el API puede tardar un minuto en
 * despertar), sin permiso (403: no se reintenta), error con reintento, vacío
 * (ningún lead creado en el rango) y los datos, en gráfica y en tabla.
 */
export function Embudo({ filtros }: { filtros: FiltrosEmbudo }) {
  const q = useEmbudo(filtros);

  if (q.isPending) {
    return (
      <Aviso>
        <p>Cargando el embudo…</p>
        <p className="mt-1 text-xs text-neutral-400">
          Puede tardar hasta un minuto la primera vez: el servicio se duerme sin uso.
        </p>
      </Aviso>
    );
  }

  if (q.isError) {
    const sinPermiso = q.error instanceof HomeliticsError && q.error.kind === "sin_permiso";
    return (
      <Aviso variante="error">
        <p>{mensajeErrorAnalitica(q.error)}</p>
        {!sinPermiso && (
          <button
            type="button"
            onClick={() => void q.refetch()}
            disabled={q.isFetching}
            className="mt-3 rounded border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-800 disabled:opacity-40"
          >
            {q.isFetching ? "Intentando…" : "Intentar de nuevo"}
          </button>
        )}
      </Aviso>
    );
  }

  const embudo = q.data;
  const total = embudo.stages[0]?.leads_reached ?? 0;
  if (total === 0) {
    return (
      <Aviso>
        No hay leads creados con estos filtros. Prueba con un rango de fechas más amplio o quita algún filtro.
      </Aviso>
    );
  }

  return (
    <div className={`grid gap-6 lg:grid-cols-2 ${q.isPlaceholderData ? "opacity-60" : ""}`} aria-busy={q.isPlaceholderData}>
      <GraficaEmbudo embudo={embudo} />
      <TablaConversion embudo={embudo} />
    </div>
  );
}
