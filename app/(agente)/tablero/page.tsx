import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/homelitics";
import { Aviso } from "@/components/Aviso";
import {
  aFiltrosApi, claveLeadsTablero, clavePropiedades, esVistaCerrados, leerFiltros,
  QUERY_PROPIEDADES, rangoInvalido,
} from "@/features/tablero-leads/claves";
import { FiltrosTablero } from "@/features/tablero-leads/components/FiltrosTablero";
import { TableroLeads } from "@/features/tablero-leads/components/TableroLeads";

/**
 * Tareas 2.8 y 2.9 — HU-06. Tablero de leads abiertos con filtros en la URL.
 * Con `?etapa=WON|LOST`, la vista de cerrados de 2.12 (HU-09 AC2).
 *
 * Server Component: lee los filtros de `searchParams`, precarga GET /leads y
 * GET /listings (para el selector de propiedad) con un QueryClient nuevo por
 * request — uno compartido mezclaría los datos de peticiones distintas — y
 * entrega el caché con `dehydrate` + `HydrationBoundary`. El primer render
 * llega con datos; las keys salen de features/tablero-leads/claves.ts, las
 * mismas que usan los hooks del navegador.
 *
 * Si la precarga falla no se rompe la página: `prefetchQuery` no lanza, el
 * error no se deshidrata y el hook del navegador reintenta y muestra el aviso.
 */
export default async function TableroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filtros = leerFiltros(await searchParams);
  const invalido = rangoInvalido(filtros);

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  await Promise.all([
    // Un rango al revés no se pide: el API daría 422 (docs/API_CONTRACT.md).
    invalido
      ? null
      : qc.prefetchQuery({
          queryKey: claveLeadsTablero(filtros),
          queryFn: () => api.leads(aFiltrosApi(filtros)),
        }),
    qc.prefetchQuery({
      queryKey: clavePropiedades(),
      queryFn: () => api.listings(QUERY_PROPIEDADES),
    }),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-lg font-semibold text-neutral-900">
        {filtros.etapa === "LOST" ? "Leads perdidos" : filtros.etapa === "WON" ? "Leads ganados" : "Tablero de leads"}
      </h1>
      <p className="mt-1 mb-6 text-sm text-neutral-600">
        {esVistaCerrados(filtros)
          ? "Leads ya cerrados de la agencia, solo para consulta. Abre uno para ver su historial y el motivo."
          : "Leads abiertos de la agencia, del que tuvo actividad más reciente al más viejo."}
      </p>

      <HydrationBoundary state={dehydrate(qc)}>
        {/* La key remonta el formulario si la URL cambia por fuera (atrás, un enlace). */}
        <FiltrosTablero key={JSON.stringify(filtros)} filtros={filtros} />
        {invalido ? (
          <Aviso variante="error">
            La fecha inicial es posterior a la final. Corrige el rango para ver el tablero.
          </Aviso>
        ) : (
          <TableroLeads filtros={filtros} />
        )}
      </HydrationBoundary>
    </main>
  );
}
