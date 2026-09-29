import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/homelitics";
import { obtenerAgenteActual } from "@/lib/agente-actual";
import type { Agent } from "@/lib/schemas";
import { Aviso } from "@/components/Aviso";
import { clavePropiedades, QUERY_PROPIEDADES } from "@/features/tablero-leads/claves";
import {
  aFiltrosApiEmbudo, claveEmbudo, claveMotivos, DIAS_MOTIVOS_DEFECTO, leerFiltrosEmbudo,
  rangoInvalido,
} from "@/features/embudo/claves";
import { FiltrosEmbudo } from "@/features/embudo/components/FiltrosEmbudo";
import { Embudo } from "@/features/embudo/components/Embudo";
import { MotivosPerdida } from "@/features/embudo/components/MotivosPerdida";
import { ExportarEmbudo } from "@/features/embudo/components/ExportarEmbudo";

/**
 * HU-17. Embudo de conversión de la agencia, con filtros en la URL, y los
 * motivos de pérdida. Misma arquitectura que el tablero
 * (app/(agente)/tablero/page.tsx): QueryClient nuevo por request, precarga
 * con las keys de features/embudo/claves.ts y `HydrationBoundary`.
 *
 * Solo `TEAM_ADMIN`. Si GET /me dice que no lo es, la página ni siquiera
 * llama al API de analítica. Si /me falló (API dormido), se intenta igual: el
 * API es la autoridad y un 403 se pinta como "sin permiso" en el cliente.
 */
export default async function EmbudoPage({
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

  if (agente && agente.role !== "TEAM_ADMIN") {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="mb-6 text-lg font-semibold text-neutral-900">Embudo de conversión</h1>
        <Aviso>Esta vista es solo para administradores del equipo.</Aviso>
      </main>
    );
  }

  const filtros = leerFiltrosEmbudo(await searchParams);
  const invalido = rangoInvalido(filtros);

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  await Promise.all([
    // Un rango al revés no se pide: el API daría 422 (docs/API_CONTRACT.md).
    invalido
      ? null
      : qc.prefetchQuery({
          queryKey: claveEmbudo(filtros),
          queryFn: () => api.embudo(aFiltrosApiEmbudo(filtros)),
        }),
    qc.prefetchQuery({
      queryKey: claveMotivos(DIAS_MOTIVOS_DEFECTO),
      queryFn: () => api.motivosPerdida(DIAS_MOTIVOS_DEFECTO),
    }),
    qc.prefetchQuery({
      queryKey: clavePropiedades(),
      queryFn: () => api.listings(QUERY_PROPIEDADES),
    }),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <HydrationBoundary state={dehydrate(qc)}>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-neutral-900">Embudo de conversión</h1>
            <p className="mt-1 text-sm text-neutral-600">
              De los leads creados en el rango, cuántos llegaron a cada etapa y en cuál se pierden más.
            </p>
          </div>
          <ExportarEmbudo filtros={filtros} />
        </div>
        {/* La key remonta el formulario si la URL cambia por fuera (atrás, un enlace). */}
        <FiltrosEmbudo key={JSON.stringify(filtros)} filtros={filtros} />
        {invalido ? (
          <Aviso variante="error">
            La fecha inicial es posterior a la final. Corrige el rango para ver el embudo.
          </Aviso>
        ) : (
          <Embudo filtros={filtros} />
        )}
        <MotivosPerdida />
      </HydrationBoundary>
    </main>
  );
}
