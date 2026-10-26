"use client";

import {
  useInfiniteQuery, useMutation, useQuery, useQueryClient,
  type InfiniteData, type QueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { api, HomeliticsError } from "@/lib/homelitics-navegador";
import type { NotificationOut, NotificationPage } from "@/lib/schemas";
import {
  CLAVE_MARCAR_AVISOS, LIMITE_AVISOS, claveAnteriores, claveResumen, prefijoAnteriores, prefijoBandeja,
} from "./claves";

/**
 * La bandeja del agente: la primera página de GET /me/notifications, sin
 * filtros. Es la única que se relee sola (cada minuto, pausada con la
 * pestaña oculta, y al volver a ella) y su `unread_count` es el badge.
 * "Ver más" va en otra query: ver "Por qué dos queries" en
 * docs/SPRINT_NOTIFICACIONES_LINEA2.md.
 */
export function useResumenAvisos(agenteId: string) {
  return useQuery({
    queryKey: claveResumen(agenteId),
    queryFn: () => api.avisos({ limit: LIMITE_AVISOS }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Las páginas de "Ver más": arrancan en `desde` (el `next_before` del
 * resumen) y siguen con el `next_before` de cada una. Apagada mientras
 * `desde` sea `null`. No se relee sola ni al volver a la pestaña: un
 * `useInfiniteQuery` relee TODAS sus páginas cada vez.
 *
 * `desde` tiene que quedar fijo mientras el panel está abierto: si sigue al
 * resumen vivo, cada aviso nuevo cambia la key y se pierden las páginas.
 */
export function useAvisosAnteriores(agenteId: string, desde: number | null) {
  return useInfiniteQuery({
    queryKey: claveAnteriores(agenteId, desde),
    queryFn: ({ pageParam }) => api.avisos({ before: pageParam ?? undefined, limit: LIMITE_AVISOS }),
    initialPageParam: desde,
    getNextPageParam: (pagina: NotificationPage) => pagina.next_before ?? undefined,
    enabled: desde !== null,
    refetchOnWindowFocus: false,
  });
}

/** Al cerrar el panel: la próxima vez abre sin las páginas de "Ver más". */
export function useDescartarAnteriores(agenteId: string) {
  const qc = useQueryClient();
  return useCallback(
    () => qc.removeQueries({ queryKey: prefijoAnteriores(agenteId) }),
    [qc, agenteId],
  );
}

type CambioPagina = (pagina: NotificationPage) => NotificationPage;

/** Aplica el mismo cambio al resumen y a cada página de "Ver más" en caché. */
function cambiarBandeja(qc: QueryClient, agenteId: string, cambio: CambioPagina) {
  qc.setQueryData<NotificationPage>(claveResumen(agenteId), p => p && cambio(p));
  qc.setQueriesData<InfiniteData<NotificationPage>>(
    { queryKey: prefijoAnteriores(agenteId) },
    d => d && { ...d, pages: d.pages.map(cambio) },
  );
}

function buscarAviso(qc: QueryClient, agenteId: string, id: number): NotificationOut | undefined {
  const enResumen = qc.getQueryData<NotificationPage>(claveResumen(agenteId))?.items.find(n => n.id === id);
  if (enResumen) return enResumen;
  for (const [, d] of qc.getQueriesData<InfiniteData<NotificationPage>>({ queryKey: prefijoAnteriores(agenteId) })) {
    const aviso = d?.pages.flatMap(p => p.items).find(n => n.id === id);
    if (aviso) return aviso;
  }
  return undefined;
}

/** Cambia `read`/`read_at` de un aviso y mueve el contador en `delta`. */
function cambiarUno(id: number, lectura: Pick<NotificationOut, "read" | "read_at">, delta: number): CambioPagina {
  return p => ({
    ...p,
    items: p.items.map(n => (n.id === id ? { ...n, ...lectura } : n)),
    unread_count: Math.max(0, p.unread_count + delta),
  });
}

type AlFallar<V> = { alFallar?: (error: unknown, vars: V) => void };

/**
 * POST /me/notifications/{id}/read, optimista:
 *
 * - onMutate: cancela las lecturas de la bandeja en vuelo (una respuesta
 *   vieja pisaría el cambio), marca el aviso leído en el resumen y en las
 *   páginas de "Ver más", y resta 1 al contador solo si estaba sin leer.
 * - onError: devuelve ese aviso, y solo ese, a no leído y suma el 1. No
 *   restaura una foto entera: con dos clics seguidos desharía el segundo,
 *   que sí se guardó (el mismo criterio de `useActualizarTarea`). Avisa con
 *   `alFallar` aquí y no en `mutate()`, que solo corre para la última llamada.
 * - Sin onSuccess: la guía del API pide no releer tras marcar, y la
 *   invalidación global de app/providers.tsx la salta por la `mutationKey`.
 */
export function useMarcarLeido(agenteId: string, { alFallar }: AlFallar<number> = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: CLAVE_MARCAR_AVISOS,
    mutationFn: (id: number) => api.marcarAvisoLeido(id),

    onMutate: async id => {
      await qc.cancelQueries({ queryKey: prefijoBandeja(agenteId) });
      const estabaSinLeer = buscarAviso(qc, agenteId, id)?.read === false;
      cambiarBandeja(qc, agenteId, cambiarUno(id, { read: true, read_at: new Date().toISOString() }, estabaSinLeer ? -1 : 0));
      return { estabaSinLeer };
    },

    onError: (error, id, contexto) => {
      if (contexto?.estabaSinLeer) {
        cambiarBandeja(qc, agenteId, cambiarUno(id, { read: false, read_at: null }, 1));
      }
      alFallar?.(error, id);
    },
  });
}

/**
 * POST /me/notifications/read-all, optimista: todo leído y el contador en 0.
 * Si falla vuelve la foto entera de la bandeja: es una sola operación sobre
 * todos los avisos.
 */
export function useMarcarTodosLeidos(agenteId: string, { alFallar }: AlFallar<void> = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: CLAVE_MARCAR_AVISOS,
    mutationFn: () => api.marcarTodosLeidos(),

    onMutate: async () => {
      await qc.cancelQueries({ queryKey: prefijoBandeja(agenteId) });
      const foto = qc.getQueriesData<NotificationPage | InfiniteData<NotificationPage>>({
        queryKey: prefijoBandeja(agenteId),
      });
      const ahora = new Date().toISOString();
      cambiarBandeja(qc, agenteId, p => ({
        ...p,
        items: p.items.map(n => (n.read ? n : { ...n, read: true, read_at: ahora })),
        unread_count: 0,
      }));
      return { foto };
    },

    onError: (error, vars, contexto) => {
      for (const [clave, datos] of contexto?.foto ?? []) qc.setQueryData(clave, datos);
      alFallar?.(error, vars);
    },
  });
}

/** Nunca muestra el `detail` del API: viene en inglés. */
export function mensajeErrorAviso(e: unknown, cual: "uno" | "todos"): string {
  const base = cual === "uno"
    ? "No se pudo marcar el aviso como leído y volvió a como estaba."
    : "No se pudieron marcar los avisos como leídos y volvieron a como estaban.";
  if (!(e instanceof HomeliticsError)) return `${base} Intenta de nuevo.`;
  switch (e.kind) {
    case "red":
      return `${base} No pudimos conectarnos con el servicio; puede estar despertando (tarda hasta un minuto).`;
    case "no_encontrado":
      return cual === "uno" ? "Ese aviso ya no está en tu bandeja." : `${base} Intenta de nuevo.`;
    case "invalido":
      return `${base} El servicio rechazó el cambio.`;
    case "conflicto":
      return `${base} Alguien más cambió tu bandeja al mismo tiempo; intenta de nuevo.`;
    case "no_autenticado":
      return `${base} Tu sesión venció; vuelve a entrar.`;
    case "sin_permiso":
      return `${base} Tu cuenta no puede marcar avisos.`;
    case "servidor":
      return `${base} El servicio tuvo un problema; intenta en un momento.`;
  }
}
