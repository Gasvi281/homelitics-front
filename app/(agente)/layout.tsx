import type { ReactNode } from "react";
import { AgenteActualProvider } from "@/features/agentes/AgenteActual";
import { NavAgente } from "@/features/agentes/components/NavAgente";
import { obtenerAgenteActual } from "@/lib/agente-actual";
import type { Agent } from "@/lib/schemas";

/**
 * Layout del grupo (agente): pantallas que requieren identidad de agente, a
 * diferencia de (cliente).
 *
 * TODO(login del agente — etapa 2 de lib/session.ts, docs/SPRINT_LINEA2.md
 * pendiente 2.4): hoy este layout no exige sesión real. `lib/session.ts`
 * sigue en la etapa 1 (token de un agente demo, cacheado en el servidor) y el
 * API resuelve la agencia a partir de ESE token, así que cualquiera que entre
 * a una URL de (agente) ve los datos del agente demo. Cuando exista `/entrar`
 * con `@supabase/ssr`, este es el punto para verificar que hay una sesión de
 * Supabase y redirigir a `/entrar` si no la hay — sin tocar las pantallas de
 * adentro, que ya reciben la credencial a través de `lib/homelitics.ts`.
 *
 * Resuelve el agente actual (GET /me) y lo reparte con `AgenteActualProvider`
 * para que los Client Components sepan su rol (`useEsAdmin()`); con el mismo
 * dato `NavAgente` pinta la barra lateral y decide si muestra el embudo,
 * que es solo para admin (el API responde 403 igual). Si /me falla,
 * las pantallas siguen funcionando: solo se esconde lo que es de admin, y
 * cada pantalla muestra su propio error si el API de verdad no responde.
 */
export default async function AgenteLayout({ children }: { children: ReactNode }) {
  let agente: Agent | null = null;
  try {
    agente = await obtenerAgenteActual();
  } catch {
    agente = null;
  }
  return (
    <AgenteActualProvider agente={agente}>
      <div className="flex min-h-screen flex-col lg:flex-row">
        <NavAgente agente={agente} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </AgenteActualProvider>
  );
}
