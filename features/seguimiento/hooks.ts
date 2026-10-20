"use client";

import { useEffect, useState } from "react";
import { useMutation, useMutationState, useQueryClient } from "@tanstack/react-query";
import { api, HomeliticsError } from "@/lib/homelitics-navegador";
import type { PatchTaskBody, Task } from "@/lib/schemas";
import { claveTareasLead } from "@/features/tablero-leads/claves";

export type NuevoRecordatorio = { dueAt: string; nota: string | null };

/**
 * POST /leads/{id}/tasks (HU-11 AC1). Al terminar invalida
 * `claveTareasLead`: el panel y la línea de tiempo de HistorialLead leen esa
 * misma key, así que el recordatorio aparece en los dos. No es optimista: el
 * formulario espera al API y se limpia solo si se guardó.
 */
export function useCrearRecordatorio(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dueAt, nota }: NuevoRecordatorio) =>
      api.crearTarea(leadId, { due_at: dueAt, note: nota }),
    onSuccess: () => qc.invalidateQueries({ queryKey: claveTareasLead(leadId) }),
  });
}

/** Lo que cambia "Posponer" o "Hecho": solo `status` y, al posponer, `due_at`. */
export type CambioTarea = {
  tareaId: string;
  cambio: { status: "SNOOZED"; due_at: string } | { status: "DONE" };
};

function claveActualizar(leadId: string) {
  return ["leads", leadId, "tareas", "actualizar"] as const;
}

/**
 * Posponer o marcar hecha una tarea (tarea 2.20 — HU-11 AC3) con
 * actualización optimista, como `useMoverLead` (2.10):
 *
 * - onMutate: cancela la lectura de tareas en vuelo (una respuesta vieja
 *   pisaría el cambio), guarda la foto de la tarea y le aplica el cambio. El
 *   panel y la línea de tiempo de HistorialLead leen la misma key, así que
 *   cambian los dos.
 * - onError: devuelve esa tarea, y solo esa, a como estaba en la foto, y
 *   avisa con `alFallar` (aquí y no en `mutate()`, que solo corre para la
 *   última llamada: con dos tareas en vuelo se perdería el primer error).
 * - onSettled: relee las tareas cuando termina la última en vuelo; antes,
 *   la relectura traería la otra tarea sin su cambio y saltaría atrás.
 *
 * El cuerpo pasa por `PatchTaskBody` en `api.actualizarTarea`.
 */
export function useActualizarTarea(
  leadId: string,
  { alFallar }: { alFallar?: (error: unknown, vars: CambioTarea) => void } = {},
) {
  const qc = useQueryClient();
  const clave = claveTareasLead(leadId);
  return useMutation({
    mutationKey: claveActualizar(leadId),
    mutationFn: ({ tareaId, cambio }: CambioTarea) =>
      api.actualizarTarea(leadId, tareaId, cambio satisfies PatchTaskBody),

    onMutate: async ({ tareaId, cambio }) => {
      await qc.cancelQueries({ queryKey: clave, exact: true });
      const antes = qc.getQueryData<Task[]>(clave)?.find(t => t.id === tareaId);
      qc.setQueryData<Task[]>(clave, tareas =>
        tareas?.map(t => (t.id === tareaId ? { ...t, ...cambio } : t)),
      );
      return { antes };
    },

    onError: (error, vars, contexto) => {
      const antes = contexto?.antes;
      if (antes) {
        qc.setQueryData<Task[]>(clave, tareas =>
          tareas?.map(t => (t.id === antes.id ? antes : t)),
        );
      }
      alFallar?.(error, vars);
    },

    onSettled: () => {
      if (qc.isMutating({ mutationKey: claveActualizar(leadId) }) === 1) {
        void qc.invalidateQueries({ queryKey: clave, exact: true });
      }
    },
  });
}

/** Ids de las tareas con un cambio en vuelo: sus botones quedan quietos. */
export function useTareasCambiando(leadId: string): Set<string> {
  const ids = useMutationState({
    filters: { mutationKey: claveActualizar(leadId), status: "pending" },
    select: m => (m.state.variables as CambioTarea | undefined)?.tareaId,
  });
  return new Set(ids.filter((id): id is string => Boolean(id)));
}

/** Nunca muestra el `detail` del API: viene en inglés. */
export function mensajeErrorTarea(e: unknown, cambio: CambioTarea["cambio"]): string {
  const accion = cambio.status === "DONE" ? "marcar como hecha" : "posponer";
  const base = `No se pudo ${accion} la tarea y volvió a como estaba.`;
  if (!(e instanceof HomeliticsError)) return `${base} Intenta de nuevo.`;
  switch (e.kind) {
    case "red":
      return `${base} No pudimos conectarnos con el servicio; puede estar despertando (tarda hasta un minuto).`;
    case "no_encontrado":
      return `${base} La tarea o el lead ya no existen, o el lead dejó de ser de tu agencia.`;
    case "invalido":
      return cambio.status === "DONE"
        ? `${base} El servicio rechazó el cambio.`
        : `${base} El servicio rechazó la nueva fecha; elige otra.`;
    case "conflicto":
      return `${base} Alguien más la cambió al mismo tiempo; volvimos a cargar las tareas.`;
    case "no_autenticado":
      return `${base} Tu sesión venció; vuelve a entrar.`;
    case "sin_permiso":
      return `${base} No tienes permiso para cambiar las tareas de este lead.`;
    case "servidor":
      return `${base} El servicio tuvo un problema; intenta en un momento.`;
  }
}

/**
 * La hora de "ahora" para marcar vencidos, renovada cada minuto. Arranca del
 * valor que manda el servidor para que el HTML y la hidratación coincidan
 * (con `new Date()` en el render, una tarea que vence entre los dos rompe la
 * hidratación).
 */
export function useAhora(inicialIso: string): Date {
  const [ahora, setAhora] = useState(() => new Date(inicialIso));
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return ahora;
}

/** Nunca muestra el `detail` del API: viene en inglés. */
export function mensajeErrorRecordatorio(e: unknown): string {
  const base = "No se pudo guardar el recordatorio.";
  if (!(e instanceof HomeliticsError)) return `${base} Intenta de nuevo.`;
  switch (e.kind) {
    case "red":
      return "No pudimos conectarnos con el servicio y el recordatorio no se guardó. Puede estar despertando (tarda hasta un minuto).";
    case "no_encontrado":
      return "Este lead ya no existe o no es de tu agencia.";
    case "invalido":
      return `${base} El servicio rechazó la fecha o la nota; revísalas.`;
    case "conflicto":
      return `${base} Alguien más cambió este lead al mismo tiempo; intenta de nuevo.`;
    case "no_autenticado":
      return `${base} Tu sesión venció; vuelve a entrar.`;
    case "sin_permiso":
      return `${base} No tienes permiso para crear recordatorios en este lead.`;
    case "servidor":
      return `${base} El servicio tuvo un problema; intenta en un momento.`;
  }
}
