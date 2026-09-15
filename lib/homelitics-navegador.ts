/**
 * Cliente HTTP del API de Homelitics, mitad NAVEGADOR: la usan los Client
 * Components ("use client") como components/GrillaHorarios.tsx.
 *
 * Pega siempre al proxy `/api/homelitics/*`, que agrega la credencial del
 * lado del servidor — este archivo no sabe nada de lib/session.ts ni falta
 * que le haga. Es justo lo que lo hace seguro de importar desde el
 * navegador: ver lib/errores.ts y lib/homelitics.ts (la mitad servidor) para
 * el detalle de por qué están separados en vez de un solo archivo con un
 * `if`.
 *
 * Misma superficie que lib/homelitics.ts (comparten lib/homelitics-nucleo.ts,
 * función `crearApi`): un componente no necesita saber cuál de las dos
 * mitades le tocó, solo si es Server o Client Component.
 *
 * `USE_MOCKS` no llega hasta acá (Next solo expone al navegador las
 * variables `NEXT_PUBLIC_*`), así que esta mitad lee su propio espejo
 * público. Ver NEXT_PUBLIC_USE_MOCKS en .env.example.
 */
import { crearApi, crearPedir } from "./homelitics-nucleo";

export { HomeliticsError } from "./errores";
export type { ErrorKind } from "./errores";

const pedir = crearPedir({
  usarMocks: process.env.NEXT_PUBLIC_USE_MOCKS === "true",
  urlPara: (path) => `/api/homelitics${path}`,
  credenciales: async () => ({}),
});

export const api = crearApi(pedir);
