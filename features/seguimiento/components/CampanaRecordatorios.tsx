"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useHidratado } from "@/lib/hidratado";
import { useAgenteActual } from "@/features/agentes/AgenteActual";
import { fechaHoraLarga, tiempoRelativo } from "@/lib/format";
import type { TareaAgencia, TaskSource } from "@/lib/schemas";
import { LIMITE_RECORDATORIOS, useRecordatoriosVencidos } from "../hooks";

/** Las que no creó el agente llevan de dónde salieron; las suyas, nada. */
const ORIGEN: Record<TaskSource, string | null> = {
  MANUAL: null,
  SWEEP: "Automático: lead sin respuesta",
  FIRST_TOUCH: "Automático: primer contacto",
};

/**
 * Campanita del header (2.26 — HU-11 AC2): los recordatorios PENDING del
 * agente que ya vencieron, de todos sus leads. Al lado de `AlertaRiesgo`.
 *
 * GET /tasks es PROPUESTO (docs/API_CONTRACT.md §8, bloqueo 9): hoy sale
 * siempre del mock. Se relee cada minuto, así que un recordatorio que vence
 * con la página abierta aparece sin recargar.
 *
 * No se dibuja nada con 0, mientras carga, si la consulta falla ni si GET
 * /me falló (sin saber quién es, no hay `agent_id` que mandar). Tampoco
 * antes de hidratar, como `AlertaRiesgo`: el `useQuery` vive en `Campana`,
 * que solo se monta después, para que el HTML del servidor y el primer
 * render del cliente coincidan.
 */
export function CampanaRecordatorios() {
  const agente = useAgenteActual();
  const hidratado = useHidratado();
  if (!hidratado || !agente) return null;
  return <Campana agenteId={agente.id} />;
}

function Campana({ agenteId }: { agenteId: string }) {
  const { data } = useRecordatoriosVencidos(agenteId);
  const [abierta, setAbierta] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const idLista = useId();

  // Se cierra con Escape o con un clic fuera.
  useEffect(() => {
    if (!abierta) return;
    const alClic = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierta(false);
    };
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierta(false);
    };
    document.addEventListener("mousedown", alClic);
    document.addEventListener("keydown", alTecla);
    return () => {
      document.removeEventListener("mousedown", alClic);
      document.removeEventListener("keydown", alTecla);
    };
  }, [abierta]);

  if (!data || data.length === 0) return null;

  const n = data.length;
  const conteo = n >= LIMITE_RECORDATORIOS ? `${LIMITE_RECORDATORIOS}+` : String(n);
  const etiqueta = n === 1 ? "1 recordatorio vencido" : `${conteo} recordatorios vencidos`;

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        onClick={() => setAbierta(a => !a)}
        aria-expanded={abierta}
        aria-controls={idLista}
        aria-label={etiqueta}
        title={etiqueta}
        className="relative flex items-center rounded-full p-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        <span className="absolute -right-1 -top-1 min-w-[1.25rem] rounded-full bg-amber-500 px-1 text-center text-xs font-semibold leading-5 text-white">
          {conteo}
        </span>
      </button>

      {abierta && (
        <div
          id={idLista}
          className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-neutral-200 bg-white shadow-lg"
        >
          <p className="border-b border-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900">
            {etiqueta}
          </p>
          <ul className="max-h-96 divide-y divide-neutral-100 overflow-y-auto">
            {data.map(t => (
              <Recordatorio key={t.id} tarea={t} alAbrir={() => setAbierta(false)} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Recordatorio({ tarea, alAbrir }: { tarea: TareaAgencia; alAbrir: () => void }) {
  const origen = ORIGEN[tarea.source];
  return (
    <li>
      <Link
        href={`/leads/${tarea.lead_id}`}
        onClick={alAbrir}
        className="block px-4 py-3 text-sm hover:bg-neutral-50"
      >
        <span className={tarea.note ? "text-neutral-900" : "italic text-neutral-500"}>
          {tarea.note ?? "Recordatorio sin nota"}
        </span>
        <span className="mt-1 block text-xs text-neutral-500">
          Venció el {fechaHoraLarga(tarea.due_at)} ({tiempoRelativo(tarea.due_at)})
        </span>
        {origen && <span className="mt-1 block text-xs text-neutral-400">{origen}</span>}
        <span className="mt-1 block text-xs font-medium text-blue-700">Ver el lead</span>
      </Link>
    </li>
  );
}
