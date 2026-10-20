import "server-only";

/**
 * Interruptores por endpoint (tarea 2.25): los endpoints PROPUESTOS de
 * docs/API_CONTRACT.md §8 no existen todavía, así que con `USE_MOCKS=false`
 * siguen respondiendo desde lib/mock/ mientras su variable no diga `false`.
 * Cuando L1 publique uno, se verifica contra /openapi.json, se pone su
 * variable en `false` y se prueba en vivo; después se borra de aquí, como
 * se hizo con GET /agents (bloqueo 7).
 *
 * Sin la variable cuenta como `true`: el endpoint no existe, y pegarle al
 * API real solo daría 404.
 *
 * Solo servidor. Lo consultan las dos puertas al API: lib/homelitics.ts
 * (Server Components) y el proxy (lo que piden los Client Components con
 * `NEXT_PUBLIC_USE_MOCKS=false`). Por eso basta una variable por endpoint,
 * sin espejo `NEXT_PUBLIC_`.
 */
const INTERRUPTORES: { variable: string; coincide: (pathname: string) => boolean }[] = [
  { variable: "USE_MOCK_TAREAS_AGENCIA", coincide: p => p === "/tasks" },
  { variable: "USE_MOCK_RIESGO_POR_AGENTE", coincide: p => p === "/analytics/at-risk-by-agent" },
];

/** Si este path (con o sin query) tiene que salir del mock aunque `USE_MOCKS` sea `false`. */
export function mockForzado(path: string): boolean {
  const { pathname } = new URL(path, "http://interruptor");
  return INTERRUPTORES.some(i => i.coincide(pathname) && process.env[i.variable] !== "false");
}
