/**
 * Cliente HTTP del API de Homelitics, mitad SERVIDOR: Server Components,
 * route handlers y demás código que corre en Node. Pega al API directo y
 * agrega la credencial de lib/session.ts.
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

export { HomeliticsError } from "./errores";
export type { ErrorKind } from "./errores";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}. Ver CLAUDE.md.`);
  return v;
}

const pedir = crearPedir({
  usarMocks: process.env.USE_MOCKS === "true",
  urlPara: (path) => `${requireEnv("HOMELITICS_API_URL")}${path}`,
  credenciales: async () => {
    const { getAuthHeader } = await import("./session");
    return getAuthHeader();
  },
});

export const api = crearApi(pedir);
