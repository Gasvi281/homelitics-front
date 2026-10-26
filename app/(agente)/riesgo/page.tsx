import { notFound } from "next/navigation";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/homelitics";
import { obtenerAgenteActual } from "@/lib/agente-actual";
import { leerUmbral } from "@/lib/umbral";
import type { Agent } from "@/lib/schemas";
import { clavePropiedades, QUERY_PROPIEDADES } from "@/features/tablero-leads/claves";
import { claveRiesgo, leerFiltrosRiesgo, queryRiesgo } from "@/features/riesgo/claves";
import { ExportarRiesgo } from "@/features/riesgo/components/ExportarRiesgo";
import { FiltrosRiesgo } from "@/features/riesgo/components/FiltrosRiesgo";
import { SelectorUmbral } from "@/features/riesgo/components/SelectorUmbral";
import { ReporteRiesgo } from "@/features/riesgo/components/ReporteRiesgo";

/**
 * 2.17 — HU-13 AC1. Leads en riesgo de la agencia agrupados por agente.
 * Misma arquitectura que el embudo (app/(agente)/embudo/page.tsx):
 * QueryClient nuevo por request, precarga con las keys de
 * features/riesgo/claves.ts y features/tablero-leads/claves.ts, y
 * `HydrationBoundary`.
 *
 * Solo `TEAM_ADMIN`, con el mismo control que /embudo: si GET /me dice que no
 * lo es, 404 sin llamar al API. GET /leads/at-risk no lo exige (un `AGENT` lo
 * usa para su aviso del header), pero el reporte de todo el equipo es del
 * admin. Si /me falló, se intenta igual.
 *
 * El umbral sale de la cookie (`leerUmbral()`), el mismo del tablero y del
 * header; cambiarlo aquí lo cambia en las tres pantallas.
 *
 * Los filtros (`?desde&hasta&propiedad`, 2.18) no cambian lo que se precarga:
 * GET /leads/at-risk no filtra y el reporte los aplica en el cliente.
 */
export default async function RiesgoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let agente: Agent | null = null;
  try {
    agente = await obtenerAgenteActual();
  } catch {
    agente = null;
  }

  // 404 y no un aviso: misma convención del API para lo que no es tuyo (HU-23, fase 5).
  if (agente && agente.role !== "TEAM_ADMIN") notFound();

  const umbral = await leerUmbral();
  const filtros = leerFiltrosRiesgo(await searchParams);

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  await Promise.all([
    qc.prefetchQuery({
      queryKey: claveRiesgo(umbral),
      queryFn: () => api.leadsEnRiesgo(queryRiesgo(umbral)),
    }),
    qc.prefetchQuery({
      queryKey: clavePropiedades(),
      queryFn: () => api.listings(QUERY_PROPIEDADES),
    }),
  ]);

  return (
    <main className="px-9 py-8">
      <HydrationBoundary state={dehydrate(qc)}>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="titulo-pagina">Leads en riesgo por agente</h1>
            <p className="mt-1 text-base text-tinta-suave">
              Quién tiene leads sin respuesta, cuántos y desde cuándo. Despliega un agente para ver sus leads.
            </p>
          </div>
          <ExportarRiesgo umbral={umbral} filtros={filtros} />
        </div>
        <div className="panel mb-4 px-6 py-4">
          <SelectorUmbral inicial={umbral} />
        </div>
        {/* La key remonta el formulario si la URL cambia por fuera (atrás, un enlace). */}
        <FiltrosRiesgo key={JSON.stringify(filtros)} filtros={filtros} />
        <ReporteRiesgo umbral={umbral} filtros={filtros} />
      </HydrationBoundary>
    </main>
  );
}
