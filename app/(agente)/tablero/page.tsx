import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/homelitics";
import { leerUmbral } from "@/lib/umbral";
import { Aviso } from "@/components/Aviso";
import {
  aFiltrosApi, claveLeadsTablero, clavePropiedades, esVistaCerrados, leerFiltros,
  QUERY_PROPIEDADES, rangoInvalido,
} from "@/features/tablero-leads/claves";
import { FiltrosTablero } from "@/features/tablero-leads/components/FiltrosTablero";
import { TableroLeads } from "@/features/tablero-leads/components/TableroLeads";
import { claveRiesgo, queryRiesgo } from "@/features/riesgo/claves";

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
 *
 * 2.15 — HU-10 AC3: siembra también GET /leads/at-risk con el umbral de la
 * cookie (`leerUmbral()`) en el mismo QueryClient, para que las tarjetas en
 * riesgo lleguen ya en rojo. Si esa falla, el tablero sale igual sin
 * resaltar y TableroLeads lo dice en una línea. En la vista de cerrados no
 * se pide: ningún lead terminal está en riesgo.
 */
export default async function TableroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filtros = leerFiltros(await searchParams);
  const invalido = rangoInvalido(filtros);
  const cerrados = esVistaCerrados(filtros);
  const umbral = await leerUmbral();

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
    invalido || cerrados
      ? null
      : qc.prefetchQuery({
          queryKey: claveRiesgo(umbral),
          queryFn: () => api.leadsEnRiesgo(queryRiesgo(umbral)),
        }),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-lg font-semibold text-neutral-900">
        {filtros.etapa === "LOST" ? "Leads perdidos" : filtros.etapa === "WON" ? "Leads ganados" : "Tablero de leads"}
      </h1>
      <p className="mt-1 mb-6 text-sm text-neutral-600">
        {cerrados
          ? "Leads ya cerrados de la agencia, solo para consulta. Abre uno para ver su historial y el motivo."
          : "Leads abiertos de la agencia, del que tuvo actividad más reciente al más viejo."}
      </p>

      <HydrationBoundary state={dehydrate(qc)}>
        {/* La key remonta el formulario si la URL cambia por fuera (atrás, un enlace). */}
        <FiltrosTablero key={JSON.stringify(filtros)} filtros={filtros} umbral={umbral} />
        {invalido ? (
          <Aviso variante="error">
            La fecha inicial es posterior a la final. Corrige el rango para ver el tablero.
          </Aviso>
        ) : (
          <TableroLeads filtros={filtros} umbral={umbral} />
        )}
      </HydrationBoundary>
    </main>
  );
}
