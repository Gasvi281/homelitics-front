/**
 * Cliente HTTP del API de Homelitics, mitad NAVEGADOR: la usan los Client
 * Components ("use client") como components/GrillaHorarios.tsx.
 *
 * Pega siempre a un proxy (`/api/homelitics/*` con `api`, `/api/publico/*`
 * con `apiPublico`), que agrega la credencial del lado del servidor — este archivo no sabe nada de lib/session.ts ni falta
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

const usarMocks = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

const transporte = crearPedir({
  usarMocks,
  urlPara: (path) => `/api/homelitics${path}`,
  credenciales: async () => ({}),
});

/** Por el proxy del agente: la credencial es la cookie de su sesión. */
export const api = crearApi(transporte);

const transportePublico = crearPedir({
  usarMocks,
  urlPara: (path) => `/api/publico${path}`,
  credenciales: async () => ({}),
});

/**
 * Por el proxy público, con la cuenta de servicio y lista blanca de
 * endpoints. Solo para las pantallas de (cliente). Ver PLAN.md, fase 6.
 */
export const apiPublico = crearApi(transportePublico);
