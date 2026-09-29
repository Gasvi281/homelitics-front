"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Agent } from "@/lib/schemas";

/**
 * `undefined`: se usó fuera del provider (error de programación).
 * `null`: el provider no pudo leer GET /me (API dormido, token inválido).
 */
const Contexto = createContext<Agent | null | undefined>(undefined);

/**
 * Lleva a los Client Components el agente que resolvió el layout de
 * (agente) con `obtenerAgenteActual()` (lib/agente-actual.ts). Solo datos de
 * `AgentOut`; la credencial nunca pasa por aquí.
 */
export function AgenteActualProvider({ agente, children }: { agente: Agent | null; children: ReactNode }) {
  return <Contexto.Provider value={agente}>{children}</Contexto.Provider>;
}

/** El agente de la sesión, o `null` si no se pudo saber quién es. */
export function useAgenteActual(): Agent | null {
  const agente = useContext(Contexto);
  if (agente === undefined) {
    throw new Error("useAgenteActual() necesita estar dentro de <AgenteActualProvider>.");
  }
  return agente;
}

/**
 * Si el agente es `TEAM_ADMIN`. Para esconder acciones que el API negaría
 * (reasignar, embudo); el API vuelve a verificar con 403. Si no se sabe
 * quién es, `false`: mejor esconder un botón que mostrar uno que falla.
 */
export function useEsAdmin(): boolean {
  return useAgenteActual()?.role === "TEAM_ADMIN";
}
