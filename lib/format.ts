import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { es } from "date-fns/locale";

/**
 * El API manda horas en UTC y precios como string. Todo lo que se muestre
 * pasa por aquí; nunca uses toLocaleString() suelto.
 */

export const TZ = "America/Bogota";

/** "650137717.29" -> "$650.137.717" */
export function formatPrecio(monto: string): string {
  const n = Number(monto);
  if (!Number.isFinite(n)) return "Precio no disponible";
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", maximumFractionDigits: 0,
  }).format(n);
}

/** "2026-09-17T15:30:00Z" -> "10:30" en hora de Bogotá */
export function horaLocal(iso: string): string {
  return formatInTimeZone(iso, TZ, "HH:mm");
}

/** "2026-09-17T15:30:00Z" -> "jueves 17 de septiembre, 10:30" */
export function fechaHoraLarga(iso: string): string {
  return formatInTimeZone(iso, TZ, "EEEE d 'de' MMMM, HH:mm", { locale: es });
}

/** Clave de día en Bogotá, para agrupar la grilla. "2026-09-17" */
export function diaLocal(iso: string): string {
  return formatInTimeZone(iso, TZ, "yyyy-MM-dd");
}

/** "2026-09-17T15:30:00Z" -> "jue 17", en hora de Bogotá. Cabecera de columna de la grilla. */
export function etiquetaDia(iso: string): string {
  return formatInTimeZone(iso, TZ, "EEE d", { locale: es });
}

/**
 * Agrupa los slots por día de Bogotá conservando el orden.
 * Devuelve [{ dia: "2026-09-17", etiqueta: "jue 17", slots: [iso, ...] }]
 */
export function agruparSlotsPorDia(slots: string[]) {
  const mapa = new Map<string, string[]>();
  for (const s of slots) {
    const d = diaLocal(s);
    (mapa.get(d) ?? mapa.set(d, []).get(d)!).push(s);
  }
  return [...mapa.entries()].map(([dia, lista]) => ({
    dia,
    etiqueta: etiquetaDia(lista[0]),
    slots: lista,
  }));
}

export interface SemanaHabil {
  /** ISO UTC, lunes 00:00 hora de Bogotá. Para pedir /agents/{id}/slots. */
  desde: string;
  /** ISO UTC, sábado 00:00 hora de Bogotá (exclusivo): cubre lunes a viernes. */
  hasta: string;
  /** ISO UTC de las medianoches de lunes a viernes, una por columna de la grilla. */
  dias: string[];
}

/**
 * Semana laboral (lunes a viernes) en hora de Bogotá, desplazada
 * `offsetSemanas` semanas desde la que contiene `ahora`. La usa la grilla de
 * horarios (tarea 2.1) para pedir el rango y para dibujar las cinco columnas
 * aunque un día no tenga ningún horario libre.
 */
export function semanaHabil(ahora: string, offsetSemanas: number): SemanaHabil {
  const diaAhora = formatInTimeZone(ahora, TZ, "yyyy-MM-dd");
  const medianocheAhora = fromZonedTime(`${diaAhora}T00:00:00`, TZ);
  const diaIsoSemana = Number(formatInTimeZone(ahora, TZ, "i")); // 1 lunes .. 7 domingo
  const lunesEstaSemana = addDays(medianocheAhora, -(diaIsoSemana - 1));
  const lunes = addDays(lunesEstaSemana, offsetSemanas * 7);

  return {
    desde: lunes.toISOString(),
    hasta: addDays(lunes, 5).toISOString(),
    dias: [0, 1, 2, 3, 4].map((n) => addDays(lunes, n).toISOString()),
  };
}
