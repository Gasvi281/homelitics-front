"use client";

import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { Cargando } from "@/components/Cargando";
import { fechaHoraLarga, tiempoRelativo } from "@/lib/format";
import type { TareaAgencia, TaskSource } from "@/lib/schemas";
import { useRecordatoriosVencidos } from "../hooks";

/** Las que no creó el agente llevan de dónde salieron; las suyas, nada. */
const ORIGEN: Record<TaskSource, string | null> = {
  MANUAL: null,
  SWEEP: "Automático: lead sin respuesta",
  FIRST_TOUCH: "Automático: primer contacto",
};

/**
 * Los recordatorios PENDING del agente que ya vencieron, de todos sus leads
 * (2.26 — HU-11 AC2). Es la pestaña "Recordatorios" de `CentroAvisos`
 * (2.33), que antes era la campanita sola.
 *
 * GET /tasks es PROPUESTO (docs/API_CONTRACT.md §8, bloqueo 9): hoy sale
 * siempre del mock. Se relee cada minuto, así que un recordatorio que vence
 * con la página abierta aparece sin recargar. `CentroAvisos` lee la misma
 * query para el número de la pestaña; TanStack no la pide dos veces.
 */
export function ListaRecordatorios({ agenteId, alAbrir }: { agenteId: string; alAbrir: () => void }) {
  const { data, isError } = useRecordatoriosVencidos(agenteId);

  if (!data) {
    return (
      <div className="p-3">
        {isError ? (
          <Aviso variante="error">No pudimos cargar tus recordatorios. Intenta en un momento.</Aviso>
        ) : (
          <Cargando compacto mensaje="Cargando tus recordatorios." />
        )}
      </div>
    );
  }

  if (data.length === 0) {
    return <p className="px-4 py-6 text-sm text-tinta-tenue">No tienes recordatorios vencidos.</p>;
  }

  return (
    <ul className="max-h-96 divide-y divide-hoja overflow-y-auto">
      {data.map(t => (
        <Recordatorio key={t.id} tarea={t} alAbrir={alAbrir} />
      ))}
    </ul>
  );
}

function Recordatorio({ tarea, alAbrir }: { tarea: TareaAgencia; alAbrir: () => void }) {
  const origen = ORIGEN[tarea.source];
  return (
    <li>
      <Link
        href={`/leads/${tarea.lead_id}`}
        onClick={alAbrir}
        className="block px-4 py-3 text-sm hover:bg-neblina"
      >
        <span className={tarea.note ? "text-tinta" : "italic text-tinta-tenue"}>
          {tarea.note ?? "Recordatorio sin nota"}
        </span>
        <span className="mt-1 block text-xs text-tinta-tenue">
          Venció el {fechaHoraLarga(tarea.due_at)} ({tiempoRelativo(tarea.due_at)})
        </span>
        {origen && <span className="mt-1 block text-xs text-tinta-tenue">{origen}</span>}
        <span className="mt-1 block text-xs font-medium text-plano-texto">Ver el lead</span>
      </Link>
    </li>
  );
}
