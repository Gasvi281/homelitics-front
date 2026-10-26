"use client";

/**
 * Mitad NAVEGADOR de lib/umbral.ts: `useUmbral()` para Client Components.
 * Ver allí por qué es provisional (bloqueo 8, migración 012) y por qué son
 * dos archivos.
 */
import { useRouter } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";
import { COOKIE_UMBRAL, MAX_AGE_UMBRAL, UMBRAL_POR_DEFECTO, esUmbralValido, normalizarUmbral } from "./umbral";

/** Avisa a cada `useUmbral()` montado cuando el setter cambia la cookie. */
const oyentes = new Set<() => void>();

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

function leerCookie(): number {
  const par = document.cookie
    .split("; ")
    .find(c => c.startsWith(`${COOKIE_UMBRAL}=`));
  return normalizarUmbral(par ? decodeURIComponent(par.slice(COOKIE_UMBRAL.length + 1)) : undefined);
}

/**
 * El umbral para un Client Component y su setter. El setter valida, escribe
 * la cookie y hace `router.refresh()` para que los Server Components (el
 * layout, la página) vuelvan a leerla con `leerUmbral()`.
 *
 * En el render del servidor no hay `document.cookie`: se usa `inicial` y, si
 * no llega, 24. Para que no parpadee al hidratar, la página lee el valor con
 * `leerUmbral()` y lo pasa como `inicial`.
 *
 * El setter devuelve `false` y no escribe nada si el valor no es un entero
 * entre 1 y 8760; quien lo llame muestra el error.
 */
export function useUmbral(inicial: number = UMBRAL_POR_DEFECTO): [number, (horas: number) => boolean] {
  const router = useRouter();
  const umbral = useSyncExternalStore(suscribir, leerCookie, () => normalizarUmbral(inicial));

  const cambiar = useCallback(
    (horas: number) => {
      if (!esUmbralValido(horas)) return false;
      document.cookie = `${COOKIE_UMBRAL}=${horas}; Path=/; Max-Age=${MAX_AGE_UMBRAL}; SameSite=Lax`;
      for (const o of oyentes) o();
      router.refresh();
      return true;
    },
    [router],
  );

  return [umbral, cambiar];
}
