import type { ReactNode } from "react";

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
 */
export default function AgenteLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-white">{children}</div>;
}
