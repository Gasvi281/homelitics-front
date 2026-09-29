"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, HomeliticsError } from "@/lib/homelitics-navegador";
import { aFiltrosApiEmbudo, claveEmbudo, claveMotivos, type FiltrosEmbudo } from "./claves";

/** Un 403 o un 422 no se arreglan reintentando; el resto (red, API dormido), sí. */
function reintentar(fallos: number, error: Error): boolean {
  if (error instanceof HomeliticsError && (error.kind === "sin_permiso" || error.kind === "invalido")) {
    return false;
  }
  return fallos < 2;
}

/**
 * El embudo con los filtros de la URL. La primera vez llega hidratado desde
 * app/(agente)/embudo/page.tsx (misma key); `keepPreviousData` deja la
 * gráfica vieja a la vista mientras llega la de un filtro nuevo.
 */
export function useEmbudo(filtros: FiltrosEmbudo, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: claveEmbudo(filtros),
    queryFn: () => api.embudo(aFiltrosApiEmbudo(filtros)),
    placeholderData: keepPreviousData,
    retry: reintentar,
    enabled,
  });
}

/** Motivos de pérdida de los últimos `dias` días. No sigue los filtros del embudo. */
export function useMotivosPerdida(dias: number) {
  return useQuery({
    queryKey: claveMotivos(dias),
    queryFn: () => api.motivosPerdida(dias),
    placeholderData: keepPreviousData,
    retry: reintentar,
  });
}

export function mensajeErrorAnalitica(e: unknown): string {
  if (!(e instanceof HomeliticsError)) return "No se pudieron cargar los datos. Intenta de nuevo.";
  switch (e.kind) {
    case "sin_permiso":
      return "Esta vista es solo para administradores del equipo.";
    case "red":
      return "No pudimos conectarnos con el servicio. Puede estar despertando (tarda hasta un minuto).";
    case "invalido":
      return `El servicio rechazó los filtros: ${e.detail}`;
    default:
      return "El servicio respondió con un error. Intenta de nuevo en un momento.";
  }
}
