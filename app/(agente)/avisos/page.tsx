import { notFound } from "next/navigation";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/homelitics";
import { obtenerAgenteActual } from "@/lib/agente-actual";
import type { Agent, NotificationPage } from "@/lib/schemas";
import { Aviso } from "@/components/Aviso";
import { claveMonitor } from "@/features/avisos/claves";
import { aFiltrosApiMonitor, leerFiltrosMonitor, rangoInvalidoMonitor } from "@/features/avisos/filtros-monitor";
import { FiltrosMonitor } from "@/features/avisos/components/FiltrosMonitor";
import { MonitorAvisos } from "@/features/avisos/components/MonitorAvisos";

/**
 * Tarea 2.35. Monitor de los avisos que el CRM le mandó a cada agente de la
 * agencia, con filtros en la URL. Misma arquitectura que el embudo
 * (app/(agente)/embudo/page.tsx): QueryClient nuevo por request, precarga de
 * la primera página con la key de features/avisos/claves.ts y
 * `HydrationBoundary`. Precarga con `prefetchInfiniteQuery`: el cliente usa
 * `useInfiniteQuery` y lo hidratado tiene que tener su forma.
 *
 * Solo `TEAM_ADMIN`; si GET /me dice que no lo es, 404. Si /me falló (API
 * dormido), se intenta igual: el API es la autoridad y un 403 se pinta como
 * "sin permiso" en el cliente. Mirar el monitor nunca marca nada como leído.
 */
export default async function AvisosPage({
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

  if (agente && agente.role !== "TEAM_ADMIN") notFound();

  const filtros = leerFiltrosMonitor(await searchParams);
  const invalido = rangoInvalidoMonitor(filtros);
  const filtrosApi = aFiltrosApiMonitor(filtros);

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  // Un rango al revés no se pide: el API daría 422 (docs/API_CONTRACT.md).
  if (!invalido) {
    await qc.prefetchInfiniteQuery({
      queryKey: claveMonitor(filtrosApi),
      queryFn: ({ pageParam }) => api.avisosAgencia({ ...filtrosApi, before: pageParam }),
      initialPageParam: undefined as number | undefined,
      getNextPageParam: (pagina: NotificationPage) => pagina.next_before ?? undefined,
    });
  }

  return (
    <main className="px-9 py-8">
      <HydrationBoundary state={dehydrate(qc)}>
        <div className="mb-6">
          <h1 className="titulo-pagina">Avisos enviados</h1>
          <p className="mt-1 text-base text-tinta-suave">
            Los mensajes que el sistema les mandó a los agentes cuando el asistente o un administrador les asignó un
            lead o les agendó una visita, y si ya los leyeron.
          </p>
        </div>
        {/* La key remonta el formulario si la URL cambia por fuera (atrás, un enlace). */}
        <FiltrosMonitor key={JSON.stringify(filtros)} filtros={filtros} />
        {invalido ? (
          <Aviso variante="error">
            La fecha inicial es posterior a la final. Corrige el rango para ver los avisos.
          </Aviso>
        ) : (
          <MonitorAvisos filtros={filtros} />
        )}
      </HydrationBoundary>
    </main>
  );
}
