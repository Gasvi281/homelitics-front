"use client";

import { HomeliticsError } from "@/lib/homelitics-navegador";
import { ETIQUETA_ETAPA } from "@/lib/etapas";
import type { LeadCard, Stage } from "@/lib/schemas";
import { Aviso } from "@/components/Aviso";
import { ETAPAS_ABIERTAS, LIMITE_TABLERO, type FiltrosTablero } from "../claves";
import { useLeadsTablero } from "../hooks";
import { TarjetaLead } from "./TarjetaLead";

/**
 * Tablero de solo lectura (tarea 2.8 — HU-06 AC1): una columna por etapa
 * abierta. Los filtros llegan como prop desde la página, no de
 * `useSearchParams`: así la key es exactamente la que precargó el servidor.
 * El drag & drop (2.10) se monta sobre esto.
 */
export function TableroLeads({ filtros }: { filtros: FiltrosTablero }) {
  const { data: leads, error, isPending, isFetching } = useLeadsTablero(filtros);

  if (isPending) {
    return (
      <Aviso>
        <p>Cargando el tablero…</p>
        <p className="mt-1 text-xs text-neutral-400">
          Puede tardar hasta un minuto la primera vez: el servicio se duerme sin uso.
        </p>
      </Aviso>
    );
  }
  if (error && !leads) return <Aviso variante="error">{mensajeError(error)}</Aviso>;
  if (!leads) return null;

  const columnas = filtros.etapa ? [filtros.etapa] : ETAPAS_ABIERTAS;
  const porEtapa = agrupar(leads);

  return (
    <div>
      <div className="mb-2 flex min-h-5 flex-wrap items-center gap-x-4 text-xs text-neutral-500">
        <span>{leads.length === 1 ? "1 lead abierto" : `${leads.length} leads abiertos`}</span>
        {isFetching && <span>Actualizando…</span>}
        {error && <span className="text-red-700">{mensajeError(error)}</span>}
      </div>

      {leads.length === LIMITE_TABLERO && (
        <p className="mb-3 text-xs text-neutral-500">
          Se muestran los primeros {LIMITE_TABLERO} leads. Usa los filtros para ver el resto.
        </p>
      )}

      {leads.length === 0 ? (
        <Aviso>No hay leads abiertos con estos filtros.</Aviso>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2">
          <div className="flex gap-4">
            {columnas.map(etapa => (
              <Columna key={etapa} etapa={etapa} leads={porEtapa.get(etapa) ?? []} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Columna({ etapa, leads }: { etapa: Stage; leads: LeadCard[] }) {
  return (
    <section
      aria-labelledby={`columna-${etapa}`}
      className="w-72 shrink-0 rounded-lg bg-neutral-50 p-3 lg:w-auto lg:min-w-0 lg:flex-1"
    >
      <h2 id={`columna-${etapa}`} className="flex items-baseline justify-between text-sm font-semibold text-neutral-900">
        {ETIQUETA_ETAPA[etapa]}
        <span className="text-xs font-normal text-neutral-500">{leads.length}</span>
      </h2>
      {leads.length === 0 ? (
        <p className="mt-3 text-xs text-neutral-400">Sin leads en esta etapa</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {leads.map(lead => (
            <li key={lead.id}>
              <TarjetaLead lead={lead} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Conserva el orden del API (`updated_at` descendente) dentro de cada columna. */
function agrupar(leads: LeadCard[]): Map<Stage, LeadCard[]> {
  const mapa = new Map<Stage, LeadCard[]>();
  for (const l of leads) {
    (mapa.get(l.current_stage) ?? mapa.set(l.current_stage, []).get(l.current_stage)!).push(l);
  }
  return mapa;
}

function mensajeError(e: unknown): string {
  if (!(e instanceof HomeliticsError)) return "No se pudo cargar el tablero. Intenta de nuevo.";
  switch (e.kind) {
    case "red":
      return "No pudimos conectarnos con el servicio. Puede estar despertando (tarda hasta un minuto); recarga en unos segundos.";
    case "invalido":
      return `Revisa los filtros: ${e.detail}`;
    default:
      return e.detail;
  }
}
