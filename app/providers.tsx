"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * Contexto de TanStack Query. Lo necesita, por ahora, la relectura periódica
 * de la tarea 2.3 (components/CitaAcciones.tsx) — el API no tiene
 * websockets, así que "tiempo real" es un refetchInterval.
 *
 * El QueryClient se crea con useState (uno por sesión de RootLayout) y no a
 * nivel de módulo: a nivel de módulo se compartiría entre peticiones
 * distintas del servidor.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
