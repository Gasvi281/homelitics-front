/**
 * Cliente HTTP del API de Homelitics, mitad SERVIDOR: Server Components,
 * route handlers y demás código que corre en Node. Pega al API directo y
 * agrega la credencial: `api` la de lib/session.ts (el agente con sesión),
 * `apiPublico` la de lib/credencial-servicio.ts (las pantallas de cliente).
 *
 * Para Client Components ("use client") usa lib/homelitics-navegador.ts en
 * su lugar, NUNCA este archivo: importa lib/session.ts (marcado
 * "server-only") aunque sea detrás de un `if`, y Next niega el build en
 * cuanto un Client Component lo alcanza, así la rama nunca se ejecute en el
 * navegador. La lista de operaciones es una sola igual (lib/homelitics-nucleo.ts,
 * función `crearApi`): las dos mitades solo difieren en la URL y en de dónde
 * sale la credencial.
 *
 * Las pantallas NUNCA ven un código HTTP: reciben datos ya validados con zod,
 * o un HomeliticsError con un `kind` legible.
 */
import { crearApi, crearPedir } from "./homelitics-nucleo";
import { mockForzado } from "./interruptores";

export { HomeliticsError } from "./errores";
export type { ErrorKind } from "./errores";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}. Ver CLAUDE.md.`);
  return v;
}

const usarMocks = process.env.USE_MOCKS === "true";
const urlPara = (path: string) => `${requireEnv("HOMELITICS_API_URL")}${path}`;

const transporte = crearPedir({
  usarMocks,
  // Los endpoints propuestos que aún no existen (USE_MOCK_TAREAS_AGENCIA, …).
  mockPara: mockForzado,
  urlPara,
  credenciales: async () => {
    const { getAuthHeader } = await import("./session");
    return getAuthHeader();
  },
});

/** Con la sesión del agente que hace la petición (cookie). Pantallas de (agente). */
export const api = crearApi(transporte);

const transportePublico = crearPedir({
  usarMocks,
  mockPara: mockForzado,
  urlPara,
  credenciales: async () => {
    const { getServiceAuthHeader } = await import("./credencial-servicio");
    return getServiceAuthHeader();
  },
});

/**
 * Con la cuenta de servicio (lib/credencial-servicio.ts). Solo para las
 * pantallas de (cliente), que no tienen sesión. Ver PLAN.md, fase 6.
 */
export const apiPublico = crearApi(transportePublico);
