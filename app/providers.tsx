"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

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
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
