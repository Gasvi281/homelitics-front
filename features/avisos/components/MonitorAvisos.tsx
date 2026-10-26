"use client";

import Link from "next/link";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Aviso } from "@/components/Aviso";
import { Cargando } from "@/components/Cargando";
import { HomeliticsError } from "@/lib/homelitics-navegador";
import { useHidratado } from "@/lib/hidratado";
import { fechaHoraConAnio, tiempoRelativo } from "@/lib/format";
import type { NotificationOut, NotificationPage } from "@/lib/schemas";
import { nombreAgente, useAgentes } from "@/features/agentes/hooks";
import { claveMonitor } from "../claves";
import { aFiltrosApiMonitor, type FiltrosMonitor } from "../filtros-monitor";
import { mensajeErrorMonitor, useMonitorAvisos } from "../hooks-monitor";
import { nombreActor, queAviso } from "../texto";

/**
 * El monitor de avisos del admin (2.35): cuántos siguen sin leer, la tabla y
 * "Ver más". Estados: cargando (el API puede tardar un minuto en despertar),
 * sin permiso (403: no se reintenta), error con reintento, vacío y los datos.
 * Solo lee: no hay nada aquí que llame a /read.
 */
export function MonitorAvisos({ filtros }: { filtros: FiltrosMonitor }) {
  const filtrosApi = aFiltrosApiMonitor(filtros);
  const q = useMonitorAvisos(filtrosApi);
  const qc = useQueryClient();
  const hidratado = useHidratado();

  /**
   * Vuelve a la primera página antes de releer: un `refetch` con tres
   * páginas abiertas serían tres peticiones, y con el API dormido, lentas.
   */
  function actualizar() {
    qc.setQueryData<InfiniteData<NotificationPage>>(
      claveMonitor(filtrosApi),
      d => d && { pages: d.pages.slice(0, 1), pageParams: d.pageParams.slice(0, 1) },
    );
    void q.refetch();
  }

  if (q.isPending) return <Cargando mensaje="Cargando los avisos…" />;

  // Si falla una página de "Ver más", la query entera queda en error pero
  // conserva las cargadas: el error va debajo de la tabla, no en su lugar.
  const errorVerMas = q.isFetchNextPageError ? q.error : null;

  if (q.isError && !q.isFetchNextPageError) {
    const sinPermiso = q.error instanceof HomeliticsError && q.error.kind === "sin_permiso";
    return (
      <Aviso variante="error">
        <p>{mensajeErrorMonitor(q.error)}</p>
        {!sinPermiso && (
          <button
            type="button"
            onClick={() => void q.refetch()}
            disabled={q.isFetching}
            className="btn btn-sm btn-peligro mt-3"
          >
            {q.isFetching ? "Intentando…" : "Intentar de nuevo"}
          </button>
        )}
      </Aviso>
    );
  }

  const avisos = q.data.pages.flatMap(p => p.items);
  const sinLeer = q.data.pages[0]?.unread_count ?? 0;
  // Solo después de hidratar: el HTML del servidor no sabe si el navegador
  // está releyendo, y un "Actualizando…" distinto rompe la hidratación.
  const releyendo = hidratado && q.isFetching && !q.isFetchingNextPage;

  return (
    <div className={q.isPlaceholderData ? "opacity-60" : ""} aria-busy={q.isPlaceholderData}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg font-bold text-tinta">
          {sinLeer === 1 ? "1 sin leer" : `${sinLeer} sin leer`}
          {Object.keys(filtros).length > 0 && (
            <span className="ml-2 text-sm font-normal text-tinta-suave">con estos filtros</span>
          )}
        </p>
        <button type="button" onClick={actualizar} disabled={releyendo} className="btn btn-sm btn-suave">
          {releyendo ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      {avisos.length === 0 ? (
        <Aviso>No hay avisos con estos filtros.</Aviso>
      ) : (
        <>
          <div className="overflow-x-auto panel">
            <table className="w-full text-left text-sm">
              <thead className="bg-neblina text-xs text-tinta-tenue">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Cuándo</th>
                  <th scope="col" className="px-4 py-2 font-medium">Para</th>
                  <th scope="col" className="px-4 py-2 font-medium">Qué</th>
                  <th scope="col" className="px-4 py-2 font-medium">Lead</th>
                  <th scope="col" className="px-4 py-2 font-medium">Por</th>
                  <th scope="col" className="px-4 py-2 font-medium">Leído</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {avisos.map(n => <FilaAviso key={n.id} aviso={n} />)}
              </tbody>
            </table>
          </div>

          {q.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => void q.fetchNextPage()}
                disabled={q.isFetchingNextPage}
                className="btn btn-suave"
              >
                {q.isFetchingNextPage ? "Cargando…" : "Ver más"}
              </button>
            </div>
          )}
          {errorVerMas && (
            <p className="mt-2 text-center text-sm font-semibold text-alerta-hondo">
              No se pudieron cargar más avisos. {mensajeErrorMonitor(errorVerMas)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function FilaAviso({ aviso: n }: { aviso: NotificationOut }) {
  return (
    <tr className="align-top">
      <td className="px-4 py-3 whitespace-nowrap text-tinta">{fechaHoraConAnio(n.created_at)}</td>
      <td className="px-4 py-3 text-tinta">
        {n.recipient_name ?? <NombreDestinatario agentId={n.recipient_agent_id} />}
      </td>
      <td className="px-4 py-3 text-tinta">{queAviso(n)}</td>
      <td className="px-4 py-3">
        <Link href={`/leads/${n.lead_id}`} className="font-semibold text-plano underline hover:text-plano-hondo">
          {n.client_name ?? "Un cliente"}
        </Link>
        {n.listing_address !== null && <p className="text-xs text-tinta-suave">{n.listing_address}</p>}
      </td>
      <td className="px-4 py-3 text-tinta">
        {nombreActor(n)}
        {n.actor_role === "AI_AGENT" && <span className="insignia ml-2">bot</span>}
      </td>
      <td className="px-4 py-3">
        {n.read ? (
          <span className="text-tinta">
            <span aria-hidden="true">✓ </span>
            <span className="sr-only">Leído </span>
            {n.read_at !== null && fechaHoraConAnio(n.read_at)}
          </span>
        ) : (
          // El reloj del servidor y el del navegador pueden caer a lados de un minuto distinto.
          <span suppressHydrationWarning className="font-semibold text-alerta-hondo">
            sin leer {tiempoRelativo(n.created_at)}
          </span>
        )}
      </td>
    </tr>
  );
}

/** Si el API no trae `recipient_name`, el nombre de la lista de agentes o el final del id. */
function NombreDestinatario({ agentId }: { agentId: string }) {
  const estado = useAgentes();
  const agente = estado.estado === "disponible" ? estado.porId.get(agentId) : undefined;
  if (agente) return <>{nombreAgente(agente)}</>;
  return <span className="font-mono text-xs text-tinta-suave">…{agentId.slice(-8)}</span>;
}
