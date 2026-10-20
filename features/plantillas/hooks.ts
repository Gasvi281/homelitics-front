"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, HomeliticsError } from "@/lib/homelitics-navegador";
import type { Channel } from "@/lib/schemas";
import { PREFIJO_TABLERO, claveInteracciones } from "@/features/tablero-leads/claves";
import { PREFIJO_RIESGO } from "@/features/riesgo/claves";

/** Tope de `body` en `CreateInteractionBody`. */
export const MAX_MENSAJE = 4000;

export type MensajeEnviado = { canal: Channel; texto: string };

/**
 * "Ya lo envié" (tarea 2.23 — HU-12 AC3): POST /leads/{id}/interactions con
 * `direction: OUTBOUND, type: MESSAGE`. El cuerpo pasa por
 * `CreateInteractionBody` en `api.crearInteraccion`.
 *
 * Es la respuesta que cuenta para at-risk (docs/API_CONTRACT.md), así que al
 * terminar invalida la línea de tiempo, todas las keys de riesgo (el aviso
 * del header, el reporte, el filtro del tablero) y el tablero, cuya tarjeta
 * muestra `last_interaction`. No es optimista: solo se dice "registrado"
 * cuando el API lo guardó.
 */
export function useRegistrarMensaje(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ canal, texto }: MensajeEnviado) =>
      api.crearInteraccion(leadId, {
        direction: "OUTBOUND",
        type: "MESSAGE",
        channel: canal,
        body: texto,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: claveInteracciones(leadId) });
      void qc.invalidateQueries({ queryKey: PREFIJO_RIESGO });
      void qc.invalidateQueries({ queryKey: PREFIJO_TABLERO });
    },
  });
}

/** Nunca muestra el `detail` del API: viene en inglés. */
export function mensajeErrorRegistro(e: unknown): string {
  const base = "No se pudo registrar el mensaje.";
  if (!(e instanceof HomeliticsError)) return `${base} Intenta de nuevo.`;
  switch (e.kind) {
    case "red":
      return `${base} No pudimos conectarnos con el servicio; puede estar despertando (tarda hasta un minuto).`;
    case "no_encontrado":
      return "Este lead ya no existe o no es de tu agencia.";
    case "invalido":
      return `${base} El servicio rechazó el canal o el texto; revísalos.`;
    case "conflicto":
      return `${base} Alguien más cambió este lead al mismo tiempo; intenta de nuevo.`;
    case "no_autenticado":
      return `${base} Tu sesión venció; vuelve a entrar.`;
    case "sin_permiso":
      return `${base} No tienes permiso para registrar mensajes en este lead.`;
    case "servidor":
      return `${base} El servicio tuvo un problema; intenta en un momento.`;
  }
}
