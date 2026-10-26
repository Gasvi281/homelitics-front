"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { HomeliticsError } from "@/lib/errores";

/**
 * Contexto de TanStack Query. Lo usan la relectura periódica de la tarea 2.3
 * (components/CitaAcciones.tsx) — el API no tiene websockets, así que
 * "tiempo real" es un refetchInterval — y el tablero de leads
 * (features/tablero-leads/), que llega precargado desde el servidor.
 *
 * El QueryClient se crea con useState (uno por sesión de RootLayout) y no a
 * nivel de módulo: a nivel de módulo se compartiría entre peticiones
 * distintas del servidor.
 *
 * `staleTime` de 30 s por defecto: con el valor de fábrica (0) lo que llega
 * hidratado desde un Server Component (`HydrationBoundary`) ya cuenta como
 * viejo al montar, y `useQuery` lo vuelve a pedir en seguida — la misma
 * petición dos veces y un parpadeo. 30 s cubren la hidratación sin dejar
 * datos rancios mucho rato. No afecta a CitaAcciones: `refetchInterval`
 * relee igual, sin mirar `staleTime`.
 *
 * `onError` global (HU-23): un `no_autenticado` es una sesión vencida que el
 * middleware no pudo renovar; se manda a /entrar y se vuelve a esta ruta al
 * entrar. En la v5 va en QueryCache/MutationCache, no en `defaultOptions`.
 * Las llamadas que no pasan por React Query (p. ej. HistorialLead,
 * ExportarEmbudo) no lo ven. `apiPublico` nunca produce `no_autenticado`: el
 * proxy público responde 502 si la cuenta de servicio falla.
 */
function alEntrarSiVencio(error: unknown) {
  if (!(error instanceof HomeliticsError) || error.kind !== "no_autenticado") return;
  const siguiente = window.location.pathname + window.location.search;
  window.location.assign(`/entrar?siguiente=${encodeURIComponent(siguiente)}`);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({
      queryCache: new QueryCache({ onError: alEntrarSiVencio }),
      mutationCache: new MutationCache({ onError: alEntrarSiVencio }),
      defaultOptions: { queries: { staleTime: 30_000 } },
    }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
