"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { Aviso } from "@/components/Aviso";
import { ETIQUETA_ETAPA } from "@/lib/etapas";
import { fechaHoraConAnio } from "@/lib/format";
import { rangoAlReves } from "@/lib/filtros-url";
import { useHidratado } from "@/lib/hidratado";
import { useUmbral } from "@/lib/umbral-navegador";
import type { Lead } from "@/lib/schemas";
import { nombreAgente, useAgentes } from "@/features/agentes/hooks";
import { etiquetaListing, type GrupoRiesgo } from "../agrupar";
import { LIMITE_RIESGO, type FiltrosRiesgo } from "../claves";
import { useListingsPorId, useRiesgoPorAgente } from "../hooks";

/**
 * Reporte de leads en riesgo por agente (2.17 — HU-13 AC1). Una fila por
 * agente con cuántos leads tiene sin respuesta y el más antiguo; cada fila se
 * despliega con sus leads.
 *
 * Lo que el API no da se escribe como falta, no se inventa: `LeadOut` no trae
 * el nombre del cliente (bloqueo 12), así que se muestra el final de su id,
 * como en el detalle del lead. Un agente que no está en GET /agents o una
 * publicación que no está en GET /listings (pide 200) se nombran igual.
 *
 * `umbral` es lo que leyó el servidor de la cookie; el selector lo cambia.
 * `filtros` vienen de la URL (2.18) y se aplican en el cliente: un rango al
 * revés que llegó por la URL se avisa y el reporte sale sin filtrar.
 */
