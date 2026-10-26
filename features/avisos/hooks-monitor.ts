"use client";

import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { api, HomeliticsError } from "@/lib/homelitics-navegador";
import type { FiltrosAvisosAgencia } from "@/lib/homelitics-nucleo";
import type { NotificationPage } from "@/lib/schemas";
import { claveMonitor } from "./claves";

/** Un 403 o un 422 no se arreglan reintentando; el resto (red, API dormido), sí. */
function reintentar(fallos: number, error: Error): boolean {
  if (error instanceof HomeliticsError && (error.kind === "sin_permiso" || error.kind === "invalido")) {
    return false;
  }
  return fallos < 2;
}

/**
 * El monitor del admin (2.35): GET /notifications con los filtros de la URL,
 * paginado con "Ver más". La primera página llega hidratada desde
 * app/(agente)/avisos/page.tsx con la misma key.
 *
 * Sin polling ni relectura al volver a la pestaña: un `useInfiniteQuery`
 * relee TODAS sus páginas cada vez. El admin relee con "Actualizar" o al
 * cambiar los filtros. Solo lee: nunca marca nada como leído.
 */
export function useMonitorAvisos(filtros: FiltrosAvisosAgencia, { enabled = true }: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: claveMonitor(filtros),
    queryFn: ({ pageParam }) => api.avisosAgencia({ ...filtros, before: pageParam }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (pagina: NotificationPage) => pagina.next_before ?? undefined,
    placeholderData: keepPreviousData,
    retry: reintentar,
    refetchOnWindowFocus: false,
    enabled,
  });
}

/** Nunca muestra el `detail` del API salvo en un 422: viene en inglés. */
export function mensajeErrorMonitor(e: unknown): string {
  if (!(e instanceof HomeliticsError)) return "No se pudieron cargar los avisos. Intenta de nuevo.";
  switch (e.kind) {
    case "sin_permiso":
      return "Esta vista es solo para administradores del equipo.";
    case "red":
      return "No pudimos conectarnos con el servicio. Puede estar despertando (tarda hasta un minuto).";
    case "invalido":
      return `El servicio rechazó los filtros: ${e.detail}`;
    case "no_autenticado":
      return "Tu sesión venció; vuelve a entrar.";
    default:
      return "El servicio respondió con un error. Intenta de nuevo en un momento.";
  }
}
