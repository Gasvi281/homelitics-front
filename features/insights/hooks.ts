"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { askInsights, InsightsError, type ChatResponse } from "@/lib/insights/client";
import { CLAVE_INSIGHTS } from "./claves";

/**
 * Lo que la UI necesita saber de un fallo. Se decide solo por status HTTP;
 * el `detail` del servicio nunca llega a la pantalla.
 * - `solo_admin`: 403, se esconde el formulario.
 * - `no_disponible`: 502, timeout, red o cualquier otro; el texto vuelve al input.
 * - `sesion_vencida`: 401 dos veces; ya se está yendo a /entrar.
 */
export type FalloInsights = "solo_admin" | "no_disponible" | "sesion_vencida";

export type ResultadoInsights =
  | { ok: true; respuesta: ChatResponse }
  | { ok: false; fallo: FalloInsights };

type Variables = { message: string; conversationId: string | null };

/** Con un 401 se reintenta una vez: pedir otro token hace que el middleware renueve la cookie. */
async function preguntar({ message, conversationId }: Variables): Promise<ChatResponse> {
  try {
    return await askInsights(message, conversationId);
  } catch (error) {
    if (error instanceof InsightsError && error.status === 401) return askInsights(message, conversationId);
    throw error;
  }
}

function clasificar(error: unknown): FalloInsights {
  if (!(error instanceof InsightsError)) return "no_disponible";
  if (error.status === 401) {
    const siguiente = window.location.pathname + window.location.search;
    window.location.assign(`/entrar?siguiente=${encodeURIComponent(siguiente)}`);
    return "sesion_vencida";
  }
  if (error.status === 403) return "solo_admin";
  // 422: el front mandó algo mal formado. Es un bug nuestro, no del usuario.
  if (error.status === 422) console.error("Asistente de insights: 422", error.message);
  return "no_disponible";
}

/**
 * Envío de mensajes al asistente. `enviar` nunca lanza: devuelve la
 * respuesta o el fallo ya clasificado. Un solo mensaje en vuelo: el ref
 * cubre el doble clic, que llega antes de que `isPending` se vea.
 */
export function useInsightsChat() {
  const mutacion = useMutation({ mutationKey: CLAVE_INSIGHTS, mutationFn: preguntar, retry: false });
  const { mutateAsync } = mutacion;
  const enVuelo = useRef(false);

  const enviar = useCallback(
    async (message: string, conversationId: string | null): Promise<ResultadoInsights | null> => {
      if (enVuelo.current) return null;
      enVuelo.current = true;
      try {
        return { ok: true, respuesta: await mutateAsync({ message, conversationId }) };
      } catch (error) {
        return { ok: false, fallo: clasificar(error) };
      } finally {
        enVuelo.current = false;
      }
    },
    [mutateAsync],
  );

  return { enviar, isPending: mutacion.isPending };
}
