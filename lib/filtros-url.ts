/**
 * Leer filtros de la URL, compartido por el tablero (HU-06) y el embudo
 * (HU-17). Sin dependencias: lo usan las páginas (Server Components, con el
 * objeto `searchParams`) y los formularios del navegador (`URLSearchParams`).
 */

export type ParamsUrl = Record<string, string | string[] | undefined> | URLSearchParams;

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** El valor de `clave`, recortado; vacío o ausente → `undefined`. */
export function leerParam(sp: ParamsUrl, clave: string): string | undefined {
  const v = sp instanceof URLSearchParams ? sp.get(clave) : sp[clave];
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || undefined;
}

/** Un día `YYYY-MM-DD`; cualquier otra cosa se descarta en vez de mandarse al API. */
export function leerDia(sp: ParamsUrl, clave: string): string | undefined {
  const d = leerParam(sp, clave);
  return d && DIA.test(d) ? d : undefined;
}

/** Las fechas `YYYY-MM-DD` se comparan bien como texto. */
export function rangoAlReves(f: { desde?: string; hasta?: string }): boolean {
  return Boolean(f.desde && f.hasta && f.desde > f.hasta);
}
