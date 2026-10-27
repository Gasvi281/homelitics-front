/**
 * `mutationKey` del asistente de insights. Aparte y sin dependencias, como
 * features/avisos/claves.ts: lo importa app/providers.tsx para que preguntarle
 * algo al asistente no relea los avisos.
 */
export const CLAVE_INSIGHTS = ["insights"] as const;
