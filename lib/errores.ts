/**
 * `HomeliticsError` y su `kind`, sin ninguna dependencia de lib/session.ts.
 *
 * Vive aparte de lib/homelitics.ts a propósito: lib/mock/index.ts la usa, y
 * lib/mock también lo importa lib/homelitics-navegador.ts (la mitad de
 * cliente del API, usada desde componentes "use client" como
 * GrillaHorarios). Si `HomeliticsError` siguiera definida en
 * lib/homelitics.ts, cualquier Client Component que la necesitara arrastraría
 * también el import dinámico de lib/session.ts de ese archivo — y Next
 * niega el build en cuanto un módulo marcado "server-only" es alcanzable
 * desde un Client Component, así la rama nunca se ejecute en el navegador.
 */

export type ErrorKind =
  | "conflicto" // 409, el caso más importante de este API
  | "no_encontrado" // 404, incluye "es de otra agencia"
  | "no_autenticado" // 401
  | "sin_permiso" // 403
  | "invalido" // 422
  | "servidor" // 5xx
  | "red"; // el API está dormido, timeout, sin conexión

export class HomeliticsError extends Error {
  constructor(
    readonly kind: ErrorKind,
    readonly detail: string,
    readonly status?: number,
  ) {
    super(detail);
    this.name = "HomeliticsError";
  }
}
