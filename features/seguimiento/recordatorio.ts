/**
 * Lo puro del panel de seguimiento (tarea 2.19 — HU-11 AC1): orden de la
 * lista, "vencido" y la conversión de la fecha del formulario. Sin
 * `"use client"`: no depende del navegador y se puede probar suelto.
 */
import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { TZ } from "@/lib/format";
import type { Task } from "@/lib/schemas";

/** Máximo de `note` en `TaskCreate` (docs/API_CONTRACT.md). */
export const MAX_NOTA = 1000;

export type Atajo = { etiqueta: string; dias: number };

export const ATAJOS: readonly Atajo[] = [
  { etiqueta: "En 1 día", dias: 1 },
  { etiqueta: "En 3 días", dias: 3 },
  { etiqueta: "En 1 semana", dias: 7 },
];

/** PENDING y SNOOZED siguen abiertas; DONE ya se hizo. */
export function estaAbierta(t: Task): boolean {
  return t.status !== "DONE";
}

/**
 * Una tarea abierta cuya hora ya pasó. SNOOZED cuenta igual que PENDING: una
 * pospuesta a una fecha que ya llegó está tan vencida como una pendiente.
 */
export function estaVencida(t: Task, ahora: Date): boolean {
  return estaAbierta(t) && new Date(t.due_at).getTime() <= ahora.getTime();
}

/**
 * Abiertas por `due_at` (la más próxima, o la más vencida, primero) y hechas
 * aparte, la más reciente primero. El API no dice cuándo se marcó una DONE,
 * así que también van por `due_at`.
 */
export function separarTareas(tareas: Task[]): { abiertas: Task[]; hechas: Task[] } {
  const porVencimiento = (a: Task, b: Task) =>
    new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
  return {
    abiertas: tareas.filter(estaAbierta).sort(porVencimiento),
    hechas: tareas.filter(t => !estaAbierta(t)).sort((a, b) => porVencimiento(b, a)),
  };
}

/** Fecha y hora tal como las piden `<input type="date">` y `<input type="time">`. */
export type FechaHoraLocal = { fecha: string; hora: string };

/** Un instante UTC en hora de Bogotá, para llenar los campos del formulario. */
export function aBogota(instante: Date): FechaHoraLocal {
  return {
    fecha: formatInTimeZone(instante, TZ, "yyyy-MM-dd"),
    hora: formatInTimeZone(instante, TZ, "HH:mm"),
  };
}

/**
 * Lo que escribió el agente (hora de Bogotá) a ISO UTC, que es lo que espera
 * `due_at`. `null` si falta algo o no es una fecha válida.
 */
export function aUtc({ fecha, hora }: FechaHoraLocal): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora)) return null;
  const instante = fromZonedTime(`${fecha}T${hora}:00`, TZ);
  return Number.isNaN(instante.getTime()) ? null : instante.toISOString();
}

/** El atajo: la misma hora de ahora, `dias` días después, al minuto. */
export function atajo(ahora: Date, dias: number): FechaHoraLocal {
  return aBogota(addDays(ahora, dias));
}

/** Opciones fijas de "Posponer" (tarea 2.20); "Elegir fecha" va aparte. */
export const POSPONER: readonly Atajo[] = [
  { etiqueta: "1 día", dias: 1 },
  { etiqueta: "3 días", dias: 3 },
];

/**
 * El nuevo `due_at` de "Posponer N días". Se cuenta desde AHORA, no desde el
 * `due_at` viejo: quien pospone una tarea vencida hace una semana "1 día"
 * quiere que se la recuerden mañana, y sumarle un día a la fecha vieja la
 * dejaría todavía vencida. Al minuto, igual que el formulario.
 */
export function posponerDesdeAhora(ahora: Date, dias: number): string {
  return aUtc(atajo(ahora, dias))!;
}
