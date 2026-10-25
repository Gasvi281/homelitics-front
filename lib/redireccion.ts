/**
 * A dónde se puede mandar al agente después de entrar (HU-23, AC2).
 *
 * Sin `server-only` a propósito: lo usan el middleware y la Server Action de
 * login. No depende de nada.
 */

export const RUTA_TABLERO = "/tablero";

// Tab, salto de línea y demás: el navegador los borra de una URL, así que
// "/\t/otro.sitio" termina siendo "//otro.sitio".
function tieneControl(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

/**
 * Devuelve `siguiente` solo si es una ruta de esta misma app: empieza con "/"
 * y no con "//" ni "/\" (los dos se leen como otro host). Cualquier otra cosa
 * manda al tablero. Evita redirecciones abiertas a sitios externos.
 */
export function rutaSegura(siguiente: string | null): string {
  if (!siguiente || !siguiente.startsWith("/")) return RUTA_TABLERO;
  if (siguiente.startsWith("//") || siguiente.startsWith("/\\")) return RUTA_TABLERO;
  if (tieneControl(siguiente)) return RUTA_TABLERO;
  // Último cinturón: resuelta contra un origen cualquiera, no puede cambiarlo.
  try {
    const base = "http://homelitics.invalid";
    if (new URL(siguiente, base).origin !== base) return RUTA_TABLERO;
  } catch {
    return RUTA_TABLERO;
  }
  return siguiente;
}
