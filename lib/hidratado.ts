"use client";

import { useSyncExternalStore } from "react";

const sinSuscripcion = () => () => {};

/**
 * false en el servidor y durante la hidratación, true desde ahí. Con
 * useSyncExternalStore y no con un useEffect: en una navegación del lado del
 * cliente (sin hidratación) ya es true en el primer render.
 *
 * Para lo que depende del caché del navegador y no estaba en el HTML del
 * servidor: el "Actualizando…" del tablero, el aviso de riesgo del header.
 */
export function useHidratado() {
  return useSyncExternalStore(sinSuscripcion, () => true, () => false);
}