export function ReporteRiesgo({ umbral, filtros }: { umbral: number; filtros: FiltrosRiesgo }) {
  const [horas] = useUmbral(umbral);
  const invalido = rangoAlReves(filtros);
  const { q, listings, necesitaListings } = useRiesgoPorAgente(horas, invalido ? {} : filtros);
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());
  const hidratado = useHidratado();

  // Hasta hidratar se pinta "Cargando", también en el servidor. Con
  // loading.tsx el header hidrata antes que la página, y el `Contador` de
  // AlertaRiesgo puede crear la key de riesgo (pendiente) antes que el
  // `HydrationBoundary` de esta página, que entonces deja la siembra para un
  // efecto: el servidor pintaría la tabla y el navegador "Cargando". Los
  // datos sembrados llegan igual, un render después, sin otra petición.
  if (!hidratado || q.isPending || (necesitaListings && listings.isPending)) {
    return (
      <Aviso>
        <p>Cargando los leads en riesgo…</p>
        <p className="mt-1 text-xs text-neutral-400">
          Puede tardar hasta un minuto la primera vez: el servicio se duerme sin uso.
        </p>
      </Aviso>
    );
  }

  if (q.isError) {
    return (
      <Aviso variante="error">
        <p>No se pudieron cargar los leads en riesgo. Puede que el servicio esté despertando (tarda hasta un minuto).</p>
        <button
          type="button"
          onClick={() => void q.refetch()}
          disabled={q.isFetching}
          className="mt-3 rounded border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-800 disabled:opacity-40"
        >
          {q.isFetching ? "Intentando…" : "Intentar de nuevo"}
        </button>
      </Aviso>
    );
  }

  if (necesitaListings && listings.isError) {
    return (
      <Aviso variante="error">
        <p>No se pudieron cargar las propiedades, y sin ellas no se puede filtrar por propiedad.</p>
        <button
          type="button"
          onClick={() => void listings.refetch()}
          disabled={listings.isFetching}
          className="mt-3 rounded border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-800 disabled:opacity-40"
        >
          {listings.isFetching ? "Intentando…" : "Intentar de nuevo"}
        </button>
      </Aviso>
    );
  }

  const { grupos, total, incompleto, sinUbicar } = q.data;
  const hayFiltros = !invalido && Boolean(filtros.desde || filtros.hasta || filtros.propiedad);

  const avisos = (
    <>
      {invalido && (
        <div className="mb-3">
          <Aviso variante="error">
            La fecha inicial es posterior a la final, así que el reporte sale sin filtrar. Corrige el rango para filtrarlo.
          </Aviso>
        </div>
      )}
      {incompleto && (
        <p role="status" className="mb-3 rounded border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Puede estar incompleto: el servicio devolvió el máximo de {LIMITE_RIESGO} leads en riesgo y no dice si
          hay más. Los filtros se aplican sobre esos {LIMITE_RIESGO}.
        </p>
      )}
      {sinUbicar > 0 && (
        <p className="mb-3 text-xs text-neutral-500">
          {sinUbicar === 1 ? "1 lead quedó" : `${sinUbicar} leads quedaron`} fuera del filtro por propiedad: su
          publicación no está en el listado.
        </p>
      )}
    </>
  );

  if (grupos.length === 0) {
    return (
      <>
        {avisos}
        <Aviso>
          {hayFiltros
            ? "Ningún lead en riesgo con este umbral cumple los filtros."
            : "Nadie tiene leads en riesgo con este umbral."}
        </Aviso>
      </>
    );
  }

  function alternar(agentId: string) {
    setAbiertos(prev => {
      const s = new Set(prev);
      if (!s.delete(agentId)) s.add(agentId);
      return s;
    });
  }

  return (
    <div className={q.isPlaceholderData ? "opacity-60" : ""} aria-busy={q.isPlaceholderData}>
      {avisos}
      <p className="mb-3 text-sm text-neutral-600">
        {total === 1 ? "1 lead" : `${total} leads`} sin respuesta hace más de {horas} h, de{" "}
        {grupos.length === 1 ? "1 agente" : `${grupos.length} agentes`}
        {hayFiltros ? ", con los filtros aplicados" : ""}.
      </p>
      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Agente</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Leads en riesgo</th>
              <th scope="col" className="px-4 py-2 font-medium">Lead más antiguo</th>
              <th scope="col" className="px-4 py-2"><span className="sr-only">Detalle</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {grupos.map(g => (
              <FilaAgente
                key={g.agentId}
                grupo={g}
                abierto={abiertos.has(g.agentId)}
                onAlternar={() => alternar(g.agentId)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        El servicio no da el nombre del cliente en esta lista: cada lead se identifica con el final de su id.
      </p>
    </div>
  );
}

function FilaAgente({
  grupo,
  abierto,
  onAlternar,
}: {
  grupo: GrupoRiesgo;
  abierto: boolean;
  onAlternar: () => void;
}) {
  const idDetalle = `riesgo-${grupo.agentId}`;
  const n = grupo.leads.length;
  return (
    <Fragment>
      <tr>
        <th scope="row" className="px-4 py-3 font-medium text-neutral-900">
          <NombreAgenteFila agentId={grupo.agentId} />
        </th>
        <td className="px-4 py-3 text-right tabular-nums text-neutral-900">{n}</td>
        <td className="px-4 py-3 text-neutral-700">{fechaHoraConAnio(grupo.masAntiguo.created_at)}</td>
        <td className="px-4 py-3 text-right">
          <button
            type="button"
            onClick={onAlternar}
            aria-expanded={abierto}
            aria-controls={idDetalle}
            className="text-sm text-neutral-700 underline hover:text-neutral-900"
          >
            {abierto ? "Ocultar leads" : n === 1 ? "Ver el lead" : `Ver los ${n} leads`}
          </button>
        </td>
      </tr>
      {abierto && (
        <tr id={idDetalle}>
          <td colSpan={4} className="bg-neutral-50 px-4 py-3">
            <LeadsDelAgente leads={grupo.leads} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function LeadsDelAgente({ leads }: { leads: Lead[] }) {
  const listings = useListingsPorId();

  function propiedad(listingId: string): string {
    if (listings.isPending) return "Cargando la propiedad…";
    if (listings.isError) return "No se pudo cargar la propiedad";
    const l = listings.data.get(listingId);
    return l ? etiquetaListing(l) : "Publicación fuera del listado";
  }

  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs text-neutral-500">
        <tr>
          <th scope="col" className="py-1 pr-4 font-medium">Cliente</th>
          <th scope="col" className="py-1 pr-4 font-medium">Propiedad</th>
          <th scope="col" className="py-1 pr-4 font-medium">Etapa</th>
          <th scope="col" className="py-1 pr-4 font-medium">Creado</th>
          <th scope="col" className="py-1"><span className="sr-only">Abrir</span></th>
        </tr>
      </thead>
      <tbody>
        {leads.map(l => (
          <tr key={l.id} className="border-t border-neutral-200">
            <td className="py-2 pr-4 font-mono text-xs text-neutral-600">…{l.client_id.slice(-8)}</td>
            <td className="py-2 pr-4 text-neutral-800">{propiedad(l.listing_id)}</td>
            <td className="py-2 pr-4 text-neutral-700">{ETIQUETA_ETAPA[l.current_stage]}</td>
            <td className="py-2 pr-4 text-neutral-700">{fechaHoraConAnio(l.created_at)}</td>
            <td className="py-2 text-right">
              <Link href={`/leads/${l.id}`} className="text-neutral-700 underline hover:text-neutral-900">
                Abrir el lead
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Como `NombreAgente`, pero en una tabla no puede quedar la celda vacía: si
 * la lista no carga o el agente no aparece en ella, se dice y se muestra el
 * final del id.
 */
function NombreAgenteFila({ agentId }: { agentId: string }) {
  const estado = useAgentes();
  const corto = `…${agentId.slice(-8)}`;
  if (estado.estado === "cargando") return <span className="text-neutral-500">Cargando el nombre…</span>;
  const agente = estado.estado === "disponible" ? estado.porId.get(agentId) : undefined;
  if (agente) return <>{nombreAgente(agente)}</>;
  return (
    <span className="text-neutral-600">
      {estado.estado === "error" ? "Nombre no disponible" : "Agente fuera de la lista"}{" "}
      <span className="font-mono text-xs">{corto}</span>
    </span>
  );
}
